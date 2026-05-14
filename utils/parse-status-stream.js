/**
 * Plan §Phase 2.3：SSE 客户端 —— 用 wx.request 的 enableChunked 模式消费
 * `/api/medical/parse-status-stream` 服务端推送的 EventSource 流。
 *
 * 设计目标：
 *   - 主路径：建联成功 → 客户端立刻看到 OCR 状态推送（P50 完成感知 4.5s → <500ms）
 *   - 兜底路径：建联超时 / 老版本 SDK 不支持 onChunkReceived / 服务端推 noredis →
 *     调 onError({ fallback: 'polling' })，调用方立刻 startPolling()。
 *
 * 接口约定：
 *   const stream = openParseStatusStream({ fileIds, onState, onDone, onError })
 *   stream && stream.close()  // 客户端主动中止（页面 unload / 用户取消）
 *   返回 null = SDK 不支持 / 缺参数，调用方应直接走轮询。
 *
 * SSE 帧解析规则（仅实现项目实际使用的子集）：
 *   - 帧用 `\n\n` 分割
 *   - 每帧由若干行构成；以 `event:` 开头记录事件名（默认 'message'），`data:` 开头记录 payload
 *   - 以 `:` 开头是注释（心跳），忽略
 */

/**
 * PRD-2026Q4 流式 OCR：把跨 chunk 的 utf-8 多字节字符正确拼起来。
 *
 * 历史踩坑：旧的 arrayBufferToString 在每个 chunk 上各做一次 TextDecoder.decode() —— 默认 streaming=false，
 * 字符末尾若落在多字节序列中间（3-byte CJK 或 4-byte emoji 被 TCP 切两段），尾部那几个字节会被
 * 替换成 U+FFFD（黑底问号），整个 SSE 帧的 JSON.parse 失败被外层 catch 静默吞掉，field_group 事件永久丢失。
 *
 * 修法：用 `new TextDecoder('utf-8', { fatal:false })` + `decode(chunk, { stream:true })`，
 * 让 decoder 自己 hold 住跨包的尾巴字节，下一次 decode 时再续上。
 *
 * Fallback：基础库 2.20.x 没有 TextDecoder —— 手写一个把"未完成的尾巴"挂在 `pendingBytes` 上，
 * 下次 decode 时拼回到前面继续解。和 TextDecoder 的语义等价。
 *
 * 关键 invariant：同一个 stream 必须复用同一个 decoder 实例（不能每个 chunk 都 new 一个），
 * 否则连续 chunk 之间的尾巴字节会丢。openParseStatusStream 在闭包里持有 decoder，已满足。
 */
