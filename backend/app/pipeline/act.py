"""Stage 7 - Act: only APPROVE writes to the system of record. Code writes, never the model."""

from __future__ import annotations

import threading

from ..models import CheckResult, StageOutput
from .context import RunContext

_write_lock = threading.Lock()  # one writer at a time across concurrent runs


def run(ctx: RunContext) -> StageOutput:
    store = ctx.store
    if ctx.decision == "APPROVE":
        if ctx.approved_write is None:  # should not happen; fail closed
            ctx.decision, ctx.reason_codes = "HOLD", ["SYSTEM_ERROR"]
            chk = CheckResult(id="act.write", stage="act", label="Records updated", status="fail",
                              reason_code="SYSTEM_ERROR", message="Approved but nothing to write - held for review.")
            return StageOutput(summary="Nothing to write - held", checks=[chk])
        ctx.progress(f"Writing to the {'Google Sheet' if store.backend == 'gsheets' else 'records'}: "
                     f"invoice log row, PO {ctx.approved_write.po_number} and its lines")
        try:
            with _write_lock:
                changes = store.record_approved_invoice(ctx.approved_write)
        except Exception as e:
            ctx.decision, ctx.reason_codes = "HOLD", ["SYSTEM_ERROR"]
            chk = CheckResult(id="act.write", stage="act", label="Records updated", status="fail",
                              reason_code="SYSTEM_ERROR",
                              message=f"Could not write to the records ({type(e).__name__}). Held - nothing was recorded.")
            return StageOutput(summary="Write failed - held for review", checks=[chk])
        po = changes.get("po", {})
        return StageOutput(
            summary=(f"Logged {ctx.approved_write.log_entry.invoice_number} · {po.get('po_number')} now "
                     f"{po.get('status')} ({'$' + format(po.get('remaining', 0), ',.2f')} left)"),
            data={"written": True, "changes": changes, "sheet_url": _url(store, "Invoice_Log")},
            checks=[CheckResult(id="act.write", stage="act", label="Records updated", status="pass",
                                message="Invoice log row added; PO and PO lines updated")])
    if ctx.decision == "HOLD":
        can = ctx.approved_write is not None
        return StageOutput(summary="Nothing written - sent to the review queue",
                           data={"written": False, "queued_for_review": True, "reviewer_can_approve": can})
    return StageOutput(summary="Nothing written - rejected", data={"written": False})


def _url(store, tab):
    try:
        return store.sheet_url(tab)
    except TypeError:
        return store.sheet_url()
