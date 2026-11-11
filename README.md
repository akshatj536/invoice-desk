# Invoice Desk: invoice PDF → PO match → explained decision

Zamp AI Solutions Analyst case study, **PS-1 (Finance / AP)**.

A vendor invoice PDF (digital or scanned) goes in. The process reads it, matches it to a purchase order in a Google Sheet, and decides **APPROVE**, **HOLD** or **REJECT** with the reasons shown. An approval writes to the sheet. A hold goes to a review queue where a person approves or rejects it, and their note is kept for audit. Every stage is visible live in the UI as it runs.

## The core design choice

> **The model reads. Code decides. Code writes.**

AP decisions have to be repeatable and explainable, so the model (Gemini) is used only where the language is messy:

| Where | Who | Why |
|---|---|---|
| Read the PDF into fixed fields (any layout, digital or scanned) | **Model** | Layouts vary endlessly |
| Pair invoice lines with PO lines when the wording differs | **Model**, after an item-code match in code | "Widget-A 10PK" = "Widget A, pack of 10" |
| Suggest a PO when none is printed | **Model** proposes, **code** verifies the pick is a real open PO | |
| Arithmetic, tolerances, quantities, duplicates, bank details | **Code** | Exact, the same every run |
| APPROVE / HOLD / REJECT | **Code**: worst result wins | Explainable, auditable |
| Write to the spreadsheet | **Code**, approvals only, at most once per run | The model never has write access |
| Plain-English explanation | **Model**, narrating findings | It cannot change the decision |

Anything unexpected, such as a crashed step, a model timeout or an unreadable PDF, ends as **HOLD**, never APPROVE.

## The pipeline (8 stages)

1. **Ingest:** fingerprint the file (SHA-256), detect digital vs scanned, load the records.
2. **Read (model):** fixed fields plus a confidence level per field. Numbers are copied exactly as printed and never corrected.
3. **Validate:**
   - Is it an invoice?
   - Are the required fields present?
   - Does it add up (±$0.05 rounding)? If not, one **targeted re-read** with full reasoning tells a model misread apart from a vendor error.
4. **Match:** vendor (names normalised, then aliases, then **tax ID** when the printed name differs), approved status, **bank details against the vendor file**, PO lookup or suggestion.
   - If the bank details differ by only a digit or two, they are re-read once. The model is not told the value on file, so it can't echo it back.
5. **Reconcile:**
   - Line pairing.
   - **Quantity against what's left** on each PO line.
   - **Unit price** within +1%.
   - **Running total** across all invoices on the PO within +1%.
   - Duplicates (exact match, and near match on vendor + amount + lines + date).
6. **Decide:** any REJECT beats any HOLD, which beats APPROVE. Each check carries its own severity, so adding an edge case means adding a check.
7. **Act:** on APPROVE, add an invoice-log row and update the PO's billed amount, its line quantities and its open/closed status.
8. **Explain:** 2–3 sentences and a next action for the AP clerk.

## Edge cases

The four we designed are all ways to pay money you don't owe:

| # | Case | Question it answers | Outcome |
|---|---|---|---|
| 02 | A perfect invoice with **new bank details** | Is the money going to the right place? | HOLD: verify by phone on the number on file |
| 03 | The **vendor's own maths is wrong** ($3,840 of lines, $3,940 subtotal) | Are the invoice's numbers right? | HOLD after a confirming re-read |
| 04 | **Same bill, new number** (INV-2041 → INV-2041-R) | Have we already paid this? | HOLD: possible duplicate |
| 05a/b | **Split invoices that add up to more than the order** | Are we paying more than we agreed? | 05a APPROVE, then 05b HOLD (quantity and running total) |

From the brief: 06 scanned PDF (APPROVE), 07 no PO number (HOLD with a suggested PO), 08 price above tolerance (HOLD), 09 unapproved vendor (REJECT), 10 proforma, i.e. not an invoice (REJECT).

**Split invoices vs tolerance:** these check different numbers, so they never conflict. Quantity is compared with what's *left* on the PO, so partial billing is normal. Price tolerance is per unit. The running-total tolerance applies **once per PO**, so splitting an order into many invoices can't stack tolerances.

## Run it locally

```bash
# backend (Python 3.12, uv)
cd backend && uv sync
cp ../.env.example ../.env            # set GEMINI_API_KEY (+ Google Sheet vars, below)
uv run uvicorn app.main:app --port 8765

# frontend (dev server with proxy to :8765)
cd frontend && npm install && npm run dev        # http://localhost:5173
# or build once and let FastAPI serve it:  npm run build  →  http://localhost:8765
```

Without Google credentials, the app falls back to a local JSON store with identical rules.

### Google Sheet (system of record)
1. In Google Cloud, create a project, enable the **Google Sheets API**, and create a **service account**. Download its JSON key to `secrets/service-account.json` (this path is gitignored).
2. Create an empty Google Sheet and **share it with the service account's email** as Editor.
3. In `.env`, set `GOOGLE_SHEET_ID=<the id in the sheet URL>`.
4. Run `cd backend && uv run python -m app.cli reset`. This creates the 4 tabs (Vendors, POs, PO_Lines, Invoice_Log) and loads the seed data. Use it again any time to reset the demo.

## Verify

```bash
cd backend
uv run pytest -q                              # 22 rule tests, no model calls
uv run python ../scripts/rehearse.py          # every demo invoice through the real pipeline, checked against expected outcomes
uv run python ../scripts/rehearse.py --times 3   # stability check before a demo
uv run python -m app.cli run ../data/invoices/01_happy_path.pdf
```

`scripts/make_invoices.py` regenerates the 11 demo PDFs: 3 vendor layouts and 1 scanned. `scripts/make_test_invoices.py` builds a second, harder set in `data/test_invoices/` for hands-on testing. It covers low-quality scans, a phone photo, vendor-name variants and reworded items; expected outcomes are in its README. `scripts/compare_models.py` benchmarks Gemini models on extraction accuracy and speed.

## Deploy

The app is a single Docker image (`Dockerfile`): the React build is served by FastAPI. Set these environment variables:
- `GEMINI_API_KEY`
- `GOOGLE_SHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON`: the key file's contents
- `VAR_DIR=/data` on a persistent volume, for run history

## Assumptions and limits
- USD only, with sales tax. PO amounts are pre-tax; the invoice subtotal is what gets matched.
- 2-way match (PO + invoice). `qty_received` is stored, ready for a 3-way match.
- One invoice covers one PO, and there is one invoice per PDF.
- Invoices arrive by upload. An email inbox is a natural next input.
- Only approved invoices go into the invoice log, so duplicate detection compares against paid or approved bills.
- Open-ended model self-correction loops are deliberately out of scope. The only loop is the bounded arithmetic re-read.