const createUtf8Decoder = () => {
  if (typeof TextDecoder !== 'undefined') {
    const td = new TextDecoder('utf-8', { fatal: false })
    return {
      decode: (buf) => {
        if (!buf) return ''
        try {
          const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
          return td.decode(view, { stream: true })
        } catch (_e) {
          return ''
        }
      },
      end: () => {
        try { return td.decode() } catch (_e) { return '' }
      }
    }
  }
  // 手写 fallback：累积「最后一段未完成的多字节」到 pendingBytes，下次拼回头部。
  let pendingBytes = []
  // 判断一个 byte 是 utf-8 序列的首字节，并返回其期望总长度（1/2/3/4）。
  // 0xxxxxxx → 1, 110xxxxx → 2, 1110xxxx → 3, 11110xxx → 4
  const utf8LenFromLead = (b) => {
    if ((b & 0x80) === 0) return 1
    if ((b & 0xe0) === 0xc0) return 2
    if ((b & 0xf0) === 0xe0) return 3
    if ((b & 0xf8) === 0xf0) return 4
    return 1   // 非法首字节，按 1 字节吞掉避免无限挂起
  }
  return {
    decode: (buf) => {
      if (!buf) return ''
      let bytes
      try {
        bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
      } catch (_e) {
        return ''
      }
      // 把上次留的尾巴拼到 input 前面
      const combined = pendingBytes.length
        ? Uint8Array.from([...pendingBytes, ...bytes])
        : bytes
      pendingBytes = []
      // 从尾部往前找到「最后一个完整字符」的边界
      let cutAt = combined.length
      let i = combined.length - 1
      while (i >= 0 && (combined[i] & 0xc0) === 0x80) i--   // 跳过续字节
      if (i >= 0) {
        const need = utf8LenFromLead(combined[i])
        if (i + need > combined.length) {
          // 尾巴不完整，把 [i, end) 留到下次
          cutAt = i
          pendingBytes = Array.from(combined.slice(i))
        }
      }
      // 解码完整部分。注意 String.fromCharCode 路径只在没有 TextDecoder 时走到，
      // 这里手写一个 utf-8 → string，覆盖 1/2/3/4 字节序列。
      let out = ''
      let j = 0
      while (j < cutAt) {
        const b1 = combined[j]
        if (b1 < 0x80) { out += String.fromCharCode(b1); j += 1; continue }
        if ((b1 & 0xe0) === 0xc0 && j + 1 < cutAt) {
          const cp = ((b1 & 0x1f) << 6) | (combined[j + 1] & 0x3f)
          out += String.fromCharCode(cp); j += 2; continue
        }
        if ((b1 & 0xf0) === 0xe0 && j + 2 < cutAt) {
          const cp = ((b1 & 0x0f) << 12) | ((combined[j + 1] & 0x3f) << 6) | (combined[j + 2] & 0x3f)
          out += String.fromCharCode(cp); j += 3; continue
        }
        if ((b1 & 0xf8) === 0xf0 && j + 3 < cutAt) {
          const cp = ((b1 & 0x07) << 18) | ((combined[j + 1] & 0x3f) << 12)
            | ((combined[j + 2] & 0x3f) << 6) | (combined[j + 3] & 0x3f)
          // surrogate pair
          const adj = cp - 0x10000
          out += String.fromCharCode(0xd800 + (adj >>> 10), 0xdc00 + (adj & 0x3ff))
          j += 4; continue
        }
        // 非法 / 截断：跳一个字节避免死循环
        j += 1
      }
      return out
    },
    end: () => {
      const tail = pendingBytes
      pendingBytes = []
      // 残留就当损坏字符丢掉（与 TextDecoder fatal:false 一致）
      return tail.length ? '' : ''
    }
  }
}

// 旧函数签名兼容：旧测试可能直接调 arrayBufferToString —— 内部包一个 short-lived decoder。
// 注意：这种 one-shot 用法在 chunk 边界仍会丢字节，仅供「整条字符串一次性 decode」的纯函数测试场景。
// 真实 SSE 流走 openParseStatusStream → 闭包持有的 decoder，不会撞这条路径。
const arrayBufferToString = (buf) => {
  if (!buf) return ''
  if (typeof buf === 'string') return buf
  const dec = createUtf8Decoder()
  return dec.decode(buf) + dec.end()
}

/**
 * 把累积的 SSE 文本切成完整帧 + 残余 buffer。导出供单测断言。
 */
const splitFrames = (raw) => {
  const parts = raw.split(/\r?\n\r?\n/)
  const remainder = parts.pop() || ''
  return { frames: parts, remainder }
}

/**
 * 解析单帧 SSE 文本 → { event, data }，data 已尝试 JSON.parse。
 * 解析失败返回 null（调用方应忽略该帧）。
 */
