# T1 — Core LP Engine (CPU)

**Status:** Not started · **Phase:** P1–P2 · **Critical path:** Yes (T2, T3 crossover and T5 all depend on it)

---

## 1. Goal

Build a numerically robust, from-scratch sparse LP solver whose **dual simplex** is fast and
stable enough to serve as the node solver for branch-and-bound (T2).

---

## 2. Scope

### 2.1 Model & I/O
- Internal model: `c`, `A` (CSC + CSR), `row_lower/row_upper`, `col_lower/col_upper`, integrality flags, names
- **MPS parser** (fixed + free format, RANGES, BOUNDS incl. MI/PL/BV/LI/UI/FR, OBJSENSE)
- **LP-format parser** (CPLEX LP subset)
- Solution writer (primal values, duals, reduced costs, basis status)

### 2.2 Sparse Linear Algebra
- CSC/CSR containers, transpose, SpMV, sparse vector (index + dense workspace, "hyper-sparse" aware)
- **Sparse LU factorization**
  - Markowitz pivot selection with threshold partial pivoting (u ≈ 0.1)
  - Singleton-first triangularization (bump reduction)
  - FTRAN / BTRAN with hyper-sparse solves
- **Basis update:** Forrest–Tomlin (preferred) or product-form eta file
- Refactorization triggers: update count, fill growth, numerical error check

### 2.3 Presolve (with reversible postsolve stack)
Every reduction is pushed onto a log so it can be undone **and** shown as evidence (feeds T5 "Proof-Carrying Presolve").

| Reduction | Notes |
|-----------|-------|
| Empty / singleton rows | Convert to bounds |
| Singleton columns (free / implied free) | Substitute out |
| Fixed variables | Remove, adjust RHS |
| Duplicate rows / columns | Hash-based detection |
| Dominated columns | Via reduced-cost bounds |
| Bound tightening (activity-based) | Record derivation rows |
| Doubleton equations | Substitution |

### 2.4 Scaling
- Geometric-mean scaling (iterative, row/col) + final equilibration
- Report coefficient range before/after (feeds Model Health Scorecard)

### 2.5 Simplex
- **Dual simplex** (primary)
  - Dual steepest-edge pricing (Devex fallback)
  - Bound-flipping ratio test (long-step)
  - Harris two-pass ratio test with tolerances
  - Cost perturbation for dual degeneracy; removal + cleanup at end
  - Phase 1 via artificial bounding box / composite approach
- **Primal simplex** (cleanup + warm-start after column changes)
  - Devex / steepest-edge pricing, bound perturbation against primal degeneracy
- Iterative refinement of FTRAN/BTRAN results
- Crash basis (slack basis + triangular crash)
- Unboundedness and infeasibility detection with **Farkas certificates** (ray output → T4 verifier)

### 2.6 Warm-start API
- Get/set basis; change bounds / add rows / add columns / change costs without refactoring from scratch
- This is the API T2 uses at every B&B node

---

## 3. Deliverables

```text
solver/
├── include/sovopt/        public C API (sovopt.h)
├── src/core/              model, status codes, parameters
├── src/io/                mps_reader, lp_reader, solution_writer
├── src/linalg/            sparse_matrix, sparse_vector, lu, lu_update
├── src/presolve/          reductions, postsolve_stack
├── src/scaling/
├── src/simplex/           dual, primal, pricing, ratio_test, crash
└── tests/                 unit + numerical tests
cli/sovopt                 `sovopt solve model.mps --time-limit 60`
```

---

## 4. Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| LU instability → wrong answers | Threshold pivoting, residual checks after each refactor, auto tighten `u` |
| Cycling / stalling on degenerate LPs | Cost + bound perturbation, randomized tie-breaking |
| Tolerance mismatch (feasible in scaled space, infeasible in original) | Unscale → check → primal cleanup loop |
| Slow on hyper-sparse problems | Hyper-sparse FTRAN/BTRAN from the start, not retrofitted |
| Parser edge cases | Test against all 94 Netlib files on day one |

---

## 5. Exit Criteria

- [ ] All Netlib MPS files parse correctly
- [ ] **≥ 90 / 94 Netlib LPs** solved; objective matches reference to **1e-6 relative**
- [ ] Every solve passes the T4 independent verifier (primal/dual feasibility, gap)
- [ ] Infeasible Netlib set (`infeas/`) correctly detected with valid Farkas certificate
- [ ] Warm-start: re-solve after a bound change uses < 10% of cold iterations on test set
- [ ] Shifted geometric mean time reported vs HiGHS (target: within 10× in P2, 3× in P4)

---

## 6. Stretch

- Kennington LPs (`osa-60`, `pds-20`, `ken-18`)
- Parallel pricing (multi-core dual steepest edge)
- Dual simplex with multiple pricing (PAMI-style)

---

## 7. References

- Koberstein, *The Dual Simplex Method, Techniques for a Fast and Stable Implementation* (PhD thesis, 2005)
- Suhl & Suhl, *Computing Sparse LU Factorizations for Large-Scale LP* (1990)
- Forrest & Goldfarb, *Steepest-edge simplex algorithms* (1992)
- Andersen & Andersen, *Presolving in Linear Programming* (1995)
- Gondzio, *Presolve analysis of linear programs prior to applying an interior point method* (1997)
