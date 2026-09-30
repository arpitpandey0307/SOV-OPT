#!/usr/bin/env python3
"""Generates an illustrative multi-period refinery planning LP.

    python models/refinery/generate.py

Writes refinery_planning.mps and refinery_planning.annotations.json next to
this script. The structure follows textbook refinery planning models (crude
selection, atmospheric distillation yields, product pooling with quality
specifications, demand and inventory). All numbers are illustrative values
chosen for demonstration; they are not MRPL operating data.
"""

from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
PERIODS = 3

# Crude: cost (INR/bbl), availability per period (kbbl), sulfur (wt%),
# CDU yields for LPG, naphtha, kerosene, diesel, residue.
CRUDES = {
    "ARABLT": (6150, 900, 1.8, [0.03, 0.20, 0.14, 0.28, 0.35]),
    "BASRAH": (5980, 800, 2.9, [0.02, 0.18, 0.12, 0.26, 0.42]),
    "BOMHIGH": (6420, 450, 0.2, [0.04, 0.24, 0.16, 0.30, 0.26]),
    "URALS": (5890, 700, 1.4, [0.02, 0.17, 0.13, 0.27, 0.41]),
    "WTI": (6380, 500, 0.3, [0.04, 0.27, 0.15, 0.29, 0.25]),
}
CUTS = ["LPG", "NAP", "KERO", "DSL", "RES"]
# Cut sulfur relative to crude sulfur (lighter cuts carry less sulfur).
CUT_SULFUR_FACTOR = {"LPG": 0.0, "NAP": 0.05, "KERO": 0.15, "DSL": 0.6, "RES": 1.9}

# Products: price (INR/bbl), demand per period (min, max kbbl), sulfur spec (wt%, None = no spec),
# and which cuts may be pooled into the product.
PRODUCTS = {
    "LPGP": (5200, (80, 150), None, ["LPG"]),
    "PETROL": (8600, (350, 650), 0.10, ["NAP"]),
    "ATF": (8900, (180, 320), 0.30, ["KERO"]),
    "HSD": (8100, (650, 1100), 0.80, ["DSL", "KERO"]),
    "FO": (4700, (0, 1200), 3.50, ["RES", "DSL"]),
}
CDU_CAPACITY = 2600          # kbbl per period
OPEX = 310                   # INR/bbl processed
HOLD_COST = 45               # INR/bbl/period of product inventory
TANK_CAPACITY = 250          # kbbl per product


