"""Generate the demo invoice PDFs + manifest.

Three vendor layouts (different structure, date formats, with/without SKUs) so the
extraction step is exercised on genuinely different documents, plus one scanned,
image-only PDF.

Run:  cd backend && uv run python ../scripts/make_invoices.py
"""

from __future__ import annotations

import io
import json
import random
from datetime import date
from pathlib import Path

import fitz  # PyMuPDF
from PIL import Image, ImageFilter
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "invoices"
OUT.mkdir(parents=True, exist_ok=True)

W, H = letter
BUYER = ["Brightline Workspace Inc.", "Attn: Accounts Payable", "400 Market Street, Suite 1200",
         "San Francisco, CA 94105", "ap@brightline.example"]

VENDORS = {
    "acme": {
        "name": "Acme Office Furniture Co.", "tagline": "Workspace furniture, delivered and installed",
        "address": ["1180 Bryant Street", "San Francisco, CA 94103"], "phone": "+1 (415) 555-0142",
        "email": "billing@acmeoffice.example", "tax_id": "94-3381207",
        "bank": {"name": "First Pacific Bank", "account": "004417820093", "routing": "121000358"},
        "color": colors.HexColor("#1F3A5F"),
    },
    "summit": {
        "name": "Summit Tech Supplies LLC", "address": ["2201 Tasman Drive, Bldg 4", "Santa Clara, CA 95054"],
        "phone": "+1 (408) 555-0199", "email": "ar@summittech.example", "tax_id": "27-1946652",
        "bank": {"name": "Silicon Valley Commerce Bank", "account": "7730019284", "routing": "121000248"},
        "color": colors.HexColor("#0F766E"),
    },
    "greenleaf": {
        "name": "Greenleaf Facility Services Inc.", "address": ["77 Industrial Way", "Oakland, CA 94607"],
        "phone": "+1 (510) 555-0117", "email": "accounts@greenleaf.example", "tax_id": "68-0457719",
        "bank": {"name": "Bay Credit Union", "account": "5520148876", "routing": "322271627"},
    },
    "blueharbor": {
        "name": "Blue Harbor Logistics Inc.", "address": ["500 Terminal Blvd", "South San Francisco, CA 94080"],
        "phone": "+1 (650) 555-0163", "email": "billing@blueharbor.example", "tax_id": "45-2210938",
        "bank": {"name": "Harborline National Bank", "account": "3091827364", "routing": "026009593"},
        "color": colors.HexColor("#1D4ED8"),
    },
    "crestline": {
        "name": "Crestline Print & Signage", "tagline": "Signage - Wayfinding - Large format print",
        "address": ["39 Dore Street", "San Francisco, CA 94103"], "phone": "+1 (415) 555-0188",
        "email": "hello@crestline.example", "tax_id": "83-1172054",
        "bank": {"name": "Golden Gate Savings", "account": "6612093847", "routing": "091000019"},
        "color": colors.HexColor("#7F1D1D"),
    },
}


def money(x: float) -> str:
    return f"${x:,.2f}"


def fmt_date(iso: str, style: str) -> str:
    d = date.fromisoformat(iso)
    if style == "long":
        return d.strftime("%b %d, %Y").replace(" 0", " ")
    if style == "us":
        return d.strftime("%m/%d/%Y")
    return iso


def amounts(spec: dict) -> tuple[float, float, float]:
    lines_sum = round(sum(q * p for _, _, q, p in spec["lines"]), 2)
    subtotal = spec.get("subtotal_override", lines_sum)
    tax = round(subtotal * spec.get("tax_rate", 0.0), 2)
    return subtotal, tax, round(subtotal + tax, 2)


