// PRD-2026Q4 followup（B2）契约测试：锁住 upload 页 SSE wiring 的关键不变式，
// 防止未来重构悄悄把 hybrid SSE+polling 模式退化回纯轮询，或在 SSE 失败时弹错。
//
// 关键 invariants：
//   1) startStatusStream 永远会开 startPolling()（安全网，无论 SSE 走通与否）
//   2) startStatusStream 拼对了 URL（baseUrl + ?recordIds=...）和 Authorization: Bearer ${token}
//   3) handleStreamState 进度单调（不会被旧的轮询值或晚到的 SSE 值往下覆盖）
//   4) handleStreamError 完全静默 —— 不弹 toast，不打断用户
//   5) clearPollTimer 是「停止解析感知」的单一关闸点，会顺手 close SSE
//   6) mockOpenStream 返回 null（基础库 < 2.20）→ 不挂 handle，轮询照常
//
// 测试栈延用 upload.editResult.test.js 的最小模式：mock wx 全局 + jest.mock utils，
// require('../upload') 让 Page() 注册时被 global.Page 捕获，再 .call(ctx) 调方法。

jest.mock('../../../utils/api', () => ({
  // 仅 startStatusStream 需要：
  getRuntimeBaseUrl: jest.fn(() => 'https://test.example'),
  // 兼容 upload.js 其它路径的 import（不在本测试覆盖范围内，但 require 阶段要避免 undefined）：
  enrichMedicalRecord: jest.fn(() => Promise.resolve({})),
  normalizePayload: (res) => (res && res.data) || res || {},
  request: jest.fn(() => Promise.resolve({}))
}))

// 变量名必须以 `mock` 前缀开头，否则 jest.mock factory 不允许 out-of-scope 引用。
const mockParseTask = {
  clearCachedMatches: jest.fn(),
  getActiveParseTask: jest.fn(() => null),
  getActiveParseBatch: jest.fn(() => null),
  syncActiveParseTask: jest.fn(() => Promise.resolve(null)),
  syncActiveParseBatch: jest.fn(() => Promise.resolve(null)),
  getCachedParseResult: jest.fn(() => null),
  setActiveParseTask: jest.fn(),
  setActiveParseBatch: jest.fn(),
  clearActiveParseTask: jest.fn(),
  clearActiveParseBatch: jest.fn(),
  mergeStructuredEntities: jest.fn((a) => a)
}
jest.mock('../../../utils/parse-task', () => mockParseTask)

jest.mock('../../../utils/auth', () => ({
  ensureLogin: jest.fn(() => Promise.resolve()),
  ensureBaseLogin: jest.fn(() => Promise.resolve())
}))

jest.mock('../../../utils/track', () => ({ track: jest.fn() }))

// 关键：可控的 openParseStatusStream mock —— 默认返回带 close 的 handle，
// 测试可以重写返回 null 来模拟「SDK 不支持」分支。
// 变量名以 `mock` 前缀开头以满足 jest.mock factory 的 hoist 规则。
const mockOpenStream = jest.fn()
jest.mock('../../../utils/parse-status-stream', () => ({
  openParseStatusStream: (...args) => mockOpenStream(...args)
}))

const wxMock = {
  showToast: jest.fn(),
  showLoading: jest.fn(),
  hideLoading: jest.fn(),
  setStorageSync: jest.fn(),
  getStorageSync: jest.fn((key) => (key === 'token' ? 'tok-xyz' : null)),
  removeStorageSync: jest.fn(),
  getStorageInfoSync: jest.fn(() => ({ keys: [] })),
  switchTab: jest.fn(),
  navigateTo: jest.fn(),
  redirectTo: jest.fn(),
  showModal: jest.fn(),
  pageScrollTo: jest.fn(),
  stopPullDownRefresh: jest.fn(),
  login: jest.fn(),
  request: jest.fn(() => ({ onChunkReceived: () => {}, abort: () => {} }))
}
global.wx = wxMock

let pageOptions
global.Page = (opts) => { pageOptions = opts }
global.getApp = () => ({ globalData: {} })

require('../upload')

