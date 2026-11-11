# Frontend audit (v1, read-only)

Audited at `v1-pre-redesign` (`42e839d`). The scope is `frontend/`. The backend appears only where the UI depends on it.

## 1. Stack and styling approach
| | |
|---|---|
| Build | Vite 8, React 19, TypeScript 7 (`tsc -b && vite build`), served as static files by FastAPI from `frontend/dist` |
| Routing | `react-router-dom` 7 (`BrowserRouter`); FastAPI falls back to `index.html` for unknown paths, so client-side routes work on reload |
| Styling | Tailwind CSS 4 through `@tailwindcss/vite`. Tokens live in an `@theme` block in `src/index.css`. Components use Tailwind utility classes, plus a few custom classes in `@layer components` |
| Icons | `lucide-react` |
| Fonts | Google Fonts `<link>` in `index.html`: **Fraunces** (serif, for display), **Instrument Sans** (body), **JetBrains Mono** (figures, labels) |
| Data | `fetch` wrappers in `src/lib/api.ts`. Live runs use SSE (`EventSource`) in `src/hooks/useRunStream.ts`. Several pages poll every 2.5–5 s |
| State | Local component state only. There is no global store and no context |
| Dev deps added for the redesign | `playwright` (screenshots and regression only) |

## 2. Where colours, fonts and spacing are defined
- **`src/index.css` `@theme`** holds every colour token:
  - surfaces: `paper`, `paper-2`, `card`
  - text: `ink`, `ink-2`, `ink-3`
  - lines: `rule`, `rule-2`
  - brand: `accent`, `accent-soft`, `marker`, `chart`
  - decisions: `approve`/`hold`/`reject`, each with `-mark` and `-bg` variants
  - AI: `ai`, `ai-bg`
  - plus the font families (`--font-display` serif, `--font-sans`, `--font-mono`) and animations (`thump`, `rise`, `pulse-dot`)
- **`src/index.css` custom classes:**
  - `.sheet`: a card with a radius-14 border and a decorative shadow
  - `.ledger-rules`: ruled-paper lines
  - `.eyebrow`: mono, uppercase, letter-spaced
  - `.stamp`: a rotated rubber stamp with a noise mask
  - `.marker-wash`: a highlighter gradient
  - `.live-node`
  - a `body::before` paper-grain overlay
- **Raw hex values:** 23 in `index.css` (tokens plus SVG data URIs) and 1 in `Layout.tsx` (the logo SVG strokes).
- **Spacing:** ad hoc Tailwind utilities (`p-5`, `px-5 py-4`, `gap-6`, …). Arbitrary font sizes are everywhere (`text-[13.5px]`, `text-[10.5px]`, `text-[19px]`…), so there is no type scale.
- **Layout:** a centred `max-w-[1440px]` container with a sticky top bar.

### Banned-pattern counts (v1, per file)
| Pattern | Where |
|---|---|
| `font-display` (serif) | HowItWorks 8, RunView 5, StageDetails 5, NewRun 3, ui 3, Review 2, index.css 2, Layout 1 |
| `italic` | RunView 4, StageDetails 2, HowItWorks 1, NewRun 1, Review 1 |
| `uppercase` | RunView 7, StageDetails 7, Records 6, ui 5, Dashboard 3, NewRun 2, index.css 2, Layout/HowItWorks/Review 1 each |
| `tracking-*` | RunView 8, ui 7, Dashboard 5, StageDetails 5, Records 4, NewRun 2, Layout 2, HowItWorks/Review 1 each |
| `font-mono` | StageDetails 36, Records 21, RunView 16, Dashboard 15, Review 9, NewRun 7, ui 7, HowItWorks 4, Layout 3, index.css 3 |
| `.eyebrow` | StageDetails 7, RunView 6, Dashboard 5, ui 5, HowItWorks/NewRun 2 each, Records/Review/index.css 1 each |
| stamp | index.css 9, RunView 8, ui 5 |
| gradients | index.css 2 (`marker-wash`, `ledger-rules`) |
| dark fills (`bg-ink`) | Dashboard 4, StageDetails 3, Layout 2, NewRun 2, RunView 2, Records 1, ui 1 |
| `rounded-xl/2xl` | StageDetails 9, RunView 2, HowItWorks/NewRun/Review 1 each |
| shadow | index.css 3, Dashboard 1, NewRun 1 |
| hover lift (`hover:-translate`) | NewRun 1 |
| "01/02" numbering (`padStart`) | NewRun 1, RunView 1 |