# ---------------------------------------------------------------------------
# Layout A: modern colour band, SKU column, long dates (Acme, Crestline)
# ---------------------------------------------------------------------------
def layout_a(c: canvas.Canvas, s: dict) -> None:
    v = VENDORS[s["vendor"]]
    c.setFillColor(v["color"]); c.rect(0, H - 100, W, 100, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 20); c.drawString(40, H - 50, v["name"])
    c.setFont("Helvetica", 9); c.drawString(40, H - 68, v.get("tagline", ""))
    c.setFont("Helvetica-Bold", 22); c.drawRightString(W - 40, H - 55, s.get("title", "INVOICE"))

    c.setFillColor(colors.HexColor("#334155")); c.setFont("Helvetica-Bold", 9)
    c.drawString(40, H - 130, "BILL TO")
    c.setFont("Helvetica", 10)
    for i, ln in enumerate(BUYER):
        c.drawString(40, H - 145 - i * 13, ln)

    rows = [("Invoice #", s["number"]), ("Invoice date", fmt_date(s["date"], "long")),
            ("Due date", fmt_date(s["due"], "long")), ("Terms", s.get("terms", "Net 30"))]
    if s.get("po"):
        rows.insert(1, ("PO number", s["po"]))
    for i, (k, val) in enumerate(rows):
        y = H - 130 - i * 15
        c.setFont("Helvetica-Bold", 9); c.drawString(360, y, k.upper())
        c.setFont("Helvetica", 10); c.drawRightString(W - 40, y, val)

    y = H - 245
    c.setFillColor(colors.HexColor("#F1F5F9")); c.rect(40, y - 6, W - 80, 20, stroke=0, fill=1)
    c.setFillColor(colors.HexColor("#0F172A")); c.setFont("Helvetica-Bold", 9)
    c.drawString(48, y, "SKU"); c.drawString(140, y, "DESCRIPTION"); c.drawRightString(400, y, "QTY")
    c.drawRightString(480, y, "UNIT PRICE"); c.drawRightString(W - 48, y, "AMOUNT")
    c.setFont("Helvetica", 10)
    for sku, desc, q, p in s["lines"]:
        y -= 24
        c.drawString(48, y, sku or ""); c.drawString(140, y, desc); c.drawRightString(400, y, f"{q:g}")
        c.drawRightString(480, y, money(p)); c.drawRightString(W - 48, y, money(q * p))
        c.setStrokeColor(colors.HexColor("#E2E8F0")); c.line(40, y - 8, W - 40, y - 8)

    subtotal, tax, total = amounts(s)
    y -= 40
    for label, val, bold in [("Subtotal", subtotal, False),
                             (f"Sales tax ({s.get('tax_rate', 0) * 100:g}%)", tax, False),
                             ("TOTAL DUE (USD)", total, True)]:
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 11 if bold else 10)
        c.drawString(360, y, label); c.drawRightString(W - 48, y, money(val)); y -= 18

    if s.get("notice"):
        _notice(c, s["notice"], 40, y - 30)

    bank = s.get("bank", v["bank"])
    c.setFillColor(colors.HexColor("#475569")); c.setFont("Helvetica-Bold", 9)
    c.drawString(40, 120, "REMIT TO")
    c.setFont("Helvetica", 9)
    c.drawString(40, 106, f"{bank['name']}  |  Routing (ABA): {bank['routing']}  |  Account: {bank['account']}")
    c.drawString(40, 80, f"{v['name']}  |  {', '.join(v['address'])}  |  {v['phone']}  |  EIN {v['tax_id']}")
    c.drawString(40, 66, f"Questions about this invoice: {v['email']}")


