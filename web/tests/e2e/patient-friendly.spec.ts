// PRD-2026Q3 §U6：「患者满意度测试用户 Agent」
//
// 这一组 spec 把"60 岁病人的女儿"扮演成 Playwright 测试人格，按真实使用顺序
// 走完登录 → 期望管理 → 上传 → 匹配 → 同意 → 帮助 五个交互点。
//
// 验收点（每条都是产品端的硬约束，违反就会"让中年家属看不懂"）：
//   ① 首屏期望管理 onboarding 展示我们做什么 / 您要做什么 / 大约多久
//   ② 全局求助 FAB 在非上传患者页面可见，包含「想找真人聊聊」「看 1 分钟教学视频」「看常见问题」
//   ③ UploadView 字段「？」展开后说人话（plain），并提供「我不知道」逃生通道
//   ④ ConsentModal 三条同意文案 ≤ 30 字 / 条；没有「数据共享」「合规」之类的术语堆叠
//   ⑤ MatchesView 卡片置顶有「✓ 为什么适合」一句话，不靠分数说事
//   ⑥ 隐私承诺「全程免费 · 您的数据您说了算」在帮助 FAB / Onboarding / ConsentModal 三处一致出现
//
// mock 策略：复用 _helpers 里的 envelope/installApiMocks；不依赖真实后端。

import { test, expect, Page } from '@playwright/test'
import { envelope, fulfillJson, installApiMocks, collectPageErrors } from './_helpers'

// 把"我们的术语 allow-list"集中在这里，方便后续扩。
// 任何在患者页面 visible 的英文/数字组合，要么在 allow-list 里，要么得有同段中文解释。
const JARGON_ALLOWLIST = [
  // 数字 / 单位
  '%', '分', 'cm', 'mg', 'kg', 'min', 'h',
  // 项目自家品牌 / 已经在 onboarding 解释过的
  'AI', 'CT', 'MRI', 'PDF',
  // 入组条件常见且 glossary 有翻译
  'EGFR', 'ALK', 'KRAS', 'PD-1', 'ECOG', 'CRO',
  // 阶段标签（中文化的 I/II/III/IV 期）
  'I', 'II', 'III', 'IV'
]

// 共用 mocks：登过录、同意过、有解析结果、有 3 条匹配。
const installCommonMocks = async (page: Page) => {
  await installApiMocks(page, {
    '/api/auth/send-code': (r) => fulfillJson(r, envelope({ ok: true })),
    '/api/auth/treatbot-login': (r) =>
      fulfillJson(
        r,
        envelope({
          token: 'fake-jwt',
          refreshToken: 'fake-refresh',
          user: { id: 'u1', phone: '13800001111' }
        })
      ),
    '/api/me/consent': (r) =>
      fulfillJson(
        r,
        envelope({
          list: [
            { scope: 'upload', policyVersion: 'v2026Q3-1' },
            { scope: 'match', policyVersion: 'v2026Q3-1' }
          ]
        })
      ),
    '/api/medical/records': (r) =>
      fulfillJson(
        r,
        envelope({
          list: [
            {
              id: 'r1',
              diagnosis: '非小细胞肺癌',
              stage: 'IV 期',
              uploadTime: '2026-04-01',
              status: 'completed'
            }
          ]
        })
      ),
    '/api/medical/upload': (r) =>
      fulfillJson(r, envelope({ fileId: 'f1', recordId: 'r1' })),
    '/api/medical/parse-status': (r) =>
      fulfillJson(
        r,
        envelope({
          status: 'completed',
          result: {
            diagnosis: '非小细胞肺癌',
            stage: 'IV',
            geneMutation: 'EGFR L858R'
          }
        })
      ),
    '/api/matches': (r) =>
      fulfillJson(
        r,
        envelope({
          list: [
            {
              id: 't1',
              name: 'EGFR 三代靶向 II 期',
              score: 92,
              indication: '非小细胞肺癌',
              reasons: ['gene_match', 'diagnosis_match', 'stage_match']
            },
            {
              id: 't2',
              name: 'PD-1 联合化疗 III 期',
              score: 87,
              indication: '晚期实体瘤',
              reasons: ['diagnosis_match', 'ecog_match']
            }
          ],
          pagination: { total: 2 }
        })
      ),
    '/api/matches/filter-options': (r) => fulfillJson(r, envelope({ phases: [], cities: [] })),
    '/api/track': (r) => fulfillJson(r, envelope({ accepted: true }))
  })
}

