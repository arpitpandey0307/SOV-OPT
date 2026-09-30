# SOV-OPT

**Sovereign GPU-Accelerated Optimization Engine**. Built for SIH 2026, Problem Statement **26119** (MRPL).

SOV-OPT is an LP / MILP / QP solver written from scratch in C++20 with CUDA acceleration. The
optimization engine does not use or link any existing solver library.

> Solve. Stress-test. Reoptimize. Verify.

---

## Repository Layout

```text
solver/        C++20 optimization core (LP, MILP, QP, GPU)
  include/sovopt/   public C API
  src/              api, core, io, linalg, presolve, scaling, simplex, ...
  tests/            unit + numerical tests
verifier/      independent solution verifier (does NOT link solver code)
cli/           `sovopt` command-line tool
bench/         dataset manifests, benchmark runner, analysis, reports
tools/         delta debugger, passport tooling
bindings/      Python (pybind11), Pyomo / PuLP adapters
backend/       FastAPI control plane + solver worker
frontend/      Next.js web platform
models/        refinery / blending / planning demo models
deploy/        Docker Compose
docs/          task plans, datasets, design notes
```

## Plan

See [docs/tasks/00-OVERVIEW.md](docs/tasks/00-OVERVIEW.md).

| Task | Area |
|------|------|
| T1 | Core LP engine (sparse LU, presolve, dual/primal simplex) |
| T2 | MILP engine (branch-and-cut, heuristics) |
| T3 | Interior point, QP, GPU (PDLP, GPU heuristics) |
| T4 | Trust layer (verifier, benchmarks vs HiGHS, passport) |
| T5 | Platform + decision layer |

Datasets: see [docs/DATASETS.md](docs/DATASETS.md).

## Build

Requirements: CMake ≥ 3.24, Ninja, a C++20 compiler (GCC ≥ 11, Clang ≥ 14, MSVC 2022).
The optional GPU path needs CUDA ≥ 12.8 (required for RTX 50-series / Blackwell).

```bash
cmake --preset release          # CPU only
cmake --build --preset release
ctest --preset release

cmake --preset release-cuda     # with GPU
```

## Sovereignty Rules

1. No existing solver library (HiGHS, CBC, GLPK, SCIP, OSQP, ...) is linked into the solver.
   HiGHS is used only as an external comparison binary in `bench/`.
2. LU, Cholesky, orderings, simplex, IPM, PDLP, branch-and-bound, cuts and heuristics are all
   implemented in this repository.
3. Any third-party numerical primitive sits behind a build switch, and the benchmark report
   includes results with that switch disabled.
