export type Decision = 'APPROVE' | 'HOLD' | 'REJECT'
export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip'

export interface Check {
  id: string
  stage: string
  label: string
  status: CheckStatus
  on_fail: 'HOLD' | 'REJECT'
  reason_code: string | null
  message: string
  evidence: Record<string, any>
}

export interface LlmCall {
  purpose: string
  model: string
  latency_ms: number
  attempts: number
  thinking?: string
  input_tokens?: number
  output_tokens?: number
}

export interface RunSummary {
  id: string
  created_at: string
  completed_at: string | null
  filename: string
  source: string
  status: 'queued' | 'running' | 'completed' | 'error'
  decision: Decision | null
  final_decision: Decision | null
  reason_codes: string[]
  vendor_name: string | null
  invoice_number: string | null
  invoice_date: string | null
  po_number: string | null
  po_inferred: boolean
  currency: string | null
  total: number | null
  kind: string | null
  explanation: string | null
  next_action: string | null
  review_status: 'none' | 'pending' | 'approved' | 'rejected'
  review_note: string | null
  reviewed_at: string | null
  duration_ms: number | null
  model: string | null
  can_approve: boolean
}

export interface RunEvent {
  run_id: string
  seq: number
  ts: string
  type: 'run_started' | 'stage_started' | 'stage_progress' | 'stage_completed' | 'stage_skipped' | 'stage_failed' | 'run_completed' | 'review_resolved' | 'run_reviewed'
  stage: string | null
  payload: any
}

export interface ActPreview {
  po_number: string
  amount_add: number
  invoice_number: string
  total: number
  line_qty_add: Record<string, number>
}

export interface Stats {
  total: number
  completed: number
  running: number
  auto_approved: number
  held: number
  rejected: number
  pending_review: number
  approved_on_review: number
  auto_approval_rate: number | null
  avg_duration_ms: number | null
  value_approved: number
  value_held: number
  reasons: Record<string, number>
}

export interface Sample {
  file: string
  title: string
  group: 'happy' | 'edge' | 'brief'
  story: string
  expected_decision: Decision
  expected_codes: string[]
  vendor: string
  invoice_number: string
  total: number
}

export interface AppConfig {
  model: string
  store: string
  store_backend: 'gsheets' | 'local'
  sheet_url: string | null
  policy: {
    price_tolerance_pct: number
    running_total_tolerance_pct: number
    rounding_tolerance: number
    near_duplicate_window_days: number
    base_currency: string
  }
  stages: { key: string; title: string }[]
}

export interface Records {
  source: string
  sheet_url: string | null
  tab_urls: Record<string, string | null>
  vendors: any[]
  pos: any[]
  invoice_log: any[]
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`
    try {
      const j = await r.json()
      if (j?.detail) msg = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
    } catch { /* not json */ }
    throw new Error(msg)
  }
  return r.json() as Promise<T>
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  config: () => req<AppConfig>('/api/config'),
  samples: () => req<Sample[]>('/api/samples'),
  runs: () => req<{ runs: RunSummary[]; stats: Stats }>('/api/runs'),
  run: (id: string) => req<{ run: RunSummary; events: RunEvent[]; act_preview: ActPreview | null }>(`/api/runs/${id}`),
  runSample: (file: string) => req<{ id: string }>('/api/runs/sample', json({ file })),
  upload: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return req<{ id: string }>('/api/runs', { method: 'POST', body: fd })
  },
  review: (id: string, action: 'approve' | 'reject', note: string) =>
    req<{ final_decision: Decision }>(`/api/runs/${id}/review`, json({ action, note })),
  records: () => req<Records>('/api/records'),
  reset: () => req<{ ok: boolean }>('/api/reset', { method: 'POST' }),
}
