# Invoice Desk design system (v2)

This is the binding spec for every UI change. Values come from the brief and were refined against `docs/redesign/REFERENCES.md` (Linear, Ramp, and Mercury/Bill.com/Brex; Stripe was not covered).
The tokens are implemented in `frontend/src/styles/tokens.css`. Components use the utilities those tokens generate, never raw values.
**Before finishing any UI change, check the Banned list (section 8) and run the checklist (section 9).**

---

## 1. Principles
1. **It's a work tool, not a pitch.** An AP clerk opens it to clear invoices. Every pixel serves scanning, comparing and deciding, and nothing explains how the product works.
2. **Density with calm.** Use 13–14px text, 40px rows and tight spacing, and let whitespace and hairline borders separate content, not boxes and colour.
3. **Numbers are the content.** Amounts are tabular, right-aligned and formatted the same way everywhere. Evidence is stated in numbers ("Invoice total $11,286.00 exceeds remaining PO balance $0.00"), not adjectives.
4. **Colour means status.** Neutral grays carry the layout. One blue accent marks what you can act on. Green, amber and red appear only to state an outcome or a problem, always with a text label.
5. **One clear next action.** Each view has at most one primary button. Exceptions put the reason first and the action right beside it.
6. **The document is the source of truth.** Wherever extracted data is shown, the original invoice sits next to it.
7. **Internals stay out of the product.** Model names, pipeline tags, timings and run IDs exist only in Dev mode.
8. **Plain words.** Use AP vocabulary in sentence case. Say what happened and what to do, nothing more.

## 2. Tokens
Use the token utility. If something seems to need a raw value, add a token here and in `tokens.css` first.

### Typography
One family everywhere: **Inter** (`font-ui`), falling back to the system UI stack. No serif. No italics in headings. Monospace (`font-code`) is allowed **only inside Dev mode panels**.

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `text-title` | 20 / 28 | 600 | Page title (one per page) |
| `text-section` | 15 / 22 | 600 | Section and panel titles |
| `text-body` | 14 / 20 | 400 (500 for emphasis) | Base UI text, buttons, inputs, nav |
| `text-table` | 13 / 18 | 400 | Table cells, metadata lines, secondary text |
| `text-caption` | 12 / 16 | 500 | Table headers, badges, helper text, KPI labels |
| `text-figure` | 22 / 28 | 600 | KPI strip values |

- **Numbers:** always `tabular-nums` (utility `tabular-nums`). In tables, right-align them.
- **Case:** sentence case everywhere: titles, buttons, tabs, table headers, badges. No `uppercase`, no letter-spacing utilities.
- **Weights:** 400, 500 and 600 only.

### Colour
| Token | Value | Use |
|---|---|---|
| `canvas` | #F7F8FA | App background behind content |
| `surface` | #FFFFFF | Panels, tables, sidebar, header |
| `subtle` | #F9FAFB | Table header band, quiet fills |
| `hover` | #F3F4F6 | Row hover, selected nav background |
| `line` | #E5E7EB | All 1px borders and dividers |
| `line-strong` | #D1D5DB | Input and secondary-button borders |
| `fg` | #111827 | Primary text |
| `fg-muted` | #4B5563 | Secondary text |
| `fg-subtle` | #6B7280 | Table headers, metadata, placeholders |
| `fg-disabled` | #9CA3AF | Disabled text |
| `brand` / `brand-hover` / `brand-soft` | #2D5BD1 / #2449AD / #EEF2FC | **Only** for primary buttons, links, focus rings and selected nav text |
| `success-fg` / `success-bg` | #15803D / #F0FDF4 | Approved, matched |
| `warning-fg` / `warning-bg` | #B45309 / #FFFBEB | On hold, needs attention |
| `danger-fg` / `danger-bg` | #B91C1C / #FEF2F2 | Rejected, mismatch, overrun |
| `neutral-fg` / `neutral-bg` | #374151 / #F3F4F6 | Posted, processing, resolved, info |
| `data` / `data-track` / `data-alert` | #9CA3AF / #EEF0F3 / #DC2626 | Charts and meters: one neutral colour, with red only to flag a problem |

- No other colours. Don't use Tailwind palette classes (`bg-gray-100`, `text-blue-600`…) in components; use the semantic tokens.
- No gradients. No tinted panel backgrounds except the status backgrounds above, and only on badges and issue rows.

