#!/usr/bin/env node
// End-to-end UI verification for the redesign (Phase 7). Drives the real UI against a sandbox server
// that has the demo scenarios loaded (run regress.mjs --reset first).
//   node scripts/verify.mjs --base http://localhost:8790
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const BASE = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:8790'
const api = async (p, init) => (await fetch(BASE + p, init)).json()
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

const browser = await chromium.launch({ channel: 'chrome' })
async function pageIn(mode) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript(m => localStorage.setItem('invoice-desk.mode', JSON.stringify(m)), mode)
  return ctx.newPage()
}

// ---------------------------------------------------------------- old routes redirect
{
  const p = await pageIn({ demo: true, dev: false })
  const { runs } = await api('/api/runs')
  const map = [['/', '/inbox'], ['/runs', '/invoices'], [`/runs/${runs[0].id}`, `/invoices/${runs[0].id}`], ['/review', '/exceptions'], ['/records', '/purchase-orders'], ['/how', '/demo/how-it-works']]
  for (const [from, to] of map) {
    await p.goto(BASE + from, { waitUntil: 'networkidle' })
    check(`redirect ${from} -> ${to}`, new URL(p.url()).pathname === to, new URL(p.url()).pathname)
  }
  await p.context().close()
}

// ---------------------------------------------------------------- modes
{
  const p = await pageIn({ demo: false, dev: false })
  const cfg = await api('/api/config')
  await p.goto(BASE + '/inbox', { waitUntil: 'networkidle' })
  const body = await p.locator('body').innerText()
  check('product: no demo nav / banner', !/Sample invoices|How it works|Demo workspace/.test(body))
  check('product: no model or store shown', !body.includes(cfg.model) && !/local store/i.test(body))
  await p.goto(BASE + '/demo/samples', { waitUntil: 'networkidle' })
  check('product: demo pages redirect to inbox', new URL(p.url()).pathname === '/inbox')
  const { runs } = await api('/api/runs')
  await p.goto(BASE + `/invoices/${runs.find(r => r.decision === 'HOLD').id}`, { waitUntil: 'networkidle' })
  await p.getByRole('tab', { name: 'Activity' }).click()
  const detail = await p.locator('main').innerText()
  check('product: no Raw tab, tags, timings or run ID on detail', (await p.getByRole('tab', { name: 'Raw' }).count()) === 0 && !/\[(Model|Rules|Code)|\d+ ms\b|model call|run \d{4}-/.test(detail))
  await p.context().close()
}
{
  const p = await pageIn({ demo: true, dev: false })
  await p.goto(BASE + '/inbox', { waitUntil: 'networkidle' })
  const body = await p.locator('body').innerText()
  check('demo: banner + Sample invoices + How it works', /Demo workspace/.test(body) && /Sample invoices/.test(body) && /How it works/.test(body))
  await p.context().close()
}
{
  const p = await pageIn({ demo: false, dev: true })
  const cfg = await api('/api/config')
  await p.goto(BASE + '/inbox', { waitUntil: 'networkidle' })
  check('dev: model + store in footer', (await p.locator('aside').innerText()).includes(cfg.model))
  const { runs } = await api('/api/runs')
  await p.goto(BASE + `/invoices/${runs.find(r => r.decision === 'HOLD').id}`, { waitUntil: 'networkidle' })
  check('dev: Raw tab present', (await p.getByRole('tab', { name: 'Raw' }).count()) === 1)
  await p.getByRole('tab', { name: 'Activity' }).click()
  check('dev: step tags and timings shown', /\[(Model|Rules|Code)/.test(await p.locator('main').innerText()))
  await p.context().close()
}

// ---------------------------------------------------------------- approve / reject through the UI writes records
{
  const p = await pageIn({ demo: false, dev: false })
  let { runs } = await api('/api/runs')
  const toApprove = runs.find(r => r.review_status === 'pending' && r.can_approve)
  const before = await api('/api/records')
  const poBefore = before.pos.find(x => x.po_number === toApprove.po_number)
  await p.goto(BASE + `/invoices/${toApprove.id}`, { waitUntil: 'networkidle' })
  await p.getByRole('button', { name: 'Approve', exact: true }).click()
  await p.getByLabel('Note (optional)').fill('Verified in UI test')
  await p.getByRole('button', { name: 'Approve and post' }).click()
  await p.waitForTimeout(4000)
  const after = await api('/api/records')
  const poAfter = after.pos.find(x => x.po_number === toApprove.po_number)
  const row = after.invoice_log.find(e => e.run_id === toApprove.id)
  const expectedAdd = (await api(`/api/runs/${toApprove.id}`)).act_preview?.amount_add
  check('approve: invoice log row written with note', !!row && /Verified in UI test/.test(row.note), row?.note)
  check('approve: PO billed amount increased by the computed amount', Math.abs(poAfter.amount_invoiced - poBefore.amount_invoiced - (expectedAdd ?? row?.subtotal)) < 0.01,
    `${poBefore.amount_invoiced} -> ${poAfter.amount_invoiced}`)
  check('approve: page shows resolved state', /Approved and posted/.test(await p.locator('main').innerText()))

  ;({ runs } = await api('/api/runs'))
  const toReject = runs.find(r => r.review_status === 'pending')
  const logBefore = (await api('/api/records')).invoice_log.length
  await p.goto(BASE + `/invoices/${toReject.id}`, { waitUntil: 'networkidle' })
  await p.getByRole('button', { name: 'Reject', exact: true }).click()
  await p.getByRole('button', { name: 'Reject invoice' }).click()
  await p.waitForTimeout(3000)
  const rej = (await api(`/api/runs/${toReject.id}`)).run
  check('reject: run resolved as rejected, nothing posted', rej.review_status === 'rejected' && (await api('/api/records')).invoice_log.length === logBefore)
  await p.context().close()
}

// ---------------------------------------------------------------- PDF upload through the UI
{
  const p = await pageIn({ demo: false, dev: false })
  const n0 = (await api('/api/runs')).runs.length
  await p.goto(BASE + '/inbox', { waitUntil: 'networkidle' })
  await p.locator('input[type=file]').setInputFiles('../data/test_invoices/t04_blueharbor_fuel_surcharge.pdf')
  await p.waitForTimeout(2500)
  const sawProcessing = /Processing/.test(await p.locator('main').innerText())
  let done = null
  for (let i = 0; i < 90 && !done; i++) {
    const { runs } = await api('/api/runs')
    const r = runs.find(x => x.filename === 't04_blueharbor_fuel_surcharge.pdf')
    if (r && r.status === 'completed') done = r
    else await p.waitForTimeout(1000)
  }
  check('upload: new invoice appears and processes', !!done && (await api('/api/runs')).runs.length === n0 + 1, done ? `${done.decision} ${done.reason_codes.join(',')}` : 'timeout')
  check('upload: Inbox showed processing state', sawProcessing)
  await p.context().close()
}

// ---------------------------------------------------------------- reset demo data (banner)
{
  const p = await pageIn({ demo: true, dev: false })
  await p.goto(BASE + '/inbox', { waitUntil: 'networkidle' })
  p.once('dialog', d => d.accept())
  await p.getByRole('button', { name: 'Reset', exact: true }).click()
  await p.waitForTimeout(2500)
  const { runs } = await api('/api/runs')
  const rec = await api('/api/records')
  check('reset: runs cleared and seed records restored', runs.length === 0 && rec.invoice_log.length === 3 && rec.pos.every(x => x.po_number !== 'PO-1042' || x.amount_invoiced === 0))
  await p.goto(BASE + '/exceptions', { waitUntil: 'networkidle' })
  check('exceptions: empty state reads "No open exceptions."', /No open exceptions\./.test(await p.locator('main').innerText()))
  await p.screenshot({ path: '../docs/redesign/after/exceptions-empty.png', fullPage: true })
  await p.context().close()
}

await browser.close()
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