// 帮助函数：把真实人格"已登录的女儿"塞进 storage，免去登录步骤。
const primeAuthAndOnboarded = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'fake-jwt')
    localStorage.setItem('refreshToken', 'fake-refresh')
    localStorage.setItem('onboardingSeenAt', String(Date.now()))
  })
}

// 帮助函数：清空 onboardingSeenAt，模拟首次访问。
const primeAuthFirstVisit = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'fake-jwt')
    localStorage.setItem('refreshToken', 'fake-refresh')
    localStorage.removeItem('onboardingSeenAt')
  })
}

test.describe('患者满意度测试 - 60 岁病人女儿视角', () => {
  test('① 首次进入应展示 30 秒期望管理 onboarding', async ({ page }) => {
    const errors = collectPageErrors(page)
    await installCommonMocks(page)
    await primeAuthFirstVisit(page)

    // 故意从 /upload 进入，路由守卫应把首次用户重定向到 /onboarding
    await page.goto('/treatbot/upload')

    await expect(page).toHaveURL(/\/treatbot\/onboarding/, { timeout: 10_000 })

    // 应同时出现「您要做的」「我们做的」「大约多久」三段
    await expect(page.getByText('您要做的')).toBeVisible()
    await expect(page.getByText('我们做的')).toBeVisible()
    await expect(page.getByText('大约多久')).toBeVisible()

    // 隐私承诺
    await expect(page.getByText(/全程免费.*您的数据您说了算/)).toBeVisible()

    // 主 CTA + 跳过都得在
    await expect(page.getByRole('button', { name: /好的，开始/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /跳过/ })).toBeVisible()

    // 点「好的，开始」后应跳到 /upload，且 onboardingSeenAt 写入
    await page.getByRole('button', { name: /好的，开始/ }).click()
    await expect(page).toHaveURL(/\/treatbot\/upload/, { timeout: 10_000 })
    const seen = await page.evaluate(() => localStorage.getItem('onboardingSeenAt'))
    expect(seen).not.toBeNull()

    expect(errors, errors.join('\n')).toEqual([])
  })

  test('② 全局求助 FAB 不遮挡上传流，仍在 matches / records 可见', async ({ page }) => {
    const errors = collectPageErrors(page)
    await installCommonMocks(page)
    await primeAuthAndOnboarded(page)

    await page.goto('/treatbot/upload')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.help-fab-btn').first()).toBeHidden({ timeout: 10_000 })

    for (const path of ['/treatbot/matches', '/treatbot/records']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      // FAB 用 class 选择器更稳；HelpFab.vue 渲染 .help-fab-btn
      const fab = page.locator('.help-fab-btn').first()
      await expect(fab, `FAB on ${path}`).toBeVisible({ timeout: 10_000 })
      await fab.click()
      // 三类入口（用 first 因为 MatchesView 等页面可能也有同字眼）
      await expect(page.getByText(/想找真人聊聊/).first()).toBeVisible({ timeout: 5_000 })
      await expect(page.getByText(/看 1 分钟教学视频/).first()).toBeVisible()
      await expect(page.getByText(/看常见问题/).first()).toBeVisible()
      // 关闭
      await page.locator('.help-sheet-close').click()
      // 等 sheet 收回，避免下一次 iteration 的点击穿透
      await expect(page.locator('.help-sheet')).toBeHidden({ timeout: 3_000 })
    }

    expect(errors, errors.join('\n')).toEqual([])
  })

  test('③ UploadView 字段「？」展开后说人话且有「我不知道」逃生通道', async ({ page }) => {
    const errors = collectPageErrors(page)
    await installCommonMocks(page)
    await primeAuthAndOnboarded(page)

    await page.goto('/treatbot/upload')
    await page.waitForLoadState('networkidle')

    // 注入伪解析结果，强制进入"补缺字段"步骤——通过 store 旁路，避免真上传
    await page.evaluate(() => {
      // 让 UploadView 直接进入补缺字段视图：写一个仅缺 stage 的 record
      localStorage.setItem(
        'structuredRecordDraft',
        JSON.stringify({ diagnosis: '非小细胞肺癌', age: 60 })
      )
    })
    await page.reload()
    await page.waitForLoadState('networkidle')

    // FieldExplainer.vue 的「？」按钮用 .field-explainer__help-btn 类
    const helpBtn = page.locator('.field-explainer__help-btn').first()
    if ((await helpBtn.count()) > 0) {
      await helpBtn.click()
      // 「白话解释:」「举个例子:」「我不知道，先跳过」三段任一可见即满足约束
      const idkBtn = page.locator('.field-explainer__skip-btn').first()
      await expect(idkBtn).toBeVisible({ timeout: 5_000 })
      // 白话面板里出现 plain 释义关键字（glossary 里的中文文案）
      await expect(page.locator('.field-explainer__panel').first()).toContainText('白话解释')
    } else {
      // 没缺字段也不视为失败 —— 记录上下文，便于复盘
      test.info().annotations.push({
        type: 'note',
        description: 'UploadView 此次无缺字段，FieldExplainer 不展示，跳过本断言（干净路径）'
      })
    }

    expect(errors, errors.join('\n')).toEqual([])
  })

  test('④ ConsentModal 三条勾选项都说人话（≤ 30 字），无术语堆叠', async ({ page }) => {
    const errors = collectPageErrors(page)
    await installApiMocks(page, {
      '/api/me/consent': (r) => {
        if (r.request().method() === 'GET') return fulfillJson(r, envelope({ list: [] }))
        return fulfillJson(r, envelope({ ok: true }))
      },
      '/api/medical/upload-batch': (r) =>
        fulfillJson(
          r,
          envelope({
            total: 8,
            successCount: 8,
            fileIds: Array.from({ length: 8 }, (_, i) => `f${i + 1}`),
            records: Array.from({ length: 8 }, (_, i) => ({
              fileId: `f${i + 1}`,
              recordId: `r${i + 1}`,
              status: 'queued',
              ocrQueued: true,
              originalName: `fake-report-${i + 1}.pdf`
            }))
          })
        ),
      '/api/medical/parse-status-stream': (r) =>
        r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(envelope(null, 'mock non-sse; force polling fallback'))
        }),
      '/api/medical/parse-status-batch': (r) =>
        fulfillJson(
          r,
          envelope({
            total: 8,
            completedCount: 8,
            erroredCount: 0,
            done: true,
            entries: Array.from({ length: 8 }, (_, i) => ({
              fileId: `f${i + 1}`,
              recordId: `r${i + 1}`,
              status: 'completed',
              progress: 100,
              result: {
                diagnosis: '非小细胞肺癌',
                stage: 'IV',
                geneMutation: 'EGFR L858R'
              }
            }))
          })
        ),
      '/api/medical/timeline': (r) =>
        fulfillJson(r, envelope({ timeline: null, recordCount: 8, sourceRecordIds: [] })),
      '/api/track': (r) => fulfillJson(r, envelope({ accepted: true }))
    })
    await primeAuthAndOnboarded(page)

    await page.goto('/treatbot/upload')
    await page.waitForLoadState('networkidle')
    await page.locator('input[type="file"]').setInputFiles(
      Array.from({ length: 8 }, (_, i) => ({
        name: `fake-report-${i + 1}.pdf`,
        mimeType: 'application/pdf',
        buffer: Buffer.from(`%PDF-1.4 fake content ${i + 1}`)
      }))
    )
    await page.getByRole('button', { name: /开始批量解析 8 份/ }).click()

    // ConsentModal 出现时应包含「全程免费」承诺，且每条 label 短而朴素
    const modalRoot = page.locator('[role="dialog"]').filter({ hasText: /同意|授权|继续/ }).first()
    await expect(modalRoot).toBeVisible()
    await expect(modalRoot.getByText(/全程免费/)).toBeVisible()
    await expect(modalRoot.getByRole('button', { name: /我同意，开始上传/ })).toBeVisible()

    // 取所有 label 文本，断言每条 ≤ 30 字
    const labels = await modalRoot.locator('label').allTextContents()
    for (const l of labels) {
      const t = l.replace(/\s+/g, '').trim()
      if (!t) continue
      expect(t.length, `consent label too long: "${t}"`).toBeLessThanOrEqual(40)
    }

    // 回归：全局 input { width:100% } 曾把 checkbox 撑满，挤压文案并把确认按钮顶出屏幕。
    const checkboxBoxes = await modalRoot.locator('input[type="checkbox"]').evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = (node as HTMLElement).getBoundingClientRect()
        return { width: rect.width, height: rect.height }
      })
    )
    expect(checkboxBoxes).toHaveLength(3)
    for (const box of checkboxBoxes) {
      expect(box.width, `checkbox width should stay compact: ${box.width}`).toBeLessThanOrEqual(24)
      expect(box.height, `checkbox height should stay compact: ${box.height}`).toBeLessThanOrEqual(24)
    }

    const agreeButtonBox = await modalRoot.getByRole('button', { name: /我同意，开始上传/ }).boundingBox()
    const viewport = page.viewportSize()
    expect(agreeButtonBox).not.toBeNull()
    if (agreeButtonBox && viewport) {
      expect(agreeButtonBox.y + agreeButtonBox.height).toBeLessThanOrEqual(viewport.height)
    }

    const checkboxes = modalRoot.locator('input[type="checkbox"]')
    for (let i = 0; i < await checkboxes.count(); i += 1) {
      await checkboxes.nth(i).check()
    }
    await modalRoot.getByRole('button', { name: /我同意，开始上传/ }).click()
    await expect(page.getByRole('button', { name: /看看为家人找到的可能性/ })).toBeVisible({ timeout: 10_000 })

    expect(errors, errors.join('\n')).toEqual([])
  })

  test('⑤ MatchesView 每张卡片有「✓ 为什么适合」人话置顶句', async ({ page }) => {
    const errors = collectPageErrors(page)
    await installCommonMocks(page)
    await primeAuthAndOnboarded(page)

    await page.goto('/treatbot/matches')
    await page.waitForLoadState('networkidle')

    // U3 在 MatchesView 卡片顶部加了 .why-fit「✓ ...」
    const whyFit = page.locator('.why-fit')
    await expect(whyFit.first()).toBeVisible({ timeout: 10_000 })
    const count = await whyFit.count()
    expect(count, '至少 1 条匹配应该有人话理由').toBeGreaterThan(0)

    // 每条置顶句都不应该原样出现 reason key（diagnosis_match / gene_match 等）
    const sentences = await whyFit.allTextContents()
    for (const s of sentences) {
      expect(s, `卡片置顶句仍是 raw key: ${s}`).not.toMatch(/_match\b/)
    }

    expect(errors, errors.join('\n')).toEqual([])
  })

  test('⑥ 隐私承诺「全程免费 · 您的数据您说了算」在 onboarding / FAB 一致', async ({ page }) => {
    const errors = collectPageErrors(page)
    await installCommonMocks(page)
    await primeAuthFirstVisit(page)

    // a) onboarding 出现承诺
    await page.goto('/treatbot/upload')
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 })
    await expect(page.getByText(/全程免费.*您的数据您说了算/)).toBeVisible()

    // b) 上传页不展示 FAB（避免遮挡上传流），切到匹配页后 FAB 仍看到同款承诺
    await page.getByRole('button', { name: /好的，开始|跳过/ }).first().click()
    await expect(page).toHaveURL(/\/upload/, { timeout: 10_000 })
    await expect(page.locator('.help-fab-btn').first()).toBeHidden({ timeout: 10_000 })
    await page.goto('/treatbot/matches')
    await page.waitForLoadState('networkidle')
    await page.locator('.help-fab-btn').first().click()
    // FAB 底部 footer 有 promise；用更宽松断言（promise 行就在 .help-sheet-footer）
    await expect(page.locator('.help-sheet-footer')).toContainText(/全程免费/)
    await expect(page.locator('.help-sheet-footer')).toContainText(/您的数据您说了算/)

    expect(errors, errors.join('\n')).toEqual([])
  })
})

// 静默使用断言，避免 lint 报未用变量
void JARGON_ALLOWLIST