# ---------------------------------------------------------------------------
# Layout B: corporate, details box, "Item code", ISO dates (Summit, Blue Harbor)
# ---------------------------------------------------------------------------
def layout_b(c: canvas.Canvas, s: dict) -> None:
    v = VENDORS[s["vendor"]]
    c.setFillColor(v["color"]); c.setFont("Helvetica-Bold", 18); c.drawString(40, H - 60, v["name"].upper())
    c.setFillColor(colors.HexColor("#374151")); c.setFont("Helvetica", 9)
    for i, ln in enumerate(v["address"] + [v["phone"], v["email"], f"Tax ID: {v['tax_id']}"]):
        c.drawString(40, H - 76 - i * 11, ln)

    bx, by, bw, bh = 360, H - 150, W - 400, 110
    c.setStrokeColor(v["color"]); c.setLineWidth(1.2); c.rect(bx, by, bw, bh)
    c.setFillColor(v["color"]); c.rect(bx, by + bh - 22, bw, 22, stroke=0, fill=1)
    c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 12); c.drawString(bx + 10, by + bh - 16, "INVOICE")
    c.setFillColor(colors.HexColor("#111827"))
    rows = [("Invoice No.", s["number"]), ("Invoice Date", s["date"]),
            ("Customer PO", s.get("po") or s.get("customer_ref", "-")), ("Payment Terms", s.get("terms", "Net 30")),
            ("Due Date", s["due"])]
    for i, (k, val) in enumerate(rows):
        y = by + bh - 38 - i * 15
        c.setFont("Helvetica", 9); c.drawString(bx + 10, y, k)
        c.setFont("Helvetica-Bold", 9); c.drawRightString(bx + bw - 10, y, val)

    c.setFont("Helvetica-Bold", 9); c.drawString(40, H - 190, "SOLD TO")
    c.setFont("Helvetica", 10)
    for i, ln in enumerate(BUYER[:4]):
        c.drawString(40, H - 204 - i * 13, ln)

    y = H - 285
    c.setStrokeColor(colors.HexColor("#111827")); c.setLineWidth(0.8); c.line(40, y + 14, W - 40, y + 14)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(44, y, "Item code"); c.drawString(140, y, "Description"); c.drawRightString(400, y, "Qty")
    c.drawRightString(480, y, "Price"); c.drawRightString(W - 44, y, "Ext. price")
    c.line(40, y - 6, W - 40, y - 6)
    c.setFont("Helvetica", 9.5)
    for sku, desc, q, p in s["lines"]:
        y -= 20
        c.drawString(44, y, sku or ""); c.drawString(140, y, desc); c.drawRightString(400, y, f"{q:g}")
        c.drawRightString(480, y, f"{p:,.2f}"); c.drawRightString(W - 44, y, f"{q * p:,.2f}")
    c.line(40, y - 10, W - 40, y - 10)

    subtotal, tax, total = amounts(s)
    y -= 30
    tax_label = f"Sales Tax {s.get('tax_rate', 0) * 100:g}%" if s.get("tax_rate") else "Sales Tax (exempt)"
    for label, val, bold in [("Subtotal", subtotal, False), (tax_label, tax, False), ("Amount Due USD", total, True)]:
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 10.5 if bold else 9.5)
        c.drawString(380, y, label); c.drawRightString(W - 44, y, f"{val:,.2f}"); y -= 16

    if s.get("notice"):
        _notice(c, s["notice"], 40, 205)

    bank = s.get("bank", v["bank"])
    c.setFillColor(colors.HexColor("#111827"))
    c.setStrokeColor(colors.HexColor("#9CA3AF")); c.rect(40, 90, 300, 70)
    c.setFont("Helvetica-Bold", 9); c.drawString(50, 145, "Remittance information")
    c.setFont("Helvetica", 9)
    c.drawString(50, 130, f"Bank: {bank['name']}")
    c.drawString(50, 117, f"ABA routing: {bank['routing']}")
    c.drawString(50, 104, f"Account no.: {bank['account']}")
    c.setFont("Helvetica-Oblique", 8); c.setFillColor(colors.HexColor("#6B7280"))
    c.drawString(40, 60, "Please reference the invoice number on your payment. Thank you for your business.")


