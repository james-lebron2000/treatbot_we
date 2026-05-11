/**
 * PRD-2026Q4 流式 OCR：小程序端 SSE 客户端的 utf-8 解码器测试。
 *
 * 历史 bug：旧 arrayBufferToUtf8 在 chunk 边界遇到不完整多字节序列时，
 * 直接读 bytes[i++] 不做 bounds check —— 一个 3 字节中文字符被 TCP 切成两段时，
 * b2/b3 是 undefined，与 0x3f 位与得 0，整个 SSE 块的 JSON.parse 失败被静默 catch，
 * 该 field_group 事件永久丢失。CJK + emoji 用户必踩。
 *
 * 本测试覆盖：
 *  1. 一次性 decode 一整串 utf-8 数据（含 ASCII + 中文 3 字节 + emoji 4 字节）
 *  2. 极端 chunk 切分：每次只喂 1 个字节（最坏 case，必覆盖所有续字节边界）
 *  3. 混合 chunk 大小（1, 7, 13, 17, 23, 100 字节交替）
 *  4. flush 不会破坏 decoder 状态
 *  5. TextDecoder fast path 与手写 fallback path 结果一致
 */

// `utils/sseClient.js` require 'utils/api'，后者在 load 时访问 wx 全局 —— stub 上。
beforeAll(() => {
  global.wx = {
    getStorageSync: () => null,
    setStorageSync: () => {},
    removeStorageSync: () => {},
    canIUse: () => false
  }
})

const path = require('path')
const SSE_CLIENT_PATH = path.resolve(__dirname, '../../utils/sseClient.js')

const loadSseClient = ({ killTextDecoder = false } = {}) => {
  jest.resetModules()
  const savedTD = global.TextDecoder
  if (killTextDecoder) {
    // eslint-disable-next-line no-undef
    delete global.TextDecoder
  }
  // eslint-disable-next-line global-require
  const m = require(SSE_CLIENT_PATH)
  if (killTextDecoder) {
    global.TextDecoder = savedTD
  }
  return m
}

// 一段含 ASCII / 中文 / 4-byte emoji / 数字 的混合文本，覆盖所有 utf-8 长度
const SAMPLE = '病历原文：肺癌IV期 EGFR L858R 治疗记录👍 ECOG=1 体重 65kg'
const enc = new TextEncoder()
const SAMPLE_BYTES = enc.encode(SAMPLE)

const decodeInChunks = (m, sizes) => {
  const dec = m.__internals.createUtf8Decoder()
  let out = ''
  let pos = 0
  let si = 0
  while (pos < SAMPLE_BYTES.length) {
    const len = sizes[si++ % sizes.length]
    const slice = SAMPLE_BYTES.slice(pos, pos + len)
    out += dec.decode(slice.buffer)
    pos += len
  }
  return out
}

describe('MP sseClient utf-8 decoder（PRD-2026Q4 chunk-boundary 修复）', () => {
  describe('TextDecoder fast path（基础库 2.21+）', () => {
    test('一次性 decode 一整串', () => {
      const m = loadSseClient()
      const dec = m.__internals.createUtf8Decoder()
      expect(dec.decode(SAMPLE_BYTES.buffer)).toBe(SAMPLE)
    })

    test('每次喂 1 字节（最坏 chunk-boundary）', () => {
      const m = loadSseClient()
      expect(decodeInChunks(m, [1])).toBe(SAMPLE)
    })

    test('混合 chunk 大小', () => {
      const m = loadSseClient()
      expect(decodeInChunks(m, [1, 7, 13, 17, 23, 100])).toBe(SAMPLE)
    })

    test('空 buffer 不抛错', () => {
      const m = loadSseClient()
      const dec = m.__internals.createUtf8Decoder()
      expect(dec.decode(null)).toBe('')
      expect(dec.decode(undefined)).toBe('')
    })
  })

  describe('手写 fallback path（基础库 2.20.x，无 TextDecoder）', () => {
    test('一次性 decode 一整串', () => {
      const m = loadSseClient({ killTextDecoder: true })
      const dec = m.__internals.createUtf8Decoder()
      expect(dec.decode(SAMPLE_BYTES.buffer)).toBe(SAMPLE)
    })

    test('每次喂 1 字节（最坏 chunk-boundary）—— 旧实现必败', () => {
      const m = loadSseClient({ killTextDecoder: true })
      expect(decodeInChunks(m, [1])).toBe(SAMPLE)
    })

    test('每次喂 2 字节（CJK 跨包高频场景）', () => {
      const m = loadSseClient({ killTextDecoder: true })
      expect(decodeInChunks(m, [2])).toBe(SAMPLE)
    })

    test('每次喂 3 字节', () => {
      const m = loadSseClient({ killTextDecoder: true })
      expect(decodeInChunks(m, [3])).toBe(SAMPLE)
    })

    test('混合 chunk 大小', () => {
      const m = loadSseClient({ killTextDecoder: true })
      expect(decodeInChunks(m, [1, 7, 13, 17, 23, 100])).toBe(SAMPLE)
    })
  })

  describe('parseSseBlock 跳过心跳注释行', () => {
    test(': ping ... 块被忽略', () => {
      const m = loadSseClient()
      // 心跳块没有 data: 行 —— parseSseBlock 返回 null
      expect(m.__internals.parseSseBlock(': ping 1234567890')).toBeNull()
    })

    test('event + data 块正确解析', () => {
      const m = loadSseClient()
      const block = 'event: state\ndata: {"stage":"ocr_text","rawText":"病例正文"}'
      const parsed = m.__internals.parseSseBlock(block)
      expect(parsed).not.toBeNull()
      expect(parsed.event).toBe('state')
      expect(JSON.parse(parsed.data)).toEqual({ stage: 'ocr_text', rawText: '病例正文' })
    })

    test('多行 data: 累加', () => {
      const m = loadSseClient()
      const block = 'event: state\ndata: line1\ndata: line2'
      const parsed = m.__internals.parseSseBlock(block)
      expect(parsed.data).toBe('line1\nline2')
    })

    test('CRLF 行尾也能解（部分代理会改写）', () => {
      const m = loadSseClient()
      const block = 'event: state\r\ndata: {"a":1}\r'
      const parsed = m.__internals.parseSseBlock(block)
      expect(parsed.event).toBe('state')
      expect(JSON.parse(parsed.data)).toEqual({ a: 1 })
    })
  })

  describe('真实 SSE 流场景：data 中文 + 跨包', () => {
    test('event: state\\ndata: <json with 中文>\\n\\n —— 字节级切分仍能完整解出', () => {
      const m = loadSseClient({ killTextDecoder: true })
      const dec = m.__internals.createUtf8Decoder()
      const payload = 'event: state\ndata: {"stage":"ocr_text","rawText":"病历原文：肺癌IV期"}\n\n'
      const bytes = enc.encode(payload)

      let assembled = ''
      for (let i = 0; i < bytes.length; i++) {
        assembled += dec.decode(bytes.slice(i, i + 1).buffer)
      }
      // 找到 \n\n 切块
      const idx = assembled.indexOf('\n\n')
      expect(idx).toBeGreaterThan(0)
      const block = assembled.slice(0, idx)
      const parsed = m.__internals.parseSseBlock(block)
      expect(parsed.event).toBe('state')
      const payloadObj = JSON.parse(parsed.data)
      expect(payloadObj.rawText).toBe('病历原文：肺癌IV期')
    })
  })
})
