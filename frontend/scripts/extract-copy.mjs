#!/usr/bin/env node
// Lists user-facing strings in the frontend source (JSX text + common text props + string literals that
// look like sentences). Used for the copy audit and to check that rewritten copy follows DESIGN.md.
//   node scripts/extract-copy.mjs src > copy.md
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.argv[2] ?? 'src'
const files = []
const walk = d => readdirSync(d).forEach(f => {
  const p = join(d, f)
  if (statSync(p).isDirectory()) walk(p)
  else if (/\.(tsx|ts)$/.test(f)) files.push(p)
})
walk(root)

for (const f of files.sort()) {
  const src = readFileSync(f, 'utf8')
  const found = new Set()
  // JSX text between tags
  for (const m of src.matchAll(/>([^<>{}\n]*[A-Za-z][^<>{}\n]*)</g)) {
    const t = m[1].trim()
    if (t.length > 1 && !/^[\w.-]+$/.test(t) || /\s/.test(t)) found.add(t)
  }
  // text props
  for (const m of src.matchAll(/\b(title|placeholder|label|aria-label|alt)="([^"]+)"/g)) found.add(m[2])
  // sentence-like string literals ('...' or "..." or `...` with a space and a letter, not classNames)
  for (const m of src.matchAll(/(['"`])((?:(?!\1)[^\\\n]){6,})\1/g)) {
    const t = m[2]
    if (!/\s/.test(t) || !/[A-Za-z]{3}/.test(t)) continue
    if (/^(?:[a-z0-9:[\]\/._%#-]+\s*)+$/.test(t) && /(px|py|text-|bg-|border|rounded|flex|grid|gap-|font-|mt-|mb-|w-|h-)/.test(t)) continue // className
    if (/^(?:import|export|from)\b/.test(t) || /=>|\$\{.*\}.*\$\{/.test(t) && t.length > 120) continue
    found.add(t)
  }
  for (const t of [...found]) {
    // drop JSX/code fragments: attribute names, SVG paths, comparisons, bare punctuation
    if (/(className|strokeWidth|strokeLine|stroke=|fill=|width=|height=|d=|viewBox|=>|!=|==|&&|\|\|)/.test(t)
        || /^[\s,:;()=\/>.+-]*[A-Za-z]*[\s,:;=]*$/.test(t) && !/\s[A-Za-z]/.test(t.trim())
        || /^\s*[,:]\s*\w+:\s*$/.test(t)) found.delete(t)
  }
  if (!found.size) continue
  console.log(`\n### ${relative(process.cwd(), f)} (${found.size})`)
  for (const t of found) console.log(`- ${t.replace(/\s+/g, ' ').slice(0, 160)}`)
}