const parseFrame = (frame) => {
  let event = 'message'
  const dataLines = []
  for (const line of frame.split(/\r?\n/)) {
    if (!line) continue
    if (line.startsWith(':')) continue // SSE 注释 / 心跳
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (!dataLines.length) return null
  let data
  try { data = JSON.parse(dataLines.join('\n')) } catch (e) { return null }
  return { event, data }
}

/**
 * 打开 SSE 流；返回 { close } 或 null（不支持 / 参数不合法）。
 *
 * @param {object} opts
 * @param {string[]} opts.fileIds - 要订阅的 record / file id 列表（≤ 20）
 * @param {string} opts.url - 完整 URL（含 query string + Authorization 由 header 传）
 * @param {string} opts.token - 鉴权 token（写到 Authorization header）
 * @param {(payload: object) => void} opts.onState - state 帧回调
 * @param {(payload?: object) => void} opts.onDone - done 帧回调
 * @param {(reason: object) => void} opts.onError - 错误 / fallback 回调
 * @param {number} [opts.openTimeoutMs=10000] - 开通超时；超时后 onError({ code:'open_timeout' })
 * @param {object} [opts.wx] - 注入的 wx 对象（默认全局 wx），便于单测。
 */
const openParseStatusStream = (opts) => {
  const {
    fileIds,
    url,
    token,
    onState,
    onDone,
    onError,
    openTimeoutMs = 10000,
    wx: wxObj
  } = opts || {}

  const wxRef = wxObj || (typeof wx !== 'undefined' ? wx : null)
  if (!wxRef || typeof wxRef.request !== 'function') return null
  if (!Array.isArray(fileIds) || !fileIds.length || !url) return null

  let buffer = ''
  let closed = false
  let firstChunkReceived = false
  // PRD-2026Q4：每条流持有自己的 utf-8 decoder，跨 chunk 的多字节 CJK / emoji 不会被切坏。
  const utf8Decoder = createUtf8Decoder()

  const callError = (reason) => {
    if (closed) return
    closed = true
    if (firstChunkTimer) {
      clearTimeout(firstChunkTimer)
      firstChunkTimer = null
    }
    if (typeof onError === 'function') onError(reason)
  }

  const callDone = (payload) => {
    if (closed) return
    closed = true
    if (firstChunkTimer) {
      clearTimeout(firstChunkTimer)
      firstChunkTimer = null
    }
    if (typeof onDone === 'function') onDone(payload)
  }

  const requestTask = wxRef.request({
    url,
    method: 'GET',
    header: token ? { Authorization: `Bearer ${token}` } : {},
    enableChunked: true,
    responseType: 'text',
    success: () => {
      // 服务端 res.end() 后 success 回调触发；当作 done。
      if (!closed) callDone({ reason: 'eof' })
    },
    fail: (err) => {
      callError({ code: 'request_fail', detail: err })
    }
  })

  if (!requestTask || typeof requestTask.onChunkReceived !== 'function') {
    // 微信 ≤ 2.20 不支持 chunked 接收；让调用方直接走轮询。
    if (requestTask && typeof requestTask.abort === 'function') {
      try { requestTask.abort() } catch (e) { /* noop */ }
    }
    return null
  }

  let firstChunkTimer = setTimeout(() => {
    if (closed || firstChunkReceived) return
    callError({ code: 'open_timeout' })
    try { requestTask.abort && requestTask.abort() } catch (e) { /* noop */ }
  }, openTimeoutMs)

  requestTask.onChunkReceived((chunkResp) => {
    if (closed) return
    firstChunkReceived = true
    if (firstChunkTimer) {
      clearTimeout(firstChunkTimer)
      firstChunkTimer = null
    }

    // PRD-2026Q4 流式 OCR：用持有状态的 decoder 累积 chunk，跨包的多字节字符不会被替成 U+FFFD。
    const chunkText = chunkResp && chunkResp.data
      ? (typeof chunkResp.data === 'string' ? chunkResp.data : utf8Decoder.decode(chunkResp.data))
      : ''
    buffer += chunkText
    const { frames, remainder } = splitFrames(buffer)
    buffer = remainder

    for (const frame of frames) {
      const parsed = parseFrame(frame)
      if (!parsed) continue
      const { event, data } = parsed

      if (event === 'noredis') {
        // 服务端明确告知 Redis 不可用 → fallback 轮询
        callError({ code: 'noredis', fallback: 'polling' })
        try { requestTask.abort && requestTask.abort() } catch (e) { /* noop */ }
        return
      }
      if (event === 'state') {
        if (typeof onState === 'function') onState(data)
      } else if (event === 'done') {
        callDone(data)
        try { requestTask.abort && requestTask.abort() } catch (e) { /* noop */ }
        return
      }
    }
  })

  return {
    close: () => {
      if (closed) return
      closed = true
      if (firstChunkTimer) {
        clearTimeout(firstChunkTimer)
        firstChunkTimer = null
      }
      try { requestTask.abort && requestTask.abort() } catch (e) { /* noop */ }
    }
  }
}

module.exports = {
  openParseStatusStream,
  // 暴露给单测：纯函数，无副作用
  __testables: { splitFrames, parseFrame, arrayBufferToString, createUtf8Decoder }
}
