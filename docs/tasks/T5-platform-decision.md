# T5 — Platform + Decision Layer

**Status:** Not started · **Phase:** P1 skeleton → P4 · **Depends on:** frozen C API (T1), telemetry callbacks (T2/T3), passport (T4)

---

## 1. Goal

Turn the solver into something an MRPL planner and an SIH evaluator can **see, trust and use**:
upload a model → understand its health → solve with live telemetry → verify → stress-test → export evidence.

> Principle: the web app **controls** optimization jobs; it never performs the optimization.

---

## 2. Architecture (Profile A — SIH Demo)

```text
Browser (Next.js)
   │  REST (commands)          ▲ SSE (telemetry, resumable)
   ▼                           │
FastAPI (modular monolith) ────┘
   │            │
   │            ├── PostgreSQL   (metadata)
   │            └── ArtifactStore (local FS dev / MinIO demo)
   ▼
Redis Streams  (jobs + run events)
   │
   ▼
Solver Worker (Python process → pybind11 → libsovopt C API)
   └── solver callbacks → XADD run:{id}:events
```

All in **Docker Compose**. Worker has CPU/RAM/time limits, network disabled, read-only base FS.

---

## 3. Scope

### 3.1 Solver Integration Surface
- **C API** (`sovopt.h`): create model, load MPS, set params, solve, callbacks, get solution/basis, write evidence
- **CLI**: `sovopt solve | verify | bench | replay`
- **Python module** `sovopt` (pybind11)
- **Pyomo + PuLP adapters** (write MPS → call sovopt → map solution back) — high industry value

### 3.2 Backend (FastAPI)
Modules: `models`, `runs`, `scenarios`, `benchmarks`, `evidence`, `telemetry`, `artifacts`, `auth`

| Endpoint group | Key routes |
|----------------|------------|
| Models | `POST /api/v1/models`, `GET /models/{id}`, `/health`, `/presolve-log`, `/lineage` |
| Runs | `POST /models/{id}/runs`, `GET /runs/{id}`, `POST /runs/{id}/cancel`, `/reoptimize` |
| Telemetry | `GET /runs/{id}/events` (SSE, `Last-Event-ID` replay from Redis Stream) |
| Scenarios | `POST /models/{id}/scenarios`, `GET /scenarios/{id}/results` |
| Evidence | `GET /runs/{id}/evidence`, `/passport` |
| Benchmarks | `GET /benchmarks`, `GET /benchmarks/{id}/results` |

Auth: JWT + local RBAC (admin / engineer / viewer). OIDC is roadmap.

### 3.3 Database (PostgreSQL)
`users, projects, models, model_versions, solver_runs, run_metrics_summary, scenarios,
scenario_runs, benchmark_suites, benchmark_runs, verification_results, evidence_bundles, audit_logs`

Large data (matrices, solutions, traces) → ArtifactStore; Postgres holds hashes + metadata only.

### 3.4 Frontend (Next.js App Router)
| Screen | Content |
|--------|---------|
| **Model Studio** | Upload MPS; stats (vars, rows, nnz, sparsity); sparsity plot; coefficient-range heatmap; **Model Health Scorecard** (every score shows its underlying statistic) |
| **Run Center** | Live objective / bound / gap chart; **Optimization Timeline** (event list); B&B aggregate tree (depth histogram, pruned/open counts); solver decisions |
| **GPU Observatory** | Kernel time, transfers, VRAM, utilization, CPU vs GPU phase comparison |
| **Benchmark Lab** | Performance profiles, SGM table vs HiGHS, per-instance drill-down |
| **Evidence** | Passport view, verifier report, download `evidence.zip`, replay button |

Server Components for metadata pages; Client Components only for live charts / graphs.
State: TanStack Query (server) · Zustand (UI) · URL params (run/model/tab).

### 3.5 The Five Differentiating Features (kept)

| # | Feature | Built on |
|---|---------|----------|
| 1 | **Proof-Carrying Presolve Viewer** — each reduction with derivation rows, status `MATHEMATICALLY_VERIFIED` only if derived, never for heuristic big-M | T1 postsolve log |
| 2 | **Reoptimization State Graph** — model v1 → v2 diff; basis / cuts / incumbent marked REUSABLE / INVALIDATED / RECHECK with reason | T1 warm-start API, T2 cut pool, T4 verifier |
| 3 | **Decision Stability Map** — perturb chosen parameters (crude price, demand, capacity) over a grid, warm-start re-solves, heatmap of objective degradation / feasibility / solution similarity | T1 warm-start, T3 batched LP (stretch) |
| 4 | **Optimization Passport** | T4 |
| 5 | **Constraint Lineage + KPI Impact** — via annotation sidecar (`model.annotations.json` mapping row/col groups to business entities); shows binding status, slack, shadow price (LP / fixed-MIP only) | T1 duals, annotation file |

Plus **Decision Budget Mode** (cheap win): run with time budget, show time-to-feasible / time-to-gap table from T2 events.

### 3.6 Industrial Demo Models (built by the team, documented, open-literature based)
1. **Crude blending LP** — crude selection, quality specs (sulfur, API), linearized pooling
2. **Multi-period production planning** — CDU/FCC/reformer capacities, inventory, demand
3. **Refinery scheduling MILP** — tank/unit assignment, big-M sequencing (deliberately weak relaxation)
4. **Supply-chain network design MILP** — depots, fixed-charge flows

Each comes with an annotation sidecar so Constraint Lineage works on it.

---

## 4. Deliverables

```text
backend/     FastAPI app (modules above), alembic/, worker/
frontend/    Next.js app (app/(platform)/{dashboard,models,runs,benchmarks,evidence})
bindings/    python/ (pybind11), pyomo_plugin/, pulp_plugin/
models/      refinery demo models + annotations
deploy/      docker-compose.yml, Dockerfiles
```

---

## 5. Explicitly Deferred (Profile C roadmap)

Kubernetes, Helm, Slurm, Keycloak/OIDC, mTLS, PostgreSQL RLS, gRPC, Adversarial Stress Lab,
multi-tenant organizations, OpenTelemetry/Grafana (add only if time permits).

---

## 6. Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| UI work eats solver time | Max 2 members; frontend builds against mocked event stream first |
| Solver crash kills API | Worker is separate process; supervisor restarts; run marked FAILED |
| Telemetry floods browser | Throttle NODE_UPDATE to ~5 Hz server-side |
| Untrusted MPS upload | Size limits, parser fuzzing (T4), sandboxed worker |
| Lineage looks fake | Only shown on annotated models; clearly labelled |

---

## 7. Exit Criteria

- [ ] `docker compose up` brings the whole stack up on one GPU machine
- [ ] Upload MPS → health report → run → live chart → verified result → evidence.zip, end to end
- [ ] Browser refresh mid-run replays missed events
- [ ] Pyomo model solved via SOV-OPT with a one-line solver change
- [ ] All 4 refinery demo models solved + verified; Stability Map and Lineage demoed on at least one
- [ ] Benchmark Lab renders T4 report

---

## 8. Demo Script (target 8 minutes)

1. Upload refinery scheduling MILP → Model Health flags big-M + coefficient range
2. Presolve viewer: big-M tightened with derivation
3. Solve with 30 s Decision Budget → live gap closing, GPU heuristic finds first incumbent
4. Verifier: `FEASIBLE_VERIFIED`, passport generated
5. Change crude price → reoptimize → state graph shows reused basis, invalidated cuts
6. Stability map across crude price × demand
7. Benchmark Lab: Netlib / MIPLIB vs HiGHS, numerical stress suite results
