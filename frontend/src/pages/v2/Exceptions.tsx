import { useNavigate, useSearchParams } from 'react-router-dom'
import { usePoll } from '../../app/data'
import { age, dateTime, money, plural } from '../../app/format'
import { reasonLabel } from '../../app/labels'
import { Page, PageHeader } from '../../components/v2/shell'
import { Badge, Dash, EmptyState, Stack, Table, Tabs, Td, Th, Tr } from '../../components/v2/ui'
import { api } from '../../lib/api'

type TabKey = 'open' | 'resolved'

export default function Exceptions() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as TabKey) || 'open'
  const { data } = usePoll(() => api.runs(), 5000)
  const runs = data?.runs ?? []
  const open = runs.filter(r => r.review_status === 'pending')
  const resolved = runs.filter(r => r.review_status === 'approved' || r.review_status === 'rejected')
    .sort((a, b) => String(b.reviewed_at).localeCompare(String(a.reviewed_at)))
  const rows = tab === 'open' ? open : resolved
  const total = rows.reduce((a, r) => a + (r.total ?? 0), 0)

  return (
    <>
      <PageHeader title="Exceptions" />
      <Page>
        <div className="space-y-3">
          <Tabs<TabKey> value={tab} onChange={t => setParams(t === 'open' ? {} : { tab: t }, { replace: true })}
            tabs={[{ key: 'open', label: 'Open', count: open.length }, { key: 'resolved', label: 'Resolved', count: resolved.length }]} />

          {rows.length === 0 ? (
            <div className="rounded-panel border border-line bg-surface">
              <EmptyState>{!data ? 'Loading…' : tab === 'open' ? 'No open exceptions.' : 'No resolved exceptions.'}</EmptyState>
            </div>
          ) : tab === 'open' ? (
            <Table footer={`${plural(rows.length, 'exception')} · ${money(total)} on hold`}>
              <thead><tr><Th>Vendor</Th><Th>Invoice no.</Th><Th>PO</Th><Th align="right">Amount</Th><Th>Reason</Th><Th>Received</Th><Th align="right">Age</Th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <Tr key={r.id} onClick={() => nav(`/invoices/${r.id}`)}>
                    <Td className="whitespace-nowrap">{r.vendor_name ?? r.filename}</Td>
                    <Td className="tabular-nums">{r.invoice_number ?? <Dash />}</Td>
                    <Td className="tabular-nums">{r.po_number ?? <Dash />}</Td>
                    <Td numeric>{money(r.total)}</Td>
                    <Td className="whitespace-normal text-fg-muted">{r.reason_codes.map(reasonLabel).join(', ')}</Td>
                    <Td className="whitespace-nowrap text-fg-muted tabular-nums">{dateTime(r.created_at)}</Td>
                    <Td numeric className="text-fg-muted">{age(r.completed_at ?? r.created_at)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <Table footer={plural(rows.length, 'resolved exception')}>
              <thead><tr><Th>Vendor</Th><Th align="right">Amount</Th><Th>Reason</Th><Th>Resolution</Th><Th>Resolved</Th><Th>Note</Th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <Tr key={r.id} onClick={() => nav(`/invoices/${r.id}`)}>
                    <Td className="whitespace-nowrap"><Stack primary={r.vendor_name ?? r.filename} secondary={r.invoice_number} /></Td>
                    <Td numeric>{money(r.total)}</Td>
                    <Td className="whitespace-normal text-fg-muted">{r.reason_codes.map(reasonLabel).join(', ')}</Td>
                    <Td>{r.review_status === 'approved' ? <Badge tone="success">Approved</Badge> : <Badge tone="danger">Rejected</Badge>}</Td>
                    <Td className="whitespace-nowrap text-fg-muted tabular-nums">{dateTime(r.reviewed_at)}</Td>
                    <Td className="max-w-80 truncate text-fg-muted">{r.review_note || <Dash />}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Page>
    </>
  )
}
