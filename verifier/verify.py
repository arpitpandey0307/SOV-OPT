#!/usr/bin/env python3
"""SOV-OPT independent solution verifier.

Checks a solution against the original MPS model using exact rational
arithmetic. This program shares no code with the solver: it has its own MPS
parser and recomputes every quantity from the model file and the reported
primal and dual values.

Usage:
    python verifier/verify.py model.mps solution.sol [--json]

Checks:
    primal feasibility   rows and column bounds, exact activities
    objective            reported value against c^T x + offset
    integrality          integer columns (MILP)
    dual feasibility     reduced cost signs against active bounds (LP)
    complementarity      y and d vanish on inactive constraints (LP)
    duality gap          primal objective against the dual objective (LP)
"""

from __future__ import annotations

import argparse
import gzip
import json
import math
import sys
from fractions import Fraction
from pathlib import Path

INF = math.inf
PRIMAL_TOL = 1e-6   # relative: violation / (1 + |bound|)
DUAL_TOL = 1e-6     # relative: violation / (1 + max|c|)
GAP_TOL = 1e-6      # relative duality gap
INT_TOL = 1e-6


class Model:
    def __init__(self) -> None:
        self.name = ""
        self.maximize = False
        self.obj_offset = Fraction(0)
        self.rows: list[str] = []
        self.row_type: list[str] = []
        self.rhs: dict[int, Fraction] = {}
        self.ranges: dict[int, Fraction] = {}
        self.cols: list[str] = []
        self.col_index: dict[str, int] = {}
        self.obj: dict[int, Fraction] = {}
        self.a: list[list[tuple[int, Fraction]]] = []  # per column: (row, value)
        self.lower: dict[int, float] = {}
        self.upper: dict[int, float] = {}
        self.integer: set[int] = set()


def _num(tok: str) -> Fraction:
    return Fraction(tok)


def read_mps(path: Path) -> Model:
    opener = gzip.open if path.suffix == ".gz" else open
    m = Model()
    row_index: dict[str, int] = {}
    obj_row = None
    section = None
    in_int = False
    with opener(path, "rt", encoding="latin-1") as f:
        for raw in f:
            if not raw.strip() or raw[0] == "*":
                continue
            tok = raw.split()
            if raw[0] not in " \t":
                section = tok[0].upper()
                if section == "NAME" and len(tok) > 1:
                    m.name = tok[1]
                if section == "OBJSENSE" and len(tok) > 1:
                    m.maximize = tok[1].upper().startswith("MAX")
                if section == "ENDATA":
                    break
                continue
            if section == "OBJSENSE":
                m.maximize = tok[0].upper().startswith("MAX")
            elif section == "ROWS":
                t, name = tok[0].upper(), tok[1]
                if t == "N":
                    obj_row = obj_row or name
                    continue
                row_index[name] = len(m.rows)
                m.rows.append(name)
                m.row_type.append(t)
            elif section == "COLUMNS":
                if len(tok) >= 3 and "MARKER" in tok[1].upper():
                    in_int = "INTORG" in tok[2].upper()
                    continue
                c = m.col_index.get(tok[0])
                if c is None:
                    c = len(m.cols)
                    m.col_index[tok[0]] = c
                    m.cols.append(tok[0])
                    m.a.append([])
                    if in_int:
                        m.integer.add(c)
                for i in range(1, len(tok) - 1, 2):
                    v = _num(tok[i + 1])
                    if tok[i] == obj_row:
                        m.obj[c] = m.obj.get(c, Fraction(0)) + v
                    elif v != 0:
                        m.a[c].append((row_index[tok[i]], v))
            elif section in ("RHS", "RANGES"):
                start = 1 if len(tok) % 2 == 1 else 0
                for i in range(start, len(tok) - 1, 2):
                    v = _num(tok[i + 1])
                    if section == "RHS" and tok[i] == obj_row:
                        m.obj_offset = -v
                    elif section == "RHS":
                        m.rhs[row_index[tok[i]]] = v
                    else:
                        m.ranges[row_index[tok[i]]] = v
            elif section == "BOUNDS":
                t = tok[0].upper()
                if t in ("UP", "LO", "FX", "LI", "UI", "SC"):
                    name, val = (tok[2], float(tok[3])) if len(tok) >= 4 else (tok[1], float(tok[2]))
                else:
                    name, val = (tok[2] if len(tok) >= 3 and tok[2] in m.col_index else tok[1]), 0.0
                c = m.col_index[name]
                if t == "UP":
                    m.upper[c] = val
                    if val < 0 and c not in m.lower:
                        m.lower[c] = -INF
                elif t == "LO":
                    m.lower[c] = val
                elif t == "FX":
                    m.lower[c] = m.upper[c] = val
                elif t == "FR":
                    m.lower[c], m.upper[c] = -INF, INF
                elif t == "MI":
                    m.lower[c] = -INF
                elif t == "PL":
                    m.upper[c] = INF
                elif t == "BV":
                    m.lower[c], m.upper[c] = 0.0, 1.0
                    m.integer.add(c)
                elif t in ("LI", "UI"):
                    (m.lower if t == "LI" else m.upper)[c] = val
                    m.integer.add(c)
                elif t == "SC":
                    m.upper[c] = val
    return m


