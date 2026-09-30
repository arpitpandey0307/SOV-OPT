"""Runs the native SOV-OPT core and the independent verifier for a run.

The solver runs in a child process (`python -m sovopt solve --events`), so a
crash in native code cannot take the control plane down. Its JSON event lines
are translated into the run event contract used by the web client.
"""

from __future__ import annotations

import asyncio
import gzip
import json
import shutil
import sys
import time
from pathlib import Path

from . import config

sys.path.insert(0, str(config.REPO_DIR / "verifier"))
sys.path.insert(0, str(config.REPO_DIR / "bindings" / "python"))

ENGINE_ID = "sovopt-native"


def available() -> bool:
    try:
        from sovopt import library_path
    except ImportError:
        return False
    return library_path() is not None


def supports(kind: str) -> bool:
    """The native core currently solves linear programs (T1). MILP and QP use the preview engine."""
    return kind == "LP"


def plain_mps(path: Path) -> Path:
    """The native reader takes uncompressed MPS; gzip files are expanded once into the cache."""
    if path.suffix != ".gz":
        return path
    out = config.CACHE_DIR / "plain" / path.name[: -len(".gz")]
    if not out.exists():
        out.parent.mkdir(parents=True, exist_ok=True)
        with gzip.open(path, "rb") as src, open(out, "wb") as dst:
            shutil.copyfileobj(src, dst)
    return out


async def execute(run_id: str, model_path: Path, cfg: dict, analysis: dict, t0: float, emit, state) -> dict:
    mps = plain_mps(model_path)
    sol = config.CACHE_DIR / "solutions" / f"{run_id}.sol"
    sol.parent.mkdir(parents=True, exist_ok=True)
    env_path = str(config.REPO_DIR / "bindings" / "python")
    limit = float(cfg.get("time_limit", 60))

    emit("SOLVER_DECISION", algorithm="primal_simplex",
         reason=f"{analysis['nnz']:,} nonzeros, linear objective. The native core solves it with the bounded "
                "revised primal simplex (Devex pricing, Harris ratio test).")
    emit("SOLVE_STARTED", algorithm="primal_simplex", phase=1)

    import os
    proc = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "sovopt", "solve", str(mps), "--time-limit", str(limit),
        "--solution", str(sol), "--events", "--seed", str(int(cfg.get("seed", 42))),
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        env=dict(os.environ, PYTHONPATH=env_path))

    result = None
    last_phase = 1
    try:
        assert proc.stdout is not None
        async for raw in proc.stdout:
            try:
                ev = json.loads(raw)
            except json.JSONDecodeError:
                continue
            kind = ev.get("type")
            if kind == "ITERATION":
                state["iterations"] = ev["iteration"]
                if ev["phase"] == 2 and last_phase == 1:
                    emit("PHASE_CHANGE", phase=2, iteration=ev["iteration"], message="Primal feasible basis found")
                last_phase = ev["phase"]
                emit("ITERATION", iteration=ev["iteration"], objective=ev["objective"],
                     primal_infeasibility=ev["primal_infeasibility"], phase=ev["phase"])
            elif kind == "SCALING_COMPLETED":
                emit("SCALING_COMPLETED", method="geometric, powers of two",
                     range_before=round(ev["a"], 2), range_after=round(ev["b"], 2))
            elif kind == "NUMERICAL_EVENT":
                emit("NUMERICAL_EVENT", severity="info", message=ev["message"], action="solver")
            elif kind == "RESULT":
                result = ev
            elif kind == "RUN_FAILED":
                raise RuntimeError(ev.get("message", "native solver failed"))
        await proc.wait()
    except asyncio.CancelledError:
        proc.kill()
        await proc.wait()
        raise

    if result is None:
        err = (await proc.stderr.read()).decode(errors="replace")[-300:] if proc.stderr else ""
        raise RuntimeError(f"native solver exited without a result {err}".strip())

    status = result["status"]
    state["iterations"] = result["iterations"]
    obj = result["objective"] if status in ("OPTIMAL", "TIME_LIMIT", "ITERATION_LIMIT") else None
    emit("SOLVE_COMPLETED", status=status, objective=obj, iterations=result["iterations"],
         refactorizations=result["refactorizations"])
    return {"status": status, "objective": obj, "bound": obj if status == "OPTIMAL" else None,
            "gap": 0.0 if status == "OPTIMAL" else None, "solution": sol if sol.exists() else None, "mps": mps}


async def run_verifier(mps: Path, sol: Path) -> dict:
    from verify import verify

    report = await asyncio.to_thread(verify, mps, sol)
    return {
        "verdict": report["verdict"],
        "precision": report["precision"],
        "checks": [{k: c[k] for k in ("check", "value", "tolerance", "passed")} for c in report["checks"]],
        "max_primal_violation": report["max_primal_violation"],
        "verifier": "verifier/verify.py",
    }