# ---------------------------------------------------------------------------
# Layout C: plain monospace, no SKUs, US dates (Greenleaf)
# ---------------------------------------------------------------------------
def layout_c(c: canvas.Canvas, s: dict) -> None:
    v = VENDORS[s["vendor"]]
    c.setFont("Courier-Bold", 15); c.drawCentredString(W / 2, H - 55, v["name"])
    c.setFont("Courier", 9)
    c.drawCentredString(W / 2, H - 70, f"{', '.join(v['address'])}  -  {v['phone']}")
    c.drawCentredString(W / 2, H - 82, f"Federal Tax ID {v['tax_id']}")
    c.line(40, H - 92, W - 40, H - 92)
    c.setFont("Courier-Bold", 13); c.drawString(40, H - 118, "INVOICE")
    c.setFont("Courier", 10)
    left = [f"Invoice No:  {s['number']}", f"Date:        {fmt_date(s['date'], 'us')}",
            f"Due:         {fmt_date(s['due'], 'us')}"]
    if s.get("po"):
        left.append(f"Your PO:     {s['po']}")
    for i, ln in enumerate(left):
        c.drawString(40, H - 138 - i * 13, ln)
    c.drawString(330, H - 138, "Customer:")
    for i, ln in enumerate(BUYER[:4]):
        c.drawString(330, H - 151 - i * 13, ln)

    y = H - 230
    c.setFont("Courier-Bold", 10)
    c.drawString(40, y, "DESCRIPTION"); c.drawRightString(390, y, "QTY"); c.drawRightString(470, y, "RATE")
    c.drawRightString(W - 40, y, "AMOUNT")
    c.line(40, y - 5, W - 40, y - 5)
    c.setFont("Courier", 10)
    for _, desc, q, p in s["lines"]:
        y -= 18
        c.drawString(40, y, desc); c.drawRightString(390, y, f"{q:g}"); c.drawRightString(470, y, f"{p:,.2f}")
        c.drawRightString(W - 40, y, f"{q * p:,.2f}")
    c.line(40, y - 8, W - 40, y - 8)
    subtotal, tax, total = amounts(s)
    y -= 26
    for label, val in [("Subtotal", subtotal), (f"Sales tax {s.get('tax_rate', 0) * 100:g}%", tax), ("TOTAL", total)]:
        c.setFont("Courier-Bold" if label == "TOTAL" else "Courier", 10)
        c.drawString(330, y, label); c.drawRightString(W - 40, y, f"{val:,.2f}"); y -= 15

    bank = s.get("bank", v["bank"])
    c.setFont("Courier", 9)
    c.drawString(40, 130, "Please remit payment to:")
    c.drawString(40, 117, f"{bank['name']}, routing {bank['routing']}, acct {bank['account']}")
    c.drawString(40, 95, f"Questions? {v['email']}")


def _notice(c: canvas.Canvas, text: str, x: float, y: float) -> None:
    c.setStrokeColor(colors.HexColor("#B91C1C")); c.setFillColor(colors.HexColor("#FEF2F2"))
    c.rect(x, y - 8, W - 2 * x, 32, stroke=1, fill=1)
    c.setFillColor(colors.HexColor("#B91C1C")); c.setFont("Helvetica-Bold", 9.5)
    c.drawString(x + 10, y + 9, text[0]); c.setFont("Helvetica", 9); c.drawString(x + 10, y - 3, text[1])


LAYOUTS = {"A": layout_a, "B": layout_b, "C": layout_c}

