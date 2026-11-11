import { BookOpen, Database, Inbox, LayoutList, ScanText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { api, type AppConfig } from '../lib/api'
import { cx } from '../lib/format'

const NAV = [
  { to: '/', label: 'Process', icon: ScanText, end: true },
  { to: '/runs', label: 'Runs', icon: LayoutList },
  { to: '/review', label: 'Review', icon: Inbox, badge: true },
  { to: '/records', label: 'Records', icon: Database },
  { to: '/how', label: 'How it works', icon: BookOpen },
]

export default function Layout() {
  const [cfg, setCfg] = useState<AppConfig | null>(null)
  const [pending, setPending] = useState(0)

  useEffect(() => { api.config().then(setCfg).catch(() => {}) }, [])
  useEffect(() => {
    const load = () => api.runs().then(r => setPending(r.stats.pending_review)).catch(() => {})
    load()
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-rule bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1440px] items-center gap-6 px-4 py-3 sm:px-8">
          <NavLink to="/" className="flex items-center gap-2.5 shrink-0">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]"><rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="none" stroke="#f6e27a" strokeWidth="1.6" /><path d="M8 12.5l2.8 2.8L16.5 9" fill="none" stroke="#f6f3ec" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <span className="leading-none">
              <span className="block font-display text-[19px] font-semibold tracking-tight">Invoice Desk</span>
              <span className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-3">Brightline Workspace · AP</span>
            </span>
          </NavLink>

          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {NAV.map(n => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) => cx('relative flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13.5px] font-medium transition',
                  isActive ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-paper-2 hover:text-ink')}>
                <n.icon size={15} strokeWidth={2} />
                {n.label}
                {n.badge && pending > 0 && (
                  <span className="ml-0.5 grid min-w-[18px] place-items-center rounded-full bg-hold-mark px-1 font-mono text-[10px] font-bold text-ink">{pending}</span>
                )}
              </NavLink>
            ))}
          </nav>

          {cfg && (
            <div className="hidden items-center gap-3 font-mono text-[10.5px] text-ink-3 lg:flex">
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-ai" />{cfg.model}</span>
              <span className="text-rule-2">|</span>
              <span className="flex items-center gap-1.5">
                <span className={cx('h-1.5 w-1.5 rounded-full', cfg.store_backend === 'gsheets' ? 'bg-approve-mark' : 'bg-hold-mark')} />
                {cfg.sheet_url ? <a href={cfg.sheet_url} target="_blank" rel="noreferrer" className="hover:text-ink underline-offset-2 hover:underline">{cfg.store}</a> : cfg.store}
              </span>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] px-4 pb-24 pt-8 sm:px-8">
        <Outlet />
      </main>
    </div>
  )
}