def row_bounds(m: Model, i: int) -> tuple[float, float]:
    b = float(m.rhs.get(i, 0))
    t = m.row_type[i]
    if i in m.ranges:
        r = float(m.ranges[i])
        if t == "E":
            return (b, b + abs(r)) if r >= 0 else (b - abs(r), b)
        if t == "L":
            return b - abs(r), b
        return b, b + abs(r)
    if t == "E":
        return b, b
    if t == "L":
        return -INF, b
    return b, INF


def read_solution(path: Path) -> dict:
    sol = {"status": None, "objective": None, "x": {}, "rc": {}, "act": {}, "y": {}}
    mode = None
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            tok = line.split()
            if tok[0] == "status":
                sol["status"] = tok[1]
            elif tok[0] == "objective":
                sol["objective"] = float(tok[1])
            elif tok[0] == "columns":
                mode = "col"
            elif tok[0] == "rows":
                mode = "row"
            elif mode == "col":
                sol["x"][tok[0]] = float(tok[1])
                if len(tok) > 2:
                    sol["rc"][tok[0]] = float(tok[2])
            elif mode == "row":
                sol["act"][tok[0]] = float(tok[1])
                if len(tok) > 2:
                    sol["y"][tok[0]] = float(tok[2])
    return sol


def _rel(v: float, scale: float) -> float:
    return v / (1.0 + abs(scale)) if math.isfinite(scale) else v


