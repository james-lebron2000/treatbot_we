// Q3-红线 §B.3：DemoView happy path。
//
// 验证：
//   1. /treatbot/demo 直访免登录
//   2. mock /api/demo/samples → /api/demo/samples/:id/result → /matches
//   3. 控制台无未捕获错误

import { test, expect } from '@playwright/test'
import { envelope, fulfillJson, installApiMocks, collectPageErrors } from './_helpers'

test('demo 浏览全链路', async ({ page }) => {
  const errors = collectPageErrors(page)

  await installApiMocks(page, {
    '/api/demo/samples': (route) =>
      fulfillJson(
        route,
        envelope({
          // DemoView 读 res?.list，所以用 list 字段
          list: [
            {
              id: 'demo-1',
              title: '60 岁王女士 / 非小细胞肺癌 IV 期',
              summary: 'EGFR 21 突变，靶向耐药后入组试验',
              age: 60,
              sex: '女',
              diagnosisHint: '肺癌 IV',
              thumbUrl: ''
            }
          ]
        })
      ),
    '/api/demo/samples/*': (route) =>
      fulfillJson(
        route,
        envelope({
          patient: {
            diagnosis: '非小细胞肺癌',
            stage: 'IV',
            geneMutation: 'EGFR L858R',
            ecog: 1
          },
          matches: [
            { id: 'demo-t1', name: '三代 EGFR 靶向药 II 期', score: 88 },
            { id: 'demo-t2', name: 'KRAS 抑制剂联合疗法', score: 76 }
          ]
        })
      ),
    '/api/track': (route) => fulfillJson(route, envelope({ accepted: true }))
  })

  await page.goto('/treatbot/demo')
  await page.waitForLoadState('networkidle')

  // 主标题
  await expect(page.getByText(/30\s*秒看看/)).toBeVisible({ timeout: 10_000 })
  // 至少一个样本卡片可见
  await expect(page.getByText(/非小细胞肺癌|王女士|EGFR/).first()).toBeVisible()

  expect(errors, errors.join('\n')).toEqual([])
})
