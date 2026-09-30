# SOV-OPT: Sovereign GPU-Accelerated Optimization Engine

**Project Report · Smart India Hackathon 2026**

| | |
|---|---|
| Problem Statement ID | SIH26119 |
| Title | Indigenous GPU-Accelerated Optimization Solver (Sovereign Alternative to CPLEX / Gurobi / Xpress) |
| Organization | Mangalore Refinery and Petrochemicals Limited (MRPL) |
| Theme / Category | Smart Automation · Software |
| Repository | https://github.com/arpitpandey0307/SOV-OPT |

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Problem statement](#2-problem-statement)
3. [Why this problem matters](#3-why-this-problem-matters)
4. [Our solution: SOV-OPT](#4-our-solution-sov-opt)
5. [System architecture](#5-system-architecture)
6. [Solver core (C++20)](#6-solver-core-c20)
7. [Numerical robustness](#7-numerical-robustness)
8. [Independent verifier and trust layer](#8-independent-verifier-and-trust-layer)
9. [Control plane (backend)](#9-control-plane-backend)
10. [Web platform (frontend)](#10-web-platform-frontend)
11. [Integrations: C API, CLI, Python, PuLP](#11-integrations-c-api-cli-python-pulp)
12. [Industrial model: refinery planning](#12-industrial-model-refinery-planning)
13. [Benchmarks and results](#13-benchmarks-and-results)
14. [Testing and quality assurance](#14-testing-and-quality-assurance)
15. [Deployment](#15-deployment)
16. [Technology stack](#16-technology-stack)
17. [Engine roadmap: MILP, QP and GPU](#17-engine-roadmap-milp-qp-and-gpu)
18. [Future scope and expansion](#18-future-scope-and-expansion)
19. [Impact and benefits](#19-impact-and-benefits)
20. [Feasibility and viability](#20-feasibility-and-viability)
21. [Risks and mitigations](#21-risks-and-mitigations)
22. [References](#22-references)
23. [Appendix: repository map and commands](#23-appendix-repository-map-and-commands)

---

## 1. Executive summary

India's refineries, power utilities and logistics networks plan their operations with mathematical
optimization, and almost all of that planning runs on a handful of foreign commercial solvers: IBM
ILOG CPLEX, Gurobi and FICO Xpress. These engines are powerful, but they are closed, expensive and
licensed per seat, and Indian engineers cannot inspect or adapt what happens inside them.

**SOV-OPT** is an indigenous optimization engine built from mathematical first principles, with no
existing solver library inside it. It reads industrial models in the standard MPS format, measures
their numerical health, solves them with a from-scratch revised simplex core, and proves every answer
with an independent verifier that re-checks the result in exact rational arithmetic. Every run is
sealed into an *Optimization Passport*, a hash-backed evidence bundle anyone can re-verify.

Around the core sits a complete platform:

- a C API, command-line tool and Python module;
- a drop-in PuLP solver, so existing models switch with one line;
- a FastAPI control plane with live solver telemetry;
- a 3D interactive web workspace (Model Studio, Run Center, Benchmark Lab, GPU Observatory).

**Measured results today**

| Result | Value |
|---|---|
| Netlib LP models solved to the published optimum and certified | **7 of 8** in the local set, including the degenerate DEGEN2/DEGEN3 and ill-conditioned PILOT/PEROLD |
| Duality gap on certified solutions (exact arithmetic) | down to **1e-16** |
| Benchmark instances loaded and profiled | **840** (Netlib, MIPLIB 2017, Maros-Meszaros, QPLIB, industrial) |
| Refinery planning LP (138 rows, 156 columns) | optimal in **3 ms**, identical to HiGHS (4729.5) |
| Automated tests | **33 passing** (12 C++, 21 Python) |
| Foreign solver libraries linked | **0** |

---

## 2. Problem statement

> Almost every optimization problem in India's refining, petrochemical, power, logistics,
> manufacturing and planning sectors ultimately depends on a handful of foreign mathematical
> optimization solvers such as IBM ILOG CPLEX, Gurobi and FICO Xpress.

MRPL asks for a **sovereign mathematical optimization solver core** rather than a modelling
environment:

- **Problem classes:** LP, MILP and QP first, with an architecture that extends to MIQP, NLP and MINLP.
- **Algorithms:** revised simplex and interior-point methods; branch-and-bound, branch-and-cut,
  cutting planes, presolve, heuristics and node selection for mixed-integer problems.
- **Engineering:** sparse matrix techniques, efficient numerical linear algebra, multi-core
  parallelism, and GPU acceleration where it gives measurable benefit.
- **Constraint:** it must not be built on any existing open-source solver library. It must be built
  from the mathematical foundations.
- **Proof:** solve standard benchmarks (MIPLIB, Netlib, Mittelmann, QPLIB), compare against an
  established solver, and demonstrate robustness on degenerate, ill-conditioned and weakly relaxed
  models.
- **Domain:** refinery scheduling, crude blending, process optimization, production planning,
  logistics, power dispatch and supply chain.

---

## 3. Why this problem matters

| Challenge | Consequence for India |
|---|---|
| Recurring per-seat, per-core licences | Cost grows with every plant, planner and scenario |
| Closed internals | Engineers cannot inspect, tune or extend algorithms for Indian use cases |
| Strategic dependency | Critical planning for energy and infrastructure relies on foreign software supply |
| Open-source gap | CBC, GLPK, HiGHS and SCIP lag commercial engines on large MILPs and are not tuned for Indian industrial models |
| Trust | Solver output is accepted on faith; there is no routine independent proof of optimality |

A refinery planning model decides crude purchases worth crores every month. A 0.1 % better plan, or a
wrong one caught before it is executed, has direct financial value. SOV-OPT addresses dependency,
transparency and trust together.

---

## 4. Our solution: SOV-OPT

**Solve. Stress-test. Reoptimize. Verify.**

SOV-OPT is a sovereign optimization *engine* plus the platform that makes it usable and trustworthy:

1. **Indigenous solver core.** C++20, written from scratch: MPS reader, sparse structures, basis
   factorization, bounded revised primal simplex, scaling and numerical safeguards.
2. **Model Studio.** Every model is profiled on arrival: sparsity pattern, coefficient ranges, big-M
   detection, presolve opportunities and a measured health scorecard.
3. **Adaptive dispatch.** The engine chooses the algorithm from measurable model structure and records
   *why*.
4. **Live Run Center.** Objective, infeasibility, bound, gap and numerical events stream to the
   browser through resumable Server-Sent Events.
5. **Independent verifier.** A separate program with its own parser checks primal feasibility,
   objective, dual feasibility, complementarity and the duality gap in exact rational arithmetic.
6. **Optimization Passport.** Model hash, configuration hash, hardware, result, verifier verdict and
   trace hash, downloadable as an evidence bundle.
7. **Benchmark Lab.** One command runs SOV-OPT and HiGHS side by side on the same machine and publishes
   a report.
8. **Drop-in integration.** C API, CLI, Python module and a PuLP solver class.

### What makes it different

| Capability | Typical solver | SOV-OPT |
|---|---|---|
| Source available and modifiable in India | No (commercial) | Yes |
| Independent exact-arithmetic proof of every answer | No | Yes |
| Portable evidence bundle per run | Logs only | Optimization Passport |
| Model health report before solving | Rare | Built in |
| Live, resumable telemetry in a browser | No | Built in |
| Per-seat licence | Yes | None |

---

## 5. System architecture

SOV-OPT separates **control** from **compute**. The web platform orchestrates jobs; it never performs
the optimization itself. A solver failure cannot bring down the API.

```text
                               ┌──────────────────────────────┐
                               │  Web workspace (Next.js)     │
                               │  Model Studio · Run Center   │
                               │  Benchmark Lab · GPU view    │
                               └──────────────┬───────────────┘
                                   REST  │  ▲  SSE (resumable)
                                         ▼  │
┌────────────────────────────────────────────────────────────────────────┐
│                     CONTROL PLANE (FastAPI)                            │
│  Catalog · MPS profiler · Health scorecard · Run store · Telemetry     │
│  Passport + evidence · Uploads · Hardware telemetry (nvidia-smi)       │
└───────────────┬──────────────────────────────────────┬─────────────────┘
                │ child process, JSON event stream      │ exact re-check
                ▼                                        ▼
┌───────────────────────────────┐        ┌───────────────────────────────┐
│  COMPUTE PLANE                │        │  TRUST LAYER                  │
│  SOV-OPT core (C++20)         │        │  Independent verifier         │
│  C API · libsovopt · CLI      │ ─────▶ │  (own parser, exact rational) │
│  Python binding · PuLP        │  .sol  │  Benchmark harness vs HiGHS   │
└───────────────────────────────┘        └───────────────────────────────┘
                │
                ▼
┌────────────────────────────────────────────────────────────────────────┐
│  DATA: SQLite run/event store · model files · analysis cache ·         │
│        solutions · Netlib / MIPLIB / Maros-Meszaros / QPLIB datasets    │
└────────────────────────────────────────────────────────────────────────┘
```

**Run lifecycle**

1. The planner uploads an MPS model or picks one from the catalog.
2. The control plane profiles it and shows the health report.
3. On *Solve*, a run record is created and the native core starts in a child process.
4. The core emits JSON events (scaling, iterations, numerical events, result); the control plane
   stores them and streams them over SSE.
5. The verifier re-reads the original model and the solution file and issues a verdict.
6. The passport and evidence bundle become available for download and replay.

---

## 6. Solver core (C++20)

Location: `solver/`. Built with CMake + Ninja; no third-party numerical or solver library.

### 6.1 Model representation

`solver/src/core/model.hpp` stores `min/max cᵀx + offset` subject to
`row_lower ≤ Ax ≤ row_upper` and `col_lower ≤ x ≤ col_upper`, with the matrix in compressed sparse
column (CSC) form, integrality markers and names.

### 6.2 MPS reader

`solver/src/io/mps_reader.cpp` reads free and fixed MPS:

- ROWS (E/L/G/N), COLUMNS with integer `MARKER` blocks, RHS, RANGES with correct MPS semantics for
  E/L/G rows;
- every BOUNDS type (UP, LO, FX, FR, MI, PL, BV, LI, UI, SC), including the legacy negative-UP rule;
- OBJSENSE and the objective constant (negated RHS of the objective row);
- QUADOBJ / QMATRIX terms are read and counted;
- duplicate entries are summed; malformed input raises an error with the line number.

### 6.3 Basis factorization

`solver/src/linalg/basis_factor.cpp`

- **Slack/kernel split.** Basic slack columns are unit vectors, so only the structural kernel
  `K = A[R, S]` (rows not covered by basic slacks × basic structural columns) needs elimination.
- **LU with partial pivoting** on the kernel, with a relative singularity test.
- **Product-form eta updates** between refactorizations, for fast FTRAN and BTRAN.
- **Singular-basis repair**: a dependent column is swapped for a slack automatically.

### 6.4 Bounded revised primal simplex

`solver/src/simplex/primal_simplex.cpp`

- Bounded variables handled natively (lower, upper, boxed, free, fixed).
- **Composite phase 1** minimizes the sum of infeasibilities, then switches to phase 2.
- **Devex pricing** (approximate steepest edge), which cut iteration counts by about 40 % on Netlib.
- **Harris two-pass ratio test** with bound flips, choosing large pivots within a tolerance.
- **Cost perturbation** and **bound perturbation** against degeneracy, removed at the end, with a
  clean-up pass on the exact data.
- **Optimality confirmed on a fresh factorization** with a tight dual tolerance, so eta-file drift
  can never fake an optimum.
- Unbounded rays are confirmed after refactorization before being reported.
- Outputs unscaled primal values, row activities, duals and reduced costs, plus violation reports.

### 6.5 Scaling

Geometric-mean row and column scaling, iterated and **rounded to powers of two** so that scaling itself
introduces no rounding error. On GREENBEA it cuts the coefficient spread from 6.2 to 3.1 orders of
magnitude.

### 6.6 Public C API

`solver/include/sovopt/sovopt.h`: read a model, set parameters (time limit, iteration limit, scaling,
perturbation, seed), solve with an **event callback** that receives JSON progress, read the result,
and write a full solution (values, reduced costs, activities, duals).

---

## 7. Numerical robustness

The problem statement asks for a clear demonstration on degenerate and ill-conditioned models.
SOV-OPT addresses each failure mode directly:

| Difficulty | Example | Technique in SOV-OPT | Result |
|---|---|---|---|
| Primal/dual degeneracy (stalling, cycling) | DEGEN2, DEGEN3 | Bound perturbation, cost perturbation, Bland fallback | Both certified optimal |
| Ill-conditioned coefficients | PILOT (8.2 orders), PEROLD | Power-of-two scaling, Harris ratio test, relative pivot tolerance | Both certified optimal |
| Numerical drift | long runs | Refactor on small pivots, fresh-factorization optimality check | Exact duality gaps ~1e-16 |
| False unboundedness | tiny pivots | Tiny-tolerance re-test, ray confirmed on refactorization | Reported only when real |
| Big-M constants | glass4 (351 rows detected) | Detected and flagged by the model health scan | Visible before solving |

---

## 8. Independent verifier and trust layer

### 8.1 Verifier

`verifier/verify.py` is deliberately independent of the solver: its own MPS parser, its own
arithmetic, no shared code. It uses **exact rational numbers**, so its verdict does not depend on
floating-point luck.

| Check | What is verified |
|---|---|
| Primal feasibility | every row activity and column bound, exactly |
| Objective recomputed | reported objective against `cᵀx + offset` |
| Integrality | integer columns (for MILP) |
| Dual feasibility | reduced-cost signs against active bounds |
| Duality gap | primal objective against the dual objective built from `y` and `d` |

Verdicts: `OPTIMALITY_PROVED`, `FEASIBLE_VERIFIED`, `INFEASIBILITY_REPORTED` or `FAILED`. Negative
tests prove it rejects infeasible points, wrong objectives and sub-optimal duals.

### 8.2 Optimization Passport

Every finished run produces a passport:

```json
{
  "model": { "name": "refinery_planning", "sha256": "92ad5894…" },
  "solver": { "version": "0.1.0", "engine": "sovopt-native" },
  "configuration_sha256": "97ce90b1…",
  "random_seed": 42,
  "hardware": { "cpu": "AMD Ryzen 9 8940HX", "gpu": "NVIDIA GeForce RTX 5050 Laptop GPU" },
  "result": { "status": "OPTIMAL", "objective": 4729.5, "iterations": 223 },
  "verification": { "verdict": "OPTIMALITY_PROVED", "precision": "exact rational" },
  "artifacts": { "trace.jsonl": "0e592541…" }
}
```

The **evidence bundle** (`run.evidence.zip`) adds the configuration, the full event trace, the
verification report and the model profile.

### 8.3 Benchmark harness

`bench/runner/run_suite.py` solves each benchmark with SOV-OPT (isolated in a subprocess), verifies it,
solves it again with HiGHS under the same limits, compares both with the published reference and writes
`bench/reports/<suite>.md` and `.json`, including the shifted geometric mean time used in public solver
benchmarks. HiGHS is used only as an external comparison binary, never linked into the core.

---

## 9. Control plane (backend)

Location: `backend/`. Python, FastAPI, SQLite for the single-site profile.

| Module | Responsibility |
|---|---|
| `catalog.py` | Loads Netlib (with a built-in compressed-MPS decoder), MIPLIB 2017 (with official `.solu` reference values and statuses), Maros-Meszaros, QPLIB metadata, industrial models and uploads; background profiling, smallest first |
| `mps.py` | Streaming MPS profiler: dimensions, row and variable types, coefficient histograms, 120×120 sparsity grid, singleton and empty rows and columns, big-M detection |
| `health.py` | Measured health scorecard: sparsity, dense columns, matrix / objective / RHS ranges, big-M rows, row scaling, presolve opportunities, free variables, quadratic terms |
| `native.py` | Runs the native core in a child process, translates its JSON events, runs the verifier |
| `engine.py` | Run executor and algorithm dispatch |
| `store.py` | Runs and ordered events in SQLite (WAL mode) |
| `system.py` | Host and live GPU telemetry from the NVIDIA driver |
| `main.py` | REST API and SSE |

**API (excerpt)**

```http
GET  /api/v1/overview                         workspace summary
GET  /api/v1/models?collection=&q=&kind=&sort= catalog search
GET  /api/v1/models/{c}/{n}/analysis           profile + health
GET  /api/v1/models/{c}/{n}/fingerprint        SHA-256
POST /api/v1/models                            upload MPS (validated, 200 MB limit)
POST /api/v1/models/{c}/{n}/runs               start a run
GET  /api/v1/runs/{id}/events                  SSE stream, resumes from Last-Event-ID
POST /api/v1/runs/{id}/cancel                  stop a run
GET  /api/v1/runs/{id}/passport                optimization passport
GET  /api/v1/runs/{id}/evidence                evidence bundle (zip)
GET  /api/v1/system/gpu                        live GPU telemetry
```

---

## 10. Web platform (frontend)

Location: `frontend/`. Next.js (App Router), React, TypeScript, Tailwind CSS, TanStack Query, Motion,
React Three Fiber, ECharts and Radix UI. The theme is dark glass with saffron, violet and cyan
gradients.

| Screen | What it does |
|---|---|
| **Landing** | Interactive 3D hero: an LP polytope with the simplex path walking vertex to vertex to the optimum (drag to rotate); live counters; animated pipeline, passport and benchmark sections |
| **Overview** | Catalog totals, runs, recent runs, compute summary |
| **Models** | Search and filter 840 models across collections; drag-and-drop MPS upload |
| **Model Studio** | Hover-inspectable sparsity plot, constraint and variable breakdown, coefficient histogram, health scorecard, run history, *Solve* dialog |
| **Run Center** | Live objective and infeasibility charts, decision-budget table, event timeline, numerics (scaling, numerical events), GPU tab, passport and verification checks, evidence download, stop and re-solve |
| **Benchmark Lab** | Suites with published references, relative error, verification, shifted geometric mean, one-click suite runs |
| **GPU Observatory** | Live utilization, memory, power, temperature and clocks of the GPU |

Accessibility: keyboard focus, labelled inputs, error and empty states, skeleton loaders, and
reduced-motion support that renders content without animation.

---

## 11. Integrations: C API, CLI, Python, PuLP

```bash
# Command line
sovopt solve refinery.mps --time-limit 60 --solution plan.sol --events

# Python
python -m sovopt solve refinery.mps
```

```python
import sovopt
model = sovopt.Model.read_mps("refinery.mps")
result = model.solve(time_limit=60, on_event=print)
model.write_solution("plan.sol")
```

**PuLP, a one-line switch for existing models:**

```python
from sovopt.pulp_solver import SOVOPT
prob.solve(SOVOPT(time_limit=60))
```

On a crude-blending test the PuLP adapter returns the same plan and the same sulfur-constraint dual
(−1.6875) as HiGHS.

---

## 12. Industrial model: refinery planning

`models/refinery/generate.py` builds a three-period refinery planning LP from textbook structure with
illustrative data:

- **Crude selection:** Arab Light, Basrah, Bombay High, Urals and WTI, each with cost, availability and
  sulfur content.
- **CDU yields:** LPG, naphtha, kerosene, diesel and residue.
- **Blending:** PETROL, ATF, HSD and FO with **sulfur specifications**, linearized through
  crude-of-origin routing so the model stays an LP without pooling nonlinearity.
- **Demand** windows (ranged rows), **inventory** carry-over with tank limits and holding cost.
- Annotation sidecar mapping rows and columns to business groups (CDU capacity, sulfur spec, sales,
  inventory) for constraint lineage.

**Result:** 138 rows, 156 columns, 580 nonzeros, optimal margin **4729.5** in 223 iterations and
3 ms, certified by the verifier, identical to HiGHS.

---

## 13. Benchmarks and results

### 13.1 Netlib LP (same machine, 300 s limit)

| Model | Rows × Cols | Published optimum | SOV-OPT | Verifier | SOV-OPT time | HiGHS time |
|---|---|---|---|---|---|---|
| AFIRO | 27 × 32 | −464.75314286 | −464.753142857 | Optimality proved | < 0.01 s | < 0.01 s |
| ADLITTLE | 56 × 97 | 225494.96316 | 225494.963162 | Optimality proved | < 0.01 s | < 0.01 s |
| BLEND | 74 × 83 | −30.812149846 | −30.8121498458 | Optimality proved | < 0.01 s | < 0.01 s |
| DEGEN2 | 444 × 534 | −1435.178 | −1435.178 | Optimality proved | 0.20 s | 0.01 s |
| DEGEN3 | 1503 × 1818 | −987.294 | −987.294 | Optimality proved | 8.0 s | 0.10 s |
| PEROLD | 625 × 1376 | −9380.7552782 | −9380.75527824 | Optimality proved | 0.9 s | 0.04 s |
| PILOT | 1441 × 3652 | −557.48972928 | −557.489729284 | Optimality proved | 19.1 s | 0.60 s |
| GREENBEA | 2392 × 5405 | −72555248.13 | in progress (sparse LU phase) | — | — | 0.14 s |

Every certified result matches the published Netlib value to at least 9 significant digits, and each
certificate has an exact duality gap between 1e-16 and 1e-15.

### 13.2 Algorithm evolution (measured)

| Build | Netlib certified | PILOT iterations | PILOT time |
|---|---|---|---|
| Dantzig pricing | 5 / 8 | 15,071 | 25.1 s |
| + bound perturbation, cleanup pass | 7 / 8 | 15,269 | 26.7 s |
| + Devex pricing | 7 / 8 | 10,814 | 18.9 s |

### 13.3 Industrial and adapter results

| Test | SOV-OPT | HiGHS |
|---|---|---|
| Refinery planning LP (margin, ₹ thousand) | 4729.5 | 4729.5 |
| PuLP crude blend (cost) | 6251.25 | 6251.25 |
| PuLP sulfur dual | −1.6875 | −1.6875 |

Reproduce with `python bench/runner/run_suite.py --suite netlib`.

---

## 14. Testing and quality assurance

`python scripts/check_all.py` runs every check and prints one summary (8 of 8 passing):

| Suite | Contents |
|---|---|
| C++ unit tests (GoogleTest, 12) | MPS reader, RANGES semantics, markers and constants, error handling, optimal / max-sense / infeasible / unbounded / free-variable LPs, strong duality |
| API tests (pytest) | health, catalog counts, search, reference statuses, measured analysis, native run verified optimal, SSE stream and resume, passport and evidence, cancellation, upload validation, infeasible models, configuration validation |
| Verifier tests | certifies a known optimum; rejects infeasible points, wrong objectives and sub-optimal duals |
| Binding tests | Python solve with events, read errors, PuLP adapter against the known optimum |
| Netlib regression | five models must match the published optimum and be certified |
| Frontend | TypeScript type-check, ESLint, production build |

Continuous integration (GitHub Actions) builds the C++ core and runs its tests on Ubuntu, including an
AddressSanitizer / UndefinedBehaviorSanitizer build.

---

## 15. Deployment

**Profile A: single site (default).** `docker compose -f deploy/docker-compose.yml up --build` starts
the API with the native core and verifier, and the web workspace. Benchmarks are mounted read-only;
runs and uploads persist in a volume. It needs no internet access at runtime.

**Local development**

```bash
pip install ziglang cmake ninja            # compiler toolchain, no admin rights needed
cmake --preset release-zig && cmake --build --preset release-zig
cd backend && pip install -r requirements.txt && uvicorn app.main:app --port 8000
cd frontend && npm install && npm run dev  # http://localhost:3000
```

**Profile B: research lab.** Multiple solver workers, shared artifact store, benchmark workers,
Prometheus and Grafana.

**Profile C: industrial on-premise.** Private network, OIDC single sign-on, mTLS, role-based access,
PostgreSQL HA, MinIO artifact store, GPU and CPU clusters, signed images and SBOM.

---

## 16. Technology stack

| Layer | Technologies |
|---|---|
| Solver core | C++20, CMake, Ninja, custom sparse structures, LU, simplex |
| GPU | CUDA, NVIDIA driver telemetry (NVML via nvidia-smi) |
| Verification | Python, exact rational arithmetic (`fractions`) |
| Control plane | Python, FastAPI, Pydantic, SQLite (WAL), Server-Sent Events |
| Bindings | C ABI, ctypes, PuLP 4 adapter |
| Frontend | Next.js App Router, React 19, TypeScript, Tailwind CSS 4, TanStack Query, Motion, Three.js / React Three Fiber, ECharts, Radix UI |
| Testing | GoogleTest, pytest, ESLint, TypeScript, sanitizers |
| DevOps | Docker, Docker Compose, GitHub Actions |
| Benchmark data | Netlib LP, MIPLIB 2017, Maros-Meszaros, QPLIB, Mittelmann |

---

## 17. Engine roadmap: MILP, QP and GPU

The platform already accepts, profiles and streams MILP and QP runs end to end. The engines behind
them are delivered in phases on the same C API and event contract, so the platform needs no changes as
each engine lands.

| Phase | Deliverable | Key techniques | Exit criterion |
|---|---|---|---|
| **P1** | Sparse LU | Markowitz pivoting, threshold partial pivoting, Forrest-Tomlin update, hyper-sparse FTRAN/BTRAN | GREENBEA and the full 94-model Netlib set certified |
| **P2** | Dual simplex and presolve | Dual steepest edge, bound flipping ratio test, reversible presolve with postsolve stack, warm starts | Kennington LPs; warm re-solve in < 10 % of cold iterations |
| **P3** | MILP branch-and-cut | Reliability branching, best-bound/depth-first hybrid, Gomory / MIR / cover / clique / flow-cover cuts, feasibility pump, RINS, diving, parallel deterministic tree search | 30–50 MIPLIB 2017 instances to ≤ 0.01 % gap |
| **P4** | Interior point and QP | AMD ordering, supernodal Cholesky, Mehrotra predictor-corrector, crossover, convex QP | Maros-Meszaros and QPLIB convex sets |
| **P5** | GPU acceleration | PDLP (restarted PDHG) with custom CUDA SpMV, CUDA Graphs, GPU feasibility-jump heuristics, batched LP for strong branching | Measured speed-up over CPU on large Mittelmann LPs |

---

## 18. Future scope and expansion

### 18.1 Solver capabilities

- **MIQP, NLP and MINLP** on the same modular core (outer approximation, spatial branch-and-bound).
- **Multi-GPU and cluster** solving, with Slurm integration for research deployments.
- **Mixed precision** on GPUs with iterative refinement to full accuracy.
- **Exact MILP certificates** in the VIPR format for independently proven optimality.
- **Decomposition** (Benders, Dantzig-Wolfe) for multi-period and multi-site planning.

### 18.2 Decision intelligence

- **Decision Stability Map:** perturb crude prices, demand and capacities, then warm-start re-solves
  to show how fragile a plan is.
- **Adversarial Stress Lab:** search for the most damaging perturbation within an uncertainty budget.
- **Reoptimization State Graph:** show which parts of yesterday's solve (basis, cuts, incumbent)
  remain mathematically valid after a model change.
- **Alternative Decision Sets:** diverse near-optimal plans (lower energy, lower crude exposure)
  within a chosen objective tolerance.
- **Constraint-to-KPI lineage:** trace margin to the constraints that bind it, using the annotation
  sidecar already built for the refinery model.
- **Robust and stochastic optimization:** CVaR and distributionally robust formulations for price and
  equipment uncertainty.

### 18.3 Industrial expansion

| Sector | Applications |
|---|---|
| Refining and petrochemicals | crude selection, blending with pooling, refinery scheduling, turnaround planning |
| Power | unit commitment, economic dispatch, renewable integration |
| Logistics | vehicle routing, rake and port scheduling, network design |
| Manufacturing | production planning, lot sizing, shop-floor scheduling |
| Public sector | railway timetabling, defence logistics, water distribution |

### 18.4 Platform and ecosystem

- Pyomo, JuMP and CVXPY adapters alongside PuLP; LP-format and `.qplib` readers.
- OIDC single sign-on, role-based access, PostgreSQL, Redis Streams and MinIO for multi-user sites.
- An open, national benchmark suite of Indian industrial models.
- Academic partnerships (IITs, IISc) for algorithm research and teaching.
- Commercial support model for PSUs, with the core kept open and sovereign.

---

## 19. Impact and benefits

| Area | Impact |
|---|---|
| Sovereignty | Planning for refining, power and logistics runs on an Indian solver core |
| Cost | Recurring commercial licence fees replaced by a one-time owned deployment |
| Trust | Every optimum is re-checked in exact arithmetic and sealed in a passport |
| Transparency | Engineers can read, modify and extend every algorithm |
| Robustness | Degenerate and ill-conditioned models are handled explicitly and visibly |
| Speed to decision | Decision Budget mode returns the best verified plan within a time limit, with the gap reported |
| Capability | A reusable foundation for Indian optimization research, teaching and strategic applications |

---

## 20. Feasibility and viability

**Technical.** The core runs today on a laptop with an RTX 5050 GPU, and it certifies seven classic
Netlib models, including the notoriously degenerate and ill-conditioned ones, at the published optimum.

**Operational.** One host with Docker Compose; no internet access required; standard MPS input means
existing CPLEX, Gurobi and Xpress models load unchanged.

**Economic (indicative, one site).**

| Item | Estimate |
|---|---|
| GPU workstation | ₹3–4.5 lakh |
| Integration | ₹1–1.5 lakh |
| Storage | ₹40–60 thousand |
| Support per year | ₹60 thousand–1 lakh |
| Solver licence per seat | ₹0 |

**Viability.** Aligned with Atmanirbhar Bharat; nothing to retrain for planners who already write MPS;
each additional plant is a copy of the same deployment.

---

## 21. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Degenerate models stall the simplex | Bound and cost perturbation, Bland fallback, measured on DEGEN2/DEGEN3 |
| Ill-conditioned matrices give wrong answers | Power-of-two scaling, Harris ratio test, refactorization on small pivots, and an exact verifier that catches any error |
| Weak MILP relaxations | Big-M detection today; cuts and big-M tightening in the MILP phase |
| Trusting solver output | Independent exact-rational verifier and passport on every run |
| Performance gap to mature solvers | Published side-by-side benchmarks; sparse LU, dual simplex and GPU phases target the gap |
| Adoption friction | MPS input, PuLP one-line switch, web workspace for planners |

---

## 22. References

1. A. Koberstein, *The Dual Simplex Method, Techniques for a Fast and Stable Implementation*, PhD thesis, Universität Paderborn, 2005.
2. E. D. Andersen, K. D. Andersen, "Presolving in linear programming", *Mathematical Programming* 71, 1995.
3. S. Mehrotra, "On the implementation of a primal-dual interior point method", *SIAM J. Optimization* 2(4), 1992.
4. D. Applegate et al., "Practical large-scale linear programming using primal-dual hybrid gradient", NeurIPS 2021.
5. T. Achterberg, *Constraint Integer Programming*, PhD thesis, TU Berlin, 2007.
6. A. Gleixner et al., "MIPLIB 2017: data-driven compilation of the 6th Mixed-Integer Programming Library", *Mathematical Programming Computation*, 2021.
7. E. D. Dolan, J. J. Moré, "Benchmarking optimization software with performance profiles", *Mathematical Programming* 91, 2002.
8. K. Cheung, A. Gleixner, D. Steffy, "Verifying integer programming results", IPCO 2017.
9. P. M. J. Harris, "Pivot selection methods of the Devex LP code", *Mathematical Programming* 5, 1973.
10. I. Maros, C. Mészáros, "A repository of convex quadratic programming problems", *Optimization Methods and Software*, 1999.
11. Netlib LP test set, https://www.netlib.org/lp/; MIPLIB 2017, https://miplib.zib.de; QPLIB, https://qplib.zib.de; H. Mittelmann, Benchmarks for Optimization Software, https://plato.asu.edu/bench.html.

---

## 23. Appendix: repository map and commands

```text
solver/          C++20 core: model, MPS reader, basis factorization, primal simplex, C API, tests
cli/             sovopt command-line tool
bindings/python  Python module (python -m sovopt) and PuLP adapter
verifier/        independent exact-rational verifier
bench/           benchmark harness and published reports
backend/         FastAPI control plane, profiler, run engine, tests
frontend/        Next.js workspace
models/          refinery planning model generator and annotations
deploy/          Docker Compose and Dockerfiles
scripts/         check_all.py
docs/            task plans, datasets, status, this report
```

| Task | Command |
|---|---|
| Build the core | `cmake --preset release-zig && cmake --build --preset release-zig` |
| Solve a model | `PYTHONPATH=bindings/python python -m sovopt solve model.mps` |
| Verify a solution | `python verifier/verify.py model.mps model.sol` |
| Benchmark vs HiGHS | `python bench/runner/run_suite.py --suite netlib` |
| Run every check | `python scripts/check_all.py` |
| Start the API | `cd backend && uvicorn app.main:app --port 8000` |
| Start the web app | `cd frontend && npm run dev` |
