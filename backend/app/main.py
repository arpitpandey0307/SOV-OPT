"""SOV-OPT control plane API."""

from __future__ import annotations

import asyncio
import hashlib
import io
import json
import re
import time
import zipfile
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from . import config, system
from .catalog import COLLECTIONS, Catalog
from .engine import Engine, sha256_file
from .store import Store

catalog = Catalog()
store = Store()
engine = Engine(store, catalog)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    catalog.start_background_indexer()
    yield


app = FastAPI(title="SOV-OPT Control Plane", version=config.SOLVER_VERSION, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"],
    expose_headers=["Content-Disposition"])

API = "/api/v1"


# ------------------------------------------------------------------ helpers

def _instance_or_404(collection: str, name: str):
    inst = catalog.get(collection, name)
    if not inst:
        raise HTTPException(404, f"Model {collection}/{name} not found")
    return inst


def _run_or_404(run_id: str) -> dict:
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(404, f"Run {run_id} not found")
    return run


# ------------------------------------------------------------------- system

@app.get(f"{API}/health")
def health():
    return {"status": "ok", "version": config.SOLVER_VERSION}


@app.get(f"{API}/system")
def system_info():
    return {
        "solver_version": config.SOLVER_VERSION,
        "engine": config.ENGINE_ID,
        "host": system.host(),
        "gpus": system.gpus(),
        "active_runs": engine.active(),
    }


@app.get(f"{API}/system/gpu")
def gpu_telemetry():
    return {"t": time.time(), "gpus": system.gpus(max_age=0.5)}


@app.get(f"{API}/overview")
def overview():
    runs = store.list_runs(limit=8)
    return {
        "collections": catalog.collection_summary(),
        "run_counts": store.run_counts(),
        "recent_runs": runs,
        "active_runs": engine.active(),
    }


# ------------------------------------------------------------------- models

@app.get(f"{API}/collections")
def collections():
    return catalog.collection_summary()


@app.get(f"{API}/models")
def list_models(
    collection: str | None = None,
    q: str | None = None,
    kind: str | None = None,
    sort: Literal["name", "size", "rows", "nnz"] = "name",
    offset: int = 0,
    limit: int = Query(50, le=500),
):
    items = catalog.list()
    if collection:
        items = [i for i in items if i.collection == collection]
    if kind:
        items = [i for i in items if i.kind == kind]
    if q:
        ql = q.lower()
        items = [i for i in items if ql in i.name.lower()]
    keyf = {
        "name": lambda i: i.name,
        "size": lambda i: -i.size_bytes,
        "rows": lambda i: -(i.rows or -1),
        "nnz": lambda i: -(i.nnz or -1),
    }[sort]
    items.sort(key=keyf)
    return {"total": len(items), "items": [catalog.to_dict(i) for i in items[offset: offset + limit]]}


@app.get(f"{API}/models/{{collection}}/{{name}}")
def get_model(collection: str, name: str):
    inst = _instance_or_404(collection, name)
    d = catalog.to_dict(inst)
    d["collection_title"] = COLLECTIONS.get(collection, {}).get("title", collection)
    d["runs"] = store.list_runs(limit=10, collection=collection, instance=name)
    return d


@app.get(f"{API}/models/{{collection}}/{{name}}/analysis")
def get_analysis(collection: str, name: str, response: Response):
    inst = _instance_or_404(collection, name)
    state = catalog.analysis_state(inst)
    if state == "ready":
        return {"state": "ready", "analysis": catalog.analysis(inst)}
    if state == "unavailable":
        return {"state": "unavailable", "analysis": None}
    catalog.request_analysis(inst)
    response.status_code = 202
    return {**catalog.analysis_progress(inst), "analysis": None}


@app.get(f"{API}/models/{{collection}}/{{name}}/fingerprint")
def fingerprint(collection: str, name: str):
    inst = _instance_or_404(collection, name)
    if not inst.path:
        raise HTTPException(404, "No model file available")
    return {"sha256": sha256_file(inst.path), "size_bytes": inst.size_bytes}


