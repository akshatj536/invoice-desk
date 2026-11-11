import { ArrowRight, CircleCheck, CircleX, ExternalLink, FileSpreadsheet, Fingerprint, Hourglass, Landmark, Sparkles, TriangleAlert, UserCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import type { StageState } from '../hooks/useRunStream'
import type { ActPreview, Check, LlmCall, RunSummary } from '../lib/api'
import { cx, money, secs, timeOfDay } from '../lib/format'
import { reasonLabel } from '../lib/reasons'

import { CheckRow, ConfidenceDot, KV } from './ui'

/* ------------------------------------------------------------------ shared bits */
function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="eyebrow mb-2">{title}</div>
      {children}
    </div>
  )
}

function Checks({ checks }: { checks: Check[] }) {
  if (!checks.length) return null
  return (
    <Section title={`Checks in this step (${checks.length})`}>
      <div className="divide-y divide-rule">{checks.map(c => <CheckRow key={c.id} c={c} />)}</div>
    </Section>
  )
}

export function LlmFootnote({ calls }: { calls: LlmCall[] }) {
  if (!calls?.length) return null
  return (
    <div className="mt-5 space-y-1 border-t border-dashed border-rule pt-3">
      {calls.map((c, i) => (
        <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] text-ink-3">
          <span className="inline-flex items-center gap-1 text-ai"><Sparkles size={11} /> model call: {c.purpose.replace('_', ' ')}</span>
          <span>{c.model}</span>
          <span>{secs(c.latency_ms)}</span>
          {c.thinking && <span>thinking: {c.thinking}</span>}
          {c.input_tokens != null && <span>{c.input_tokens.toLocaleString()} → {c.output_tokens?.toLocaleString()} tokens</span>}
          {c.attempts > 1 && <span className="text-hold">{c.attempts} attempts</span>}
        </div>
      ))}
    </div>
  )
}

function Tick({ ok }: { ok: boolean }) {
  return ok ? <CircleCheck size={15} className="text-approve" /> : <CircleX size={15} className="text-reject" />
}

/* ------------------------------------------------------------------ 1 ingest */
function Ingest({ s }: { s: StageState }) {
  const d = s.data || {}
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Section title="The file">
        <dl>
          <KV k="File" v={d.filename} />
          <KV k="Type" v={d.kind === 'scanned'
            ? <span className="rounded bg-hold-bg px-1.5 py-0.5 text-[12px] text-hold">Scanned image - no text layer</span>
            : <span className="rounded bg-approve-bg px-1.5 py-0.5 text-[12px] text-approve">Digital - has a text layer</span>} />
          <KV k="Pages" v={d.pages} mono />
          <KV k="Size" v={`${d.size_kb} KB`} mono />
          <KV k="Fingerprint (SHA-256)" v={<span className="inline-flex items-center gap-1"><Fingerprint size={12} />{d.sha256}…</span>} mono />
        </dl>
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
          The fingerprint catches the exact same file being sent twice. Digital and scanned PDFs take the same reading path next.
        </p>
      </Section>
      <Section title={`System of record loaded · ${d.source ?? ''}`}>
        <dl>
          <KV k="Vendors" v={d.records?.vendors} mono />
          <KV k="Purchase orders" v={d.records?.pos} mono />
          <KV k="PO lines" v={d.records?.po_lines} mono />
          <KV k="Previously approved invoices" v={d.records?.invoice_log} mono />
        </dl>
      </Section>
    </div>
  )
}

