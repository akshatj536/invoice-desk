import { BookOpen, Building2, ClipboardList, Files, FileText, Inbox, Settings, TriangleAlert } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { usePoll } from '../../app/data'
import { cx } from '../../app/format'
import { useAppMode } from '../../app/mode'
import { api } from '../../lib/api'
import { useToast } from './ui'

const WORKSPACE = 'Brightline Workspace'

function NavItem({ to, icon: Icon, label, count }: { to: string; icon: typeof Inbox; label: string; count?: number }) {
  return (
    <NavLink to={to}
      className={({ isActive }) => cx('flex h-8 items-center gap-2.5 rounded-control px-2 text-body transition-colors',
        isActive ? 'bg-hover font-medium text-brand' : 'text-fg-muted hover:bg-hover hover:text-fg')}>
      <Icon size={16} strokeWidth={1.75} className="shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {count ? <span className="text-caption font-medium text-fg-subtle tabular-nums">{count}</span> : null}
    </NavLink>
  )
}

function DemoBanner() {
  const toast = useToast()
  const reset = async () => {
    if (!confirm('Reset demo data? This restores the sample POs, vendors and invoice log and clears all invoices.')) return
    await api.reset()
    toast('Demo data reset.')
  }
  return (
    <div className="flex h-8 items-center justify-center gap-1.5 border-b border-line bg-neutral-bg text-table text-fg-muted">
      Demo workspace <span aria-hidden>·</span> sample data <span aria-hidden>·</span>
      <button onClick={reset} className="text-brand hover:underline">Reset</button>
    </div>
  )
}

function DevFooter() {
  const { data } = usePoll(() => api.config(), 60000)
  if (!data) return null
  return (
    <div className="mt-2 space-y-0.5 px-2 font-code text-caption text-fg-subtle">
      <div className="truncate" title={data.model}>{data.model}</div>
      <div className="truncate">{data.store}</div>
    </div>
  )
}

export function AppShell() {
  const { demo, dev } = useAppMode()
  const runs = usePoll(() => api.runs(), 5000)
  const open = runs.data?.stats.pending_review ?? 0

  return (
    <div className="flex min-h-screen flex-col">
      {demo && <DemoBanner />}
      <div className="flex flex-1">
        <div className="w-(--sidebar-width) shrink-0 border-r border-line bg-surface">
        <aside className="sticky top-0 flex h-screen flex-col px-3 py-3">
          <Link to="/inbox" className="mb-4 flex h-8 items-center gap-2 px-2">
            <span className="grid size-5 place-items-center rounded-badge bg-brand text-caption font-semibold text-on-brand">B</span>
            <span className="truncate text-body font-semibold">{WORKSPACE}</span>
          </Link>
          <nav className="flex flex-col gap-0.5" aria-label="Main">
            <NavItem to="/inbox" icon={Inbox} label="Inbox" />
            <NavItem to="/exceptions" icon={TriangleAlert} label="Exceptions" count={open} />
            <NavItem to="/invoices" icon={FileText} label="Invoices" />
            <NavItem to="/purchase-orders" icon={ClipboardList} label="Purchase orders" />
            <NavItem to="/vendors" icon={Building2} label="Vendors" />
          </nav>
          {demo && (
            <nav className="mt-6 flex flex-col gap-0.5" aria-label="Demo">
              <div className="px-2 pb-1 text-caption font-medium text-fg-subtle">Demo</div>
              <NavItem to="/demo/samples" icon={Files} label="Sample invoices" />
              <NavItem to="/demo/how-it-works" icon={BookOpen} label="How it works" />
            </nav>
          )}
          <div className="mt-auto">
            <NavItem to="/settings" icon={Settings} label="Settings" />
            {dev && <DevFooter />}
          </div>
        </aside>
        </div>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/** Page header: breadcrumb + title (+ badge, meta) on the left, actions on the right. */
export function PageHeader({ title, crumbs, badge, meta, actions }: {
  title: ReactNode; crumbs?: { label: string; to?: string }[]; badge?: ReactNode; meta?: ReactNode; actions?: ReactNode
}) {
  return (
    <header className="flex min-h-(--header-height) items-center justify-between gap-4 border-b border-line bg-surface px-(--page-gutter) py-3">
      <div className="min-w-0">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-0.5 flex items-center gap-1.5 text-table text-fg-subtle">
            {crumbs.map((c, i) => (
              <Fragment key={i}>
                {i > 0 && <span aria-hidden>/</span>}
                {c.to ? <Link to={c.to} className="hover:text-fg">{c.label}</Link> : <span>{c.label}</span>}
              </Fragment>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-2.5">
          <h1 className="truncate text-title font-semibold">{title}</h1>
          {badge}
        </div>
        {meta && <div className="mt-0.5 text-table text-fg-muted">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="space-y-6 px-(--page-gutter) py-6">{children}</div>
}