_SAFE_NAME = re.compile(r"[^A-Za-z0-9_\-]+")


@app.post(f"{API}/models", status_code=201)
async def upload_model(file: UploadFile = File(...)):
    fname = file.filename or "model.mps"
    lower = fname.lower()
    if not (lower.endswith(".mps") or lower.endswith(".mps.gz") or lower.endswith(".qps")):
        raise HTTPException(415, "Upload an MPS or QPS file (.mps, .mps.gz, .qps).")
    stem = _SAFE_NAME.sub("_", fname.split(".")[0])[:60] or "model"
    ext = ".mps.gz" if lower.endswith(".gz") else ".mps"
    dest = config.UPLOAD_DIR / f"{stem}{ext}"
    n = 1
    while dest.exists():
        n += 1
        dest = config.UPLOAD_DIR / f"{stem}_{n}{ext}"
    size = 0
    with open(dest, "wb") as out:
        while chunk := await file.read(1 << 20):
            size += len(chunk)
            if size > config.MAX_UPLOAD_BYTES:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(413, "Model file exceeds the 200 MB upload limit.")
            out.write(chunk)
    inst = catalog.add_upload(dest)
    catalog.request_analysis(inst)
    return catalog.to_dict(inst)


# --------------------------------------------------------------------- runs

class RunConfig(BaseModel):
    algorithm: Literal["auto", "dual_simplex", "primal_simplex", "ipm", "pdlp"] = "auto"
    time_limit: float = Field(60, gt=0, le=3600)
    mip_gap: float = Field(1e-4, ge=0, le=1)
    gpu: bool = True
    threads: int = Field(8, ge=1, le=256)
    seed: int = Field(42, ge=0)
    presolve: bool = True
    deterministic: bool = True


@app.post(f"{API}/models/{{collection}}/{{name}}/runs", status_code=201)
async def create_run(collection: str, name: str, cfg: RunConfig):
    inst = _instance_or_404(collection, name)
    if not inst.analyzable or not inst.path:
        raise HTTPException(422, "This model format cannot be read by the solver yet.")
    run = store.create_run(collection, name, inst.kind, cfg.model_dump(), config.ENGINE_ID)
    store.add_event(run["id"], 0.0, "RUN_QUEUED", {"configuration": cfg.model_dump()})
    engine.start(run, inst)
    return run


@app.get(f"{API}/runs")
def list_runs(limit: int = Query(50, le=500), collection: str | None = None, instance: str | None = None):
    return store.list_runs(limit=limit, collection=collection, instance=instance)


@app.get(f"{API}/runs/{{run_id}}")
def get_run(run_id: str):
    run = _run_or_404(run_id)
    inst = catalog.get(run["collection"], run["instance"])
    run["reference_objective"] = inst.reference_objective if inst else None
    run["reference_source"] = inst.reference_source if inst else None
    run["reference_status"] = inst.reference_status if inst else None
    return run


@app.post(f"{API}/runs/{{run_id}}/cancel")
def cancel_run(run_id: str):
    run = _run_or_404(run_id)
    if run["status"] not in ("queued", "running"):
        raise HTTPException(409, f"Run is already {run['status']}")
    engine.cancel(run_id)
    return {"id": run_id, "status": "cancelling"}


@app.get(f"{API}/runs/{{run_id}}/events/history")
def run_events_history(run_id: str, after: int = 0, limit: int = Query(5000, le=20000)):
    _run_or_404(run_id)
    return store.events_after(run_id, after, limit)