# ---------------------------------------------------------------------------
# The demo set
# ---------------------------------------------------------------------------
INVOICES = [
    dict(file="01_happy_path.pdf", layout="A", vendor="acme", number="AOF-90412", date="2026-11-02",
         due="2026-12-02", po="PO-1042", tax_rate=0.08,
         lines=[("ACM-EC-220", "Ergonomic Task Chair", 20, 245.00),
                ("ACM-SD-560", 'Electric Standing Desk, 60"', 10, 520.00),
                ("ACM-DLV", "Delivery & Assembly", 1, 350.00)],
         manifest=dict(title="Happy path", group="happy",
                       story="Clean digital invoice from an approved vendor. PO number printed, every line matches PO-1042, tax is right, bank details match the vendor file.",
                       expected_decision="APPROVE", expected_codes=[])),
    dict(file="02_bank_details_changed.pdf", layout="B", vendor="summit", number="STS-61877", date="2026-11-03",
         due="2026-12-03", po="PO-1047", tax_rate=0.08,
         bank={"name": "Meridian Trust Bank", "account": "9918273645", "routing": "031101279"},
         notice=("IMPORTANT: Our banking details have changed.",
                 "Please update your records and remit all future payments to the account below."),
         lines=[("STS-LT-14P", "Laptop 14in Pro, 32GB/1TB", 8, 1450.00),
                ("STS-MN-27Q", "27in QHD Monitor", 8, 310.00),
                ("STS-DK-USBC", "USB-C Docking Station", 8, 189.00)],
         manifest=dict(title="Perfect invoice, new bank details", group="edge",
                       story="Everything matches PO-1047 exactly, but the remit-to bank account differs from the vendor file. Classic vendor-impersonation fraud.",
                       expected_decision="HOLD", expected_codes=["BANK_DETAILS_MISMATCH"])),
    dict(file="03_vendor_math_error.pdf", layout="C", vendor="greenleaf", number="GFS-2026-1107",
         date="2026-11-04", due="2026-12-04", po="PO-1039", tax_rate=0.08, subtotal_override=3940.00,
         lines=[(None, "Janitorial services - October 2026", 1, 3200.00),
                (None, "Consumables restock (liners, sanitizer)", 1, 640.00)],
         manifest=dict(title="Vendor's own maths is wrong", group="edge",
                       story="Line items add up to $3,840 but the vendor printed a subtotal of $3,940. The system re-reads once to rule out a misread, then holds for a corrected invoice.",
                       expected_decision="HOLD", expected_codes=["VENDOR_MATH_ERROR"])),
    dict(file="04_duplicate_resubmitted.pdf", layout="B", vendor="blueharbor", number="INV-2041-R",
         date="2026-10-03", due="2026-11-02", po="PO-1033", tax_rate=0.0,
         lines=[("BHL-LTL", "LTL freight - SF Bay Area (BOL 77120/77134/77151)", 3, 425.00)],
         manifest=dict(title="Same bill, new number", group="edge",
                       story="INV-2041 was approved on Oct 6. The vendor re-sent it as INV-2041-R: same amount, date and lines. Exact-number checks miss it.",
                       expected_decision="HOLD", expected_codes=["DUPLICATE_SUSPECTED"])),
    dict(file="05a_split_part1.pdf", layout="A", vendor="acme", number="AOF-90455", date="2026-11-05",
         due="2026-12-05", po="PO-1050", tax_rate=0.08,
         lines=[("ACM-STK-100", "Stacking Chair - Polypropylene", 60, 100.00)],
         manifest=dict(title="Split PO, part 1 (60 of 100)", group="edge",
                       story="First partial invoice against PO-1050 (100 chairs). Billing less than the PO is normal - approve and track what's left. Run this before part 2.",
                       expected_decision="APPROVE", expected_codes=[])),
    dict(file="05b_split_part2.pdf", layout="A", vendor="acme", number="AOF-90471", date="2026-11-07",
         due="2026-12-07", po="PO-1050", tax_rate=0.08,
         lines=[("ACM-STK-100", "Stacking Chair - Polypropylene", 50, 100.00)],
         manifest=dict(title="Split PO, part 2 (50 more)", group="edge",
                       story="Fine on its own, but after part 1 only 40 chairs are left. Together the two bills are $11,000 on a $10,000 order.",
                       expected_decision="HOLD", expected_codes=["QTY_EXCEEDS_REMAINING", "RUNNING_TOTAL_EXCEEDS_PO"])),
    dict(file="06_scanned.pdf", layout="C", vendor="greenleaf", number="GFS-2026-1112", date="2026-11-06",
         due="2026-12-06", po="PO-1044", tax_rate=0.08, scanned=True,
         lines=[(None, "Ground coffee 1kg", 24, 18.50),
                (None, "Paper towels (case/12)", 30, 22.00),
                (None, "Dish soap 1L", 12, 6.25)],
         manifest=dict(title="Scanned invoice", group="brief",
                       story="Image-only PDF (no text layer), slightly skewed. Same reading path as digital PDFs; descriptions differ from the PO so lines are paired by meaning.",
                       expected_decision="APPROVE", expected_codes=[])),
    dict(file="07_no_po_number.pdf", layout="B", vendor="summit", number="STS-61902", date="2026-11-06",
         due="2026-12-06", po=None, customer_ref="Onboarding kits", tax_rate=0.08,
         lines=[("STS-KM-WL", "Wireless Keyboard + Mouse Combo", 40, 62.00),
                ("STS-MN-27Q", "27in QHD Monitor", 10, 310.00)],
         manifest=dict(title="No PO number", group="brief",
                       story="No PO printed. The system narrows to the vendor's open POs, the model suggests the best fit, code verifies it - and holds for a human to confirm.",
                       expected_decision="HOLD", expected_codes=["PO_INFERRED"])),
    dict(file="08_price_over_tolerance.pdf", layout="A", vendor="acme", number="AOF-90488", date="2026-11-08",
         due="2026-12-08", po="PO-1061", tax_rate=0.08,
         lines=[("ACM-FC-4D", "4-Drawer Filing Cabinet", 15, 189.00)],
         manifest=dict(title="Price above tolerance", group="brief",
                       story="Quantity matches, but the unit price is $189 vs $180 on the PO (+5%, tolerance is 1%).",
                       expected_decision="HOLD", expected_codes=["PRICE_OVER_TOLERANCE"])),
    dict(file="09_unapproved_vendor.pdf", layout="A", vendor="crestline", number="CPS-3310", date="2026-11-04",
         due="2026-12-04", po="PO-1063", tax_rate=0.08,
         lines=[("CPS-WF-PKG", "Wayfinding signage package", 1, 2850.00),
                ("CPS-INST", "On-site installation", 1, 400.00)],
         manifest=dict(title="Vendor not approved", group="brief",
                       story="Crestline is in the vendor file but onboarding is incomplete, so it is not approved for payment.",
                       expected_decision="REJECT", expected_codes=["VENDOR_NOT_APPROVED"])),
    dict(file="10_proforma.pdf", layout="A", vendor="acme", number="PF-2207", date="2026-11-08",
         due="2026-11-15", po="PO-1061", tax_rate=0.08, title="PROFORMA INVOICE", terms="Advance payment",
         notice=("Proforma - advance payment requested before dispatch.",
                 "This is not a tax invoice. A final invoice will be issued on delivery."),
         lines=[("ACM-LS-3S", "Lounge Sofa, 3-seat", 4, 1150.00)],
         manifest=dict(title="Not actually an invoice", group="brief",
                       story="A proforma is a request for advance payment, not a bill. It must not be booked as a payable.",
                       expected_decision="REJECT", expected_codes=["DOC_NOT_INVOICE"])),
]


