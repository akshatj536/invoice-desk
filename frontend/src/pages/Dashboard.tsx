import { Ban, CircleCheck, Hourglass, LayoutList, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Btn, Empty, OutcomeChip, PageTitle } from '../components/ui'
import { api, type RunSummary, type Stats } from '../lib/api'
import { ago, cx, money, moneyShort, pct, secs } from '../lib/format'
import { REASONS, reasonLabel } from '../lib/reasons'

const FILTERS: { key: string; label: string; fn: (r: RunSummary) => boolean }[] = [
  { key: 'all', label: 'All', fn: () => true },
  { key: 'approve', label: 'Auto-approved', fn: r => r.decision === 'APPROVE' },
  { key: 'hold', label: 'Held', fn: r => r.decision === 'HOLD' },
  { key: 'reject', label: 'Rejected', fn: r => r.decision === 'REJECT' },
  { key: 'pending', label: 'Needs review', fn: r => r.review_status === 'pending' },
  { key: 'resolved', label: 'Resolved by a person', fn: r => r.review_status === 'approved' || r.review_status === 'rejected' },
]

function Tile({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className={cx('sheet flex flex-col justify-between p-4', className)}>
      <div className="eyebrow">{label}</div>
      <div className="mt-3 font-mono text-[26px] font-semibold leading-none tracking-tight tnum">{value}</div>
      {sub && <div className="mt-1.5 text-[12px] text-ink-3">{sub}</div>}
    </div>
  )
}

function DecisionSplit({ s, runs }: { s: Stats; runs: RunSummary[] }) {
  const [hover, setHover] = useState<string | null>(null)
  const total = s.auto_approved + s.held + s.rejected
  const segs = [
    { k: 'Approved', n: s.auto_approved, mark: 'bg-approve-mark', Icon: CircleCheck, text: 'text-approve' },
    { k: 'On hold', n: s.held, mark: 'bg-hold-mark', Icon: Hourglass, text: 'text-hold' },
    { k: 'Rejected', n: s.rejected, mark: 'bg-reject-mark', Icon: Ban, text: 'text-reject' },
  ]
  return (
    <div className="sheet p-5">
      <div className="eyebrow">Decisions the rules made</div>
      <div className="mt-1 text-[13px] text-ink-2">Before any human review · {total} invoice{total === 1 ? '' : 's'}</div>
      <div className="relative mt-5 flex h-5 gap-[2px]">
        {total === 0 && <div className="h-full w-full rounded bg-paper-2" />}
        {segs.filter(g => g.n > 0).map((g, i, arr) => (
          <div key={g.k} onMouseEnter={() => setHover(g.k)} onMouseLeave={() => setHover(null)}
            className={cx('h-full transition-opacity', g.mark, i === 0 && 'rounded-l', i === arr.length - 1 && 'rounded-r', hover && hover !== g.k && 'opacity-40')}
            style={{ width: `${(g.n / total) * 100}%` }} />
        ))}
        {hover && (() => { const g = segs.find(x => x.k === hover)!; return (
          <div className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 font-mono text-[11px] text-paper">
            {g.k}: {g.n} of {total} ({pct(g.n / total)})</div>) })()}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {segs.map(g => (
          <div key={g.k} className="flex items-start gap-2">
            <span className={cx('mt-1 h-2.5 w-2.5 shrink-0 rounded-sm', g.mark)} />
            <div>
              <div className={cx('flex items-center gap-1 text-[12.5px] font-semibold', g.text)}><g.Icon size={12} />{g.k}</div>
              <div className="font-mono text-[12px] text-ink-2 tnum">{g.n} · {total ? pct(g.n / total) : '—'}</div>
            </div>
          </div>
        ))}
      </div>
      <Waiting runs={runs} />
    </div>
  )
}

