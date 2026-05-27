/**
 * PRD-2026Q4 流式 OCR — llmClientStream 的两个核心内部工具：
 *   - parsePartialObject：把"在写中"的 JSON 串截到最后一个安全位置后 JSON.parse，
 *     用于增量识别"top-level 已完成的键"。
 *   - extractDeltaContents：把 OpenAI 兼容 SSE chunk buffer 切成 delta.content 片段。
 *
 * 这两个函数都是纯函数 + 无副作用，覆盖关键边界即可：
 *   - 最小情形（单一键值对）
 *   - 字符串中含 } / , / "（不能误把它们当结构 token）
 *   - 嵌套对象 / 数组（保持嵌套，只在 depth=1 找逗号）
 *   - 字符串未闭合 / 不合法 JSON → 安全返回 {}
 *   - SSE 包含心跳 / [DONE] / 分块到达
 *
 * 同时附一个"端到端"集成测试：用 mock 的 chunked stream（基于 EventEmitter）驱动
 * streamChatJson，验证 onFieldGroup 是否按 GROUP_ORDER 凑齐就 emit。
 */

// 静默 logger
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}))

// 用 fake axios：模块加载时被替换，streamChatJson 通过它拿"假 stream"。
// 我们把 stream 暴露成 EventEmitter，测试逐步 emit('data'/'end') 控制流时序。
const stream = require('stream')

// Jest 守卫要求 mock factory 引用的变量名必须以 `mock` 开头（防止未初始化引用）
const mockAxios = {
  post: jest.fn()
}
jest.mock('axios', () => mockAxios)

// chatJson 是 fallback 路径，stream 失败时被调；测试单独 mock 它便于断言
jest.mock('../services/llmClient', () => ({
  chatJson: jest.fn()
}))
const { chatJson: mockChatJson } = require('../services/llmClient')

jest.mock('../services/llmRateLimiter', () => ({
  acquire: jest.fn().mockResolvedValue(),
  release: jest.fn()
}))
const mockRateLimiter = require('../services/llmRateLimiter')

const { __internals, streamChatJson } = require('../services/llmClientStream')
const { parsePartialObject, extractDeltaContents } = __internals

describe('parsePartialObject', () => {
  test('空串 / 非字符串 → {}', () => {
    expect(parsePartialObject('')).toEqual({})
    expect(parsePartialObject(null)).toEqual({})
    expect(parsePartialObject(undefined)).toEqual({})
    expect(parsePartialObject(42)).toEqual({})
  })

  test('没有 { → {}（buffer 里全是预热字符）', () => {
    expect(parsePartialObject('plain text no json')).toEqual({})
  })

  test('"{" 已出现但还没有完整键值对 → {}', () => {
    expect(parsePartialObject('{ "age"')).toEqual({})
    expect(parsePartialObject('{ "age": ')).toEqual({})
  })

  test('一个完整键 + 正在写第二个 → 只返回第一个', () => {
    const buf = '{ "age": 60, "sex": "ma'
    expect(parsePartialObject(buf)).toEqual({ age: 60 })
  })

  test('两个完整键 + 正在写第三个 → 前两个都返回', () => {
    const buf = '{ "age": 60, "sex": "male", "height": 17'
    expect(parsePartialObject(buf)).toEqual({ age: 60, sex: 'male' })
  })

  test('JSON 完整闭合（最常见 stream end 情形）', () => {
    const buf = '{"a": 1, "b": [1,2,3], "c": "x"}'
    expect(parsePartialObject(buf)).toEqual({ a: 1, b: [1, 2, 3], c: 'x' })
  })

  test('字符串中含 } 和 , 不应当作结构 token', () => {
    const buf = '{"diagnosis": "stage IV, NSCLC}", "age": 60'
    expect(parsePartialObject(buf)).toEqual({ diagnosis: 'stage IV, NSCLC}' })
  })

  test('字符串含转义 \\" 不应被误判为字符串结束', () => {
    const buf = '{"note": "patient said \\"yes\\"", "age": 60'
    expect(parsePartialObject(buf)).toEqual({ note: 'patient said "yes"' })
  })

  test('嵌套对象：在 depth=1 安全 comma 后截断，嵌套整体保留或丢弃', () => {
    // 嵌套对象未闭合 → 整组丢弃，返回前面已完成的 age
    const buf = '{"age": 60, "history": {"line1": "FOLFOX", "lin'
    expect(parsePartialObject(buf)).toEqual({ age: 60 })
  })

  test('嵌套数组：未闭合 → 丢弃整组', () => {
    const buf = '{"age": 60, "priorTherapies": ["A","B",'
    expect(parsePartialObject(buf)).toEqual({ age: 60 })
  })

  test('坏 JSON 段不应抛 —— 安全降级到 {}', () => {
    // 把数字写错成 "60xyz"
    const buf = '{"age": 60xyz, "sex": "male"'
    expect(parsePartialObject(buf)).toEqual({})
  })

  test('前导 ``` 包裹（LLM 偶尔有）不影响识别第一个 {', () => {
    // parsePartialObject 只找第一个 {，包裹符自动跳过
    const buf = '```json\n{"age": 60, "sex": "male"}\n```'
    expect(parsePartialObject(buf)).toEqual({ age: 60, sex: 'male' })
  })
})