def build():
    rows: list[tuple[str, str]] = []          # (type, name)
    rhs: dict[str, float] = {}
    ranges: dict[str, float] = {}
    cols: dict[str, dict[str, float]] = {}
    bounds: list[tuple[str, str, float]] = []
    ann = {"description": "Illustrative 3-period refinery planning LP. Values are demonstration data.",
           "kpis": {"profit": {"label": "Margin (INR thousand)", "sense": "max"}},
           "row_groups": {}, "col_groups": {}}

    def row(t: str, name: str, group: str, b: float | None = None):
        rows.append((t, name))
        if b is not None:
            rhs[name] = b
        ann["row_groups"].setdefault(group, []).append(name)

    def coef(col: str, row_name: str, v: float):
        cols.setdefault(col, {})
        cols[col][row_name] = cols[col].get(row_name, 0.0) + v

    for p in range(1, PERIODS + 1):
        row("L", f"CDU_CAP_{p}", "CDU capacity", CDU_CAPACITY)
        for cut in CUTS:
            row("E", f"CUT_BAL_{cut}_{p}", "Cut balance", 0.0)
        for prod, (_, (dmin, dmax), spec, _) in PRODUCTS.items():
            row("E", f"INV_BAL_{prod}_{p}", "Inventory balance", 0.0)
            row("G", f"DEMAND_{prod}_{p}", "Product demand", dmin)
            ranges[f"DEMAND_{prod}_{p}"] = dmax - dmin
            if spec is not None:
                row("L", f"SULFUR_{prod}_{p}", "Sulfur specification", 0.0)

    for p in range(1, PERIODS + 1):
        for c, (cost, avail, s, yields) in CRUDES.items():
            v = f"CRUDE_{c}_{p}"
            coef(v, "PROFIT", -(cost + OPEX) / 1000.0)
            coef(v, f"CDU_CAP_{p}", 1.0)
            for cut, y in zip(CUTS, yields):
                coef(v, f"CUT_BAL_{cut}_{p}", y)
            bounds.append(("UP", v, float(avail)))
            ann["col_groups"].setdefault("Crude purchase", []).append(v)
        for prod, (price, _, spec, allowed) in PRODUCTS.items():
            for cut in allowed:
                # Blend flow of a cut into a product carries the cut's sulfur, computed from the crude slate.
                v = f"BLEND_{cut}_{prod}_{p}"
                coef(v, f"CUT_BAL_{cut}_{p}", -1.0)
                coef(v, f"INV_BAL_{prod}_{p}", 1.0)
                ann["col_groups"].setdefault("Blending", []).append(v)
            sale = f"SELL_{prod}_{p}"
            coef(sale, "PROFIT", price / 1000.0)
            coef(sale, f"INV_BAL_{prod}_{p}", -1.0)
            coef(sale, f"DEMAND_{prod}_{p}", 1.0)
            ann["col_groups"].setdefault("Sales", []).append(sale)
            inv = f"INV_{prod}_{p}"
            coef(inv, "PROFIT", -HOLD_COST / 1000.0)
            coef(inv, f"INV_BAL_{prod}_{p}", -1.0)
            if p < PERIODS:
                coef(inv, f"INV_BAL_{prod}_{p + 1}", 1.0)
            bounds.append(("UP", inv, float(TANK_CAPACITY)))
            ann["col_groups"].setdefault("Inventory", []).append(inv)

    # Sulfur specs without pooling nonlinearity: each cut is routed to products per crude of origin,
    # so the sulfur of every routed barrel is a known constant.
    for p in range(1, PERIODS + 1):
        for prod, (_, _, spec, allowed) in PRODUCTS.items():
            if spec is None:
                continue
            for cut in allowed:
                for c, (_, _, s, yields) in CRUDES.items():
                    v = f"ROUTE_{c}_{cut}_{prod}_{p}"
                    cut_s = s * CUT_SULFUR_FACTOR[cut]
                    coef(v, f"SULFUR_{prod}_{p}", cut_s - spec)
                    coef(v, f"ROUTE_BAL_{c}_{cut}_{p}", 1.0)
                    coef(v, f"ROUTE_LINK_{cut}_{prod}_{p}", 1.0)
                    ann["col_groups"].setdefault("Quality routing", []).append(v)
    # Routing balances: routed volume of crude c's cut cannot exceed what CDU produced from c,
    # and routed volume into a product equals the blend flow of that cut.
    for p in range(1, PERIODS + 1):
        for c, (_, _, _, yields) in CRUDES.items():
            for k, cut in enumerate(CUTS):
                name = f"ROUTE_BAL_{c}_{cut}_{p}"
                if not any(name in d for d in cols.values()):
                    continue
                row("L", name, "Quality routing", 0.0)
                coef(f"CRUDE_{c}_{p}", name, -yields[k])
        for prod, (_, _, spec, allowed) in PRODUCTS.items():
            if spec is None:
                continue
            for cut in allowed:
                name = f"ROUTE_LINK_{cut}_{prod}_{p}"
                row("E", name, "Quality routing", 0.0)
                coef(f"BLEND_{cut}_{prod}_{p}", name, -1.0)
    return rows, rhs, ranges, cols, bounds, ann


def write_mps(path: Path, rows, rhs, ranges, cols, bounds) -> None:
    lines = ["NAME          REFINERY_PLANNING", "OBJSENSE", "    MAX", "ROWS", " N  PROFIT"]
    lines += [f" {t}  {name}" for t, name in rows]
    lines.append("COLUMNS")
    for col, entries in cols.items():
        for r, v in entries.items():
            lines.append(f"    {col:<28} {r:<28} {v:.6g}")
    lines.append("RHS")
    for r, v in rhs.items():
        if v != 0:
            lines.append(f"    RHS  {r:<28} {v:.6g}")
    lines.append("RANGES")
    for r, v in ranges.items():
        lines.append(f"    RNG  {r:<28} {v:.6g}")
    lines.append("BOUNDS")
    for t, c, v in bounds:
        lines.append(f" {t} BND  {c:<28} {v:.6g}")
    lines.append("ENDATA")
    path.write_text("\n".join(lines) + "\n")


def main() -> None:
    rows, rhs, ranges, cols, bounds, ann = build()
    write_mps(HERE / "refinery_planning.mps", rows, rhs, ranges, cols, bounds)
    (HERE / "refinery_planning.annotations.json").write_text(json.dumps(ann, indent=2) + "\n")
    print(f"refinery_planning.mps: {len(rows)} rows, {len(cols)} columns, "
          f"{sum(len(e) for e in cols.values())} nonzeros")


if __name__ == "__main__":
    main()
