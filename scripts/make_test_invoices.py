"""Generate a second, unseen set of invoices for hands-on testing (upload them yourself).

Deliberately harder than the demo set:
  * low-quality scans (skew, noise, blur, JPEG artefacts, a phone-photo look)
  * vendor names that differ from the vendor file (known alias, unknown spelling, unknown vendor)
  * item descriptions worded differently from the PO, often with no item codes

They use their own POs (PO-1066 .. PO-1076) so they don't interfere with the demo invoices.

Run:  cd backend && uv run python ../scripts/make_test_invoices.py
"""

from __future__ import annotations

import io
import random
import sys
from pathlib import Path

import fitz
from PIL import Image, ImageChops, ImageFilter
from reportlab.lib import colors

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_invoices import VENDORS, amounts, money, render  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "test_invoices"
OUT.mkdir(parents=True, exist_ok=True)

# Vendor-name variants: same company details, different name printed on the invoice
VENDORS["acme_alias"] = {**VENDORS["acme"], "name": "ACME Furniture"}
VENDORS["acme_company"] = {**VENDORS["acme"], "name": "Acme Office Furniture Company"}
VENDORS["summit_variant"] = {**VENDORS["summit"], "name": "Summit Technology Supplies, L.L.C."}
VENDORS["greenleaf_alias"] = {**VENDORS["greenleaf"], "name": "Greenleaf Facilities"}
VENDORS["blueharbor_alias"] = {**VENDORS["blueharbor"], "name": "Blue Harbor Freight"}
VENDORS["northgate"] = {
    "name": "Northgate Office Supply Co.", "tagline": "Paper, toner and everything in between",
    "address": ["2450 Mission Street", "San Francisco, CA 94110"], "phone": "+1 (415) 555-0131",
    "email": "billing@northgate.example", "tax_id": "11-2223334",
    "bank": {"name": "Mission Community Bank", "account": "8820017734", "routing": "121140399"},
    "color": colors.HexColor("#3F6212"),
}


def degrade(pdf: bytes, *, dpi=120, rotate=-1.5, noise=0.12, blur=0.7, jpeg: int | None = None,
            shadow=False, seed=3) -> bytes:
    """Rasterise and damage a clean PDF -> image-only PDF (no text layer)."""
    rnd = random.Random(seed)
    pix = fitz.open(stream=pdf, filetype="pdf")[0].get_pixmap(dpi=dpi, colorspace=fitz.csGRAY)
    img = Image.frombytes("L", (pix.width, pix.height), pix.samples)
    img = img.rotate(rotate, resample=Image.BICUBIC, expand=True, fillcolor=228)
    if shadow:  # uneven phone lighting: darker towards one corner
        w, h = img.size
        gx = Image.linear_gradient("L").rotate(90).resize((w, h))   # left -> right
        gy = Image.linear_gradient("L").resize((w, h))              # top -> bottom
        grad = ImageChops.add(gx, gy, scale=2).point(lambda v: int(255 - v * 0.38))
        img = ImageChops.multiply(img, grad)
    speckle = Image.effect_noise(img.size, 45).point(lambda v: 255 if v > 105 else 190)
    img = Image.blend(img, speckle, noise).filter(ImageFilter.GaussianBlur(blur))
    img = img.point(lambda v: max(0, min(255, int(v * 0.93 + rnd.randint(0, 8)))))
    if jpeg:
        buf = io.BytesIO(); img.save(buf, "JPEG", quality=jpeg); buf.seek(0); img = Image.open(buf)
    out = io.BytesIO()
    img.convert("RGB").save(out, format="PDF", resolution=dpi)
    return out.getvalue()


SCAN = dict(dpi=115, rotate=-2.2, noise=0.15, blur=0.8)                       # office scanner, a bit tired
BAD_SCAN = dict(dpi=96, rotate=1.7, noise=0.2, blur=1.0, jpeg=32, seed=11)     # fax-quality
PHONE = dict(dpi=104, rotate=3.1, noise=0.14, blur=1.1, jpeg=28, shadow=True, seed=5)  # photo on a desk

T05 = dict(layout="A", vendor="acme_company", number="AOF-90533", date="2026-11-10", due="2026-12-10",
           po="PO-1074", tax_rate=0.08,
           lines=[(None, "3-Seater Lounge Couch, charcoal", 2, 1150.00),
                  (None, "Coffee Table - Round, Oak", 4, 260.00)])