/* ------------------------------------------------------------------ 2 extract */
function Extract({ s, runId }: { s: StageState; runId: string }) {
  const x = s.data?.extraction
  if (!x) return null
  const c = x.confidence || {}
  const mask = (v?: string | null) => (v ? `••••${String(v).replace(/\D/g, '').slice(-4)}` : '—')
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_minmax(320px,0.9fr)]">
      <div className="space-y-6">
        <Section title="Fields read from the document">
          <dl>
            <KV k="Document type" v={<span className={cx(x.doc_type !== 'invoice' && 'font-semibold text-reject')}>{x.doc_type}</span>} />
            <KV k="Vendor" v={<span className="inline-flex items-center gap-2">{x.vendor_name ?? '—'} <ConfidenceDot level={c.vendor_name} /></span>} />
            <KV k="Invoice number" v={<span className="inline-flex items-center gap-2 font-mono text-[12.5px]">{x.invoice_number ?? '—'} <ConfidenceDot level={c.invoice_number} /></span>} />
            <KV k="Invoice date" v={<span className="inline-flex items-center gap-2 font-mono text-[12.5px]">{x.invoice_date ?? '—'} <ConfidenceDot level={c.invoice_date} /></span>} />
            <KV k="PO reference" v={<span className="inline-flex items-center gap-2 font-mono text-[12.5px]">{x.po_reference ?? <i className="font-sans text-ink-3">none printed</i>} <ConfidenceDot level={c.po_reference} /></span>} />
            <KV k="Currency" v={x.currency} mono />
            <KV k="Remit-to account" v={<span className="inline-flex items-center gap-2 font-mono text-[12.5px]">{mask(x.bank_account_number)} {x.bank_routing_number && <span className="text-ink-3">rtg {x.bank_routing_number}</span>}</span>} />
          </dl>
        </Section>
        <Section title={`Line items (${x.line_items.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-ink text-left font-mono text-[10px] uppercase tracking-wider text-ink-3">
                <th className="py-1.5 pr-2">Code</th><th className="py-1.5 pr-2">Description</th><th className="py-1.5 pr-2 text-right">Qty</th><th className="py-1.5 pr-2 text-right">Unit</th><th className="py-1.5 text-right">Amount</th>
              </tr></thead>
              <tbody className="tnum">
                {x.line_items.map((l: any, i: number) => (
                  <tr key={i} className="border-b border-dashed border-rule">
                    <td className="py-1.5 pr-2 font-mono text-[11.5px] text-ink-3">{l.sku ?? '—'}</td>
                    <td className="py-1.5 pr-2">{l.description}</td>
                    <td className="py-1.5 pr-2 text-right font-mono text-[12px]">{l.quantity}</td>
                    <td className="py-1.5 pr-2 text-right font-mono text-[12px]">{money(l.unit_price)}</td>
                    <td className="py-1.5 text-right font-mono text-[12px]">{money(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="font-mono text-[12px] tnum">
                <tr><td colSpan={4} className="pt-2 text-right text-ink-3">Subtotal (as printed)</td><td className="pt-2 text-right">{money(x.subtotal)}</td></tr>
                <tr><td colSpan={4} className="text-right text-ink-3">Tax</td><td className="text-right">{money(x.tax_amount)}</td></tr>
                <tr className="font-semibold"><td colSpan={4} className="text-right">Total due</td><td className="text-right">{money(x.total)}</td></tr>
              </tfoot>
            </table>
          </div>
        </Section>
        {x.reader_notes && (
          <div className="flex gap-2.5 rounded-lg border border-ai/20 bg-ai-bg/60 px-3.5 py-2.5 text-[13px] text-ink">
            <Sparkles size={15} className="mt-0.5 shrink-0 text-ai" />
            <div><span className="font-semibold text-ai">The model noticed: </span>{x.reader_notes}</div>
          </div>
        )}
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          The model is told to copy numbers <b>exactly as printed</b> and never correct them - otherwise it could silently "fix" a vendor's mistake.
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-rule bg-paper-2">
        <iframe title="Invoice PDF" src={`/api/runs/${runId}/pdf#view=FitH&toolbar=0`} className="h-[640px] w-full" />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ 3 validate */
function Validate({ s }: { s: StageState }) {
  const m = s.data?.math
  const rr = s.data?.reread
  const tol = 0.05
  const close = (a?: number | null, b?: number | null) => a != null && b != null && Math.abs(a - b) <= tol
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Checks checks={s.checks} />
      {m && (
        <Section title="The arithmetic">
          <div className="ledger-rules rounded-lg border border-rule bg-card px-4 pt-1 font-mono text-[12.5px] tnum">
            <div className="flex h-8 items-center justify-between"><span className="text-ink-3">Line items add up to</span><span>{money(m.lines_sum)}</span></div>
            <div className="flex h-8 items-center justify-between"><span className="text-ink-3">Subtotal printed</span><span className="flex items-center gap-2">{money(m.subtotal)}<Tick ok={m.subtotal == null || close(m.lines_sum, m.subtotal)} /></span></div>
            <div className="flex h-8 items-center justify-between"><span className="text-ink-3">+ Tax printed</span><span>{money(m.tax)}</span></div>
            <div className="flex h-8 items-center justify-between"><span className="text-ink-3">= Expected total</span><span>{money(m.expected_total)}</span></div>
            <div className="flex h-8 items-center justify-between font-semibold"><span>Total printed</span><span className="flex items-center gap-2">{money(m.total)}<Tick ok={close(m.expected_total, m.total)} /></span></div>
          </div>
          <p className="mt-2 text-[12px] text-ink-3">Differences up to {money(tol)} are treated as rounding.</p>
        </Section>
      )}
      {rr && (
        <div className="lg:col-span-2 rounded-xl border border-hold/30 bg-hold-bg/60 p-4">
          <div className="mb-2 flex items-center gap-2 font-semibold text-hold"><TriangleAlert size={16} /> Bounded re-read</div>
          <p className="text-[13px] text-ink-2">The first reading didn't add up, so the model was asked to read the invoice again with full reasoning - told the exact discrepancy, and told <i>not</i> to make the numbers agree if the document itself is wrong.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2 text-[12.5px]">
            <div><div className="eyebrow mb-1">First reading</div>{rr.first_reading_issues.map((i: string) => <div key={i} className="text-ink">• {i}</div>)}</div>
            <div><div className="eyebrow mb-1">Second reading</div>{rr.second_reading_issues.length ? rr.second_reading_issues.map((i: string) => <div key={i} className="text-ink">• {i}</div>) : <div className="text-approve">Adds up - the first reading was a misread.</div>}</div>
          </div>
          <p className="mt-3 text-[12.5px] font-medium text-ink">
            {rr.second_reading_issues.length ? 'Both readings agree on the printed figures → the error is on the invoice itself.' : 'Corrected reading used from here on.'}
          </p>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ 4 match */
function Match({ s }: { s: StageState }) {
  const d = s.data || {}
  const bank = s.checks.find(c => c.id === 'match.bank')
  const bankBad = bank?.status === 'fail'
  const po = d.po
  const search = d.po_search
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Vendor">
          {d.vendor ? (
            <dl>
              <KV k="Name on invoice" v={d.vendor.name_on_invoice} />
              <KV k="Vendor file" v={<span>{d.vendor.legal_name} <span className="font-mono text-[11px] text-ink-3">{d.vendor.vendor_id}</span></span>} />
              <KV k="Matched by" v={{ exact: 'exact name', alias: 'known alternate name', similar: 'similar name', tax_id: 'tax ID (name differs)' }[d.vendor.method as string]} />
              <KV k="Approved for payment" v={d.vendor.approved ? 'Yes' : 'No'} tone={d.vendor.approved ? 'good' : 'bad'} />
            </dl>
          ) : <p className="text-[13.5px] text-reject">Not found in the vendor file.</p>}
        </Section>
        {bank && bank.status !== 'skip' && (
          <Section title="Bank details - invoice vs vendor file">
            <div className={cx('overflow-hidden rounded-lg border', bankBad ? 'border-reject/40' : 'border-rule')}>
              <table className="w-full text-[13px]">
                <thead><tr className={cx('text-left font-mono text-[10px] uppercase tracking-wider', bankBad ? 'bg-reject-bg text-reject' : 'bg-paper-2 text-ink-3')}>
                  <th className="px-3 py-1.5"></th><th className="px-3 py-1.5">On invoice</th><th className="px-3 py-1.5">On file</th></tr></thead>
                <tbody className="font-mono text-[12.5px] tnum">
                  <tr className="border-t border-rule"><td className="px-3 py-1.5 font-sans text-ink-3">Account</td>
                    <td className={cx('px-3 py-1.5', bank.evidence.invoice_account !== bank.evidence.file_account && 'font-semibold text-reject')}>{bank.evidence.invoice_account}</td>
                    <td className="px-3 py-1.5">{bank.evidence.file_account}</td></tr>
                  <tr className="border-t border-rule"><td className="px-3 py-1.5 font-sans text-ink-3">Routing</td>
                    <td className={cx('px-3 py-1.5', bank.evidence.invoice_routing !== bank.evidence.file_routing && bank.evidence.invoice_routing !== '-' && 'font-semibold text-reject')}>{bank.evidence.invoice_routing}</td>
                    <td className="px-3 py-1.5">{bank.evidence.file_routing}</td></tr>
                </tbody>
              </table>
            </div>
            {bank.evidence.reread && (
              <p className="mt-2 flex gap-2 text-[12.5px] text-ink-2"><Sparkles size={14} className="mt-0.5 shrink-0 text-ai" />
                Re-read: first reading routing {bank.evidence.reread.first_reading.routing}, careful re-read {bank.evidence.reread.second_reading.routing}
                {bank.evidence.reread.resolved ? ' - it was a misread.' : ' - still different, so it is not a misread.'}</p>
            )}
            {bankBad && (
              <p className="mt-2 flex gap-2 text-[12.5px] text-reject"><Landmark size={14} className="mt-0.5 shrink-0" />
                Verify on the phone number on file ({bank.evidence.phone_on_file}) - never a number on the invoice.</p>
            )}
          </Section>
        )}
      </div>

      {po && (
        <Section title={po.inferred ? 'Purchase order - suggested, not printed' : 'Purchase order'}>
          <div className={cx('rounded-xl border p-4', po.inferred ? 'border-hold/40 bg-hold-bg/40' : 'border-rule bg-card')}>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <span className="font-mono text-[17px] font-semibold">{po.po_number}</span>
                <span className="ml-2 text-[13.5px] text-ink-2">{po.description}</span>
              </div>
              <div className="flex gap-4 font-mono text-[12px] tnum">
                <span><span className="text-ink-3">total </span>{money(po.total)}</span>
                <span><span className="text-ink-3">billed </span>{money(po.amount_invoiced)}</span>
                <span><span className="text-ink-3">left </span>{money(po.remaining)}</span>
                <span className={cx('uppercase', po.status === 'open' ? 'text-approve' : 'text-reject')}>{po.status}</span>
              </div>
            </div>
            <table className="mt-3 w-full text-[12.5px]">
              <tbody className="tnum">
                {po.lines.map((l: any) => (
                  <tr key={l.line_no} className="border-t border-dashed border-rule">
                    <td className="py-1 pr-2 font-mono text-ink-3">#{l.line_no}</td>
                    <td className="py-1 pr-2 font-mono text-[11px] text-ink-3">{l.sku}</td>
                    <td className="py-1 pr-2">{l.description}</td>
                    <td className="py-1 pr-2 text-right font-mono">{l.qty_invoiced}/{l.qty_ordered} billed</td>
                    <td className="py-1 text-right font-mono">{money(l.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {search && (
        <div className="rounded-xl border border-ai/25 bg-ai-bg/50 p-4 text-[13px]">
          <div className="mb-2 flex items-center gap-2 font-semibold text-ai"><Sparkles size={15} /> PO search: the model proposes, code verifies</div>
          <div className="grid gap-2 md:grid-cols-3">
            <div><div className="eyebrow mb-1">1 · Code narrowed to</div><div className="font-mono">{search.candidates?.join(', ') || 'no open POs'}</div><div className="text-[12px] text-ink-3">this vendor's open POs</div></div>
            <div><div className="eyebrow mb-1">2 · Model suggested</div><div className="font-mono">{search.model_answer?.po_number ?? 'none'} <span className="text-ink-3">({search.model_answer?.confidence})</span></div><div className="text-[12px] text-ink-2">{search.model_answer?.reason}</div></div>
            <div><div className="eyebrow mb-1">3 · Code checked</div><div>{search.result}</div></div>
          </div>
        </div>
      )}
      <Checks checks={s.checks} />
    </div>
  )
}

/* ------------------------------------------------------------------ 5 reconcile */
function RunningTotal({ rt }: { rt: any }) {
  const max = Math.max(rt.limit, rt.new_total) * 1.04
  const w = (v: number) => `${Math.max(0, (v / max) * 100)}%`
  const over = rt.new_total > rt.limit
  return (
    <Section title="Running total on this PO (all invoices, not just this one)">
      <div className="relative mt-6 h-7">
        <div className="absolute inset-0 rounded-md bg-paper-2" />
        <div className="absolute left-0 top-0 h-full rounded-l-md bg-ink-3/70" style={{ width: w(rt.already_invoiced) }}
          title={`Already billed ${money(rt.already_invoiced)}`} />
        <div className={cx('absolute top-0 h-full', over ? 'bg-reject-mark' : 'bg-chart', 'rounded-r-md')}
          style={{ left: `calc(${w(rt.already_invoiced)} + 2px)`, width: `calc(${w(rt.this_invoice)} - 2px)` }}
          title={`This invoice ${money(rt.this_invoice)}`} />
        <div className="absolute -top-5 h-[calc(100%+20px)] border-l-2 border-ink" style={{ left: w(rt.po_total) }}>
          <span className="absolute -top-0.5 left-1 whitespace-nowrap font-mono text-[10px] text-ink">PO total {money(rt.po_total)}</span>
        </div>
        <div className="absolute top-0 h-full border-l border-dashed border-ink-2" style={{ left: w(rt.limit) }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11.5px] tnum">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink-3/70" />already billed {money(rt.already_invoiced)}</span>
        <span className="flex items-center gap-1.5"><span className={cx('h-2.5 w-2.5 rounded-sm', over ? 'bg-reject-mark' : 'bg-chart')} />this invoice {money(rt.this_invoice)}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 border-l border-dashed border-ink-2" />limit incl. tolerance {money(rt.limit)}</span>
        <span className={cx('font-semibold', over ? 'text-reject' : 'text-ink')}>= {money(rt.new_total)}{over ? ` · over by ${money(rt.new_total - rt.po_total)}` : ` · ${money(rt.remaining_after)} left after this`}</span>
      </div>
    </Section>
  )
}

function Reconcile({ s }: { s: StageState }) {
  const pairs: any[] = s.data?.pairs || []
  const rt = s.data?.running_total
  return (
    <div className="space-y-7">
      {pairs.length > 0 && (
        <Section title="Invoice lines vs PO lines">
          <div className="overflow-x-auto rounded-lg border border-rule">
            <table className="w-full min-w-[640px] text-[12.5px]">
              <thead><tr className="bg-paper-2 text-left font-mono text-[10px] uppercase tracking-wider text-ink-3">
                <th className="px-3 py-2">Invoice line</th><th className="px-2 py-2">Matched by</th><th className="px-2 py-2">PO line</th>
                <th className="px-2 py-2 text-right">Qty billed / left</th><th className="px-3 py-2 text-right">Unit price vs PO</th></tr></thead>
              <tbody className="tnum">
                {pairs.map(p => {
                  const overQty = p.po_line != null && (p.qty ?? 0) > (p.po_qty_remaining ?? 0) + 1e-9
                  const overPrice = p.price_diff_pct != null && p.price_diff_pct > 1.0001
                  return (
                    <tr key={p.invoice_line} className="border-t border-rule align-top">
                      <td className="px-3 py-2"><div>{p.description}</div><div className="font-mono text-[10.5px] text-ink-3">{p.sku ?? 'no code'}</div></td>
                      <td className="px-2 py-2">
                        {p.po_line == null ? <span className="rounded bg-reject-bg px-1.5 py-0.5 font-mono text-[10px] text-reject">not on PO</span> : (
                          <span className={cx('inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px]',
                            p.method === 'item code' ? 'bg-paper-2 text-ink-2' : 'bg-ai-bg text-ai')}>
                            {p.method !== 'item code' && <Sparkles size={10} />}{p.method === 'item code' ? 'item code' : `meaning · ${p.confidence}`}
                          </span>)}
                        {p.method !== 'item code' && p.reason && <div className="mt-1 max-w-[200px] text-[11px] leading-snug text-ink-3">{p.reason}</div>}
                      </td>
                      <td className="px-2 py-2">{p.po_line != null ? <><span className="font-mono text-ink-3">#{p.po_line}</span> {p.po_description}</> : '—'}</td>
                      <td className={cx('px-2 py-2 text-right font-mono', overQty && 'font-semibold text-reject')}>
                        {p.qty} / {p.po_qty_remaining ?? '—'}
                        {p.po_qty_invoiced > 0 && <div className="text-[10.5px] font-normal text-ink-3">{p.po_qty_invoiced} of {p.po_qty_ordered} already billed</div>}
                      </td>
                      <td className={cx('px-3 py-2 text-right font-mono', overPrice && 'font-semibold text-reject')}>
                        {money(p.unit_price)} <span className="text-ink-3">vs</span> {money(p.po_unit_price)}
                        {p.price_diff_pct != null && <div className="text-[10.5px]">{p.price_diff_pct > 0 ? '+' : ''}{p.price_diff_pct}%</div>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12px] text-ink-3">Quantity is checked against what is <b>left</b> on each PO line, so split invoices work; price tolerance is separate.</p>
        </Section>
      )}
      {rt && <RunningTotal rt={rt} />}
      <Checks checks={s.checks} />
    </div>
  )
}

/* ------------------------------------------------------------------ 6 decide */
function Decide({ s, allChecks, run }: { s: StageState; allChecks: Check[]; run: RunSummary | null }) {
  const d = s.data || {}
  const fails = allChecks.filter(c => c.status === 'fail')
  const resolved = run?.review_status === 'approved' || run?.review_status === 'rejected'
  const ladder: { k: string; label: string; when: string; cls: string }[] = [
    { k: 'REJECT', label: 'Reject', when: 'any check that must never be paid', cls: 'border-reject text-reject bg-reject-bg' },
    { k: 'HOLD', label: 'Hold', when: 'any check a person should look at', cls: 'border-hold text-hold bg-hold-bg' },
    { k: 'APPROVE', label: 'Approve', when: 'every check passed', cls: 'border-approve text-approve bg-approve-bg' },
  ]
  return (
    <div className="space-y-6">
      <Section title="The rule - worst result wins">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          {ladder.map((l, i) => (
            <div key={l.k} className="flex flex-1 items-center gap-2">
              <div className={cx('flex-1 rounded-lg border-2 px-3 py-2.5 transition', d.decision === l.k ? l.cls : 'border-rule text-ink-3 opacity-60')}>
                <div className="font-mono text-[12px] font-bold uppercase tracking-wider">{l.label}</div>
                <div className="text-[12px]">{l.when}</div>
              </div>
              {i < 2 && <span className="hidden font-mono text-ink-3 sm:block">&gt;</span>}
            </div>
          ))}
        </div>
      </Section>
      {d.decision === 'HOLD' && (
        <div className={cx('flex gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13.5px]',
          resolved ? (run?.review_status === 'approved' ? 'border-approve/30 bg-approve-bg/50' : 'border-reject/30 bg-reject-bg/50') : 'border-hold/30 bg-hold-bg/50')}>
          <UserCheck size={16} className="mt-0.5 shrink-0" />
          <span>{resolved
            ? <>The rules decided <b>HOLD</b>. A person then <b>{run?.review_status}</b> it - see the <b>Human review</b> step. The rules' decision is kept unchanged for the audit trail.</>
            : <>The rules decided <b>HOLD</b>, so a person must approve or reject it - that is the next step.</>}</span>
        </div>
      )}
      <div className="grid grid-cols-4 gap-2 text-center">
        {(['pass', 'warn', 'fail', 'skip'] as const).map(k => (
          <div key={k} className="rounded-lg border border-rule bg-card py-2">
            <div className="font-mono text-[20px] font-semibold tnum">{d.counts?.[k] ?? 0}</div>
            <div className="eyebrow">{{ pass: 'passed', warn: 'notes', fail: 'failed', skip: 'skipped' }[k]}</div>
          </div>
        ))}
      </div>
      {fails.length > 0 ? (
        <Section title="What decided it">
          <div className="divide-y divide-rule">{fails.map(c => <CheckRow key={c.id} c={c} />)}</div>
        </Section>
      ) : <p className="text-[14px] text-approve">No check failed, so the invoice is approved. No model was involved in this step.</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ human review (held invoices) */
function Review({ s, run, actPreview }: { s: StageState; run: RunSummary | null; actPreview: ActPreview | null }) {
  const d = s.data || {}
  if (s.status !== 'done') {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-hold/40 bg-hold-bg/50 p-4">
          <div className="flex items-center gap-2 font-semibold text-hold"><Hourglass size={16} /> Waiting for a person</div>
          <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">
            The rules held this invoice for: <b className="text-ink">{(run?.reason_codes || []).map(reasonLabel).join(', ') || 'a failed check'}</b>.
            Use <b className="text-ink">Your call</b> above to approve or reject it - this pipeline then updates to show what your decision did.
          </p>
        </div>
        {actPreview ? (
          <Section title="If you approve, exactly this is written - nothing else">
            <dl>
              <KV k="Invoice_Log" v={`new row · ${actPreview.invoice_number} · ${money(actPreview.total)}`} mono />
              <KV k={`POs · ${actPreview.po_number}`} v={`+${money(actPreview.amount_add)} billed`} mono />
              <KV k="PO_Lines · quantity billed" v={Object.entries(actPreview.line_qty_add).map(([ln, q]) => `line ${ln} +${q}`).join(' · ')} mono />
            </dl>
          </Section>
        ) : <p className="text-[13px] text-ink-3">There is no confirmed PO match to record, so this invoice can only be rejected.</p>}
      </div>
    )
  }
  const approved = d.action === 'approve'
  return (
    <div className="space-y-5">
      <div className={cx('rounded-xl border p-4', approved ? 'border-approve/30 bg-approve-bg/60' : 'border-reject/30 bg-reject-bg/60')}>
        <div className={cx('flex items-center gap-2 font-display text-[21px] font-semibold', approved ? 'text-approve' : 'text-reject')}>
          <UserCheck size={19} /> {approved ? 'Approved by a person' : 'Rejected by a person'}
        </div>
        {d.note ? <p className="mt-2 font-display text-[17px] italic leading-relaxed text-ink">“{d.note}”</p>
          : <p className="mt-2 text-[13px] text-ink-3">No note was left.</p>}
      </div>
      <dl>
        <KV k="Reviewer" v={d.reviewer} />
        <KV k="When" v={timeOfDay(d.at)} mono />
        <KV k="Rules decided" v="HOLD" mono />
        <KV k="Final decision" v={d.final_decision} mono tone={approved ? 'good' : 'bad'} />
        <KV k="It was held for" v={d.held_for} />
      </dl>
      <p className="text-[12.5px] text-ink-3">
        {approved ? 'The next steps re-ran with this decision: Update records shows exactly what was written, Explain shows the final outcome.'
          : 'The next steps re-ran with this decision: nothing was written, and Explain shows the final outcome.'}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ 7 act */
function Act({ s }: { s: StageState }) {
  const d = s.data || {}
  if (d.written) {
    const ch = d.changes || {}
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-approve/30 bg-approve-bg/60 p-4">
          <div>
            <div className="flex items-center gap-2 font-semibold text-approve"><FileSpreadsheet size={18} />
              {d.after_review ? `Written to the records after ${d.reviewer} approved` : 'Written to the records'}</div>
            {d.after_review && <div className="mt-0.5 text-[12.5px] text-ink-2">at {timeOfDay(d.at)}{d.note ? ` · “${d.note}”` : ''} · the note is saved on the invoice-log row</div>}
          </div>
          {d.sheet_url && <a href={d.sheet_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-[13px] font-semibold text-paper hover:bg-accent">Open Google Sheet <ExternalLink size={13} /></a>}
        </div>
        {ch.skipped ? <p className="text-[13.5px] text-ink-2">Already recorded for this run - nothing was written twice.</p> : (
          <div className="grid gap-5 md:grid-cols-3">
            <Section title="Invoice_Log · new row">
              <dl><KV k="Invoice" v={ch.invoice_log_row?.invoice_number} mono /><KV k="PO" v={ch.invoice_log_row?.po_number} mono />
                <KV k="Subtotal" v={money(ch.invoice_log_row?.subtotal)} mono /><KV k="Total" v={money(ch.invoice_log_row?.total)} mono /></dl>
            </Section>
            <Section title={`POs · ${ch.po?.po_number}`}>
              <dl><KV k="Amount billed" v={money(ch.po?.amount_invoiced)} mono />{(ch.po?.remaining ?? 0) < -0.005
                  ? <KV k="Over PO total by" v={money(-(ch.po?.remaining ?? 0))} mono tone="bad" />
                  : <KV k="Remaining" v={money(ch.po?.remaining)} mono />}
                <KV k="Status" v={<span className="uppercase">{ch.po?.status}</span>} mono /></dl>
            </Section>
            <Section title="PO_Lines · quantities billed">
              <dl>{(ch.po_lines || []).map((l: any) => <KV key={l.line_no} k={`#${l.line_no} ${l.description}`} v={`${l.qty_invoiced} / ${l.qty_ordered}`} mono />)}</dl>
            </Section>
          </div>
        )}
      </div>
    )
  }
  if (d.rejected_on_review) {
    return (
      <div className="rounded-xl border border-reject/30 bg-reject-bg/50 p-5">
        <div className="font-display text-[19px] font-semibold text-reject">Nothing was written - rejected by {d.reviewer}.</div>
        <p className="mt-1 text-[13.5px] text-ink-2">At {timeOfDay(d.at)}{d.note ? ` · “${d.note}”` : ''}. Rejected invoices are never recorded against a PO, so the records are unchanged.</p>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-rule bg-paper-2/60 p-5">
      <div className="font-display text-[19px] font-semibold">Nothing was written.</div>
      <p className="mt-1 text-[13.5px] text-ink-2">
        {d.queued_for_review
          ? <>Only an approval updates the spreadsheet. This invoice is waiting in the <b>review queue</b>{d.reviewer_can_approve ? ' - if a reviewer approves it, this step re-runs and records exactly what the run computed.' : '. It has no confirmed PO match, so a reviewer can only reject it.'}</>
          : 'Rejected invoices are never recorded against a PO.'}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ 8 explain */
function Explain({ s }: { s: StageState }) {
  const d = s.data || {}
  return (
    <div className="space-y-4">
      <p className="font-display text-[20px] leading-relaxed text-ink">{d.summary}</p>
      <div className="flex gap-2.5 rounded-lg bg-paper-2 px-4 py-3 text-[14px]"><ArrowRight size={17} className="mt-0.5 shrink-0" /><span><b>Next:</b> {d.next_action}</span></div>
      <p className="text-[12.5px] text-ink-3">{d.source === 'review' ? "Updated after the reviewer's decision - written from the decision itself, no model needed."
        : d.source === 'template' ? 'Written from a template (model unavailable).'
        : "Written by the model from the rules' findings. It narrates the decision; it cannot change it."}</p>
      {d.source === 'review' && d.system_explanation && (
        <details className="rounded-lg border border-rule px-4 py-2.5 text-[13.5px]">
          <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-wider text-ink-3">The system's original note (before review)</summary>
          <p className="mt-2 leading-relaxed text-ink-2">{d.system_explanation}</p>
        </details>
      )}
    </div>
  )
}

export function StageBody({ s, runId, allChecks, run, actPreview }: {
  s: StageState; runId: string; allChecks: Check[]; run: RunSummary | null; actPreview: ActPreview | null
}) {
  if (s.key === 'review') return <Review s={s} run={run} actPreview={actPreview} />
  if (s.status === 'skipped') return <p className="text-[14px] text-ink-2">Skipped - {s.reason}.</p>
  if (s.status === 'failed') return (
    <div className="space-y-3"><p className="text-[14px] text-reject">This step failed: {s.error}</p><Checks checks={s.checks} />
      <p className="text-[13px] text-ink-2">The process fails closed: the invoice is held for a person instead of guessing.</p></div>)
  if (s.status !== 'done') return (
    <div className="space-y-2 py-6">
      {s.progress.length ? s.progress.map((p, i) => <p key={i} className="text-[14px] italic text-ink-2 animate-rise">{p}…</p>)
        : <p className="text-[14px] text-ink-3">{s.status === 'running' ? 'Working…' : 'Waiting for earlier steps.'}</p>}
    </div>)
  const body = {
    ingest: <Ingest s={s} />, extract: <Extract s={s} runId={runId} />, validate: <Validate s={s} />, match: <Match s={s} />,
    reconcile: <Reconcile s={s} />, decide: <Decide s={s} allChecks={allChecks} run={run} />, act: <Act s={s} />, explain: <Explain s={s} />,
  }[s.key]
  return <>{body}<LlmFootnote calls={s.llm_calls} /></>
}
