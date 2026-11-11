"""Stage 6 - Decide (rules only): worst result wins.

Each check carries its own severity (on_fail = HOLD or REJECT), so adding an edge
case means adding a check - this function never changes.
"""

from __future__ import annotations

from datetime import datetime, timezone

from ..models import StageOutput
from ..reasons import label
from ..store import ApprovedWrite, InvoiceLogEntry
from .context import RunContext
from .util import fingerprint, lines_sum


def decide(checks) -> tuple[str, list[str]]:
    fails = [c for c in checks if c.status == "fail"]
    rejects = [c.reason_code for c in fails if c.on_fail == "REJECT"]
    holds = [c.reason_code for c in fails if c.on_fail == "HOLD"]
    codes = list(dict.fromkeys([c for c in rejects + holds if c]))
    if rejects:
        return "REJECT", codes
    if holds:
        return "HOLD", codes
    return "APPROVE", []


def build_write(ctx: RunContext) -> ApprovedWrite | None:
    """What Act would write. Built for APPROVE and for HOLDs that have a PO (so a reviewer can approve later)."""
    x = ctx.extraction
    if not (x and ctx.vendor and ctx.po and ctx.pairs):
        return None
    subtotal = ctx.billed_subtotal if ctx.billed_subtotal is not None else lines_sum(x.line_items)
    return ApprovedWrite(
        log_entry=InvoiceLogEntry(
            run_id=ctx.run_id, vendor_id=ctx.vendor.vendor_id, vendor_name=ctx.vendor.legal_name,
            invoice_number=x.invoice_number or "", invoice_date=x.invoice_date or "", po_number=ctx.po.po_number,
            subtotal=subtotal, total=x.total or 0.0, currency=(x.currency or "USD").upper(), file_hash=ctx.file_hash,
            lines_fingerprint=fingerprint(x.line_items), decision="APPROVE",
            processed_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), note="Auto-approved"),
        po_number=ctx.po.po_number,
        amount_add=subtotal,
        line_qty_add={p["po_line"]: p["qty"] or 0 for p in ctx.pairs if p["po_line"] is not None},
    )


def run(ctx: RunContext) -> StageOutput:
    ctx.decision, ctx.reason_codes = decide(ctx.checks)
    if ctx.decision != "REJECT":
        ctx.approved_write = build_write(ctx)
    counts = {s: sum(1 for c in ctx.checks if c.status == s) for s in ("pass", "warn", "fail", "skip")}
    fails = ctx.fails()
    if ctx.decision == "APPROVE":
        summary = f"APPROVE - all {counts['pass'] + counts['warn']} checks passed"
    else:
        summary = f"{ctx.decision} - " + "; ".join(dict.fromkeys(label(c.reason_code) for c in fails))
    return StageOutput(summary=summary, data={"decision": ctx.decision, "reason_codes": ctx.reason_codes,
                                              "counts": counts, "rule": "worst result wins: any REJECT > any HOLD > APPROVE"})
