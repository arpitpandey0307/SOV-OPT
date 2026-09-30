# SOV-OPT Datasets

All benchmark data is **fetched by scripts into `bench/data/`** and never committed; see `.gitignore`.
We redistribute nothing, and each dataset is downloaded from its official source.

---

## Summary

| # | Dataset | Type | Used by | Priority | When | Approx. size |
|---|---------|------|---------|----------|------|--------------|
| 1 | Netlib LP (feasible) | LP | T1, T4 | **P0** | Now | ~10 MB (94 models) |
| 2 | Netlib LP (infeasible) | LP | T1, T4 | **P0** | Now | < 5 MB (29 models) |
| 3 | Netlib Kennington | Large LP | T1, T3 | P1 | Phase 2 | ~200 MB uncompressed |
| 4 | MIPLIB 2017 (curated easy subset) | MILP | T2, T4 | **P0** | Phase 2 | 50–500 MB (depends on subset) |
| 5 | MIPLIB 2017 solution values (`.solu`) | Reference objectives | T4 | **P0** | Phase 2 | < 1 MB |
| 6 | Maros–Mészáros convex QP | QP | T3 | P1 | Phase 3 | ~50 MB (138 models) |
| 7 | QPLIB (convex, continuous subset) | QP | T3 | P1 | Phase 3 | ~100 MB |
| 8 | Mittelmann LP benchmark instances | Large LP | T3 (GPU PDLP) | P2 | Phase 3 | several GB |
| 9 | Refinery/planning models from literature | LP/MILP | T5 | P1 | Phase 3 | built by us |
| 10 | HiGHS binary (comparison only) | Tool | T4 | **P0** | Now | ~20 MB |

P0 = needed to start T1/T4 now.

---

## 1. Netlib LP (feasible), P0

- **Source:** https://www.netlib.org/lp/data/
- **Content:** 94 classic LPs (e.g. `afiro`, `adlittle`, `pilot87`, `greenbea`, `degen3`, `perold`)
- **Reference objectives:** `readme` file in the same directory
- **Format caveat:** most files use Netlib's **compressed MPS ("emps")** format. We will write our
  own `emps` decoder (a small documented format) so the pipeline stays self-contained.
- **Why:** this is the standard correctness benchmark for LP solvers. It includes highly degenerate and
  ill-conditioned models (`pilot*`, `greenbea`, `degen*`, `perold`), which covers the robustness demonstration the PS asks for.

## 2. Netlib LP (infeasible), P0

- **Source:** https://www.netlib.org/lp/infeas/
- **Why:** tests infeasibility detection and Farkas-certificate output, which the verifier checks.

## 3. Kennington LPs, P1

- **Source:** https://www.netlib.org/lp/data/kennington/
- **Content:** larger LPs (`osa-60`, `pds-20`, `ken-18`, `cre-d`, ...)
- **Why:** scale test for the simplex and the first GPU PDLP comparisons.

## 4–5. MIPLIB 2017, P0 for Phase 2

- **Source:** https://miplib.zib.de/ (instances as `.mps.gz`; "benchmark" set = 240 instances, "collection" = 1065)
- **We need:**
  - A **curated subset of 30–50 instances** tagged *easy* that solve in seconds to minutes. We pick
    them from the website's instance table and store the list in `bench/datasets/miplib_subset.txt`.
  - The **`.solu` file** with known optimal / best-known objective values, from the Downloads page.
- **Why:** MIPLIB is the standard MILP benchmark the PS explicitly names.

## 6. Maros–Mészáros convex QP, P1

- **Source:** the Maros–Mészáros convex QP test set (138 problems, QPS format), distributed from the
  authors' pages and mirrored in several benchmark repositories. We will pin an exact source and
  checksum in the manifest when T3 starts.
- **Why:** the standard convex-QP correctness set.

## 7. QPLIB, P1

- **Source:** https://qplib.zib.de/
- **We need:** only the instances classified as **convex with continuous variables** (and later convex mixed-integer for MIQP).
- **Why:** the PS names QPLIB explicitly.

## 8. Mittelmann benchmark instances, P2

- **Source:** https://plato.asu.edu/bench.html (LP feasible / large LP benchmark pages link each instance)
- **Why:** these are the instances used in public solver comparisons. We use a few large LPs to show
  GPU PDLP speedups, not the full set.

## 9. Industrial case-study models, P1 (built by the team)

MRPL did not provide industrial data, so we build representative models from open literature:

| Model | Type | Features exercised |
|-------|------|--------------------|
| Crude blending | LP | Quality specs (sulfur, API), linearized pooling |
| Multi-period production planning | LP / MILP | CDU/FCC/reformer capacities, inventory, demand |
| Refinery scheduling | MILP | Big-M sequencing, deliberately weak relaxation |
| Supply-chain network design | MILP | Fixed-charge flows, depots |

Each model ships with an annotation sidecar (`*.annotations.json`) for Constraint Lineage.

> **If MRPL can share an anonymized real model (MPS export from their CPLEX/Xpress setup), it would
> be the most valuable dataset of all.** It is worth asking the SPOC.

## 10. HiGHS (comparison only), P0

- **Source:** official releases from https://github.com/ERGO-Code/HiGHS, or `pip install highspy`
- **Use:** called as an **external process** by `bench/runner/` on the same machine and with the same
  limits. It is never linked into `solver/`.

---

## Directory convention

```text
bench/
├── datasets/
│   ├── manifest.json          # name, url, sha256, license note, reference-objective source
│   └── miplib_subset.txt      # curated instance list
└── data/                      # (git-ignored) downloaded files
    ├── netlib/
    ├── netlib_infeas/
    ├── kennington/
    ├── miplib2017/
    ├── maros_meszaros/
    ├── qplib/
    └── mittelmann/
```
