# SOV-OPT — Project Task Breakdown

**Problem Statement:** SIH PS 26119 — Indigenous GPU-Accelerated Optimization Solver (MRPL)
**Product:** SOV-OPT — Sovereign Trustworthy Adaptive Optimization Platform

---

## Guiding Principle

The evaluators will judge the **solver engine** first. The platform multiplies the value of a
working solver; it cannot replace one. Every task below is ordered by that principle.

> Engine first. Proof second. Platform third.

---

## The Five Tasks

| # | Task | Purpose | Critical? | File |
|---|------|---------|-----------|------|
| T1 | Core LP Engine (CPU) | Sparse LA, parser, presolve, LU, dual/primal simplex | Critical path | [T1-lp-core.md](T1-lp-core.md) |
| T2 | MILP Engine | Branch-and-cut, cuts, heuristics, parallel tree | Highest MRPL value | [T2-milp-engine.md](T2-milp-engine.md) |
| T3 | IPM + QP + GPU Acceleration | Interior point, convex QP, GPU PDLP, GPU heuristics | "GPU" in the title | [T3-ipm-qp-gpu.md](T3-ipm-qp-gpu.md) |
| T4 | Trust Layer | Verifier, benchmark harness, regression, passport | Start on Day 1 | [T4-trust-layer.md](T4-trust-layer.md) |
| T5 | Platform + Decision Layer | API, workers, web UI, 5 differentiating features | Demo & differentiation | [T5-platform-decision.md](T5-platform-decision.md) |

---

## Dependency Graph

```text
        ┌──────────────── T4: Trust Layer (verifier + harness) ─────────────────┐
        │                 starts DAY 1, runs continuously                       │
        ▼                                                                       ▼
T1: LP Core ─────────► T2: MILP Engine ───────────────────────► T5: Platform + Decision
        │                     ▲                                        ▲
        └──► T3: IPM/QP/GPU ──┘  (GPU heuristics & batch LP → MILP)    │
                                                     C API frozen ─────┘
```

---

## Phases

| Phase | T1 | T2 | T3 | T4 | T5 |
|-------|----|----|----|----|----|
| **P1 Foundation** | Sparse structs, MPS parser, LU | — | Sparse Cholesky, AMD ordering | Verifier + Netlib harness | Repo, CI, API skeleton |
| **P2 LP works** | Dual/primal simplex, presolve | B&B skeleton | IPM for LP | HiGHS comparison runs | Worker, Redis, SSE |
| **P3 MILP works** | Degeneracy hardening | Cuts, branching, heuristics | GPU PDLP, QP | MIPLIB subset, delta debugger | Model Studio, Run Center |
| **P4 Differentiate** | Warm-start API | Parallel tree, solution pool | GPU heuristics → MILP | Optimization Passport | Stability map, lineage, demo models |

---

## Suggested Team Split (6 members)

| Member | Primary | Secondary |
|--------|---------|-----------|
| M1 | T1 (LU, simplex) | T2 |
| M2 | T1 (parser, presolve) | T2 (cuts, heuristics) |
| M3 | T3 (CUDA, IPM) | T2 GPU heuristics |
| M4 | T4 (verifier, harness, CI) | Numerical QA gatekeeper |
| M5 | T5 backend (FastAPI, worker, Redis) | Python bindings |
| M6 | T5 frontend (Next.js) | Demo refinery models |

---

## Locked Technology Decisions

| Layer | Choice |
|-------|--------|
| Solver core | C++20, CMake + Ninja, own sparse LA / LU / Cholesky |
| GPU | CUDA (own kernels; cuSPARSE only as *optional, switchable* backend) |
| Bindings | Stable C ABI → CLI + pybind11 Python module |
| Tests | GoogleTest, pytest, Playwright |
| Backend | FastAPI, Pydantic, SQLAlchemy, Alembic, Redis Streams |
| Frontend | Next.js App Router, TypeScript, Tailwind, TanStack Query, Zustand, ECharts, React Flow |
| Data | PostgreSQL (metadata), `ArtifactStore` interface → local FS (dev) / MinIO (demo) |
| Dev environment | Linux / WSL2 (CUDA toolchain, sanitizers, reproducible benchmarks) |
| Comparison baseline | HiGHS (open source, same hardware) |

---

## Sovereignty Rules (non-negotiable)

1. No existing solver library (HiGHS, CBC, GLPK, SCIP, OSQP, etc.) is linked into the solver.
   HiGHS is used **only** as an external comparison binary in the benchmark harness.
2. LU factorization, Cholesky, ordering, simplex, IPM, PDLP, B&B, cuts, heuristics — all in-house.
3. Any third-party primitive (cuSPARSE, Eigen) must be behind a compile-time switch, and the
   benchmark report must show results with it **disabled**.

---

## Explicitly Out of Scope (roadmap only — "Profile C")

Kubernetes, Helm, Slurm, Keycloak/OIDC, mTLS, PostgreSQL RLS, gRPC, Adversarial Stress Lab,
MINLP/NLP. These appear in the architecture diagram as future work, not in the build.

---

## Definition of "Industry Ready"

- [ ] Stable C API, CLI, Python module
- [ ] Reads standard MPS / LP files (existing CPLEX/Gurobi models load unchanged)
- [ ] Pyomo / PuLP adapter (engineers swap solver with one line)
- [ ] Standard status codes, parameters, time limits, deterministic mode
- [ ] Every answer independently verified
- [ ] Published, reproducible benchmark report vs HiGHS
