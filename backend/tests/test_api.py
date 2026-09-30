import io
import json
import zipfile

from conftest import INFEASIBLE_LP, SMALL_LP, wait_for_analysis, wait_for_run

API = "/api/v1"


def test_health_and_system(client):
    assert client.get(f"{API}/health").json()["status"] == "ok"
    s = client.get(f"{API}/system").json()
    assert s["native_available"] is True
    assert s["engine"] == "sovopt-native"
    assert s["host"]["logical_cores"] >= 1
    assert isinstance(s["gpus"], list)


def test_collections_match_dataset(client):
    cols = {c["id"]: c for c in client.get(f"{API}/collections").json()}
    assert cols["netlib"]["count"] == 8
    assert cols["netlib"]["with_reference"] == 8
    assert cols["miplib2017"]["count"] == 240
    assert cols["miplib2017"]["with_reference"] == 240
    assert cols["maros-meszaros"]["count"] == 138
    assert cols["qplib"]["count"] == 453


def test_model_listing_search_and_404(client):
    r = client.get(f"{API}/models", params={"collection": "netlib", "q": "degen"}).json()
    assert {m["name"] for m in r["items"]} == {"degen2", "degen3"}
    r = client.get(f"{API}/models", params={"kind": "MILP", "limit": 5}).json()
    assert r["total"] == 240 and len(r["items"]) == 5
    assert client.get(f"{API}/models/netlib/nope").status_code == 404
    assert client.get(f"{API}/runs/run_missing").status_code == 404


def test_reference_statuses(client):
    glass4 = client.get(f"{API}/models/miplib2017/glass4").json()
    assert glass4["reference_status"] == "opt"
    assert abs(glass4["reference_objective"] - 1200012599.972384) < 1e-3
    inf = client.get(f"{API}/models/miplib2017/bnatt500").json()
    assert inf["reference_status"] == "inf"


def test_analysis_is_measured(client):
    a = wait_for_analysis(client, "netlib", "afiro")["analysis"]
    assert (a["rows"], a["cols"], a["nnz"]) == (27, 32, 83)
    assert a["kind"] == "LP"
    assert any(h["key"] == "coef_range" for h in a["health"])
    g = wait_for_analysis(client, "miplib2017", "glass4")["analysis"]
    assert g["big_m_rows"] == 351
    fp = client.get(f"{API}/models/netlib/afiro/fingerprint").json()
    assert len(fp["sha256"]) == 64


def test_native_run_is_optimal_and_verified(client):
    run = client.post(f"{API}/models/netlib/afiro/runs", json={"time_limit": 30}).json()
    assert run["engine"] == "sovopt-native"
    done = wait_for_run(client, run["id"])
    assert done["status"] == "completed"
    assert done["result_status"] == "OPTIMAL"
    assert abs(done["objective"] - (-464.75314286)) < 1e-6
    v = done["verification"]
    assert v["verdict"] == "OPTIMALITY_PROVED"
    assert v["precision"] == "exact rational"
    assert {c["check"] for c in v["checks"]} >= {"primal_feasibility", "dual_feasibility", "duality_gap"}
    assert all(c["passed"] for c in v["checks"])


def test_sse_stream_and_resume(client):
    run = client.post(f"{API}/models/netlib/adlittle/runs", json={"time_limit": 30}).json()
    wait_for_run(client, run["id"])
    with client.stream("GET", f"{API}/runs/{run['id']}/events") as s:
        body = "".join(s.iter_text())
    types = [json.loads(line[6:])["type"] for line in body.splitlines() if line.startswith("data: {\"t\"")]
    assert types[0] == "RUN_QUEUED"
    assert "ITERATION" in types and "VERIFICATION_COMPLETED" in types and types[-1] == "RUN_COMPLETED"
    assert "event: end" in body
    ids = [int(line[4:]) for line in body.splitlines() if line.startswith("id: ")]
    with client.stream("GET", f"{API}/runs/{run['id']}/events", headers={"Last-Event-ID": str(ids[-3])}) as s:
        resumed = "".join(s.iter_text())
    resumed_ids = [int(line[4:]) for line in resumed.splitlines() if line.startswith("id: ")]
    assert resumed_ids == ids[-2:]


