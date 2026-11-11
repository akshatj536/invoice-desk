"""Runs the 8 stages in order, records every event, and fails closed.

Any exception in a stage becomes a HOLD (SYSTEM_ERROR) - the process never
approves something it could not fully check.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path

from .. import runs_db
from ..models import CheckResult
from ..reasons import label
from ..store import ApprovedWrite, get_store
from . import act, decide, explain, extract, ingest, match, reconcile, validate
from .context import RunContext

log = logging.getLogger(__name__)

STAGES = [
    ("ingest", "Ingest", ingest.run),
    ("extract", "Read invoice", extract.run),
    ("validate", "Validate", validate.run),
    ("match", "Match vendor & PO", match.run),
    ("reconcile", "Reconcile", reconcile.run),
    ("decide", "Decide", decide.run),
    ("act", "Update records", act.run),
    ("explain", "Explain", explain.run),
]
ALWAYS_RUN = {"decide", "act", "explain"}


def stage_list() -> list[dict]:
    return [{"key": k, "title": t} for k, t, _ in STAGES]


def _progress_fields(ctx: RunContext) -> dict:
    f: dict = {}
    x = ctx.extraction
    if x:
        f.update(vendor_name=x.vendor_name, invoice_number=x.invoice_number, invoice_date=x.invoice_date,
                 total=x.total, currency=(x.currency or "USD"))
    if ctx.vendor:
        f.update(vendor_id=ctx.vendor.vendor_id, vendor_name=ctx.vendor.legal_name)
    if ctx.po:
        f.update(po_number=ctx.po.po_number, po_inferred=int(ctx.po_inferred))
    if ctx.kind:
        f["kind"] = ctx.kind
    return f


def execute(run_id: str) -> RunContext:
    run = runs_db.get_run(run_id)
    ctx = RunContext(run_id=run_id, pdf_path=Path(run["file_path"]), filename=run["filename"], store=get_store())
    started = time.perf_counter()
    runs_db.update_run(run_id, status="running")
    runs_db.add_event(run_id, "run_started", None, {"stages": stage_list(), "filename": ctx.filename})

    for key, title, fn in STAGES:
        if ctx.halted and key not in ALWAYS_RUN:
            runs_db.add_event(run_id, "stage_skipped", key, {"title": title, "reason": ctx.halted})
            continue
        runs_db.add_event(run_id, "stage_started", key, {"title": title})
        ctx.progress = lambda msg, _k=key: runs_db.add_event(run_id, "stage_progress", _k, {"message": msg})
        t0 = time.perf_counter()
        try:
            out = fn(ctx)
        except Exception as e:
            log.exception("stage %s failed", key)
            chk = CheckResult(id=f"{key}.system", stage=key, label=f"{title} completed", status="fail",
                              reason_code="SYSTEM_ERROR",
                              message=f"{title} could not complete ({type(e).__name__}: {str(e)[:160]}). "
                                      f"Held for manual processing rather than guessing.")
            ctx.checks.append(chk)
            ctx.halted = f"{title} failed"
            runs_db.add_event(run_id, "stage_failed", key, {
                "title": title, "error": f"{type(e).__name__}: {e}", "checks": [chk.model_dump(mode="json")],
                "duration_ms": int((time.perf_counter() - t0) * 1000)})
            continue
        ctx.checks.extend(out.checks)
        runs_db.add_event(run_id, "stage_completed", key, {
            "title": title, "summary": out.summary, "data": out.data,
            "checks": [c.model_dump(mode="json") for c in out.checks], "llm_calls": out.llm_calls,
            "duration_ms": int((time.perf_counter() - t0) * 1000)})
        if prog := _progress_fields(ctx):
            runs_db.update_run(run_id, **prog)

    if ctx.decision is None:  # decide itself failed - never approve by accident
        ctx.decision, ctx.reason_codes = "HOLD", ["SYSTEM_ERROR"]

    review = "pending" if ctx.decision == "HOLD" else "none"
    runs_db.update_run(
        run_id, status="completed", completed_at=runs_db.now(), decision=ctx.decision, final_decision=ctx.decision,
        reason_codes=ctx.reason_codes, explanation=ctx.explanation, next_action=ctx.next_action,
        act_payload=ctx.approved_write.model_dump(mode="json") if ctx.approved_write else None,
        review_status=review, duration_ms=int((time.perf_counter() - started) * 1000), **_progress_fields(ctx))
    runs_db.add_event(run_id, "run_completed", None, {
        "decision": ctx.decision, "reason_codes": ctx.reason_codes, "explanation": ctx.explanation,
        "next_action": ctx.next_action, "review_status": review,
        "checks": [c.model_dump(mode="json") for c in ctx.checks]})
    return ctx


def safe_execute(run_id: str) -> None:
    """Thread entry point: anything unexpected marks the run as an error + HOLD."""
    try:
        execute(run_id)
    except Exception as e:
        log.exception("run %s crashed", run_id)
        runs_db.update_run(run_id, status="error", decision="HOLD", final_decision="HOLD",
                           reason_codes=["SYSTEM_ERROR"], review_status="pending",
                           explanation=f"The run crashed ({type(e).__name__}). Nothing was recorded.",
                           next_action="Process this invoice manually.", completed_at=runs_db.now())
        runs_db.add_event(run_id, "run_completed", None, {"decision": "HOLD", "reason_codes": ["SYSTEM_ERROR"],
                                                          "explanation": f"The run crashed: {e}"})


class ReviewError(ValueError):
    pass


def resolve_review(run_id: str, action: str, note: str, reviewer: str = "AP reviewer") -> dict:
    """A person resolves a HOLD. The pipeline is updated so the run shows what the decision did:
    a 'Human review' step, a re-run 'Update records' step (what was written, or why nothing was),
    and an updated 'Explain' step - all recorded as events, so the run view replays them."""
    run = runs_db.get_run(run_id)
    if not run:
        raise ReviewError("run not found")
    if run["review_status"] != "pending":
        raise ReviewError(f"run is not awaiting review (status: {run['review_status']})")
    if action not in ("approve", "reject"):
        raise ReviewError("action must be 'approve' or 'reject'")
    note = (note or "").strip()
    t0 = time.perf_counter()
    changes = None
    if action == "approve":
        if not run.get("act_payload"):
            raise ReviewError("this run has no PO / line match to record - it can only be rejected")
        write = ApprovedWrite.model_validate(run["act_payload"])
        write.log_entry.note = f"Approved on review by {reviewer}" + (f": {note}" if note else "")
        try:
            changes = get_store().record_approved_invoice(write)
        except Exception as e:  # nothing recorded -> stays in the queue
            raise ReviewError(f"could not write to the records ({type(e).__name__}): {e}") from e
    final = _emit_review_events(run, action, note, reviewer, runs_db.now(), changes,
                                duration_ms=int((time.perf_counter() - t0) * 1000))
    return {"final_decision": final, "changes": changes}


def _left(remaining: float) -> str:
    return f"${-remaining:,.2f} over the PO total" if remaining < -0.005 else f"${remaining:,.2f} left"


def _sheet_url(tab: str) -> str | None:
    store = get_store()
    try:
        return store.sheet_url(tab)
    except TypeError:
        return store.sheet_url()


def _emit_review_events(run: dict, action: str, note: str, reviewer: str, at: str, changes: dict | None,
                        duration_ms: int = 0) -> str:
    run_id = run["id"]
    held_for = ", ".join(label(c) for c in run.get("reason_codes") or []) or "a problem found by the checks"
    inv = run.get("invoice_number") or run["filename"]
    vendor = run.get("vendor_name") or "the vendor"
    po_number = (run.get("act_payload") or {}).get("po_number") or run.get("po_number")
    quoted = f": \u201c{note}\u201d" if note else ""
    final = "APPROVE" if action == "approve" else "REJECT"
    verb = "approved" if action == "approve" else "rejected"

    # 1. Human review step
    runs_db.add_event(run_id, "review_resolved", "review", {
        "title": "Human review", "action": action, "final_decision": final, "note": note, "reviewer": reviewer,
        "at": at, "held_for": held_for, "summary": f"{reviewer[:1].upper() + reviewer[1:]} {verb} it{quoted}"})

    # 2. Update records - re-run with the human decision
    runs_db.add_event(run_id, "stage_started", "act", {"title": "Update records", "after_review": True})
    if action == "approve":
        po = (changes or {}).get("po", {})
        runs_db.add_event(run_id, "stage_progress", "act", {
            "message": f"Reviewer approved - writing exactly what the run computed: invoice log row, "
                       f"{po_number} and its lines"})
        summary = (f"Logged {inv} after review · {po.get('po_number')} now {po.get('status')} "
                   f"({_left(po.get('remaining', 0))})") if po \
            else "Already recorded for this run - nothing written twice"
        runs_db.add_event(run_id, "stage_completed", "act", {
            "title": "Update records", "summary": summary,
            "data": {"written": True, "changes": changes or {}, "sheet_url": _sheet_url("Invoice_Log"),
                     "after_review": True, "reviewer": reviewer, "note": note, "at": at},
            "checks": [CheckResult(id="act.write", stage="act", label="Records updated", status="pass",
                                   message=f"Recorded after {reviewer} approved the hold: invoice log row added; "
                                           f"PO and PO lines updated").model_dump(mode="json")],
            "llm_calls": [], "duration_ms": duration_ms})
        explanation = (f"A reviewer approved this held invoice{quoted}. The system had held it for: {held_for}. "
                       f"It is now recorded against {po_number}"
                       + (f", which is now {po.get('status')} ({_left(po.get('remaining', 0))})." if po else "."))
        next_action = "No further action - it is recorded and ready for the next payment run."
    else:
        runs_db.add_event(run_id, "stage_completed", "act", {
            "title": "Update records", "summary": "Nothing written - rejected by the reviewer",
            "data": {"written": False, "rejected_on_review": True, "reviewer": reviewer, "note": note, "at": at},
            "checks": [], "llm_calls": [], "duration_ms": duration_ms})
        explanation = (f"A reviewer rejected this invoice{quoted}. The system had held it for: {held_for}. "
                       f"Nothing was recorded and nothing will be paid.")
        next_action = (f"Tell {vendor} that {inv} was rejected and why; nothing is owed on it unless a corrected "
                       f"invoice arrives.")

    # 3. Explain - the final outcome in plain English (no model needed: the facts are the decision)
    runs_db.add_event(run_id, "stage_started", "explain", {"title": "Explain", "after_review": True})
    runs_db.add_event(run_id, "stage_completed", "explain", {
        "title": "Explain", "summary": explanation,
        "data": {"summary": explanation, "next_action": next_action, "source": "review",
                 "system_explanation": run.get("explanation")},
        "checks": [], "llm_calls": [], "duration_ms": 0})

    runs_db.update_run(run_id, review_status=verb, final_decision=final, review_note=note, reviewed_at=at,
                       next_action=next_action)
    runs_db.add_event(run_id, "run_reviewed", None, {"final_decision": final, "review_status": verb,
                                                     "next_action": next_action})
    return final


def backfill_reviews() -> int:
    """Runs resolved before the pipeline-update feature existed get the same events, built from what was
    stored at review time. Events only - nothing is written to the records again. Idempotent."""
    n = 0
    for r in runs_db.list_runs(limit=1000):
        if r.get("review_status") not in ("approved", "rejected"):
            continue
        evs = runs_db.list_events(r["id"])
        if any(e["type"] == "run_reviewed" for e in evs):
            continue
        old = next((e["payload"] for e in reversed(evs) if e["type"] == "review_resolved"), {})
        _emit_review_events(r, "approve" if r["review_status"] == "approved" else "reject",
                            old.get("note", r.get("review_note") or ""), old.get("reviewer", "AP reviewer"),
                            r.get("reviewed_at") or runs_db.now(), old.get("changes"))
        n += 1
    return n
