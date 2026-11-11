import type { Decision } from './api'

export interface ReasonInfo {
  label: string
  outcome: 'HOLD' | 'REJECT'
  what: string
}

/** Plain-English catalogue of every reason code the rules can produce. */
export const REASONS: Record<string, ReasonInfo> = {
  BANK_DETAILS_MISMATCH: { label: 'Bank details changed', outcome: 'HOLD', what: 'Remit-to bank account differs from the vendor file - a classic payment-fraud pattern.' },
  VENDOR_MATH_ERROR: { label: "Vendor's maths is wrong", outcome: 'HOLD', what: "The invoice's own figures don't add up, confirmed by a second reading." },
  DUPLICATE_SUSPECTED: { label: 'Possible duplicate', outcome: 'HOLD', what: 'Same vendor, amount and lines as an invoice already approved.' },
  DUPLICATE_EXACT: { label: 'Already paid', outcome: 'REJECT', what: 'This exact invoice was already processed.' },
  QTY_EXCEEDS_REMAINING: { label: 'More than ordered', outcome: 'HOLD', what: "Bills more units than are left on the PO line." },
  RUNNING_TOTAL_EXCEEDS_PO: { label: 'Over the PO total', outcome: 'HOLD', what: 'All invoices on this PO together exceed its total (+ tolerance).' },
  PRICE_OVER_TOLERANCE: { label: 'Price above PO', outcome: 'HOLD', what: 'A unit price is more than the allowed tolerance above the PO price.' },
  PO_INFERRED: { label: 'PO suggested, not printed', outcome: 'HOLD', what: 'No usable PO number on the invoice; the system suggested one for a person to confirm.' },
  PO_VENDOR_MISMATCH: { label: "PO belongs to another vendor", outcome: 'HOLD', what: 'The printed PO number is someone else\'s PO - likely a typo.' },
  PO_NOT_FOUND: { label: 'No matching PO', outcome: 'HOLD', what: "Couldn't find a PO for this invoice." },
  PO_CLOSED: { label: 'PO already closed', outcome: 'HOLD', what: 'The PO has already been fully billed.' },
  CURRENCY_MISMATCH: { label: 'Different currency', outcome: 'HOLD', what: 'Invoice currency differs from the PO currency.' },
  LINE_UNMATCHED: { label: 'Charge not on PO', outcome: 'HOLD', what: 'An invoice line is not something that was ordered.' },
  LINE_MATCH_UNCERTAIN: { label: 'Line match uncertain', outcome: 'HOLD', what: 'A line probably matches the PO, but a person should confirm.' },
  VENDOR_NOT_APPROVED: { label: 'Vendor not approved', outcome: 'REJECT', what: 'Vendor is not on the approved list (or onboarding is incomplete).' },
  DOC_NOT_INVOICE: { label: 'Not an invoice', outcome: 'REJECT', what: 'A proforma, statement, quote, receipt or credit note - not a payable bill.' },
  MISSING_FIELD: { label: 'Missing information', outcome: 'HOLD', what: 'Invoice number, date, total, vendor or lines missing.' },
  LOW_CONFIDENCE_FIELD: { label: 'Hard to read', outcome: 'HOLD', what: 'A key field could not be read confidently.' },
  UNREADABLE_DOCUMENT: { label: 'Unreadable file', outcome: 'HOLD', what: 'The file could not be opened as a PDF.' },
  SYSTEM_ERROR: { label: 'System problem', outcome: 'HOLD', what: 'A step could not complete - held rather than guessed.' },
}

export function reasonLabel(code: string): string {
  return REASONS[code]?.label ?? code.replaceAll('_', ' ').toLowerCase()
}

export const DECISION_META: Record<Decision, { stamp: string; title: string; tone: string; text: string; bg: string; mark: string }> = {
  APPROVE: { stamp: 'Approved', title: 'Approved and recorded', tone: 'approve', text: 'text-approve', bg: 'bg-approve-bg', mark: 'bg-approve-mark' },
  HOLD: { stamp: 'On hold', title: 'On hold for a person', tone: 'hold', text: 'text-hold', bg: 'bg-hold-bg', mark: 'bg-hold-mark' },
  REJECT: { stamp: 'Rejected', title: 'Rejected', tone: 'reject', text: 'text-reject', bg: 'bg-reject-bg', mark: 'bg-reject-mark' },
}

export const STAGE_KIND: Record<string, { tag: string; kind: 'ai' | 'rules' | 'io' | 'human' }> = {
  ingest: { tag: 'Code', kind: 'io' },
  extract: { tag: 'AI reads', kind: 'ai' },
  validate: { tag: 'Rules', kind: 'rules' },
  match: { tag: 'Rules + AI assist', kind: 'rules' },
  reconcile: { tag: 'Rules + AI assist', kind: 'rules' },
  decide: { tag: 'Rules only', kind: 'rules' },
  review: { tag: 'Person', kind: 'human' },
  act: { tag: 'Code writes', kind: 'io' },
  explain: { tag: 'AI explains', kind: 'ai' },
}

export const STAGE_BLURB: Record<string, string> = {
  ingest: 'Open the PDF, fingerprint it, detect digital vs scanned, load the records.',
  extract: 'The model reads every field from the PDF - the same path for digital and scanned.',
  validate: 'Is it an invoice? Are the required fields there? Do the numbers add up?',
  match: 'Which vendor, can we pay them, are the bank details theirs, which PO is it?',
  reconcile: 'Lines vs PO, quantity left, price tolerance, running total, duplicates.',
  decide: 'Worst result wins: any REJECT beats any HOLD beats APPROVE.',
  review: 'A person resolves the hold. Approving records exactly what the run computed; the pipeline updates to show it.',
  act: 'Only an approval writes to the spreadsheet.',
  explain: 'A plain-English note for the AP clerk - it cannot change the decision.',
}
