import { Bot, Calculator, FileSpreadsheet, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PageTitle, StageTag } from '../components/ui'
import { STAGE_ORDER } from '../hooks/useRunStream'
import { api, type AppConfig } from '../lib/api'
import { cx, money } from '../lib/format'
import { REASONS, STAGE_BLURB } from '../lib/reasons'

const EDGE = [
  { t: 'A perfect invoice with new bank details', q: 'Is the money going to the right place?', d: 'Everything matches the PO, but the remit-to account differs from the vendor file. The happy path would pay a fraudster. Held, with instructions to verify on the phone number on file.' },
  { t: "The vendor's own maths is wrong", q: 'Are the numbers on the invoice right?', d: 'Lines add to $3,840, subtotal says $3,940. One careful re-read tells a model misread from a real vendor error before holding.' },
  { t: 'Same bill, new number', q: 'Have we already paid this?', d: 'INV-2041 re-sent as INV-2041-R. Exact-number checks miss it; matching vendor + amount + lines + date window catches it.' },
  { t: 'Split invoices that add up to more than the order', q: 'Are we paying more than we agreed?', d: 'Each bill is fine alone; together they exceed the PO. Quantity is checked against what is left, and tolerance applies once per PO, not per invoice.' },
]

export default function HowItWorks() {
  const [cfg, setCfg] = useState<AppConfig | null>(null)
  useEffect(() => { api.config().then(setCfg).catch(() => {}) }, [])
  const p = cfg?.policy

  return (
    <div className="space-y-14">
      <PageTitle eyebrow="Design notes" title={<>The model reads.<br /><span className="italic text-ink-2">Code decides. Code writes.</span></>}>
        AP decisions must be repeatable and explainable. So the model is used only where language is genuinely messy - reading documents,
        matching wordings, explaining - and every approve / hold / reject is made by plain rules you can read below.
      </PageTitle>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { Icon: Sparkles, t: 'The model reads', c: 'bg-ai-bg text-ai', d: 'Turns any PDF - digital or scanned, any layout - into fixed fields with a confidence level. Pairs line items whose wording differs. Suggests a PO when none is printed. Writes the plain-English note.' },
          { Icon: Calculator, t: 'Rules decide', c: 'bg-accent-soft text-accent', d: 'Every check returns pass / note / fail with evidence. Worst result wins. Same invoice, same decision, every time - and anything unexpected becomes a hold, never an approval.' },
          { Icon: FileSpreadsheet, t: 'Code writes', c: 'bg-paper-2 text-ink', d: 'Only an approval touches the spreadsheet: one invoice-log row, the PO\'s billed amount and line quantities. Writes are keyed to the run, so a retry never double-books.' },
        ].map(x => (
          <div key={x.t} className="sheet p-5">
            <span className={cx('grid h-10 w-10 place-items-center rounded-xl', x.c)}><x.Icon size={19} /></span>
            <h3 className="mt-3 font-display text-[21px] font-semibold">{x.t}</h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{x.d}</p>
          </div>
        ))}
      </div>

      <section>
        <h2 className="mb-4 border-b border-ink pb-2 font-display text-[26px] font-semibold">Eight steps</h2>
        <ol className="grid gap-x-8 gap-y-4 md:grid-cols-2">
          {STAGE_ORDER.map((s, i) => (
            <li key={s.key} className="flex gap-4">
              <span className="font-display text-[34px] font-semibold leading-none text-rule-2 tnum">{i + 1}</span>
              <div>
                <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-[15px]">{s.title}</span><StageTag stage={s.key} /></div>
                <p className="text-[13.5px] text-ink-2">{STAGE_BLURB[s.key]}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-4 border-b border-ink pb-2 font-display text-[26px] font-semibold">The four edge cases we designed</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {EDGE.map((e, i) => (
            <div key={e.t} className="sheet p-5">
              <div className="eyebrow">Edge case {i + 1} · {e.q}</div>
              <h3 className="mt-1 font-display text-[19px] font-semibold">{e.t}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{e.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[360px_1fr]">
        <div>
          <h2 className="mb-4 border-b border-ink pb-2 font-display text-[26px] font-semibold">Policy</h2>
          {p && (
            <dl className="sheet divide-y divide-rule px-5">
              {[
                ['Unit price tolerance', `up to +${(p.price_tolerance_pct * 100).toFixed(0)}% over PO price`],
                ['Running total tolerance', `all invoices on a PO ≤ PO total + ${(p.running_total_tolerance_pct * 100).toFixed(0)}%`],
                ['Rounding allowance', `${money(p.rounding_tolerance)} on any sum`],
                ['Duplicate window', `${p.near_duplicate_window_days} days, same vendor + amount + lines`],
                ['Currency', `${p.base_currency} only; others are held`],
                ['Model', cfg?.model ?? ''],
                ['System of record', cfg?.store ?? ''],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2.5 text-[13px]"><dt className="text-ink-3">{k}</dt><dd className="text-right font-mono text-[12px]">{v}</dd></div>
              ))}
            </dl>
          )}
          <h3 className="mb-2 mt-8 font-display text-[19px] font-semibold">Assumptions</h3>
          <ul className="space-y-1.5 text-[13px] text-ink-2">
            <li>• Two-way match (PO ↔ invoice). Received quantities are stored for a future three-way match.</li>
            <li>• One invoice covers one PO; one invoice per PDF.</li>
            <li>• PO amounts are pre-tax; the invoice subtotal is matched, tax is checked arithmetically.</li>
            <li>• Invoices arrive by upload; an email inbox is a drop-in later.</li>
            <li>• Under-billing is normal (partial delivery); only over-billing is a risk.</li>
          </ul>
        </div>
        <div>
          <h2 className="mb-4 border-b border-ink pb-2 font-display text-[26px] font-semibold">Every reason the rules can give</h2>
          <div className="sheet overflow-hidden">
            <table className="w-full text-[13px]">
              <thead><tr className="bg-paper-2 text-left font-mono text-[10px] uppercase tracking-wider text-ink-3"><th className="px-4 py-2">Reason</th><th className="px-2 py-2">Outcome</th><th className="px-4 py-2">Meaning</th></tr></thead>
              <tbody>{Object.entries(REASONS).map(([code, r]) => (
                <tr key={code} className="border-t border-rule align-top">
                  <td className="px-4 py-2"><div className="font-medium">{r.label}</div><div className="font-mono text-[10px] text-ink-3">{code}</div></td>
                  <td className="px-2 py-2"><span className={cx('rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold', r.outcome === 'REJECT' ? 'bg-reject-bg text-reject' : 'bg-hold-bg text-hold')}>{r.outcome}</span></td>
                  <td className="px-4 py-2 text-ink-2">{r.what}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 flex items-center gap-2 text-[12.5px] text-ink-3"><Bot size={14} /> Adding an edge case = adding one check with its own severity. The decision rule never changes.</p>
        </div>
      </section>
    </div>
  )
}
