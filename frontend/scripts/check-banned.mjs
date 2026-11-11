#!/usr/bin/env node
// Greps v2 UI source for DESIGN.md Banned-list patterns. Exit 1 on any hit.
//   node scripts/check-banned.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['src/app', 'src/components/v2', 'src/pages/v2', 'src/App.tsx', 'src/index.css']
const RULES = [
  [/font-display|Fraunces|serif\b(?!-)/, 'serif / display font'],
  [/\bitalic\b/, 'italic'],
  [/\buppercase\b/, 'uppercase'],
  [/\btracking-/, 'letter-spacing utility'],
  [/\bfont-mono\b/, 'monospace (use font-code in Dev-only panels)'],
  [/gradient/, 'gradient'],
  [/#[0-9a-fA-F]{3,8}\b(?![^{]*\})/, 'raw hex colour'],
  [/text-\[\d+(px|rem)\]/, 'raw font size'],
  [/\bshadow-(?!popover)\w+/, 'shadow other than shadow-popover'],
  [/\b(bg|text|border)-(gray|slate|zinc|neutral|stone|red|green|amber|yellow|blue|indigo|purple|violet|pink)-\d{2,3}\b/, 'Tailwind palette colour (use tokens)'],
  [/Sparkles|Stamp\b|eyebrow/, 'sparkle / stamp / eyebrow'],
  [/rounded-(xl|2xl|3xl)\b/, 'radius above 8px'],
  [/hover:scale|hover:-translate/, 'hover-scale animation'],
  [/padStart\(2/, '01/02 numbering'],
]
const files = []
const walk = p => statSync(p).isDirectory() ? readdirSync(p).forEach(f => walk(join(p, f))) : /\.(tsx?|css)$/.test(p) && files.push(p)
ROOTS.forEach(walk)

let hits = 0
for (const f of files) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) return // comments
    for (const [re, why] of RULES) {
      if (re.test(line)) { hits++; console.log(`${f}:${i + 1}  ${why}\n    ${line.trim().slice(0, 140)}`) }
    }
  })
}
// font-code must only appear in Dev-gated code: report every use for manual review
const code = files.flatMap(f => readFileSync(f, 'utf8').split('\n').map((l, i) => [f, i + 1, l]).filter(([, , l]) => /font-code/.test(l)))
console.log(`\nfont-code uses (must be Dev-mode only): ${code.map(([f, n]) => `${f.split('/').pop()}:${n}`).join(', ') || 'none'}`)
console.log(hits ? `\n${hits} banned-pattern hit(s)` : '\nNo banned patterns.')
process.exit(hits ? 1 : 0)
