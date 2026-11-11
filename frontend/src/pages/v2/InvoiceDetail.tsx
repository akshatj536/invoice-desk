import { CircleAlert, CircleCheck, CircleDashed, CircleMinus, CircleX, ExternalLink, LoaderCircle } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { evidenceLine } from '../../app/evidence'
import { cx, date, money, ms, plural } from '../../app/format'
import { REJECT_CODES, STAGE_NAME, STAGE_PROGRESS, STAGE_TAG, VENDOR_MATCH_BASIS, reasonLabel, statusOf } from '../../app/labels'
import { useAppMode } from '../../app/mode'
import { Page, PageHeader } from '../../components/v2/shell'
import { Badge, Button, Chip, Dash, EmptyState, Field, Fields, MatchIcon, Modal, Tabs, Textarea, useToast } from '../../components/v2/ui'
import { orderFor, useRunStream, type StageState } from '../../hooks/useRunStream'
import { api, type ActPreview, type Check, type RunSummary } from '../../lib/api'

type TabKey = 'details' | 'activity' | 'raw'

/* ------------------------------------------------------------------ helpers */
function stageTone(s: StageState): 'ok' | 'warn' | 'fail' | 'running' | 'pending' | 'skipped' {
  if (s.status === 'running') return 'running'
  if (s.status === 'pending') return 'pending'
  if (s.status === 'skipped') return 'skipped'
  if (s.status === 'failed') return 'fail'
  if (s.key === 'review') return s.data?.action === 'reject' ? 'fail' : 'ok'
  if (s.key === 'decide') return s.data?.decision === 'APPROVE' ? 'ok' : s.data?.decision === 'REJECT' ? 'fail' : 'warn'
  if (s.key === 'act' && !s.data?.written && !s.checks.some(c => c.status === 'fail')) return 'skipped'
  if (s.checks.some(c => c.status === 'fail')) return s.checks.some(c => c.status === 'fail' && c.on_fail === 'REJECT') ? 'fail' : 'warn'
  if (s.checks.some(c => c.status === 'warn')) return 'warn'
  return 'ok'
}

function StepIcon({ tone }: { tone: ReturnType<typeof stageTone> }) {
  const cls = 'shrink-0'
  switch (tone) {
    case 'ok': return <CircleCheck size={16} className={cx(cls, 'text-success-fg')} aria-label="Passed" />
    case 'warn': return <CircleAlert size={16} className={cx(cls, 'text-warning-fg')} aria-label="Needs review" />
    case 'fail': return <CircleX size={16} className={cx(cls, 'text-danger-fg')} aria-label="Failed" />
    case 'running': return <LoaderCircle size={16} className={cx(cls, 'animate-spin text-fg-subtle')} aria-label="In progress" />
    case 'skipped': return <CircleMinus size={16} className={cx(cls, 'text-fg-disabled')} aria-label="Skipped" />
    default: return <CircleDashed size={16} className={cx(cls, 'text-fg-disabled')} aria-label="Pending" />
  }
}

