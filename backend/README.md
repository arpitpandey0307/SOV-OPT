# SOV-OPT control plane (API)

FastAPI service that catalogs models, profiles them, schedules runs and streams telemetry.

```bash
pip install -r requirements.txt
uvicorn app.main:app --port 8000
```

Environment:

| Variable | Default |
|----------|---------|
| `SOVOPT_DATASET_DIR` | `<repo>/Dataset` |
| `SOVOPT_CACHE_DIR` | `backend/.cache` |
| `SOVOPT_DATA_DIR` | `backend/.data` |
| `SOVOPT_CORS_ORIGINS` | `http://localhost:3000` |

Runs are executed by the `sovopt-preview` engine (`app/engine.py`) until the native C++/CUDA worker
is connected. Model profiling (`app/mps.py`), health scoring, hardware telemetry, hashes and the
passport are computed for real; preview-engine iteration traces and objectives for models
without a published reference value are simulated, and every such run is tagged
`engine = "sovopt-preview"`.