describe('extractDeltaContents', () => {
  test('单 chunk 单 data 行 → 抽出一个 content', () => {
    const sse = 'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n'
    const { contents, leftover } = extractDeltaContents(sse)
    expect(contents).toEqual(['hello'])
    expect(leftover).toBe('')
  })

  test('多个 block → 拼成多个 content', () => {
    const sse =
      'data: {"choices":[{"delta":{"content":"a"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"b"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"c"}}]}\n\n'
    const { contents, leftover } = extractDeltaContents(sse)
    expect(contents).toEqual(['a', 'b', 'c'])
    expect(leftover).toBe('')
  })

  test('心跳 / [DONE] / 空 payload 一律跳过', () => {
    const sse =
      ': heartbeat\n\n' +
      'data: [DONE]\n\n' +
      'data: \n\n' +
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'
    const { contents } = extractDeltaContents(sse)
    expect(contents).toEqual(['ok'])
  })

  test('未完成的尾巴留在 leftover 给下次拼接', () => {
    const sse =
      'data: {"choices":[{"delta":{"content":"first"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":'  // 不完整：没有结束 \n\n
    const { contents, leftover } = extractDeltaContents(sse)
    expect(contents).toEqual(['first'])
    expect(leftover).toContain('data: {"choices":[{"delta":{"content":')
  })

  test('损坏的 data 行（坏 JSON）静默跳过，不影响其他行', () => {
    const sse =
      'data: not-a-json\n\n' +
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'
    const { contents } = extractDeltaContents(sse)
    expect(contents).toEqual(['ok'])
  })
})

