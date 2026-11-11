"""Compare Gemini models on extraction accuracy + latency against the generated invoices.

Run:  cd backend && uv run python ../scripts/compare_models.py gemini-3.8-flash gemini-3.5-flash ...
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "scripts"))

from app import llm, prompts  # noqa: E402
from app.models import InvoiceExtraction  # noqa: E402
from make_invoices import INVOICES, amounts  # noqa: E402

FILES = ["01_happy_path.pdf", "03_vendor_math_error.pdf", "06_scanned.pdf", "07_no_po_number.pdf",
         "02_bank_details_changed.pdf", "10_proforma.pdf"]


def truth(spec: dict) -> dict:
    subtotal, tax, total = amounts(spec)
    bank = spec.get("bank")
    return {
        "doc_type": "proforma" if spec.get("title") == "PROFORMA INVOICE" else "invoice",
        "invoice_number": spec["number"], "invoice_date": spec["date"], "po_reference": spec.get("po"),
        "subtotal": subtotal, "tax_amount": tax, "total": total, "n_lines": len(spec["lines"]),
        "qtys": [l[2] for l in spec["lines"]], "prices": [l[3] for l in spec["lines"]],
        "bank_account": bank["account"] if bank else None,
    }


def score(x: InvoiceExtraction, t: dict) -> tuple[int, int, list[str]]:
    misses, n = [], 0
    def chk(name, ok):
        nonlocal n
        n += 1
        if not ok:
            misses.append(name)
    chk("doc_type", x.doc_type == t["doc_type"])
    chk("invoice_number", (x.invoice_number or "") == t["invoice_number"])
    chk("invoice_date", x.invoice_date == t["invoice_date"])
    chk("po_reference", (x.po_reference or None) == t["po_reference"])
    chk("subtotal", x.subtotal is not None and abs(x.subtotal - t["subtotal"]) < 0.01)
    chk("tax", x.tax_amount is not None and abs(x.tax_amount - t["tax_amount"]) < 0.01)
    chk("total", x.total is not None and abs(x.total - t["total"]) < 0.01)
    chk("n_lines", len(x.line_items) == t["n_lines"])
    chk("qtys", [l.quantity for l in x.line_items] == t["qtys"])
    chk("prices", [l.unit_price for l in x.line_items] == t["prices"])
    if t["bank_account"]:
        chk("bank_account", (x.bank_account_number or "") == t["bank_account"])
    return n - len(misses), n, misses


def main(models: list[str]) -> None:
    specs = {s["file"]: s for s in INVOICES}
    for model in models:
        ok_total = n_total = 0
        lat = []
        print(f"\n=== {model} ===")
        for f in FILES:
            pdf = (ROOT / "data" / "invoices" / f).read_bytes()
            t0 = time.perf_counter()
            try:
                r = llm.generate(purpose="extract", model=model, schema=InvoiceExtraction,
                                 system=prompts.EXTRACT_SYSTEM, contents=[llm.pdf_part(pdf), prompts.EXTRACT_USER])
            except Exception as e:
                print(f"  {f:<30} ERROR {e}"[:200]); continue
            lat.append(time.perf_counter() - t0)
            ok, n, misses = score(r.value, truth(specs[f]))
            ok_total += ok; n_total += n
            print(f"  {f:<30} {ok}/{n}  {lat[-1]:5.1f}s  {'misses: ' + ', '.join(misses) if misses else ''}")
        if lat:
            print(f"  -> accuracy {ok_total}/{n_total}  avg latency {sum(lat) / len(lat):.1f}s")


if __name__ == "__main__":
    main(sys.argv[1:] or ["gemini-3.8-flash"])
