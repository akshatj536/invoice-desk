# Redesign follow-ups

These are things the redesign would benefit from that need data, behaviour or backend changes. The redesign is presentation-only, so these were **logged, not built**. Each entry says what the UI does in the meantime.

| # | Item | Why it's not in v2 | What v2 does instead |
|---|---|---|---|
| 1 | **Backend copy mentions internals.** Some stage progress notes and summaries name the model, "the model", "local store" or "Google Sheet" (`extract.py:24`, `match.py:52`, `reconcile.py:37`, `validate.py:93`, `explain.py:58`, `act.py:21`, `ingest.py:34`). The line-pairing method string is `"description (model)"` | Changing backend strings is outside the frontend scope | Product mode shows UI-owned plain labels ("Reading invoice…", "Matching to PO…") and maps the method to "Item code" or "Description". Raw backend strings appear only in Dev mode |
| 2 | **Assignee / owner** on exceptions | There are no users or auth; the reviewer is stored as the literal "AP reviewer" | Columns are omitted. "Resolved by" shows the stored reviewer string |
| 3 | **Due date** in list tables | The due date is extracted but not stored on the run record (only `invoice_date` is), so it is only available from the run's event log | Invoice detail shows the due date from the extraction; lists don't have a due date column |
| 4 | **Server-side search, pagination and date filtering** | `GET /api/runs` returns the latest 200 runs with no query parameters | Search and the date filter run client-side over those 200 runs |
| 5 | **"Received" means upload time** | There is no email intake, so the run's `created_at` is the only timestamp | Labelled "Received" (upload time) |
| 6 | **Per-user settings** | No accounts | App mode toggles persist in `localStorage` on the device |
| 7 | **Vendor detail page** (history, spend, contacts) | No per-vendor endpoint or aggregates beyond what `/api/records` returns | The Vendors page is a table only; open POs are counted client-side from `/api/records` |
| 8 | **Dark theme** | Not requested; tokens are light only | Light theme only. The token names are semantic, so a dark theme can be added later |
| 9 | **Bulk approve/reject** on Exceptions | No bulk endpoint; holds are resolved one by one with a note | One-by-one resolution from invoice detail |
| 10 | **Keyboard navigation**: J/K for previous/next invoice in detail, ⌘K command menu, 1/2/3 to approve/reject/hold (seen in Linear and Ramp) | New interaction layer, out of scope for a presentation pass | Mouse-driven; detail pages link back to their list |
| 11 | **Document pane on the right** (Ramp moved to this in Jan 2026) and a resizable divider | The brief specifies PDF on the left at about 45% | PDF left, fixed split |
| 12 | **Approval chain / multi-approver** ("0 of 2" approvals) | One reviewer per hold; there is no approval-chain model | A single reviewer decision with a note |
| 13 | **Remove unused v1 frontend files** (`src/pages/{NewRun,Dashboard,RunView,Review,Records,HowItWorks}.tsx`, `src/components/{Layout,ui,StageDetails}.tsx`, `src/lib/{reasons,format}.ts`) | The brief requires approval before deleting files | They are no longer imported or rendered; they still compile and are kept for reference |
| 14 | **Backend stage summaries and check messages** contain v1 phrasing (e.g. "Possible payment fraud: …") | Backend is out of scope | The detail page shows UI-written evidence lines from structured evidence; raw messages appear in Dev mode and as a fallback |
| 15 | **KPI strip follows the active tab** (raised in review) | KPIs come from the global `stats` object | KPIs always describe all invoices |
| 16 | **Sticky table headers on narrow screens** | Below the `xl` breakpoint, tables scroll horizontally, which turns off sticky headers | Sticky on screens 1280px and wider |
| 17 | **PDF viewer in headless screenshots** | Chrome's built-in viewer renders black in headless capture | A real browser renders it; pdf.js would give consistent rendering if needed |
| 18 | **Reviewer identity** in the Exceptions Resolved tab | Only stored in the run's event log as "AP reviewer" | Shown on the invoice detail page; no "By" column in the list |

