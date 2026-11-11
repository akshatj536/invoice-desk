import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type ActPreview, type Check, type LlmCall, type RunEvent, type RunSummary } from '../lib/api'

export type StageStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed'

export interface StageState {
  key: string
  title: string
  status: StageStatus
  summary?: string
  data?: any
  checks: Check[]
  llm_calls: LlmCall[]
  duration_ms?: number
  progress: string[]
  reason?: string
  error?: string
  startedAt?: number
  updatedAfterReview?: boolean
}

export const STAGE_ORDER: { key: string; title: string }[] = [
  { key: 'ingest', title: 'Ingest' },
  { key: 'extract', title: 'Read invoice' },
  { key: 'validate', title: 'Validate' },
  { key: 'match', title: 'Match vendor & PO' },
  { key: 'reconcile', title: 'Reconcile' },
  { key: 'decide', title: 'Decide' },
  { key: 'act', title: 'Update records' },
  { key: 'explain', title: 'Explain' },
]

export const REVIEW_STAGE = { key: 'review', title: 'Human review' }

/** The steps shown for a run: held invoices get a 'Human review' step right after Decide. */
export function orderFor(run: RunSummary | null): { key: string; title: string }[] {
  if (run?.decision !== 'HOLD') return STAGE_ORDER
  const i = STAGE_ORDER.findIndex(s => s.key === 'decide') + 1
  return [...STAGE_ORDER.slice(0, i), REVIEW_STAGE, ...STAGE_ORDER.slice(i)]
}

function initialStages(): Record<string, StageState> {
  return Object.fromEntries([...STAGE_ORDER, REVIEW_STAGE].map(s => [s.key, { ...s, status: 'pending', checks: [], llm_calls: [], progress: [] }]))
}

function apply(stages: Record<string, StageState>, e: RunEvent): Record<string, StageState> {
  if (!e.stage || !stages[e.stage]) return stages
  const s = { ...stages[e.stage] }
  const p = e.payload || {}
  switch (e.type) {
    case 'stage_started':
      s.status = 'running'; s.startedAt = Date.now()
      if (p.after_review) { s.progress = []; s.updatedAfterReview = true }
      break
    case 'stage_progress': s.progress = [...s.progress, p.message]; break
    case 'stage_completed':
      Object.assign(s, { status: 'done', summary: p.summary, data: p.data, checks: p.checks || [], llm_calls: p.llm_calls || [], duration_ms: p.duration_ms })
      break
    case 'stage_skipped': Object.assign(s, { status: 'skipped', reason: p.reason }); break
    case 'stage_failed': Object.assign(s, { status: 'failed', error: p.error, checks: p.checks || [], duration_ms: p.duration_ms }); break
    case 'review_resolved': Object.assign(s, { status: 'done', summary: p.summary, data: p }); break
    default: return stages
  }
  return { ...stages, [e.stage]: s }
}

/** Live (or replayed) state of one run. Live events are revealed with a small minimum gap so that
 *  sub-millisecond code stages are still visible; the durations shown are always the real ones. */
export function useRunStream(runId: string | undefined) {
  const [run, setRun] = useState<RunSummary | null>(null)
  const [actPreview, setActPreview] = useState<ActPreview | null>(null)
  const [stages, setStages] = useState<Record<string, StageState>>(initialStages)
  const [events, setEvents] = useState<RunEvent[]>([])
  const [live, setLive] = useState(false)
  const [current, setCurrent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const queue = useRef<RunEvent[]>([])
  const draining = useRef(false)
  const seen = useRef(new Set<number>())

  const refresh = useCallback(async () => {
    if (!runId) return
    const r = await api.run(runId)
    setRun(r.run)
    setActPreview(r.act_preview)
    return r
  }, [runId])

  const reveal = useCallback((e: RunEvent) => {
    setEvents(prev => [...prev, e])
    setStages(prev => apply(prev, e))
    if ((e.type === 'stage_started' || e.type === 'review_resolved') && e.stage) setCurrent(e.stage)
    if (e.type === 'run_completed' || e.type === 'run_reviewed') {
      setLive(false)
      setCurrent(null)
      refresh()
    }
  }, [refresh])

  const drain = useCallback(() => {
    if (draining.current) return
    draining.current = true
    const step = () => {
      const e = queue.current.shift()
      if (!e) { draining.current = false; return }
      reveal(e)
      const gap = e.type === 'stage_completed' || e.type === 'stage_skipped' || e.type === 'stage_failed' || e.type === 'review_resolved' ? 420
        : e.type === 'stage_started' ? 260 : e.type === 'stage_progress' ? 520 : 0
      setTimeout(step, gap)
    }
    step()
  }, [reveal])

  const enqueue = useCallback((evs: RunEvent[]) => {
    const fresh = evs.filter(e => e?.seq && !seen.current.has(e.seq))
    fresh.forEach(e => seen.current.add(e.seq))
    if (!fresh.length) return false
    queue.current.push(...fresh)
    drain()
    return true
  }, [drain])

  /** After a reviewer acts: fetch the new events (Human review, Update records, Explain) and play them live. */
  const pullNew = useCallback(async () => {
    if (!runId) return
    const r = await api.run(runId)
    setActPreview(r.act_preview)
    setLive(true)
    if (!enqueue(r.events)) { setLive(false); setRun(r.run) }
  }, [runId, enqueue])

  useEffect(() => {
    if (!runId) return
    let es: EventSource | null = null
    let cancelled = false
    setStages(initialStages()); setEvents([]); setCurrent(null); setError(null)
    queue.current = []; seen.current = new Set()

    refresh().then(r => {
      if (!r || cancelled) return
      const finished = r.run.status === 'completed' || r.run.status === 'error'
      if (finished) {
        // replay instantly (includes any review updates made since)
        let st = initialStages()
        for (const e of r.events) { st = apply(st, e); seen.current.add(e.seq) }
        setStages(st); setEvents(r.events); setLive(false)
        return
      }
      setLive(true)
      es = new EventSource(`/api/runs/${runId}/stream`)
      es.onmessage = msg => enqueue([JSON.parse(msg.data) as RunEvent])
      es.addEventListener('end', () => es?.close())
      es.onerror = () => { /* EventSource auto-reconnects; ids dedupe replays */ }
    }).catch(err => setError(String(err)))

    return () => { cancelled = true; es?.close() }
  }, [runId, refresh, enqueue])

  return { run, actPreview, stages, events, live, current, error, refresh, pullNew }
}
