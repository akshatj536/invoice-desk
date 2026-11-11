"""HTTP API + live run stream (SSE) + static frontend."""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
import uuid
import warnings
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

warnings.filterwarnings("ignore")

from fastapi import FastAPI, File, HTTPException, Request, UploadFile  # noqa: E402
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from . import config, runs_db  # noqa: E402
from .pipeline import orchestrator  # noqa: E402
from .pipeline.util import mask  # noqa: E402
from .store import get_store, store_note  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("app")

app = FastAPI(title="Invoice → PO → Decision", version="1.0")


@app.on_event("startup")
def _backfill() -> None:
    n = orchestrator.backfill_reviews()
    if n:
        log.info("backfilled pipeline updates for %d reviewed run(s)", n)
executor = ThreadPoolExecutor(max_workers=3, thread_name_prefix="run")
MAX_UPLOAD = 15 * 1024 * 1024


def _manifest() -> list[dict]:
    p = config.INVOICES_DIR / "manifest.json"
    return json.loads(p.read_text()) if p.exists() else []


def _start(filename: str, path: Path, source: str) -> dict:
    run_id = runs_db.create_run(filename, str(path), source)
    executor.submit(orchestrator.safe_execute, run_id)
    return {"id": run_id}


def _sheet_url(tab: str | None = None) -> str | None:
    s = get_store()
    try:
        return s.sheet_url(tab) if tab else s.sheet_url()
    except TypeError:
        return s.sheet_url()


# --------------------------------------------------------------------------- config / samples
@app.get("/api/config")
def get_config():
    store = get_store()
    return {"model": config.GEMINI_MODEL, "store": store_note(), "store_backend": store.backend,
            "sheet_url": _sheet_url(), "policy": config.POLICY.as_dict(), "stages": orchestrator.stage_list()}


@app.get("/api/samples")
def samples():
    return _manifest()


@app.get("/api/samples/{name}/pdf")
def sample_pdf(name: str):
    p = config.INVOICES_DIR / Path(name).name
    if not p.exists() or p.suffix != ".pdf":
        raise HTTPException(404)
    return FileResponse(p, media_type="application/pdf")


# --------------------------------------------------------------------------- runs
class SampleRun(BaseModel):
    file: str


@app.post("/api/runs/sample")
def run_sample(body: SampleRun):
    src = config.INVOICES_DIR / Path(body.file).name
    if not src.exists():
        raise HTTPException(404, "sample not found")
    dest = config.UPLOADS_DIR / f"{uuid.uuid4().hex[:8]}_{src.name}"
    shutil.copy(src, dest)
    return _start(src.name, dest, "sample")


@app.post("/api/runs")
async def run_upload(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(400, "empty file")
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "file too large (15 MB max)")
    name = Path(file.filename or "invoice.pdf").name
    dest = config.UPLOADS_DIR / f"{uuid.uuid4().hex[:8]}_{name}"
    dest.write_bytes(data)
    return _start(name, dest, "upload")


def _light(r: dict) -> dict:
    keep = ("id", "created_at", "completed_at", "filename", "source", "status", "decision", "final_decision",
            "reason_codes", "vendor_name", "invoice_number", "invoice_date", "po_number", "po_inferred", "currency",
            "total", "kind", "explanation", "next_action", "review_status", "review_note", "reviewed_at",
            "duration_ms", "model")
    out = {k: r.get(k) for k in keep}
    out["can_approve"] = bool(r.get("act_payload"))
    return out


