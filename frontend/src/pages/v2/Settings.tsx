import { usePoll } from '../../app/data'
import { money } from '../../app/format'
import { useAppMode } from '../../app/mode'
import { Page, PageHeader } from '../../components/v2/shell'
import { Button, Field, Fields, Panel, Switch } from '../../components/v2/ui'
import { api } from '../../lib/api'

function ModeRow({ id, title, detail, checked, onChange }: { id: string; title: string; detail: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <label htmlFor={id} className="min-w-0">
        <div className="text-body font-medium">{title}</div>
        <div className="text-table text-fg-muted">{detail}</div>
      </label>
      <Switch id={id} label={title} checked={checked} onChange={onChange} />
    </div>
  )
}

export default function Settings() {
  const mode = useAppMode()
  const { data: cfg } = usePoll(() => api.config(), 60000)

  return (
    <>
      <PageHeader title="Settings" />
      <Page>
        <div className="max-w-2xl space-y-6">
          <Panel title="Workspace mode">
            <div className="divide-y divide-line">
              <ModeRow id="mode-demo" title="Demo mode" detail="Sample invoices, reset and How it works, with a demo banner."
                checked={mode.demo} onChange={mode.setDemo} />
              <ModeRow id="mode-dev" title="Dev mode" detail="Model and store details, step timings, run IDs and raw extracted data."
                checked={mode.dev} onChange={mode.setDev} />
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
              <span className="text-caption text-fg-subtle">Saved on this device.</span>
              <Button onClick={mode.resetToDefaults}>Restore defaults</Button>
            </div>
          </Panel>

          {cfg && (
            <Panel title="Approval rules">
              <Fields>
                <Field label="Unit price tolerance">Up to {(cfg.policy.price_tolerance_pct * 100).toFixed(0)}% above the PO price</Field>
                <Field label="PO amount tolerance">Up to {(cfg.policy.running_total_tolerance_pct * 100).toFixed(0)}% above the PO amount, across all invoices</Field>
                <Field label="Rounding">{money(cfg.policy.rounding_tolerance)}</Field>
                <Field label="Duplicate window">{cfg.policy.near_duplicate_window_days} days</Field>
                <Field label="Currency">{cfg.policy.base_currency}</Field>
              </Fields>
            </Panel>
          )}

          {mode.dev && cfg && (
            <Panel title="Developer">
              <Fields>
                <Field label="Model"><span className="font-code">{cfg.model}</span></Field>
                <Field label="Records store"><span className="font-code">{cfg.store} ({cfg.store_backend})</span></Field>
                <Field label="Spreadsheet">{cfg.sheet_url ? <a className="text-brand hover:underline" href={cfg.sheet_url} target="_blank" rel="noreferrer">Open</a> : 'Not configured'}</Field>
                <Field label="Pipeline steps"><span className="font-code">{cfg.stages.map(s => s.key).join(' → ')}</span></Field>
              </Fields>
            </Panel>
          )}
        </div>
      </Page>
    </>
  )
}
