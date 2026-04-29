// PRD-2026Q2 §3.x：演示模式富信息病例（sample-3-sba 小肠腺癌）e2e 覆盖。
//
// 与 demo-browse.spec.ts 互补 —— 后者只走 happy path 三件套（list/result/matches
// 都是简化数据），本 spec 把 Agent A 新加入的「灯塔癌症导航报告」12 节富信息
// 病例（timeline / molecular / organoidDrugSensitivity / imaging / tumorMarkers /
// treatmentHistory / vMTBPlans / infoGaps / priorityActions）和 Agent B 的
// 癌种一致性硬排除全部覆盖一遍。
//
// 全程 mock /api/**，与 _helpers 一致；不依赖真实后端。
//
// 关键约定：
//   - RecordSummaryCard 渲染 12 节使用 `.summary-section / .section-header /
//     .section-body` 三件套（Agent A 协议）。如默认折叠，先点击 header 再断言 body。
//   - 匿名性硬要求：屏幕上不得出现「钱志达」「长海」「1967」等可还原身份的字段。
//   - 癌种一致：sample-3-sba 不得匹配到 HER2/乳腺；sample-2-nsclc 不得匹配
//     「驱动基因阴性 NSCLC」试验；sample-1-hcc 不得匹配 HER2/乳腺。

import { test, expect, type Page } from '@playwright/test'
import { envelope, fulfillJson, installApiMocks, collectPageErrors } from './_helpers'

// ---- mock 数据 -------------------------------------------------------------

const SAMPLES = [
  {
    id: 'sample-1-hcc',
    title: '58 岁男士 / 肝细胞癌 IIIb 期',
    summary: 'HBV 相关 HCC，门脉癌栓，多线 TKI + 免疫联合后进展',
    age: 58,
    sex: '男',
    diagnosisHint: '肝细胞癌 IIIb',
    thumbUrl: ''
  },
  {
    id: 'sample-2-nsclc',
    title: '60 岁女士 / 非小细胞肺癌 IV 期',
    summary: 'EGFR L858R，三代 TKI 耐药入组探索',
    age: 60,
    sex: '女',
    diagnosisHint: '非小细胞肺癌 IV',
    thumbUrl: ''
  },
  {
    id: 'sample-3-sba',
    title: '57 岁先生 / 小肠腺癌 IV 期',
    summary: 'KRAS G12D + PIK3CA 双驱动，CapeOX-Bev 维持中',
    age: 57,
    sex: '男',
    diagnosisHint: '小肠腺癌 IV',
    thumbUrl: ''
  }
]