def test_passport_and_evidence(client):
    run = client.post(f"{API}/models/netlib/blend/runs", json={"time_limit": 30, "seed": 7}).json()
    done = wait_for_run(client, run["id"])
    p = client.get(f"{API}/runs/{run['id']}/passport").json()
    fp = client.get(f"{API}/models/netlib/blend/fingerprint").json()
    assert p["model"]["sha256"] == fp["sha256"]
    assert p["random_seed"] == 7
    assert p["solver"]["engine"] == "sovopt-native"
    assert p["verification"]["verdict"] == done["verification"]["verdict"]
    r = client.get(f"{API}/runs/{run['id']}/evidence")
    assert r.status_code == 200
    names = set(zipfile.ZipFile(io.BytesIO(r.content)).namelist())
    assert {"passport.json", "configuration.json", "trace.jsonl", "verification.json"} <= names


def test_cancel_long_run(client):
    run = client.post(f"{API}/models/netlib/pilot/runs", json={"time_limit": 60}).json()
    import time
    time.sleep(2.0)
    assert client.post(f"{API}/runs/{run['id']}/cancel").json()["status"] == "cancelling"
    done = wait_for_run(client, run["id"], timeout=30)
    assert done["status"] == "cancelled"
    assert client.post(f"{API}/runs/{run['id']}/cancel").status_code == 409


def test_passport_refused_while_running(client):
    run = client.post(f"{API}/models/netlib/pilot/runs", json={"time_limit": 60}).json()
    assert client.get(f"{API}/runs/{run['id']}/passport").status_code == 409
    client.post(f"{API}/runs/{run['id']}/cancel")
    wait_for_run(client, run["id"], timeout=30)


def test_upload_validation_and_solve(client):
    bad = client.post(f"{API}/models", files={"file": ("model.txt", b"hello")})
    assert bad.status_code == 415
    up = client.post(f"{API}/models", files={"file": ("small.mps", SMALL_LP.encode())})
    assert up.status_code == 201
    name = up.json()["name"]
    a = wait_for_analysis(client, "uploads", name)
    assert a["analysis"]["rows"] == 2
    run = client.post(f"{API}/models/uploads/{name}/runs", json={"time_limit": 10}).json()
    done = wait_for_run(client, run["id"])
    assert done["result_status"] == "OPTIMAL"
    assert abs(done["objective"] - (-4.0)) < 1e-9
    assert done["verification"]["verdict"] == "OPTIMALITY_PROVED"


def test_infeasible_upload(client):
    up = client.post(f"{API}/models", files={"file": ("infeasible.mps", INFEASIBLE_LP.encode())}).json()
    wait_for_analysis(client, "uploads", up["name"])
    run = client.post(f"{API}/models/uploads/{up['name']}/runs", json={"time_limit": 10}).json()
    done = wait_for_run(client, run["id"])
    assert done["result_status"] == "INFEASIBLE"
    assert done["verification"]["verdict"] == "INFEASIBILITY_REPORTED"


def test_milp_uses_preview_engine(client):
    run = client.post(f"{API}/models/miplib2017/glass4/runs", json={"time_limit": 3}).json()
    assert run["engine"] == "sovopt-preview"
    done = wait_for_run(client, run["id"], timeout=60)
    assert done["status"] == "completed"


def test_run_config_validation(client):
    r = client.post(f"{API}/models/netlib/afiro/runs", json={"time_limit": -1})
    assert r.status_code == 422
    r = client.post(f"{API}/models/qplib/qplib_0018/runs", json={})
    assert r.status_code == 422
