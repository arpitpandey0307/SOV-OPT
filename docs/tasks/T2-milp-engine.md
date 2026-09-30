# T2 — MILP Engine (Branch-and-Cut)

**Status:** Not started · **Phase:** P2–P4 · **Depends on:** T1 dual simplex + warm-start API

---

## 1. Goal

Solve difficult mixed-integer problems — weak LP relaxations, big-M formulations, symmetry — to
proven optimality or a small gap, reliably. This is the capability MRPL's refinery scheduling and
planning models depend on most.

---

## 2. Scope

### 2.1 MIP Presolve (extends T1 presolve)
- Coefficient tightening (big-M reduction) — **derivation recorded**, never heuristic
- Probing on binaries (implications, fixings)
- Clique detection → clique table (used by cuts + propagation)
- Implied integer detection
- Dual fixing / dominated columns for integers

### 2.2 Tree Search
- Node = bound changes relative to parent (memory-light)
- LP warm-start from parent basis via T1 API
- **Domain propagation** at each node (activity-based bound propagation, clique propagation)
- **Node selection:** best-bound + depth-first plunging hybrid; best-estimate option
- **Branching:**
  - Most-infeasible (baseline)
  - Pseudocost branching
  - Strong branching (limited iterations)
  - **Reliability branching** (default)
- Pruning: bound, infeasibility, integrality
- Restarts after root if many fixings found

### 2.3 Cutting Planes (root + limited in-tree)
| Cut | Why it matters for MRPL |
|-----|------------------------|
| Gomory mixed-integer | General-purpose, strong at root |
| MIR / c-MIR | Most effective single family in practice |
| Knapsack cover (lifted) | Capacity constraints |
| Clique | Assignment / scheduling |
| Flow cover | Network / supply-chain / fixed-charge |
| Implied bound | Big-M links |

- Cut pool with efficacy, parallelism filtering, aging
- Numerical safety: reject cuts with bad dynamism / tiny coefficients

### 2.4 Primal Heuristics
| Heuristic | When |
|-----------|------|
| Simple / ZI rounding | Every node, cheap |
| Diving (fractional, coefficient, pseudocost, guided) | Periodically |
| Feasibility pump | Root, if no incumbent |
| RINS | After incumbent found |
| Local branching | Improvement phase |
| GPU feasibility jump / fix-and-propagate | From T3, async incumbent feed |

### 2.5 Parallelism
- Multi-threaded tree search (work queue of open nodes, shared incumbent + cut pool)
- **Deterministic mode:** synchronized node batches so the same seed = same tree
- Concurrent root: dual simplex vs IPM (T3) race

### 2.6 Solution Pool
- Keep top-K distinct incumbents
- Diversity-seeking mode within objective tolerance → feeds T5 **Alternative Decision Set**

### 2.7 Callbacks / Telemetry
Emit events: `INCUMBENT_FOUND`, `NODE_UPDATE` (nodes, open, bound, gap), `CUT_ROUND`,
`HEURISTIC_SUCCESS`, `NUMERICAL_EVENT` — consumed by T5 via the C API callback.

---

## 3. Deliverables

```text
solver/src/mip/
├── presolve/        probing, clique_table, coef_tightening
├── tree/            node, node_queue, branching, propagation
├── cuts/            gomory, mir, cover, clique, flowcover, cut_pool
├── heuristics/      rounding, diving, fpump, rins, local_branching
├── parallel/        scheduler, deterministic_sync
└── solution_pool/
```

---

## 4. Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Invalid cuts → wrong "optimal" answer | Every cut checked against known feasible debug solution in test mode; T4 verifier on every result |
| Node LP too slow | Warm-start discipline, limit refactors, iteration limits for strong branching |
| Tree explosion on weak relaxations | Invest in root: presolve + cuts + heuristics before branching |
| Non-determinism in parallel | Deterministic mode as a first-class feature, tested in CI |
| Memory growth | Diff-based node storage, node limit, disk spill optional |

---

## 5. Exit Criteria

- [ ] Curated **MIPLIB 2017 "easy" subset (30–50 instances)** solved to ≤ 0.01% gap
- [ ] Zero wrong answers (all verified by T4)
- [ ] Time-to-first-feasible, time-to-5%/1%/0.1% gap recorded per instance (Decision Budget data)
- [ ] Deterministic mode reproduces identical node counts across runs
- [ ] At least 2 of the refinery demo models (T5) solved with verified optimality
- [ ] Performance profile vs HiGHS published

---

## 6. Stretch

- Symmetry handling (orbital fixing)
- Conflict analysis
- Benders decomposition hook for multi-period planning
- MIQP (branch on T3 QP relaxations)

---

## 7. References

- Achterberg, *Constraint Integer Programming* (PhD thesis, 2007) — the SCIP design reference
- Achterberg, Koch, Martin, *Branching rules revisited* (2005)
- Marchand & Wolsey, *Aggregation and Mixed Integer Rounding to Solve MIPs* (2001)
- Fischetti, Glover, Lodi, *The Feasibility Pump* (2005)
- Danna, Rothberg, Le Pape, *RINS* (2005)
- Gleixner et al., *MIPLIB 2017* (2021)
