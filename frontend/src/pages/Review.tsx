import { ArrowRight, Check, Inbox, LoaderCircle, UserCheck, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Btn, Empty, OutcomeChip, PageTitle } from '../components/ui'
import { api, type RunSummary } from '../lib/api'
import { ago, cx, money, timeOfDay } from '../lib/format'
import { reasonLabel } from '../lib/reasons'

function ReviewCard({ r, onDone }: { r: RunSummary; onDone: () => void }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const act = async (a: 'approve' | 'reject') => {
    setBusy(a); setErr(null)
    try { await api.review(r.id, a, note); onDone() } catch (e) { setErr(String(e)); setBusy(null) }
  }
  return (
    <article className="sheet relative overflow-hidden animate-rise">
      <div className="absolute inset-y-0 left-0 w-1.5 bg-hold-mark" />
      <div className="grid gap-5 p-5 pl-7 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="font-display text-[21px] font-semibold">{r.vendor_name}</h3>
            <span className="font-mono text-[12.5px] text-ink-2">{r.invoice_number}</span>
            <span className="font-mono text-[12.5px] font-semibold tnum">{money(r.total)}</span>
            {r.po_number && <span className="font-mono text-[12px] text-ink-3">{r.po_number}{r.po_inferred ? ' (suggested)' : ''}</span>}
            <span className="font-mono text-[11px] text-ink-3">held {ago(r.completed_at)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {r.reason_codes.map(c => <span key={c} className="rounded-full bg-hold-bg px-2.5 py-0.5 font-mono text-[10.5px] font-semibold text-hold">{reasonLabel(c)}</span>)}
          </div>
          <p className="mt-3 text-[14px] leading-relaxed text-ink">{r.explanation}</p>
          {r.next_action && <p className="mt-2 flex gap-2 text-[13.5px] text-ink-2"><ArrowRight size={15} className="mt-0.5 shrink-0" />{r.next_action}</p>}
          <Link to={`/runs/${r.id}`} className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-accent hover:underline">See every check <ArrowRight size={12} /></Link>
        </div>
        <div className="rounded-xl bg-paper-2/70 p-3.5">
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
            placeholder="Note for the audit trail"
            className="w-full resize-none rounded-lg border border-rule-2 bg-card px-3 py-2 text-[13.5px] placeholder:text-ink-3 focus:border-ink focus:outline-none" />
          <div className="mt-2 flex gap-2">
            <Btn kind="approve" className="flex-1" onClick={() => act('approve')} disabled={!!busy || !r.can_approve}
              title={r.can_approve ? 'Records exactly what the run computed' : 'No confirmed PO / line match to record'}>
              {busy === 'approve' ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} Approve &amp; record
            </Btn>
            <Btn kind="reject" onClick={() => act('reject')} disabled={!!busy}>
              {busy === 'reject' ? <LoaderCircle size={15} className="animate-spin" /> : <X size={15} />} Reject
            </Btn>
          </div>
          {!r.can_approve && <p className="mt-2 text-[12px] text-ink-3">No confirmed PO match - this one can only be rejected.</p>}
          {err && <p className="mt-2 text-[12px] text-reject">{err}</p>}
        </div>
      </div>
    </article>
  )
}

export default function Review() {
  const [runs, setRuns] = useState<RunSummary[] | null>(null)
  const load = useCallback(() => api.runs().then(d => setRuns(d.runs)).catch(() => {}), [])
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t) }, [load])

  const pending = (runs ?? []).filter(r => r.review_status === 'pending')
  const resolved = (runs ?? []).filter(r => r.review_status === 'approved' || r.review_status === 'rejected')

  return (
    <div>
      <PageTitle eyebrow="Human in the loop" title="Review queue">
        Invoices the rules held for a person. Approving records <i>exactly</i> what the run computed - the PO, the quantities and the
        amount - and logs your note. Nothing is ever paid from a hold without someone deciding.
      </PageTitle>

      {runs && pending.length === 0 && (
        <div className="sheet"><Empty icon={<Inbox size={30} />} title="Nothing waiting">Every held invoice has been resolved.</Empty></div>
      )}
      <div className="space-y-4">{pending.map(r => <ReviewCard key={r.id} r={r} onDone={load} />)}</div>

      {resolved.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-3 border-b border-ink pb-2 font-display text-[22px] font-semibold">Resolved</h2>
          <div className="sheet divide-y divide-rule">
            {resolved.map(r => (
              <Link key={r.id} to={`/runs/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-paper-2/60">
                <UserCheck size={15} className={cx(r.review_status === 'approved' ? 'text-approve' : 'text-reject')} />
                <span className="font-medium">{r.vendor_name}</span>
                <span className="font-mono text-[12px] text-ink-3">{r.invoice_number}</span>
                <span className="font-mono text-[12px] tnum">{money(r.total)}</span>
                <OutcomeChip run={r} />
                <span className="flex-1 truncate text-[12.5px] italic text-ink-2">{r.review_note ? `“${r.review_note}”` : ''}</span>
                <span className="font-mono text-[11px] text-ink-3">{timeOfDay(r.reviewed_at)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
