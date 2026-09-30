import sys
from pathlib import Path

from conftest import REPO, SMALL_LP

sys.path.insert(0, str(REPO / "verifier"))

from verify import verify  # noqa: E402

GOOD = """# SOV-OPT solution
status OPTIMAL
objective -4
columns 2
X 3 0
Y 1 0
rows 2
C1 4 -1
C2 6 0
"""


def _write(tmp_path: Path, sol: str) -> tuple[Path, Path]:
    m = tmp_path / "small.mps"
    s = tmp_path / "small.sol"
    m.write_text(SMALL_LP)
    s.write_text(sol)
    return m, s


def test_certifies_an_optimal_solution(tmp_path):
    # x = 3, y = 1 with dual y1 = -1 on C1: the dual objective equals the primal objective.
    m, s = _write(tmp_path, GOOD)
    r = verify(m, s)
    assert r["verdict"] == "OPTIMALITY_PROVED", r
    assert r["precision"] == "exact rational"


def test_rejects_infeasible_point(tmp_path):
    m, s = _write(tmp_path, GOOD.replace("X 3 0", "X 3.5 0").replace("objective -4", "objective -4.5"))
    r = verify(m, s)
    assert r["verdict"] == "FAILED"
    assert not next(c for c in r["checks"] if c["check"] == "primal_feasibility")["passed"]


def test_rejects_wrong_objective(tmp_path):
    m, s = _write(tmp_path, GOOD.replace("objective -4", "objective -3.9"))
    assert verify(m, s)["verdict"] == "FAILED"


def test_rejects_suboptimal_duals(tmp_path):
    # Feasible but not optimal: x = 0, y = 0 with zero duals leaves a duality gap.
    sol = GOOD.replace("X 3 0", "X 0 -1").replace("Y 1 0", "Y 0 -1").replace("objective -4", "objective 0")
    sol = sol.replace("C1 4 -1", "C1 0 0").replace("C2 6 0", "C2 0 0")
    r = verify(*_write(tmp_path, sol))
    assert r["verdict"] == "FAILED"
