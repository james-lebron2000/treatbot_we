#!/usr/bin/env node
// Generates tokens.css / tokens.wxss for web / mini-program / Treatbot Web from tokens.json.
// Source of truth: shared/tokens/tokens.json. Edit there, then run this script.
//
// Usage:
//   node shared/tokens/build.mjs           # write three target files
//   node shared/tokens/build.mjs --check   # exit 1 if any target file is stale (CI)

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')

const tokens = JSON.parse(await readFile(resolve(__dirname, 'tokens.json'), 'utf8'))

const HEADER = `/* AUTO-GENERATED from shared/tokens/tokens.json — do not edit by hand.
   Run \`node shared/tokens/build.mjs\` (or \`pnpm -C web tokens:build\`) to regenerate. */`

// WXSS gotcha: WeChat Mini Program does NOT match the `:root` selector — CSS custom
// properties declared there silently no-op, leaving every `var(--brand)` etc. unresolved
// (UI falls back to black text on white bg). The fix is to declare them on `page`,
// which IS the WXSS equivalent of <html>. Web/Treatbot Web .css files keep `:root` as normal.
function buildCss(t, selector = ':root') {
  const lines = []
  const groups = [
    ['', t.color],
    ['font-', t.font],
    ['fs-', t.fs],
    ['lh-', t.lh],
    ['r-', t.r],
    ['shadow-', t.shadow],
    ['s-', t.s],
    ['container-', t.container || {}],
    ['size-', t.size || {}],
  ]
  for (const [prefix, group] of groups) {
    for (const [k, v] of Object.entries(group)) {
      lines.push(`  --${prefix}${k}: ${v};`)
    }
  }
  return `${HEADER}\n${selector} {\n${lines.join('\n')}\n}\n`
}

const TARGETS = [
  'web/src/styles/tokens.css',
  'styles/tokens.wxss',
  'server/public/landing/tokens.css',
  'server/public/demo/tokens.css',
  'server/public/admin/tokens.css',
]

const cssWeb = buildCss(tokens, ':root')
const cssWxss = buildCss(tokens, 'page')
const cssFor = (rel) => (rel.endsWith('.wxss') ? cssWxss : cssWeb)
const isCheck = process.argv.includes('--check')

let stale = 0
for (const rel of TARGETS) {
  const target = resolve(repoRoot, rel)
  const expected = cssFor(rel)
  if (isCheck) {
    let existing = ''
    try { existing = await readFile(target, 'utf8') } catch {}
    if (existing !== expected) {
      console.error(`✗ stale: ${rel}`)
      stale++
    } else {
      console.log(`✓ fresh: ${rel}`)
    }
  } else {
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, expected, 'utf8')
    console.log(`✓ wrote ${rel}`)
  }
}

if (isCheck && stale > 0) {
  console.error(`\n${stale} file(s) out of sync. Run \`node shared/tokens/build.mjs\` and commit the result.`)
  process.exit(1)
}

if (!isCheck) {
  console.log(`\n${TARGETS.length} files synced from tokens.json.`)
}
