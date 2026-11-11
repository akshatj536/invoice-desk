import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { usePoll } from '../../app/data'
import { dateTime, money, moneyCompact, ms, pct, plural } from '../../app/format'
import { reasonLabel, statusOf } from '../../app/labels'
import { useAppMode } from '../../app/mode'
import { Page, PageHeader } from '../../components/v2/shell'
import { Badge, Dash, EmptyState, Input, KpiStrip, Reasons, Select, Stack, Table, Tabs, Td, Th, Tr } from '../../components/v2/ui'
import { api, type RunSummary } from '../../lib/api'

type TabKey = 'all' | 'auto' | 'hold' | 'rejected' | 'resolved' | 'posted'
const TABS: { key: TabKey; label: string; fn: (r: RunSummary) => boolean }[] = [
  { key: 'all', label: 'All', fn: () => true },
  { key: 'auto', label: 'Auto-approved', fn: r => r.decision === 'APPROVE' },
  { key: 'hold', label: 'On hold', fn: r => r.review_status === 'pending' },
  { key: 'rejected', label: 'Rejected', fn: r => r.decision === 'REJECT' },
  { key: 'resolved', label: 'Resolved', fn: r => r.review_status === 'approved' || r.review_status === 'rejected' },
]
const RANGES = { all: 'All time', today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days' } as const
type Range = keyof typeof RANGES

function inRange(ts: string | null | undefined, range: Range): boolean {
  if (range === 'all' || !ts) return true
  const t = new Date(ts).getTime()
  if (range === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); return t >= d.getTime() }
  return t >= Date.now() - (range === '7d' ? 7 : 30) * 86400000
}

