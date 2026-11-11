"""Stage 4 - Match: who is the vendor, can we pay them, are the bank details theirs, which PO is this?"""

from __future__ import annotations

from .. import llm, prompts
from . import extract
from ..models import CheckResult, POSuggestion, StageOutput
from ..store import PO, Snapshot, Vendor
from .context import RunContext
from .util import digits, mask, money, norm_name, norm_po, similarity


def resolve_vendor(name: str | None, snap: Snapshot, tax_id: str | None = None) -> tuple[Vendor | None, str]:
    """Exact name -> known alternate name -> tax ID (name differs) -> very close name."""
    n = norm_name(name)
    for v in snap.vendors:
        if n and norm_name(v.legal_name) == n:
            return v, "exact"
        if n and any(norm_name(a) == n for a in v.aliases):
            return v, "alias"
    tid = digits(tax_id)
    if len(tid) >= 6:
        v = next((v for v in snap.vendors if digits(v.tax_id) == tid), None)
        if v:
            return v, "tax_id"
    if not n:
        return None, "none"
    best = max(snap.vendors, key=lambda v: max([similarity(name, v.legal_name)] +
                                               [similarity(name, a) for a in v.aliases]), default=None)
    if best and max([similarity(name, best.legal_name)] + [similarity(name, a) for a in best.aliases]) >= 0.9:
        return best, "similar"
    return None, "none"


def looks_like_misread(read: str, on_file: str) -> bool:
    """Same length and at most 2 digits differ - the pattern of a blurry digit, not a different account."""
    a, b = digits(read), digits(on_file)
    return bool(a) and len(a) == len(b) and sum(x != y for x, y in zip(a, b)) <= 2


def _po_brief(snap: Snapshot, po: PO) -> str:
    lines = "; ".join(f"line {l.line_no}: {l.description} x{l.qty_ordered:g} @ {money(l.unit_price)}"
                      for l in snap.lines_for(po.po_number))
    return (f"- {po.po_number} (created {po.created_date}, \"{po.description}\", total {money(po.total)}, "
            f"remaining {money(po.remaining)}): {lines}")


def suggest_po(ctx: RunContext, candidates: list[PO], ref_note: str) -> tuple[PO | None, dict, dict | None]:
    """Ask the model to pick among candidate POs; code verifies the answer is a real candidate."""
    if not candidates:
        return None, {"candidates": [], "result": "no open POs for this vendor"}, None
    ctx.progress(f"Invoice {ref_note.rstrip('.')} - asking the model which of {len(candidates)} open POs it belongs to")
    x, snap = ctx.extraction, ctx.snapshot
    inv_lines = "\n".join(f"{i}. {l.description} (code {l.sku or '-'}) x{(l.quantity or 0):g} @ {money(l.unit_price)}"
                          for i, l in enumerate(x.line_items, 1))
    r = llm.generate(
        purpose="suggest_po", schema=POSuggestion, system=prompts.PO_SUGGEST_SYSTEM,
        contents=[prompts.PO_SUGGEST_USER.format(
            ref_note=ref_note, vendor=x.vendor_name, date=x.invoice_date, subtotal=money(x.subtotal),
            invoice_lines=inv_lines, candidates="\n".join(_po_brief(snap, p) for p in candidates))])
    s: POSuggestion = r.value
    info = {"candidates": [p.po_number for p in candidates], "model_answer": s.model_dump()}
    chosen = next((p for p in candidates if p.po_number == (s.po_number or "").strip().upper()), None)
    if s.po_number and chosen is None:
        info["result"] = f"model named {s.po_number}, which is not one of the candidates - ignored"
        return None, info, r.meta.as_dict()
    if chosen and s.confidence == "low":
        info["result"] = "model's pick was a low-confidence guess - not used"
        return None, info, r.meta.as_dict()
    info["result"] = f"verified: {chosen.po_number} is an open PO for this vendor" if chosen else "no candidate fits"
    return chosen, info, r.meta.as_dict()


