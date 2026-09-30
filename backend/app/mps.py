"""MPS / QPS reader and structural analysis.

The reader streams the file once and accumulates the statistics the Model
Studio needs. It does not keep the full matrix in memory: only per-row and
per-column counts, a coarse sparsity grid and coefficient magnitude
histograms. Row/column counts are known only after the ROWS and COLUMNS
sections are read, so nonzero positions are buffered as compact index arrays
and binned at the end.
"""

from __future__ import annotations

import gzip
import math
from array import array
from pathlib import Path

GRID = 120
HIST_MIN_EXP = -12
HIST_MAX_EXP = 12

BOUND_TYPES_WITH_VALUE = {"UP", "LO", "FX", "LI", "UI", "SC"}
BOUND_TYPES_NO_VALUE = {"FR", "MI", "PL", "BV"}


class MpsError(ValueError):
    pass


def _open(path: Path):
    if path.suffix == ".gz":
        return gzip.open(path, "rt", encoding="latin-1", errors="replace")
    return open(path, "rt", encoding="latin-1", errors="replace")


def _mag_bucket(v: float) -> int:
    e = math.floor(math.log10(abs(v)))
    return min(max(e, HIST_MIN_EXP), HIST_MAX_EXP)


def analyze_mps(path: Path, progress=None) -> dict:
    name = path.stem.replace(".mps", "")
    section = None
    obj_row: str | None = None
    obj_sense = "MIN"

    row_index: dict[str, int] = {}
    row_types: list[str] = []
    col_index: dict[str, int] = {}
    col_is_int: list[bool] = []

    nz_rows = array("i")
    nz_cols = array("i")
    row_nnz: list[int] = []
    col_nnz_list: list[int] = []

    obj_nnz = 0
    obj_min = math.inf
    obj_max = 0.0
    a_min = math.inf
    a_max = 0.0
    a_hist: dict[int, int] = {}
    row_max: list[float] = []
    row_min: list[float] = []
    row_int_max: list[float] = []
    row_cont_max: list[float] = []

    rhs_min = math.inf
    rhs_max = 0.0
    ranges_count = 0

    lower: dict[int, float] = {}
    upper: dict[int, float] = {}
    free_cols: set[int] = set()
    binary_cols: set[int] = set()
    bound_int_cols: set[int] = set()

    q_nnz = 0
    q_diag = 0

    in_int_block = False
    current_col = None
    current_col_idx = -1
    lines = 0

    def add_coef(col_idx: int, row_name: str, val: float) -> None:
        nonlocal obj_nnz, obj_min, obj_max, a_min, a_max
        if val == 0.0:
            return
        if row_name == obj_row:
            obj_nnz += 1
            av = abs(val)
            obj_min = min(obj_min, av)
            obj_max = max(obj_max, av)
            return
        r = row_index.get(row_name)
        if r is None:
            return
        nz_rows.append(r)
        nz_cols.append(col_idx)
        row_nnz[r] += 1
        col_nnz_list[col_idx] += 1
        av = abs(val)
        a_min = min(a_min, av)
        a_max = max(a_max, av)
        b = _mag_bucket(av)
        a_hist[b] = a_hist.get(b, 0) + 1
        if av > row_max[r]:
            row_max[r] = av
        if av < row_min[r]:
            row_min[r] = av
        if col_is_int[col_idx]:
            if av > row_int_max[r]:
                row_int_max[r] = av
        elif av > row_cont_max[r]:
            row_cont_max[r] = av

    with _open(path) as f:
        for raw in f:
            lines += 1
            if progress and lines % 200000 == 0:
                progress(lines)
            if not raw.strip() or raw[0] == "*":
                continue
            if raw[0] not in (" ", "\t"):
                tok = raw.split()
                head = tok[0].upper()
                section = head
                if head == "NAME" and len(tok) > 1:
                    name = tok[1]
                elif head == "OBJSENSE" and len(tok) > 1:
                    obj_sense = tok[1].upper()
                elif head == "ENDATA":
                    break
                continue

            tok = raw.split()
            if section == "OBJSENSE":
                obj_sense = tok[0].upper()
                continue
            if section == "ROWS":
                rtype, rname = tok[0].upper(), tok[1]
                if rtype == "N":
                    if obj_row is None:
                        obj_row = rname
                    continue
                row_index[rname] = len(row_types)
                row_types.append(rtype)
                row_nnz.append(0)
                row_max.append(0.0)
                row_min.append(math.inf)
                row_int_max.append(0.0)
                row_cont_max.append(0.0)
            elif section == "COLUMNS":
                if len(tok) >= 3 and tok[1].strip("'").upper() == "MARKER":
                    marker = tok[2].strip("'").upper()
                    in_int_block = marker == "INTORG"
                    continue
                cname = tok[0]
                if cname != current_col:
                    current_col = cname
                    idx = col_index.get(cname)
                    if idx is None:
                        idx = len(col_is_int)
                        col_index[cname] = idx
                        col_is_int.append(in_int_block)
                        col_nnz_list.append(0)
                    current_col_idx = idx
                for i in range(1, len(tok) - 1, 2):
                    add_coef(current_col_idx, tok[i], float(tok[i + 1]))
            elif section == "RHS":
                start = 1 if len(tok) % 2 == 1 else 0
                for i in range(start, len(tok) - 1, 2):
                    v = float(tok[i + 1])
                    if tok[i] == obj_row or v == 0.0:
                        continue
                    av = abs(v)
                    rhs_min = min(rhs_min, av)
                    rhs_max = max(rhs_max, av)
            elif section == "RANGES":
                start = 1 if len(tok) % 2 == 1 else 0
                ranges_count += len(range(start, len(tok) - 1, 2))
            elif section == "BOUNDS":
                btype = tok[0].upper()
                if btype in BOUND_TYPES_WITH_VALUE:
                    cname, val = (tok[2], tok[3]) if len(tok) >= 4 else (tok[1], tok[2])
                    v = float(val)
                elif btype in BOUND_TYPES_NO_VALUE:
                    # The bound-set name is optional, so pick whichever token is a column.
                    cname = tok[2] if len(tok) >= 3 and tok[2] in col_index else tok[1]
                    v = 0.0
                else:
                    continue
                c = col_index.get(cname)
                if c is None:
                    continue
                if btype == "UP":
                    upper[c] = v
                elif btype == "LO":
                    lower[c] = v
                elif btype == "FX":
                    lower[c] = v
                    upper[c] = v
                elif btype == "FR":
                    free_cols.add(c)
                elif btype == "MI":
                    lower[c] = -math.inf
                elif btype == "PL":
                    upper[c] = math.inf
                elif btype == "BV":
                    binary_cols.add(c)
                    lower[c] = 0.0
                    upper[c] = 1.0
                elif btype in ("LI", "UI"):
                    bound_int_cols.add(c)
                    (lower if btype == "LI" else upper)[c] = v
            elif section in ("QUADOBJ", "QMATRIX", "QSECTION"):
                if len(tok) >= 3 and float(tok[2]) != 0.0:
                    q_nnz += 1
                    if tok[0] == tok[1]:
                        q_diag += 1

    m = len(row_types)
    n = len(col_is_int)
    if n == 0:
        raise MpsError("No columns found; the file does not look like an MPS model.")
    nnz = len(nz_rows)

    for c in bound_int_cols:
        col_is_int[c] = True
    for c in binary_cols:
        col_is_int[c] = True

    n_int = sum(col_is_int)
    n_bin = 0
    for c in range(n):
        if not col_is_int[c]:
            continue
        # MIPLIB 2017 files state integer bounds explicitly, so a binary is an
        # integer column with bounds exactly [0, 1].
        if lower.get(c, 0.0) == 0.0 and upper.get(c) == 1.0:
            n_bin += 1

    fixed = sum(1 for c, u in upper.items() if c in lower and lower[c] == u)
    n_free = len(free_cols) + sum(1 for c, v in lower.items() if v == -math.inf and upper.get(c, math.inf) == math.inf)
    n_boxed = sum(1 for c, u in upper.items() if math.isfinite(u) and math.isfinite(lower.get(c, 0.0)))

    # Sparsity grid.
    grid_r = min(GRID, max(m, 1))
    grid_c = min(GRID, max(n, 1))
    grid = [0] * (grid_r * grid_c)
    rs = grid_r / max(m, 1)
    cs = grid_c / max(n, 1)
    for k in range(nnz):
        gi = int(nz_rows[k] * rs)
        gj = int(nz_cols[k] * cs)
        grid[gi * grid_c + gj] += 1

    empty_rows = sum(1 for x in row_nnz if x == 0)
    singleton_rows = sum(1 for x in row_nnz if x == 1)
    empty_cols = sum(1 for x in col_nnz_list if x == 0)
    singleton_cols = sum(1 for x in col_nnz_list if x == 1)

    row_ratio_bad = 0
    big_m_rows = 0
    for r in range(m):
        if row_nnz[r] >= 2 and row_min[r] > 0:
            ratio = row_max[r] / row_min[r]
            if ratio >= 1e6:
                row_ratio_bad += 1
        # Big-M candidate: an integer coefficient that dwarfs the continuous part of the row.
        if row_int_max[r] >= 1e4 and row_cont_max[r] > 0 and row_int_max[r] >= 1e3 * row_cont_max[r]:
            big_m_rows += 1

    def hist_list(h: dict[int, int]) -> list[dict]:
        return [{"exp": e, "count": h.get(e, 0)} for e in range(HIST_MIN_EXP, HIST_MAX_EXP + 1) if h.get(e, 0)]

    row_type_counts = {t: row_types.count(t) for t in ("E", "L", "G")}

    has_q = q_nnz > 0
    kind = "MIQP" if has_q and n_int else "QP" if has_q else "MILP" if n_int else "LP"

    def fin(x):
        return None if x is None or not math.isfinite(x) else x

    return {
        "name": name,
        "kind": kind,
        "sense": "MAX" if obj_sense.startswith("MAX") else "MIN",
        "rows": m,
        "cols": n,
        "nnz": nnz,
        "density": nnz / (m * n) if m and n else 0.0,
        "row_types": row_type_counts,
        "ranges": ranges_count,
        "integer_cols": n_int,
        "binary_cols": n_bin,
        "continuous_cols": n - n_int,
        "free_cols": n_free,
        "fixed_cols": fixed,
        "boxed_cols": n_boxed,
        "objective_nnz": obj_nnz,
        "quadratic_nnz": q_nnz,
        "quadratic_diag": q_diag,
        "coef_min": fin(a_min),
        "coef_max": fin(a_max) or None,
        "obj_min": fin(obj_min),
        "obj_max": fin(obj_max) or None,
        "rhs_min": fin(rhs_min),
        "rhs_max": fin(rhs_max) or None,
        "coef_hist": hist_list(a_hist),
        "row_nnz_max": max(row_nnz) if row_nnz else 0,
        "row_nnz_avg": nnz / m if m else 0.0,
        "col_nnz_max": max(col_nnz_list) if col_nnz_list else 0,
        "col_nnz_avg": nnz / n if n else 0.0,
        "empty_rows": empty_rows,
        "singleton_rows": singleton_rows,
        "empty_cols": empty_cols,
        "singleton_cols": singleton_cols,
        "rows_bad_ratio": row_ratio_bad,
        "big_m_rows": big_m_rows,
        "sparsity": {"rows": grid_r, "cols": grid_c, "cells": grid},
    }
