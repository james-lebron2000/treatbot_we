// Q3-红线 §B.3：Admin Web 后台 happy path。
//
// 验证：
//   1. 注入 fake admin token 跳过 requireAuth
//   2. mock /api/admin/dashboard /admin/users /admin/records
//   3. Dashboard、注册用户、上传数据页面可切换，phone 显示已脱敏

import { test, expect } from '@playwright/test'
import { envelope, fulfillJson, installApiMocks, collectPageErrors } from './_helpers'

test('admin 审核全链路', async ({ page }) => {
  const errors = collectPageErrors(page)

  await installApiMocks(page, {
    '/api/admin/login': (route) =>
      fulfillJson(
        route,
        envelope({
          token: 'fake-dedicated-admin-jwt',
          expiresIn: 3600,
          admin: { id: 'admin:treatbot_admin', username: 'treatbot_admin', canReveal: true }
        })
      ),
    '/api/admin/dashboard': (route) =>
      fulfillJson(
        route,
        envelope({
          range: { startDate: '2026-04-26', endDate: '2026-05-02' },
          overview: {
            totalUsers: 128,
            uploadedUsers: 76,
            totalRecords: 240,
            completedRecords: 218,
            errorRecords: 4,
            processingRecords: 18,
            totalApplications: 56,
            todayUsers: 3,
            todayRecords: 9,
            todayApplications: 2,
            last7Users: 16,
            last7Records: 42,
            last7Applications: 11,
            appliedUsers: 38
          },
          dailyTrend: [
            { date: '2026-05-01', users: 3, records: 8, applications: 2 },
            { date: '2026-05-02', users: 2, records: 6, applications: 1 }
          ],
          funnel: {
            landingView: 100,
            uploadStart: 66,
            uploadSuccess: 58,
            matchView: 44,
            trialApply: 18,
            applicationSubmitted: 12,
            uploadToApplicationRate: 20.7
          },
          dataQuality: {
            parseSuccessRate: 90.8,
            parseErrorRate: 1.7,
            errorRecords: 4,
            recentErrors: []
          },
          recordStatus: [],
          applicationStatus: []
        })
      ),
    '/api/admin/users': (route) =>
      fulfillJson(
        route,
        envelope({
          list: [
            {
              userId: 'u-1',
              nickname: '张*',
              phone: '138****1234',
              recordCount: 2,
              completedRecordCount: 2,
              applicationCount: 1,
              latestDiagnosis: '肺癌',
              createdAt: '2026-04-10'
            },
            {
              userId: 'u-2',
              nickname: '李*',
              phone: '139****5678',
              recordCount: 1,
              completedRecordCount: 1,
              applicationCount: 0,
              latestDiagnosis: '胃癌',
              createdAt: '2026-04-11'
            }
          ],
          pagination: { total: 2, page: 1, pageSize: 20, hasMore: false }
        })
      ),
    '/api/admin/records': (route) =>
      fulfillJson(
        route,
        envelope({
          list: [
            {
              recordId: 'rec-1',
              userId: 'u-1',
              userNickname: '张*',
              userPhone: '138****1234',
              uploadTime: '2026-04-20T08:30:00Z',
              parseStatus: 'completed',
              fileType: '病理报告',
              fileSize: 102400,
              diagnosis: '肺癌',
              stage: 'IV期',
              geneMutation: 'EGFR L858R',
              matchCount: 5,
              applicationCount: 1,
              structured: { entities: { cancerType: '肺癌' } }
            }
          ],
          pagination: { total: 1, page: 1, pageSize: 20, hasMore: false }
        })
      ),
    '/api/track': (route) => fulfillJson(route, envelope({ accepted: true }))
  })

  await page.goto('/treatbot/admin')
  await page.waitForLoadState('networkidle')

  await expect(page.getByRole('heading', { name: '数愈管理端' })).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('admin-username').fill('treatbot_admin')
  await page.getByTestId('admin-key').fill('mock-admin-key')
  await page.getByTestId('admin-login-button').click()
  await page.waitForURL('**/treatbot/admin/dashboard')

  await expect(page.getByText('数愈管理端')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('总注册用户')).toBeVisible()
  await expect(page.getByText('上传到报名漏斗')).toBeVisible()

  await page.getByRole('link', { name: /注册用户/ }).click()
  await expect(page.getByRole('heading', { name: '注册用户' }).first()).toBeVisible()
  await expect(page.getByText(/138\*+1234/).first()).toBeVisible()

  await page.getByRole('link', { name: /上传数据/ }).click()
  await expect(page.getByRole('heading', { name: '上传数据' }).first()).toBeVisible()
  await expect(page.getByText('EGFR L858R').first()).toBeVisible()
  await expect(page.getByText(/138\*+1234/).first()).toBeVisible()

  expect(errors, errors.join('\n')).toEqual([])
})
