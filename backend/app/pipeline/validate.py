"""Stage 3 - Validate (code): document type, required fields, reading confidence, arithmetic.

Arithmetic is the system checking the model's work without trusting it: if the line
items don't add up to the subtotal, either the model misread or the vendor erred.
One targeted re-read tells the two apart.
"""

from __future__ import annotations

from .. import config
from ..models import CheckResult, InvoiceExtraction, StageOutput
from ..reasons import label as reason_label
from . import extract
from .context import RunContext
from .util import line_amount, lines_sum, money, parse_date

TOL = config.POLICY.rounding_tolerance

NOT_INVOICE_MSG = {
    "proforma": "This is a proforma - a request for advance payment, not a bill for delivered goods. Advance payments need separate approval.",
    "statement": "This is a statement listing invoices. Paying it would pay those invoices twice.",
    "credit_note": "This is a credit note. It reduces what we owe and should be applied to the vendor's open invoices, not paid.",
    "quote": "This is a quotation, not a bill.",
    "receipt": "This is a receipt for a payment already made, not a bill.",
    "other": "This document is not recognisable as an invoice.",
}


def math_issues(x: InvoiceExtraction) -> tuple[list[str], dict]:
    issues: list[str] = []
    for i, l in enumerate(x.line_items, 1):
        if None not in (l.quantity, l.unit_price, l.amount) and abs(l.quantity * l.unit_price - l.amount) > TOL:
            issues.append(f"Line {i}: {l.quantity:g} × {money(l.unit_price)} = {money(l.quantity * l.unit_price)}, "
                          f"but {money(l.amount)} is printed")
    ls = lines_sum(x.line_items)
    if x.subtotal is not None and abs(ls - x.subtotal) > TOL:
        issues.append(f"Line items add up to {money(ls)}, but the subtotal printed is {money(x.subtotal)} "
                      f"(difference {money(x.subtotal - ls)})")
    base = x.subtotal if x.subtotal is not None else ls
    expected_total = base if x.tax_inclusive else round(base + (x.tax_amount or 0), 2)
    if x.total is not None and abs(expected_total - x.total) > TOL:
        issues.append(f"Subtotal {money(base)} + tax {money(x.tax_amount or 0)} = {money(expected_total)}, "
                      f"but the total printed is {money(x.total)}")
    figures = {"lines_sum": ls, "subtotal": x.subtotal, "tax": x.tax_amount, "total": x.total,
               "expected_total": expected_total, "tax_inclusive": bool(x.tax_inclusive)}
    return issues, figures


def _same_numbers(a: InvoiceExtraction, b: InvoiceExtraction) -> bool:
    key = lambda x: (x.subtotal, x.tax_amount, x.total, tuple(round(line_amount(l), 2) for l in x.line_items))
    return key(a) == key(b)


