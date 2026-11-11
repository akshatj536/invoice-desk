# V1 snapshot (before the redesign)

| | |
|---|---|
| Tag | `v1-pre-redesign` (annotated; never move or delete) |
| Commit | `42e839d03d7aa45f27fcf78c0cd09230e8e22c2e` ("checkpoint: working v1 before redesign") |
| Archive branch | `archive/v1-original` |
| Redesign branch | `redesign/v2` (all redesign work happens here; nothing merges into `main` without review) |
| Remote | none configured at snapshot time, so the tag and branch were **not pushed** |
| Snapshot date | 2026-11-11 |

## What v1 is
- FastAPI backend: Gemini extraction, rule-based validate / match / reconcile / decide, and a review queue.
- React (Vite + Tailwind 4) frontend with an "editorial ledger" look: serif headings, cream background and rubber-stamp decisions.
- Model: `gemini-3.8-flash`.
- Store: local JSON. The Google Sheet was not configured at snapshot time.

## Run v1
```bash
git checkout v1-pre-redesign            # detached HEAD; or: git checkout archive/v1-original
cp <your .env> .env                     # GEMINI_API_KEY=... (the zip below does NOT contain .env)
cd backend && uv sync && uv run uvicorn app.main:app --port 8765
cd frontend && npm install && npm run build     # FastAPI serves frontend/dist at http://localhost:8765
```

## Data backup
The local data store is gitignored, so it was copied explicitly to `backups/v1-data/`, which is also gitignored:

| File | What it is | Live location |
|---|---|---|
| `local_store.json` | Vendors, POs, PO lines and invoice log (the "local store", standing in for the Google Sheet) | `backend/var/local_store.json` |
| `runs.sqlite3` | Run history and the stage-event audit trail (copied with SQLite's backup API, so it is consistent) | `backend/var/runs.sqlite3` |
| `uploads/` | Every PDF processed (36 files) | `backend/var/uploads/` |
| `seed/` | Seed data used by "Reset demo data" (this is also tracked in git under `data/seed/`) | `data/seed/` |

At snapshot time, the live data had 2 runs, created after a demo reset earlier that day.

Full project archive: `../invoice-desk-v1-backup-2026-11-11.zip` (2.0 MB, 444 files).
- **Includes:** the source code, `.git` history and `backups/`.
- **Excludes:** `node_modules`, `frontend/dist`, `.venv`, caches, `.env` and `secrets/`. Secrets are deliberately left out of the archive.

## Restore
```bash
git checkout v1-pre-redesign                                  # code
cp backups/v1-data/local_store.json backups/v1-data/runs.sqlite3 backend/var/
cp -r backups/v1-data/uploads backend/var/                    # data (stop the server first)
```
Or unzip the archive somewhere else and add a `.env`.

## Baseline results (v1)
- **Backend tests:** `uv run pytest -q` gives **26 passed**.
- **Frontend:** `npm run build` (`tsc -b && vite build`) passes.
- **Regression check:** `docs/redesign/baseline-decisions.json` records all 11 demo scenarios. They were run in order on a freshly reset sandbox (port 8790, separate data folder) with `frontend/scripts/regress.mjs`. Every decision and reason code matched the scenario's expected outcome.

| Scenario | Decision | Reason codes |
|---|---|---|
| 01_happy_path | APPROVE | - |
| 02_bank_details_changed | HOLD | BANK_DETAILS_MISMATCH |
| 03_vendor_math_error | HOLD | VENDOR_MATH_ERROR |
| 04_duplicate_resubmitted | HOLD | DUPLICATE_SUSPECTED |
| 05a_split_part1 | APPROVE | - |
| 05b_split_part2 | HOLD | QTY_EXCEEDS_REMAINING, RUNNING_TOTAL_EXCEEDS_PO |
| 06_scanned | APPROVE | - |
| 07_no_po_number | HOLD | PO_INFERRED |
| 08_price_over_tolerance | HOLD | PRICE_OVER_TOLERANCE, RUNNING_TOTAL_EXCEEDS_PO |
| 09_unapproved_vendor | REJECT | VENDOR_NOT_APPROVED |
| 10_proforma | REJECT | DOC_NOT_INVOICE |

**Before screenshots** are in `docs/redesign/before/` (1440px wide, full page):
- Pages: process, runs, runs-empty, review, review-empty, records-pos, records-vendors, records-invoice-log, how-it-works
- Invoice details: detail-approved (01), detail-held (02, awaiting review), detail-rejected (09)