### Spacing, shape and elevation
- **4px grid**, using Tailwind's default spacing scale (`1` = 4px). Common gaps are 8, 12, 16 and 24.
- **Radius:** `rounded-badge` (4px) for badges and chips. `rounded-control` (6px) for buttons, inputs and menus. `rounded-panel` (8px) for panels and tables. Nothing rounder; no pills.
- **Borders, not shadows:** every panel and table is `border border-line` with no shadow. `shadow-popover` is reserved for popovers, dropdowns, modals and toasts.
- **Layout constants:**

| Constant | Value | Use |
|---|---|---|
| `--sidebar-width` | 232px | Sidebar |
| `--header-height` | 56px | Page header |
| `--row-height` | 40px | Table rows |
| `--control-height` | 32px | Buttons, inputs, tabs |
| `--page-gutter` | 28px | Content padding |

## 3. Layout
- **App shell:** a fixed left sidebar (`--sidebar-width`, `surface`, right border `line`). The content area fills the rest of the width on `canvas`. There is **no centred max-width container**. Content padding is `--page-gutter` on the sides and 24px at the top.
- **Sidebar:**
  - Top: the workspace name as plain text (14px, 600) with a small 20px square mark. No tagline.
  - Nav: Inbox, Exceptions (count badge), Invoices, Purchase orders, Vendors. Each item is 32px tall with a 16px icon and 14px label.
  - Active item: `bg-hover` with `text-brand` and the icon in brand. Hover: `bg-hover`.
  - In Demo mode only, a "Demo" group (12px `fg-subtle` group label, sentence case) holds Sample invoices and How it works.
  - Bottom: Settings.
- **Page header** (`--header-height`, bottom border `line`, on `surface`):
  - Left: breadcrumb (13px `fg-subtle`, `/` separators) above or beside the title (`text-title`).
  - Right: actions, at most one primary.
  - No subtitle paragraph. An optional metadata line (13px `fg-muted`) is allowed on detail pages.
- **Content:** sections stack with 24px between them. A section is either a bare table panel or a panel with a 15px/600 title row.
- **Detail pages:** document on the left (about 45%) and data on the right (about 55%), with tabs. Both columns fill the height of the viewport below the header, and each scrolls on its own.
- **Demo banner** (Demo mode only): 32px tall, full width above the shell, `neutral-bg` with 13px `fg-muted` text: "Demo workspace · sample data · Reset".

## 4. Components

### Button
- 32px tall, 12px horizontal padding, `rounded-control`, 14px/500, 16px icon with an 8px gap.

| Variant | Style | Use |
|---|---|---|
| **Primary** | `bg-brand`, `text-on-brand`, hover `brand-hover` | **At most one per view** |
| **Secondary** | `surface` background, 1px `line-strong` border, `text-fg`, hover `bg-hover` | Everything else |
| **Ghost** | No border, `text-fg-muted`, hover `bg-hover` | Tertiary actions, icon buttons |
| **Destructive** | Secondary style with `text-danger-fg` | Reject |

- Approve is primary. Reject is destructive secondary. A note is optional for both.
- Disabled: 50% opacity, `cursor: not-allowed`, and a tooltip explaining why.
- Focus: a 2px `brand` ring offset by 2px.

### Status badge
- 20px tall, 8px horizontal padding, `rounded-badge` (4px), 12px/500, sentence case, `{status}-bg` fill with `{status}-fg` text. No border, no dot.
- The text alone carries the meaning. Never use colour without a label.

| Label | Tone |
|---|---|
| Approved | success |
| On hold | warning |
| Rejected | danger |
| Resolved | neutral (with the outcome in text, e.g. "Resolved · approved") |
| Posted | neutral |
| Processing | neutral, with a 12px spinner |

- Reason chips use the same shape as badges, in neutral, so the badge is the only coloured element in a row.

### Table
- Lives in a `surface` panel with a `line` border, `rounded-panel` and no shadow.
- **Header:** 36px, no fill (`surface`), 12px/500 `fg-subtle`, sentence case, bottom border `line`, sticky.
- **Rows:** `--row-height` (40px), 13px, 1px `line` dividers, `bg-hover` on hover. If the row opens a detail page, the whole row is clickable with `cursor: pointer`.
- **Cells:** first and last cells have 16px padding; others 12px.
- **Two-line cells** (e.g. vendor and invoice no.): 13px `fg` with 12px `fg-subtle` below; the row may grow to 52px.
- **Numbers:** right-aligned and tabular. Currency is always `$1,234.56`. An empty value is an en dash `–` in `fg-disabled`.
- **No zebra striping.** Pagination isn't needed below 200 rows.
- **Footer:** 36px, 13px `fg-subtle`, showing the count and total, e.g. "12 invoices · $84,210.40".

