// Q3-红线 §B.3：登录 → 上传 → 匹配 happy path。
//
// 全程 mock /api/**，不依赖真实后端。验证：
//   1. 验证码登录走通 token 持久化
//   2. UploadView 能跳过同意（mock 已存 consent）→ 直接 upload + 解析
//   3. parse-status 轮询能完成 → patientStore 写入 → 跳 /matches
//   4. /matches 渲染至少 3 张 trial 卡片

import { test, expect } from '@playwright/test'
import { envelope, fulfillJson, installApiMocks, collectPageErrors } from './_helpers'

test('login → upload → match 全链路', async ({ page }) => {
  const errors = collectPageErrors(page)

  // PRD-2026Q3 §U5：本 spec 关注上传 → 匹配主链路；提前把 onboardingSeenAt 写好，
  // 避免 router 守卫把首次访问的 /upload 重定向到 /onboarding。
  await page.addInitScript(() => {
    localStorage.setItem('onboardingSeenAt', String(Date.now()))
  })

  // ---- mock 字典 ----
  // Phase E.2：UploadView 已切到批量端点（/upload-batch + /parse-status-batch），
  // 即便只选 1 份文件也走 batch；legacy single endpoints 仍保留给 retryParse 用。
  let parseStatusCallCount = 0
  let parseStatusBatchCallCount = 0
  const parsedResult = {
    diagnosis: '非小细胞肺癌',
    stage: 'IV',
    geneMutation: 'EGFR L858R'
  }
  await installApiMocks(page, {
    '/api/auth/send-code': (route) => fulfillJson(route, envelope({ ok: true })),
    '/api/auth/h5-login': (route) =>
      fulfillJson(
        route,
        envelope({
          token: 'fake-jwt-token',
          refreshToken: 'fake-refresh',
          user: { id: 'u1', phone: '13800001111' }
        })
      ),
    '/api/me/consent': (route) =>
      fulfillJson(
        route,
        envelope({
          list: [
            { scope: 'upload', policyVersion: 'v2026Q3-1' },
            { scope: 'match', policyVersion: 'v2026Q3-1' },
            { scope: 'share_with_cro', policyVersion: 'v2026Q3-1' }
          ]
        })
      ),
    '/api/medical/upload': (route) =>
      fulfillJson(route, envelope({ fileId: 'f1', recordId: 'r1' })),
    '/api/medical/upload-batch': (route) =>
      fulfillJson(
        route,
        envelope({
          total: 1,
          successCount: 1,
          fileIds: ['f1'],
          records: [
            {
              fileId: 'f1',
              recordId: 'r1',
              status: 'queued',
              ocrQueued: true,
              originalName: 'fake-report.pdf'
            }
          ]
        })
      ),
    '/api/medical/parse-status': (route) => {
      parseStatusCallCount += 1
      // 第一次返回 running，第二次起返回 done，模拟真实异步 OCR
      const body =
        parseStatusCallCount < 2
          ? envelope({ status: 'running' })
          : envelope({
              status: 'completed',
              result: parsedResult
            })
      return fulfillJson(route, body)
    },
    '/api/medical/parse-status-batch': (route) => {
      parseStatusBatchCallCount += 1
      const isFirstCall = parseStatusBatchCallCount < 2
      const body = envelope({
        total: 1,
        completedCount: isFirstCall ? 0 : 1,
        erroredCount: 0,
        done: !isFirstCall,
        entries: [
          {
            fileId: 'f1',
            recordId: 'r1',
            status: isFirstCall ? 'running' : 'completed',
            progress: isFirstCall ? 30 : 100,
            ...(isFirstCall ? {} : { result: parsedResult })
          }
        ]
      })
      return fulfillJson(route, body)
    },
    // 单文件场景永远不到 timeline 阈值（≥2 完成才触发），但留个温和的兜底
    '/api/medical/timeline': (route) =>
      fulfillJson(route, envelope({ timeline: null, recordCount: 1, sourceRecordIds: [] })),
    '/api/matches': (route) =>
      fulfillJson(
        route,
        envelope({
          list: [
            { id: 't1', name: 'EGFR 三代靶向 II 期', score: 92, indication: '非小细胞肺癌' },
            { id: 't2', name: 'PD-1 联合化疗 III 期', score: 87, indication: '晚期实体瘤' },
            { id: 't3', name: '泛瘤种 ADC 探索', score: 81, indication: '泛实体瘤' }
          ],
          pagination: { total: 3 }
        })
      ),
    '/api/matches/filter-options': (route) =>
      fulfillJson(route, envelope({ phases: [], cities: [] })),
    '/api/medical/records': (route) => fulfillJson(route, envelope({ list: [] })),
    '/api/track': (route) => fulfillJson(route, envelope({ accepted: true }))
  })

  // ---- step 1: 登录 ----
  await page.goto('/treatbot/login')
  await page.locator('input[placeholder*="手机号"]').fill('13800001111')
  await page.locator('input[placeholder*="验证码"]').fill('000000')
  // 登录按钮文案在不同状态会切换；用 type=primary + 全宽按钮定位
  await page.getByRole('button', { name: /登录|进入|提交/ }).click()

  // 跳转默认到 /upload （路由 / redirects /upload）
  await expect(page).toHaveURL(/\/treatbot\/(upload|records|$)/, { timeout: 15_000 })

  // ---- step 2: 上传 ----
  // 直接到 upload（万一登陆后跳到了其他页）
  await page.goto('/treatbot/upload')

  // 等 hasUploadConsent 检查完成（getMyConsent mock 返已同意）
  await page.waitForLoadState('networkidle')

  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles({
    name: 'fake-report.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 fake content for e2e')
  })

  // 点"开始解析"
  await page.getByRole('button', { name: /开始解析/ }).click()

  // 等待解析进入完成状态 —— 此时 UploadView 会展示一个 toMatches CTA。
  // 点 CTA 后才 router.push('/matches')，等待最多 30s。
  await expect(page.getByRole('button', { name: /看看为家人|查看试验|看看可能性/ })).toBeVisible({
    timeout: 30_000
  })
  await page.getByRole('button', { name: /看看为家人|查看试验|看看可能性/ }).click()

  await expect(page).toHaveURL(/\/treatbot\/matches/, { timeout: 15_000 })

  // ---- step 3: matches 列表 ----
  await page.waitForLoadState('networkidle')
  // 至少能看到 3 个 trial 名字之一
  await expect(page.getByText('EGFR 三代靶向 II 期').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('PD-1 联合化疗 III 期').first()).toBeVisible()
  await expect(page.getByText('泛瘤种 ADC 探索').first()).toBeVisible()

  // 没有未捕获的 page error
  expect(errors, errors.join('\n')).toEqual([])
})