## 3. Routes and components
| Route | Component | What it shows |
|---|---|---|
| `/` | `pages/NewRun.tsx` "Process" | Serif headline; drop zone; "What happens to every invoice" list numbered 01–06 with AI/rules/code tags; sample-scenario cards in 3 groups (Happy path / Edge cases we designed / Messy inputs from the brief) |
| `/runs` | `pages/Dashboard.tsx` "Runs" | Dark hero card with the auto-approval rate; 4 stat tiles; decision split bar (green/amber/red); "Why invoices were stopped" bar chart (blue); waiting list; filter pills; runs table with a "Took" column; Reset demo data button |
| `/runs/:id` | `pages/RunView.tsx` | Title and mono metadata line (run ID, kind); left: 8–9 step timeline with AI/RULES/CODE tags, ms timings, model-call counts; right: decision panel with a rubber stamp, coloured top bar, explanation and review box; stage detail card (`StageDetails.tsx`); "Full audit trail" |
| `/review` | `pages/Review.tsx` "Review queue" | Serif headline and paragraph; cards per held invoice with inline approve/reject; a "Resolved" section |
| `/records` | `pages/Records.tsx` "Records" | Tabs: Purchase orders (expandable rows, blue billed bar), Vendors, Invoice log; "Open Google Sheet"; Reset demo data |
| `/how` | `pages/HowItWorks.tsx` "How it works" | Serif headline; "model reads / rules decide / code writes" cards; eight steps with giant numerals; four edge cases; policy table; assumptions; reason-code catalogue |

### Shared components
- **`components/Layout.tsx`:** sticky top bar with a dark logo tile and the tagline "Brightline Workspace · AP". Dark-pill nav: Process, Runs, Review (with count), Records, How it works. On the right: **model name** and **store indicator**. Polls `/api/runs` every 4 s for the review count.
- **`components/ui.tsx`:** `Stamp`, `DecisionChip`, `OutcomeChip`, `CheckRow`, `StageTag` (AI/RULES/CODE/PERSON), `Card`, `KV`, `Btn`, `ConfidenceDot`, `Empty`, `PageTitle` (eyebrow, serif title, paragraph).
- **`components/StageDetails.tsx`:** one panel per stage:
  - `Ingest`, `Extract` (fields, line items and PDF iframe), `Validate` (arithmetic ledger, re-read)
  - `Match` (vendor, bank comparison, PO, PO search), `Reconcile` (pairing table, running-total meter)
  - `Decide` (ladder), `Review` (human review), `Act`, `Explain`
  - `LlmFootnote` (model name, latency, tokens)
- **`hooks/useRunStream.ts`:**
  - Replays a run's event log into per-stage state.
  - For live runs it opens SSE and paces how events are revealed: 120–520 ms gaps, presentation only.
  - `pullNew()` plays post-review events.
  - `orderFor(run)` inserts the Human review step.
- **`lib/reasons.ts`:** reason-code labels and descriptions, `DECISION_META` (stamp labels and colours), `STAGE_KIND` (tags), `STAGE_BLURB`.
- **`lib/format.ts`:** `money`, `moneyShort`, `secs`, `timeOfDay`, `ago`, `pct`, `cx`.
- **`lib/api.ts`:** types and fetch client.

