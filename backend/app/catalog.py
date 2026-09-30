"""Model catalog built from the local benchmark datasets and user uploads."""

from __future__ import annotations

import csv
import json
import logging
import subprocess
import threading
from dataclasses import asdict, dataclass, field
from pathlib import Path

from . import config
from .health import scorecard, summary_status
from .mps import analyze_mps

log = logging.getLogger("sovopt.catalog")

# Optimal objective values published in the Netlib LP readme.
NETLIB_REFERENCE = {
    "afiro": -4.6475314286e02,
    "adlittle": 2.2549496316e05,
    "blend": -3.0812149846e01,
    "degen2": -1.4351780000e03,
    "degen3": -9.8729400000e02,
    "greenbea": -7.2555248130e07,
    "perold": -9.3807552782e03,
    "pilot": -5.5748972928e02,
}

COLLECTIONS = {
    "netlib": {"title": "Netlib LP", "kind": "LP",
               "description": "Classic linear programs, including the degenerate and ill-conditioned PILOT, GREENBEA, PEROLD and DEGEN models."},
    "miplib2017": {"title": "MIPLIB 2017 Benchmark", "kind": "MILP",
                   "description": "The 240-instance benchmark set of the Mixed Integer Programming Library 2017."},
    "maros-meszaros": {"title": "Maros-Meszaros", "kind": "QP",
                       "description": "138 convex quadratic programs in QPS format."},
    "qplib": {"title": "QPLIB", "kind": "QP",
              "description": "Quadratic programming instances with published structure metadata and best known objectives."},
    "uploads": {"title": "Uploaded models", "kind": "any",
                "description": "Models uploaded to this workspace."},
}


@dataclass
class Instance:
    collection: str
    name: str
    path: str | None
    size_bytes: int
    kind: str
    rows: int | None = None
    cols: int | None = None
    nnz: int | None = None
    integer_cols: int | None = None
    reference_objective: float | None = None
    reference_source: str | None = None
    # opt = proven optimal, best = best known (open), inf = infeasible, unbd = unbounded
    reference_status: str | None = None
    analyzable: bool = True
    meta: dict = field(default_factory=dict)

    @property
    def key(self) -> str:
        return f"{self.collection}/{self.name}"