/** UI-owned one-line detail per step (backend text is shown only in Dev mode). */
function stepDetail(s: StageState, run: RunSummary): string {
  const d = s.data || {}
  const fails = s.checks.filter(c => c.status === 'fail')
  const issues = fails.length ? ` · ${fails.map(c => reasonLabel(c.reason_code ?? '')).join(', ')}` : ''
  if (s.status === 'running') return STAGE_PROGRESS[s.key] ?? 'In progress…'
  if (s.status === 'pending') return 'Not started'
  if (s.status === 'skipped') return 'Skipped'
  if (s.status === 'failed') return 'Could not complete; held for review'
  switch (s.key) {
    case 'ingest': return `${d.kind === 'scanned' ? 'Scanned' : 'Digital'} PDF · ${plural(d.pages ?? 1, 'page')}`
    case 'extract': {
      const x = d.extraction || {}
      const kind = x.doc_type && x.doc_type !== 'invoice' ? `Document type: ${String(x.doc_type).replace('_', ' ')} · ` : ''
      return `${kind}${plural(x.line_items?.length ?? 0, 'line item')} · total ${money(x.total)}`
    }
    case 'validate': return fails.length ? `Issues${issues}` : 'Required fields present; totals add up'
    case 'match': return d.vendor ? `${d.vendor.legal_name}${d.po ? ` · ${d.po.po_number}${d.po.inferred ? ' (suggested)' : ''}` : ''}${issues}` : `Vendor not found${issues}`
    case 'reconcile': return d.pairs ? `${plural(d.pairs.length, 'line')} compared with ${run.po_number ?? 'PO'}${issues}` : `Duplicate check only${issues}`
    case 'decide': return d.decision === 'APPROVE' ? 'Approved automatically' : `${d.decision === 'HOLD' ? 'On hold' : 'Rejected'}${d.reason_codes?.length ? ` · ${d.reason_codes.map(reasonLabel).join(', ')}` : ''}`
    case 'review': return `${d.action === 'approve' ? 'Approved' : 'Rejected'} by ${d.reviewer}${d.note ? `: “${d.note}”` : ''}`
    case 'act':
      if (d.written) { const po = d.changes?.po; return po ? `Posted to invoice log · ${po.po_number} ${po.status}, ${money(po.remaining)} remaining` : 'Posted to invoice log' }
      if (d.rejected_on_review) return 'Not posted · rejected on review'
      if (d.queued_for_review) return 'Not posted · waiting for review'
      return 'Not posted'
    case 'explain': return d.summary ?? ''
  }
  return ''
}

/* ------------------------------------------------------------------ sections */
function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-4 last:border-b-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-section font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

