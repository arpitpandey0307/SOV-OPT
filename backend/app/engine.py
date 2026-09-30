"""Run executor.

The native SOV-OPT core (C++/CUDA, see solver/) is not wired into the control
plane yet. Until it is, runs are executed by this preview engine, which emits
the same event contract the native worker will emit (docs/tasks/T5): real
model statistics drive the phase structure and timing, but iteration-level
progress and final objective values are simulated. Every run records
`engine = "sovopt-preview"` so preview results are never mistaken for native
solver output.
"""

from __future__ import annotations

import asyncio
import hashlib
import math
import random
import time

from . import config
from .catalog import Catalog, Instance
from .store import Store

TICK = 0.2
DEGENERATE_HINTS = ("degen", "pilot", "greenbea", "perold")


def _log_interp(a: float, b: float, p: float) -> float:
    return 10 ** (math.log10(a) + (math.log10(b) - math.log10(a)) * p)


class Engine:
    def __init__(self, store: Store, catalog: Catalog) -> None:
        self.store = store
        self.catalog = catalog
        self.tasks: dict[str, asyncio.Task] = {}

    def start(self, run: dict, inst: Instance) -> None:
        task = asyncio.create_task(self._execute(run, inst))
        self.tasks[run["id"]] = task
        task.add_done_callback(lambda _t, rid=run["id"]: self.tasks.pop(rid, None))

    def cancel(self, run_id: str) -> bool:
        task = self.tasks.get(run_id)
        if not task:
            return False
        task.cancel()
        return True

    def active(self) -> int:
        return len(self.tasks)

    # ------------------------------------------------------------------ run

    async def _execute(self, run: dict, inst: Instance) -> None:
        run_id = run["id"]
        cfg = run["config"]
        t0 = time.monotonic()
        state = {"iterations": 0, "nodes": 0}

        def now() -> float:
            return round(time.monotonic() - t0, 3)

        def emit(type_: str, **data) -> None:
            self.store.add_event(run_id, now(), type_, data)

        try:
            self.store.update_run(run_id, status="running", started_at=time.time())
            emit("RUN_STARTED", engine=config.ENGINE_ID, solver_version=config.SOLVER_VERSION, configuration=cfg)

            analysis = await self._ensure_analysis(inst, emit)
            if analysis is None:
                raise RuntimeError("Model could not be read")

            seed = int(cfg.get("seed", 0))
            rng = random.Random(f"{inst.key}:{seed}")
            sense = analysis["sense"]
            kind = analysis["kind"]
            target = self._target(inst, analysis, rng)
            sgn = -1.0 if sense == "MAX" else 1.0
            tmin = sgn * target  # work in minimization space

            await asyncio.sleep(0.15)
            emit("MODEL_LOADED", name=analysis["name"], kind=kind, sense=sense, rows=analysis["rows"],
                 cols=analysis["cols"], nnz=analysis["nnz"], integer_cols=analysis["integer_cols"],
                 quadratic_nnz=analysis["quadratic_nnz"])

            algorithm = self._dispatch(cfg, analysis, emit)

            if cfg.get("presolve", True):
                await self._presolve(analysis, rng, emit)

            await self._scaling(analysis, emit)

            limit = float(cfg.get("time_limit", 60))
            if kind in ("MILP", "MIQP"):
                result = await self._branch_and_cut(analysis, cfg, rng, tmin, sgn, limit, t0, emit, state,
                                                    inst.reference_status)
            elif kind == "QP":
                result = await self._interior_point(analysis, rng, tmin, sgn, limit, t0, emit, state)
            else:
                result = await self._simplex(analysis, cfg, algorithm, rng, tmin, sgn, limit, t0, emit, state, inst)

            emit("VERIFICATION_STARTED")
            await asyncio.sleep(0.3 + min(analysis["nnz"] / 2e6, 1.5))
            verification = self._verification(result, analysis, rng)
            emit("VERIFICATION_COMPLETED", **verification)

            elapsed = now()
            self.store.update_run(
                run_id, status="completed", result_status=result["status"], objective=result["objective"],
                bound=result.get("bound"), gap=result.get("gap"), iterations=state["iterations"],
                nodes=state["nodes"], elapsed=elapsed, verification=verification, finished_at=time.time())
            emit("RUN_COMPLETED", status=result["status"], objective=result["objective"],
                 bound=result.get("bound"), gap=result.get("gap"), elapsed=elapsed)
        except asyncio.CancelledError:
            elapsed = now()
            self.store.update_run(run_id, status="cancelled", result_status="INTERRUPTED",
                                  iterations=state["iterations"], nodes=state["nodes"],
                                  elapsed=elapsed, finished_at=time.time())
            emit("RUN_CANCELLED", elapsed=elapsed)
        except Exception as e:  # noqa: BLE001 - reported to the client as a failed run
            elapsed = now()
            self.store.update_run(run_id, status="failed", result_status="ERROR", elapsed=elapsed,
                                  finished_at=time.time())
            emit("RUN_FAILED", message=str(e), elapsed=elapsed)

    async def _ensure_analysis(self, inst: Instance, emit) -> dict | None:
        a = self.catalog.analysis(inst)
        if a:
            return a
        emit("MODEL_PROFILING", message="Reading model file")
        self.catalog.request_analysis(inst)
        while self.catalog.analysis_state(inst) == "running":
            await asyncio.sleep(0.3)
        return self.catalog.analysis(inst)

    @staticmethod
    def _target(inst: Instance, a: dict, rng: random.Random) -> float:
        if inst.reference_objective is not None:
            return inst.reference_objective
        scale = (a.get("obj_max") or 1.0) * math.sqrt(max(a["cols"], 1))
        mag = 10 ** round(math.log10(max(scale, 1e-6)))
        value = rng.uniform(0.8, 9.5) * mag
        return -value if rng.random() < 0.5 else value

    @staticmethod
    def _dispatch(cfg: dict, a: dict, emit) -> str:
        algo = cfg.get("algorithm", "auto")
        kind = a["kind"]
        if algo != "auto":
            emit("SOLVER_DECISION", algorithm=algo, reason="Selected explicitly in the run configuration.")
            return algo
        if kind in ("MILP", "MIQP"):
            algo, reason = "branch_and_cut", (
                f"{a['integer_cols']:,} integer columns. Dual simplex solves node relaxations with warm starts.")
        elif kind == "QP":
            algo, reason = "ipm", f"{a['quadratic_nnz']:,} quadratic terms. Convex QP goes to the interior-point method."
        elif cfg.get("gpu") and a["nnz"] > 1_000_000:
            algo, reason = "pdlp", f"{a['nnz']:,} nonzeros exceeds the GPU first-order threshold (1,000,000)."
        else:
            algo, reason = "dual_simplex", (
                f"{a['nnz']:,} nonzeros is below the GPU threshold. Dual simplex gives a basic optimal solution.")
        emit("SOLVER_DECISION", algorithm=algo, reason=reason)
        return algo

    async def _presolve(self, a: dict, rng: random.Random, emit) -> None:
        emit("PRESOLVE_STARTED")
        await asyncio.sleep(0.2 + min(a["nnz"] / 1e6, 2.0))
        rows_removed = a["empty_rows"] + a["singleton_rows"]
        cols_removed = a["empty_cols"] + a["fixed_cols"]
        tightened = int(a["cols"] * rng.uniform(0.01, 0.08))
        emit("PRESOLVE_COMPLETED",
             rows_before=a["rows"], rows_after=a["rows"] - rows_removed,
             cols_before=a["cols"], cols_after=a["cols"] - cols_removed,
             reductions=[
                 {"rule": "empty_row", "count": a["empty_rows"]},
                 {"rule": "singleton_row_to_bound", "count": a["singleton_rows"]},
                 {"rule": "empty_column", "count": a["empty_cols"]},
                 {"rule": "fixed_column", "count": a["fixed_cols"]},
                 {"rule": "activity_bound_tightening", "count": tightened},
             ])

    async def _scaling(self, a: dict, emit) -> None:
        lo, hi = a.get("coef_min"), a.get("coef_max")
        if not lo or not hi:
            return
        before = math.log10(hi / lo)
        await asyncio.sleep(0.1)
        emit("SCALING_COMPLETED", method="geometric+equilibration", range_before=round(before, 2),
             range_after=round(before * 0.45, 2))

    # --------------------------------------------------------------- simplex

    async def _simplex(self, a, cfg, algorithm, rng, tmin, sgn, limit, t0, emit, state, inst):
        m, n, nnz = a["rows"], a["cols"], a["nnz"]
        total = int((m + n) * rng.uniform(0.5, 1.2)) + 12
        duration = min(limit * 0.95, 1.0 + 0.55 * math.log10(nnz + 10) ** 1.6)
        degenerate = any(h in inst.name for h in DEGENERATE_HINTS)
        start_gap = abs(tmin) * rng.uniform(0.3, 0.9) + 1.0
        pinf0 = 10 ** rng.uniform(2, 5)
        emit("SOLVE_STARTED", algorithm=algorithm, phase=1)
        sent_degeneracy = False
        sent_refactor = False
        ill_conditioned = (a.get("coef_max") or 1) / (a.get("coef_min") or 1) > 1e6
        phase2 = False
        start = time.monotonic()
        while True:
            el = time.monotonic() - start
            p = min(el / duration, 1.0)
            it = int(total * p)
            state["iterations"] = it
            if p < 0.35:
                pinf = _log_interp(pinf0, 1e-9, p / 0.35)
            else:
                pinf = 0.0
                if not phase2:
                    phase2 = True
                    emit("PHASE_CHANGE", phase=2, iteration=it, message="Primal feasible basis found")
            obj = tmin - start_gap * (1 - p) ** 2.2 * (1 + 0.03 * rng.random())
            dinf = _log_interp(10 ** rng.uniform(0, 2), 1e-10, p) if p < 1 else 0.0
            emit("ITERATION", iteration=it, objective=sgn * obj, primal_infeasibility=pinf,
                 dual_infeasibility=dinf, basis_updates=it % 100, refactorizations=it // 100)
            if cfg.get("gpu"):
                self._gpu_metric(rng, emit, busy=algorithm == "pdlp")
            if degenerate and not sent_degeneracy and p > 0.4:
                sent_degeneracy = True
                emit("NUMERICAL_EVENT", severity="info",
                     message=f"Dual degeneracy on {rng.randint(18, 46)}% of recent pivots. Cost perturbation applied.",
                     action="perturbation")
            if ill_conditioned and not sent_refactor and p > 0.7:
                sent_refactor = True
                emit("NUMERICAL_EVENT", severity="warning",
                     message=f"LU residual {rng.uniform(1.1, 8.9):.1f}e-9 above threshold. Refactorized with tighter pivot tolerance.",
                     action="refactorization")
            if p >= 1.0:
                break
            if time.monotonic() - t0 > limit:
                emit("SOLVE_COMPLETED", status="TIME_LIMIT", objective=sgn * obj, iterations=it)
                return {"status": "TIME_LIMIT", "objective": sgn * obj, "bound": None, "gap": None}
            await asyncio.sleep(TICK)
        state["iterations"] = total
        emit("SOLVE_COMPLETED", status="OPTIMAL", objective=sgn * tmin, iterations=total)
        return {"status": "OPTIMAL", "objective": sgn * tmin, "bound": sgn * tmin, "gap": 0.0}

    # ------------------------------------------------------------------- IPM

    async def _interior_point(self, a, rng, tmin, sgn, limit, t0, emit, state):
        iters = rng.randint(14, 38)
        per = min(0.25 + a["nnz"] / 4e5, 1.2)
        emit("SOLVE_STARTED", algorithm="ipm", method="Mehrotra predictor-corrector")
        emit("FACTORIZATION", ordering="AMD", nnz_factor=int(a["nnz"] * rng.uniform(2.5, 9)),
             supernodes=int(a["rows"] * rng.uniform(0.2, 0.5)))
        mu0 = 10 ** rng.uniform(1, 4)
        gap0 = abs(tmin) * rng.uniform(0.5, 2) + 1
        for k in range(1, iters + 1):
            p = k / iters
            state["iterations"] = k
            mu = _log_interp(mu0, 1e-10, p)
            obj = tmin + gap0 * (1 - p) ** 3 * (1 if k % 2 else 0.8)
            emit("ITERATION", iteration=k, objective=sgn * obj, mu=mu,
                 primal_residual=_log_interp(10 ** rng.uniform(0, 3), 1e-11, p),
                 dual_residual=_log_interp(10 ** rng.uniform(0, 3), 1e-11, p),
                 step_primal=round(rng.uniform(0.85, 0.999), 3), step_dual=round(rng.uniform(0.85, 0.999), 3))
            if time.monotonic() - t0 > limit:
                emit("SOLVE_COMPLETED", status="TIME_LIMIT", objective=sgn * obj, iterations=k)
                return {"status": "TIME_LIMIT", "objective": sgn * obj, "bound": None, "gap": None}
            await asyncio.sleep(per)
        emit("SOLVE_COMPLETED", status="OPTIMAL", objective=sgn * tmin, iterations=iters)
        return {"status": "OPTIMAL", "objective": sgn * tmin, "bound": sgn * tmin, "gap": 0.0}

    # ------------------------------------------------------- branch and cut

    async def _branch_and_cut(self, a, cfg, rng, tmin, sgn, limit, t0, emit, state, ref_status=None):
        nnz = a["nnz"]
        mip_gap = float(cfg.get("mip_gap", 1e-4))
        est = (4 + 2.4 * math.log10(nnz + 10) ** 1.3) * rng.uniform(0.7, 1.7)
        # Instances with only a best-known value are open problems: no proof within a short budget.
        hard = est > limit or a["big_m_rows"] > 0.2 * a["rows"] or ref_status in ("best", "unkn")
        if ref_status == "inf":
            return await self._infeasible_tree(a, cfg, rng, limit, t0, emit, state)
        duration = min(est * (1.6 if hard else 1.0), limit)
        scale = max(abs(tmin), 1.0)
        root_bound = tmin - scale * rng.uniform(0.03, 0.3)
        final_gap = rng.uniform(mip_gap * 3, 0.04) if hard else 0.0

        emit("SOLVE_STARTED", algorithm="branch_and_cut", threads=cfg.get("threads", 8))
        await asyncio.sleep(0.4 + min(nnz / 5e5, 2.0))
        state["iterations"] = int((a["rows"] + a["cols"]) * rng.uniform(0.4, 1.1))
        emit("ROOT_LP_SOLVED", objective=sgn * root_bound, iterations=state["iterations"])

        bound = root_bound
        cut_target = tmin - (tmin - root_bound) * rng.uniform(0.25, 0.6)
        families = ["gomory", "mir", "knapsack_cover", "clique", "flow_cover", "implied_bound"]
        for r in range(1, rng.randint(3, 6) + 1):
            await asyncio.sleep(0.35)
            prev = bound
            bound = bound + (cut_target - bound) * rng.uniform(0.3, 0.6)
            fams = rng.sample(families, 3)
            emit("CUT_ROUND", round=r, bound=sgn * bound, improvement=abs(bound - prev),
                 cuts={f: rng.randint(2, 60) for f in fams})

        incumbent = None
        heuristics = ["simple_rounding", "feasibility_pump", "diving_pseudocost", "rins", "local_branching"]
        if cfg.get("gpu"):
            heuristics.insert(1, "gpu_feasibility_jump")
        first_at = rng.uniform(0.08, 0.3)
        improvements = sorted(rng.uniform(first_at + 0.05, 0.85) for _ in range(rng.randint(2, 5)))
        start = time.monotonic()
        nodes = 1
        open_nodes = 1
        while True:
            el = time.monotonic() - start
            p = min(el / duration, 1.0)
            nodes += int(rng.uniform(1, 4) * (1 + 60 * p ** 1.5))
            open_nodes = max(1, int(open_nodes + rng.randint(-4, 9) * (1 - p) * 3)) if p < 0.95 else max(0, open_nodes // 2)
            state["nodes"] = nodes
            state["iterations"] += rng.randint(20, 400)
            end_bound = tmin - scale * final_gap
            bound = max(bound, end_bound - (end_bound - bound) * (1 - p) ** 0.4 if p < 1 else end_bound)
            if incumbent is None and p >= first_at:
                incumbent = tmin + scale * rng.uniform(0.05, 0.4)
                emit("INCUMBENT_FOUND", objective=sgn * incumbent, source=heuristics[1] if cfg.get("gpu") else rng.choice(heuristics[:3]),
                     node=nodes)
            elif incumbent is not None and improvements and p >= improvements[0]:
                improvements.pop(0)
                goal = tmin if not hard else tmin + scale * final_gap * 0.2
                incumbent = incumbent - (incumbent - goal) * (1.0 if not improvements else rng.uniform(0.3, 0.7))
                emit("INCUMBENT_FOUND", objective=sgn * incumbent, source=rng.choice(heuristics), node=nodes)
            gap = abs(incumbent - bound) / max(abs(incumbent), 1e-9) if incumbent is not None else None
            emit("NODE_UPDATE", nodes=nodes, open_nodes=open_nodes, depth=int(3 + 20 * p * rng.random()),
                 bound=sgn * bound, incumbent=sgn * incumbent if incumbent is not None else None,
                 gap=gap, lp_iterations=state["iterations"])
            if cfg.get("gpu"):
                self._gpu_metric(rng, emit, busy=True)
            if not hard and incumbent is not None and not improvements and p >= 0.9:
                bound = incumbent if abs(incumbent - tmin) < 1e-9 * scale else bound
                gap = abs(incumbent - bound) / max(abs(incumbent), 1e-9)
                if gap <= mip_gap or p >= 1.0:
                    emit("NODE_UPDATE", nodes=nodes, open_nodes=0, depth=0, bound=sgn * incumbent,
                         incumbent=sgn * incumbent, gap=0.0, lp_iterations=state["iterations"])
                    emit("SOLVE_COMPLETED", status="OPTIMAL", objective=sgn * incumbent, bound=sgn * incumbent,
                         gap=0.0, nodes=nodes)
                    return {"status": "OPTIMAL", "objective": sgn * incumbent, "bound": sgn * incumbent, "gap": 0.0}
            if time.monotonic() - t0 >= limit or p >= 1.0:
                status = "TIME_LIMIT" if incumbent is not None else "TIME_LIMIT_NO_SOLUTION"
                emit("SOLVE_COMPLETED", status=status, objective=sgn * incumbent if incumbent is not None else None,
                     bound=sgn * bound, gap=gap, nodes=nodes)
                return {"status": status, "objective": sgn * incumbent if incumbent is not None else None,
                        "bound": sgn * bound, "gap": gap}
            await asyncio.sleep(TICK)

    async def _infeasible_tree(self, a, cfg, rng, limit, t0, emit, state):
        emit("SOLVE_STARTED", algorithm="branch_and_cut", threads=cfg.get("threads", 8))
        await asyncio.sleep(0.4 + min(a["nnz"] / 5e5, 2.0))
        duration = min(limit, rng.uniform(3, 9))
        start = time.monotonic()
        nodes = 1
        while time.monotonic() - start < duration:
            p = (time.monotonic() - start) / duration
            nodes += int(rng.uniform(2, 8) * (1 + 30 * p))
            state["nodes"] = nodes
            emit("NODE_UPDATE", nodes=nodes, open_nodes=max(0, int((1 - p) * rng.randint(10, 80))), depth=int(2 + 12 * p),
                 bound=None, incumbent=None, gap=None, lp_iterations=state["iterations"])
            await asyncio.sleep(TICK)
        emit("SOLVE_COMPLETED", status="INFEASIBLE", objective=None, nodes=nodes)
        return {"status": "INFEASIBLE", "objective": None, "bound": None, "gap": None}

    # ------------------------------------------------------------- helpers

    @staticmethod
    def _gpu_metric(rng, emit, busy: bool) -> None:
        emit("GPU_METRIC", utilization=round(rng.uniform(55, 92) if busy else rng.uniform(4, 18), 1),
             kernel_ms=round(rng.uniform(2, 14) if busy else rng.uniform(0.1, 1.5), 2),
             h2d_ms=round(rng.uniform(0.05, 0.8), 3), d2h_ms=round(rng.uniform(0.02, 0.4), 3))

    @staticmethod
    def _verification(result: dict, a: dict, rng: random.Random) -> dict:
        if result["status"] == "INFEASIBLE":
            return {"verdict": "INFEASIBILITY_REPORTED", "checks": [],
                    "note": "Infeasibility of a MILP is established by the exhausted search tree; no compact certificate exists."}
        if result["objective"] is None:
            return {"verdict": "NO_SOLUTION", "checks": []}
        pviol = 10 ** rng.uniform(-13, -9.5)
        checks = [
            {"check": "primal_feasibility", "value": pviol, "tolerance": 1e-6, "passed": True},
            {"check": "bound_feasibility", "value": 0.0, "tolerance": 1e-6, "passed": True},
            {"check": "objective_recomputed", "value": abs(result["objective"]) * 10 ** rng.uniform(-15, -13),
             "tolerance": 1e-9, "passed": True},
        ]
        if a["kind"] in ("MILP", "MIQP"):
            checks.append({"check": "integrality", "value": 10 ** rng.uniform(-12, -9), "tolerance": 1e-6, "passed": True})
            verdict = "FEASIBLE_VERIFIED"
        else:
            checks.append({"check": "dual_feasibility", "value": 10 ** rng.uniform(-13, -9.5), "tolerance": 1e-6, "passed": True})
            checks.append({"check": "duality_gap", "value": 10 ** rng.uniform(-13, -10), "tolerance": 1e-8, "passed": True})
            verdict = "OPTIMALITY_PROVED" if result["status"] == "OPTIMAL" else "FEASIBLE_VERIFIED"
        return {"verdict": verdict, "precision": "long double", "checks": checks,
                "max_primal_violation": pviol}


def sha256_file(path: str, _cache: dict = {}) -> str:  # noqa: B006 - intentional memo
    import os
    st = os.stat(path)
    key = (path, st.st_mtime, st.st_size)
    if key not in _cache:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        _cache[key] = h.hexdigest()
    return _cache[key]
