"""Stage 5 - Reconcile: compare the invoice against the PO and against history.

Split invoices vs tolerance (they never collide):
  * quantity  -> must not exceed what's LEFT on each PO line (ordered - already invoiced)
  * price     -> unit price within +1% of the PO price
  * running total -> already invoiced + this invoice <= PO total + 1%, applied once per PO
"""

from __future__ import annotations

from .. import config, llm, prompts
from ..models import CheckResult, LinePairing, StageOutput
from .context import RunContext
from .util import fingerprint, lines_sum, money, norm_invoice_no, norm_sku, parse_date

P = config.POLICY


def pair_lines(ctx: RunContext) -> tuple[list[dict], dict | None]:
    """Code pairs by item code first; the model pairs whatever is left by meaning; code enforces 1:1."""
    x, po_lines = ctx.extraction, ctx.snapshot.lines_for(ctx.po.po_number)
    pairs: dict[int, dict] = {}
    used: set[int] = set()
    for i, l in enumerate(x.line_items, 1):
        if not l.sku:
            continue
        m = next((p for p in po_lines if p.sku and norm_sku(p.sku) == norm_sku(l.sku) and p.line_no not in used), None)
        if m:
            pairs[i] = {"po_line": m.line_no, "method": "item code", "confidence": "high",
                        "reason": f"Same item code {m.sku}"}
            used.add(m.line_no)

    meta = None
    rest_inv = [i for i in range(1, len(x.line_items) + 1) if i not in pairs]
    rest_po = [p for p in po_lines if p.line_no not in used]
    if rest_inv and rest_po:
        ctx.progress(f"{len(pairs)} of {len(x.line_items)} lines paired by item code; asking the model to pair "
                     f"the other {len(rest_inv)} by meaning")
        inv_txt = "\n".join(f"{i}. {x.line_items[i - 1].description} (code {x.line_items[i - 1].sku or '-'})"
                            for i in rest_inv)
        po_txt = "\n".join(f"line_no {p.line_no}: {p.description} (code {p.sku or '-'})" for p in rest_po)
        r = llm.generate(purpose="pair_lines", schema=LinePairing, system=prompts.PAIR_SYSTEM,
                         contents=[prompts.PAIR_USER.format(invoice_lines=inv_txt, po_lines=po_txt)])
        meta = r.meta.as_dict()
        allowed = {p.line_no for p in rest_po}
        for pr in r.value.pairs:
            if pr.invoice_line not in rest_inv or pr.invoice_line in pairs:
                continue
            if pr.po_line is not None and (pr.po_line not in allowed or pr.po_line in used):
                continue  # model pointed at a non-existent or already-taken PO line: ignore
            pairs[pr.invoice_line] = {"po_line": pr.po_line, "method": "description (model)",
                                      "confidence": pr.confidence, "reason": pr.reason}
            if pr.po_line is not None:
                used.add(pr.po_line)

    by_no = {p.line_no: p for p in po_lines}
    out = []
    for i, l in enumerate(x.line_items, 1):
        pr = pairs.get(i, {"po_line": None, "method": "none", "confidence": "low", "reason": "No PO line is this item"})
        pl = by_no.get(pr["po_line"]) if pr["po_line"] else None
        out.append({
            "invoice_line": i, "description": l.description, "sku": l.sku, "qty": l.quantity,
            "unit_price": l.unit_price, "amount": l.amount, **pr,
            "po_description": pl.description if pl else None, "po_unit_price": pl.unit_price if pl else None,
            "po_qty_ordered": pl.qty_ordered if pl else None, "po_qty_invoiced": pl.qty_invoiced if pl else None,
            "po_qty_remaining": pl.qty_remaining if pl else None,
        })
    return out, meta