def verify(model_path: Path, solution_path: Path) -> dict:
    m = read_mps(model_path)
    s = read_solution(solution_path)
    n, nr = len(m.cols), len(m.rows)
    x = [Fraction(s["x"].get(name, 0.0)) for name in m.cols]
    lower = [m.lower.get(j, 0.0) for j in range(n)]
    upper = [m.upper.get(j, INF) for j in range(n)]

    # Exact row activities.
    act = [Fraction(0)] * nr
    for j in range(n):
        if x[j] == 0:
            continue
        for i, v in m.a[j]:
            act[i] += v * x[j]

    worst_p, worst_p_where = 0.0, None
    for j in range(n):
        for bound, sign in ((lower[j], 1), (upper[j], -1)):
            if math.isfinite(bound):
                viol = float(sign * (Fraction(bound) - x[j]))
                r = _rel(viol, bound)
                if r > worst_p:
                    worst_p, worst_p_where = r, f"column {m.cols[j]}"
    rb = [row_bounds(m, i) for i in range(nr)]
    for i in range(nr):
        lo, up = rb[i]
        for bound, sign in ((lo, 1), (up, -1)):
            if math.isfinite(bound):
                viol = float(sign * (Fraction(bound) - act[i]))
                r = _rel(viol, bound)
                if r > worst_p:
                    worst_p, worst_p_where = r, f"row {m.rows[i]}"

    obj_exact = m.obj_offset + sum((m.obj.get(j, Fraction(0)) * x[j] for j in range(n)), Fraction(0))
    obj_err = abs(float(obj_exact) - (s["objective"] or 0.0)) / (1.0 + abs(float(obj_exact)))

    checks = [
        {"check": "primal_feasibility", "value": max(worst_p, 0.0), "tolerance": PRIMAL_TOL,
         "passed": worst_p <= PRIMAL_TOL, "where": worst_p_where},
        {"check": "objective_recomputed", "value": obj_err, "tolerance": 1e-9, "passed": obj_err <= 1e-9},
    ]

    if m.integer:
        worst_i = max((abs(float(x[j]) - round(float(x[j]))) for j in m.integer), default=0.0)
        checks.append({"check": "integrality", "value": worst_i, "tolerance": INT_TOL, "passed": worst_i <= INT_TOL})

    has_duals = bool(s["y"]) and not m.integer and s["status"] == "OPTIMAL"
    if has_duals:
        sgn = -1 if m.maximize else 1  # work in minimization form
        y = [Fraction(s["y"].get(name, 0.0)) * sgn for name in m.rows]
        cmax = max((abs(float(v)) for v in m.obj.values()), default=0.0)
        dscale = 1.0 + cmax
        worst_d = 0.0
        # Dual objective of min c^T x s.t. lo <= Ax <= up, l <= x <= u:
        #   sum_i y_i * (active row bound) + sum_j d_j * (active column bound)
        dual_obj = Fraction(0)
        for j in range(n):
            d = m.obj.get(j, Fraction(0)) * sgn - sum((v * y[i] for i, v in m.a[j]), Fraction(0))
            df = float(d)
            if df > 0:
                if not math.isfinite(lower[j]):
                    worst_d = max(worst_d, df / dscale)
                else:
                    dual_obj += d * Fraction(lower[j])
            elif df < 0:
                if not math.isfinite(upper[j]):
                    worst_d = max(worst_d, -df / dscale)
                else:
                    dual_obj += d * Fraction(upper[j])
        for i in range(nr):
            lo, up = rb[i]
            yi = float(y[i])
            if yi > 0:
                if not math.isfinite(lo):
                    worst_d = max(worst_d, yi / dscale)
                else:
                    dual_obj += y[i] * Fraction(lo)
            elif yi < 0:
                if not math.isfinite(up):
                    worst_d = max(worst_d, -yi / dscale)
                else:
                    dual_obj += y[i] * Fraction(up)
        primal_min = obj_exact * sgn - m.obj_offset * sgn
        gap = abs(float(primal_min - dual_obj)) / (1.0 + abs(float(primal_min)))
        checks.append({"check": "dual_feasibility", "value": worst_d, "tolerance": DUAL_TOL, "passed": worst_d <= DUAL_TOL})
        checks.append({"check": "duality_gap", "value": gap, "tolerance": GAP_TOL, "passed": gap <= GAP_TOL})

    ok = all(c["passed"] for c in checks)
    if not ok:
        verdict = "FAILED"
    elif has_duals:
        verdict = "OPTIMALITY_PROVED"
    else:
        verdict = "FEASIBLE_VERIFIED"
    return {
        "verdict": verdict,
        "precision": "exact rational",
        "model": m.name,
        "objective": float(obj_exact),
        "checks": checks,
        "max_primal_violation": worst_p,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("model", type=Path)
    ap.add_argument("solution", type=Path)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    report = verify(args.model, args.solution)
    if args.json:
        print(json.dumps(report))
    else:
        print(f"{report['model']}: {report['verdict']} (objective {report['objective']:.12g})")
        for c in report["checks"]:
            mark = "pass" if c["passed"] else "FAIL"
            print(f"  {mark:4}  {c['check']:<22} {c['value']:.3e}  (tol {c['tolerance']:.0e})")
    return 0 if report["verdict"] != "FAILED" else 1


if __name__ == "__main__":
    sys.exit(main())
