import { ChevronDown, ChevronRight, ExternalLink, RotateCcw } from 'lucide-react'
import { Fragment, useCallback, useEffect, useState } from 'react'
import { Btn, PageTitle } from '../components/ui'
import { api, type Records as RecordsT } from '../lib/api'
import { cx, money } from '../lib/format'

const TABS = [
  { key: 'pos', label: 'Purchase orders', sheet: 'POs' },
  { key: 'vendors', label: 'Vendors', sheet: 'Vendors' },
  { key: 'log', label: 'Invoice log', sheet: 'Invoice_Log' },
] as const

function Meter({ value, total }: { value: number; total: number }) {
  const r = total ? value / total : 0
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-paper-2">
        <div className={cx('h-full rounded-r-[4px]', r > 1.0001 ? 'bg-reject-mark' : 'bg-chart')} style={{ width: `${Math.min(100, r * 100)}%` }} />
      </div>
      <span className="font-mono text-[11.5px] tnum">{money(value)}</span>
    </div>
  )
}

export default function Records() {
  const [d, setD] = useState<RecordsT | null>(null)
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('pos')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(() => api.records().then(r => { setD(r); setErr(null) }).catch(e => setErr(String(e))), [])
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t) }, [load])

  const reset = async () => {
    if (!confirm('Reset demo data? This restores the seed POs, vendors and invoice log, and clears run history.')) return
    await api.reset(); load()
  }
  const vendorName = (id: string) => d?.vendors.find(v => v.vendor_id === id)?.legal_name ?? id
  const sheetUrl = d?.tab_urls?.[TABS.find(t => t.key === tab)!.sheet] ?? d?.sheet_url

  return (
    <div>
      <PageTitle eyebrow={`System of record · ${d?.source ?? ''}`} title="Records"
        action={<div className="flex gap-2">
          {sheetUrl && <a href={sheetUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-ink px-3.5 py-2 text-[13.5px] font-semibold text-paper hover:bg-accent">Open Google Sheet <ExternalLink size={14} /></a>}
          <Btn kind="outline" onClick={reset}><RotateCcw size={14} /> Reset demo data</Btn>
        </div>}>
        The spreadsheet the process reads from and writes to. Only approvals change it: a row in the invoice log, and the PO's billed amounts.
      </PageTitle>
      {err && <div className="mb-4 rounded-lg bg-reject-bg px-4 py-2 text-[13px] text-reject">{err}</div>}

      <div className="sheet">
        <div className="flex gap-1 border-b border-rule px-3 pt-3">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cx('-mb-px rounded-t-lg border border-b-0 px-4 py-2 text-[13.5px] font-medium',
                tab === t.key ? 'border-rule bg-card text-ink' : 'border-transparent text-ink-3 hover:text-ink')}>
              {t.label}
              <span className="ml-1.5 font-mono text-[11px] text-ink-3">{t.key === 'pos' ? d?.pos.length : t.key === 'vendors' ? d?.vendors.length : d?.invoice_log.length}</span>
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          {tab === 'pos' && d && (
            <table className="w-full min-w-[860px] text-[13px]">
              <thead><tr className="text-left font-mono text-[10px] uppercase tracking-wider text-ink-3">
                <th className="w-8"></th><th className="px-2 py-2.5">PO</th><th className="px-2 py-2.5">Vendor</th><th className="px-2 py-2.5">Description</th>
                <th className="px-2 py-2.5 text-right">Total</th><th className="px-2 py-2.5">Billed so far</th><th className="px-2 py-2.5 text-right">Left</th><th className="px-4 py-2.5">Status</th></tr></thead>
              <tbody>
                {d.pos.map(p => {
                  const isOpen = open.has(p.po_number)
                  return (
                    <Fragment key={p.po_number}>
                      <tr className="cursor-pointer border-t border-rule hover:bg-paper-2/60"
                        onClick={() => setOpen(s => { const n = new Set(s); isOpen ? n.delete(p.po_number) : n.add(p.po_number); return n })}>
                        <td className="pl-3 text-ink-3">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                        <td className="px-2 py-2.5 font-mono font-semibold">{p.po_number}</td>
                        <td className="px-2 py-2.5">{vendorName(p.vendor_id)}</td>
                        <td className="px-2 py-2.5 text-ink-2">{p.description}</td>
                        <td className="px-2 py-2.5 text-right font-mono text-[12px] tnum">{money(p.total)}</td>
                        <td className="px-2 py-2.5"><Meter value={p.amount_invoiced} total={p.total} /></td>
                        <td className="px-2 py-2.5 text-right font-mono text-[12px] tnum">{money(p.remaining)}</td>
                        <td className="px-4 py-2.5"><span className={cx('rounded px-1.5 py-0.5 font-mono text-[10px] uppercase', p.status === 'open' ? 'bg-approve-bg text-approve' : 'bg-paper-2 text-ink-3')}>{p.status}</span></td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-paper-2/40"><td></td><td colSpan={7} className="px-2 pb-3">
                          <table className="w-full text-[12.5px]"><thead><tr className="text-left font-mono text-[9.5px] uppercase tracking-wider text-ink-3">
                            <th className="py-1.5">#</th><th>Code</th><th>Description</th><th className="text-right">Ordered</th><th className="text-right">Received</th><th className="text-right">Billed</th><th className="text-right">Left</th><th className="text-right">Unit price</th></tr></thead>
                            <tbody className="font-mono tnum">{p.lines.map((l: any) => (
                              <tr key={l.line_no} className="border-t border-dashed border-rule">
                                <td className="py-1">{l.line_no}</td><td className="text-ink-3">{l.sku}</td><td className="font-sans">{l.description}</td>
                                <td className="text-right">{l.qty_ordered}</td><td className="text-right">{l.qty_received}</td><td className="text-right">{l.qty_invoiced}</td>
                                <td className="text-right">{l.qty_remaining}</td><td className="text-right">{money(l.unit_price)}</td></tr>))}
                            </tbody></table>
                        </td></tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}

          {tab === 'vendors' && d && (
            <table className="w-full min-w-[860px] text-[13px]">
              <thead><tr className="text-left font-mono text-[10px] uppercase tracking-wider text-ink-3">
                <th className="px-4 py-2.5">ID</th><th className="px-2 py-2.5">Legal name</th><th className="px-2 py-2.5">Also known as</th><th className="px-2 py-2.5">Bank on file</th>
                <th className="px-2 py-2.5">Phone on file</th><th className="px-2 py-2.5">Approved</th><th className="px-4 py-2.5">Notes</th></tr></thead>
              <tbody>{d.vendors.map(v => (
                <tr key={v.vendor_id} className="border-t border-rule align-top">
                  <td className="px-4 py-2.5 font-mono text-[12px]">{v.vendor_id}</td>
                  <td className="px-2 py-2.5 font-medium">{v.legal_name}</td>
                  <td className="px-2 py-2.5 text-[12px] text-ink-2">{v.aliases.join(' · ')}</td>
                  <td className="px-2 py-2.5 font-mono text-[12px]">{v.bank_account} <span className="text-ink-3">rtg {v.bank_routing}</span></td>
                  <td className="px-2 py-2.5 font-mono text-[12px]">{v.phone_on_file}</td>
                  <td className="px-2 py-2.5"><span className={cx('rounded px-1.5 py-0.5 font-mono text-[10px] uppercase', v.approved ? 'bg-approve-bg text-approve' : 'bg-reject-bg text-reject')}>{v.approved ? 'yes' : 'no'}</span></td>
                  <td className="px-4 py-2.5 text-[12px] text-ink-2">{v.notes}</td>
                </tr>))}
              </tbody>
            </table>
          )}

          {tab === 'log' && d && (
            <table className="w-full min-w-[860px] text-[13px]">
              <thead><tr className="text-left font-mono text-[10px] uppercase tracking-wider text-ink-3">
                <th className="px-4 py-2.5">Processed</th><th className="px-2 py-2.5">Invoice</th><th className="px-2 py-2.5">Vendor</th><th className="px-2 py-2.5">Invoice date</th>
                <th className="px-2 py-2.5">PO</th><th className="px-2 py-2.5 text-right">Subtotal</th><th className="px-2 py-2.5 text-right">Total</th><th className="px-4 py-2.5">Note</th></tr></thead>
              <tbody>{d.invoice_log.map(e => (
                <tr key={e.run_id} className={cx('border-t border-rule', !e.run_id.startsWith('seed') && 'bg-approve-bg/30')}>
                  <td className="px-4 py-2.5 font-mono text-[11.5px] text-ink-3">{String(e.processed_at).replace('T', ' ').slice(0, 16)}</td>
                  <td className="px-2 py-2.5 font-mono text-[12px] font-semibold">{e.invoice_number}</td>
                  <td className="px-2 py-2.5">{e.vendor_name}</td>
                  <td className="px-2 py-2.5 font-mono text-[12px]">{e.invoice_date}</td>
                  <td className="px-2 py-2.5 font-mono text-[12px]">{e.po_number}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-[12px] tnum">{money(e.subtotal)}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-[12px] tnum">{money(e.total)}</td>
                  <td className="px-4 py-2.5 text-[12px] text-ink-2">{e.note}</td>
                </tr>))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