TESTS = [
    dict(file="t01_scan_acme_alias.pdf", degrade=SCAN, layout="C", vendor="acme_alias", number="AF-11208",
         date="2026-11-09", due="2026-12-09", po="PO 1066", tax_rate=0.08,
         lines=[(None, "Task chair - ergonomic, black", 12, 245.00),
                (None, "Monitor arm (dual)", 12, 89.00)],
         what="Scanned (skewed, noisy). Vendor printed as 'ACME Furniture' (a known alias). Item names differ from the PO, no item codes. PO written as 'PO 1066'.",
         expect="APPROVE - vendor matched by alias, lines paired by meaning, PO-1066 closed"),
    dict(file="t02_summit_name_variant.pdf", layout="B", vendor="summit_variant", number="STS-62044",
         date="2026-11-09", due="2026-12-09", po="PO-1068", tax_rate=0.08,
         lines=[(None, '65" 4K UHD Display Panel', 2, 1290.00),
                (None, "Conference Cam 4K with mic array", 2, 640.00),
                (None, "VESA Wall Mount Kit", 2, 115.00)],
         what="Vendor printed as 'Summit Technology Supplies, L.L.C.' - not a name in the vendor file. Item names reworded, no item codes.",
         expect="APPROVE - vendor matched by tax ID (shown as a note), lines paired by meaning"),
    dict(file="t03_badscan_greenleaf_price.pdf", degrade=BAD_SCAN, layout="C", vendor="greenleaf_alias",
         number="GFS-2026-1121", date="2026-11-10", due="2026-12-10", po="PO-1070", tax_rate=0.08,
         lines=[(None, "Janitorial svc - Nov 2026", 1, 3200.00),
                (None, "Window wash, exterior (all floors)", 1, 495.00)],
         what="Fax-quality scan with JPEG artefacts. Vendor as 'Greenleaf Facilities' (alias). Window cleaning billed at $495 vs $450 on the PO.",
         expect="HOLD - price above PO (+10%) and over the PO total"),
    dict(file="t04_blueharbor_fuel_surcharge.pdf", layout="B", vendor="blueharbor_alias", number="BHF-7731",
         date="2026-11-10", due="2026-12-10", po="PO-1072", tax_rate=0.0,
         lines=[("BHL-FTL", "FTL - San Francisco to Oakland", 2, 1150.00),
                ("BHL-LIFT", "Lift gate", 2, 85.00),
                (None, "Fuel surcharge", 1, 20.00)],
         what="Vendor as 'Blue Harbor Freight' (alias). Adds a $20 fuel surcharge that is not on the PO - small enough that the total is still inside the 1% tolerance.",
         expect="HOLD - charge not on PO (caught line by line even though the total is within tolerance)"),
    dict(file="t05_acme_partial_reworded.pdf", **T05,
         what="Vendor as 'Acme Office Furniture Company' (alias). Bills 2 of the 4 sofas and all 4 tables, with reworded item names.",
         expect="APPROVE - partial invoice; PO-1074 stays open with $2,300 left"),
    dict(file="t06_phone_photo_of_t05.pdf", degrade=PHONE, **T05,
         what="The same invoice as t05, re-sent as a blurry phone photo (different file, same bill).",
         expect="Run AFTER t05: REJECT - already paid. The routing number is genuinely blurry: the system re-reads the bank details once; if a digit still can't be confirmed it says so (possible misread) rather than crying fraud. (Run before t05 it would approve, or hold on the unreadable digit.)"),
    dict(file="t07_summit_wrong_po.pdf", layout="B", vendor="summit", number="STS-62071", date="2026-11-10",
         due="2026-12-10", po="PO-1070", tax_rate=0.08,
         lines=[("STS-DK-USBC", "USB-C Dock, 100W", 6, 189.00),
                ("STS-KB-ERG", "Ergo Keyboard, wired", 6, 79.00)],
         what="Cites PO-1070 - a real PO, but it belongs to Greenleaf (janitorial), not Summit. Typo-style mistake.",
         expect="HOLD - PO belongs to another vendor; suggests PO-1076 (docks + keyboards) for a person to confirm"),
    dict(file="t08_unknown_vendor.pdf", layout="A", vendor="northgate", number="NOS-5521", date="2026-11-10",
         due="2026-12-10", po="PO-1066", tax_rate=0.08,
         lines=[(None, "Copy paper, letter, 10-ream case", 20, 42.00),
                (None, "Toner cartridge, black", 6, 118.00)],
         what="'Northgate Office Supply Co.' - not in the vendor file under any name or tax ID. Cites someone else's PO.",
         expect="REJECT - vendor not approved (must be onboarded first)"),
]


def main() -> None:
    rows = []
    for t in TESTS:
        pdf = render(t)
        if t.get("degrade"):
            pdf = degrade(pdf, **t["degrade"])
        (OUT / t["file"]).write_bytes(pdf)
        _, _, total = amounts(t)
        rows.append((t["file"], VENDORS[t["vendor"]]["name"], t["number"], money(total), t["what"], t["expect"]))
        print(f"  {t['file']:<36} {t['number']:<14} {money(total):>11}  {'scan' if t.get('degrade') else 'digital'}")

    md = ["# Test invoices (not in the sample library)", "",
          "Upload these from the **Process** page (drag & drop) to test the system yourself.",
          "They use their own purchase orders (PO-1066 to PO-1076) and do not affect the demo invoices.", "",
          "**Run t05 before t06.**", "",
          "| File | Vendor as printed | Invoice | Total | What's different | Expected |",
          "|---|---|---|---|---|---|"]
    md += [f"| `{f}` | {v} | {n} | {tot} | {w} | {e} |" for f, v, n, tot, w, e in rows]
    (OUT / "README.md").write_text("\n".join(md) + "\n")
    print(f"Wrote {len(TESTS)} test invoices + README.md to {OUT}")


if __name__ == "__main__":
    main()
