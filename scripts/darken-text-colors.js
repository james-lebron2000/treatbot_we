#!/usr/bin/env node
// 一次性脚本：把所有 wxss 里「用作文字颜色」的浅灰统一替换成更深的灰，
// 让用户在亮色背景下能看清楚。只动 `color: xxx;` 这一类声明，
// `background:` / `border:` / `box-shadow:` 完全不动。
//
// 与白色/深色背景适配的两套规则：
//   - 一般情况：浅灰 → 深灰
//   - 已经在深色 / 半透白 上使用的（rgba(255,255,255,0.6) 这类）维持不动
//
// 跑一次然后保留在 scripts/ 里作为审计来源。

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const TARGET_DIRS = ['pages', 'components']

// 文字颜色迁移表（小写 hex → 替换值）
const TEXT_COLOR_MAP = {
  '#94a3b8': '#334155',   // slate-400 → slate-700
  '#9ca3af': '#374151',   // gray-400 → gray-700
  '#a3a3a3': '#374151',
  '#6b7280': '#374151',   // gray-500 → gray-700
  '#64748b': '#1e293b',   // slate-500 → slate-800
  '#475569': '#1e293b',   // slate-600 → slate-800（再深一档）
  '#cbd5e1': '#475569',   // slate-300 → slate-600（罕见的纯文字用法）
  '#c0c6d0': '#475569',
  '#999999': '#374151',
  '#999':    '#374151',
  '#666666': '#1e293b',
  '#666':    '#1e293b',
  '#888888': '#374151',
  '#888':    '#374151'
}

// 半透 rgba 的轻量加深（黑色系 / 灰色系，且在白底上才用）
// 形式：rgba(0,0,0,0.x) / rgba(15,23,42,0.x) / rgba(31,41,55,0.x) 等
const RGBA_BUMP = (match) => {
  // 只处理 alpha < 0.85 的，避免把已经深的再变更深
  const m = match.match(/rgba\((\s*\d+\s*,\s*\d+\s*,\s*\d+)\s*,\s*([0-9.]+)\s*\)/i)
  if (!m) return match
  const a = parseFloat(m[2])
  if (a >= 0.85) return match
  if (a < 0.4) return match // 太淡的可能是装饰性，跳过
  const next = Math.min(0.95, a + 0.18).toFixed(2)
  return `rgba(${m[1].replace(/\s+/g, '')}, ${next})`
}

const RGBA_RX = /rgba\(\s*(0\s*,\s*0\s*,\s*0|15\s*,\s*23\s*,\s*42|31\s*,\s*41\s*,\s*55|17\s*,\s*24\s*,\s*39)\s*,\s*[0-9.]+\s*\)/gi

const walk = (dir, fileList = []) => {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, fileList)
    } else if (entry.isFile() && entry.name.endsWith('.wxss')) {
      fileList.push(full)
    }
  })
  return fileList
}

const transformLine = (line) => {
  // 仅当此行是 `color: ...` 声明时才替换；忽略 background-color / border-color
  // （注意：缩进、行内多 prop 的写法都按 wxss 单 prop 一行的惯例处理）
  const trimmed = line.trim()
  if (!/^color\s*:/i.test(trimmed)) {
    return { line, changed: false }
  }

  let next = line
  let changed = false

  // hex 6 位
  next = next.replace(/#([0-9a-f]{6})\b/gi, (m, hex) => {
    const lower = `#${hex.toLowerCase()}`
    if (TEXT_COLOR_MAP[lower]) {
      changed = true
      return TEXT_COLOR_MAP[lower]
    }
    return m
  })

  // hex 3 位
  next = next.replace(/#([0-9a-f]{3})\b/gi, (m, hex) => {
    const lower = `#${hex.toLowerCase()}`
    if (TEXT_COLOR_MAP[lower]) {
      changed = true
      return TEXT_COLOR_MAP[lower]
    }
    return m
  })

  // rgba bump（只针对黑/深灰系；rgba(255,...,0.x) 是白底上的反色字样保持原样）
  next = next.replace(RGBA_RX, (m) => {
    const bumped = RGBA_BUMP(m)
    if (bumped !== m) {
      changed = true
      return bumped
    }
    return m
  })

  return { line: next, changed }
}

const run = () => {
  const files = TARGET_DIRS
    .map((d) => path.join(ROOT, d))
    .filter((p) => fs.existsSync(p))
    .flatMap((p) => walk(p))

  let totalChanges = 0
  files.forEach((file) => {
    const original = fs.readFileSync(file, 'utf8')
    const lines = original.split('\n')
    let fileChanges = 0
    const next = lines.map((line) => {
      const { line: nl, changed } = transformLine(line)
      if (changed) fileChanges++
      return nl
    }).join('\n')

    if (next !== original) {
      fs.writeFileSync(file, next, 'utf8')
      console.log(`  [updated] ${path.relative(ROOT, file)} (${fileChanges} declarations)`)
      totalChanges += fileChanges
    }
  })

  console.log(`\nDone. ${totalChanges} text-color declarations darkened across ${files.length} wxss files.`)
}

run()
