import { ArrowLeft, ArrowRight, Check, ExternalLink, FileText, Hourglass, LoaderCircle, Minus, Sparkles, UserCheck, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { StageBody } from '../components/StageDetails'
import { Btn, CheckRow, StageTag, Stamp } from '../components/ui'
import { orderFor, useRunStream, type StageState } from '../hooks/useRunStream'
import { api, type Check as CheckT, type RunSummary } from '../lib/api'
import { cx, money, secs, timeOfDay } from '../lib/format'
import { DECISION_META, reasonLabel, STAGE_BLURB } from '../lib/reasons'

function stageTone(s: StageState): 'fail' | 'warn' | 'ok' | null {
  if (s.status === 'failed') return 'fail'
  if (s.status !== 'done') return null
  if (s.key === 'review') return s.data?.action === 'reject' ? 'fail' : 'ok'
  if (s.checks.some(c => c.status === 'fail')) return 'fail'
  if (s.checks.some(c => c.status === 'warn')) return 'warn'
  return 'ok'
}

function Node({ s, live, waiting }: { s: StageState; live: boolean; waiting: boolean }) {
  const tone = stageTone(s)
  if (waiting) return <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-hold bg-hold-bg text-hold animate-pulse-dot"><Hourglass size={13} /></span>
  if (s.status === 'running') return <span className={cx('grid h-7 w-7 place-items-center rounded-full border-2 border-ink bg-marker', live && 'live-node')}><LoaderCircle size={14} className="animate-spin" /></span>
  if (s.status === 'pending') return <span className="h-7 w-7 rounded-full border-2 border-rule-2 bg-card" />
  if (s.status === 'skipped') return <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-dashed border-rule-2 bg-card text-ink-3"><Minus size={13} /></span>
  if (s.key === 'review') return <span className={cx('grid h-7 w-7 place-items-center rounded-full text-white animate-thump [--stamp-rot:0deg]', tone === 'fail' ? 'bg-reject' : 'bg-approve')}><UserCheck size={14} strokeWidth={2.6} /></span>
  if (tone === 'fail') return <span className="grid h-7 w-7 place-items-center rounded-full bg-reject text-white animate-thump [--stamp-rot:0deg]"><X size={14} strokeWidth={3} /></span>
  if (tone === 'warn') return <span className="grid h-7 w-7 place-items-center rounded-full bg-hold-mark text-ink animate-thump [--stamp-rot:0deg] font-mono text-[13px] font-bold">!</span>
  return <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-paper animate-thump [--stamp-rot:0deg]"><Check size={14} strokeWidth={3} /></span>
}

function Timeline({ order, stages, selected, onSelect, live, run }: {
  order: { key: string; title: string }[]; stages: Record<string, StageState>; selected: string; onSelect: (k: string) => void; live: boolean; run: RunSummary
}) {
  return (
    <ol className="relative">
      {order.map((o, i) => {
        const s = stages[o.key]
        const isSel = selected === o.key
        const waiting = o.key === 'review' && s.status !== 'done' && run.review_status === 'pending' && !live
        const llmMs = s.llm_calls.reduce((a, c) => a + (c.latency_ms || 0), 0)
        const fails = s.checks.filter(c => c.status === 'fail').length
        const reached = s.status === 'done' || s.status === 'skipped' || s.status === 'failed'
        return (
          <li key={o.key} className="relative">
            {i < order.length - 1 && (
              <span className={cx('absolute left-[13px] top-9 h-[calc(100%-26px)] w-[2px]', reached ? 'bg-ink' : waiting ? 'bg-hold/40' : 'bg-rule-2')} />
            )}
            <button onClick={() => onSelect(o.key)}
              className={cx('relative flex w-full gap-3 rounded-xl px-2 py-2.5 text-left transition', isSel ? 'marker-wash' : 'hover:bg-paper-2/70',
                s.status === 'pending' && !waiting && 'opacity-60')}>
              <Node s={s} live={live} waiting={waiting} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-mono text-[10.5px] text-ink-3">{String(i + 1).padStart(2, '0')}</span>
                  <span className="font-semibold text-[14.5px]">{o.title}</span>
                  <StageTag stage={o.key} afterReview={s.updatedAfterReview && s.status === 'done'} />
                  {s.updatedAfterReview && s.status === 'done' && (
                    <span className="rounded-full bg-paper-2 px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-wider text-ink-2">updated after review</span>
                  )}
                </div>
                <div className="mt-0.5 text-[12.5px] leading-snug text-ink-2">
                  {waiting ? <span className="font-medium text-hold">Waiting for a person - approve or reject above</span>
                    : s.status === 'done' || s.status === 'failed' ? <span className="line-clamp-2">{s.status === 'failed' ? s.error : s.summary}</span>
                    : s.status === 'running' ? <span className="italic">{s.progress.at(-1) ?? 'Working'}<span className="animate-pulse">…</span></span>
                    : s.status === 'skipped' ? <span className="text-ink-3">Skipped - {s.reason}</span>
                    : <span className="text-ink-3">{STAGE_BLURB[o.key]}</span>}
                </div>
                {(s.duration_ms != null || llmMs > 0 || fails > 0) && o.key !== 'review' && (
                  <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-[10.5px] text-ink-3">
                    {s.duration_ms != null && <span className="tnum">{secs(s.duration_ms)}</span>}
                    {llmMs > 0 && <span className="inline-flex items-center gap-1 text-ai"><Sparkles size={10} />{s.llm_calls.length} model call{s.llm_calls.length > 1 ? 's' : ''}</span>}
                    {fails > 0 && <span className="text-reject">{fails} issue{fails > 1 ? 's' : ''}</span>}
                  </div>
                )}
                {o.key === 'review' && s.status === 'done' && (
                  <div className="mt-1 font-mono text-[10.5px] text-ink-3">{s.data?.reviewer} · {timeOfDay(s.data?.at)}</div>
                )}
              </div>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function Elapsed({ from }: { from: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(t) }, [])
  return <span className="tnum">{((now - new Date(from).getTime()) / 1000).toFixed(1)} s</span>
}

function ReviewBox({ run, onDone }: { run: RunSummary; onDone: () => void }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const act = async (a: 'approve' | 'reject') => {
    setBusy(a); setErr(null)
    try { await api.review(run.id, a, note); onDone() }
    catch (e) { setErr(String(e)); setBusy(null) }
  }
  return (
    <div className="mt-5 rounded-xl border border-hold/40 bg-hold-bg/50 p-4">
      <div className="mb-2 flex items-center gap-2 font-semibold text-hold"><UserCheck size={16} /> Your call</div>
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
        placeholder="Note for the audit trail, e.g. “Called vendor on file number - bank change confirmed”"
        className="w-full resize-none rounded-lg border border-rule-2 bg-card px-3 py-2 text-[13.5px] placeholder:text-ink-3 focus:border-ink focus:outline-none" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Btn kind="approve" onClick={() => act('approve')} disabled={!!busy || !run.can_approve}
          title={run.can_approve ? 'Records exactly what the run computed' : 'No confirmed PO / line match to record'}>
          {busy === 'approve' ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} Approve &amp; record
        </Btn>
        <Btn kind="reject" onClick={() => act('reject')} disabled={!!busy}>
          {busy === 'reject' ? <LoaderCircle size={15} className="animate-spin" /> : <X size={15} />} Reject
        </Btn>
        {!run.can_approve && <span className="text-[12px] text-ink-3">No confirmed PO match - can only be rejected.</span>}
      </div>
      {err && <p className="mt-2 text-[12.5px] text-reject">{err}</p>}
    </div>
  )
}

function DecisionPanel({ run, live, current, stages, allChecks, onReviewed }: {
  run: RunSummary; live: boolean; current: string | null; stages: Record<string, StageState>; allChecks: CheckT[]; onReviewed: () => void
}) {
  const finished = run.decision && (run.status === 'completed' || run.status === 'error')
  const reviewing = live && finished && run.review_status === 'pending'   // post-review updates are playing
  if (!finished || (live && !reviewing)) {
    const cur = current ? stages[current] : null
    return (
      <div className="sheet relative overflow-hidden p-6">
        <div className="ledger-rules pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative flex items-start justify-between gap-6">
          <div>
            <div className="eyebrow mb-1 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-accent animate-pulse-dot" /> Processing · <Elapsed from={run.created_at} /></div>
            <div className="font-display text-[26px] font-semibold leading-tight">{cur ? cur.title : 'Starting'}…</div>
            <p className="mt-1 text-[14px] italic text-ink-2">{cur?.progress.at(-1) ?? (cur ? STAGE_BLURB[cur.key] : 'Opening the file')}</p>
          </div>
          <div className="stamp hidden shrink-0 border-dashed text-[20px] leading-none text-rule-2 sm:flex" style={{ outlineStyle: 'dashed' }}>Pending</div>
        </div>
      </div>
    )
  }
  const resolved = run.review_status === 'approved' || run.review_status === 'rejected'
  const final = (resolved ? run.final_decision : run.decision)!
  const m = DECISION_META[final]
  const sys = DECISION_META[run.decision!]
  const fails = allChecks.filter(c => c.status === 'fail')
  const title = resolved ? (run.review_status === 'approved' ? 'Approved after review' : 'Rejected after review') : m.title
  return (
    <div className="sheet relative overflow-hidden animate-rise">
      <div className={cx('h-1.5', m.mark)} />
      <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div className={cx('eyebrow mb-1', m.text)}>
            {resolved ? <>Rules: <span className={sys.text}>{run.decision}</span> → a person: {final} · {timeOfDay(run.reviewed_at)}</>
              : <>Decision · {secs(run.duration_ms)} · {fails.length ? `${fails.length} issue${fails.length > 1 ? 's' : ''}` : 'all checks passed'}</>}
          </div>
          <h2 className="font-display text-[28px] font-semibold leading-tight">{title}</h2>
          {reviewing && <p className="mt-1 flex items-center gap-2 text-[13.5px] italic text-ink-2"><LoaderCircle size={14} className="animate-spin" /> Updating the pipeline with your decision…</p>}
          {resolved && (
            <div className={cx('mt-3 flex gap-2 rounded-lg border px-3.5 py-2.5 text-[14px]', run.review_status === 'approved' ? 'border-approve/30 bg-approve-bg/60' : 'border-reject/30 bg-reject-bg/60')}>
              <UserCheck size={17} className="mt-0.5 shrink-0" />
              <span><b>{run.review_status === 'approved' ? 'Approved' : 'Rejected'} on review</b>{run.review_note ? <> - “{run.review_note}”</> : ' (no note)'}
                {run.review_status === 'approved' ? ' · recorded in the invoice log and against the PO.' : ' · nothing recorded.'}</span>
            </div>
          )}
          {resolved && <div className="eyebrow mt-4">Why the rules held it</div>}
          <p className={cx('text-[15.5px] leading-relaxed text-ink', resolved ? 'mt-1 text-ink-2' : 'mt-2')}>{run.explanation}</p>
          {run.next_action && (
            <div className="mt-3 flex gap-2 rounded-lg bg-paper-2 px-3.5 py-2.5 text-[14px]"><ArrowRight size={17} className="mt-0.5 shrink-0" /><span><b>Next:</b> {run.next_action}</span></div>
          )}
          {run.reason_codes.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {run.reason_codes.map(c => <span key={c} className={cx('rounded-full px-2.5 py-1 font-mono text-[10.5px] font-semibold', sys.bg, sys.text)}>{reasonLabel(c)}</span>)}
            </div>
          )}
          {run.review_status === 'pending' && !reviewing && <ReviewBox run={run} onDone={onReviewed} />}
        </div>
        <div className="flex items-start justify-center md:pt-2 md:pr-2">
          <div className="relative">
            <Stamp key={final} decision={final} />
            {resolved && (
              <div className="absolute -bottom-11 -left-6 opacity-70">
                <Stamp decision={run.decision!} size="sm" rot={6} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RunView() {
  const { id } = useParams()
  const { run, actPreview, stages, live, current, error, pullNew } = useRunStream(id)
  const [selected, setSelected] = useState('ingest')
  const [follow, setFollow] = useState(true)
  const justReviewed = useRef(false)

  const order = useMemo(() => orderFor(run), [run])
  const allChecks = useMemo(() => order.flatMap(o => stages[o.key].checks), [order, stages])

  useEffect(() => { if (follow && current) setSelected(current) }, [current, follow])
  useEffect(() => {
    if (live || !run?.decision) return
    if (justReviewed.current) {           // after a review: land on what the decision changed
      justReviewed.current = false
      setSelected('act'); setFollow(false)
      return
    }
    if (follow) {
      const firstBad = order.find(o => o.key !== 'review' && stages[o.key].checks.some(c => c.status === 'fail'))
      setSelected(run.review_status === 'pending' ? (firstBad?.key ?? 'review') : firstBad ? firstBad.key : 'act')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, run?.decision, run?.review_status])

  if (error) return <div className="sheet p-6 text-reject">Could not load run: {error}</div>
  if (!run || !id) return <div className="flex items-center gap-2 text-ink-2"><LoaderCircle className="animate-spin" size={16} /> Loading run…</div>

  const sel = stages[selected] ?? stages.ingest
  const idx = Math.max(0, order.findIndex(o => o.key === sel.key))
  const go = (k: string) => { setSelected(k); setFollow(false) }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link to="/runs" className="mb-1 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-ink-3 hover:text-ink"><ArrowLeft size={12} /> All runs</Link>
          <h1 className="font-display text-[30px] font-semibold leading-tight tracking-tight">
            {run.invoice_number ? <>{run.invoice_number} <span className="text-ink-3">·</span> <span className="italic text-ink-2">{run.vendor_name}</span></> : run.filename}
          </h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-ink-3">
            <span><FileText size={11} className="mr-1 inline" />{run.filename}</span>
            <span>run {run.id}</span>
            <span>started {timeOfDay(run.created_at)}</span>
            {run.total != null && <span>total {money(run.total)}</span>}
            {run.po_number && <span>{run.po_number}{run.po_inferred ? ' (suggested)' : ''}</span>}
            {run.kind && <span>{run.kind}</span>}
          </div>
        </div>
        <a href={`/api/runs/${id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-rule-2 bg-card px-3 py-2 text-[13px] font-semibold hover:border-ink">
          Open invoice PDF <ExternalLink size={13} /></a>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="sheet p-3">
            <div className="flex items-center justify-between px-2 pb-2 pt-1">
              <div className="eyebrow">Process · {order.length} steps</div>
              {live ? <span className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wider text-accent"><span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-dot" />live</span>
                : run.review_status === 'pending' ? <span className="font-mono text-[10.5px] uppercase tracking-wider text-hold">awaiting review</span>
                : <span className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">{secs(run.duration_ms)}</span>}
            </div>
            <Timeline order={order} stages={stages} selected={sel.key} live={live} run={run} onSelect={go} />
          </div>
          {!follow && live && (
            <button onClick={() => setFollow(true)} className="mt-2 w-full rounded-lg py-1.5 font-mono text-[11px] uppercase tracking-wider text-accent hover:bg-accent-soft">Follow live step</button>
          )}
        </aside>

        <div className="min-w-0 space-y-6">
          <DecisionPanel run={run} live={live} current={current} stages={stages} allChecks={allChecks}
            onReviewed={() => { justReviewed.current = true; setFollow(true); pullNew() }} />

          <section className="sheet">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-rule px-5 py-4">
              <div>
                <div className="eyebrow mb-1">Step {idx + 1} of {order.length}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-[22px] font-semibold leading-tight">{sel.title}</h2>
                  <StageTag stage={sel.key} afterReview={sel.updatedAfterReview && sel.status === 'done'} />
                  {sel.updatedAfterReview && sel.status === 'done' && (
                    <span className="rounded-full bg-paper-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-2">updated after review</span>
                  )}
                </div>
                <p className="mt-0.5 text-[13px] text-ink-2">{STAGE_BLURB[sel.key]}</p>
              </div>
              <div className="flex items-center gap-1">
                <button disabled={idx === 0} onClick={() => go(order[idx - 1].key)} className="rounded-lg px-2 py-1 font-mono text-[12px] text-ink-2 hover:bg-paper-2 disabled:opacity-30">← prev</button>
                <button disabled={idx === order.length - 1} onClick={() => go(order[idx + 1].key)} className="rounded-lg px-2 py-1 font-mono text-[12px] text-ink-2 hover:bg-paper-2 disabled:opacity-30">next →</button>
              </div>
            </header>
            <div key={sel.key + (sel.updatedAfterReview ? '-r' : '')} className="px-5 py-5 animate-rise">
              <StageBody s={sel} runId={id} allChecks={allChecks} run={run} actPreview={actPreview} />
            </div>
          </section>

          {!live && allChecks.length > 0 && (
            <details className="sheet group">
              <summary className="flex cursor-pointer items-center justify-between px-5 py-3.5">
                <span className="font-display text-[18px] font-semibold">Full audit trail · {allChecks.length} checks</span>
                <span className="font-mono text-[11px] text-ink-3 group-open:hidden">show</span>
              </summary>
              <div className="divide-y divide-rule border-t border-rule px-5">
                {order.map(o => stages[o.key].checks.length > 0 && (
                  <div key={o.key} className="py-2">
                    <div className="eyebrow pt-2">{o.title}</div>
                    {stages[o.key].checks.map((c: CheckT) => <CheckRow key={c.id} c={c} compact />)}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}
