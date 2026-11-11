import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePoll } from '../../app/data'
import { cx, dateTime, money } from '../../app/format'
import { STAGE_PROGRESS, statusOf } from '../../app/labels'
import { Page, PageHeader } from '../../components/v2/shell'
import { Badge, Dash, EmptyState, Table, Td, Th, Tr, useToast } from '../../components/v2/ui'
import { api, type RunSummary } from '../../lib/api'

const MAX_BYTES = 15 * 1024 * 1024

/** Latest stage of each processing invoice, as a plain label. */
function useProgress(runs: RunSummary[]) {
  const [labels, setLabels] = useState<Record<string, string>>({})
  const active = runs.filter(r => r.status === 'queued' || r.status === 'running').map(r => r.id).join(',')
  useEffect(() => {
    if (!active) return
    let alive = true
    const ids = active.split(',')
    const tick = async () => {
      const entries = await Promise.all(ids.map(async id => {
        try {
          const { events } = await api.run(id)
          const last = [...events].reverse().find(e => e.type === 'stage_started' && e.stage)
          return [id, last ? STAGE_PROGRESS[last.stage!] ?? 'Processing…' : 'Receiving…'] as const
        } catch { return [id, 'Processing…'] as const }
      }))
      if (alive) setLabels(prev => ({ ...prev, ...Object.fromEntries(entries) }))
    }
    tick()
    const t = setInterval(tick, 1200)
    return () => { alive = false; clearInterval(t) }
  }, [active])
  return labels
}

export default function Inbox() {
  const nav = useNavigate()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [uploading, setUploading] = useState(0)
  const { data, reload } = usePoll(() => api.runs(), d => (d?.stats.running ? 1500 : 6000))
  const runs = (data?.runs ?? []).slice(0, 50)
  const progress = useProgress(runs)

  const upload = async (files: FileList | null) => {
    const list = Array.from(files ?? [])
    if (!list.length) return
    const tooBig = list.filter(f => f.size > MAX_BYTES)
    const ok = list.filter(f => f.size <= MAX_BYTES)
    if (tooBig.length) toast(`Upload failed: ${tooBig[0].name} is larger than 15 MB.`)
    setUploading(n => n + ok.length)
    let done = 0
    for (const f of ok) {
      try { await api.upload(f); done++ } catch (e) { toast(`Upload failed: ${String(e).replace(/^Error:\s*/, '')}`) }
      setUploading(n => n - 1)
    }
    if (done) toast(done === 1 ? '1 invoice uploaded.' : `${done} invoices uploaded.`)
    if (input.current) input.current.value = ''
    reload()
  }

  return (
    <>
      <PageHeader title="Inbox" />
      <Page>
        <label
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files) }}
          className={cx('flex h-30 cursor-pointer items-center justify-center rounded-panel border border-dashed text-body transition-colors',
            drag ? 'border-brand bg-brand-soft text-fg' : 'border-line-strong bg-surface text-fg-muted hover:border-fg-subtle')}>
          <input ref={input} type="file" accept="application/pdf,.pdf" multiple className="sr-only" onChange={e => upload(e.target.files)} />
          {uploading > 0
            ? <span>Uploading {uploading === 1 ? '1 invoice' : `${uploading} invoices`}…</span>
            : <span>Drop PDF invoices or <span className="text-brand">browse</span> · PDF up to 15 MB</span>}
        </label>

        <section className="space-y-3">
          <h2 className="text-section font-semibold">Recent uploads</h2>
          {data && runs.length === 0 ? (
            <div className="rounded-panel border border-line bg-surface"><EmptyState>No invoices yet.</EmptyState></div>
          ) : (
            <Table>
              <thead><tr>
                <Th>Received</Th><Th>Vendor</Th><Th>Invoice no.</Th><Th align="right">Amount</Th><Th>Status</Th>
              </tr></thead>
              <tbody>
                {runs.map(r => {
                  const st = statusOf(r)
                  return (
                    <Tr key={r.id} onClick={() => nav(`/invoices/${r.id}`)}>
                      <Td className="whitespace-nowrap text-fg-muted tabular-nums">{dateTime(r.created_at)}</Td>
                      <Td>{r.vendor_name ?? <span className="text-fg-subtle">{r.filename}</span>}</Td>
                      <Td>{r.invoice_number ?? <Dash />}</Td>
                      <Td numeric>{r.total != null ? money(r.total) : <Dash />}</Td>
                      <Td>{st.processing
                        ? <span className="inline-flex items-center gap-2"><Badge tone="neutral" processing>Processing</Badge><span className="text-fg-muted">{progress[r.id] ?? 'Receiving…'}</span></span>
                        : <Badge tone={st.tone}>{st.label}</Badge>}</Td>
                    </Tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </section>
      </Page>
    </>
  )
}