def run(ctx: RunContext) -> StageOutput:
    x, snap = ctx.extraction, ctx.snapshot
    checks: list[CheckResult] = []
    llm_calls: list[dict] = []
    data: dict = {}

    # --- Vendor ---------------------------------------------------------------
    vendor, method = resolve_vendor(x.vendor_name, snap, x.vendor_tax_id)
    ctx.vendor = vendor
    if vendor is None:
        checks.append(CheckResult(id="match.vendor", stage="match", label="Vendor is on the approved list",
                                  status="fail", on_fail="REJECT", reason_code="VENDOR_NOT_APPROVED",
                                  message=f"\"{x.vendor_name}\" is not in the vendor file. New vendors must be "
                                          f"onboarded before they can be paid.",
                                  evidence={"name_on_invoice": x.vendor_name}))
    elif not vendor.approved:
        checks.append(CheckResult(id="match.vendor", stage="match", label="Vendor is on the approved list",
                                  status="fail", on_fail="REJECT", reason_code="VENDOR_NOT_APPROVED",
                                  message=f"{vendor.legal_name} is in the vendor file but not approved for payment"
                                          f"{': ' + vendor.notes if vendor.notes else ''}.",
                                  evidence={"vendor_id": vendor.vendor_id, "notes": vendor.notes}))
    else:
        how = {"exact": "exact name", "alias": "known alternate name", "similar": "closely similar name",
               "tax_id": f"tax ID {vendor.tax_id} - the name on the invoice (\"{x.vendor_name}\") differs from the vendor file"}[method]
        checks.append(CheckResult(id="match.vendor", stage="match", label="Vendor is on the approved list",
                                  status="warn" if method in ("similar", "tax_id") else "pass",
                                  message=f"{vendor.legal_name} ({vendor.vendor_id}), matched by {how}",
                                  evidence={"vendor_id": vendor.vendor_id, "method": method,
                                            "name_on_invoice": x.vendor_name}))
    if vendor:
        data["vendor"] = {"vendor_id": vendor.vendor_id, "legal_name": vendor.legal_name, "method": method,
                          "approved": vendor.approved, "name_on_invoice": x.vendor_name}

    # --- Bank details -----------------------------------------------------------
    inv_acct, inv_rout = digits(x.bank_account_number), digits(x.bank_routing_number)
    if vendor and (inv_acct or inv_rout):
        acct_ok = not inv_acct or inv_acct == digits(vendor.bank_account)
        rout_ok = not inv_rout or inv_rout == digits(vendor.bank_routing)
        reread = None
        unsure = x.confidence.bank_details != "high"
        if not (acct_ok and rout_ok) and (
                unsure or (acct_ok or looks_like_misread(inv_acct, vendor.bank_account))
                and (rout_ok or looks_like_misread(inv_rout, vendor.bank_routing))):
            # Could be one blurry digit rather than a different account: re-read the bank details once,
            # carefully, WITHOUT telling the model what is on file (it must not be able to echo it back).
            ctx.progress("Bank details differ from the vendor file by a digit or two - re-reading just the bank "
                         "details carefully to rule out a misread (the model is not told what's on file)")
            r = extract.read_invoice(ctx.pdf_bytes, prompts.BANK_REREAD_USER)
            llm_calls.append(r.meta.as_dict())
            x2 = r.value
            first = (mask(inv_acct), inv_rout or "-")
            inv_acct = digits(x2.bank_account_number) or inv_acct
            inv_rout = digits(x2.bank_routing_number) or inv_rout
            acct_ok = not inv_acct or inv_acct == digits(vendor.bank_account)
            rout_ok = not inv_rout or inv_rout == digits(vendor.bank_routing)
            x.bank_account_number, x.bank_routing_number = inv_acct, inv_rout
            reread = {"first_reading": {"account": first[0], "routing": first[1]},
                      "second_reading": {"account": mask(inv_acct), "routing": inv_rout or "-"},
                      "resolved": acct_ok and rout_ok}
        ev = {"invoice_account": mask(inv_acct), "file_account": mask(vendor.bank_account),
              "invoice_routing": inv_rout or "-", "file_routing": vendor.bank_routing,
              "phone_on_file": vendor.phone_on_file, "reader_notes": x.reader_notes, "reread": reread}
        if acct_ok and rout_ok and reread:
            checks.append(CheckResult(id="match.bank", stage="match", label="Bank details match vendor file",
                                      status="warn",
                                      message=f"The first reading of the bank details didn't match the file (likely a "
                                              f"blurry digit: routing {reread['first_reading']['routing']}). A careful "
                                              f"re-read confirmed account {mask(inv_acct)} and routing {inv_rout} match the vendor file.",
                                      evidence=ev))
        elif acct_ok and rout_ok:
            checks.append(CheckResult(id="match.bank", stage="match", label="Bank details match vendor file",
                                      status="pass", message=f"Remit-to account {mask(inv_acct)} matches the vendor file",
                                      evidence=ev))
        elif (acct_ok or looks_like_misread(inv_acct, vendor.bank_account)) and \
                (rout_ok or looks_like_misread(inv_rout, vendor.bank_routing)):
            # Still a near miss after a careful re-read: say honestly that it may be an unreadable digit.
            parts = []
            if not acct_ok: parts.append(f"account reads as {mask(inv_acct)} vs {mask(vendor.bank_account)} on file")
            if not rout_ok: parts.append(f"routing number reads as {inv_rout} vs {vendor.bank_routing} on file")
            checks.append(CheckResult(
                id="match.bank", stage="match", label="Bank details match vendor file", status="fail",
                reason_code="BANK_DETAILS_MISMATCH",
                message=f"Bank details could not be confirmed: the {' and the '.join(parts)} - only a digit or two "
                        f"apart on a hard-to-read image{', and a second careful reading saw the same' if reread else ''}. "
                        f"This may be a misread rather than a changed account. Check the PDF; if the number really "
                        f"differs, treat it as possible fraud and call {vendor.legal_name} on the number on file "
                        f"({vendor.phone_on_file}).",
                evidence=ev))
        else:
            what = " and ".join(w for w, ok in [("account", acct_ok), ("routing number", rout_ok)] if not ok)
            verb = "differ" if " and " in what else "differs"
            checks.append(CheckResult(
                id="match.bank", stage="match", label="Bank details match vendor file", status="fail",
                reason_code="BANK_DETAILS_MISMATCH",
                message=f"Possible payment fraud: the remit-to bank {what} on the invoice (account {mask(inv_acct)}, "
                        f"routing {inv_rout or '-'}) {verb} from the vendor file (account {mask(vendor.bank_account)}, "
                        f"routing {vendor.bank_routing}). Verify by calling {vendor.legal_name} on the number on file "
                        f"({vendor.phone_on_file}) - never a number printed on the invoice.",
                evidence=ev))
    elif vendor:
        checks.append(CheckResult(id="match.bank", stage="match", label="Bank details match vendor file",
                                  status="skip", message="No bank details printed; payment would use the vendor file"))

    # --- Purchase order ----------------------------------------------------------
    if vendor is None or not vendor.approved:
        checks.append(CheckResult(id="match.po", stage="match", label="Purchase order identified", status="skip",
                                  message="Skipped - vendor not identified" if vendor is None
                                  else "Skipped - vendor is not approved for payment"))
    else:
        ref = x.po_reference
        po_id = norm_po(ref)
        po = snap.po(po_id) if po_id else None
        candidates = [p for p in snap.pos if p.vendor_id == vendor.vendor_id and p.status == "open"]
        if po and po.vendor_id == vendor.vendor_id:
            ctx.po = po
            checks.append(CheckResult(id="match.po", stage="match", label="Purchase order identified", status="pass",
                                      message=f"{po.po_number} printed on invoice - {po.description} "
                                              f"({money(po.total)}, {po.status})",
                                      evidence={"po_number": po.po_number, "printed_as": ref}))
            if po.status != "open":
                checks.append(CheckResult(id="match.po_open", stage="match", label="PO is open", status="fail",
                                          reason_code="PO_CLOSED",
                                          message=f"{po.po_number} is {po.status} - it has already been fully billed.",
                                          evidence={"status": po.status, "amount_invoiced": po.amount_invoiced}))
        else:
            if po:  # exists but belongs to someone else -> likely typo
                owner = snap.vendor(po.vendor_id)
                ref_note = (f"cites {po.po_number}, but that PO belongs to a different vendor "
                            f"({owner.legal_name if owner else po.vendor_id}).")
                code = "PO_VENDOR_MISMATCH"
                lead = f"Invoice cites {po.po_number}, which belongs to {(owner.legal_name if owner else po.vendor_id).rstrip('.')}."
            elif ref:
                ref_note = f"cites \"{ref}\" in the PO field, which is not a purchase order in our system."
                code = "PO_INFERRED"
                lead = f"\"{ref}\" in the PO field is not a PO in our system."
            else:
                ref_note = "has no purchase-order number printed on it."
                code = "PO_INFERRED"
                lead = "No PO number on the invoice."
            suggested, info, meta = suggest_po(ctx, candidates, ref_note)
            if meta:
                llm_calls.append(meta)
            data["po_search"] = info
            if suggested:
                ctx.po, ctx.po_inferred = suggested, True
                reason = (info.get("model_answer") or {}).get("reason", "")
                checks.append(CheckResult(
                    id="match.po", stage="match", label="Purchase order identified", status="fail",
                    reason_code=code,
                    message=f"{lead} Suggested {suggested.po_number} (checked against {vendor.legal_name}'s "
                            f"{len(candidates)} open POs). Why: {reason.rstrip('.')}. Confirm the PO before approving.",
                    evidence={"printed_as": ref, "suggested_po": suggested.po_number, **info}))
            else:
                checks.append(CheckResult(
                    id="match.po", stage="match", label="Purchase order identified", status="fail",
                    reason_code="PO_NOT_FOUND",
                    message=f"{lead} None of {vendor.legal_name}'s open POs fit. Ask the requester or vendor for the PO number.",
                    evidence={"printed_as": ref, **info}))

    if ctx.po:
        po = ctx.po
        data["po"] = {**po.model_dump(), "remaining": po.remaining, "inferred": ctx.po_inferred,
                      "lines": [l.model_dump() | {"qty_remaining": l.qty_remaining} for l in snap.lines_for(po.po_number)]}
        cur = (x.currency or "USD").upper()
        if cur != po.currency.upper():
            checks.append(CheckResult(id="match.currency", stage="match", label="Currency matches PO", status="fail",
                                      reason_code="CURRENCY_MISMATCH",
                                      message=f"Invoice is in {cur} but {po.po_number} is in {po.currency}. "
                                              f"Conversion is a finance decision, not an automatic one.",
                                      evidence={"invoice": cur, "po": po.currency}))
        else:
            checks.append(CheckResult(id="match.currency", stage="match", label="Currency matches PO", status="pass",
                                      message=f"Both in {cur}"))

    fails = [c for c in checks if c.status == "fail"]
    parts = []
    if vendor: parts.append(vendor.legal_name)
    if ctx.po: parts.append(f"{ctx.po.po_number}{' (suggested)' if ctx.po_inferred else ''}")
    summary = " · ".join(parts) if parts else "Vendor not identified"
    if fails:
        summary += f" · {len(fails)} problem{'s' if len(fails) > 1 else ''}"
    return StageOutput(summary=summary, data=data, checks=checks, llm_calls=llm_calls)