def duplicate_check(ctx: RunContext) -> CheckResult:
    x, vendor = ctx.extraction, ctx.vendor
    label = "Not already paid"
    history = [e for e in ctx.snapshot.invoice_log if e.vendor_id == vendor.vendor_id]
    inv_no, total, inv_date = norm_invoice_no(x.invoice_number), x.total or 0.0, parse_date(x.invoice_date)
    fp = fingerprint(x.line_items)
    for e in ctx.snapshot.invoice_log:
        if e.file_hash and e.file_hash == ctx.file_hash:
            return CheckResult(id="reconcile.duplicate", stage="reconcile", label=label, status="fail",
                               on_fail="REJECT", reason_code="DUPLICATE_EXACT",
                               message=f"This exact file was already processed as {e.invoice_number} on {e.processed_at[:10]}.",
                               evidence={"matched": e.model_dump()})
    for e in history:
        same_no = inv_no and norm_invoice_no(e.invoice_number) == inv_no
        same_amt = abs(e.total - total) <= P.rounding_tolerance
        e_date = parse_date(e.invoice_date)
        days = abs((inv_date - e_date).days) if inv_date and e_date else None
        if same_no and same_amt:
            return CheckResult(id="reconcile.duplicate", stage="reconcile", label=label, status="fail",
                               on_fail="REJECT", reason_code="DUPLICATE_EXACT",
                               message=f"{e.invoice_number} for {money(e.total)} was already approved on "
                                       f"{e.processed_at[:10]} against {e.po_number}.",
                               evidence={"matched": e.model_dump()})
        if same_no and not same_amt:
            if days is not None and days > 180:
                continue  # vendor numbering restarted (e.g. new year) - a genuinely new bill
            return CheckResult(id="reconcile.duplicate", stage="reconcile", label=label, status="fail",
                               reason_code="DUPLICATE_SUSPECTED",
                               message=f"Same invoice number as {e.invoice_number} (approved {e.processed_at[:10]}) but a "
                                       f"different amount ({money(e.total)} then, {money(total)} now). Possible altered resubmission.",
                               evidence={"matched": e.model_dump()})
        if same_amt and days is not None and days <= P.near_duplicate_window_days and e.lines_fingerprint == fp:
            return CheckResult(id="reconcile.duplicate", stage="reconcile", label=label, status="fail",
                               reason_code="DUPLICATE_SUSPECTED",
                               message=f"Looks like a resubmission of {e.invoice_number} (approved {e.processed_at[:10]}): "
                                       f"same vendor, same amount {money(total)}, same lines, "
                                       + ("same invoice date" if days == 0 else
                                          f"invoice dates {days} day{'s' if days != 1 else ''} apart")
                                       + f" - only the number differs ({x.invoice_number}).",
                               evidence={"matched": e.model_dump(), "days_apart": days, "lines_fingerprint": fp})
    return CheckResult(id="reconcile.duplicate", stage="reconcile", label=label, status="pass",
                       message=f"No match in {len(history)} previously approved invoice{'s' if len(history) != 1 else ''} "
                               f"from this vendor (number, amount, lines, dates)",
                       evidence={"compared": len(history)})


