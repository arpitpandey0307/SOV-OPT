# T3 — Interior Point, QP and GPU Acceleration

**Status:** Not started · **Phase:** P1 (Cholesky) → P4 · **Depends on:** T1 sparse structures, presolve, model

---

## 1. Goal

1. Provide an **interior-point method** for large LPs and **convex QP**.
2. Deliver **measurable** GPU acceleration — only where the GPU actually wins.

> Honest positioning: simplex is inherently sequential; we do **not** claim a GPU simplex.
> GPU acceleration targets first-order LP (PDLP), MIP primal heuristics and batched work.

---

## 2. Scope

### 2.1 Sparse Cholesky / LDLᵀ (own implementation)
- **AMD ordering** (approximate minimum degree) — own implementation
- Elimination tree, symbolic factorization, supernodal numeric factorization
- Regularization (primal/dual) + dynamic pivot handling for near-singular systems
- Dense column handling (split / Schur complement)

### 2.2 Interior Point Method (LP + convex QP)
- Homogeneous self-dual or standard infeasible primal-dual formulation
- **Mehrotra predictor-corrector** + Gondzio multiple centrality correctors
- Normal equations (LP) and augmented system / quasi-definite KKT (QP)
- Convergence: relative primal/dual residual + gap ≤ 1e-8
- Infeasibility detection via homogeneous embedding

### 2.3 Crossover
- IPM solution → vertex basis (primal + dual push) → T1 primal/dual simplex cleanup
- Needed for warm-start, B&B, sensitivity (shadow prices) and exact dual values

### 2.4 QP Support
- MPS QMATRIX / QUADOBJ sections parsed (extend T1 reader)
- Convexity check (Cholesky attempt on Q); non-convex → rejected with clear status
- Active-set warm-start (stretch)

### 2.5 GPU — PDLP (Primal-Dual Hybrid Gradient for LP)
- Restarted, adaptive-step PDHG with diagonal preconditioning (Ruiz + Pock-Chambolle)
- **Own CUDA kernels:** CSR SpMV, SpMVᵀ, fused axpy/projection, block reductions
- CUDA streams, pinned host memory, async copies, stream-ordered memory pool
- **CUDA Graphs** capture of the inner iteration loop (SpMV → reduction → residual → projection)
- Feasibility polishing → crossover to T1 for high-accuracy / basic solution
- FP64 default; mixed-precision experiment as research item

### 2.6 GPU — MIP Primal Heuristics (feeds T2)
- **Feasibility Jump** (weighted local search, massively parallel)
- **Parallel fix-and-propagate** with many random orderings
- Async: runs concurrently with CPU tree search, pushes incumbents into shared pool

### 2.7 GPU — Batched LP (stretch)
- Solve many small LPs in parallel (strong branching candidates, scenario sweeps for T5 Stability Map)

### 2.8 Adaptive Dispatcher
Rules based on measurable model features:

| Feature | Route |
|---------|-------|
| Small / medium LP, needs basis | Dual simplex (T1) |
| Large sparse LP, moderate accuracy OK | GPU PDLP → crossover |
| Large LP, dense-ish Cholesky feasible | IPM → crossover |
| Convex QP | IPM |
| MILP | T2 B&B + concurrent GPU heuristics |

Decision + reason logged as a `SOLVER_DECISION` event (shown in Run Center).

### 2.9 GPU Telemetry
Kernel times, H→D / D→H transfer time, VRAM, utilization (NVML) → `GPU_METRIC` events → GPU Observatory (T5).

---

## 3. Deliverables

```text
solver/src/
├── linalg/cholesky/     amd, etree, symbolic, supernodal
├── ipm/                 mehrotra, kkt, homogeneous, crossover
├── qp/                  qp_model, convexity_check
├── gpu/
│   ├── kernels/         spmv.cu, reductions.cu, projections.cu
│   ├── pdlp/            pdlp.cu, restarts, preconditioning
│   ├── heuristics/      feasibility_jump.cu, fix_propagate.cu
│   ├── runtime/         streams, memory_pool, graph_cache
│   └── telemetry/       nvml_probe
└── dispatch/            adaptive_dispatcher
```
Build flag: `-DSOVOPT_ENABLE_CUDA=ON/OFF` — solver must build and pass tests with CUDA off.

---

## 4. Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| PDLP low accuracy (1e-4 – 1e-6) | Polishing + crossover; report accuracy honestly |
| Cholesky breakdown on ill-conditioned KKT | Regularization + iterative refinement |
| GPU slower than CPU on small models | Dispatcher threshold; benchmark shows crossover point |
| CUDA on Windows friction | Develop on Linux / WSL2 |
| Claims unverifiable | Every GPU number reproduced by T4 harness, Nsight traces saved as evidence |

---

## 5. Exit Criteria

- [ ] IPM solves Netlib to 1e-8 (with crossover, matches T1 objectives)
- [ ] **QPLIB convex subset** + Maros-Mészáros QP set: ≥ 80% solved, verified
- [ ] GPU PDLP on large Mittelmann LPs: **measured speedup vs own CPU IPM**, with crossover-point chart
- [ ] GPU heuristics find first incumbent faster than CPU-only on ≥ 30% of MIPLIB subset
- [ ] Solver builds and passes all tests with `SOVOPT_ENABLE_CUDA=OFF`
- [ ] GPU Observatory data available for every GPU run

---

## 6. References

- Mehrotra, *On the Implementation of a Primal-Dual Interior Point Method* (1992)
- Gondzio, *Multiple centrality corrections in a primal-dual method for LP* (1996)
- Amestoy, Davis, Duff, *An Approximate Minimum Degree Ordering Algorithm* (1996)
- Applegate et al., *Practical Large-Scale LP using Primal-Dual Hybrid Gradient* (PDLP, 2021)
- Lu & Yang, *cuPDLP.jl: A GPU Implementation of Restarted PDHG for LP* (2023)
- Luteberget & Sartor, *Feasibility Jump* (2023)
- Maros & Mészáros, *A Repository of Convex QP Problems* (1999)