// 构造一个最小 this 上下文：data + setData + 必要的 stub 方法。
// 默认安装 startPolling/clearPollTimer/clearProgressTimer/setProgressTarget/checkParseStatus 为 spy，
// 让 startStatusStream/handle* 都能跑完不抛错，且能断言它们被调到。
const buildCtx = (overrides = {}) => {
  const data = {
    parseProgress: 0,
    progressTarget: 0,
    processingStatus: '',
    parseStep: 0,
    ...overrides.data
  }
  return Object.assign({
    data,
    // PRD-2026Q4 followup（"边解析边出字段"）：S5/S5b/S5c 需要断言 setData 调用次数与 patch 形状，
    // 所以 setData 必须是 jest.fn（同时仍然把 patch merge 进 data，保留原 ctx 语义）。
    setData: jest.fn(function setData(patch) { Object.assign(this.data, patch) }),
    startPolling: jest.fn(),
    clearProgressTimer: jest.fn(),
    setProgressTarget: jest.fn(function setProgressTarget(_status, minFloor) {
      // 简化：让 setProgressTarget 把 progressTarget 落到 data 上，方便单调性断言
      if (typeof minFloor === 'number') this.data.progressTarget = minFloor
    }),
    checkParseStatus: jest.fn(),
    completionHandled: false,
    statusStreamHandle: null,
    pollTimer: null,
    pollingActive: false,
    pollIntervalMs: 3000,
    progressTimer: null,
    scheduleNextPoll: jest.fn(),
    // 真实方法 —— 让 handle*/clear* 之间能互相 this.xxx() 调用
    closeStatusStream: pageOptions.closeStatusStream,
    startStatusStream: pageOptions.startStatusStream,
    handleStreamState: pageOptions.handleStreamState,
    handleStreamDone: pageOptions.handleStreamDone,
    handleStreamError: pageOptions.handleStreamError,
    // PRD-2026Q4 followup（"边解析边出字段"）：handleStreamState 在 fieldGroup 帧到达时
    // 会调 this.buildStreamingPartialGroups 把累积字段刷到 data —— ctx 必须暴露这个方法，
    // 否则 S5 测试在调 handleStreamState 时会抛 "this.buildStreamingPartialGroups is not a function"。
    buildStreamingPartialGroups: pageOptions.buildStreamingPartialGroups
  }, overrides.ctx)
}

beforeEach(() => {
  jest.clearAllMocks()
  // 默认：mockOpenStream 返回可关闭的 handle。
  mockOpenStream.mockImplementation(() => ({ close: jest.fn() }))
})

