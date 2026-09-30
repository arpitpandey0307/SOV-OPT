"""Run and event persistence (SQLite for the single-node profile)."""

from __future__ import annotations

import json
import sqlite3
import threading
import time
import uuid

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    id              TEXT PRIMARY KEY,
    collection      TEXT NOT NULL,
    instance        TEXT NOT NULL,
    kind            TEXT NOT NULL,
    config          TEXT NOT NULL,
    engine          TEXT NOT NULL,
    status          TEXT NOT NULL,
    result_status   TEXT,
    objective       REAL,
    bound           REAL,
    gap             REAL,
    iterations      INTEGER DEFAULT 0,
    nodes           INTEGER DEFAULT 0,
    elapsed         REAL DEFAULT 0,
    verification    TEXT,
    created_at      REAL NOT NULL,
    started_at      REAL,
    finished_at     REAL
);
CREATE TABLE IF NOT EXISTS events (
    run_id  TEXT NOT NULL,
    seq     INTEGER NOT NULL,
    t       REAL NOT NULL,
    type    TEXT NOT NULL,
    data    TEXT NOT NULL,
    PRIMARY KEY (run_id, seq)
);
CREATE INDEX IF NOT EXISTS runs_created ON runs(created_at DESC);
"""

RUN_FIELDS = ("status", "result_status", "objective", "bound", "gap", "iterations",
              "nodes", "elapsed", "verification", "started_at", "finished_at")


class Store:
    def __init__(self, path=config.DB_PATH) -> None:
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.executescript(SCHEMA)
        self._lock = threading.Lock()
        self._seq: dict[str, int] = {}
        # Runs that were active when the process stopped cannot be resumed.
        self._db.execute(
            "UPDATE runs SET status='failed', result_status='INTERRUPTED' WHERE status IN ('queued','running')")
        self._db.commit()

    def create_run(self, collection: str, instance: str, kind: str, cfg: dict, engine: str) -> dict:
        run_id = "run_" + uuid.uuid4().hex[:10]
        with self._lock:
            self._db.execute(
                "INSERT INTO runs (id, collection, instance, kind, config, engine, status, created_at) "
                "VALUES (?,?,?,?,?,?, 'queued', ?)",
                (run_id, collection, instance, kind, json.dumps(cfg), engine, time.time()))
            self._db.commit()
        return self.get_run(run_id)

    def update_run(self, run_id: str, **fields) -> None:
        cols = [k for k in fields if k in RUN_FIELDS]
        if not cols:
            return
        vals = [json.dumps(fields[k]) if k == "verification" else fields[k] for k in cols]
        with self._lock:
            self._db.execute(f"UPDATE runs SET {', '.join(c + '=?' for c in cols)} WHERE id=?", (*vals, run_id))
            self._db.commit()

    def get_run(self, run_id: str) -> dict | None:
        with self._lock:
            row = self._db.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()
        return self._row(row) if row else None

    def list_runs(self, limit: int = 50, collection: str | None = None, instance: str | None = None) -> list[dict]:
        q = "SELECT * FROM runs"
        args: list = []
        conds = []
        if collection:
            conds.append("collection=?")
            args.append(collection)
        if instance:
            conds.append("instance=?")
            args.append(instance)
        if conds:
            q += " WHERE " + " AND ".join(conds)
        q += " ORDER BY created_at DESC LIMIT ?"
        args.append(limit)
        with self._lock:
            rows = self._db.execute(q, args).fetchall()
        return [self._row(r) for r in rows]

    def run_counts(self) -> dict:
        with self._lock:
            rows = self._db.execute("SELECT status, COUNT(*) c FROM runs GROUP BY status").fetchall()
        return {r["status"]: r["c"] for r in rows}

    def add_event(self, run_id: str, t: float, type_: str, data: dict) -> int:
        with self._lock:
            seq = self._seq.get(run_id)
            if seq is None:
                row = self._db.execute("SELECT COALESCE(MAX(seq),0) FROM events WHERE run_id=?", (run_id,)).fetchone()
                seq = row[0]
            seq += 1
            self._seq[run_id] = seq
            self._db.execute("INSERT INTO events VALUES (?,?,?,?,?)", (run_id, seq, t, type_, json.dumps(data)))
            self._db.commit()
        return seq

    def events_after(self, run_id: str, after: int = 0, limit: int = 1000) -> list[dict]:
        with self._lock:
            rows = self._db.execute(
                "SELECT seq, t, type, data FROM events WHERE run_id=? AND seq>? ORDER BY seq LIMIT ?",
                (run_id, after, limit)).fetchall()
        return [{"seq": r["seq"], "t": r["t"], "type": r["type"], "data": json.loads(r["data"])} for r in rows]

    @staticmethod
    def _row(row: sqlite3.Row) -> dict:
        d = dict(row)
        d["config"] = json.loads(d["config"])
        d["verification"] = json.loads(d["verification"]) if d["verification"] else None
        return d
