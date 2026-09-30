"""Command line: python -m sovopt solve model.mps [--time-limit S] [--solution PATH] [--events]"""

import argparse
import sys

from ._native import SovoptError, solve_file, version


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="sovopt")
    ap.add_argument("--version", action="store_true")
    sub = ap.add_subparsers(dest="cmd")
    s = sub.add_parser("solve")
    s.add_argument("model")
    s.add_argument("--time-limit", type=float, default=60.0)
    s.add_argument("--solution")
    s.add_argument("--events", action="store_true")
    s.add_argument("--seed", type=int, default=42)
    args = ap.parse_args(argv)

    if args.version:
        print(version())
        return 0
    if args.cmd != "solve":
        ap.print_help()
        return 2
    try:
        r = solve_file(args.model, args.time_limit, args.solution, args.events, args.seed)
    except SovoptError as e:
        if not args.events:
            print(f"error: {e}", file=sys.stderr)
        return 1
    if not args.events:
        print(f"Status: {r.status}\nObjective: {r.objective:.12g}\nIterations: {r.iterations} "
              f"(phase 1: {r.phase1_iterations})\nTime: {r.elapsed:.3f} s\n"
              f"Max primal violation: {r.max_primal_violation:.2e}\nMax dual violation: {r.max_dual_violation:.2e}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