const SBA_RESULT = {
  // legacy 字段（RecordSummaryCard 现有渲染需要）
  diagnosis: '小肠腺癌（空肠原发，腹膜多发转移）',
  stage: 'IV期',
  ecog: 1,
  geneMutation: 'KRAS G12D, PIK3CA H1047R',
  treatment: 'FOLFOX → CapeOX + 贝伐珠单抗维持',
  treatmentLine: 2,
  // 12 节富信息（Agent A 协议）
  timeline: [
    { date: '2023-12-01', event: '确诊 小肠腺癌 IV 期，腹膜转移' },
    { date: '2024-01-10', event: '一线 FOLFOX × 8 周期，PR' },
    { date: '2024-06-15', event: '维持治疗：CapeOX + 贝伐珠单抗' },
    { date: '2024-11-20', event: 'CT 评估：SD，CA125 平稳' }
  ],
  molecular: {
    drivers: [
      { gene: 'KRAS', variant: 'G12D', vaf: 0.32, tier: 'I' },
      { gene: 'PIK3CA', variant: 'H1047R', vaf: 0.18, tier: 'II' }
    ],
    biomarkers: {
      msi: 'MSS',
      tmb: { value: 6.2, level: '中等' },
      pdl1: 'CPS 3'
    }
  },
  organoidDrugSensitivity: {
    sensitive: ['5-FU', 'Oxaliplatin', 'Irinotecan'],
    resistant: ['Cetuximab', 'Trastuzumab'],
    note: '类器官来源：2024-02 腹膜活检，培养第 14 天 IC50 评估'
  },
  imaging: [
    { date: '2024-11-20', modality: 'CT', findings: 'SD：腹膜结节较前缩小约 8%' },
    { date: '2024-08-15', modality: 'PET-CT', findings: '腹膜代谢减低，SUVmax 4.2 → 2.8' }
  ],
  tumorMarkers: [
    { name: 'CA125', value: 38.2, unit: 'U/mL', date: '2024-11-20', flag: '↑' },
    { name: 'CEA', value: 8.7, unit: 'ng/mL', date: '2024-11-20', flag: '↑' },
    { name: 'CA19-9', value: 22.1, unit: 'U/mL', date: '2024-11-20', flag: '正常' }
  ],
  treatmentHistory: [
    { name: '一线 FOLFOX × 8 周期', startDate: '2024-01', endDate: '2024-05', response: 'PR' },
    { name: '维持治疗 CapeOX + Bev', startDate: '2024-06', endDate: '至今', response: 'SD' }
  ],
  vMTBPlans: [
    {
      label: '方案 A',
      regimen: 'PIK3CA 抑制剂篮子试验（NCT04753203）',
      rationale: 'PIK3CA H1047R 驱动，符合篮子试验入组标准'
    },
    {
      label: '方案 B',
      regimen: 'CapeOX + 贝伐珠单抗 维持继续',
      rationale: '当前 SD，耐受性良好'
    },
    {
      label: '方案 C',
      regimen: '腹膜 HIPEC + 全身化疗',
      rationale: '腹膜寡转移，HIPEC 可能延长 PFS'
    },
    {
      label: '方案 D',
      regimen: 'FAPI-RNT 放射性核素治疗（NCT05185947）',
      rationale: 'FAPI 摄取阳性，符合核素治疗入组'
    }
  ],
  infoGaps: [
    'HER2 IHC + FISH（影响 T-DXd 决策）',
    'NTRK 融合检测（泛癌种适应症）'
  ],
  priorityActions: [
    { label: '尽快补做 HER2 IHC + FISH', urgency: 'high' },
    { label: '联系 NCT04753203 PIK3CA 篮子试验筛选', urgency: 'medium' }
  ]
}

const SBA_MATCHES = {
  list: [
    {
      id: 'NCT05185947',
      name: 'FAPI-RNT-001：68Ga-FAPI 介导的核素治疗探索研究',
      score: 88,
      indication: '小肠腺癌 / FAPI 阳性实体瘤',
      phase: 'I/II',
      reasons: ['FAPI 摄取阳性', '腹膜寡转移', '一般状况良好']
    },
    {
      id: 'NCT04753203',
      name: 'PIK3CA 突变实体瘤篮子试验',
      score: 86,
      indication: '小肠腺癌 / PIK3CA 突变阳性',
      phase: 'II',
      reasons: ['PIK3CA H1047R 驱动突变', '既往一线 FOLFOX 进展']
    },
    {
      id: 'CTR20231234',
      name: 'CapeOX + 贝伐珠单抗维持方案上市后研究',
      score: 78,
      indication: '小肠腺癌 维持治疗',
      phase: 'IV',
      reasons: ['当前方案疗效平稳', '入组流程简化']
    },
    {
      id: 'CTR20240089',
      name: '腹腔热灌注化疗 (HIPEC) + 全身化疗联合临床研究',
      score: 74,
      indication: '小肠腺癌 / 腹膜转移',
      phase: 'II',
      reasons: ['腹膜寡转移', 'ECOG 1 适合 HIPEC']
    },
    {
      id: 'NCT05500001',
      name: 'FAPI 引导外照射放疗联合化疗 II 期研究',
      score: 70,
      indication: '小肠腺癌 / FAPI 阳性',
      phase: 'II',
      reasons: ['FAPI 阳性', '腹膜可定位病灶']
    }
  ],
  pagination: { total: 5 }
}