describe('startStatusStream — invariants', () => {
  test('I1: 无 active batch / task 时直接 return，但仍开 startPolling（安全网永远在）', () => {
    mockParseTask.getActiveParseBatch.mockReturnValueOnce(null)
    mockParseTask.getActiveParseTask.mockReturnValueOnce(null)

    const ctx = buildCtx()
    pageOptions.startStatusStream.call(ctx)

    expect(ctx.startPolling).toHaveBeenCalledTimes(1)
    expect(mockOpenStream).not.toHaveBeenCalled()
    expect(ctx.statusStreamHandle).toBeNull()
  })

  test('I2: 单条任务 → 用 activeTask.fileId 拼 URL、写 Authorization: Bearer ${token}、挂 handle', () => {
    mockParseTask.getActiveParseBatch.mockReturnValueOnce(null)
    mockParseTask.getActiveParseTask.mockReturnValueOnce({ fileId: 'rec-001' })

    const ctx = buildCtx()
    pageOptions.startStatusStream.call(ctx)

    expect(ctx.startPolling).toHaveBeenCalledTimes(1)   // 安全网始终开
    expect(mockOpenStream).toHaveBeenCalledTimes(1)
    const call = mockOpenStream.mock.calls[0][0]
    expect(call.fileIds).toEqual(['rec-001'])
    expect(call.url).toBe('https://test.example/api/medical/parse-status-stream?recordIds=rec-001')
    expect(call.token).toBe('tok-xyz')
    expect(typeof call.onState).toBe('function')
    expect(typeof call.onDone).toBe('function')
    expect(typeof call.onError).toBe('function')
    expect(ctx.statusStreamHandle).not.toBeNull()
    expect(typeof ctx.statusStreamHandle.close).toBe('function')
  })

  test('I3: batch 优先 —— 同时有 activeBatch.fileIds + activeTask.fileId 时取 batch', () => {
    mockParseTask.getActiveParseBatch.mockReturnValueOnce({ fileIds: ['a', 'b', 'c'] })
    mockParseTask.getActiveParseTask.mockReturnValueOnce({ fileId: 'should-be-ignored' })

    const ctx = buildCtx()
    pageOptions.startStatusStream.call(ctx)

    const call = mockOpenStream.mock.calls[0][0]
    expect(call.fileIds).toEqual(['a', 'b', 'c'])
    expect(call.url).toContain('recordIds=a%2Cb%2Cc')
  })

  test('I4: mockOpenStream 返回 null（基础库 < 2.20 不支持 chunked）→ 不挂 handle，polling 仍是唯一路径', () => {
    mockParseTask.getActiveParseTask.mockReturnValueOnce({ fileId: 'rec-002' })
    mockOpenStream.mockReturnValueOnce(null)

    const ctx = buildCtx()
    pageOptions.startStatusStream.call(ctx)

    expect(ctx.startPolling).toHaveBeenCalledTimes(1)
    expect(mockOpenStream).toHaveBeenCalledTimes(1)
    expect(ctx.statusStreamHandle).toBeNull()   // 无 zombie handle
  })

  test('I5: baseUrl 解不出来时不挂 SSE，但 polling 仍开', () => {
    const api = require('../../../utils/api')
    api.getRuntimeBaseUrl.mockReturnValueOnce('')   // 这一次解出空串
    mockParseTask.getActiveParseTask.mockReturnValueOnce({ fileId: 'rec-003' })

    const ctx = buildCtx()
    pageOptions.startStatusStream.call(ctx)

    expect(ctx.startPolling).toHaveBeenCalledTimes(1)
    expect(mockOpenStream).not.toHaveBeenCalled()
  })

  test('I6: 重复 startStatusStream 不留 zombie 流 —— 第二次开新流前会 close 旧流', () => {
    mockParseTask.getActiveParseTask.mockReturnValue({ fileId: 'rec-004' })

    const firstClose = jest.fn()
    const secondClose = jest.fn()
    mockOpenStream
      .mockReturnValueOnce({ close: firstClose })
      .mockReturnValueOnce({ close: secondClose })

    const ctx = buildCtx()
    pageOptions.startStatusStream.call(ctx)
    pageOptions.startStatusStream.call(ctx)

    expect(firstClose).toHaveBeenCalledTimes(1)
    expect(secondClose).not.toHaveBeenCalled()
    expect(ctx.statusStreamHandle.close).toBe(secondClose)
  })
})

