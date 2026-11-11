export function money(x: number | null | undefined, currency = 'USD'): string {
  if (x === null || x === undefined || Number.isNaN(x)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(x)
}

export function moneyShort(x: number | null | undefined): string {
  if (x === null || x === undefined) return '—'
  if (Math.abs(x) >= 1_000_000) return `$${(x / 1_000_000).toFixed(1)}M`
  if (Math.abs(x) >= 10_000) return `$${(x / 1000).toFixed(1)}k`
  return money(x)
}

export function secs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

export function parseTs(ts: string | null | undefined): Date | null {
  if (!ts) return null
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? null : d
}

export function timeOfDay(ts: string | null | undefined): string {
  const d = parseTs(ts)
  return d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'
}

export function ago(ts: string | null | undefined): string {
  const d = parseTs(ts)
  if (!d) return '—'
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000)
  if (s < 60) return `${Math.floor(s)}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return d.toLocaleDateString()
}

export function pct(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined) return '—'
  return `${(x * 100).toFixed(digits)}%`
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
