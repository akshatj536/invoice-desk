#!/usr/bin/env node
// Regression oracle for the redesign: runs every demo scenario through the real API, in order, and
// records (or compares) each decision + reason codes. UI-independent: talks to the backend only.
//
//   node scripts/regress.mjs --base http://localhost:8790 --reset --out ../docs/redesign/baseline-decisions.json
//   node scripts/regress.mjs --base http://localhost:8790 --reset --compare ../docs/redesign/baseline-decisions.json --retry
//
// --reset   restores seed data and clears run history first (use a sandbox server, not your live one)
// --retry   if anything differs, reruns the whole suite once (rules out LLM extraction variance)
import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const has = k => args.includes(k)
const BASE = opt('--base', 'http://localhost:8790')

async function api(path, init) {
  const r = await fetch(BASE + path, init)
  if (!r.ok) throw new Error(`${init?.method ?? 'GET'} ${path} -> ${r.status} ${await r.text()}`)
  return r.json()
}
const post = (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) })
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function runSuite() {
  if (has('--reset')) await post('/api/reset')
  const cfg = await api('/api/config')
  const samples = await api('/api/samples')
  const results = []
  for (const s of samples) {
    const { id } = await post('/api/runs/sample', { file: s.file })
    let run
    for (let t = 0; t < 180; t++) {
      run = (await api(`/api/runs/${id}`)).run
      if (run.status === 'completed' || run.status === 'error') break
      await sleep(1000)
    }
    results.push({
      file: s.file, run_id: id, decision: run.decision, reason_codes: run.reason_codes ?? [],
      expected_decision: s.expected_decision, expected_codes: s.expected_codes, duration_ms: run.duration_ms,
    })
    process.stdout.write(`  ${s.file.padEnd(32)} ${String(run.decision).padEnd(8)} ${(run.reason_codes ?? []).join(',') || '-'}\n`)
  }
  return { captured_at: new Date().toISOString(), base: BASE, model: cfg.model, store: cfg.store, results }
}

function diff(baseline, current) {
  const byFile = Object.fromEntries(baseline.results.map(r => [r.file, r]))
  const out = []
  for (const c of current.results) {
    const b = byFile[c.file]
    if (!b) { out.push({ file: c.file, problem: 'not in baseline' }); continue }
    const sameDecision = b.decision === c.decision
    const sameCodes = [...b.reason_codes].sort().join(',') === [...c.reason_codes].sort().join(',')
    if (!sameDecision || !sameCodes) out.push({ file: c.file, baseline: `${b.decision} ${b.reason_codes.join(',')}`, now: `${c.decision} ${c.reason_codes.join(',')}` })
  }
  return out
}

const out = opt('--out')
const compare = opt('--compare')
let current = await runSuite()
if (out) { writeFileSync(out, JSON.stringify(current, null, 2) + '\n'); console.log(`wrote ${out}`) }
if (compare) {
  const baseline = JSON.parse(readFileSync(compare, 'utf8'))
  let d = diff(baseline, current)
  if (d.length && has('--retry')) {
    console.log(`${d.length} differ - rerunning the whole suite once to rule out extraction variance`)
    const again = await runSuite()
    const d2 = diff(baseline, again)
    d = d.filter(x => d2.some(y => y.file === x.file)).map(x => ({ ...x, rerun: d2.find(y => y.file === x.file).now }))
    current = again
  }
  if (d.length) { console.log('DIFFERENCES:'); console.table(d); process.exit(1) }
  console.log(`MATCH: all ${current.results.length} decisions and reason codes match the baseline`)
}
