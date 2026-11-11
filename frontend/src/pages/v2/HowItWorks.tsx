import type { ReactNode } from 'react'
import { usePoll } from '../../app/data'
import { money } from '../../app/format'
import { REASON_LABEL, REJECT_CODES } from '../../app/labels'
import { Page, PageHeader } from '../../components/v2/shell'
import { Badge } from '../../components/v2/ui'
import { api } from '../../lib/api'

function H2({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 mt-8 text-section font-semibold first:mt-0">{children}</h2>
}
function P({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-body text-fg-muted">{children}</p>
}

const STEPS: [string, string, string][] = [
  ['Receive', 'Code', 'The PDF is stored and fingerprinted, and the system records whether it is digital or scanned.'],
  ['Read', 'Model', 'A language model reads the document into fixed fields: vendor, invoice number, dates, PO reference, line items, totals and bank details. Numbers are copied as printed and never corrected.'],
  ['Check', 'Rules', 'Is it an invoice? Are required fields present? Do the line items, subtotal, tax and total add up? If not, the document is read once more to rule out a misread.'],
  ['Match', 'Rules', 'The vendor is found by name, alternate name or tax ID. Bank details are compared with the vendor file. The PO is looked up; if none is printed, the model suggests one from the vendor\'s open POs and the rules verify it.'],
  ['Compare', 'Rules', 'Each line is paired with a PO line (by item code, or by description using the model). Quantities are checked against what remains on the PO, unit prices against the tolerance, and the running total across all invoices against the PO amount. Previously posted invoices are checked for duplicates.'],
  ['Decide', 'Rules', 'Each check has a fixed severity. Any reject-level finding rejects the invoice; otherwise any hold-level finding puts it on hold; otherwise it is approved. The model is not involved.'],
  ['Post', 'Code', 'Only approved invoices are written: a row in the invoice log and the PO\'s billed amount and line quantities. Writes happen at most once per invoice.'],
  ['Review', 'Person', 'Held invoices appear in Exceptions. A reviewer approves (which posts exactly what the system computed) or rejects, with an optional note kept in the audit trail.'],
]

export default function HowItWorks() {
  const { data: cfg } = usePoll(() => api.config(), 60000)
  return (
    <>
      <PageHeader title="How it works" crumbs={[{ label: 'Demo' }]} />
      <Page>
        <article className="max-w-3xl">
          <H2>Overview</H2>
          <P>Invoice Desk processes vendor invoices end to end. A language model is used only to read documents and to interpret wording; every approve, hold or reject decision is made by fixed rules, and only approvals change the records.</P>

          <H2>Steps</H2>
          <div className="overflow-clip rounded-panel border border-line bg-surface">
            <table className="w-full text-table">
              <thead><tr className="text-caption text-fg-subtle"><th className="h-9 border-b border-line pl-4 pr-3 text-left font-medium">Step</th><th className="border-b border-line pr-3 text-left font-medium">Done by</th><th className="border-b border-line pr-4 text-left font-medium">What happens</th></tr></thead>
              <tbody>{STEPS.map(([s, by, d]) => (
                <tr key={s} className="border-b border-line align-top last:border-0">
                  <td className="py-2.5 pl-4 pr-3 font-medium">{s}</td><td className="py-2.5 pr-3 text-fg-muted">{by}</td><td className="py-2.5 pr-4 text-fg-muted">{d}</td>
                </tr>))}
              </tbody>
            </table>
          </div>

          {cfg && (<>
            <H2>Approval rules</H2>
            <ul className="mb-3 list-disc space-y-1 pl-5 text-body text-fg-muted">
              <li>Unit prices may be up to {(cfg.policy.price_tolerance_pct * 100).toFixed(0)}% above the PO price.</li>
              <li>All invoices against a PO together may total up to {(cfg.policy.running_total_tolerance_pct * 100).toFixed(0)}% above the PO amount. The tolerance applies once per PO, so splitting an order into several invoices cannot stack it.</li>
              <li>Quantities are compared with what remains on each PO line, so partial invoices are normal.</li>
              <li>Arithmetic differences up to {money(cfg.policy.rounding_tolerance)} are treated as rounding.</li>
              <li>A possible duplicate is the same vendor, amount and lines within {cfg.policy.near_duplicate_window_days} days under a different invoice number.</li>
              <li>Bank details that differ from the vendor file are always held; the reviewer should confirm by phone using the number on file.</li>
            </ul>
          </>)}

          <H2>Reasons</H2>
          <div className="overflow-clip rounded-panel border border-line bg-surface">
            <table className="w-full text-table">
              <thead><tr className="text-caption text-fg-subtle"><th className="h-9 border-b border-line pl-4 pr-3 text-left font-medium">Reason</th><th className="border-b border-line pr-4 text-left font-medium">Outcome</th></tr></thead>
              <tbody>{Object.entries(REASON_LABEL).map(([code, label]) => (
                <tr key={code} className="border-b border-line last:border-0">
                  <td className="h-9 pl-4 pr-3">{label}</td>
                  <td className="pr-4">{REJECT_CODES.has(code) ? <Badge tone="danger">Rejected</Badge> : <Badge tone="warning">On hold</Badge>}</td>
                </tr>))}
              </tbody>
            </table>
          </div>

          <H2>Assumptions</H2>
          <ul className="list-disc space-y-1 pl-5 text-body text-fg-muted">
            <li>Two-way match (PO and invoice). Received quantities are stored for a future three-way match.</li>
            <li>One invoice per PDF and one PO per invoice. PO amounts exclude tax.</li>
            <li>Invoices arrive by upload; email intake is a later addition.</li>
          </ul>
        </article>
      </Page>
    </>
  )
}
