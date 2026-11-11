# Reference research: synthesis

This synthesizes three research reports from 2026-11-11. They were compiled only from public sources: Ramp's public product tour, Mercury's public demo, help centres, changelogs and Linear's site.
- Values marked **[v]** were verified from a source, often as computed CSS read from a public demo or tour DOM.
- Values marked **[e]** are estimates.
- **Stripe Dashboard was not researched.** That agent was stopped before it reported. Nothing below is attributed to Stripe. It did save three public-page screenshots before stopping (`stripe-invoices-list.png`, `stripe-detail-layout.png`, `stripe-datatable.png`). They have not been analysed and are kept for visual reference only.

Screenshots in `docs/redesign/research/` are **internal reference only**, because they contain the vendors' logos and brand colours:
- `linear-app-shell.png`, `linear-list-view.png`
- `ramp-bill-inbox.png`, `ramp-bill-detail.png`, `ramp-approval.png`
- `payables-mercury-billpay-table.png`, `payables-mercury-bill-detail.png`, `payables-mercury-vendor-detail.png`

We extract principles only and copy no logos, brand colours, typefaces or illustrations.

## Sources
| Ref | Sources |
|---|---|
| Linear | linear.app (HTML product mockup, measured), "How we redesigned the Linear UI", 2026 design refresh post and changelog, linear.app/docs (display options, select issues, filters, views, search, inbox, triage), empty-state teardown (saasui.design, secondary source) |
| Ramp Bill Pay | Ramp's public Bill Pay tour (capture.navattic.com, linked from ramp.com/explore-ap; real HTML captures, measured); support.ramp.com articles on bill lifecycle, list management, approvals, AP agents, 3-way match and draft bills; community post on the Jan 2026 layout change; ramp.com blog |
| Mercury / Bill.com / Brex | demo.mercury.com (bill pay, approvals, recipients; measured); brex.com/support/bill-pay-overview and the product page image; support.bill.com status articles; Bill.com approver guide; merchantmaverick review |

## Observations by topic

### App shell
- **Sidebar width:**
  - Linear 232px, items 208px wide inside 8/16px padding [v].
  - Ramp about 216px [e].
  - Mercury 220px [v].
- **Nav items:**
  - Linear 28px tall, 13px at weight 510, 14px icons, 8px radius [v].
  - Ramp 32px tall, 4px radius [v].
  - Mercury 15px labels [v].
- **Active item:**
  - Linear uses a background tint only [v].
  - Ramp uses a warm-grey fill [v].
  - Mercury uses a 2px left accent bar [v].
- **Group labels:** Linear's are 12px, sentence case, never uppercase, and collapsible [v].
- **Counts:**
  - Linear lets the user choose a plain grey count or a dot [v].
  - Ramp puts a pill on the sidebar item ("Bills 47"), not on the tabs [v].
  - Mercury puts counts in the tabs ("Inbox 3") [v].
- **Page header:**
  - Linear: a 44px bar with the breadcrumb (12px) on the left, actions on the right, and the same header everywhere [v].
  - Ramp: H1 with actions on the right; at most one primary button ("New bill") [v].
  - Mercury: H1 with secondary "Upload bill" and ghost "Send money" on the right [v].

### Density and typography
- **Base text:**
  - Linear 13px body, 12px meta; weights 400/510/590 [v].
  - Ramp 14/20 body, 12/16 labels, headers and badges [v].
  - Mercury 15/24 [v].
- **List row height:**
  - Linear 40px [v].
  - Ramp about 65px with two-line vendor cells [v].
  - Mercury 66px for bills and 51px for vendors [v].
  - Brex offers Compact / Simple / Detailed density settings [v].
- **Table headers:**
  - Ramp 32px tall, 12px grey, sentence case, no uppercase [v].
  - Mercury 40px tall, 13px at weight 400, grey, sentence case, **no fill** [v].
  - Brex uses a light grey fill [v].
- **Row dividers:** hairlines (Mercury 1px at about 10% opacity), no zebra striping, no outer table border in Mercury [v]. Linear has no row dividers at all [v].
- **Text greys:** a four-step scale in Linear (heading, body, secondary, tertiary) [v]. Mercury uses three cool greys [v].

### Numbers and dates
- **Amounts:** right-aligned with `tabular-nums` in Ramp, Mercury and Linear's counters [v].
- **Currency notation:**
  - Ramp: `$20,500.00 USD`, with a symbol and code for foreign currency [v].
  - Mercury: a U+2212 minus for outflows and smaller cents [v].
- **Dates:**
  - Ramp "Feb 20, 2026" [v].
  - Mercury "Nov 11" for the current year and "Jan 2027" for other years [v].
- **Totals:**
  - Ramp's table footer reads "1–23 of 23 drafts · $448,548.27 total" [v].
  - Mercury's bulk bar shows the selected total [v].

### Status badges and colour
- **Badges:**
  - Ramp: 22px tall, 4px radius, 12px text, with a dot [v].
  - Mercury: 20px tall, 4px radius, 12px text, no border [v].
  - Brex shows status as **plain text** with no badge [v].
  - Bill.com uses outlined badges [v].
- **Colour discipline:**
  - In Ramp, "Missing info" and "Ready for review" **share one amber**, so the label carries the distinction [v].
  - Mercury uses neutral for routine statuses, amber for overdue and red for failed [v].
  - In Linear only the status icon carries colour; titles stay neutral [v].