## 4. Where pipeline internals are rendered
| Internal | Where |
|---|---|
| Model name | `Layout.tsx:57` (navbar); `StageDetails.tsx:36` (`LlmFootnote`, every model call); `HowItWorks.tsx:81` |
| Store indicator / Google Sheet | `Layout.tsx:60–61` (navbar); `Records.tsx` page eyebrow "System of record · local store"; `StageDetails` Ingest ("System of record loaded · local store") |
| AI / RULES / CODE / PERSON tags | `ui.tsx:82` `StageTag`, used by `RunView.tsx:57, 275` and `HowItWorks.tsx:49`; `NewRun.tsx` steps list |
| Sparkle / AI icons | `ui.tsx:89`, `RunView.tsx:72`, `StageDetails.tsx:35, 129, 219, 265, 330`, `HowItWorks.tsx:30` |
| Timings (ms / s) | `RunView.tsx:71, 158, 256`; `Dashboard.tsx:160` (avg), `:212` ("Took" column); `StageDetails.tsx:37` (model latency) |
| Model-call counts, tokens, thinking level | `RunView.tsx:72`; `StageDetails.tsx` `LlmFootnote` |
| Run IDs | `RunView.tsx:238` |
| Architecture narration | `NewRun.tsx` (headline and steps); `HowItWorks.tsx` (whole page); `StageDetails` ("The model is told to copy numbers exactly…", "PO search: the model proposes, code verifies", "Bounded re-read") |
| Confidence levels | `StageDetails` Extract (`ConfidenceDot`) |

**Backend-generated text that leaks internals.** The UI renders it verbatim, and it cannot be changed without touching the backend:
- **Stage progress notes:**
  - `extract.py:24` "Sending the … PDF to *gemini-3.8-flash*…"
  - `match.py:52` and `reconcile.py:37` "asking the model…"
  - `validate.py:93` "Asking the model to re-read…"
  - `explain.py:58` "Asking the model to explain…"
  - `act.py:21` "Writing to the Google Sheet…"
- **Ingest summary:** "loaded records from local store" (`ingest.py:34`).
- **Line-pairing method:** the string `"description (model)"` (`reconcile.py:51`), also used inside the reconcile check message.

**Redesign approach:** in Product mode the UI shows **plain stage labels it owns** ("Reading invoice…", "Matching to PO…") instead of backend progress notes, and maps the pairing method to "Matched by item code" or "Matched by description". The raw strings stay visible in Dev mode. The backend copy itself is unchanged, and this is logged in FOLLOWUPS.

## 5. Hard-coded copy
There are 352 user-facing string literals across 13 files. The full list is in the appendix, generated by `frontend/scripts/extract-copy.mjs`.

The worst offenders against the new copy rules:
- **Taglines and headlines:** "Drop an invoice. / Watch every check happen." · "The model reads. / Code decides. Code writes." · "Runs" · "Review queue"
- **Eyebrows:** "Accounts payable · invoice processing" · "Dashboard · history, status and outputs" · "Human in the loop" · "System of record · …" · "Design notes" · "Process · 8 steps" · "Step 3 of 8"
- **Narrating paragraphs:** under every page title
- **Cute copy:** "Happy path" · "sail through" · "Edge cases we designed" · "Messy inputs from the brief" · "Worst result wins" · "Nothing waiting" · "Your call" · "Every held invoice has been resolved." · "On hold for a person" · "Why invoices were stopped"
- **Stamp copy:** "Approved / On hold / Rejected / AP · Invoice Desk"
- **Reason labels to rename** (`lib/reasons.ts`):
  - "Over the PO total" → "Exceeds PO amount"
  - "Price above PO" → "Price variance"
  - "More than ordered" → "Quantity exceeds PO"
  - "Already paid" → "Duplicate, already paid"
  - "PO already closed" → "PO closed"
  - "PO suggested, not printed" → "PO not on invoice"
  - "Bank details changed" → "Bank details mismatch"
  - "Vendor's maths is wrong" → "Invoice total mismatch"