class Catalog:
    def __init__(self) -> None:
        self._items: dict[str, Instance] = {}
        self._lock = threading.Lock()
        self._analysis_state: dict[str, str] = {}
        self._analysis_progress: dict[str, int] = {}
        self._analysis_errors: dict[str, str] = {}
        self._indexer_done = threading.Event()
        self.reload()

    # ---------------------------------------------------------------- loading

    def reload(self) -> None:
        items: dict[str, Instance] = {}
        for inst in self._load_netlib() + self._load_miplib() + self._load_maros() + self._load_qplib() + self._load_uploads():
            items[inst.key] = inst
        with self._lock:
            self._items = items
        for key, inst in items.items():
            cached = self._cache_path(inst)
            if cached.exists():
                self._apply_analysis(inst, json.loads(cached.read_text()))
                self._analysis_state[key] = "ready"

    def _load_netlib(self) -> list[Instance]:
        out = []
        for f in sorted(config.DATASET_DIR.glob("*.txt")):
            name = f.stem.lower()
            if name == "emps":
                continue
            # Compressed Netlib header: a NAME line followed by a line of sizes
            # (rows including the objective, columns, ...).
            nums: list[str] = []
            with open(f, encoding="latin-1") as fh:
                for line in fh:
                    if line.startswith("NAME"):
                        nums = fh.readline().split()
                        break
            mps = config.NETLIB_MPS_DIR / f"{name}.mps"
            if not mps.exists() and config.EMPS_BIN.exists():
                with open(mps, "w") as out_f:
                    subprocess.run([str(config.EMPS_BIN), str(f)], stdout=out_f, check=False)
            inst = Instance(
                collection="netlib", name=name, path=str(mps) if mps.exists() else None,
                size_bytes=f.stat().st_size, kind="LP",
                rows=int(nums[0]) - 1 if nums else None,
                cols=int(nums[1]) if len(nums) > 1 else None,
                reference_objective=NETLIB_REFERENCE.get(name),
                reference_status="opt" if name in NETLIB_REFERENCE else None,
                reference_source="Netlib LP readme" if name in NETLIB_REFERENCE else None,
                analyzable=mps.exists(),
            )
            out.append(inst)
        return out

    def _load_miplib(self) -> list[Instance]:
        d = config.DATASET_DIR / "benchmark"
        refs = self._load_solu(config.DATASET_DIR.glob("**/miplib*.solu"))
        out = []
        for f in sorted(d.glob("*.mps.gz")):
            name = f.name[: -len(".mps.gz")]
            status, value = refs.get(name, (None, None))
            out.append(Instance(
                collection="miplib2017", name=name, path=str(f), size_bytes=f.stat().st_size, kind="MILP",
                reference_objective=value, reference_status=status,
                reference_source="MIPLIB 2017 solu file" if status else None,
            ))
        return out

    def _load_maros(self) -> list[Instance]:
        d = config.DATASET_DIR / "maros-meszaros-mirror-master" / "maros-meszaros-mirror-master"
        return [
            Instance(collection="maros-meszaros", name=f.stem.lower(), path=str(f),
                     size_bytes=f.stat().st_size, kind="QP")
            for f in sorted(d.glob("*.SIF"))
        ]

    def _load_qplib(self) -> list[Instance]:
        base = config.DATASET_DIR / "qplib" / "qplib"
        csv_path = base / "html" / "instancedata.csv"
        if not csv_path.exists():
            return []
        refs = self._load_solu([base / "html" / "qplib.solu"])
        files = {f.stem: f for f in base.glob("**/*.qplib")}
        out = []
        with open(csv_path, newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                name = row["name"]
                ints = int(row["nbinvars"]) + int(row["nintvars"])
                probtype = row["probtype"]
                kind = "MIQP" if ints and probtype[0] == "Q" else "QP" if probtype[0] == "Q" else probtype
                qfile = files.get(name)
                out.append(Instance(
                    collection="qplib", name=name.lower(), path=str(qfile) if qfile else None,
                    size_bytes=qfile.stat().st_size if qfile else 0, kind=kind,
                    rows=int(row["ncons"]), cols=int(row["nvars"]), nnz=int(row["nz"]) if row["nz"] else None,
                    integer_cols=ints,
                    reference_objective=refs.get(name, (None, None))[1],
                    reference_status=refs.get(name, (None, None))[0],
                    reference_source="QPLIB solu file" if name in refs else None,
                    analyzable=False,
                    meta={
                        "probtype": probtype,
                        "objcurvature": row["objcurvature"],
                        "convex": row["convex"] == "True",
                        "objsense": row["objsense"],
                        "objquadnz": int(row["nobjquadnz"] or 0),
                        "density": float(row["density"] or 0),
                        "donor": row["donor"],
                    },
                ))
        return out

    def _load_uploads(self) -> list[Instance]:
        out = []
        for f in sorted(config.UPLOAD_DIR.glob("*")):
            if f.suffix == ".json":
                continue
            name = f.name.split(".")[0]
            out.append(Instance(collection="uploads", name=name, path=str(f), size_bytes=f.stat().st_size, kind="LP"))
        return out

    @staticmethod
    def _load_solu(paths) -> dict[str, tuple[str, float | None]]:
        """Parse .solu files: `=opt= name value`, `=best= name value`, `=inf= name`, ..."""
        refs: dict[str, tuple[str, float | None]] = {}
        for p in paths:
            p = Path(p)
            if not p.exists():
                continue
            for line in p.read_text(errors="replace").splitlines():
                tok = line.split()
                if len(tok) < 2 or not (tok[0].startswith("=") and tok[0].endswith("=")):
                    continue
                status = tok[0].strip("=")
                value = None
                if status in ("opt", "best") and len(tok) >= 3:
                    try:
                        value = float(tok[2])
                    except ValueError:
                        continue
                refs[tok[1]] = (status, value)
        return refs

    # ---------------------------------------------------------------- queries

    def list(self) -> list[Instance]:
        with self._lock:
            return list(self._items.values())

    def get(self, collection: str, name: str) -> Instance | None:
        with self._lock:
            return self._items.get(f"{collection}/{name}")

    def add_upload(self, path: Path) -> Instance:
        inst = Instance(collection="uploads", name=path.name.split(".")[0], path=str(path),
                        size_bytes=path.stat().st_size, kind="LP")
        with self._lock:
            self._items[inst.key] = inst
        return inst

    def collection_summary(self) -> list[dict]:
        items = self.list()
        out = []
        for cid, meta in COLLECTIONS.items():
            members = [i for i in items if i.collection == cid]
            if cid == "uploads" and not members:
                continue
            out.append({
                "id": cid, **meta,
                "count": len(members),
                "analyzed": sum(1 for i in members if self._analysis_state.get(i.key) == "ready"),
                "with_reference": sum(1 for i in members if i.reference_status is not None),
                "size_bytes": sum(i.size_bytes for i in members),
            })
        return out

    # --------------------------------------------------------------- analysis

    def _cache_path(self, inst: Instance) -> Path:
        return config.ANALYSIS_DIR / inst.collection / f"{inst.name}.json"

    def analysis_state(self, inst: Instance) -> str:
        if not inst.analyzable or not inst.path:
            return "unavailable"
        return self._analysis_state.get(inst.key, "pending")

    def analysis(self, inst: Instance) -> dict | None:
        p = self._cache_path(inst)
        return json.loads(p.read_text()) if p.exists() else None

    def analysis_progress(self, inst: Instance) -> dict:
        return {
            "state": self.analysis_state(inst),
            "lines": self._analysis_progress.get(inst.key, 0),
            "error": self._analysis_errors.get(inst.key),
        }

    def request_analysis(self, inst: Instance) -> None:
        if self.analysis_state(inst) in ("ready", "running", "unavailable"):
            return
        self._analysis_state[inst.key] = "running"
        threading.Thread(target=self._run_analysis, args=(inst,), daemon=True).start()

    def _run_analysis(self, inst: Instance) -> None:
        key = inst.key
        try:
            def progress(lines):
                self._analysis_progress[key] = lines
            a = analyze_mps(Path(inst.path), progress=progress)
            a["health"] = scorecard(a)
            a["health_status"] = summary_status(a["health"])
            p = self._cache_path(inst)
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(json.dumps(a))
            self._apply_analysis(inst, a)
            self._analysis_state[key] = "ready"
        except Exception as e:  # noqa: BLE001 - surfaced to the client
            log.exception("analysis failed for %s", key)
            self._analysis_errors[key] = str(e)
            self._analysis_state[key] = "failed"

    @staticmethod
    def _apply_analysis(inst: Instance, a: dict) -> None:
        inst.rows = a["rows"]
        inst.cols = a["cols"]
        inst.nnz = a["nnz"]
        inst.integer_cols = a["integer_cols"]
        if inst.collection == "uploads":
            inst.kind = a["kind"]

    def start_background_indexer(self, max_bytes: int = 30 * 1024 * 1024) -> None:
        """Analyze every local instance, smallest file first."""

        def run():
            todo = sorted(
                (i for i in self.list() if i.analyzable and i.path and i.size_bytes <= max_bytes),
                key=lambda i: i.size_bytes,
            )
            for inst in todo:
                if self.analysis_state(inst) in ("ready", "failed"):
                    continue
                self._analysis_state[inst.key] = "running"
                self._run_analysis(inst)
            self._indexer_done.set()

        threading.Thread(target=run, daemon=True, name="catalog-indexer").start()

    def to_dict(self, inst: Instance) -> dict:
        d = asdict(inst)
        d.pop("path")
        d["analysis_state"] = self.analysis_state(inst)
        return d
