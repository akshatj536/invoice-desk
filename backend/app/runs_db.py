"""SQLite audit trail: every run, every stage event. Separate from the business spreadsheet."""

from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any

from . import config

_lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    filename TEXT, file_path TEXT, source TEXT,
    status TEXT NOT NULL DEFAULT 'queued',          -- queued | running | completed | error
    decision TEXT,                                  -- system decision: APPROVE | HOLD | REJECT
    final_decision TEXT,                            -- after human review (or = decision)
    reason_codes TEXT DEFAULT '[]',
    vendor_name TEXT, vendor_id TEXT, invoice_number TEXT, invoice_date TEXT,
    po_number TEXT, po_inferred INTEGER DEFAULT 0,
    currency TEXT, total REAL, kind TEXT,
    explanation TEXT, next_action TEXT,
    act_payload TEXT,
    review_status TEXT DEFAULT 'none',              -- none | pending | approved | rejected
    review_note TEXT, reviewed_at TEXT,
    duration_ms INTEGER, model TEXT
);
CREATE TABLE IF NOT EXISTS events (
    run_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    ts TEXT NOT NULL,
    type TEXT NOT NULL,
    stage TEXT,
    payload TEXT,
    PRIMARY KEY (run_id, seq)
);
"""

JSON_COLS = {"reason_codes", "act_payload"}


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


@contextmanager
def conn():
    c = sqlite3.connect(config.RUNS_DB_PATH, timeout=10)
    c.row_factory = sqlite3.Row
    try:
        yield c
        c.commit()
    finally:
        c.close()


def init() -> None:
    with conn() as c:
        c.execute("PRAGMA journal_mode=WAL")
        c.executescript(SCHEMA)


def _row(r: sqlite3.Row | None) -> dict | None:
    if r is None:
        return None
    d = dict(r)
    for k in JSON_COLS:
        if d.get(k):
            d[k] = json.loads(d[k])
    d["po_inferred"] = bool(d.get("po_inferred"))
    return d


def create_run(filename: str, file_path: str, source: str) -> str:
    run_id = datetime.now(timezone.utc).strftime("%m%d-%H%M%S-") + uuid.uuid4().hex[:4]
    with conn() as c:
        c.execute("INSERT INTO runs (id, created_at, filename, file_path, source, model) VALUES (?,?,?,?,?,?)",
                  (run_id, now(), filename, file_path, source, config.GEMINI_MODEL))
    return run_id


def update_run(run_id: str, **fields: Any) -> None:
    if not fields:
        return
    for k in JSON_COLS & fields.keys():
        fields[k] = json.dumps(fields[k]) if fields[k] is not None else None
    cols = ", ".join(f"{k} = ?" for k in fields)
    with conn() as c:
        c.execute(f"UPDATE runs SET {cols} WHERE id = ?", (*fields.values(), run_id))


def get_run(run_id: str) -> dict | None:
    with conn() as c:
        return _row(c.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone())


def list_runs(limit: int = 200) -> list[dict]:
    with conn() as c:
        rows = c.execute("SELECT * FROM runs ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    return [_row(r) for r in rows]


def add_event(run_id: str, type_: str, stage: str | None, payload: dict | None = None) -> int:
    with _lock, conn() as c:
        seq = c.execute("SELECT COALESCE(MAX(seq), 0) + 1 FROM events WHERE run_id = ?", (run_id,)).fetchone()[0]
        c.execute("INSERT INTO events (run_id, seq, ts, type, stage, payload) VALUES (?,?,?,?,?,?)",
                  (run_id, seq, now(), type_, stage, json.dumps(payload or {}, default=str)))
    return seq


def list_events(run_id: str, after_seq: int = 0) -> list[dict]:
    with conn() as c:
        rows = c.execute("SELECT * FROM events WHERE run_id = ? AND seq > ? ORDER BY seq",
                         (run_id, after_seq)).fetchall()
    return [{**dict(r), "payload": json.loads(r["payload"] or "{}")} for r in rows]


def clear_all() -> None:
    with conn() as c:
        c.execute("DELETE FROM events")
        c.execute("DELETE FROM runs")


init()