## 6. Boundary between UI and business logic
**All business logic lives in the backend.** The frontend never decides, validates, matches or writes. It only calls these endpoints:

| Endpoint | Used by | Notes |
|---|---|---|
| `GET /api/config` | Layout, HowItWorks | model, store, store_backend, sheet_url, policy, stage list |
| `GET /api/samples` · `GET /api/samples/{file}/pdf` | NewRun | demo scenarios (`data/invoices/manifest.json`) |
| `POST /api/runs` (multipart) · `POST /api/runs/sample` | NewRun | start a run; returns `{id}` |
| `GET /api/runs` | Dashboard, Review, Layout | runs list and `stats` (counts, rates, value, reasons) |
| `GET /api/runs/{id}` | RunView (via hook) | run, events and `act_preview` |
| `GET /api/runs/{id}/stream` (SSE) | RunView (via hook) | live events until `run_completed` |
| `GET /api/runs/{id}/pdf` | RunView | invoice PDF (iframe) |
| `POST /api/runs/{id}/review` `{action, note}` | RunView, Review | approve or reject a hold; the backend writes the records and appends review events |
| `GET /api/records` | Records | vendors (bank masked server-side), POs and lines, invoice log, sheet URLs |
| `POST /api/reset` | Dashboard, Records | restore seed data and clear run history |

Logic that exists in the frontend is **presentation-only derivation** over that data, and the redesign may change it freely:
- **Stage state:** `useRunStream.apply` folds events into stage state.
- **Stage tone:** `RunView.stageTone` derives pass/warn/fail from checks.
- **Filters:** Dashboard `FILTERS` work on decision and review status.
- **Display helpers:** the PO billed ratio for the meter, reason labels, and `orderFor`, which adds the Human review step.

Nothing in the frontend computes an outcome, a tolerance or a write. The redesign therefore cannot change decisions, as long as it keeps calling the same endpoints with the same payloads. `frontend/scripts/regress.mjs` verifies that independently of the UI.

---

## Appendix: hard-coded UI strings (v1)
Generated by `node frontend/scripts/extract-copy.mjs src`. It includes JSX text, text props and sentence-like literals. Strings that come from the backend (check messages, stage summaries, explanations) are not listed here.


### frontend/src/components/Layout.tsx (2)
- Invoice Desk
- Brightline Workspace · AP

