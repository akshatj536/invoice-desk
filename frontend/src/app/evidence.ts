import type { Check } from '../lib/api'
import { date, last4, money } from './format'

/**
 * One evidence line per failed check, stated in numbers, built from the check's structured evidence
 * (the backend already computed every figure; this only phrases it). Falls back to the check message.
 */
export function evidenceLine(c: Check): string {
  const e = c.evidence || {}
  const first = (xs: any[] | undefined) => (Array.isArray(xs) && xs.length ? xs : null)
  switch (c.reason_code) {
    case 'RUNNING_TOTAL_EXCEEDS_PO':
      if (e.po_total != null)
        return `Billed to date ${money(e.already_invoiced)} + this invoice ${money(e.this_invoice)} = ${money(e.new_total)}, exceeds PO amount ${money(e.po_total)} by ${money(e.new_total - e.po_total)}`
      break
    case 'PRICE_OVER_TOLERANCE': {
      const xs = first(e.over)
      if (xs) return xs.map(p => `${p.description}: unit price ${money(p.unit_price)} vs PO ${money(p.po_unit_price)} (+${Number(p.price_diff_pct).toFixed(1)}%)`).join('; ')
      break
    }
    case 'QTY_EXCEEDS_REMAINING': {
      const xs = first(e.over)
      if (xs) return xs.map(p => `${p.description}: invoiced ${p.qty}, PO remaining ${p.po_qty_remaining} of ${p.po_qty_ordered}`).join('; ')
      break
    }
    case 'BANK_DETAILS_MISMATCH':
      if (e.invoice_account)
        return `Invoice account ${last4(e.invoice_account)}, routing ${e.invoice_routing} vs vendor file ${last4(e.file_account)}, routing ${e.file_routing}`
      break
    case 'VENDOR_MATH_ERROR':
      if (e.lines_sum != null && e.subtotal != null)
        return `Line items total ${money(e.lines_sum)}; invoice subtotal ${money(e.subtotal)} (difference ${money(e.subtotal - e.lines_sum)})`
      break
    case 'DUPLICATE_SUSPECTED':
    case 'DUPLICATE_EXACT':
      if (e.matched)
        return `Matches ${e.matched.invoice_number} for ${money(e.matched.total)} on ${e.matched.po_number}, posted ${date(e.matched.processed_at)}`
      break
    case 'PO_INFERRED':
      if (e.suggested_po)
        return e.printed_as ? `PO field reads “${e.printed_as}”; closest open PO is ${e.suggested_po}` : `No PO number on invoice; closest open PO is ${e.suggested_po}`
      break
    case 'PO_VENDOR_MISMATCH':
      if (e.suggested_po) return `Invoice cites ${e.printed_as}, which belongs to another vendor; closest open PO is ${e.suggested_po}`
      break
    case 'LINE_UNMATCHED': {
      const xs = first(e.unmatched)
      if (xs) return xs.map(p => `${p.description} (${money(p.amount)}) is not on the PO`).join('; ')
      break
    }
    case 'LINE_MATCH_UNCERTAIN': {
      const xs = first(e.uncertain)
      if (xs) return xs.map(p => `“${p.description}” may be PO line ${p.po_line}, “${p.po_description}”`).join('; ')
      break
    }
    case 'VENDOR_NOT_APPROVED':
      if (e.notes) return `In the vendor file but not approved for payment (${String(e.notes).replace(/^./, ch => ch.toLowerCase())})`
      if (e.name_on_invoice) return `“${e.name_on_invoice}” is not in the vendor file`
      break
    case 'DOC_NOT_INVOICE':
      if (e.doc_type) return `Document is a ${String(e.doc_type).replace('_', ' ')}, not a bill`
      break
    case 'CURRENCY_MISMATCH':
      if (e.invoice) return `Invoice in ${e.invoice}, PO in ${e.po}`
      break
    case 'MISSING_FIELD':
      if (Array.isArray(e.missing) && e.missing.length) return `Missing: ${e.missing.join(', ')}`
      break
  }
  return c.message
}
