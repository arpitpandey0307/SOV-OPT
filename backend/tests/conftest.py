import os
import shutil
import sys
import tempfile
import time
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent

# Isolate runtime state; reuse the shared analysis cache so tests stay fast.
_tmp = Path(tempfile.mkdtemp(prefix="sovopt-test-"))
os.environ["SOVOPT_DATA_DIR"] = str(_tmp / "data")
sys.path.insert(0, str(BACKEND))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

SMALL_LP = """NAME          SMALL
ROWS
 N  COST
 L  C1
 L  C2
COLUMNS
    X         COST        -1.0   C1           1.0
    X         C2           1.0
    Y         COST        -1.0   C1           1.0
    Y         C2           3.0
RHS
    RHS       C1           4.0   C2           6.0
BOUNDS
 UP BND       X            3.0
ENDATA
"""

INFEASIBLE_LP = """NAME INF
ROWS
 N  OBJ
 G  C1
 L  C2
COLUMNS
    X  OBJ 1  C1 1
    X  C2 1
RHS
    RHS  C1 5  C2 3
ENDATA
"""


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c
    shutil.rmtree(_tmp, ignore_errors=True)


def wait_for_run(client, run_id: str, timeout: float = 120.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = client.get(f"/api/v1/runs/{run_id}").json()
        if r["status"] not in ("queued", "running"):
            return r
        time.sleep(0.3)
    raise AssertionError(f"run {run_id} did not finish in {timeout}s")


def wait_for_analysis(client, collection: str, name: str, timeout: float = 60.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = client.get(f"/api/v1/models/{collection}/{name}/analysis")
        body = r.json()
        if body["state"] in ("ready", "unavailable", "failed"):
            return body
        time.sleep(0.3)
    raise AssertionError("analysis did not finish")
