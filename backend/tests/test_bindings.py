import io
import json
import sys

import pytest

from conftest import REPO, SMALL_LP

sys.path.insert(0, str(REPO / "bindings" / "python"))

import sovopt  # noqa: E402


def test_python_binding_solves_and_streams_events(tmp_path):
    mps = tmp_path / "small.mps"
    mps.write_text(SMALL_LP)
    out = io.StringIO()
    r = sovopt.solve_file(str(mps), events=True, out=out)
    assert r.status == "OPTIMAL"
    assert abs(r.objective + 4.0) < 1e-9
    types = [json.loads(line)["type"] for line in out.getvalue().splitlines()]
    assert types[0] == "MODEL_READ" and types[-1] == "RESULT" and "ITERATION" in types


def test_binding_reports_read_errors(tmp_path):
    bad = tmp_path / "bad.mps"
    bad.write_text("NAME X\nROWS\n N OBJ\nCOLUMNS\n    X  NOPE 1\nENDATA\n")
    with pytest.raises(sovopt.SovoptError, match="unknown row"):
        sovopt.Model.read_mps(bad)


def test_pulp_adapter_matches_known_optimum():
    pulp = pytest.importorskip("pulp")
    from sovopt.pulp_solver import SOVOPT

    crudes = {"ArabLight": (61.5, 1.8), "BombayHigh": (64.2, 0.2), "Basrah": (59.8, 2.9)}
    prob = pulp.LpProblem("blend", pulp.LpMinimize)
    x = {c: prob.add_variable(f"x_{c}", lowBound=0) for c in crudes}
    prob += pulp.lpSum(crudes[c][0] * x[c] for c in crudes)
    prob += pulp.lpSum(x.values()) == 100, "volume"
    prob += pulp.lpSum(crudes[c][1] * x[c] for c in crudes) <= 120, "sulfur"
    prob += x["BombayHigh"] <= 40, "bh_avail"
    prob.solve(SOVOPT())
    assert abs(pulp.value(prob.objective) - 6251.25) < 1e-6
    assert abs(x["ArabLight"].value() - 62.5) < 1e-6
    cons = prob.constraints()
    cons = cons if isinstance(cons, dict) else {c.name: c for c in cons}
    assert abs(cons["sulfur"].pi - (-1.6875)) < 1e-9