@app.get(f"{API}/runs/{{run_id}}/events")
async def run_events(run_id: str, request: Request, after: int = 0):
    """Server-Sent Events stream. Resumes from Last-Event-ID after a reconnect."""
    _run_or_404(run_id)
    last = request.headers.get("last-event-id")
    cursor = int(last) if last and last.isdigit() else after

    async def stream():
        nonlocal cursor
        yield "retry: 2000\n\n"
        idle = 0
        while True:
            if await request.is_disconnected():
                return
            events = store.events_after(run_id, cursor, 500)
            for ev in events:
                cursor = ev["seq"]
                payload = json.dumps({"t": ev["t"], "type": ev["type"], "data": ev["data"]})
                yield f"id: {ev['seq']}\nevent: solver_event\ndata: {payload}\n\n"
            run = store.get_run(run_id)
            if run["status"] not in ("queued", "running") and not events:
                yield f"event: end\ndata: {json.dumps({'status': run['status']})}\n\n"
                return
            idle = 0 if events else idle + 1
            if idle and idle % 50 == 0:
                yield ": keep-alive\n\n"
            await asyncio.sleep(0.2)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def _passport(run: dict) -> dict:
    inst = catalog.get(run["collection"], run["instance"])
    events = store.events_after(run["id"], 0, 100000)
    trace = "\n".join(json.dumps(e, sort_keys=True) for e in events).encode()
    cfg_hash = hashlib.sha256(json.dumps(run["config"], sort_keys=True).encode()).hexdigest()
    gpus = system.gpus()
    return {
        "passport_version": 1,
        "run_id": run["id"],
        "model": {
            "collection": run["collection"],
            "name": run["instance"],
            "sha256": sha256_file(inst.path) if inst and inst.path else None,
            "size_bytes": inst.size_bytes if inst else None,
        },
        "solver": {"version": config.SOLVER_VERSION, "engine": run["engine"]},
        "configuration": run["config"],
        "configuration_sha256": cfg_hash,
        "random_seed": run["config"].get("seed"),
        "deterministic": run["config"].get("deterministic"),
        "hardware": {**system.host(), "gpu": gpus[0]["name"] if gpus else None,
                     "gpu_driver": gpus[0]["driver"] if gpus else None},
        "result": {
            "status": run["result_status"],
            "objective": run["objective"],
            "bound": run["bound"],
            "gap": run["gap"],
            "iterations": run["iterations"],
            "nodes": run["nodes"],
            "elapsed_seconds": run["elapsed"],
        },
        "verification": run["verification"],
        "reference": {
            "objective": inst.reference_objective if inst else None,
            "status": inst.reference_status if inst else None,
            "source": inst.reference_source if inst else None,
        },
        "timestamps": {"created": run["created_at"], "started": run["started_at"], "finished": run["finished_at"]},
        "artifacts": {"trace.jsonl": hashlib.sha256(trace).hexdigest()},
    }


@app.get(f"{API}/runs/{{run_id}}/passport")
def run_passport(run_id: str):
    run = _run_or_404(run_id)
    if run["status"] in ("queued", "running"):
        raise HTTPException(409, "The passport is issued when the run finishes.")
    return _passport(run)


@app.get(f"{API}/runs/{{run_id}}/evidence")
def run_evidence(run_id: str):
    run = _run_or_404(run_id)
    if run["status"] in ("queued", "running"):
        raise HTTPException(409, "Evidence is bundled when the run finishes.")
    passport = _passport(run)
    events = store.events_after(run_id, 0, 100000)
    inst = catalog.get(run["collection"], run["instance"])
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("passport.json", json.dumps(passport, indent=2))
        z.writestr("configuration.json", json.dumps(run["config"], indent=2))
        z.writestr("trace.jsonl", "\n".join(json.dumps(e, sort_keys=True) for e in events))
        z.writestr("verification.json", json.dumps(run["verification"], indent=2))
        if inst:
            a = catalog.analysis(inst)
            if a:
                a = {k: v for k, v in a.items() if k != "sparsity"}
                z.writestr("model_profile.json", json.dumps(a, indent=2))
    return Response(buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{run_id}.evidence.zip"'})
