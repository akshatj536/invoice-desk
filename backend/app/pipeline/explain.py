"""Stage 8 - Explain: the model narrates a decision the rules already made (template fallback)."""

from __future__ import annotations

from .. import llm, prompts
from ..models import Explanation, StageOutput
from .context import RunContext
from .util import money

NEXT_ACTION = {
    "BANK_DETAILS_MISMATCH": "Call the vendor on the phone number in the vendor file (not the invoice) to confirm the bank change before paying.",
    "VENDOR_MATH_ERROR": "Email the vendor and ask for a corrected invoice with the right subtotal and total.",
    "DUPLICATE_EXACT": "Do not pay - this invoice has already been processed.",
    "DUPLICATE_SUSPECTED": "Compare with the earlier invoice and reject this one if it is the same bill.",
    "QTY_EXCEEDS_REMAINING": "Ask the vendor to re-issue the invoice for the quantity left on the PO, or get the PO increased.",
    "RUNNING_TOTAL_EXCEEDS_PO": "Ask the requester whether to raise the PO amount, or ask the vendor to correct the invoice.",
    "PRICE_OVER_TOLERANCE": "Ask the vendor to bill at the PO price, or get the price change approved by the buyer.",
    "PO_INFERRED": "Confirm the suggested PO with the requester, then approve from the review queue.",
    "PO_VENDOR_MISMATCH": "Confirm the correct PO number with the vendor, then approve from the review queue.",
    "PO_NOT_FOUND": "Ask the requester or vendor for the PO number.",
    "PO_CLOSED": "Check with the requester why a closed PO is being billed.",
    "VENDOR_NOT_APPROVED": "Send the invoice back; the vendor must complete onboarding before it can be paid.",
    "DOC_NOT_INVOICE": "Route to the right team; do not book this as a payable.",
    "MISSING_FIELD": "Ask the vendor for a complete invoice.",
    "LOW_CONFIDENCE_FIELD": "Check the flagged fields against the PDF and correct them before approving.",
    "LINE_UNMATCHED": "Ask the requester whether the extra charge was agreed; otherwise ask the vendor to remove it.",
    "LINE_MATCH_UNCERTAIN": "Confirm the flagged lines are the items ordered, then approve from the review queue.",
    "CURRENCY_MISMATCH": "Ask finance which exchange rate to apply, or ask the vendor to bill in the PO currency.",
    "SYSTEM_ERROR": "Process this invoice manually; the system could not complete it.",
    "UNREADABLE_DOCUMENT": "Ask the vendor to resend the invoice as a normal PDF.",
}


def template(ctx: RunContext) -> Explanation:
    x = ctx.extraction
    inv = f"{x.invoice_number} from {x.vendor_name}" if x and x.invoice_number else "This document"
    if ctx.decision == "APPROVE":
        return Explanation(
            summary=f"{inv} matches {ctx.po.po_number if ctx.po else 'its PO'} on vendor, items, quantities, prices "
                    f"and totals, and is not a duplicate. It has been recorded in the invoice log.",
            next_action="No action needed - it is ready for the next payment run.")
    fails = ctx.fails()
    summary = f"{inv} was {'rejected' if ctx.decision == 'REJECT' else 'put on hold'}. " + " ".join(
        c.message for c in fails[:2])
    primary = ctx.reason_codes[0] if ctx.reason_codes else "SYSTEM_ERROR"
    return Explanation(summary=summary, next_action=NEXT_ACTION.get(primary, NEXT_ACTION["SYSTEM_ERROR"]))


def run(ctx: RunContext) -> StageOutput:
    x = ctx.extraction
    llm_calls, source = [], "model"
    if x is None:
        e, source = template(ctx), "template"
    else:
        fails = ctx.fails()
        findings = "\n".join(f"- {c.label}: {c.message}" for c in fails) or "- none (all checks passed)"
        passed = ", ".join(c.label.lower() for c in ctx.checks if c.status == "pass") or "none"
        ctx.progress("Asking the model to explain the decision in plain English (it cannot change the decision)")
        try:
            r = llm.generate(purpose="explain", schema=Explanation, system=prompts.EXPLAIN_SYSTEM,
                             contents=[prompts.EXPLAIN_USER.format(
                                 decision=ctx.decision, invoice_number=x.invoice_number,
                                 vendor=ctx.vendor.legal_name if ctx.vendor else x.vendor_name,
                                 total=money(x.total), po=(ctx.po.po_number + (" (suggested, not printed)" if ctx.po_inferred else ""))
                                 if ctx.po else "none identified",
                                 findings=findings, passed=passed)])
            e = r.value
            llm_calls.append(r.meta.as_dict())
        except llm.LLMError:
            e, source = template(ctx), "template"
    ctx.explanation, ctx.next_action = e.summary, e.next_action
    return StageOutput(summary=e.summary, data={"summary": e.summary, "next_action": e.next_action, "source": source},
                       llm_calls=llm_calls)