### Tabs with counts
- Underline tabs: 32px tall, 14px/500 `fg-muted`.
- Active tab: `fg` with a 2px `brand` underline. The tab bar sits on a bottom border `line`.
- Count: 12px `fg-subtle` after the label ("On hold 3"). In the active tab the count is also `fg`.

### Filter bar
- One row above the table, with gaps of 8.
- **Search input:** 32px, 240px wide, with a 16px search icon.
- **Date range:** a select ("All time", "Today", "Last 7 days", "Last 30 days").
- Filters change the table; they don't reload the page.

### KPI strip
- One `surface` panel, one row, with cells separated by 1px `line` dividers.
- Each cell: a label (12px/500 `fg-subtle`) and a value (`text-figure`, tabular), with an optional 12px `fg-subtle` sub-line.
- No icons, no trend colours, no dark cards.

### Side panel / detail column
- A `surface` panel with a `line` border, `rounded-panel`, a 15px/600 title row with a bottom border, and 16px padding.

### Field list
- Label and value rows. The label is 13px `fg-subtle` and 160px wide; the value is 13px `fg`, tabular where numeric.
- Dividers are 1px `line`; rows are 36px tall.

### Comparison table (e.g. bank details)
- Columns: Field | On invoice | On vendor file | Match.
- The match column shows a 16px check (`success-fg`) or x (`danger-fg`) icon with a visually hidden label.

### Issues panel (detail pages, only when there are issues)
- A `surface` panel with a `line` border; the title is "Issues (n)".
- **Each issue row:**
  - a 16px alert icon in `warning-fg`, or `danger-fg` for reject reasons
  - the reason label in 13px/600
  - one evidence line in 13px `fg-muted`, stated in numbers
- **Then** a "Recommended action" row: 13px/600 label, with plain text below. No AI label.

### Activity timeline
- A vertical list. Each step has a 16px status icon (check, alert, x or dash), a 20px gap and a 1px `line` connector.
- Each step shows its name (13px/500), its result (12px badge-style text) and a one-line detail (13px `fg-muted`).
- In Dev mode only, each step also shows its tag (Code / Rules / Model), timing and model-call count in `font-code` 12px.

### PDF viewer panel
- The native browser PDF embed (`<iframe src=…#view=FitH>`) filling the left column, with a `line` border and `rounded-panel`.
- Toolbar row (40px): the file name in 13px `fg-muted`, with an "Open" ghost button on the right.

### Empty state
- **One line** of 14px `fg-muted`, centred in the panel with 48px vertical padding, plus an optional secondary button.
- No illustration, no icon, no second sentence. For example: "No open exceptions."

### Toast
- Bottom-right, `surface`, `line` border, `shadow-popover`, `rounded-panel`, 14px. A one-line message with an optional link.
- Auto-dismisses after 4 seconds.

### Form inputs
- 32px tall, 1px `line-strong` border, `rounded-control`, 14px, `fg-subtle` placeholder.
- Focus: `brand` border with a 2px `brand-soft` ring.
- Labels are 13px/500 `fg`, 6px above the input.
- Textareas follow the same rules, with a minimum height of 64px.

### Upload area (Inbox)
- Full width, 120px tall, a 1px dashed `line-strong` border, `rounded-panel`, `surface`.
- One line of centred 14px `fg-muted` text: "Drop PDF invoices or **browse** · PDF up to 15 MB". "Browse" is a link.
- On drag-over: `brand` border and `brand-soft` fill.

## 5. Status and reason vocabulary
- **Statuses:** Approved, On hold, Rejected, Resolved, Posted, Processing.
- **Reason labels:**

| Code | Label |
|---|---|
| RUNNING_TOTAL_EXCEEDS_PO | Exceeds PO amount |
| PRICE_OVER_TOLERANCE | Price variance |
| QTY_EXCEEDS_REMAINING | Quantity exceeds PO |
| DUPLICATE_EXACT | Duplicate, already paid |
| DUPLICATE_SUSPECTED | Possible duplicate |
| PO_CLOSED | PO closed |
| PO_INFERRED | PO not on invoice |
| PO_VENDOR_MISMATCH | PO belongs to another vendor |
| PO_NOT_FOUND | PO not found |
| BANK_DETAILS_MISMATCH | Bank details mismatch |
| VENDOR_MATH_ERROR | Invoice total mismatch |
| VENDOR_NOT_APPROVED | Vendor not approved |
| DOC_NOT_INVOICE | Not an invoice |
| LINE_UNMATCHED | Line not on PO |
| LINE_MATCH_UNCERTAIN | Line match unconfirmed |
| CURRENCY_MISMATCH | Currency mismatch |
| MISSING_FIELD | Missing information |
| LOW_CONFIDENCE_FIELD | Unreadable field |
| UNREADABLE_DOCUMENT | Unreadable file |
| SYSTEM_ERROR | Processing error |