const NSCLC_MATCHES = {
  list: [
    {
      id: 'NCT-NSCLC-1',
      name: 'EGFR C797S 第四代抑制剂 II 期',
      score: 92,
      indication: '非小细胞肺癌 / EGFR 阳性',
      phase: 'II',
      reasons: ['EGFR L858R + C797S 耐药突变']
    },
    {
      id: 'NCT-NSCLC-2',
      name: 'EGFR-TKI 联合 MET-IHC 研究',
      score: 86,
      indication: '非小细胞肺癌 / EGFR 阳性',
      phase: 'II',
      reasons: ['EGFR 通路驱动']
    },
    {
      id: 'NCT-NSCLC-3',
      name: 'EGFR 阳性患者三代 TKI 加局部放疗',
      score: 80,
      indication: '非小细胞肺癌',
      phase: 'III',
      reasons: ['寡进展放疗增益']
    },
    {
      id: 'NCT-NSCLC-4',
      name: 'EGFR 阳性 ADC 探索 I 期',
      score: 75,
      indication: '非小细胞肺癌',
      phase: 'I',
      reasons: ['HER3 ADC']
    },
    {
      id: 'NCT-NSCLC-5',
      name: 'EGFR 阳性 NSCLC 维持治疗观察',
      score: 70,
      indication: '非小细胞肺癌',
      phase: 'IV',
      reasons: ['依从性好']
    }
  ],
  pagination: { total: 5 }
}

const HCC_MATCHES = {
  list: [
    {
      id: 'NCT-HCC-1',
      name: 'HCC 二线 TKI + 抗 PD-1 联合 III 期',
      score: 90,
      indication: '肝细胞癌',
      phase: 'III',
      reasons: ['一线进展', 'Child-Pugh A']
    },
    {
      id: 'NCT-HCC-2',
      name: '肝动脉灌注 (HAIC) + 仑伐替尼研究',
      score: 84,
      indication: '肝细胞癌 / 门脉癌栓',
      phase: 'II',
      reasons: ['门脉癌栓', '肝功能尚可']
    },
    {
      id: 'NCT-HCC-3',
      name: '肝细胞癌 GPC3 CAR-T 探索 I 期',
      score: 76,
      indication: '肝细胞癌',
      phase: 'I',
      reasons: ['GPC3 表达待评估']
    },
    {
      id: 'NCT-HCC-4',
      name: 'HCC 双免疫联合 II 期',
      score: 72,
      indication: '肝细胞癌',
      phase: 'II',
      reasons: ['多线后探索']
    },
    {
      id: 'NCT-HCC-5',
      name: 'HCC 局部消融 + 系统治疗',
      score: 68,
      indication: '肝细胞癌',
      phase: 'III',
      reasons: ['可消融病灶']
    }
  ],
  pagination: { total: 5 }
}

// ---- 辅助：每个测试统一 fixture ---------------------------------------------

async function setupDemoMocks(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('onboardingSeenAt', String(Date.now()))
    } catch {
      /* private mode 忽略 */
    }
  })

  await installApiMocks(page, {
    '/api/me/consent': (route) => fulfillJson(route, envelope({ list: [] })),
    '/api/demo/samples': (route) =>
      fulfillJson(route, envelope({ list: SAMPLES })),
    '/api/demo/samples/sample-1-hcc/result': (route) =>
      fulfillJson(
        route,
        envelope({
          recordId: 'demo-hcc',
          status: 'completed',
          progress: 100,
          result: {
            diagnosis: '肝细胞癌',
            stage: 'IIIb',
            geneMutation: 'TERT 启动子突变',
            ecog: 1
          }
        })
      ),
    '/api/demo/samples/sample-2-nsclc/result': (route) =>
      fulfillJson(
        route,
        envelope({
          recordId: 'demo-nsclc',
          status: 'completed',
          progress: 100,
          result: {
            diagnosis: '非小细胞肺癌',
            stage: 'IV',
            geneMutation: 'EGFR L858R',
            ecog: 1
          }
        })
      ),
    '/api/demo/samples/sample-3-sba/result': (route) =>
      fulfillJson(
        route,
        envelope({
          recordId: 'demo-sba',
          status: 'completed',
          progress: 100,
          result: SBA_RESULT
        })
      ),
    '/api/demo/samples/sample-1-hcc/matches': (route) =>
      fulfillJson(route, envelope(HCC_MATCHES)),
    '/api/demo/samples/sample-2-nsclc/matches': (route) =>
      fulfillJson(route, envelope(NSCLC_MATCHES)),
    '/api/demo/samples/sample-3-sba/matches': (route) =>
      fulfillJson(route, envelope(SBA_MATCHES)),
    '/api/track': (route) => fulfillJson(route, envelope({ accepted: true }))
  })
}