function ReasonsPanel({ reasons }: { reasons: Record<string, number> }) {
  const [open, setOpen] = useState(false)
  const items = Object.entries(reasons)
  const max = Math.max(1, ...items.map(([, n]) => n))
  if (!items.length) return null
  return (
    <section className="rounded-panel border border-line bg-surface">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="flex h-11 w-full items-center gap-2 px-4 text-left text-section font-semibold">
        {open ? <ChevronDown size={16} className="text-fg-subtle" /> : <ChevronRight size={16} className="text-fg-subtle" />}
        Exception reasons
        <span className="text-table font-normal text-fg-subtle">{plural(items.reduce((a, [, n]) => a + n, 0), 'occurrence')}</span>
      </button>
      {open && (
        <ul className="space-y-2 border-t border-line px-4 py-4">
          {items.map(([code, n]) => (
            <li key={code} className="grid grid-cols-[200px_1fr_40px] items-center gap-3 text-table">
              <span className="truncate text-fg-muted">{reasonLabel(code)}</span>
              <span className="h-2 rounded-r-badge bg-data-track"><span className="block h-2 rounded-r-badge bg-data" style={{ width: `${(n / max) * 100}%` }} /></span>
              <span className="text-right tabular-nums">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function Invoices() {
  const nav = useNavigate()
  const { dev } = useAppMode()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as TabKey) || 'all'
  const setTab = (t: TabKey) => setParams(t === 'all' ? {} : { tab: t }, { replace: true })
  const [q, setQ] = useState('')
  const [range, setRange] = useState<Range>('all')
  const runsQ = usePoll(() => api.runs(), d => (d?.stats.running ? 2000 : 6000))
  const recordsQ = usePoll(() => api.records(), 10000)
  const s = runsQ.data?.stats
  const runs = runsQ.data?.runs ?? []
  const log = recordsQ.data?.invoice_log ?? []

  const needle = q.trim().toLowerCase()
  const match = (...fields: (string | null | undefined)[]) => !needle || fields.some(f => f?.toLowerCase().includes(needle))
  const filteredRuns = useMemo(() => runs.filter(r => inRange(r.created_at, range) && match(r.vendor_name, r.invoice_number, r.po_number, r.filename)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runs, range, needle])
  const filteredLog = useMemo(() => log.filter((e: any) => inRange(e.processed_at, range) && match(e.vendor_name, e.invoice_number, e.po_number)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [log, range, needle])

  const tabs = [...TABS.map(t => ({ key: t.key, label: t.label, count: filteredRuns.filter(t.fn).length })),
    { key: 'posted' as TabKey, label: 'Posted', count: filteredLog.length }]
  const rows = tab === 'posted' ? [] : filteredRuns.filter(TABS.find(t => t.key === tab)!.fn)
  const runIds = new Set(runs.map(r => r.id))

  return (
    <>
      <PageHeader title="Invoices" />
      <Page>
        {s && (
          <KpiStrip items={[
            { label: 'Processed', value: s.completed },
            { label: 'Auto-approved', value: pct(s.auto_approval_rate), sub: `${s.auto_approved} of ${s.completed}` },
            { label: 'Open exceptions', value: s.pending_review, sub: `${moneyCompact(s.value_held)} on hold` },
            { label: 'Rejected', value: s.rejected },
            { label: 'Value approved', value: moneyCompact(s.value_approved) },
          ]} />
        )}

        <div className="space-y-3">
          <Tabs<TabKey> tabs={tabs} value={tab} onChange={setTab} />
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search invoices" className="w-60 pl-8" aria-label="Search" />
            </div>
            <Select value={range} onChange={e => setRange(e.target.value as Range)} aria-label="Date range">
              {Object.entries(RANGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>

          {tab !== 'posted' ? (
            rows.length === 0 ? (
              <div className="rounded-panel border border-line bg-surface"><EmptyState>{runsQ.data ? 'No invoices match.' : 'Loading…'}</EmptyState></div>
            ) : (
              <Table footer={`${plural(rows.length, 'invoice')} · ${money(rows.reduce((a, r) => a + (r.total ?? 0), 0))}`}>
                <thead><tr>
                  <Th>Received</Th><Th>Vendor</Th><Th>PO</Th><Th align="right">Amount</Th><Th>Status</Th><Th>Reason</Th>
                  {dev && <Th align="right">Time</Th>}
                </tr></thead>
                <tbody>
                  {rows.map(r => {
                    const st = statusOf(r)
                    return (
                      <Tr key={r.id} onClick={() => nav(`/invoices/${r.id}`)}>
                        <Td className="whitespace-nowrap text-fg-muted tabular-nums">{dateTime(r.created_at)}</Td>
                        <Td className="whitespace-nowrap"><Stack primary={r.vendor_name ?? r.filename} secondary={r.invoice_number} /></Td>
                        <Td>{r.po_number ? <>{r.po_number}{r.po_inferred && <span className="ml-1.5 text-fg-subtle">suggested</span>}</> : <Dash />}</Td>
                        <Td numeric>{r.total != null ? money(r.total) : <Dash />}</Td>
                        <Td><Badge tone={st.tone} processing={st.processing}>{st.label}</Badge></Td>
                        <Td><Reasons labels={(r.reason_codes ?? []).map(reasonLabel)} /></Td>
                        {dev && <Td numeric className="font-code text-caption text-fg-subtle">{ms(r.duration_ms)}</Td>}
                      </Tr>
                    )
                  })}
                </tbody>
              </Table>
            )
          ) : filteredLog.length === 0 ? (
            <div className="rounded-panel border border-line bg-surface"><EmptyState>No posted invoices.</EmptyState></div>
          ) : (
            <Table footer={`${plural(filteredLog.length, 'posted invoice')} · ${money(filteredLog.reduce((a: number, e: any) => a + (e.total ?? 0), 0))}`}>
              <thead><tr><Th>Posted</Th><Th>Vendor</Th><Th>PO</Th><Th align="right">Subtotal</Th><Th align="right">Total</Th><Th>Note</Th></tr></thead>
              <tbody>
                {filteredLog.map((e: any) => (
                  <Tr key={e.run_id} onClick={runIds.has(e.run_id) ? () => nav(`/invoices/${e.run_id}`) : undefined}>
                    <Td className="whitespace-nowrap text-fg-muted tabular-nums">{dateTime(e.processed_at)}</Td>
                    <Td><Stack primary={e.vendor_name} secondary={e.invoice_number} /></Td>
                    <Td>{e.po_number || <Dash />}</Td>
                    <Td numeric>{money(e.subtotal)}</Td>
                    <Td numeric>{money(e.total)}</Td>
                    <Td className="max-w-80 truncate text-fg-muted">{e.note ? String(e.note).replace(' - ', ' · ') : <Dash />}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>

        {s && <ReasonsPanel reasons={s.reasons} />}
      </Page>
    </>
  )
}
