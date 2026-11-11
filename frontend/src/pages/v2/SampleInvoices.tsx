import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePoll } from '../../app/data'
import { money } from '../../app/format'
import { reasonLabel } from '../../app/labels'
import { Page, PageHeader } from '../../components/v2/shell'
import { Badge, Button, ButtonLink, Stack, Table, Td, Th, Tr, useToast } from '../../components/v2/ui'
import { api, type Decision } from '../../lib/api'

const OUTCOME: Record<Decision, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  APPROVE: { label: 'Approved', tone: 'success' },
  HOLD: { label: 'On hold', tone: 'warning' },
  REJECT: { label: 'Rejected', tone: 'danger' },
}
const GROUP: Record<string, string> = { happy: 'Standard', edge: 'Exception', brief: 'Variation' }
/** Plain scenario names (the manifest titles are v1 demo copy). */
const SCENARIO: Record<string, string> = {
  '01_happy_path.pdf': 'Clean invoice, PO matched',
  '02_bank_details_changed.pdf': 'Bank details differ from vendor file',
  '03_vendor_math_error.pdf': 'Subtotal differs from line items',
  '04_duplicate_resubmitted.pdf': 'Resubmitted with a new invoice number',
  '05a_split_part1.pdf': 'Partial invoice, 60 of 100 units',
  '05b_split_part2.pdf': 'Second partial invoice exceeds PO',
  '06_scanned.pdf': 'Scanned invoice',
  '07_no_po_number.pdf': 'No PO number on invoice',
  '08_price_over_tolerance.pdf': 'Unit price above PO',
  '09_unapproved_vendor.pdf': 'Vendor not approved',
  '10_proforma.pdf': 'Proforma invoice',
}

export default function SampleInvoices() {
  const nav = useNavigate()
  const toast = useToast()
  const { data } = usePoll(() => api.samples(), 60000)
  const [busy, setBusy] = useState<string | null>(null)

  const reset = async () => {
    if (!confirm('Reset demo data? This restores the sample POs, vendors and invoice log and clears all invoices.')) return
    await api.reset()
    toast('Demo data reset.')
  }
  const run = async (file: string) => {
    setBusy(file)
    try { const { id } = await api.runSample(file); nav(`/invoices/${id}`) }
    catch (e) { toast(`Could not start: ${String(e).replace(/^Error:\s*/, '')}`); setBusy(null) }
  }

  return (
    <>
      <PageHeader title="Sample invoices" crumbs={[{ label: 'Demo' }]} actions={<Button onClick={reset}>Reset demo data</Button>} />
      <Page>
        <Table minWidth={980} footer={`${data?.length ?? 0} sample invoices · run 05a before 05b`}>
          <thead><tr>
            <Th>Scenario</Th><Th>Type</Th><Th>Vendor</Th><Th>Invoice no.</Th><Th align="right">Amount</Th><Th>Expected outcome</Th><Th align="right" aria-label="Actions" />
          </tr></thead>
          <tbody>
            {(data ?? []).map(s => (
              <Tr key={s.file}>
                <Td><Stack primary={SCENARIO[s.file] ?? s.title} secondary={s.file.replace('.pdf', '')} /></Td>
                <Td className="text-fg-muted">{GROUP[s.group] ?? s.group}</Td>
                <Td className="whitespace-nowrap">{s.vendor}</Td>
                <Td className="tabular-nums">{s.invoice_number}</Td>
                <Td numeric>{money(s.total)}</Td>
                <Td className="whitespace-normal">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={OUTCOME[s.expected_decision].tone}>{OUTCOME[s.expected_decision].label}</Badge>
                    {s.expected_codes.length > 0 && <span className="text-fg-muted">{s.expected_codes.map(reasonLabel).join(', ')}</span>}
                  </div>
                </Td>
                <Td align="right">
                  <div className="flex justify-end gap-1">
                    <ButtonLink kind="ghost" href={`/api/samples/${s.file}/pdf`} target="_blank" rel="noreferrer">View</ButtonLink>
                    <Button onClick={() => run(s.file)} disabled={!!busy}>{busy === s.file ? 'Starting…' : 'Run'}</Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Page>
    </>
  )
}