describe('handleStreamState — monotonic progress contract', () => {
  test('S1: running + progress=50 → setProgressTarget("analyzing", 50)', () => {
    const ctx = buildCtx({ data: { parseProgress: 10, progressTarget: 10 } })

    pageOptions.handleStreamState.call(ctx, { status: 'running', progress: 50 })

    expect(ctx.setProgressTarget).toHaveBeenCalledWith('analyzing', 50)
    expect(ctx.pollIntervalMs).toBe(8000)
    expect(ctx.scheduleNextPoll).toHaveBeenCalled()
  })

  test('S2: 进度倒退（new=30 < current=60）→ 不调 setProgressTarget（单调）', () => {
    const ctx = buildCtx({ data: { parseProgress: 60, progressTarget: 60 } })

    pageOptions.handleStreamState.call(ctx, { status: 'running', progress: 30 })

    expect(ctx.setProgressTarget).not.toHaveBeenCalled()
  })

  test('S3: progress=120（超 99）→ 钳制到 99，避免 UI 提前 100%', () => {
    const ctx = buildCtx({ data: { parseProgress: 50 } })

    pageOptions.handleStreamState.call(ctx, { status: 'running', progress: 120 })

    // Math.min(99, 120) = 99
    expect(ctx.setProgressTarget).toHaveBeenCalledWith('analyzing', 99)
  })

  test('S4: completionHandled=true → 帧被静默丢弃（轮询已处理完成态，不让 SSE 反向覆盖）', () => {
    const ctx = buildCtx({ data: { parseProgress: 50 } })
    ctx.completionHandled = true

    pageOptions.handleStreamState.call(ctx, { status: 'running', progress: 80 })

    expect(ctx.setProgressTarget).not.toHaveBeenCalled()
  })

  test('S5: fieldGroup 字段累积到 streamingPartial 并 setData(streamingPartialGroups) 实时刷 UI', () => {
    // PRD-2026Q4 followup（"边解析边出字段"）：原本只把字段塞到 instance var，UI 不渲染；
    // 现在改成：在 currentStep !== 3 且 !completionHandled 时，把累积字段按 GROUP_META 分组刷到
    // data.streamingPartialGroups —— wxml 立即把"已经看到这些"卡画出来，让用户在 50→90% 段就有反馈。
    const ctx = buildCtx({ data: { parseProgress: 0, currentStep: 2 } })

    pageOptions.handleStreamState.call(ctx, {
      status: 'running',
      progress: 40,
      fieldGroup: 'basic',
      fields: { age: 65, gender: '男' }
    })
    pageOptions.handleStreamState.call(ctx, {
      status: 'running',
      progress: 60,
      fieldGroup: 'diagnosis',
      fields: { diagnosis: '非小细胞肺癌' }
    })

    // 1) instance var 仍然累积（其他消费方/调试日志可读）
    expect(ctx.streamingPartial).toEqual({
      age: 65,
      gender: '男',
      diagnosis: '非小细胞肺癌'
    })

    // 2) setData 被调过，最后一次的 streamingPartialGroups 至少包含 basic 组的 3 个字段
    const dataCalls = ctx.setData.mock.calls
      .map((c) => c[0])
      .filter((p) => p && Array.isArray(p.streamingPartialGroups))
    expect(dataCalls.length).toBeGreaterThan(0)
    const lastGroups = dataCalls[dataCalls.length - 1].streamingPartialGroups
    expect(Array.isArray(lastGroups)).toBe(true)
    expect(lastGroups.length).toBeGreaterThanOrEqual(1)
    const basic = lastGroups.find((g) => g.groupKey === 'basic')
    expect(basic).toBeTruthy()
    const labels = basic.items.map((i) => i.label)
    expect(labels).toEqual(expect.arrayContaining(['临床诊断', '年龄（岁）', '性别']))
  })

  test('S5b: completionHandled=true 时 fieldGroup 不再 setData(streamingPartialGroups)（最终结果卡接管）', () => {
    const ctx = buildCtx({ data: { parseProgress: 0, currentStep: 2 } })
    ctx.completionHandled = true

    pageOptions.handleStreamState.call(ctx, {
      status: 'running',
      progress: 40,
      fieldGroup: 'basic',
      fields: { age: 65 }
    })

    const dataCalls = ctx.setData.mock.calls
      .map((c) => c[0])
      .filter((p) => p && Array.isArray(p.streamingPartialGroups))
    expect(dataCalls.length).toBe(0)
  })

  test('S5c: currentStep===3 时 fieldGroup 不再 setData（结果卡已经在画）', () => {
    const ctx = buildCtx({ data: { parseProgress: 0, currentStep: 3 } })

    pageOptions.handleStreamState.call(ctx, {
      status: 'running',
      progress: 40,
      fieldGroup: 'basic',
      fields: { age: 65 }
    })

    const dataCalls = ctx.setData.mock.calls
      .map((c) => c[0])
      .filter((p) => p && Array.isArray(p.streamingPartialGroups))
    expect(dataCalls.length).toBe(0)
  })

  test('S6: payload=null / undefined → no-op，不抛', () => {
    const ctx = buildCtx()
    expect(() => pageOptions.handleStreamState.call(ctx, null)).not.toThrow()
    expect(() => pageOptions.handleStreamState.call(ctx, undefined)).not.toThrow()
    expect(ctx.setProgressTarget).not.toHaveBeenCalled()
  })

  test('S7: textLength/pageCount/providerWait 转成用户可理解的实时文案', () => {
    const ctx = buildCtx({ data: { parseProgress: 10, currentStep: 2 } })

    pageOptions.handleStreamState.call(ctx, {
      status: 'running',
      progress: 41,
      textLength: 1280
    })
    expect(ctx.data.processingStatus).toContain('已识别约 1280 字')

    pageOptions.handleStreamState.call(ctx, {
      status: 'running',
      progress: 42,
      fieldGroup: 'diagnosis',
      fields: { diagnosis: '非小细胞肺癌' }
    })
    expect(ctx.data.processingStatus).toContain('已识别约 1280 字')
    expect(ctx.data.processingStatus).toContain('诊断信息已开始补齐')

    pageOptions.handleStreamState.call(ctx, {
      status: 'running',
      progress: 43,
      pageCount: 3
    })
    expect(ctx.data.processingStatus).toContain('已读取 3 页')

    pageOptions.handleStreamState.call(ctx, {
      status: 'running',
      progress: 44,
      providerWait: { waiting: 2, capacity: 1 }
    })
    expect(ctx.data.processingStatus).toContain('模型资源排队中')
    expect(ctx.data.processingStatus).toContain('前面还有 1 个请求')
  })
})

