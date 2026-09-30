# SOV-OPT implementation status

Last updated 30 September 2026. Legend: **Done**, **Partial**, **Not started**. Every "Done" item is
covered by an automated check in `scripts/check_all.py` unless noted.

## Summary

| Task | State | Evidence |
|------|-------|----------|
| T1 LP core | **Partial**: working LP solver; sparse LU, dual simplex, presolve pending | 7/8 local Netlib models certified optimal (`bench/reports/netlib.md`), 10 unit tests |
| T2 MILP engine | **Not started** | MILP runs in the web app use the labelled preview engine |
| T3 IPM, QP, GPU | **Not started** | QP runs use the preview engine; GPU telemetry page is live hardware data |
| T4 Trust layer | **Partial**: verifier, harness, passport, regression done | exact-rational verifier with 4 negative tests; SOV-OPT vs HiGHS report |
| T5 Platform | **Partial**: web, API, bindings, adapters, demo model done | 21 API/binding/verifier tests, production build passes |

## T1 LP core

| Item | State | Notes |
|------|-------|-------|
| MPS reader (fixed/free, RANGES, all BOUNDS, markers, OBJSENSE, objective constant) | Done | `solver/src/io/mps_reader.cpp`; gzip input is expanded by the control plane |
| LP-format reader | Not started | |
| Sparse data structures (CSC) | Done | |
| Basis factorization | Partial | slack/kernel split + dense LU with partial pivoting + product-form eta updates; a sparse Markowitz LU with Forrest-Tomlin updates is still to do, and is what GREENBEA needs |
| Scaling | Done | geometric, rounded to powers of two |
| Primal simplex | Done | bounded variables, composite phase 1, Harris ratio test, Devex pricing, cost and bound perturbation, fresh-factorization optimality check |
| Dual simplex | Not started | needed for MILP warm starts (T2) |
| Presolve with postsolve stack | Not started | the web app's presolve counts come from the model profiler |
| Warm-start API | Not started | |
| Infeasibility detection | Done | phase 1; Farkas certificate output not yet written |
| Netlib exit criterion (90/94) | Partial | 7 of the 8 Netlib models present locally: AFIRO, ADLITTLE, BLEND, DEGEN2, DEGEN3, PEROLD, PILOT. GREENBEA fails numerically. The other 86 Netlib models are not in `Dataset/` yet |

## T2 MILP engine

Not started: branch-and-bound, cuts, heuristics, parallel tree search. The web app still accepts MILP
runs; they execute on the preview engine (`backend/app/engine.py`), which targets the published
MIPLIB value and is labelled "Engine sovopt-preview" in the run header and on the benchmark page.

## T3 IPM, QP, GPU

Not started: sparse Cholesky, interior point, QP, PDLP, GPU heuristics. The GPU observatory shows
real `nvidia-smi` telemetry of the RTX 5050; per-run GPU charts exist only for preview-engine runs.

## T4 Trust layer

| Item | State | Notes |
|------|-------|-------|
| Independent verifier | Done | `verifier/verify.py`, own MPS parser, exact rational arithmetic, primal/dual/complementarity/duality-gap checks |
| Benchmark harness vs HiGHS | Done | `bench/runner/run_suite.py`; HiGHS runs as an external comparison only |
| Regression check | Done | `scripts/check_all.py` requires the five fast Netlib models to match the published optimum |
| CI | Partial | GitHub Actions builds and unit-tests the C++ core; Python tests need `Dataset/`, so they run locally |
| Optimization passport and evidence bundle | Done | model/config/trace hashes, hardware, verifier verdict |
| Delta debugger | Not started | |
| MIPLIB / QPLIB suites in the harness | Not started | need T2/T3 |

## T5 Platform

| Item | State | Notes |
|------|-------|-------|
| Web app (landing, overview, catalog, Model Studio, Run Center, benchmarks, GPU observatory, legal drafts) | Done | |
| Control plane API, SSE with resume, uploads, cancellation | Done | SQLite + filesystem (Profile A); PostgreSQL/Redis/MinIO not used yet |
| Native solver in the run pipeline | Done | LP runs use `sovopt-native` and the verifier |
| C API, CLI, Python binding | Done | `python -m sovopt solve` |
| PuLP adapter | Done | results match HiGHS on the blending test |
| Pyomo adapter | Not started | |
| Industrial demo model | Partial | 3-period refinery planning LP with illustrative data; blending with pooling, scheduling MILP and supply-chain models still to do |
| Docker Compose | Partial | files written in `deploy/`; not yet built or run on this machine |
| Stability map, reoptimization graph, constraint lineage | Not started | annotation sidecar format exists for the refinery model |

## Known environment notes

- Windows Smart App Control on the development machine blocks freshly built unsigned `.exe` files.
  The solver runs through the Python binding (`libsovopt.dll` loaded by the signed Python runtime);
  the native `sovopt` executable is used on Linux, in CI and in Docker.
- The C++ build uses Zig's clang through pip (`pip install ziglang cmake ninja`, `cmake --preset release-zig`).