def run(ctx: RunContext) -> StageOutput:
    x = ctx.extraction
    checks: list[CheckResult] = []
    llm_calls: list[dict] = []
    data: dict = {}

    # 1. Is this even an invoice?
    if x.doc_type != "invoice":
        ctx.halted = f"Document is a {x.doc_type.replace('_', ' ')}, not an invoice"
        checks.append(CheckResult(id="validate.doc_type", stage="validate", label="Document is an invoice",
                                  status="fail", on_fail="REJECT", reason_code="DOC_NOT_INVOICE",
                                  message=NOT_INVOICE_MSG.get(x.doc_type, NOT_INVOICE_MSG["other"]),
                                  evidence={"doc_type": x.doc_type, "reader_notes": x.reader_notes}))
        return StageOutput(summary=f"Not an invoice ({x.doc_type}) - stopping here", checks=checks)
    checks.append(CheckResult(id="validate.doc_type", stage="validate", label="Document is an invoice",
                              status="pass", message="Recognised as a vendor invoice"))

    # 2. Required fields
    missing = []
    if not x.vendor_name: missing.append("vendor name")
    if not x.invoice_number: missing.append("invoice number")
    if not parse_date(x.invoice_date): missing.append("invoice date")
    if x.total is None: missing.append("total")
    if not x.line_items: missing.append("line items")
    checks.append(CheckResult(
        id="validate.required", stage="validate", label="Required fields present",
        status="fail" if missing else "pass", reason_code="MISSING_FIELD" if missing else None,
        message=(f"Missing or unreadable: {', '.join(missing)}. Request a complete invoice from the vendor."
                 if missing else "Vendor, invoice number, date, total and line items all present"),
        evidence={"missing": missing}))

    # 3. Arithmetic, with one bounded re-read
    issues, figures = math_issues(x)
    data["math"] = figures
    if not issues:
        checks.append(CheckResult(id="validate.math", stage="validate", label="Amounts add up", status="pass",
                                  message=f"Lines {money(figures['lines_sum'])} = subtotal; subtotal + tax = total "
                                          f"{money(x.total)} (±{money(TOL)} rounding)", evidence=figures))
    else:
        ctx.progress(f"Amounts don't add up ({issues[0]}). Asking the model to re-read the invoice "
                     f"carefully, with full reasoning, to rule out a misread")
        r = extract.read_invoice(ctx.pdf_bytes, prompts_reread(issues))
        llm_calls.append(r.meta.as_dict())
        x2: InvoiceExtraction = r.value
        issues2, figures2 = math_issues(x2)
        data["reread"] = {"first_reading_issues": issues, "second_reading_issues": issues2}
        if not issues2:
            ctx.extraction = x2
            data["math"] = figures2
            checks.append(CheckResult(
                id="validate.math", stage="validate", label="Amounts add up", status="warn",
                message="The first reading didn't add up; a careful re-read corrected it. Amounts now reconcile.",
                evidence={"first_reading_issues": issues, **figures2}))
        elif _same_numbers(x, x2):
            ctx.math_ok = False
            checks.append(CheckResult(
                id="validate.math", stage="validate", label="Amounts add up", status="fail",
                reason_code="VENDOR_MATH_ERROR",
                message=f"{issues2[0]}. A second reading confirmed these are the printed figures, so the error is "
                        f"on the invoice itself. Request a corrected invoice.",
                evidence={"issues": issues2, "reread_confirmed": True, **figures2}))
        else:
            ctx.math_ok = False
            ctx.extraction = x2
            checks.append(CheckResult(
                id="validate.math", stage="validate", label="Amounts add up", status="fail",
                reason_code="LOW_CONFIDENCE_FIELD",
                message="The amounts could not be read consistently - two readings disagree. A person should "
                        "check the figures against the PDF.",
                evidence={"first_reading_issues": issues, "second_reading_issues": issues2}))
    x = ctx.extraction

    # 4. Reading confidence on fields that matter
    conf = x.confidence.model_dump()
    relevant = {"vendor_name", "invoice_number", "invoice_date", "line_items", "totals"}
    if x.po_reference: relevant.add("po_reference")
    if x.bank_account_number: relevant.add("bank_details")
    low = [k for k in relevant if conf.get(k) == "low"]
    medium = [k for k in relevant if conf.get(k) == "medium"]
    label = lambda ks: ", ".join(k.replace("_", " ") for k in sorted(ks))
    if low:
        checks.append(CheckResult(id="validate.confidence", stage="validate", label="Fields read with confidence",
                                  status="fail", reason_code="LOW_CONFIDENCE_FIELD",
                                  message=f"Could not read clearly: {label(low)}. Confirm against the PDF before approving.",
                                  evidence={"low": low, "medium": medium, "reader_notes": x.reader_notes}))
    elif medium:
        checks.append(CheckResult(id="validate.confidence", stage="validate", label="Fields read with confidence",
                                  status="warn", message=f"Read with some interpretation: {label(medium)}",
                                  evidence={"medium": medium, "reader_notes": x.reader_notes}))
    else:
        checks.append(CheckResult(id="validate.confidence", stage="validate", label="Fields read with confidence",
                                  status="pass", message="All key fields read clearly"))

    fails = [c for c in checks if c.status == "fail"]
    summary = ("All validation checks passed" if not fails
               else f"{len(fails)} problem{'s' if len(fails) > 1 else ''}: " + "; ".join(reason_label(c.reason_code) for c in fails))
    return StageOutput(summary=summary, data=data, checks=checks, llm_calls=llm_calls)


def prompts_reread(issues: list[str]) -> str:
    from .. import prompts
    return prompts.REREAD_USER.format(discrepancy="\n".join(f"- {i}" for i in issues))
