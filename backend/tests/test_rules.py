"""Deterministic rules - no model calls. Lines carry SKUs so pairing never needs the model."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.models import CheckResult, ExtractedLine, FieldConfidence, InvoiceExtraction
from app.pipeline import decide, match, reconcile, validate
from app.pipeline.context import RunContext
from app.pipeline.util import norm_name, norm_po
from app.store.local import LocalStore

HIGH = FieldConfidence(vendor_name="high", invoice_number="high", invoice_date="high", po_reference="high",
                       bank_details="high", line_items="high", totals="high")


@pytest.fixture
def store(tmp_path: Path) -> LocalStore:
    return LocalStore(tmp_path / "store.json")


def inv(vendor="Acme Office Furniture Co.", number="T-1", date="2026-11-05", po="PO-1050",
        lines=(("ACM-STK-100", "Stacking chair", 60, 100.0),), tax_rate=0.08, subtotal=None, total=None,
        account="004417820093", routing="121000358") -> InvoiceExtraction:
    items = [ExtractedLine(sku=s, description=d, quantity=q, unit_price=p, amount=round(q * p, 2)) for s, d, q, p in lines]
    sub = subtotal if subtotal is not None else round(sum(i.amount for i in items), 2)
    tax = round(sub * tax_rate, 2)
    return InvoiceExtraction(doc_type="invoice", vendor_name=vendor, invoice_number=number, invoice_date=date,
                             po_reference=po, currency="USD", line_items=items, subtotal=sub, tax_amount=tax,
                             total=total if total is not None else round(sub + tax, 2), confidence=HIGH,
                             bank_account_number=account, bank_routing_number=routing)


def ctx_for(store: LocalStore, x: InvoiceExtraction, run_id="r1", file_hash="h1") -> RunContext:
    c = RunContext(run_id=run_id, pdf_path=Path("x.pdf"), filename="x.pdf", store=store)
    c.snapshot, c.extraction, c.file_hash = store.snapshot(), x, file_hash
    return c


def run_rules(store, x, **kw) -> RunContext:
    c = ctx_for(store, x, **kw)
    for stage in (match, reconcile, decide):
        c.checks.extend(stage.run(c).checks)
    return c


def codes(c: RunContext) -> set[str]:
    return set(c.reason_codes)


# --- Normalisation ---------------------------------------------------------------------------
@pytest.mark.parametrize("raw,want", [("PO-1042", "PO-1042"), ("po 1042", "PO-1042"), ("PO#1042", "PO-1042"),
                                      ("1042", "PO-1042"), ("Onboarding kits", None), (None, None)])
def test_norm_po(raw, want):
    assert norm_po(raw) == want


def test_norm_name_ignores_case_suffix_ampersand():
    assert norm_name("ACME OFFICE FURNITURE CO.") == norm_name("Acme Office Furniture Company")
    assert norm_name("Crestline Print & Signage") == norm_name("Crestline Print and Signage")


# --- Decide: worst result wins ------------------------------------------------------------------
def _chk(status, on_fail="HOLD", code="X"):
    return CheckResult(id="t", stage="t", label="t", status=status, on_fail=on_fail, reason_code=code)


def test_worst_result_wins():
    assert decide.decide([_chk("pass"), _chk("warn")])[0] == "APPROVE"
    assert decide.decide([_chk("pass"), _chk("fail", code="A")]) == ("HOLD", ["A"])
    assert decide.decide([_chk("fail", code="A"), _chk("fail", "REJECT", "B")]) == ("REJECT", ["B", "A"])


# --- Arithmetic --------------------------------------------------------------------------------
def test_rounding_difference_is_not_an_error():
    x = inv(total=None)
    x.total = round(x.total + 0.03, 2)
    assert validate.math_issues(x)[0] == []


def test_vendor_subtotal_error_is_flagged():
    x = inv(lines=(("A", "a", 1, 3200.0), ("B", "b", 1, 640.0)), subtotal=3940.0)
    issues, figures = validate.math_issues(x)
    assert figures["lines_sum"] == 3840.0 and any("$3,940.00" in i for i in issues)


# --- Happy path + split POs ----------------------------------------------------------------------
def test_happy_path_approves(store):
    x = inv(po="PO-1042", lines=(("ACM-EC-220", "Chair", 20, 245.0), ("ACM-SD-560", "Desk", 10, 520.0),
                                 ("ACM-DLV", "Delivery", 1, 350.0)))
    c = run_rules(store, x)
    assert c.decision == "APPROVE", [ch.message for ch in c.fails()]


def test_split_po_partial_then_overbill(store):
    c1 = run_rules(store, inv(number="P1", lines=(("ACM-STK-100", "Chair", 60, 100.0),)), run_id="r1", file_hash="h1")
    assert c1.decision == "APPROVE"
    store.record_approved_invoice(c1.approved_write)
    c2 = run_rules(store, inv(number="P2", date="2026-11-07", lines=(("ACM-STK-100", "Chair", 50, 100.0),)),
                   run_id="r2", file_hash="h2")
    assert c2.decision == "HOLD"
    assert {"QTY_EXCEEDS_REMAINING", "RUNNING_TOTAL_EXCEEDS_PO"} <= codes(c2)


def test_split_po_exact_remainder_approves_and_closes(store):
    c1 = run_rules(store, inv(number="P1", lines=(("ACM-STK-100", "Chair", 60, 100.0),)), run_id="r1", file_hash="h1")
    store.record_approved_invoice(c1.approved_write)
    c2 = run_rules(store, inv(number="P2", lines=(("ACM-STK-100", "Chair", 40, 100.5),)), run_id="r2", file_hash="h2")
    assert c2.decision == "APPROVE"  # +0.5% price is within tolerance, 40 = what's left
    change = store.record_approved_invoice(c2.approved_write)
    assert change["po"]["status"] == "closed"


# --- Price tolerance ---------------------------------------------------------------------------
def test_price_within_tolerance_passes(store):
    c = run_rules(store, inv(po="PO-1061", lines=(("ACM-FC-4D", "Cabinet", 15, 181.0),)))  # +0.56%
    assert "PRICE_OVER_TOLERANCE" not in codes(c)


def test_price_over_tolerance_holds(store):
    c = run_rules(store, inv(po="PO-1061", lines=(("ACM-FC-4D", "Cabinet", 15, 189.0),)))  # +5%
    assert c.decision == "HOLD" and "PRICE_OVER_TOLERANCE" in codes(c)


# --- Vendor + bank ------------------------------------------------------------------------------
def test_changed_bank_details_hold_even_when_everything_else_matches(store):
    x = inv(po="PO-1042", lines=(("ACM-EC-220", "Chair", 20, 245.0), ("ACM-SD-560", "Desk", 10, 520.0),
                                 ("ACM-DLV", "Delivery", 1, 350.0)), account="9918273645", routing="031101279")
    c = run_rules(store, x)
    assert c.decision == "HOLD" and codes(c) == {"BANK_DETAILS_MISMATCH"}


def test_unapproved_vendor_rejects(store):
    c = run_rules(store, inv(vendor="Crestline Print and Signage", po="PO-1063", account=None, routing=None))
    assert c.decision == "REJECT" and "VENDOR_NOT_APPROVED" in codes(c)


def test_unknown_vendor_rejects(store):
    c = run_rules(store, inv(vendor="Totally New Supplier Ltd", account=None, routing=None))
    assert c.decision == "REJECT"


# --- Duplicates -----------------------------------------------------------------------------------
def test_resubmitted_with_new_number_is_suspected_duplicate(store):
    x = inv(vendor="Blue Harbor Logistics", number="INV-2041-R", date="2026-10-03", po="PO-1033",
            lines=(("BHL-LTL", "Freight", 3, 425.0),), tax_rate=0, account="3091827364", routing="026009593")
    c = run_rules(store, x)
    assert c.decision == "HOLD" and codes(c) == {"DUPLICATE_SUSPECTED"}


def test_same_number_same_amount_is_exact_duplicate(store):
    x = inv(vendor="Blue Harbor Logistics", number="INV-2041", date="2026-10-03", po="PO-1033",
            lines=(("BHL-LTL", "Freight", 3, 425.0),), tax_rate=0, account="3091827364", routing="026009593")
    assert run_rules(store, x).decision == "REJECT"


def test_reused_number_next_year_is_not_a_duplicate(store):
    # Vendor restarted numbering: INV-2041 again, a year later, different amount -> a genuinely new bill
    x = inv(vendor="Blue Harbor Logistics", number="INV-2041", date="2027-10-20", po="PO-1033",
            lines=(("BHL-LTL", "Freight", 2, 425.0),), tax_rate=0, account="3091827364", routing="026009593")
    c = run_rules(store, x)
    assert "DUPLICATE_SUSPECTED" not in codes(c) and "DUPLICATE_EXACT" not in codes(c)


# --- Writes ---------------------------------------------------------------------------------------
def test_write_is_idempotent(store):
    c = run_rules(store, inv(lines=(("ACM-STK-100", "Chair", 60, 100.0),)))
    store.record_approved_invoice(c.approved_write)
    again = store.record_approved_invoice(c.approved_write)
    assert again.get("skipped") is True
    assert store.snapshot().po("PO-1050").amount_invoiced == 6000.0


# --- Vendor name variants ---------------------------------------------------------------------------
def test_llc_with_dots_matches_alias():
    assert norm_name("Summit Tech Supplies, L.L.C.") == norm_name("Summit Tech Supplies LLC")


def test_unknown_name_variant_matched_by_tax_id(store):
    snap = store.snapshot()
    v, how = match.resolve_vendor("Summit Technology Supplies, L.L.C.", snap, tax_id="27-1946652")
    assert v.vendor_id == "V002" and how == "tax_id"


def test_unknown_name_and_unknown_tax_id_is_not_matched(store):
    v, _ = match.resolve_vendor("Northgate Office Supply Co.", store.snapshot(), tax_id="11-2223334")
    assert v is None


def test_one_blurry_digit_looks_like_a_misread_but_a_new_account_does_not():
    assert match.looks_like_misread("121005358", "121000358")
    assert not match.looks_like_misread("9918273645", "7730019284")
    assert not match.looks_like_misread("12100035", "121000358")