- **Elevation:**
  - Linear uses tonal surfaces and hairlines; every shadow token resolves to none [v].
  - Ramp uses square corners and borders [v].
  - Mercury cards use a soft shadow with no border [v]. This is the outlier, and we don't follow it.
- **Radius:** Linear 8px for panels and items [v]; Ramp square [v]; Mercury 12px cards with pill buttons [v].

### Document and extracted data
- **Ramp detail:** three panes at 1440px — queue 256px | form about 630px of content | document about 473px (33%) on the **right** [v]. The invoice moved to the right in January 2026 to match Expenses [v]. The document pane has tabs (Invoice | Documents) and zoom and rotate controls [v].
- **Bill.com detail:** PDF on the **left**, fields on the right, with Prev | Next, Approve and More actions [v].
- **Field display:**
  - Ramp read-only fields: 12px label with a 20px value [v].
  - Ramp sections each carry a completeness chip (Complete / Optional) instead of colouring individual fields [v].
- **PO match:** Ramp shows a "Matching purchase order" select and the message "Ramp identified $6 overbilling" [v].

### Exceptions and approvals
- **Ramp inbox:** a full-width sub-row under the affected bill: "↳ This draft may be a duplicate of INV# R00372409. Make sure you're not paying twice." [v]
- **Ramp detail alert:** a title, bullet reasons and a **bold recommended next step** ("We recommend calling your vendor to confirm…") [v].
- **Ramp summary card:** "Review recommended" / "Ready to approve", with a **"Checks passed" ✓ list** under the anomaly [v].
- **Ramp action bar:** sticky, with Edit, ⋮, outline-red **Reject** and solid **Approve** at the far right [v]. Reject requires a reason [v].
- **Approval chain:** Ramp shows a numbered stepper with role chips and "or" [v]. Mercury shows "0 of 2" approvals in the table [v]. Bill.com keeps approval status separate from payment status [v].

### Vendors
- **Masking:** Mercury "Chase ••0255" (bank name, 2 bullets, last 4) [v]; Brex "•••• 0189" [v].
- **Verification shown next to the details:** Mercury "Pending details" badge and tax-doc check icon [v]; Brex a green ✓ for verified [v].
- **Mercury vendor list:** Name, Total paid, Last paid, Status, Tax docs; the detail opens in a 392px right-hand panel [v].

### Stripe (from one saved screenshot only, so everything here is [e])
- **Invoices list:**
  - rows about 36px; header 12–13px, medium weight, dark grey, sentence case, no fill
  - small rectangular status badges (Paid / Open / Draft) with a tinted fill and a 1px border
  - amounts tabular, with the currency code in grey
- **Shell:**
  - plain sidebar items with 16px icons; the active item is shown by accent-coloured text only
  - group labels 12px grey, sentence case
- **Header:** page title about 24px/600 with one primary button and a "⋯" button at top right; filter chips sit above the table.

### Empty states and copy
- **Linear:** "No issues" plus a text link; "No active or planned projects" plus "Create a new project" [secondary source]. Filters stay visible when a view is empty.
- **Ramp:** the Drafts empty state is the upload target itself ("drop files or click here to upload") [secondary source].
- **Captured strings (Mercury, Bill.com):** "Last updated on Nov 11 by Jane D.", "Requested by Alice C. on Nov 10", "No notes", "No payments", "All must approve before paying this bill" [v].
- **Tone across all three:** sentence case, no exclamation marks, and it states who did what and when, or the specific next step.

## Principles adopted into DESIGN.md
1. **Shell:**
   - a 232px sidebar with 32px items; the active item gets a tint and accent text (our brief), not a dark pill
   - counts on the nav item (Exceptions) and on tabs (Invoices), in plain grey
   - one consistent page header everywhere: breadcrumb and title on the left, actions on the right
2. **Density:** 40px single-line rows, two-line vendor cells allowed (52px), and 12px sentence-case headers with **no fill band**.
3. **Dividers:** hairline row dividers only, with no zebra striping.
4. **Money:** right-aligned tabular figures, two decimals, `$` for the home currency, and a table footer with the count and total.
5. **Status:**
   - few badge tones, with the label carrying the meaning (several reasons share one amber)
   - badges 20px tall with a **4px radius** and no border
   - reason chips neutral, so a row shows one coloured element
6. **Borders, not shadows:** square-ish corners (6px controls, 8px panels max).
7. **Exception detail pattern:**
   - an Issues panel at the top: reason, one numeric evidence line, then **Recommended action**
   - passed checks listed in Activity
   - Approve is primary; Reject is a destructive secondary; the note is optional (the owner decided against requiring it)
8. **Document beside data:** we keep the brief's PDF-left (45%) layout, like Bill.com. Ramp moved its document to the right in 2026, and that is noted as a possible follow-up.
9. **Bank details:** masked as "First Pacific Bank ••0093", with the match state next to them.
10. **Empty states:** one factual line plus at most one action, with filters left visible.

## Not adopted
- **Mercury's** shadowed cards, pill buttons and light-weight display type: they conflict with "borders, not shadows" and the restraint we're aiming for.
- **Ramp's** 40px display headings and warm neutrals: the brief specifies a 20px title and cool greys.
- **Linear's** column-less property lists: AP tables need comparable numeric columns.
- **Keyboard-first patterns** (J/K, ⌘K, a 1/2/3 triage): logged as a follow-up, not built in v2.