// 走完 picker → preview → progress → result 四个阶段，停在 result。
// DemoView 的进度动画完全由 DemoProgress 自驱，预取已通过 mock 立即就绪，
// 等 RecordSummaryCard 出现即可。
async function gotoSampleResult(page: Page, sampleTitleRegex: RegExp) {
  await page.goto('/treatbot/demo')
  await page.waitForLoadState('networkidle')

  // picker 阶段：点击对应 sample card
  const card = page.locator('.sample-card', { hasText: sampleTitleRegex })
  await expect(card.first()).toBeVisible({ timeout: 10_000 })
  await card.first().click()

  // preview 阶段：点击「开始看（约 30 秒）」
  await expect(page.getByRole('button', { name: /开始看/ })).toBeVisible()
  await page.getByRole('button', { name: /开始看/ }).click()

  // progress → result：等到 RecordSummaryCard 出现（最多 60s，DemoProgress 动画 ~30s）
  await expect(page.locator('.summary-card')).toBeVisible({ timeout: 60_000 })
}

async function expandSection(page: Page, headerTextRegex: RegExp) {
  // 兼容默认展开 / 折叠两种实现：
  //   - 若 .section-body 已可见则跳过；
  //   - 否则点击同一个 .summary-section 下的 .section-header。
  const section = page.locator('.summary-section', { hasText: headerTextRegex }).first()
  if ((await section.count()) === 0) return
  const body = section.locator('.section-body').first()
  if (await body.isVisible().catch(() => false)) return
  const header = section.locator('.section-header').first()
  if ((await header.count()) > 0) {
    await header.click().catch(() => undefined)
  }
}

// ---- 测试 -------------------------------------------------------------------

