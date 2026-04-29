// Q3-红线 §B.3：e2e 通用 mock 工具。
//
// 把 envelope/路由匹配/用例数据集中在这里，让单条 spec 只关注业务流。
//
// 注意：
//   - axios 默认 baseURL 是 https://inseq.top，所以 fetch 实际打的是
//     https://inseq.top/api/...；page.route('**/api/**') 的 glob 用 ** 可以匹配
//     任意 origin（Playwright 文档 confirm）。
//   - envelope() 包成后端 success() 同一形状：{ success:true, code:0, data, message }

import type { Page, Route } from '@playwright/test'

export const envelope = (data: unknown, message = 'success') => ({
  success: true,
  code: 0,
  message,
  data
})

export const failEnvelope = (message = 'fail', code = 'fail') => ({
  success: false,
  code,
  message,
  data: null
})

/** 给 route handler：用 envelope 包好返 200 JSON */
export const fulfillJson = async (route: Route, body: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body)
  })
}

/** 把所有 mock 路由一次性挂上；spec 自己组合 mocks 字典 */
export const installApiMocks = async (
  page: Page,
  mocks: Record<string, (route: Route) => Promise<void> | void>
) => {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace(/^\/+/, '/').replace(/\/+$/, '') // 规范化
    // 顺序匹配：精确 > 前缀（含 *）
    for (const [pattern, handler] of Object.entries(mocks)) {
      if (matches(pattern, path)) {
        await handler(route)
        return
      }
    }
    // 未命中 mock —— 兜底返一个温和的空 envelope，避免真的打到 https://inseq.top
    await fulfillJson(route, envelope(null, 'mocked-default'))
  })
}

const matches = (pattern: string, path: string) => {
  if (pattern === path) return true
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2)
    return path === prefix || path.startsWith(prefix + '/')
  }
  return false
}

/** 收集页面 console.error / pageerror，spec 末尾 assert 空 */
export const collectPageErrors = (page: Page) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      // 过滤已知的、非业务的噪音（比如 favicon 404、Sentry 自检）
      if (/sentry|favicon|hydration/i.test(text)) return
      errors.push(`[console.error] ${text}`)
    }
  })
  return errors
}
