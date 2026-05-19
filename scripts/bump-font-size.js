#!/usr/bin/env node
// 一次性脚本：把小程序 .wxss 里所有 font-size 调大。
// PRD-2026Q3 §U6（适老化）：0 医学基础病人 + 家属普遍年龄偏大，原字号偏小；
// 全局 +4px（rpx 单位 +8rpx，px 单位 +4px）。WeApp 750rpx = 屏宽，
// 在 iPhone 6/7/8（375pt）上 1rpx ≈ 0.5px，所以 +8rpx ≈ +4px 视觉。
//
// 用法：node scripts/bump-font-size.js [--dry]
//
// 只匹配 `font-size:` 后的数字单位组合；忽略 inherit/auto/em/%。

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const dry = process.argv.includes('--dry')

// 跳过的目录（Treatbot Web / 后端 / 依赖）
const SKIP_DIRS = new Set(['node_modules', 'web', 'server', '.git', 'dist', 'miniprogram_npm'])

/** 递归找 .wxss */
function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const p = path.join(dir, name)
    const stat = fs.statSync(p)
    if (stat.isDirectory()) walk(p, out)
    else if (p.endsWith('.wxss')) out.push(p)
  }
  return out
}

/**
 * 在一段 CSS 字符串里把 font-size 的 rpx/px 数值整体上调。
 * 兼容：font-size: 28rpx; / font-size:28rpx; / font-size: 14px !important;
 * 不动：inherit / auto / em / % / 含变量 var(...)。
 */
function bump(css) {
  let changed = 0
  const next = css.replace(
    /font-size\s*:\s*([0-9]+(?:\.[0-9]+)?)(rpx|px)\b/gi,
    (m, num, unit) => {
      const delta = unit === 'rpx' ? 8 : 4
      const nextNum = Number(num) + delta
      changed++
      // 保留浮点位数；整数仍输出为整数
      const out = Number.isInteger(nextNum) ? `${nextNum}` : nextNum.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
      return `font-size: ${out}${unit}`
    }
  )
  return { next, changed }
}

const files = walk(ROOT)
let totalFiles = 0
let totalChanges = 0

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  const { next, changed } = bump(src)
  if (!changed) continue
  totalFiles++
  totalChanges += changed
  console.log(`[${dry ? 'DRY' : 'WRITE'}] ${path.relative(ROOT, file)}  (+${changed})`)
  if (!dry) fs.writeFileSync(file, next, 'utf8')
}

console.log(`\nDone. ${totalFiles} files, ${totalChanges} font-size declarations bumped.`)
