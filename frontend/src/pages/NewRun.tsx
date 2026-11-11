import { ArrowRight, Eye, FileText, LoaderCircle, Play, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DecisionChip, PageTitle } from '../components/ui'
import { api, type Sample } from '../lib/api'
import { cx, money } from '../lib/format'
import { reasonLabel } from '../lib/reasons'

const GROUPS: { key: Sample['group']; title: string; blurb: string }[] = [
  { key: 'happy', title: 'Happy path', blurb: 'A clean invoice that should sail through and update the records.' },
  { key: 'edge', title: 'Edge cases we designed', blurb: "Invoices that look fine to a tired human on a Friday - each one is a way to pay money you don't owe." },
  { key: 'brief', title: 'Messy inputs from the brief', blurb: 'Scanned PDFs, missing PO numbers, price drift, unapproved vendors, documents that are not invoices.' },
]

export default function NewRun() {
  const nav = useNavigate()
  const [samples, setSamples] = useState<Sample[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { api.samples().then(setSamples).catch(e => setErr(String(e))) }, [])

  const start = async (fn: () => Promise<{ id: string }>, key: string) => {
    setBusy(key); setErr(null)
    try { const { id } = await fn(); nav(`/runs/${id}`) }
    catch (e) { setErr(String(e)); setBusy(null) }
  }
  const onFiles = (files: FileList | null) => {
    const f = files?.[0]
    if (f) start(() => api.upload(f), 'upload')
  }

  return (
    <div>
      <PageTitle eyebrow="Accounts payable · invoice processing"
        title={<>Drop an invoice.<br /><span className="italic text-ink-2">Watch every check happen.</span></>}>
        The model <b className="font-semibold text-ink">reads</b> the PDF. Rules <b className="font-semibold text-ink">decide</b> - against your
        purchase orders, vendor file and payment history. Only an approval <b className="font-semibold text-ink">writes</b> to the spreadsheet.
      </PageTitle>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <label
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files) }}
          className={cx('sheet group relative flex min-h-[230px] cursor-pointer flex-col items-center justify-center overflow-hidden border-2 border-dashed px-8 py-10 text-center transition animate-rise',
            drag ? 'border-accent bg-accent-soft' : 'border-rule-2 hover:border-ink')}>
          <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={e => onFiles(e.target.files)} />
          <div className="ledger-rules pointer-events-none absolute inset-0 opacity-40" />
          <div className="relative">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-ink text-paper transition group-hover:-rotate-6">
              {busy === 'upload' ? <LoaderCircle className="animate-spin" /> : <Upload />}
            </div>
            <div className="font-display text-2xl font-semibold">Drop a vendor invoice PDF</div>
            <p className="mt-1 text-[14px] text-ink-2">Digital or scanned. Or <span className="underline underline-offset-2">browse</span> for a file.</p>
            <p className="mt-4 font-mono text-[11px] text-ink-3">PDF · up to 15 MB · nothing is written unless it is approved</p>
          </div>
        </label>

        <div className="sheet p-6 animate-rise [animation-delay:80ms]">
          <div className="eyebrow mb-3">What happens to every invoice</div>
          <ol className="space-y-2.5">
            {[
              ['Read', 'Gemini reads every field - vendor, PO, lines, totals, bank details.', 'ai'],
              ['Validate', 'Is it really an invoice? Do its own numbers add up?', 'rules'],
              ['Match', 'Approved vendor? Bank details on file? Which purchase order?', 'rules'],
              ['Reconcile', "Quantity left, price tolerance, running total, already paid?", 'rules'],
              ['Decide', 'Worst result wins: Reject > Hold > Approve.', 'rules'],
              ['Record', 'Approvals update the PO and invoice log. Holds go to a person.', 'io'],
            ].map(([t, d, k], i) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 font-mono text-[11px] text-ink-3 tnum">{String(i + 1).padStart(2, '0')}</span>
                <div className="text-[13.5px] leading-snug">
                  <span className="font-semibold">{t}</span>{' '}
                  <span className={cx('mr-1 rounded px-1 py-[1px] font-mono text-[9px] uppercase tracking-wider',
                    k === 'ai' ? 'bg-ai-bg text-ai' : k === 'rules' ? 'bg-accent-soft text-accent' : 'bg-paper-2 text-ink-2')}>
                    {k === 'ai' ? 'AI' : k === 'rules' ? 'rules' : 'code'}</span>
                  <span className="text-ink-2">{d}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {err && <div className="mt-4 rounded-lg bg-reject-bg px-4 py-2 text-[13px] text-reject">{err}</div>}

      <div className="mt-14 space-y-12">
        {GROUPS.map((g, gi) => {
          const items = samples.filter(s => s.group === g.key)
          if (!items.length) return null
          return (
            <section key={g.key} className="animate-rise" style={{ animationDelay: `${120 + gi * 80}ms` }}>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-ink pb-2">
                <h2 className="font-display text-[24px] font-semibold">{g.title}</h2>
                <p className="text-[13.5px] text-ink-2">{g.blurb}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {items.map(s => (
                  <article key={s.file} className="sheet group flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <span className="font-mono text-[11px] text-ink-3">{s.file.split('_')[0]}</span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="font-mono text-[9.5px] uppercase tracking-wider text-ink-3">expect</span>
                        <DecisionChip decision={s.expected_decision} small />
                      </span>
                    </div>
                    <h3 className="font-display text-[19px] font-semibold leading-snug">{s.title}</h3>
                    <p className="mt-1.5 flex-1 text-[13.5px] leading-relaxed text-ink-2">{s.story}</p>
                    {s.expected_codes.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {s.expected_codes.map(c => (
                          <span key={c} className="rounded bg-paper-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-2">{reasonLabel(c)}</span>
                        ))}
                      </div>
                    )}
                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-dashed border-rule pt-3">
                      <div className="min-w-0 text-[12px] leading-tight">
                        <div className="truncate text-ink-2"><FileText size={12} className="mr-1 inline" />{s.vendor}</div>
                        <div className="font-mono text-ink-3 tnum">{s.invoice_number} · {money(s.total)}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <a href={`/api/samples/${s.file}/pdf`} target="_blank" rel="noreferrer" title="Preview PDF"
                          className="grid h-9 w-9 place-items-center rounded-lg text-ink-2 hover:bg-paper-2"><Eye size={16} /></a>
                        <button onClick={() => start(() => api.runSample(s.file), s.file)} disabled={!!busy}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-paper transition hover:bg-accent disabled:opacity-40">
                          {busy === s.file ? <LoaderCircle size={15} className="animate-spin" /> : <Play size={14} />} Run
                          <ArrowRight size={14} className="-mr-0.5 transition group-hover:translate-x-0.5" />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
