/** Formatting rules from docs/DESIGN.md §6. */

export function money(x: number | null | undefined): string {
  if (x === null || x === undefined || Number.isNaN(x)) return '–'
  const s = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(Math.abs(x))
  return x < 0 ? `-${s}` : s
}

export function moneyCompact(x: number | null | undefined): string {
  if (x === null || x === undefined) return '–'
  if (Math.abs(x) >= 1_000_000) return `$${(x / 1_000_000).toFixed(2)}M`
  if (Math.abs(x) >= 100_000) return `$${(x / 1000).toFixed(1)}k`
  return money(x)
}

export function pct(x: number | null | undefined): string {
  if (x === null || x === undefined) return '–'
  return `${(x * 100).toFixed(1)}%`
}

function toDate(v: string | null | undefined): Date | null {
  if (!v) return null
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00`) : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Tables: "Nov 11, 10:08" this year, "Nov 11, 2025" otherwise. */
export function dateTime(v: string | null | undefined): string {
  const d = toDate(v)
  if (!d) return '–'
  if (d.getFullYear() === new Date().getFullYear()) {
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Detail pages: "Nov 11, 2026". */
export function date(v: string | null | undefined): string {
  const d = toDate(v)
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '–'
}

/** Age columns: "12m", "5h", "3d". */
export function age(v: string | null | undefined): string {
  const d = toDate(v)
  if (!d) return '–'
  const m = Math.max(0, (Date.now() - d.getTime()) / 60000)
  if (m < 60) return `${Math.max(1, Math.floor(m))}m`
  if (m < 1440) return `${Math.floor(m / 60)}h`
  return `${Math.floor(m / 1440)}d`
}

/** "First Pacific Bank ••0093" (server already masks to ••••0093). */
export function bank(name: string | null | undefined, masked: string | null | undefined): string {
  const last4 = String(masked ?? '').replace(/\D/g, '').slice(-4)
  if (!last4) return '–'
  return `${name ? `${name} ` : ''}••${last4}`
}

export function last4(v: string | null | undefined): string {
  const d = String(v ?? '').replace(/\D/g, '').slice(-4)
  return d ? `••${d}` : '–'
}

export function ms(v: number | null | undefined): string {
  if (v === null || v === undefined) return '–'
  return v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(1)} s`
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