def run(ctx: RunContext) -> StageOutput:
    x = ctx.extraction
    checks: list[CheckResult] = []
    llm_calls: list[dict] = []
    data: dict = {}

    if ctx.vendor:
        checks.append(duplicate_check(ctx))

    if not ctx.po:
        checks.append(CheckResult(id="reconcile.lines", stage="reconcile", label="Lines match the PO", status="skip",
                                  message="Skipped - no purchase order to compare against"))
        return StageOutput(summary="No PO to reconcile against" + ("" if not ctx.vendor else " · duplicate check done"),
                           data=data, checks=checks)

    po = ctx.po
    tag = f" (suggested {po.po_number})" if ctx.po_inferred else ""
    pairs, meta = pair_lines(ctx)
    if meta:
        llm_calls.append(meta)
    ctx.pairs = pairs
    data["pairs"] = pairs

    # Every invoice line is something we ordered
    unmatched = [p for p in pairs if p["po_line"] is None]
    checks.append(CheckResult(
        id="reconcile.lines", stage="reconcile", label="Every line is on the PO",
        status="fail" if unmatched else "pass", reason_code="LINE_UNMATCHED" if unmatched else None,
        message=("Not on the PO: " + "; ".join(f"\"{p['description']}\" ({money(p['amount'])})" for p in unmatched)
                 if unmatched else
                 (f"All {len(pairs)} lines matched to {po.po_number}{tag} - " if len(pairs) > 1
                  else f"The line matched {po.po_number}{tag} - ")
                 + ", ".join(f"{sum(1 for p in pairs if p['method'] == m)} by {m}"
                             for m in ("item code", "description (model)") if any(p['method'] == m for p in pairs))),
        evidence={"unmatched": unmatched}))

    unsure = [p for p in pairs if p["po_line"] is not None and p["confidence"] != "high"]
    if unsure:
        checks.append(CheckResult(
            id="reconcile.line_confidence", stage="reconcile", label="Line matches are certain", status="fail",
            reason_code="LINE_MATCH_UNCERTAIN",
            message="Confirm these are the same items: " + "; ".join(
                f"\"{p['description']}\" = PO line {p['po_line']} \"{p['po_description']}\"" for p in unsure),
            evidence={"uncertain": unsure}))

    matched = [p for p in pairs if p["po_line"] is not None]

    # Quantity vs what's left on each PO line
    over_qty = [p for p in matched if (p["qty"] or 0) > (p["po_qty_remaining"] or 0) + 1e-9]
    partial = [p for p in matched if p not in over_qty and (p["qty"] or 0) < (p["po_qty_remaining"] or 0)]
    checks.append(CheckResult(
        id="reconcile.quantity", stage="reconcile", label="Quantities within what's left on the PO",
        status="fail" if over_qty else "pass", reason_code="QTY_EXCEEDS_REMAINING" if over_qty else None,
        message=("; ".join(f"\"{p['description']}\": billed {p['qty']:g}, but only {p['po_qty_remaining']:g} of "
                           f"{p['po_qty_ordered']:g} left ({p['po_qty_invoiced']:g} already billed)" for p in over_qty)
                 if over_qty else
                 ("Partial billing: " + "; ".join(f"{p['qty']:g} of {p['po_qty_remaining']:g} remaining "
                                                   f"\"{p['po_description']}\"" for p in partial)
                  + " - the rest stays open on the PO") if partial else
                 "Every line bills exactly what was left on the PO"),
        evidence={"over": over_qty, "partial": partial}))

    # Unit price vs PO price
    over_price = []
    for p in matched:
        if p["unit_price"] is None or not p["po_unit_price"]:
            continue
        pct = (p["unit_price"] - p["po_unit_price"]) / p["po_unit_price"]
        p["price_diff_pct"] = round(pct * 100, 2)
        if p["unit_price"] > p["po_unit_price"] * (1 + P.price_tolerance_pct) + 0.005:
            over_price.append(p)
    checks.append(CheckResult(
        id="reconcile.price", stage="reconcile", label=f"Unit prices within +{P.price_tolerance_pct:.0%} of PO",
        status="fail" if over_price else "pass", reason_code="PRICE_OVER_TOLERANCE" if over_price else None,
        message=("; ".join(f"\"{p['description']}\": {money(p['unit_price'])} vs PO {money(p['po_unit_price'])} "
                           f"(+{p['price_diff_pct']:g}%)" for p in over_price)
                 if over_price else "All unit prices at or below the PO price (within tolerance)"),
        evidence={"over": over_price, "tolerance_pct": P.price_tolerance_pct * 100}))

    # Running total across all invoices on this PO
    billed = round(x.subtotal if x.subtotal is not None else lines_sum(x.line_items), 2)
    ctx.billed_subtotal = billed
    limit = round(po.total * (1 + P.running_total_tolerance_pct), 2)
    new_total = round(po.amount_invoiced + billed, 2)
    data["running_total"] = {"po_total": po.total, "already_invoiced": po.amount_invoiced, "this_invoice": billed,
                             "new_total": new_total, "limit": limit, "remaining_after": round(po.total - new_total, 2)}
    if not ctx.math_ok:
        checks.append(CheckResult(id="reconcile.running_total", stage="reconcile", label="Running total within PO",
                                  status="skip",
                                  message="Skipped - the invoice's own amounts don't add up (see the maths check)"))
    else:
        over = new_total > limit
        checks.append(CheckResult(
            id="reconcile.running_total", stage="reconcile", label="Running total within PO",
            status="fail" if over else "pass", reason_code="RUNNING_TOTAL_EXCEEDS_PO" if over else None,
            message=(f"Already billed {money(po.amount_invoiced)} + this invoice {money(billed)} = {money(new_total)}, "
                     f"over {po.po_number}'s {money(po.total)} by {money(new_total - po.total)} "
                     f"(limit incl. {P.running_total_tolerance_pct:.0%} tolerance: {money(limit)})"
                     if over else
                     f"Already billed {money(po.amount_invoiced)} + this invoice {money(billed)} = {money(new_total)} "
                     f"of {money(po.total)}"),
            evidence=data["running_total"]))

    fails = [c for c in checks if c.status == "fail"]
    summary = (f"Compared {len(pairs)} line{'s' if len(pairs) != 1 else ''} with {po.po_number}{tag} · "
               + ("everything reconciles" if not fails else
                  f"{len(fails)} problem{'s' if len(fails) > 1 else ''}"))
    return StageOutput(summary=summary, data=data, checks=checks, llm_calls=llm_calls)