function DetailsTab({ stages }: { stages: Record<string, StageState> }) {
  const x = stages.extract.data?.extraction
  const m = stages.match.data || {}
  const math = stages.validate.data?.math
  const bank = stages.match.checks.find(c => c.id === 'match.bank')
  const pairs: any[] = stages.reconcile.data?.pairs || []
  const rt = stages.reconcile.data?.running_total
  if (!x) return <EmptyState>{stages.extract.status === 'running' || stages.ingest.status === 'running' ? 'Reading invoice…' : 'No data was read from this document.'}</EmptyState>
  const totalsOk = math ? Math.abs((math.lines_sum ?? 0) - (math.subtotal ?? math.lines_sum)) <= 0.05 && Math.abs((math.expected_total ?? 0) - (math.total ?? 0)) <= 0.05 : null

  return (
    <div>
      <Section title="Invoice">
        <Fields>
          {x.doc_type !== 'invoice' && <Field label="Document type"><span className="capitalize">{String(x.doc_type).replace('_', ' ')}</span></Field>}
          <Field label="Invoice number">{x.invoice_number ?? <Dash />}</Field>
          <Field label="Invoice date">{date(x.invoice_date)}</Field>
          <Field label="Due date">{date(x.due_date)}</Field>
          <Field label="PO on invoice">{x.po_reference ?? <span className="text-fg-subtle">Not on invoice</span>}</Field>
          <Field label="Currency">{x.currency ?? 'USD'}</Field>
          <Field label="Subtotal" numeric>{money(x.subtotal)}</Field>
          <Field label="Tax" numeric>{money(x.tax_amount)}</Field>
          <Field label="Total" numeric><span className="font-medium">{money(x.total)}</span></Field>
          {math && (
            <Field label="Totals check">
              <span className="inline-flex items-center gap-1.5"><MatchIcon ok={totalsOk} />
                {totalsOk ? `Line items add up to ${money(math.lines_sum)}` : `Line items total ${money(math.lines_sum)}; subtotal printed ${money(math.subtotal)}`}</span>
            </Field>
          )}
        </Fields>
      </Section>

      <Section title="Vendor">
        <Fields>
          <Field label="Name on invoice">{x.vendor_name ?? <Dash />}</Field>
          <Field label="Vendor file">{m.vendor ? <>{m.vendor.legal_name} <span className="text-fg-subtle">{m.vendor.vendor_id}</span></> : <span className="text-danger-fg">Not found</span>}</Field>
          {m.vendor && <Field label="Matched by">{VENDOR_MATCH_BASIS[m.vendor.method] ?? m.vendor.method}</Field>}
          {m.vendor && <Field label="Payment status">{m.vendor.approved ? <Badge tone="success">Approved vendor</Badge> : <Badge tone="danger">Not approved</Badge>}</Field>}
        </Fields>
      </Section>

      <Section title="Bank details">
        {bank && bank.status !== 'skip' ? (
          <table className="w-full text-table">
            <thead><tr className="text-left text-caption font-medium text-fg-subtle">
              <th className="h-8 pr-3 font-medium">Field</th><th className="pr-3 font-medium">On invoice</th><th className="pr-3 font-medium">On vendor file</th><th className="w-14 text-center font-medium">Match</th>
            </tr></thead>
            <tbody className="tabular-nums">
              {[['Account', bank.evidence.invoice_account, bank.evidence.file_account], ['Routing', bank.evidence.invoice_routing, bank.evidence.file_routing]].map(([k, a, b]) => {
                const ok = !a || a === '-' ? null : String(a).replace(/\D/g, '').slice(-4) === String(b).replace(/\D/g, '').slice(-4)
                return (
                  <tr key={k} className="border-t border-line">
                    <td className="h-9 pr-3 text-fg-subtle">{k}</td>
                    <td className={cx('pr-3', ok === false && 'text-danger-fg')}>{k === 'Account' ? String(a).replace('••••', '••') : a}</td>
                    <td className="pr-3">{k === 'Account' ? String(b).replace('••••', '••') : b}</td>
                    <td className="text-center"><MatchIcon ok={ok} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : <p className="text-table text-fg-muted">No bank details on the invoice; payment uses the vendor file.</p>}
      </Section>

      <Section title="Purchase order" aside={m.po?.inferred ? <Chip>Suggested</Chip> : undefined}>
        {m.po ? (
          <Fields>
            <Field label="PO number">{m.po.po_number}</Field>
            <Field label="Description">{m.po.description}</Field>
            <Field label="PO amount" numeric>{money(m.po.total)}</Field>
            {rt && <Field label="Billed before" numeric>{money(rt.already_invoiced)}</Field>}
            {rt && <Field label="This invoice" numeric>{money(rt.this_invoice)}</Field>}
            {rt && <Field label="Remaining after" numeric><span className={cx(rt.remaining_after < -0.005 && 'font-medium text-danger-fg')}>{money(rt.remaining_after)}</span></Field>}
            <Field label="PO status"><span className="capitalize">{m.po.status}</span></Field>
          </Fields>
        ) : <p className="text-table text-fg-muted">No purchase order matched.</p>}
      </Section>

      {pairs.length > 0 && (
        <Section title="Line items">
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[620px] text-table">
              <thead><tr className="text-caption font-medium whitespace-nowrap text-fg-subtle">
                <th className="h-8 pl-4 pr-3 text-left font-medium">Description</th>
                <th className="pr-3 text-right font-medium">Invoice qty</th>
                <th className="pr-3 text-right font-medium">PO remaining</th>
                <th className="pr-3 text-right font-medium">Invoice price</th>
                <th className="pr-3 text-right font-medium">PO price</th>
                <th className="pr-3 text-right font-medium">Variance</th>
                <th className="w-14 pr-4 text-center font-medium">Match</th>
              </tr></thead>
              <tbody className="tabular-nums">
                {pairs.map(p => {
                  const overQty = p.po_line != null && (p.qty ?? 0) > (p.po_qty_remaining ?? 0) + 1e-9
                  const overPrice = p.price_diff_pct != null && p.price_diff_pct > 1.0001
                  const ok = p.po_line != null && !overQty && !overPrice && p.confidence === 'high'
                  return (
                    <tr key={p.invoice_line} className="border-t border-line">
                      <td className="py-2 pl-4 pr-3">
                        <div>{p.description}</div>
                        <div className="text-caption text-fg-subtle">{p.po_line != null ? `PO line ${p.po_line} · ${p.po_description}` : 'Not on PO'}</div>
                      </td>
                      <td className={cx('pr-3 text-right', overQty && 'font-medium text-danger-fg')}>{p.qty ?? <Dash />}</td>
                      <td className="pr-3 text-right">{p.po_qty_remaining ?? <Dash />}</td>
                      <td className="pr-3 text-right">{money(p.unit_price)}</td>
                      <td className="pr-3 text-right">{p.po_unit_price != null ? money(p.po_unit_price) : <Dash />}</td>
                      <td className={cx('pr-3 text-right', overPrice && 'font-medium text-danger-fg')}>{p.price_diff_pct != null ? `${p.price_diff_pct > 0 ? '+' : ''}${Number(p.price_diff_pct).toFixed(1)}%` : <Dash />}</td>
                      <td className="pr-4 text-center"><MatchIcon ok={ok} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  )
}

function ActivityTab({ stages, run, order, dev }: { stages: Record<string, StageState>; run: RunSummary; order: { key: string }[]; dev: boolean }) {
  return (
    <ol className="px-4 py-4">
      {order.map((o, i) => {
        const s = stages[o.key]
        const tone = stageTone(s)
        const waiting = o.key === 'review' && s.status !== 'done' && run.review_status === 'pending'
        const llmMs = s.llm_calls.reduce((a, c) => a + (c.latency_ms || 0), 0)
        return (
          <li key={o.key} className="relative flex gap-3 pb-5 last:pb-0">
            {i < order.length - 1 && <span className="absolute left-2 top-5 bottom-0 w-px bg-line" aria-hidden />}
            <div className="relative pt-0.5"><StepIcon tone={waiting ? 'warn' : tone} /></div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="text-table font-medium">{STAGE_NAME[o.key] ?? o.key}</span>
                {s.updatedAfterReview && s.status === 'done' && <span className="text-caption text-fg-subtle">updated after review</span>}
                {dev && (
                  <span className="font-code text-caption text-fg-subtle">
                    [{STAGE_TAG[o.key]}]{s.duration_ms != null && ` ${ms(s.duration_ms)}`}{s.llm_calls.length > 0 && ` · ${s.llm_calls.length} model call${s.llm_calls.length > 1 ? 's' : ''} ${ms(llmMs)}`}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-table text-fg-muted">{waiting ? 'Waiting for a reviewer' : stepDetail(s, run)}</p>
              {s.checks.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {s.checks.map(c => (
                    <li key={c.id} className="flex items-start gap-1.5 text-caption text-fg-muted">
                      <span className="pt-px">{c.status === 'pass' ? <CircleCheck size={13} className="text-success-fg" /> : c.status === 'fail' ? <CircleX size={13} className={c.on_fail === 'REJECT' ? 'text-danger-fg' : 'text-warning-fg'} /> : c.status === 'warn' ? <CircleAlert size={13} className="text-warning-fg" /> : <CircleMinus size={13} className="text-fg-disabled" />}</span>
                      <span>{c.label}</span>
                    </li>
                  ))}
                </ul>
              )}
              {dev && (s.summary || s.progress.length > 0) && (
                <div className="mt-1.5 space-y-0.5 font-code text-caption text-fg-subtle">
                  {s.progress.map((p, j) => <div key={j}>› {p}</div>)}
                  {s.summary && <div>= {s.summary}</div>}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function RawTab({ stages, run, events }: { stages: Record<string, StageState>; run: RunSummary; events: number }) {
  return (
    <div className="space-y-4 p-4">
      <div className="font-code text-caption text-fg-subtle">run {run.id} · model {run.model} · {events} events · {ms(run.duration_ms)}</div>
      <div>
        <h3 className="mb-2 text-section font-semibold">Extracted fields</h3>
        <pre className="max-h-[480px] overflow-auto rounded-control border border-line bg-subtle p-3 font-code text-caption">{JSON.stringify(stages.extract.data?.extraction ?? null, null, 2)}</pre>
      </div>
      <div>
        <h3 className="mb-2 text-section font-semibold">Model calls</h3>
        <pre className="overflow-auto rounded-control border border-line bg-subtle p-3 font-code text-caption">{JSON.stringify(Object.values(stages).flatMap(s => s.llm_calls), null, 2)}</pre>
      </div>
    </div>
  )
}

function IssuesPanel({ checks, nextAction }: { checks: Check[]; nextAction: string | null }) {
  return (
    <section className="rounded-panel border border-line bg-surface">
      <header className="flex h-11 items-center border-b border-line px-4 text-section font-semibold">Issues ({checks.length})</header>
      <ul className="divide-y divide-line">
        {checks.map(c => (
          <li key={c.id} className="flex gap-3 px-4 py-3">
            <CircleAlert size={16} className={cx('mt-0.5 shrink-0', REJECT_CODES.has(c.reason_code ?? '') || c.on_fail === 'REJECT' ? 'text-danger-fg' : 'text-warning-fg')} aria-hidden />
            <div className="min-w-0">
              <div className="text-table font-semibold">{reasonLabel(c.reason_code ?? '')}</div>
              <div className="text-table text-fg-muted tabular-nums">{evidenceLine(c)}</div>
            </div>
          </li>
        ))}
        {nextAction && (
          <li className="px-4 py-3">
            <div className="text-table font-semibold">Recommended action</div>
            <div className="text-table text-fg-muted">{nextAction}</div>
          </li>
        )}
      </ul>
    </section>
  )
}

function ReviewDialog({ action, run, preview, onClose, onDone }: {
  action: 'approve' | 'reject' | null; run: RunSummary; preview: ActPreview | null; onClose: () => void; onDone: (a: 'approve' | 'reject') => void
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (!action) return null
  const submit = async () => {
    setBusy(true); setErr(null)
    try { await api.review(run.id, action, note); setNote(''); onDone(action) }
    catch (e) { setErr(String(e).replace(/^Error:\s*/, '')) }
    finally { setBusy(false) }
  }
  return (
    <Modal open title={action === 'approve' ? 'Approve invoice' : 'Reject invoice'} onClose={onClose}
      footer={<>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button kind={action === 'approve' ? 'primary' : 'destructive'} onClick={submit} disabled={busy}
          icon={busy ? <LoaderCircle size={16} className="animate-spin" /> : undefined}>
          {action === 'approve' ? 'Approve and post' : 'Reject invoice'}
        </Button>
      </>}>
      <div className="space-y-3">
        <p className="text-table text-fg-muted">
          {action === 'approve' && preview
            ? <>Posts {preview.invoice_number} ({money(preview.total)}) to the invoice log and bills {money(preview.amount_add)} against {preview.po_number}.</>
            : action === 'approve' ? 'Posts this invoice to the invoice log.' : 'Nothing is posted. The invoice is closed as rejected.'}
        </p>
        <div>
          <label htmlFor="review-note" className="mb-1.5 block text-table font-medium">Note <span className="font-normal text-fg-subtle">(optional)</span></label>
          <Textarea id="review-note" value={note} onChange={e => setNote(e.target.value)} placeholder="Saved to the audit trail" rows={3} />
        </div>
        {err && <p className="text-table text-danger-fg">{err}</p>}
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ page */
export default function InvoiceDetail() {
  const { id } = useParams()
  const { dev } = useAppMode()
  const toast = useToast()
  const { run, actPreview, stages, events, live, current, error, pullNew } = useRunStream(id)
  const [tab, setTab] = useState<TabKey>('details')
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null)

  const order = useMemo(() => orderFor(run), [run])
  const issues = useMemo(() => order.filter(o => o.key !== 'review').flatMap(o => stages[o.key].checks.filter(c => c.status === 'fail')), [order, stages])

  if (error) return <Page><EmptyState>Invoice not found.</EmptyState></Page>
  if (!run || !id) return <Page><EmptyState>Loading…</EmptyState></Page>

  const st = statusOf(run)
  const processing = st.processing || live
  const pendingReview = run.review_status === 'pending' && !live
  const resolved = run.review_status === 'approved' || run.review_status === 'rejected'
  const reviewStage = stages.review
  const meta = [
    run.invoice_number && `Invoice ${run.invoice_number}`,
    run.po_number && `${run.po_number}${run.po_inferred ? ' (suggested)' : ''}`,
    run.total != null && money(run.total),
    `Received ${date(run.created_at)}`,
    dev && `run ${run.id}`,
    dev && run.duration_ms != null && ms(run.duration_ms),
  ].filter(Boolean).join(' · ')

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Invoices', to: '/invoices' }, { label: run.invoice_number ?? run.filename }]}
        title={run.vendor_name ?? run.filename}
        badge={<Badge tone={st.tone} processing={processing}>{processing ? (current ? STAGE_PROGRESS[current] ?? 'Processing' : 'Processing') : st.label}</Badge>}
        meta={meta}
        actions={pendingReview ? (<>
          <Button kind="destructive" onClick={() => setDialog('reject')}>Reject</Button>
          <Button kind="primary" onClick={() => setDialog('approve')} disabled={!run.can_approve}
            title={run.can_approve ? undefined : 'No matched purchase order to post against'}>Approve</Button>
        </>) : undefined}
      />

      <div className="space-y-4 px-(--page-gutter) py-6">
        {resolved && reviewStage.status === 'done' && (
          <div className="flex items-center gap-2 rounded-panel border border-line bg-surface px-4 py-3 text-table">
            {run.review_status === 'approved' ? <CircleCheck size={16} className="text-success-fg" /> : <CircleX size={16} className="text-danger-fg" />}
            <span><span className="font-semibold">{run.review_status === 'approved' ? 'Approved and posted' : 'Rejected'}</span>
              <span className="text-fg-muted"> by {reviewStage.data?.reviewer} on {date(reviewStage.data?.at)}{run.review_note ? ` · “${run.review_note}”` : ''}</span></span>
          </div>
        )}

        {!processing && issues.length > 0 && <IssuesPanel checks={issues} nextAction={resolved ? null : run.next_action} />}

        <div className="grid gap-4 lg:grid-cols-[45fr_55fr]">
          <section className="flex h-[calc(100vh-var(--header-height)-3rem)] min-h-[560px] flex-col overflow-hidden rounded-panel border border-line bg-surface lg:sticky lg:top-4">
            <div className="flex h-10 items-center justify-between border-b border-line px-4">
              <span className="truncate text-table text-fg-muted">{run.filename}</span>
              <a href={`/api/runs/${id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1.5 rounded-control px-2 text-table text-fg-muted hover:bg-hover hover:text-fg">
                Open <ExternalLink size={14} />
              </a>
            </div>
            <iframe title="Invoice document" src={`/api/runs/${id}/pdf#view=FitH&toolbar=0`} className="w-full flex-1" />
          </section>

          <section className="min-w-0 rounded-panel border border-line bg-surface">
            <div className="px-4 pt-1">
              <Tabs<TabKey> value={tab} onChange={setTab} tabs={[
                { key: 'details', label: 'Details' },
                { key: 'activity', label: 'Activity' },
                ...(dev ? [{ key: 'raw' as TabKey, label: 'Raw' }] : []),
              ]} />
            </div>
            {tab === 'details' && <DetailsTab stages={stages} />}
            {tab === 'activity' && <ActivityTab stages={stages} run={run} order={order} dev={dev} />}
            {tab === 'raw' && dev && <RawTab stages={stages} run={run} events={events.length} />}
          </section>
        </div>
      </div>

      <ReviewDialog action={dialog} run={run} preview={actPreview} onClose={() => setDialog(null)}
        onDone={a => { setDialog(null); toast(a === 'approve' ? 'Invoice approved and posted.' : 'Invoice rejected.'); pullNew() }} />
    </div>
  )
}