## 6. Copy rules
- **Case and style:** sentence case for everything. No taglines, slogans or exclamation marks. Never address the user as "you" in labels; do use the imperative in actions ("Approve", "Reject", "Upload invoices").
- **Vocabulary:** AP terms such as invoice, purchase order (PO), vendor, remaining balance, posted, on hold, exception. Don't use "run" in Product mode; say "invoice".
- **No narration:** no explanatory paragraph under page titles. How the system works is described only on the Demo "How it works" page.
- **Evidence:** state facts with numbers, e.g. "Unit price $189.00 vs PO $180.00 (+5.0%)".
- **Formats:**
  - Currency: `$11,286.00`
  - Percent: one decimal
  - Dates in tables: `Nov 11, 10:08` for the current year, `Nov 11, 2025` for other years; on detail pages: `Nov 11, 2026`
  - Masked bank accounts: bank name, two bullets and the last 4 digits (`First Pacific Bank ••0093`)
  - Time ago only for age columns ("3d")
- **Empty states:** one short sentence ("No open exceptions.").
- **Errors:** say what failed and what to do ("Upload failed: file is larger than 15 MB.").
- **Processing labels:** Reading invoice…, Checking totals…, Matching vendor and PO…, Comparing to PO…, Deciding…, Posting…, Writing note…

## 7. App modes
A single context, `useAppMode()`, returns `{ demo, dev }`. Defaults come from `VITE_DEMO_MODE` and `VITE_DEV_MODE`; overrides are set in Settings and persisted in `localStorage`. With both off, the app is in **Product mode**.

| | Product (default) | Demo | Dev |
|---|---|---|---|
| Audience | AP clerk | Prospects, interviewers | Developer |
| Sample invoices page, Reset, How it works | hidden | shown (Demo nav group and banner) | – |
| Model name, store info | hidden | hidden | Settings and footer |
| Step tags, timings, model-call counts, run IDs | hidden | hidden | shown |
| Raw extraction JSON tab | hidden | hidden | shown |
| Backend progress text | plain UI labels | plain UI labels | raw backend text |

Demo and Dev both still follow this document. Monospace is allowed in Dev panels only.

## 8. Banned list
- serif or italic display headings; tagline-style headlines
- eyebrow/kicker labels; uppercase letter-spaced text; monospace outside Dev mode
- explanatory paragraphs under page titles
- cream/beige/paper backgrounds; gradients; glow or glassmorphism; decorative shadows
- rubber stamps or other skeuomorphic graphics; sparkle/AI icons; emoji
- "01/02/03" numbering or giant numerals
- dark hero stat cards; bento grids; rainbow charts
- hover-scale animations; cards inside cards
- model names, AI/RULES/CODE tags or timings anywhere outside Dev mode
- cute or marketing copy

## 9. Review checklist (run before finishing any UI change)
- [ ] Only `font-ui` is used; any `font-code` is inside a Dev-mode-only component.
- [ ] No `italic`, `uppercase`, `tracking-*` or `font-display` in changed files.
- [ ] No raw hex values, `text-[NNpx]` sizes or Tailwind palette colours. Only tokens.
- [ ] No shadows except on popovers, dropdowns, modals and toasts. Radius is no more than 8px.
- [ ] Page header: breadcrumb and title on the left, actions on the right, at most one primary button, no subtitle paragraph.
- [ ] Tables: 40px rows, sticky 12px sentence-case header, right-aligned tabular numbers, row hover, and the row opens detail.
- [ ] Every colour carries status meaning and comes with a text label. Charts use `data`, with `data-alert` only for problems.
- [ ] Copy is sentence case and plain AP language, with no narration, cute wording or exclamation marks.
- [ ] Product mode shows no model name, store, step tags, timings, run IDs or demo controls.
- [ ] Empty states are one line plus at most one action.
- [ ] Screenshot captured in `docs/redesign/after/` and compared with `before/`.
- [ ] Grep for banned patterns is clean, `npm run build` passes, and `uv run pytest` passes.