@app.get("/api/runs")
def list_runs():
    runs = [_light(r) for r in runs_db.list_runs()]
    done = [r for r in runs if r["status"] in ("completed", "error")]
    by = lambda k, v: sum(1 for r in done if r[k] == v)
    durations = [r["duration_ms"] for r in done if r["duration_ms"]]
    stats = {
        "total": len(runs), "completed": len(done), "running": len(runs) - len(done),
        "auto_approved": by("decision", "APPROVE"), "held": by("decision", "HOLD"), "rejected": by("decision", "REJECT"),
        "pending_review": sum(1 for r in done if r["review_status"] == "pending"),
        "approved_on_review": sum(1 for r in done if r["review_status"] == "approved"),
        "auto_approval_rate": round(by("decision", "APPROVE") / len(done), 3) if done else None,
        "avg_duration_ms": int(sum(durations) / len(durations)) if durations else None,
        "value_approved": round(sum(r["total"] or 0 for r in done if r["final_decision"] == "APPROVE"), 2),
        "value_held": round(sum(r["total"] or 0 for r in done if r["review_status"] == "pending"), 2),
    }
    reasons: dict[str, int] = {}
    for r in done:
        for c in r["reason_codes"] or []:
            reasons[c] = reasons.get(c, 0) + 1
    stats["reasons"] = dict(sorted(reasons.items(), key=lambda kv: -kv[1]))
    return {"runs": runs, "stats": stats}


@app.get("/api/runs/{run_id}")
def get_run(run_id: str):
    r = runs_db.get_run(run_id)
    if not r:
        raise HTTPException(404)
    preview = None
    if r.get("act_payload"):
        ap = r["act_payload"]
        preview = {"po_number": ap["po_number"], "amount_add": ap["amount_add"],
                   "invoice_number": ap["log_entry"]["invoice_number"], "total": ap["log_entry"]["total"],
                   "line_qty_add": ap["line_qty_add"]}
    return {"run": _light(r), "events": runs_db.list_events(run_id), "act_preview": preview}


@app.get("/api/runs/{run_id}/pdf")
def run_pdf(run_id: str):
    r = runs_db.get_run(run_id)
    if not r or not Path(r["file_path"]).exists():
        raise HTTPException(404)
    return FileResponse(r["file_path"], media_type="application/pdf")


@app.get("/api/runs/{run_id}/stream")
async def stream(run_id: str, request: Request):
    if not runs_db.get_run(run_id):
        raise HTTPException(404)

    async def gen():
        last, ticks = 0, 0
        while True:
            events = await asyncio.to_thread(runs_db.list_events, run_id, last)
            done = False
            for e in events:
                last = e["seq"]
                yield f"id: {e['seq']}\ndata: {json.dumps(e, default=str)}\n\n"
                done = done or e["type"] == "run_completed"
            if done:
                yield "event: end\ndata: {}\n\n"
                return
            if await request.is_disconnected():
                return
            ticks += 1
            if ticks % 60 == 0:
                yield ": keep-alive\n\n"
            await asyncio.sleep(0.25)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


class ReviewBody(BaseModel):
    action: str
    note: str = ""


@app.post("/api/runs/{run_id}/review")
async def review(run_id: str, body: ReviewBody):
    try:
        return await asyncio.to_thread(orchestrator.resolve_review, run_id, body.action, body.note)
    except orchestrator.ReviewError as e:
        raise HTTPException(400, str(e))


# --------------------------------------------------------------------------- records
@app.get("/api/records")
def records():
    snap = get_store().snapshot()
    vendors = []
    for v in snap.vendors:
        d = v.model_dump()
        d["bank_account"] = mask(v.bank_account)
        vendors.append(d)
    pos = []
    for p in snap.pos:
        d = p.model_dump() | {"remaining": p.remaining,
                              "lines": [l.model_dump() | {"qty_remaining": l.qty_remaining}
                                        for l in snap.lines_for(p.po_number)]}
        pos.append(d)
    return {"source": store_note(), "sheet_url": _sheet_url(),
            "tab_urls": {t: _sheet_url(t) for t in ("Vendors", "POs", "PO_Lines", "Invoice_Log")},
            "vendors": vendors, "pos": pos,
            "invoice_log": [e.model_dump() for e in reversed(snap.invoice_log)]}


@app.post("/api/reset")
async def reset():
    await asyncio.to_thread(get_store().reset)
    runs_db.clear_all()
    return {"ok": True}


# --------------------------------------------------------------------------- frontend
if config.FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=config.FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = config.FRONTEND_DIST / path
        if path and f.is_file():
            return FileResponse(f)
        return FileResponse(config.FRONTEND_DIST / "index.html")
else:
    @app.get("/", include_in_schema=False)
    def root():
        return JSONResponse({"message": "API running. Build the frontend (cd frontend && npm run build)."})
