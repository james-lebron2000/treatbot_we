// Streaming OCR 上传体验回归：
// - partial field_patch 只能点亮实时字段卡，不能提前露出最终结果 / 下一步 CTA。
// - completed SSE 只做快通知，最终结果仍必须经 parse-status-batch 确认。

import { test, expect } from '@playwright/test'
import { envelope, fulfillJson, installApiMocks, collectPageErrors } from './_helpers'

const primeUploadUser = async (page: import('@playwright/test').Page) => {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'fake-jwt')
    localStorage.setItem('refreshToken', 'fake-refresh')
    localStorage.setItem('onboardingSeenAt', String(Date.now()))
  })
}

const sse = (...frames: Array<{ event: string; data: Record<string, unknown>; id?: string }>) =>
  frames.map((frame) => {
    const lines = [
      ...(frame.id ? [`id: ${frame.id}`] : []),
      `event: ${frame.event}`,
      `data: ${JSON.stringify(frame.data)}`,
      ''
    ]
    return lines.join('\n')
  }).join('\n')

const commonMocks = (streamBody: string, parseStatusBatch: (route: Parameters<typeof fulfillJson>[0]) => Promise<void> | void) => ({
  '/api/me/consent': (route: Parameters<typeof fulfillJson>[0]) =>
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
  '/api/medical/upload-batch': (route: Parameters<typeof fulfillJson>[0]) =>
    fulfillJson(
      route,
      envelope({
        total: 1,
        successCount: 1,
        fileIds: ['r1'],
        records: [{ fileId: 'r1', recordId: 'r1', status: 'queued', ocrQueued: true }]
      })
    ),
  '/api/medical/parse-status-stream': (route: Parameters<typeof fulfillJson>[0]) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'cache-control': 'no-cache' },
      body: streamBody
    }),
  '/api/medical/parse-status-batch': parseStatusBatch,
  '/api/medical/timeline': (route: Parameters<typeof fulfillJson>[0]) =>
    fulfillJson(route, envelope({ timeline: null, recordCount: 1, sourceRecordIds: [] })),
  '/api/track': (route: Parameters<typeof fulfillJson>[0]) => fulfillJson(route, envelope({ accepted: true }))
})

const uploadOneFile = async (page: import('@playwright/test').Page) => {
  await page.goto('/treatbot/upload')
  await page.waitForLoadState('networkidle')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'streaming-report.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 streaming ux e2e')
  })
  await page.getByRole('button', { name: /开始解析/ }).click()
}

test('partial streaming fields do not unlock final review', async ({ page }) => {
  const errors = collectPageErrors(page)
  await primeUploadUser(page)
  await installApiMocks(page, commonMocks(
    sse(
      {
        event: 'state',
        id: 'r1:1',
        data: { recordId: 'r1', seq: 1, status: 'running', progress: 30, textLength: 1280 }
      },
      {
        event: 'state',
        id: 'r1:2',
        data: { recordId: 'r1', seq: 2, status: 'running', progress: 35, fieldGroup: 'diagnosis', fieldPatch: true, fields: { diagnosis: '非小' } }
      },
      {
        event: 'state',
        id: 'r1:3',
        data: { recordId: 'r1', seq: 3, status: 'running', progress: 45, fieldGroup: 'diagnosis', fields: { diagnosis: '非小细胞肺癌', stage: 'IV 期' } }
      }
    ),
    (route) =>
      fulfillJson(
        route,
        envelope({
          total: 1,
          completedCount: 0,
          erroredCount: 0,
          done: false,
          entries: [{ fileId: 'r1', recordId: 'r1', status: 'running', progress: 35 }]
        })
      )
  ))

  await uploadOneFile(page)

  await expect(page.getByText('非小细胞肺癌').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('非小', { exact: true })).toBeHidden()
  await expect(page.getByText(/已识别约 1280 字/)).toBeVisible()
  await expect(page.getByText('好了')).toBeHidden()
  await expect(page.getByRole('button', { name: /看看为家人找到的可能性/ })).toBeHidden()
  expect(errors, errors.join('\n')).toEqual([])
})

test('terminal stream is confirmed through parse-status-batch before review', async ({ page }) => {
  const errors = collectPageErrors(page)
  await primeUploadUser(page)
  let batchCalls = 0
  await installApiMocks(page, commonMocks(
    sse(
      {
        event: 'state',
        id: 'r1:1',
        data: { recordId: 'r1', seq: 1, status: 'running', progress: 40, fieldGroup: 'diagnosis', fields: { diagnosis: '非小细胞肺癌' } }
      },
      {
        event: 'state',
        id: 'r1:2',
        data: { recordId: 'r1', seq: 2, status: 'completed', progress: 100, result: { entities: { diagnosis: '非小细胞肺癌', stage: 'IV 期', geneMutation: 'EGFR L858R' } } }
      },
      { event: 'done', data: { reason: 'all_terminal' } }
    ),
    (route) => {
      batchCalls += 1
      return fulfillJson(
        route,
        envelope({
          total: 1,
          completedCount: 1,
          erroredCount: 0,
          done: true,
          entries: [
            {
              fileId: 'r1',
              recordId: 'r1',
              status: 'completed',
              progress: 100,
              result: { diagnosis: '非小细胞肺癌', stage: 'IV 期', geneMutation: 'EGFR L858R' }
            }
          ]
        })
      )
    }
  ))

  await uploadOneFile(page)

  await expect(page.getByText('好了')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: /看看为家人找到的可能性/ })).toBeVisible()
  expect(batchCalls).toBeGreaterThanOrEqual(1)
  expect(errors, errors.join('\n')).toEqual([])
})
