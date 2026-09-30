#!/usr/bin/env python3
"""Runs every automated check in the repository and prints one summary.

    python scripts/check_all.py            # everything
    python scripts/check_all.py --fast     # skip the Next.js production build

Steps: C++ build + unit tests, backend/verifier/binding tests, a Netlib
regression against published optima, and frontend type-check, lint and build.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SCRIPTS = Path(sys.executable).parent / "Scripts"
ENV = dict(os.environ, PATH=f"{SCRIPTS}{os.pathsep}{os.environ.get('PATH', '')}")
NPX = shutil.which("npx") or "npx"


def run(name: str, cmd: list[str], cwd: Path = REPO, timeout: int = 1800) -> tuple[str, bool, float, str]:
    t0 = time.time()
    # Windows resolves the program from this process's PATH, so resolve it against ENV explicitly.
    cmd = [shutil.which(cmd[0], path=ENV["PATH"]) or cmd[0], *cmd[1:]]
    try:
        p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=ENV, shell=False)
        ok = p.returncode == 0
        tail = (p.stdout + p.stderr).strip().splitlines()[-6:]
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        ok, tail = False, [str(e)]
    dt = time.time() - t0
    print(f"{'PASS' if ok else 'FAIL'}  {name:<34} {dt:7.1f}s", flush=True)
    if not ok:
        print("      " + "\n      ".join(tail))
    return name, ok, dt, "\n".join(tail)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fast", action="store_true")
    args = ap.parse_args()
    results = []

    preset = "release-zig" if os.name == "nt" else "release"
    results.append(run("solver: configure", ["cmake", "--preset", preset]))
    results.append(run("solver: build", ["cmake", "--build", "--preset", preset]))
    results.append(run("solver: unit tests (ctest)", ["ctest", "--preset", preset]))

    results.append(run("backend + verifier + bindings (pytest)",
                       [sys.executable, "-m", "pytest", "backend/tests", "-q", "-p", "no:cacheprovider"]))

    quick = ["afiro", "adlittle", "blend", "degen2", "perold"]
    name, ok, dt, tail = run("netlib regression (5 models)",
                             [sys.executable, "bench/runner/run_suite.py", "--time-limit", "60", "--only", *quick])
    if ok:
        report = json.loads((REPO / "bench" / "reports" / "netlib-subset.json").read_text())
        solved = report["summary"]["sovopt_solved"]
        ok = solved == len(quick)
        if not ok:
            print(f"      only {solved}/{len(quick)} matched the published optimum")
    results.append((name, ok, dt, tail))

    fe = REPO / "frontend"
    results.append(run("frontend: type-check", [NPX, "tsc", "--noEmit"], cwd=fe))
    results.append(run("frontend: lint", [NPX, "eslint", "."], cwd=fe))
    if not args.fast:
        results.append(run("frontend: production build", [NPX, "next", "build"], cwd=fe))

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
