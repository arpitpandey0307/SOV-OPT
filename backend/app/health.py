"""Model Health Scorecard.

Every item is derived from a measurable statistic of the model. No learned or
opaque scores are used.
"""

from __future__ import annotations

import math


def _span(lo, hi):
    if not lo or not hi or lo <= 0:
        return None
    return math.log10(hi / lo)


def _range_item(key, label, lo, hi, what):
    span = _span(lo, hi)
    if span is None:
        return {
            "key": key, "label": label, "status": "ok", "value": "n/a",
            "statistic": "no nonzero values",
            "detail": f"The model has no nonzero {what}.",
        }
    status = "ok" if span <= 6 else "warn" if span <= 9 else "risk"
    return {
        "key": key,
        "label": label,
        "status": status,
        "value": f"{span:.1f} orders",
        "statistic": f"|min| {lo:.3g}, |max| {hi:.3g}",
        "detail": (
            f"{what.capitalize()} span {span:.1f} orders of magnitude. "
            + ("This is well within double-precision comfort." if status == "ok"
               else "Scaling will be needed to keep pivots stable." if status == "warn"
               else "Expect tolerance trouble unless the model is rescaled or reformulated.")
        ),
    }


def scorecard(a: dict) -> list[dict]:
    items = []
    m, n, nnz = a["rows"], a["cols"], a["nnz"]

    items.append({
        "key": "sparsity",
        "label": "Sparsity",
        "status": "ok",
        "value": f"{(1 - a['density']) * 100:.3f}%",
        "statistic": f"{nnz:,} nonzeros in a {m:,} x {n:,} matrix",
        "detail": f"Average {a['row_nnz_avg']:.1f} nonzeros per row, densest row {a['row_nnz_max']:,}, densest column {a['col_nnz_max']:,}.",
    })

    dense_col = a["col_nnz_max"] > max(0.3 * m, 1000) if m else False
    items.append({
        "key": "dense_columns",
        "label": "Dense columns",
        "status": "warn" if dense_col else "ok",
        "value": f"{a['col_nnz_max']:,} max",
        "statistic": f"densest column touches {a['col_nnz_max'] / max(m, 1) * 100:.1f}% of rows",
        "detail": "A dense column fills in the normal equations of an interior-point method and needs special handling." if dense_col
        else "No column is dense enough to cause fill-in trouble for interior-point factorizations.",
    })

    items.append(_range_item("coef_range", "Matrix coefficients", a["coef_min"], a["coef_max"], "matrix coefficients"))
    items.append(_range_item("obj_range", "Objective coefficients", a["obj_min"], a["obj_max"], "objective coefficients"))
    items.append(_range_item("rhs_range", "Right-hand side", a["rhs_min"], a["rhs_max"], "right-hand side values"))

    if a["integer_cols"]:
        bm = a["big_m_rows"]
        items.append({
            "key": "big_m",
            "label": "Big-M constraints",
            "status": "ok" if bm == 0 else "warn" if bm <= 0.05 * m else "risk",
            "value": f"{bm:,} rows",
            "statistic": "integer coefficient >= 1e4 and >= 1000x the largest continuous coefficient in the row",
            "detail": "No big-M style linking rows were found." if bm == 0 else
            f"{bm:,} rows link an integer variable through a very large constant. These usually weaken the LP relaxation; bound tightening in presolve may reduce the constants.",
        })

    bad = a["rows_bad_ratio"]
    items.append({
        "key": "row_ratio",
        "label": "Row scaling",
        "status": "ok" if bad == 0 else "warn" if bad <= 0.01 * m else "risk",
        "value": f"{bad:,} rows",
        "statistic": "rows whose max/min coefficient ratio is at least 1e6",
        "detail": "Every row has a moderate coefficient ratio." if bad == 0 else
        f"{bad:,} rows mix coefficients at least a million times apart within a single row.",
    })

    reducible = a["empty_rows"] + a["singleton_rows"] + a["empty_cols"] + a["fixed_cols"]
    items.append({
        "key": "presolve",
        "label": "Presolve opportunities",
        "status": "info",
        "value": f"{reducible:,} direct",
        "statistic": f"{a['empty_rows']:,} empty rows, {a['singleton_rows']:,} singleton rows, {a['empty_cols']:,} empty columns, {a['fixed_cols']:,} fixed columns, {a['singleton_cols']:,} singleton columns",
        "detail": "Counts of reductions available before any bound propagation. Singleton rows become variable bounds; empty and fixed items are removed.",
    })

    items.append({
        "key": "free_vars",
        "label": "Free variables",
        "status": "ok" if a["free_cols"] == 0 else "info",
        "value": f"{a['free_cols']:,}",
        "statistic": "columns with no finite lower or upper bound",
        "detail": "Free variables are handled by the simplex without splitting, but they need care in interior-point methods.",
    })

    if a["quadratic_nnz"]:
        items.append({
            "key": "quadratic",
            "label": "Quadratic objective",
            "status": "info",
            "value": f"{a['quadratic_nnz']:,} terms",
            "statistic": f"{a['quadratic_diag']:,} diagonal, {a['quadratic_nnz'] - a['quadratic_diag']:,} off-diagonal (lower triangle)",
            "detail": "Convexity is checked by the QP solver before the interior-point method starts.",
        })

    return items


def summary_status(items: list[dict]) -> str:
    if any(i["status"] == "risk" for i in items):
        return "risk"
    if any(i["status"] == "warn" for i in items):
        return "warn"
    return "ok"