test.describe('Demo 富信息病例（sample-3-sba）+ 癌种一致性', () => {
  test('① 「先看演示」入口可达，至少一个样例卡片', async ({ page }) => {
    const errors = collectPageErrors(page)
    await setupDemoMocks(page)

    await page.goto('/treatbot/demo')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.sample-card').first()).toBeVisible({ timeout: 10_000 })
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('② 样例列表展示 3 个样例', async ({ page }) => {
    await setupDemoMocks(page)
    await page.goto('/treatbot/demo')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.sample-card')).toHaveCount(3, { timeout: 10_000 })
    await expect(page.getByText(/小肠腺癌/).first()).toBeVisible()
    await expect(page.getByText(/非小细胞肺癌/).first()).toBeVisible()
    await expect(page.getByText(/肝细胞癌/).first()).toBeVisible()
  })

  test('③ sample-3-sba 展示 12 节富信息病例', async ({ page }) => {
    await setupDemoMocks(page)
    await gotoSampleResult(page, /小肠腺癌/)

    // 主诊断包含「小肠腺癌」+「IV期」
    await expect(page.getByText(/小肠腺癌/).first()).toBeVisible()
    await expect(page.getByText(/IV\s*期/).first()).toBeVisible()

    // 病程时间线 ≥ 3 项（断言至少 2 个时间点 + 关键药名）
    await expandSection(page, /病程|时间线|timeline/i)
    const pageText = await page.content()
    expect(pageText).toContain('2023-12-01')
    expect(pageText).toContain('FOLFOX')

    // 分子特征：KRAS / PIK3CA
    await expandSection(page, /分子|molecular|基因/i)
    const afterMolecular = await page.content()
    expect(afterMolecular).toContain('KRAS')
    expect(afterMolecular).toContain('PIK3CA')

    // 类器官药敏：5-FU 在 sensitive 块
    await expandSection(page, /类器官|药敏|organoid/i)
    const afterOrganoid = await page.content()
    expect(afterOrganoid).toContain('5-FU')

    // 肿瘤标志物 含 CA125
    await expandSection(page, /肿瘤标志物|markers/i)
    const afterMarkers = await page.content()
    expect(afterMarkers).toContain('CA125')

    // vMTB 推荐方案 ≥ 4 张
    await expandSection(page, /vMTB|推荐方案/i)
    const afterVmtb = await page.content()
    expect(afterVmtb).toContain('方案 A')
    expect(afterVmtb).toContain('方案 B')
    expect(afterVmtb).toContain('方案 C')
    expect(afterVmtb).toContain('方案 D')

    // 优先行动建议 ≥ 1 high-urgency
    await expandSection(page, /下一步建议|优先行动|priorityActions/i)
    const afterActions = await page.content()
    expect(afterActions).toMatch(/HER2 IHC|尽快补做/)
  })

  test('④ 匿名性硬要求：屏幕不应出现身份字段', async ({ page }) => {
    await setupDemoMocks(page)
    await gotoSampleResult(page, /小肠腺癌/)

    // 把所有可能的折叠节都展开一遍，再断言
    for (const re of [
      /病程时间线/i,
      /分子特征/i,
      /类器官药敏/i,
      /影像与肿瘤标志物/i,
      /^💊?\s*治疗史/i,
      /vMTB|推荐方案/i,
      /待补充信息|信息缺口/i,
      /下一步建议|优先行动/i
    ]) {
      await expandSection(page, re)
    }

    const html = await page.content()
    expect(html).not.toContain('钱志达')
    expect(html).not.toContain('长海')
    expect(html).not.toContain('1967')
  })

  test('⑤ sample-3-sba 匹配结果癌种一致', async ({ page }) => {
    await setupDemoMocks(page)
    await gotoSampleResult(page, /小肠腺癌/)

    await page.getByRole('button', { name: /看看找到的可能性|查看匹配|匹配/ }).click()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.match-card').first()).toBeVisible({ timeout: 10_000 })

    const html = await page.content()
    // 必含
    expect(html).toContain('小肠腺癌')
    expect(html).toContain('PIK3CA')
    expect(html).toContain('FAPI')
    // 不得含
    expect(html).not.toContain('HER2 阳性')
    expect(html).not.toContain('乳腺')
    expect(html).not.toContain('驱动基因阴性')
  })

  test('⑥ sample-2-nsclc 匹配不含「驱动基因阴性」', async ({ page }) => {
    await setupDemoMocks(page)
    await gotoSampleResult(page, /非小细胞肺癌/)
    await page.getByRole('button', { name: /看看找到的可能性|查看匹配|匹配/ }).click()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.match-card').first()).toBeVisible({ timeout: 10_000 })
    const nsclcHtml = await page.content()
    expect(nsclcHtml).not.toContain('驱动基因阴性')
  })

  test('⑦ sample-1-hcc 匹配不含 HER2 阳性 / 乳腺', async ({ page }) => {
    await setupDemoMocks(page)
    await gotoSampleResult(page, /肝细胞癌/)
    await page.getByRole('button', { name: /看看找到的可能性|查看匹配|匹配/ }).click()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.match-card').first()).toBeVisible({ timeout: 10_000 })
    const hccHtml = await page.content()
    expect(hccHtml).not.toContain('HER2 阳性')
    expect(hccHtml).not.toContain('乳腺')
  })
})
