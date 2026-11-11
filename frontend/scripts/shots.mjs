#!/usr/bin/env node
// Full-page screenshots with Playwright (system Chrome, no browser download).
//
//   node scripts/shots.mjs --base http://localhost:8790 --out ../docs/redesign/before \
//        inbox=/ runs=/runs "records-vendors=/records|click=Vendors"
//
// Each target is name=path, optionally followed by |click=<visible text> to click a tab before capturing.
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const BASE = opt('--base', 'http://localhost:8790')
const OUT = opt('--out', '.')
const W = Number(opt('--width', 1440))
const targets = args.filter((a, i) => a.includes('=') && !args[i - 1]?.startsWith('--') && !a.startsWith('--'))

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: W, height: 900 } })
// --mode demo | dev | demo,dev  -> sets the app mode in localStorage before load (default: product)
const modes = (opt('--mode', '') || '').split(',')
await page.addInitScript(m => localStorage.setItem('invoice-desk.mode', JSON.stringify(m)), { demo: modes.includes('demo'), dev: modes.includes('dev') })
for (const t of targets) {
  const [name, rest] = [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)]
  const [path, ...actions] = rest.split('|')
  await page.goto(BASE + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  for (const a of actions) {
    if (a.startsWith('click=')) {
      await page.getByText(a.slice(6), { exact: false }).first().click()
      await page.waitForTimeout(700)
    }
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log(`  ${name}.png  <- ${rest}`)
}
await browser.close()
