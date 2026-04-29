/**
 * PRD-2026Q2 §2.3：前端 PII 脱敏兜底。
 *
 * 后端 /admin/* 列表接口已经默认脱敏（server/utils/mask.js），但页面保留一道防线，
 * 避免「字段重命名 / 新接口漏改」时把明文泄露到 DOM。
 *
 * 特点：对已经包含 `*` 的值做 no-op，不会把 `138****1234` 再次 mask 成乱码。
 */

const isEmpty = (value: unknown): boolean => value === undefined || value === null || value === ''

const toStr = (value: unknown): string => (typeof value === 'string' ? value : String(value))

const alreadyMasked = (value: string): boolean => value.includes('*')

export function maskPhone(phone: unknown): string {
  if (isEmpty(phone)) return ''
  const str = toStr(phone).trim()
  if (!str) return ''
  if (alreadyMasked(str)) return str
  if (str.length <= 7) {
    if (str.length <= 2) return str
    return `${str[0]}${'*'.repeat(str.length - 2)}${str[str.length - 1]}`
  }
  return `${str.slice(0, 3)}****${str.slice(-4)}`
}

export function maskIdCard(id: unknown): string {
  if (isEmpty(id)) return ''
  const str = toStr(id).trim()
  if (!str) return ''
  if (alreadyMasked(str)) return str
  if (str.length <= 7) {
    return `${str.slice(0, Math.min(3, str.length - 1))}${'*'.repeat(Math.max(1, str.length - 3))}`
  }
  return `${str.slice(0, 3)}${'*'.repeat(str.length - 7)}${str.slice(-4)}`
}

export function maskName(name: unknown): string {
  if (isEmpty(name)) return ''
  const str = toStr(name).trim()
  if (!str) return ''
  if (alreadyMasked(str)) return str
  const chars = Array.from(str)
  if (chars.length <= 1) return chars[0] || ''
  return `${chars[0]}${'*'.repeat(chars.length - 1)}`
}
