import { Ban, CircleCheck, CircleMinus, CircleX, Hourglass, LoaderCircle, Sparkles, TriangleAlert, UserCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Check, CheckStatus, Decision, RunSummary } from '../lib/api'
import { cx } from '../lib/format'
import { DECISION_META, reasonLabel, STAGE_KIND } from '../lib/reasons'

export function Stamp({ decision, size = 'lg', rot = -7 }: { decision: Decision; size?: 'sm' | 'lg'; rot?: number }) {
  const m = DECISION_META[decision]
  return (
    <div className={cx('stamp animate-thump', m.text, size === 'lg' ? 'text-[26px] leading-none' : 'text-[13px] leading-none !px-3 !py-1.5')}
      style={{ ['--stamp-rot' as any]: `${rot}deg` }} aria-label={`Decision: ${m.stamp}`}>
      <span>{m.stamp}</span>
      {size === 'lg' && <span className="mt-1.5 text-[9px] tracking-[0.3em] opacity-80">AP · Invoice Desk</span>}
    </div>
  )
}

const DECISION_ICON = { APPROVE: CircleCheck, HOLD: Hourglass, REJECT: Ban }

export function DecisionChip({ decision, small }: { decision: Decision | null | undefined; small?: boolean }) {
  if (!decision) return <span className="text-ink-3 text-xs">—</span>
  const m = DECISION_META[decision]
  const Icon = DECISION_ICON[decision]
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full font-mono font-semibold uppercase tracking-wider',
      m.bg, m.text, small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]')}>
      <Icon size={small ? 11 : 13} strokeWidth={2.4} />{m.stamp}
    </span>
  )
}

/** System decision, plus the human outcome if a reviewer resolved it. */
export function OutcomeChip({ run }: { run: RunSummary }) {
  if (run.status === 'running' || run.status === 'queued') {
    return <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-accent">
      <LoaderCircle size={13} className="animate-spin" /> Running
    </span>
  }
  if (run.review_status === 'approved' || run.review_status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <DecisionChip decision={run.decision} small />
        <span className="text-ink-3 text-xs">→</span>
        <span className={cx('inline-flex items-center gap-1 text-[10px] font-mono font-semibold uppercase tracking-wider',
          run.review_status === 'approved' ? 'text-approve' : 'text-reject')}>
          <UserCheck size={12} /> {run.review_status === 'approved' ? 'Approved' : 'Rejected'}
        </span>
      </span>
    )
  }
  return <DecisionChip decision={run.decision} small />
}

const STATUS_ICON: Record<CheckStatus, { Icon: any; cls: string; label: string }> = {
  pass: { Icon: CircleCheck, cls: 'text-approve', label: 'Passed' },
  warn: { Icon: TriangleAlert, cls: 'text-hold', label: 'Note' },
  fail: { Icon: CircleX, cls: 'text-reject', label: 'Failed' },
  skip: { Icon: CircleMinus, cls: 'text-ink-3', label: 'Skipped' },
}

export function CheckRow({ c, compact }: { c: Check; compact?: boolean }) {
  const s = STATUS_ICON[c.status]
  return (
    <div className={cx('flex gap-3', compact ? 'py-2' : 'py-3')}>
      <s.Icon size={18} className={cx('mt-0.5 shrink-0', s.cls)} aria-label={s.label} strokeWidth={2.2} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-[14px] text-ink">{c.label}</span>
          {c.status === 'fail' && c.reason_code && (
            <span className={cx('rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide',
              c.on_fail === 'REJECT' ? 'bg-reject-bg text-reject' : 'bg-hold-bg text-hold')}>
              {c.on_fail} · {reasonLabel(c.reason_code)}
            </span>
          )}
        </div>
        {c.message && <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{c.message}</p>}
      </div>
    </div>
  )
}

export function StageTag({ stage, afterReview }: { stage: string; afterReview?: boolean }) {
  // after a review, Explain is written from the decision itself - no model involved
  const k = afterReview && stage === 'explain' ? { tag: 'Code', kind: 'io' as const } : STAGE_KIND[stage]
  if (!k) return null
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-1.5 py-[1px] font-mono text-[9.5px] font-semibold uppercase tracking-wider',
      k.kind === 'ai' ? 'bg-ai-bg text-ai' : k.kind === 'rules' ? 'bg-accent-soft text-accent' : k.kind === 'human' ? 'bg-hold-bg text-hold' : 'bg-paper-2 text-ink-2')}>
      {k.kind === 'ai' && <Sparkles size={10} />}{k.kind === 'human' && <UserCheck size={10} />}{k.tag}
    </span>
  )
}

export function Card({ children, className, title, eyebrow, action }: { children: ReactNode; className?: string; title?: ReactNode; eyebrow?: string; action?: ReactNode }) {
  return (
    <section className={cx('sheet', className)}>
      {(title || eyebrow || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-3.5">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            {title && <h3 className="font-display text-[19px] font-semibold leading-tight text-ink">{title}</h3>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function KV({ k, v, mono, tone }: { k: string; v: ReactNode; mono?: boolean; tone?: 'bad' | 'good' }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-rule py-1.5 last:border-0">
      <dt className="text-[12.5px] text-ink-3">{k}</dt>
      <dd className={cx('text-right text-[13.5px]', mono && 'font-mono tnum text-[12.5px]',
        tone === 'bad' ? 'text-reject font-semibold' : tone === 'good' ? 'text-approve' : 'text-ink')}>{v ?? '—'}</dd>
    </div>
  )
}

export function Btn({ children, onClick, kind = 'primary', disabled, className, type = 'button', title }: {
  children: ReactNode; onClick?: () => void; kind?: 'primary' | 'ghost' | 'approve' | 'reject' | 'outline'; disabled?: boolean; className?: string; type?: 'button' | 'submit'; title?: string
}) {
  const styles = {
    primary: 'bg-ink text-paper hover:bg-accent',
    ghost: 'text-ink-2 hover:bg-paper-2',
    outline: 'border border-rule-2 text-ink hover:border-ink bg-card',
    approve: 'bg-approve text-white hover:brightness-110',
    reject: 'border border-reject/40 text-reject hover:bg-reject-bg bg-card',
  }[kind]
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title}
      className={cx('inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-[13.5px] font-semibold transition disabled:opacity-40', styles, className)}>
      {children}
    </button>
  )
}

export function ConfidenceDot({ level }: { level?: string }) {
  const map: Record<string, string> = { high: 'bg-approve-mark', medium: 'bg-hold-mark', low: 'bg-reject-mark' }
  if (!level) return null
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase text-ink-3" title={`Read with ${level} confidence`}>
      <span className={cx('h-1.5 w-1.5 rounded-full', map[level])} />{level}
    </span>
  )
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 text-ink-3">{icon}</div>
      <div className="font-display text-xl text-ink">{title}</div>
      {children && <div className="mt-1 max-w-md text-[14px] text-ink-2">{children}</div>}
    </div>
  )
}

export function PageTitle({ eyebrow, title, children, action }: { eyebrow: string; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 animate-rise">
      <div className="max-w-3xl">
        <div className="eyebrow mb-2">{eyebrow}</div>
        <h1 className="font-display text-[34px] font-semibold leading-[1.05] tracking-tight text-ink sm:text-[42px]">{title}</h1>
        {children && <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{children}</p>}
      </div>
      {action}
    </div>
  )
}
