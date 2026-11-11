import type { RunSummary } from '../lib/api'

/** Reason-code labels (docs/DESIGN.md §5). */
export const REASON_LABEL: Record<string, string> = {
  RUNNING_TOTAL_EXCEEDS_PO: 'Exceeds PO amount',
  PRICE_OVER_TOLERANCE: 'Price variance',
  QTY_EXCEEDS_REMAINING: 'Quantity exceeds PO',
  DUPLICATE_EXACT: 'Duplicate, already paid',
  DUPLICATE_SUSPECTED: 'Possible duplicate',
  PO_CLOSED: 'PO closed',
  PO_INFERRED: 'PO not on invoice',
  PO_VENDOR_MISMATCH: 'PO belongs to another vendor',
  PO_NOT_FOUND: 'PO not found',
  BANK_DETAILS_MISMATCH: 'Bank details mismatch',
  VENDOR_MATH_ERROR: 'Invoice total mismatch',
  VENDOR_NOT_APPROVED: 'Vendor not approved',
  DOC_NOT_INVOICE: 'Not an invoice',
  LINE_UNMATCHED: 'Line not on PO',
  LINE_MATCH_UNCERTAIN: 'Line match unconfirmed',
  CURRENCY_MISMATCH: 'Currency mismatch',
  MISSING_FIELD: 'Missing information',
  LOW_CONFIDENCE_FIELD: 'Unreadable field',
  UNREADABLE_DOCUMENT: 'Unreadable file',
  SYSTEM_ERROR: 'Processing error',
}

export const REJECT_CODES = new Set(['DUPLICATE_EXACT', 'VENDOR_NOT_APPROVED', 'DOC_NOT_INVOICE'])

export function reasonLabel(code: string): string {
  return REASON_LABEL[code] ?? code.replaceAll('_', ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())
}

export type Tone = 'success' | 'warning' | 'danger' | 'neutral'

export interface StatusInfo {
  label: string
  tone: Tone
  processing?: boolean
}

/** One status per invoice, in DESIGN.md vocabulary. */
export function statusOf(r: Pick<RunSummary, 'status' | 'decision' | 'review_status'>): StatusInfo {
  if (r.status === 'queued' || r.status === 'running') return { label: 'Processing', tone: 'neutral', processing: true }
  if (r.review_status === 'approved') return { label: 'Resolved · approved', tone: 'neutral' }
  if (r.review_status === 'rejected') return { label: 'Resolved · rejected', tone: 'neutral' }
  if (r.decision === 'APPROVE') return { label: 'Approved', tone: 'success' }
  if (r.decision === 'REJECT') return { label: 'Rejected', tone: 'danger' }
  return { label: 'On hold', tone: 'warning' }
}

/** Plain progress labels per pipeline stage (never backend text in Product mode). */
export const STAGE_PROGRESS: Record<string, string> = {
  ingest: 'Receiving…',
  extract: 'Reading invoice…',
  validate: 'Checking totals…',
  match: 'Matching vendor and PO…',
  reconcile: 'Comparing to PO…',
  decide: 'Deciding…',
  act: 'Posting…',
  explain: 'Writing note…',
}

/** Activity timeline step names. */
export const STAGE_NAME: Record<string, string> = {
  ingest: 'Received',
  extract: 'Invoice read',
  validate: 'Totals and fields checked',
  match: 'Vendor and PO matched',
  reconcile: 'Compared to PO',
  decide: 'Decision',
  review: 'Reviewed',
  act: 'Records',
  explain: 'Summary',
}

/** Dev-mode step tags. */
export const STAGE_TAG: Record<string, string> = {
  ingest: 'Code', extract: 'Model', validate: 'Rules', match: 'Rules + model', reconcile: 'Rules + model',
  decide: 'Rules', review: 'Person', act: 'Code', explain: 'Model',
}

export const VENDOR_MATCH_BASIS: Record<string, string> = {
  exact: 'Exact name', alias: 'Known alternate name', tax_id: 'Tax ID (name differs)', similar: 'Similar name',
}