describe('streamChatJson 集成（mock stream）', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRateLimiter.acquire.mockResolvedValue()
    delete process.env.DOUBAO_API_KEY
    // 默认让 fallback 抛出，避免任何意外触发
    mockChatJson.mockRejectedValue(new Error('fallback should not be called'))
  })

  const buildSseLine = (deltaContent) =>
    `data: ${JSON.stringify({ choices: [{ delta: { content: deltaContent } }] })}\n\n`

  // 真实流式响应里，OCR JSON 按 basic → diagnosis → treatment → timeline 顺序写出。
  // 我们把这串 JSON 切成几段，逐段 emit('data')，确保 onFieldGroup 按 GROUP_ORDER 触发。
  const FULL_OBJECT = JSON.stringify({
    age: 60, sex: 'male', weight: 70, height: 170, ecog: 1, hospital: 'A',
    diagnosis: 'NSCLC', stage: 'IV', tnmStage: 'T2N1M1', pathologyType: 'ADC',
    geneMutation: 'EGFR', pdl1: '50%', metastasisSites: ['liver'],
    treatment: 'Osimertinib', treatmentLine: 1, priorTherapies: [], treatmentHistory: [],
    timeline: '2024-01: dx', diagnosisDate: '2024-01-01', surgicalHistory: []
  })

  // 简单 zod-like schema：safeParse 返回 success（不验证字段，仅为通过最终校验）
  const passSchema = {
    safeParse: (obj) => ({ success: true, data: obj })
  }

  test('完整 stream 通畅完成 → 4 个 group 按序 emit + 最终 resolve', async () => {
    // 假 axios.post 返回一个"stream"——一个 stream.Readable，可被 .on('data'/'end') 监听
    const fakeStream = new stream.Readable({ read() {} })
    mockAxios.post.mockResolvedValue({ data: fakeStream })

    // 给 stream 注入 chunks
    setImmediate(() => {
      // 把整段 JSON 拆 4 块发，约对应"4 个 group 边界"
      const parts = [
        FULL_OBJECT.slice(0, 70),    // 大概到 ecog 附近
        FULL_OBJECT.slice(70, 250),
        FULL_OBJECT.slice(250, 400),
        FULL_OBJECT.slice(400)
      ]
      for (const p of parts) fakeStream.push(Buffer.from(buildSseLine(p)))
      fakeStream.push(Buffer.from('data: [DONE]\n\n'))
      fakeStream.push(null)  // end
    })

    const emitted = []
    // 处理 emit-throttle：测试用 0ms 阻塞让所有 emit 都过
    const onFieldGroup = (group, fields, progress) => {
      emitted.push({ group, fields, progress })
    }

    // 先 stub provider env var 让 PROVIDER_REGISTRY['doubao'] 拿到 apiKey
    process.env.ARK_API_KEY = 'test-key'

    const result = await streamChatJson({
      provider: 'doubao',
      messages: [{ role: 'user', content: 'x' }],
      schema: passSchema,
      onFieldGroup
    })

    expect(mockAxios.post).toHaveBeenCalledTimes(1)
    // fallback 没被调（streaming 完整跑通）
    expect(mockChatJson).not.toHaveBeenCalled()
    expect(mockRateLimiter.acquire).toHaveBeenCalledWith('doubao', undefined)
    expect(mockRateLimiter.release).toHaveBeenCalledWith('doubao')

    // 4 个 group 都凑齐 → 都应 emit（顺序：basic, diagnosis, treatment, timeline）
    const groups = emitted.map((e) => e.group)
    expect(groups).toEqual(['basic', 'diagnosis', 'treatment', 'timeline'])
    // basic group 的 progress 应该是 50（来自 GROUPS.basic.progress）
    expect(emitted[0].progress).toBe(50)
    expect(emitted[3].progress).toBe(95)

    // 最终结果包含全部字段
    expect(result.age).toBe(60)
    expect(result.diagnosis).toBe('NSCLC')
    expect(result.timeline).toBe('2024-01: dx')

    delete process.env.ARK_API_KEY
  })

  test('onFieldPatch 在分组未凑齐时也会逐字段 emit', async () => {
    const fakeStream = new stream.Readable({ read() {} })
    mockAxios.post.mockResolvedValue({ data: fakeStream })
    const objectText = JSON.stringify({
      diagnosis: 'NSCLC',
      stage: 'IV',
      geneMutation: 'EGFR',
      age: 60
    })

    setImmediate(() => {
      const firstComma = objectText.indexOf(',') + 1
      fakeStream.push(Buffer.from(buildSseLine(objectText.slice(0, firstComma))))
      fakeStream.push(Buffer.from(buildSseLine(objectText.slice(firstComma))))
      fakeStream.push(Buffer.from('data: [DONE]\n\n'))
      fakeStream.push(null)
    })

    const emitted = []
    process.env.ARK_API_KEY = 'test-key'
    const result = await streamChatJson({
      provider: 'doubao',
      messages: [{ role: 'user', content: 'x' }],
      schema: passSchema,
      onFieldPatch: (fieldKey, fields, progress) => emitted.push({ type: 'patch', fieldKey, fields, progress }),
      onFieldGroup: (group, fields, progress) => emitted.push({ type: 'group', group, fields, progress })
    })

    expect(result.diagnosis).toBe('NSCLC')
    expect(emitted[0]).toMatchObject({
      type: 'patch',
      fieldKey: 'diagnosis',
      fields: { diagnosis: 'NSCLC' },
      progress: 65
    })
    expect(emitted.some((event) => event.type === 'group' && event.group === 'diagnosis')).toBe(false)
    delete process.env.ARK_API_KEY
  })

  test('ocr_structured_stream 默认使用 Doubao text model', async () => {
    const fakeStream = new stream.Readable({ read() {} })
    mockAxios.post.mockResolvedValue({ data: fakeStream })
    setImmediate(() => {
      fakeStream.push(Buffer.from(buildSseLine('{"diagnosis":"NSCLC"}')))
      fakeStream.push(Buffer.from('data: [DONE]\n\n'))
      fakeStream.push(null)
    })

    process.env.ARK_API_KEY = 'test-key'
    process.env.DOUBAO_TEXT_MODEL = 'doubao-fast-text-test'
    await streamChatJson({
      provider: 'doubao',
      messages: [{ role: 'user', content: 'x' }],
      schema: passSchema,
      opts: { operation: 'ocr_structured_stream' }
    })

    expect(mockAxios.post.mock.calls[0][1].model).toBe('doubao-fast-text-test')
    delete process.env.DOUBAO_TEXT_MODEL
    delete process.env.ARK_API_KEY
  })

  test('axios.post 直接抛错 → 降级到 chatJson', async () => {
    mockAxios.post.mockRejectedValue(new Error('connection refused'))
    mockChatJson.mockResolvedValue({ age: 60 })

    process.env.ARK_API_KEY = 'test-key'
    const result = await streamChatJson({
      provider: 'doubao',
      messages: [{ role: 'user', content: 'x' }],
      schema: passSchema
    })

    expect(mockChatJson).toHaveBeenCalledTimes(1)
    expect(mockRateLimiter.release).toHaveBeenCalledWith('doubao')
    expect(result).toEqual({ age: 60 })
    delete process.env.ARK_API_KEY
  })

  test('fallbackToChatJson=false 时建连失败 → 直接 reject，不再追加非流式 chatJson', async () => {
    mockAxios.post.mockRejectedValue(new Error('connection refused'))

    process.env.ARK_API_KEY = 'test-key'
    await expect(streamChatJson({
      provider: 'doubao',
      messages: [{ role: 'user', content: 'x' }],
      schema: passSchema,
      opts: { fallbackToChatJson: false, timeoutMs: 1234 }
    })).rejects.toThrow('connection refused')

    expect(mockChatJson).not.toHaveBeenCalled()
    expect(mockAxios.post.mock.calls[0][2].timeout).toBe(1234)
    expect(mockRateLimiter.release).toHaveBeenCalledWith('doubao')
    delete process.env.ARK_API_KEY
  })

  test('provider 满载排队时透传 onWait 给 rate limiter', async () => {
    const fakeStream = new stream.Readable({ read() {} })
    mockAxios.post.mockResolvedValue({ data: fakeStream })
    setImmediate(() => {
      fakeStream.push(Buffer.from(buildSseLine('{"age":60}')))
      fakeStream.push(Buffer.from('data: [DONE]\n\n'))
      fakeStream.push(null)
    })

    process.env.ARK_API_KEY = 'test-key'
    const onWait = jest.fn()
    await streamChatJson({
      provider: 'doubao',
      messages: [{ role: 'user', content: 'x' }],
      schema: passSchema,
      opts: { onWait }
    })

    expect(mockRateLimiter.acquire).toHaveBeenCalledWith('doubao', onWait)
    expect(mockRateLimiter.release).toHaveBeenCalledWith('doubao')
    delete process.env.ARK_API_KEY
  })

  test('流中途 error → 降级到 chatJson', async () => {
    const fakeStream = new stream.Readable({ read() {} })
    fakeStream.on('error', () => {})
    mockAxios.post.mockResolvedValue({ data: fakeStream })
    mockChatJson.mockResolvedValue({ recovered: true })

    setImmediate(() => {
      fakeStream.push(Buffer.from(buildSseLine('{"age": 6')))
      fakeStream.emit('error', new Error('socket reset'))
    })

    process.env.ARK_API_KEY = 'test-key'
    const result = await streamChatJson({
      provider: 'doubao',
      messages: [{ role: 'user', content: 'x' }],
      schema: passSchema
    })

    expect(mockChatJson).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ recovered: true })
    delete process.env.ARK_API_KEY
  })

  test('fallbackToChatJson=false 时流中途 error → 直接 reject', async () => {
    const fakeStream = new stream.Readable({ read() {} })
    fakeStream.on('error', () => {})
    mockAxios.post.mockResolvedValue({ data: fakeStream })

    setImmediate(() => {
      fakeStream.push(Buffer.from(buildSseLine('{"age": 6')))
      fakeStream.emit('error', new Error('socket reset'))
    })

    process.env.ARK_API_KEY = 'test-key'
    await expect(streamChatJson({
      provider: 'doubao',
      messages: [{ role: 'user', content: 'x' }],
      schema: passSchema,
      opts: { fallbackToChatJson: false }
    })).rejects.toThrow('socket reset')

    expect(mockChatJson).not.toHaveBeenCalled()
    delete process.env.ARK_API_KEY
  })

  test('无 apiKey → 立刻降级到 chatJson', async () => {
    delete process.env.ARK_API_KEY
    mockChatJson.mockResolvedValue({ skipped: true })

    const result = await streamChatJson({
      provider: 'doubao',
      messages: [{ role: 'user', content: 'x' }],
      schema: passSchema
    })

    expect(mockAxios.post).not.toHaveBeenCalled()
    expect(mockChatJson).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ skipped: true })
  })

  test('fallbackToChatJson=false 且无 apiKey → 直接 reject', async () => {
    delete process.env.ARK_API_KEY

    await expect(streamChatJson({
      provider: 'doubao',
      messages: [{ role: 'user', content: 'x' }],
      schema: passSchema,
      opts: { fallbackToChatJson: false }
    })).rejects.toMatchObject({ code: 'STREAM_PROVIDER_NOT_CONFIGURED' })

    expect(mockAxios.post).not.toHaveBeenCalled()
    expect(mockChatJson).not.toHaveBeenCalled()
  })

  test('schema 校验失败 → 降级到 chatJson', async () => {
    const fakeStream = new stream.Readable({ read() {} })
    mockAxios.post.mockResolvedValue({ data: fakeStream })
    mockChatJson.mockResolvedValue({ via: 'fallback' })

    setImmediate(() => {
      fakeStream.push(Buffer.from(buildSseLine('{"age": 60}')))
      fakeStream.push(Buffer.from('data: [DONE]\n\n'))
      fakeStream.push(null)
    })

    const strictSchema = {
      safeParse: () => ({
        success: false,
        error: { issues: [{ path: ['x'], message: 'required' }] }
      })
    }

    process.env.ARK_API_KEY = 'test-key'
    const result = await streamChatJson({
      provider: 'doubao',
      messages: [{ role: 'user', content: 'x' }],
      schema: strictSchema
    })

    expect(mockChatJson).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ via: 'fallback' })
    delete process.env.ARK_API_KEY
  })

  // 历史 bug：Buffer.toString('utf8') 在 chunk 末尾落在多字节序列中间时，
  // 会把那几个字节替换成 U+FFFD。CJK 病历的 rawText 一旦走流式且 chunk 边界恰好切到
  // 中文字符中间，最终 entities.diagnosis / treatment 里会藏黑底问号。
  // 修复后用 string_decoder.StringDecoder.write —— 不完整尾巴留到下一次。
  test('chunk 边界切到 utf-8 多字节中间 —— 不应产生 U+FFFD（CJK 字符完整）', async () => {
    const fakeStream = new stream.Readable({ read() {} })
    mockAxios.post.mockResolvedValue({ data: fakeStream })

    // 构造一段包含 CJK + emoji 的 delta payload
    const cjkObj = '{"rawText":"病历原文：肺癌IV期 EGFR👍","diagnosis":"肺癌","stage":"IV","tnmStage":"T2N1M1","pathologyType":"腺癌","geneMutation":"EGFR","pdl1":"TPS 50%","metastasisSites":["肝","骨"],"treatment":"奥希替尼","treatmentLine":1,"priorTherapies":[],"treatmentHistory":[],"timeline":"2024-01 确诊","diagnosisDate":"2024-01-15","surgicalHistory":[],"age":62,"sex":"男","weight":65,"height":170,"ecog":1,"hospital":"上海市肿瘤医院"}'

    // 把 cjkObj 包成 SSE delta，再把整段 SSE 流按 1 字节切碎喂给 fakeStream
    const sseLine = buildSseLine(cjkObj)
    const sseBuf = Buffer.from(sseLine, 'utf8')

    setImmediate(() => {
      // 极端 case：每次只 push 1 字节 —— 必然会切到 CJK 中字
      for (let i = 0; i < sseBuf.length; i++) {
        fakeStream.push(sseBuf.slice(i, i + 1))
      }
      fakeStream.push(Buffer.from('data: [DONE]\n\n'))
      fakeStream.push(null)
    })

    process.env.ARK_API_KEY = 'test-key'
    const result = await streamChatJson({
      provider: 'doubao',
      messages: [{ role: 'user', content: 'x' }],
      schema: passSchema
    })

    expect(mockChatJson).not.toHaveBeenCalled()
    // 关键断言：CJK 字符无损还原（不含 U+FFFD 替换符）
    expect(result.rawText).toBe('病历原文：肺癌IV期 EGFR👍')
    expect(result.rawText.includes('�')).toBe(false)
    expect(result.diagnosis).toBe('肺癌')
    expect(result.hospital).toBe('上海市肿瘤医院')
    expect(result.metastasisSites).toEqual(['肝', '骨'])
    delete process.env.ARK_API_KEY
  })
})
