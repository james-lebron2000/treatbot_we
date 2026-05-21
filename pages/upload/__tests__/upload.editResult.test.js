// 契约测试：锁住 editResult / startMatching 在 gapDirty / missingFields
// 不同组合下的 PATCH + 缓存清理 + 跳转行为，防止未来重构回归。
//
// 测试栈：Jest + 直接 mock wx 全局 + jest.mock 关键 utils。
// 不引 miniprogram-simulate（依赖重 / 启动慢，不值），改为 Page() 注册时
// 抓 options，再用一个最小 this 上下文 .call() 调用方法。

jest.mock('../../../utils/api', () => ({
  enrichMedicalRecord: jest.fn(() => Promise.resolve({})),
  normalizePayload: (res) => (res && res.data) || res || {}
}))

jest.mock('../../../utils/parse-task', () => ({
  clearCachedMatches: jest.fn(),
  getActiveParseTask: jest.fn(() => null),
  getActiveParseBatch: jest.fn(() => null),
  syncActiveParseTask: jest.fn(() => Promise.resolve(null)),
  getCachedParseResult: jest.fn(() => null),
  mergeStructuredEntities: jest.fn((entries) => entries)
}))

jest.mock('../../../utils/auth', () => ({
  ensureLogin: jest.fn(() => Promise.resolve()),
  ensureBaseLogin: jest.fn(() => Promise.resolve())
}))

jest.mock('../../../utils/track', () => ({
  track: jest.fn()
}))

const wxMock = {
  showToast: jest.fn(),
  showLoading: jest.fn(),
  hideLoading: jest.fn(),
  setStorageSync: jest.fn(),
  getStorageSync: jest.fn(() => null),
  removeStorageSync: jest.fn(),
  getStorageInfoSync: jest.fn(() => ({ keys: [] })),
  switchTab: jest.fn(),
  navigateTo: jest.fn(),
  redirectTo: jest.fn(),
  showModal: jest.fn(),
  pageScrollTo: jest.fn(),
  stopPullDownRefresh: jest.fn(),
  login: jest.fn(),
  request: jest.fn()
}
global.wx = wxMock

let pageOptions
global.Page = (opts) => { pageOptions = opts }
global.getApp = () => ({ globalData: {} })

const api = require('../../../utils/api')
const parseTask = require('../../../utils/parse-task')

require('../upload')

const buildCtx = (overrides = {}) => {
  const data = {
    submittingGap: false,
    gapDirty: false,
    missingFields: [],
    parsedData: { diagnosis: '非小细胞肺癌', stage: 'IV' },
    structuredSummary: { missingRequired: 0 },
    fileId: 'fid-001',
    recordId: 'rec-001',
    ...overrides
  }
  return {
    data,
    setData(patch) { Object.assign(this.data, patch) }
  }
}

const buildCompletedCtx = (overrides = {}) => {
  const data = {
    collapsedGroups: {},
    currentStep: 2,
    fileId: 'fid-001',
    gapSections: [],
    hasPdfUpload: false,
    missingFields: [],
    parsedData: {},
    pdfQualityHintShown: true,
    recordId: 'rec-001',
    streamingPartialGroups: [],
    uploading: true,
    ...overrides
  }
  return {
    data,
    completionHandled: false,
    _initialGapTotal: 0,
    clearPollTimer: jest.fn(),
    setProgressTarget: jest.fn(),
    buildParsedPresentation: pageOptions.buildParsedPresentation,
    buildCollapsedGroupsState: pageOptions.buildCollapsedGroupsState,
    applyParsedPresentation: pageOptions.applyParsedPresentation,
    setData(patch) { Object.assign(this.data, patch) }
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('editResult contract', () => {
  test('Case A: gapDirty=false → 不调 enrich，也不清缓存，仅给确认 toast', async () => {
    const ctx = buildCtx({ gapDirty: false })

    await pageOptions.editResult.call(ctx)

    expect(api.enrichMedicalRecord).not.toHaveBeenCalled()
    expect(parseTask.clearCachedMatches).not.toHaveBeenCalled()
    expect(wxMock.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ icon: 'success' })
    )
  })

  test('Case B: gapDirty=true → 调 enrich(currentRecordId, parsedData) + 清当条匹配缓存 + 重置 dirty', async () => {
    // 注意：editResult 与 startMatching 语义对齐 —— 都用 currentRecordId = recordId || fileId
    // 在测试 fixture 里 recordId='rec-001' 优先，所以两个 mock 都收到 'rec-001'
    const ctx = buildCtx({ gapDirty: true })

    await pageOptions.editResult.call(ctx)

    expect(api.enrichMedicalRecord).toHaveBeenCalledWith('rec-001', expect.any(Object))
    expect(parseTask.clearCachedMatches).toHaveBeenCalledWith('rec-001')
    expect(ctx.data.gapDirty).toBe(false)
  })

  test('Case C: missingFields > 0 → 拦截，不调 enrich，gapDirty 不被偷偷重置', async () => {
    const ctx = buildCtx({
      missingFields: ['diagnosis'],
      gapDirty: true
    })

    await pageOptions.editResult.call(ctx)

    expect(api.enrichMedicalRecord).not.toHaveBeenCalled()
    expect(wxMock.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('待补充') })
    )
    expect(ctx.data.gapDirty).toBe(true)
  })
})

describe('startMatching contract', () => {
  test('Case D: gapDirty=true → 调 enrich(currentRecordId) + 清匹配缓存 + 跳转 matches', async () => {
    const ctx = buildCtx({ gapDirty: true })

    await pageOptions.startMatching.call(ctx)

    expect(api.enrichMedicalRecord).toHaveBeenCalledWith('rec-001', expect.any(Object))
    expect(parseTask.clearCachedMatches).toHaveBeenCalledWith('rec-001')
    expect(wxMock.switchTab).toHaveBeenCalledWith({ url: '/pages/matches/matches' })
  })
})

describe('handleCompletedResult contract', () => {
  test('嵌套 result.entities 完成态进入 Step 3 且病历卡片字段非空', () => {
    const ctx = buildCompletedCtx()

    pageOptions.handleCompletedResult.call(ctx, {
      entities: {
        diagnosis: '肺腺癌',
        stage: 'IV期',
        age: 65,
        ecog: '1',
        geneMutation: 'EGFR L858R'
      }
    })

    expect(ctx.data.currentStep).toBe(3)
    expect(ctx.data.uploading).toBe(false)
    expect(ctx.data.parsedData).toEqual(expect.objectContaining({
      diagnosis: '肺腺癌',
      stage: 'IV期',
      age: 65,
      ecog: '1',
      geneMutation: 'EGFR L858R'
    }))
    expect(wxMock.setStorageSync).toHaveBeenCalledWith(
      'structuredRecordDraft',
      expect.objectContaining({ diagnosis: '肺腺癌', stage: 'IV期' })
    )
  })
})