### frontend/src/components/StageDetails.tsx (137)
- Scanned image - no text layer
- Digital - has a text layer
- none printed
- Subtotal (as printed)
- Total due
- The model noticed:
- exactly as printed
- Line items add up to
- Subtotal printed
- + Tax printed
- = Expected total
- Total printed
- Bounded re-read
- The first reading didn't add up, so the model was asked to read the invoice again with full reasoning - told the exact discrepancy, and told
- to make the numbers agree if the document itself is wrong.
- First reading
- Second reading
- Adds up - the first reading was a misread.
- Not found in the vendor file.
- On invoice
- On file
- PO search: the model proposes, code verifies
- 1 · Code narrowed to
- this vendor's open POs
- 2 · Model suggested
- 3 · Code checked
- Invoice line
- Matched by
- PO line
- Qty billed / left
- Unit price vs PO
- not on PO
- Quantity is checked against what is
- on each PO line, so split invoices work; price tolerance is separate.
- &gt;
- The rules decided
- . A person then
- it - see the
- Human review
- step. The rules' decision is kept unchanged for the audit trail.
- , so a person must approve or reject it - that is the next step.
- No check failed, so the invoice is approved. No model was involved in this step.
- Waiting for a person
- Your call
- There is no confirmed PO match to record, so this invoice can only be rejected.
- No note was left.
- Open Google Sheet
- Already recorded for this run - nothing was written twice.
- Nothing was written.
- Only an approval updates the spreadsheet. This invoice is waiting in the
- review queue
- The system's original note (before review)
- The process fails closed: the invoice is held for a person instead of guessing.
- The file
- Fields read from the document
- Invoice PDF
- The arithmetic
- Bank details - invoice vs vendor file
- Running total on this PO (all invoices, not just this one)
- Invoice lines vs PO lines
- The rule - worst result wins
- What decided it
- If you approve, exactly this is written - nothing else
- Invoice_Log · new row
- PO_Lines · quantities billed
- Checks in this step (${checks.length})
- divide-y divide-rule
- ${d.size_kb} KB
- Fingerprint (SHA-256)
- System of record loaded · ${d.source ?? ''}
- Purchase orders
- PO lines
- Previously approved invoices
- ).slice(-4)}` : 
- grid gap-6 xl:grid-cols-[1fr_minmax(320px,0.9fr)]
- Document type
- Invoice number
- Invoice date
- PO reference
- Remit-to account
- Line items (${x.line_items.length})
- Both readings agree on the printed figures → the error is on the invoice itself.
- Corrected reading used from here on.
- Name on invoice
- Vendor file
- exact name
- known alternate name
- similar name
- tax ID (name differs)
- Approved for payment
- } tone={d.vendor.approved ? 
-  - it was a misread.
-  - still different, so it is not a misread.
- Purchase order - suggested, not printed
- Purchase order
- no open POs
- ${Math.max(0, (v / max) * 100)}%
- Already billed ${money(rt.already_invoiced)}
- calc(${w(rt.already_invoiced)} + 2px)
- calc(${w(rt.this_invoice)} - 2px)
- This invoice ${money(rt.this_invoice)}
- absolute -top-5 h-[calc(100%+20px)] border-l-2 border-ink
-  · over by ${money(rt.new_total - rt.po_total)}
-  · ${money(rt.remaining_after)} left after this
- no code
- item code
- meaning · ${p.confidence}
- any check that must never be paid
- every check passed
- a failed check
- new row · ${actPreview.invoice_number} · ${money(actPreview.total)}
- POs · ${actPreview.po_number}
- +${money(actPreview.amount_add)} billed
- PO_Lines · quantity billed
- line ${ln} +${q}
- Approved by a person
- Rejected by a person
- Rules decided
- Final decision
- It was held for
- The next steps re-ran with this decision: Update records shows exactly what was written, Explain shows the final outcome.
- The next steps re-ran with this decision: nothing was written, and Explain shows the final outcome.
- Written to the records after ${d.reviewer} approved
- Written to the records
-  · “${d.note}”
- POs · ${ch.po?.po_number}
- Amount billed
- Over PO total by
- #${l.line_no} ${l.description}
- ${l.qty_invoiced} / ${l.qty_ordered}
-  - if a reviewer approves it, this step re-runs and records exactly what the run computed.
- . It has no confirmed PO match, so a reviewer can only reject it.
- Rejected invoices are never recorded against a PO.
- Updated after the reviewer's decision - written from the decision itself, no model needed.
- Written from a template (model unavailable).
- Written by the model from the rules' findings. It narrates the decision; it cannot change it.
- Waiting for earlier steps.

### frontend/src/components/ui.tsx (6)
- AP · Invoice Desk
- , rot = -7 }: { decision: Decision; size?: 
- stamp animate-thump
- text-[13px] leading-none !px-3 !py-1.5
- Decision: ${m.stamp}
- Read with ${level} confidence

### frontend/src/hooks/useRunStream.ts (3)
- , e: RunEvent): Record
- Read invoice
- Human review

### frontend/src/lib/api.ts (2)
- (url: string, init?: RequestInit): Promise
- ${r.status} ${r.statusText}

### frontend/src/lib/format.ts (8)
- , { style: 
- $${(x / 1_000_000).toFixed(1)}M
- $${(x / 1000).toFixed(1)}k
- ${(ms / 1000).toFixed(1)} s
- ${Math.floor(s)}s ago
- ${Math.floor(s / 60)}m ago
- ${Math.floor(s / 3600)}h ago
- ${(x * 100).toFixed(digits)}%

### frontend/src/lib/reasons.ts (44)
- Bank details changed
- Vendor's maths is wrong
- , what: "The invoice
- Possible duplicate
- Already paid
- This exact invoice was already processed.
- More than ordered
- Bills more units than are left on the PO line.
- Over the PO total
- Price above PO
- PO suggested, not printed
- PO belongs to another vendor
- s PO - likely a typo.
- No matching PO
- , what: "Couldn
- PO already closed
- Different currency
- Charge not on PO
- Line match uncertain
- Vendor not approved
- Vendor is not on the approved list (or onboarding is incomplete).
- Not an invoice
- A proforma, statement, quote, receipt or credit note - not a payable bill.
- Missing information
- Hard to read
- Unreadable file
- System problem
- Approved and recorded
- On hold
- On hold for a person
- AI reads
- Rules + AI assist
- Rules only
- Code writes
- AI explains
- Open the PDF, fingerprint it, detect digital vs scanned, load the records.
- The model reads every field from the PDF - the same path for digital and scanned.
- Is it an invoice? Are the required fields there? Do the numbers add up?
- Which vendor, can we pay them, are the bank details theirs, which PO is it?
- Lines vs PO, quantity left, price tolerance, running total, duplicates.
- Worst result wins: any REJECT beats any HOLD beats APPROVE.
- A person resolves the hold. Approving records exactly what the run computed; the pipeline updates to show it.
- Only an approval writes to the spreadsheet.
- A plain-English note for the AP clerk - it cannot change the decision.

### frontend/src/pages/Dashboard.tsx (28)
- Decisions the rules made
- Waiting for a person
- Review queue →
- Nothing waiting.
- Why invoices were stopped
- Reasons across held and rejected invoices
- Nothing stopped yet.
- Reset demo data
- Auto-approval rate
- Process an invoice
- reading…
- All checks passed
- Needs review
- Value approved
- No runs here yet
- Resolved by a person
- On hold
- sheet p-5
- ${(g.n / total) * 100}%
- ${(n / max) * 100}%
- Reset demo data? This restores the seed POs, vendors and invoice log, and clears run history.
- Dashboard · history, status and outputs
- ${s.running} running now
- avg ${secs(s.avg_duration_ms)} each
- ${moneyShort(s.value_held)} on hold
- never recorded
- incl. ${s.approved_on_review} approved on review
- recorded to invoice log

### frontend/src/pages/HowItWorks.tsx (42)
- The model reads.
- Code decides. Code writes.
- Eight steps
- The four edge cases we designed
- • Two-way match (PO ↔ invoice). Received quantities are stored for a future three-way match.
- • One invoice covers one PO; one invoice per PDF.
- • PO amounts are pre-tax; the invoice subtotal is matched, tax is checked arithmetically.
- • Invoices arrive by upload; an email inbox is a drop-in later.
- • Under-billing is normal (partial delivery); only over-billing is a risk.
- Every reason the rules can give
- Adding an edge case = adding one check with its own severity. The decision rule never changes.
- A perfect invoice with new bank details
- Is the money going to the right place?
- Everything matches the PO, but the remit-to account differs from the vendor file. The happy path would pay a fraudster. Held, with instructions to verify on the
- The vendor's own maths is wrong
- Are the numbers on the invoice right?
- Lines add to $3,840, subtotal says $3,940. One careful re-read tells a model misread from a real vendor error before holding.
- Same bill, new number
- Have we already paid this?
- INV-2041 re-sent as INV-2041-R. Exact-number checks miss it; matching vendor + amount + lines + date window catches it.
- Split invoices that add up to more than the order
- Are we paying more than we agreed?
- Each bill is fine alone; together they exceed the PO. Quantity is checked against what is left, and tolerance applies once per PO, not per invoice.
- Design notes
- The model reads
- Turns any PDF - digital or scanned, any layout - into fixed fields with a confidence level. Pairs line items whose wording differs. Suggests a PO when none is p
- Rules decide
- Every check returns pass / note / fail with evidence. Worst result wins. Same invoice, same decision, every time - and anything unexpected becomes a hold, never
- Code writes
- s billed amount and line quantities. Writes are keyed to the run, so a retry never double-books.
- sheet p-5
- Unit price tolerance
- up to +${(p.price_tolerance_pct * 100).toFixed(0)}% over PO price
- Running total tolerance
- all invoices on a PO ≤ PO total + ${(p.running_total_tolerance_pct * 100).toFixed(0)}%
- Rounding allowance
- ${money(p.rounding_tolerance)} on any sum
- Duplicate window
- ${p.near_duplicate_window_days} days, same vendor + amount + lines
- ${p.base_currency} only; others are held
- , cfg?.model ?? 
- System of record

### frontend/src/pages/NewRun.tsx (22)
- Drop an invoice.
- Watch every check happen.
- the PDF. Rules
- Drop a vendor invoice PDF
- Digital or scanned. Or
- for a file.
- PDF · up to 15 MB · nothing is written unless it is approved
- What happens to every invoice
- Preview PDF
- , blurb: "Invoices that look fine to a tired human on a Friday - each one is a way to pay money you don
- Accounts payable · invoice processing
- ledger-rules pointer-events-none absolute inset-0 opacity-40
- underline underline-offset-2
- sheet p-6 animate-rise [animation-delay:80ms]
- Gemini reads every field - vendor, PO, lines, totals, bank details.
- Is it really an invoice? Do its own numbers add up?
- Approved vendor? Bank details on file? Which purchase order?
- Quantity left, price tolerance, running total, already paid?
- Worst result wins: Reject > Hold > Approve.
- Approvals update the PO and invoice log. Holds go to a person.
- mr-1 inline
- -mr-0.5 transition group-hover:translate-x-0.5

### frontend/src/pages/Records.tsx (12)
- Open Google Sheet
- Reset demo data
- Billed so far
- Unit price
- Legal name
- Also known as
- Bank on file
- Phone on file
- Invoice date
- ${Math.min(100, r * 100)}%
- Reset demo data? This restores the seed POs, vendors and invoice log, and clears run history.
- System of record · ${d?.source ?? ''}

### frontend/src/pages/Review.tsx (12)
- See every check
- No confirmed PO match - this one can only be rejected.
- Every held invoice has been resolved.
- Note for the audit trail
- Review queue
- Nothing waiting
-  (suggested)
- Records exactly what the run computed
- No confirmed PO / line match to record
- Human in the loop
- ><Empty icon={<Inbox size={30} />} title=
- sheet divide-y divide-rule

### frontend/src/pages/RunView.tsx (34)
- updated after review
- Waiting for a person - approve or reject above
- Your call
- No confirmed PO match - can only be rejected.
- Processing ·
- Updating the pipeline with your decision…
- Why the rules held it
- Loading run…
- All runs
- awaiting review
- Follow live step
- ← prev
- next →
- Note for the audit trail, e.g. “Called vendor on file number - bank change confirmed”
- )) return 
- absolute left-[13px] top-9 h-[calc(100%-26px)] w-[2px]
- Records exactly what the run computed
- No confirmed PO / line match to record
- ledger-rules pointer-events-none absolute inset-0 opacity-30
- Opening the file
- Approved after review
- Rejected after review
- ${fails.length} issue${fails.length > 1 ? 's' : ''}
- all checks passed
-  (no note)
-  · recorded in the invoice log and against the PO.
-  · nothing recorded.
- absolute -bottom-11 -left-6 opacity-70
- mr-1 inline
-  (suggested)
- lg:sticky lg:top-20 lg:self-start
- sheet p-3
- sheet group
- eyebrow pt-2
