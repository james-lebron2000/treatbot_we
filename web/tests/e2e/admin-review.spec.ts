// Q3-红线 §B.3：AdminView 审核台 happy path。
//
// 验证：
//   1. 注入 fake admin token 跳过 requireAuth
//   2. mock /api/admin/dashboard /admin/applications /admin/users
//   3. 列表渲染 + phone 显示已脱敏 (138****1234 形)

import { test, expect } from '@playwright/test'
import { envelope, fulfillJson, installApiMocks, collectPageErrors } from './_helpers'

test('admin 审核全链路', async ({ page }) => {
  const errors = collectPageErrors(page)

  // 路由 guard 只检查 authStore.token，不校验真实 admin 角色（admin 真鉴权在后端）
  await page.addInitScript(() => {
    localStorage.setItem('token', 'fake-admin-jwt')
  })

  await installApiMocks(page, {
    '/api/admin/dashboard': (route) =>
      fulfillJson(
        route,
        envelope({
          totalUsers: 128,
          totalRecords: 240,
          totalApplications: 56,
          totalTrials: 18,
          todayUsers: 3
        })
      ),
    '/api/admin/applications': (route) =>
      fulfillJson(
        route,
        envelope({
          list: [
            {
              id: 'app-1',
              userPhone: '138****1234',
              trialName: 'EGFR 三代靶向 II 期',
              status: 'pending',
              createdAt: '2026-04-20T08:30:00Z'
            },
            {
              id: 'app-2',
              userPhone: '139****5678',
              trialTitle: 'PD-1 联合化疗 III 期',
              status: 'approved',
              createdAt: '2026-04-22T10:15:00Z'
            }
          ],
          total: 2
        })
      ),
    '/api/admin/users': (route) =>
      fulfillJson(
        route,
        envelope({
          list: [
            { id: 'u-1', phone: '138****1234', createdAt: '2026-04-10' },
            { id: 'u-2', phone: '139****5678', createdAt: '2026-04-11' }
          ],
          total: 2
        })
      ),
    '/api/admin/cro/list': (route) =>
      fulfillJson(route, envelope({ list: [] })),
    '/api/admin/trials': (route) => fulfillJson(route, envelope({ list: [] })),
    '/api/track': (route) => fulfillJson(route, envelope({ accepted: true }))
  })

  await page.goto('/treatbot/admin')
  await page.waitForLoadState('networkidle')

  // 标题
  await expect(page.getByRole('heading', { name: '管理后台' })).toBeVisible({ timeout: 10_000 })

  // 默认在"概览"tab —— 切到"申请管理"
  await page.getByRole('button', { name: '申请管理' }).click()

  // 应用列表中能看到至少一条试验
  await expect(page.getByText(/EGFR 三代靶向/).first()).toBeVisible({ timeout: 10_000 })

  // phone 应已脱敏（包含 ****）
  await expect(page.getByText(/138\*+1234/).first()).toBeVisible()

  expect(errors, errors.join('\n')).toEqual([])
})
