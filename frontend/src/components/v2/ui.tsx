/* Invoice Desk v2 primitives. Every value comes from tokens (docs/DESIGN.md §4). */
import { Check, LoaderCircle, Minus, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, type ThHTMLAttributes, type TdHTMLAttributes } from 'react'
import { cx } from '../../app/format'
import type { Tone } from '../../app/labels'

/* ---------------------------------------------------------------- Button */
type BtnKind = 'primary' | 'secondary' | 'ghost' | 'destructive'
export function Button({ kind = 'secondary', children, className, icon, ...rest }: {
  kind?: BtnKind; icon?: ReactNode; children?: ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles: Record<BtnKind, string> = {
    primary: 'bg-brand text-on-brand hover:bg-brand-hover',
    secondary: 'bg-surface text-fg border border-line-strong hover:bg-hover',
    ghost: 'text-fg-muted hover:bg-hover hover:text-fg',
    destructive: 'bg-surface text-danger-fg border border-line-strong hover:bg-danger-bg',
  }
  return (
    <button {...rest}
      className={cx('inline-flex h-(--control-height) items-center justify-center gap-2 rounded-control px-3 text-body font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none', styles[kind], className)}>
      {icon}{children}
    </button>
  )
}

/* ---------------------------------------------------------------- Badge */
const TONE: Record<Tone, string> = {
  success: 'bg-success-bg text-success-fg',
  warning: 'bg-warning-bg text-warning-fg',
  danger: 'bg-danger-bg text-danger-fg',
  neutral: 'bg-neutral-bg text-neutral-fg',
}
export function Badge({ tone = 'neutral', children, processing }: { tone?: Tone; children: ReactNode; processing?: boolean }) {
  return (
    <span className={cx('inline-flex h-5 items-center gap-1 rounded-badge px-2 text-caption font-medium whitespace-nowrap', TONE[tone])}>
      {processing && <LoaderCircle size={12} className="animate-spin" aria-hidden />}{children}
    </span>
  )
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-5 items-center rounded-badge bg-neutral-bg px-2 text-caption font-medium text-neutral-fg whitespace-nowrap">{children}</span>
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <LoaderCircle size={size} className="animate-spin text-fg-subtle" aria-label="Loading" />
}

/* ---------------------------------------------------------------- Panel */
export function Panel({ title, actions, children, className, flush }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; flush?: boolean
}) {
  return (
    <section className={cx('rounded-panel border border-line bg-surface', className)}>
      {(title || actions) && (
        <header className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-4">
          <h2 className="text-section font-semibold">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={flush ? '' : 'p-4'}>{children}</div>
    </section>
  )
}

/* ---------------------------------------------------------------- Table */
export function Table({ children, footer, minWidth = 760 }: { children: ReactNode; footer?: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-clip rounded-panel border border-line bg-surface">
      <table className="w-full border-collapse text-table" style={{ minWidth }}>{children}</table>
      {footer && <div className="flex h-9 items-center border-t border-line px-4 text-table text-fg-subtle tabular-nums">{footer}</div>}
    </div>
  )
}

export function Th({ children, align = 'left', className, ...rest }: { align?: 'left' | 'right' | 'center' } & ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th {...rest} className={cx('sticky top-0 z-10 h-9 border-b border-line bg-surface px-3 text-caption font-medium text-fg-subtle first:pl-4 last:pr-4 whitespace-nowrap',
      align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left', className)}>{children}</th>
  )
}

export function Tr({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <tr onClick={onClick} className={cx('border-b border-line last:border-b-0', onClick && 'cursor-pointer hover:bg-hover', className)}>{children}</tr>
  )
}

export function Td({ children, align = 'left', numeric, className, ...rest }: {
  align?: 'left' | 'right' | 'center'; numeric?: boolean
} & TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td {...rest} className={cx('h-(--row-height) px-3 py-2 align-middle first:pl-4 last:pr-4',
      (numeric || align === 'right') && 'text-right tabular-nums', align === 'center' && 'text-center', className)}>{children}</td>
  )
}

/** Two-line cell: primary text with a muted secondary line. */
export function Stack({ primary, secondary }: { primary: ReactNode; secondary?: ReactNode }) {
  return (
    <div className="leading-tight">
      <div className="text-table text-fg">{primary}</div>
      {secondary && <div className="mt-0.5 text-caption font-normal text-fg-subtle">{secondary}</div>}
    </div>
  )
}

export function Dash() {
  return <span className="text-fg-disabled">–</span>
}

/* ---------------------------------------------------------------- Tabs */
export function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: { key: T; label: string; count?: number }[]; value: T; onChange: (k: T) => void
}) {
  return (
    <div className="flex gap-5 border-b border-line" role="tablist">
      {tabs.map(t => {
        const active = t.key === value
        return (
          <button key={t.key} role="tab" aria-selected={active} onClick={() => onChange(t.key)}
            className={cx('-mb-px flex h-(--control-height) items-center gap-1.5 border-b-2 text-body font-medium transition-colors',
              active ? 'border-brand text-fg' : 'border-transparent text-fg-muted hover:text-fg')}>
            {t.label}
            {t.count !== undefined && <span className={cx('text-caption tabular-nums', active ? 'text-fg' : 'text-fg-subtle')}>{t.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------------------------------------------------------- KPI strip */
export function KpiStrip({ items }: { items: { label: string; value: ReactNode; sub?: ReactNode }[] }) {
  return (
    <div className="grid rounded-panel border border-line bg-surface" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((k, i) => (
        <div key={k.label} className={cx('px-4 py-3', i > 0 && 'border-l border-line')}>
          <div className="text-caption font-medium text-fg-subtle">{k.label}</div>
          <div className="mt-1 text-figure font-semibold tabular-nums">{k.value}</div>
          {k.sub && <div className="text-caption text-fg-subtle">{k.sub}</div>}
        </div>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------- Empty state */
export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center text-body text-fg-muted">
      <div>{children}</div>
      {action}
    </div>
  )
}

/* ---------------------------------------------------------------- Field list */
export function Fields({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-line">{children}</dl>
}
export function Field({ label, children, numeric }: { label: ReactNode; children: ReactNode; numeric?: boolean }) {
  return (
    <div className="flex min-h-9 items-center gap-4 py-1.5">
      <dt className="w-40 shrink-0 text-table text-fg-subtle">{label}</dt>
      <dd className={cx('min-w-0 flex-1 text-table text-fg', numeric && 'tabular-nums')}>{children}</dd>
    </div>
  )
}

/* ---------------------------------------------------------------- Match icon */
export function MatchIcon({ ok, label }: { ok: boolean | null; label?: string }) {
  if (ok === null) return <Minus size={16} className="inline text-fg-disabled" aria-label={label ?? 'Not checked'} />
  return ok
    ? <Check size={16} className="inline text-success-fg" aria-label={label ?? 'Match'} />
    : <X size={16} className="inline text-danger-fg" aria-label={label ?? 'Mismatch'} />
}

/* ---------------------------------------------------------------- Inputs */
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx('h-(--control-height) rounded-control border border-line-strong bg-surface px-3 text-body text-fg outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft', props.className)} />
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx('h-(--control-height) rounded-control border border-line-strong bg-surface px-2 text-body text-fg outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft', props.className)} />
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx('min-h-16 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-body text-fg outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft', props.className)} />
}
export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="mb-1.5 block text-table font-medium text-fg">{children}</label>
}

/* ---------------------------------------------------------------- Switch */
export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id: string }) {
  return (
    <button id={id} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cx('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-brand' : 'bg-line-strong')}>
      <span className={cx('absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-surface transition-transform', checked && 'translate-x-4')} />
    </button>
  )
}

/* ---------------------------------------------------------------- Modal */
export function Modal({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/30 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.stopPropagation()}
        className="w-full max-w-md rounded-panel border border-line bg-surface shadow-popover">
        <header className="flex h-12 items-center border-b border-line px-4 text-section font-semibold">{title}</header>
        <div className="p-4">{children}</div>
        <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</footer>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Toast */
type ToastFn = (msg: string) => void
const ToastCtx = createContext<ToastFn>(() => {})
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const show = useCallback<ToastFn>(m => setMsg(m), [])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 4000)
    return () => clearTimeout(t)
  }, [msg])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div role="status" className="fixed bottom-6 right-6 z-50 rounded-panel border border-line bg-surface px-4 py-3 text-body shadow-popover">{msg}</div>
      )}
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)
