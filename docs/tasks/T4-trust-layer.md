# T4 — Trust Layer (Verification, Benchmarks, Evidence)

**Status:** Not started · **Phase:** Starts **Day 1**, runs continuously · **Depends on:** nothing (it tests everyone else)

---

## 1. Goal

Make every claim SOV-OPT makes **independently checkable**:
- Every answer is verified by code that does not share the solver's logic.
- Every performance claim is reproducible by a script.
- No commit can silently break a previously solved instance.

> Without T4, the team cannot tell whether a change helped or quietly broke correctness —
> and evaluators have no reason to believe the benchmark table.

---

## 2. Scope

### 2.1 Independent Verifier
Separate executable/library; reads original MPS + solution file. **Does not link solver code.**

| Check | Precision |
|-------|-----------|
| Primal feasibility (rows, bounds) — max abs/rel violation | long double; exact rational (optional mode) |
| Integrality of integer variables | tolerance 1e-6 |
| Objective recomputation | long double |
| LP: dual feasibility, reduced cost signs, complementary slackness | long double |
| LP: duality gap | long double |
| Infeasibility: Farkas certificate validity | long double / rational |
| Unboundedness: primal ray validity | long double |

Verdicts: `OPTIMALITY_PROVED` (LP with valid duals), `FEASIBLE_VERIFIED`, `BOUND_REPORTED` (MIP bound from solver, not independently proven), `INFEASIBILITY_PROVED`, `FAILED(reason)`.

> MIP optimality proof checking (VIPR certificate format) is a stretch goal — until then the
> verifier never claims to have proven a MIP bound.

### 2.2 Benchmark Harness
- Dataset fetchers with checksums: **Netlib LP**, **Netlib infeas**, **Kennington**, **MIPLIB 2017** (curated subset), **QPLIB** (convex), **Maros-Mészáros**, **Mittelmann** LP instances
- Runner: SOV-OPT vs **HiGHS** (external binary only) on identical hardware, time limits, thread counts
- Metrics:
  - solved / failed / wrong / timeout counts
  - **Shifted geometric mean** runtime (shift = 10 s, Mittelmann convention)
  - **Performance profiles** (Dolan–Moré)
  - MIP: primal integral, time to gap thresholds
- Output: Parquet/CSV + auto-generated Markdown/HTML report

### 2.3 Continuous Regression (CI)
- Tier 1 (every commit, < 5 min): unit tests + 20 small Netlib + 5 small MIPs
- Tier 2 (nightly): full Netlib + MIPLIB subset + QP sets
- Any instance that goes from solved → wrong/failed **blocks merge**
- Sanitizers: ASan, UBSan builds in CI; `compute-sanitizer` for CUDA kernels

### 2.4 Delta Debugger (Self-Auditing Solver)
- Input: failing instance + config
- Iteratively removes rows/columns/bounds while failure persists
- Output bundle: `failure_<date>.mps`, `failure_config.json`, `failure_trace.json`, `failure_environment.json`
- Minimal instance auto-added to regression suite

### 2.5 Numerical Stress Suite
Deliberately hard instances for the "robustness demonstration" the PS asks for:
- Highly degenerate (e.g. Netlib `degen*`, `pilot*`, `greenbea`)
- Ill-conditioned (coefficient range ≥ 1e9, e.g. `pilot87`, `perold`)
- Weak LP relaxation / big-M MIPs
- Generated families with controllable condition number

### 2.6 Optimization Passport + Evidence Bundle
```json
{
  "model_hash": "sha256:...",
  "solver_version": "0.x.y",
  "git_commit": "...",
  "build_flags": {"cuda": true, "cusparse": false},
  "hardware": {"cpu": "...", "gpu": "...", "cuda": "..."},
  "configuration_hash": "sha256:...",
  "random_seed": 42,
  "deterministic": true,
  "objective": 0.0,
  "bound": 0.0,
  "gap": 0.0,
  "verification": {"verdict": "FEASIBLE_VERIFIED", "max_primal_violation": 0.0},
  "timestamp": "...",
  "artifact_hashes": {"solution": "...", "trace": "...", "presolve_log": "..."}
}
```
Bundle: `run.evidence.zip` = passport + model + solution + event trace + presolve log + verifier report.
Optional: sign passport with Ed25519 key.

### 2.7 Replay
- `sovopt replay run.evidence.zip` re-runs with the same config/seed and diffs results

---

## 3. Deliverables

```text
verifier/           standalone C++ verifier (no solver linkage)
bench/
├── datasets/       fetch scripts + checksums (data not committed)
├── runner/         run_suite.py, adapters/{sovopt,highs}.py
├── analysis/       sgm.py, perf_profile.py, report.py
└── reports/        generated
tools/delta_debug/
tools/passport/
.github/workflows/  ci-tier1.yml, nightly-tier2.yml
```

---

## 4. Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Verifier shares a bug with solver | Separate codebase, separate parser, different precision |
| Unfair benchmark accusations | Same machine, same limits, publish scripts + raw logs |
| Dataset licensing | Fetch from official sources, do not redistribute |
| CI too slow | Tiered suites |

---

## 5. Exit Criteria

- [ ] Verifier + Netlib harness running **before** first simplex iteration exists
- [ ] HiGHS baseline results stored for all suites
- [ ] CI blocks regressions
- [ ] Delta debugger reduces a known failing case to < 10% of original size
- [ ] Every T5 run produces a passport + evidence bundle
- [ ] Final benchmark report generated by one command

---

## 6. References

- Dolan & Moré, *Benchmarking optimization software with performance profiles* (2002)
- Mittelmann, *Benchmarks for Optimization Software* — plato.asu.edu/bench.html
- Cheung, Gleixner, Steffy, *Verifying Integer Programming Results* (VIPR, 2017)
- Zeller, *Simplifying and Isolating Failure-Inducing Input* (delta debugging, 2002)