describe('handleStreamDone & handleStreamError — terminal handoff', () => {
  test('D1: handleStreamDone → close 流 + 立即 kick checkParseStatus（不等下一轮询周期）', () => {
    const ctx = buildCtx()
    const close = jest.fn()
    ctx.statusStreamHandle = { close }

    pageOptions.handleStreamDone.call(ctx)

    expect(close).toHaveBeenCalledTimes(1)
    expect(ctx.statusStreamHandle).toBeNull()
    expect(ctx.checkParseStatus).toHaveBeenCalledTimes(1)
  })

  test('D2: handleStreamDone 在 completionHandled=true 时不再 kick checkParseStatus', () => {
    const ctx = buildCtx()
    ctx.statusStreamHandle = { close: jest.fn() }
    ctx.completionHandled = true

    pageOptions.handleStreamDone.call(ctx)

    expect(ctx.checkParseStatus).not.toHaveBeenCalled()
  })

  test('E1: handleStreamError 完全静默 —— 不弹任何 toast / modal', () => {
    const ctx = buildCtx()
    const close = jest.fn()
    ctx.statusStreamHandle = { close }

    pageOptions.handleStreamError.call(ctx, { code: 'noredis', fallback: 'polling' })
    pageOptions.handleStreamError.call(ctx, { code: 'open_timeout' })
    pageOptions.handleStreamError.call(ctx, { code: 'request_fail', detail: { errMsg: 'request:fail' } })

    expect(wxMock.showToast).not.toHaveBeenCalled()
    expect(wxMock.showModal).not.toHaveBeenCalled()
    // 第一次 error 调用后流就被关掉了；后两次 close 已经是 null，不应抛
    expect(close).toHaveBeenCalledTimes(1)
    expect(ctx.pollIntervalMs).toBe(3000)
    expect(ctx.scheduleNextPoll).toHaveBeenCalled()
  })
})

describe('closeStatusStream — single relinquish point', () => {
  test('C1: 有 handle → 调 close + 置 null', () => {
    const ctx = buildCtx()
    const close = jest.fn()
    ctx.statusStreamHandle = { close }

    pageOptions.closeStatusStream.call(ctx)

    expect(close).toHaveBeenCalledTimes(1)
    expect(ctx.statusStreamHandle).toBeNull()
  })

  test('C2: 无 handle → no-op，不抛', () => {
    const ctx = buildCtx()
    ctx.statusStreamHandle = null
    expect(() => pageOptions.closeStatusStream.call(ctx)).not.toThrow()
  })

  test('C3: handle.close 抛错 → 仍把 handle 置 null（不留 zombie 引用）', () => {
    const ctx = buildCtx()
    ctx.statusStreamHandle = { close: () => { throw new Error('boom') } }

    expect(() => pageOptions.closeStatusStream.call(ctx)).not.toThrow()
    expect(ctx.statusStreamHandle).toBeNull()
  })

  test('C4: clearPollTimer 顺手调 closeStatusStream（单一关闸点不变式）', () => {
    const ctx = buildCtx()
    const close = jest.fn()
    ctx.statusStreamHandle = { close }

    pageOptions.clearPollTimer.call(ctx)

    expect(close).toHaveBeenCalledTimes(1)
    expect(ctx.statusStreamHandle).toBeNull()
    expect(ctx.pollingActive).toBe(false)
  })
})
