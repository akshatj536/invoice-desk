import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

/**
 * App modes (docs/DESIGN.md §7).
 *   Product (default) - both flags off: what an AP clerk sees.
 *   Demo - sample invoices, reset, How it works, demo banner.
 *   Dev  - model/store info, step tags, timings, run IDs, raw JSON.
 * Defaults come from VITE_DEMO_MODE / VITE_DEV_MODE; Settings overrides persist in localStorage.
 */
export interface AppMode {
  demo: boolean
  dev: boolean
  setDemo: (v: boolean) => void
  setDev: (v: boolean) => void
  resetToDefaults: () => void
}

const KEY = 'invoice-desk.mode'
const envFlag = (v: unknown) => String(v ?? '').toLowerCase() === 'true' || v === '1'
const DEFAULTS = { demo: envFlag(import.meta.env.VITE_DEMO_MODE), dev: envFlag(import.meta.env.VITE_DEV_MODE) }

function load(): { demo: boolean; dev: boolean } {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch { /* storage unavailable: fall back to defaults */ }
  return DEFAULTS
}

function save(v: { demo: boolean; dev: boolean }) {
  try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* ignore */ }
}

const Ctx = createContext<AppMode | null>(null)

export function AppModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState(load)
  const update = useCallback((patch: Partial<{ demo: boolean; dev: boolean }>) => {
    setMode(prev => { const next = { ...prev, ...patch }; save(next); return next })
  }, [])
  const value = useMemo<AppMode>(() => ({
    ...mode,
    setDemo: v => update({ demo: v }),
    setDev: v => update({ dev: v }),
    resetToDefaults: () => { try { localStorage.removeItem(KEY) } catch { /* ignore */ } setMode(DEFAULTS) },
  }), [mode, update])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAppMode(): AppMode {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAppMode must be used inside AppModeProvider')
  return v
}
