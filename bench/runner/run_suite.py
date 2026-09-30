#!/usr/bin/env python3
"""Benchmark SOV-OPT against HiGHS on a model suite and write a report.

    python bench/runner/run_suite.py --suite netlib [--time-limit 300]

For every model: SOV-OPT solves it (subprocess, so a crash cannot stop the
run), the independent verifier checks the solution, HiGHS solves the same file
with the same time limit, and both objectives are compared with the published
reference. Results go to bench/reports/<suite>.json and <suite>.md.

HiGHS is used only as an external comparison solver; it is never linked into
the SOV-OPT core.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import platform
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "backend"))
sys.path.insert(0, str(REPO / "verifier"))

from verify import verify  # noqa: E402

NETLIB_REFERENCE = {
    "afiro": -4.6475314286e02, "adlittle": 2.2549496316e05, "blend": -3.0812149846e01,
    "degen2": -1.4351780000e03, "degen3": -9.8729400000e02, "greenbea": -7.2555248130e07,
    "perold": -9.3807552782e03, "pilot": -5.5748972928e02,
}


def netlib_models() -> list[tuple[str, Path, float | None]]:
    cache = REPO / "backend" / ".cache" / "netlib"
    emps = REPO / "tools" / "emps" / ("emps.exe" if os.name == "nt" else "emps")
    out = []
    for f in sorted((REPO / "Dataset").glob("*.txt")):
        name = f.stem.lower()
        if name == "emps":
            continue
        mps = cache / f"{name}.mps"
        if not mps.exists() and emps.exists():
            cache.mkdir(parents=True, exist_ok=True)
            with open(mps, "w") as fh:
                subprocess.run([str(emps), str(f)], stdout=fh, check=False)
        if mps.exists():
            out.append((name, mps, NETLIB_REFERENCE.get(name)))
    return out


def run_sovopt(mps: Path, limit: float, sol: Path) -> dict:
    env = dict(os.environ, PYTHONPATH=str(REPO / "bindings" / "python"))
    t0 = time.perf_counter()
    try:
        p = subprocess.run([sys.executable, "-m", "sovopt", "solve", str(mps), "--time-limit", str(limit),
                            "--solution", str(sol), "--events"],
                           capture_output=True, text=True, timeout=limit + 60, env=env)
    except subprocess.TimeoutExpired:
        return {"status": "TIMEOUT", "objective": None, "time": limit}
    wall = time.perf_counter() - t0
    result = None
    for line in p.stdout.splitlines():
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        if ev.get("type") == "RESULT":
            result = ev
    if not result:
        return {"status": "CRASH", "objective": None, "time": wall, "stderr": p.stderr[-400:]}
    return {"status": result["status"], "objective": result["objective"], "time": result["elapsed"],
            "iterations": result["iterations"]}


def run_highs(mps: Path, limit: float) -> dict:
    try:
        import highspy
    except ImportError:
        return {"status": "NOT_INSTALLED", "objective": None, "time": None}
    h = highspy.Highs()
    h.silent()
    h.setOptionValue("time_limit", float(limit))
    h.readModel(str(mps))
    t0 = time.perf_counter()
    h.run()
    t = time.perf_counter() - t0
    status = h.modelStatusToString(h.getModelStatus()).upper().replace(" ", "_")
    return {"status": status, "objective": h.getInfo().objective_function_value, "time": t,
            "version": f"{h.version()}" if hasattr(h, "version") else None}


def rel_err(a, b):
    if a is None or b is None:
        return None
    return abs(a - b) / max(1.0, abs(b))


def sgm(times: list[float], shift: float = 10.0) -> float | None:
    if not times:
        return None
    return math.exp(sum(math.log(t + shift) for t in times) / len(times)) - shift


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--suite", default="netlib", choices=["netlib"])
    ap.add_argument("--time-limit", type=float, default=300.0)
    ap.add_argument("--only", nargs="*", help="restrict to these model names")
    args = ap.parse_args()

    models = netlib_models()
    if args.only:
        models = [m for m in models if m[0] in args.only]
    sol_dir = REPO / "backend" / ".cache" / "sol"
    sol_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    for name, mps, ref in models:
        sol = sol_dir / f"{name}.sol"
        sov = run_sovopt(mps, args.time_limit, sol)
        ver = None
        if sov["status"] in ("OPTIMAL", "TIME_LIMIT") and sol.exists():
            ver = verify(mps, sol)
        hi = run_highs(mps, args.time_limit)
        row = {
            "model": name, "reference": ref,
            "sovopt": sov, "sovopt_rel_err": rel_err(sov["objective"], ref),
            "verification": ver["verdict"] if ver else None,
            "verification_checks": ver["checks"] if ver else None,
            "highs": hi, "highs_rel_err": rel_err(hi["objective"], ref),
        }
        rows.append(row)
        print(f"{name:10} sovopt {sov['status']:<16} {sov['time'] or 0:8.2f}s  "
              f"verify {row['verification'] or '-':<18} highs {hi['status']:<10} {hi['time'] or 0:6.2f}s", flush=True)

    solved = [r for r in rows if r["sovopt"]["status"] == "OPTIMAL" and (r["sovopt_rel_err"] or 1) <= 1e-6
              and r["verification"] == "OPTIMALITY_PROVED"]
    hi_solved = [r for r in rows if r["highs"]["status"] == "OPTIMAL"]
    # Unsolved instances count at the time limit, as in public benchmarks.
    sov_times = [r["sovopt"]["time"] if r in solved else args.time_limit for r in rows]
    hi_times = [r["highs"]["time"] if r in hi_solved else args.time_limit for r in rows]

    import highspy  # noqa: F401  (for the version string in the report)
    summary = {
        "suite": args.suite,
        "time_limit": args.time_limit,
        "machine": {"os": platform.platform(), "cpu": platform.processor(), "python": platform.python_version()},
        "sovopt_solved": len(solved), "highs_solved": len(hi_solved), "models": len(rows),
        "sovopt_sgm": sgm(sov_times), "highs_sgm": sgm(hi_times),
        "generated": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    out_dir = REPO / "bench" / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = args.suite if not args.only else f"{args.suite}-subset"
    (out_dir / f"{stem}.json").write_text(json.dumps({"summary": summary, "rows": rows}, indent=2))

    def f(v, fmt):
        return "n/a" if v is None else format(v, fmt)

    lines = [
        f"# {args.suite} benchmark: SOV-OPT vs HiGHS",
        "",
        f"Generated {summary['generated']} on {summary['machine']['os']}. Time limit {args.time_limit:.0f} s per model.",
        "Solved means optimal, within 1e-6 of the published objective, and certified by the independent verifier.",
        "",
        f"| | SOV-OPT | HiGHS |",
        f"|---|---|---|",
        f"| Solved | {len(solved)} / {len(rows)} | {len(hi_solved)} / {len(rows)} |",
        f"| Shifted geometric mean time (s, shift 10) | {f(summary['sovopt_sgm'], '.3f')} | {f(summary['highs_sgm'], '.3f')} |",
        "",
        "| Model | Reference | SOV-OPT objective | Rel. error | Status | Verifier | Time (s) | HiGHS time (s) |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        s = r["sovopt"]
        lines.append(f"| {r['model']} | {f(r['reference'], '.10g')} | {f(s['objective'], '.10g')} | "
                     f"{f(r['sovopt_rel_err'], '.1e')} | {s['status']} | {r['verification'] or 'n/a'} | "
                     f"{f(s['time'], '.3f')} | {f(r['highs']['time'], '.3f')} |")
    (out_dir / f"{args.suite}.md").write_text("\n".join(lines) + "\n")
    print(f"\nSOV-OPT solved {len(solved)}/{len(rows)}, HiGHS {len(hi_solved)}/{len(rows)}. "
          f"Report: bench/reports/{args.suite}.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