function Waiting({ runs }: { runs: RunSummary[] }) {
  const pending = runs.filter(r => r.review_status === 'pending').slice(0, 4)
  return (
    <div className="mt-6 border-t border-dashed border-rule pt-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="eyebrow">Waiting for a person</div>
        <Link to="/review" className="font-mono text-[10.5px] uppercase tracking-wider text-accent hover:underline">Review queue →</Link>
      </div>
      {pending.length === 0 ? <p className="text-[13px] text-ink-3">Nothing waiting.</p> : (
        <ul className="space-y-1.5">
          {pending.map(r => (
            <li key={r.id}>
              <Link to={`/runs/${r.id}`} className="flex items-center gap-3 rounded-md px-1.5 py-1 text-[12.5px] hover:bg-paper-2">
                <Hourglass size={12} className="shrink-0 text-hold" />
                <span className="min-w-0 flex-1 truncate"><b className="font-medium">{r.vendor_name}</b> <span className="text-ink-3">· {r.reason_codes.map(reasonLabel).join(', ')}</span></span>
                <span className="font-mono text-[11.5px] tnum">{money(r.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ReasonBars({ reasons }: { reasons: Record<string, number> }) {
  const [hover, setHover] = useState<string | null>(null)
  const items = Object.entries(reasons)
  const max = Math.max(1, ...items.map(([, n]) => n))
  return (
    <div className="sheet p-5">
      <div className="eyebrow">Why invoices were stopped</div>
      <div className="mt-1 text-[13px] text-ink-2">Reasons across held and rejected invoices</div>
      {items.length === 0 ? <p className="mt-6 text-[13px] text-ink-3">Nothing stopped yet.</p> : (
        <div className="mt-4 space-y-2">
          {items.map(([code, n]) => (
            <div key={code} className="relative grid grid-cols-[180px_1fr] items-center gap-3"
              onMouseEnter={() => setHover(code)} onMouseLeave={() => setHover(null)}>
              <span className="truncate text-[12.5px] text-ink-2" title={reasonLabel(code)}>{reasonLabel(code)}</span>
              <div className="flex items-center gap-2">
                <div className={cx('h-2.5 rounded-r-[4px] bg-chart transition-opacity', hover && hover !== code && 'opacity-40')}
                  style={{ width: `${(n / max) * 100}%`, minWidth: 6 }} />
                <span className="font-mono text-[11.5px] text-ink tnum">{n}</span>
              </div>
              {hover === code && (
                <div className="absolute left-[190px] top-5 z-10 w-64 rounded-md bg-ink px-2.5 py-1.5 text-[11.5px] leading-snug text-paper shadow-lg">
                  <b>{reasonLabel(code)}</b> · {n} invoice{n === 1 ? '' : 's'}<br /><span className="opacity-80">{REASONS[code]?.what}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const nav = useNavigate()
  const [data, setData] = useState<{ runs: RunSummary[]; stats: Stats } | null>(null)
  const [filter, setFilter] = useState('all')

  const load = useCallback(() => api.runs().then(setData).catch(() => {}), [])
  useEffect(() => {
    load()
    const t = setInterval(load, 2500)
    return () => clearInterval(t)
  }, [load])

  const reset = async () => {
    if (!confirm('Reset demo data? This restores the seed POs, vendors and invoice log, and clears run history.')) return
    await api.reset(); load()
  }

  const s = data?.stats
  const f = FILTERS.find(x => x.key === filter)!
  const rows = (data?.runs ?? []).filter(f.fn)

  return (
    <div>
      <PageTitle eyebrow="Dashboard · history, status and outputs" title="Runs"
        action={<Btn kind="outline" onClick={reset}><RotateCcw size={14} /> Reset demo data</Btn>}>
        Every invoice processed, what the rules decided, and what a person did about it.
      </PageTitle>

      {s && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6 animate-rise">
            <div className="sheet col-span-2 flex flex-col justify-between bg-ink p-5 text-paper md:col-span-1 xl:col-span-2">
              <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-paper/60">Auto-approval rate</div>
              <div className="mt-2 font-mono text-[56px] font-semibold leading-none tracking-tight tnum">{s.auto_approval_rate == null ? '—' : pct(s.auto_approval_rate)}</div>
              <div className="mt-2 text-[12.5px] text-paper/70">{s.auto_approved} of {s.completed} invoices approved with no person involved</div>
            </div>
            <Tile label="Processed" value={String(s.completed)} sub={s.running ? `${s.running} running now` : `avg ${secs(s.avg_duration_ms)} each`} />
            <Tile label="Needs review" value={String(s.pending_review)} sub={`${moneyShort(s.value_held)} on hold`} />
            <Tile label="Rejected" value={String(s.rejected)} sub="never recorded" />
            <Tile label="Value approved" value={moneyShort(s.value_approved)} sub={s.approved_on_review ? `incl. ${s.approved_on_review} approved on review` : 'recorded to invoice log'} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2 animate-rise [animation-delay:60ms]">
            <DecisionSplit s={s} runs={data?.runs ?? []} />
            <ReasonBars reasons={s.reasons} />
          </div>
        </>
      )}

      <div className="sheet mt-8 animate-rise [animation-delay:120ms]">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-rule px-4 py-3">
          {FILTERS.map(x => {
            const n = (data?.runs ?? []).filter(x.fn).length
            return (
              <button key={x.key} onClick={() => setFilter(x.key)}
                className={cx('rounded-full px-3 py-1 text-[12.5px] font-medium transition', filter === x.key ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-paper-2')}>
                {x.label} <span className="font-mono text-[11px] opacity-60">{n}</span>
              </button>
            )
          })}
        </div>
        {rows.length === 0 ? (
          <Empty icon={<LayoutList size={28} />} title="No runs here yet">
            <Link to="/" className="underline underline-offset-2">Process an invoice</Link> to see it appear.
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-[13px]">
              <thead>
                <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-ink-3">
                  <th className="px-4 py-2.5">When</th><th className="px-2 py-2.5">Invoice</th><th className="px-2 py-2.5">PO</th>
                  <th className="px-2 py-2.5 text-right">Amount</th><th className="px-2 py-2.5">Outcome</th><th className="px-2 py-2.5">Why</th><th className="px-4 py-2.5 text-right">Took</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} onClick={() => nav(`/runs/${r.id}`)} className="cursor-pointer border-t border-rule transition hover:bg-paper-2/60">
                    <td className="px-4 py-3 font-mono text-[11.5px] text-ink-3">{ago(r.created_at)}</td>
                    <td className="px-2 py-3">
                      <div className="font-medium">{r.vendor_name ?? <span className="text-ink-3">reading…</span>}</div>
                      <div className="font-mono text-[11px] text-ink-3">{r.invoice_number ?? r.filename}</div>
                    </td>
                    <td className="px-2 py-3 font-mono text-[12px]">{r.po_number ?? '—'}{r.po_inferred && <span className="ml-1 rounded bg-hold-bg px-1 text-[9.5px] text-hold">suggested</span>}</td>
                    <td className="px-2 py-3 text-right font-mono text-[12px] tnum">{money(r.total)}</td>
                    <td className="px-2 py-3"><OutcomeChip run={r} /></td>
                    <td className="max-w-[260px] px-2 py-3 text-[12.5px] text-ink-2">
                      {r.reason_codes?.length ? r.reason_codes.map(reasonLabel).join(' · ') : r.status === 'completed' ? <span className="text-approve">All checks passed</span> : ''}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[11.5px] text-ink-3 tnum">{secs(r.duration_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
