"""Runtime configuration for the SOV-OPT control plane."""

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent

DATASET_DIR = Path(os.environ.get("SOVOPT_DATASET_DIR", REPO_DIR / "Dataset"))
CACHE_DIR = Path(os.environ.get("SOVOPT_CACHE_DIR", BACKEND_DIR / ".cache"))
DATA_DIR = Path(os.environ.get("SOVOPT_DATA_DIR", BACKEND_DIR / ".data"))
EMPS_BIN = Path(os.environ.get("SOVOPT_EMPS_BIN", REPO_DIR / "tools" / "emps" / "emps.exe"))

UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "sovopt.db"
ANALYSIS_DIR = CACHE_DIR / "analysis"
NETLIB_MPS_DIR = CACHE_DIR / "netlib"

MAX_UPLOAD_BYTES = 200 * 1024 * 1024

SOLVER_VERSION = "0.1.0"
ENGINE_ID = "sovopt-preview"

CORS_ORIGINS = os.environ.get(
    "SOVOPT_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(",")

for d in (UPLOAD_DIR, ANALYSIS_DIR, NETLIB_MPS_DIR):
    d.mkdir(parents=True, exist_ok=True)