def render(spec: dict) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    c.setTitle(f"{VENDORS[spec['vendor']]['name']} {spec['number']}")
    LAYOUTS[spec["layout"]](c, spec)
    c.showPage(); c.save()
    return buf.getvalue()


def to_scanned(pdf_bytes: bytes, seed: int = 7) -> bytes:
    """Rasterise, skew, add noise -> image-only PDF (no text layer)."""
    rnd = random.Random(seed)
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pix = doc[0].get_pixmap(dpi=140, colorspace=fitz.csGRAY)
    img = Image.frombytes("L", (pix.width, pix.height), pix.samples)
    img = img.rotate(-1.3, resample=Image.BICUBIC, expand=True, fillcolor=238)
    noise = Image.effect_noise(img.size, 22).point(lambda v: 255 if v > 120 else 225)
    img = Image.blend(img, noise, 0.10).filter(ImageFilter.GaussianBlur(0.6))
    img = img.point(lambda v: int(v * 0.92 + rnd.randint(0, 6)))
    out = io.BytesIO()
    img.convert("RGB").save(out, format="PDF", resolution=140)
    return out.getvalue()


def main() -> None:
    manifest = []
    for spec in INVOICES:
        pdf = render(spec)
        if spec.get("scanned"):
            pdf = to_scanned(pdf)
        (OUT / spec["file"]).write_bytes(pdf)
        subtotal, tax, total = amounts(spec)
        manifest.append({"file": spec["file"], **spec["manifest"],
                         "vendor": VENDORS[spec["vendor"]]["name"], "invoice_number": spec["number"],
                         "total": total})
        print(f"  {spec['file']:<32} {spec['number']:<14} total {money(total):>12}")
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"Wrote {len(INVOICES)} invoices + manifest.json to {OUT}")


if __name__ == "__main__":
    main()
