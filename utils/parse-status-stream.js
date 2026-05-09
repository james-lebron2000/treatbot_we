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

const arrayBufferToString = (buf) => {
  if (!buf) return ''
  // wx.onChunkReceived 提供 ArrayBuffer；Node 环境下也可能直接传字符串。
  if (typeof buf === 'string') return buf
  try {
    const bytes = new Uint8Array(buf)
    // 简化：仅处理 UTF-8。SSE 协议规定 UTF-8。
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder('utf-8').decode(bytes)
    }
    let str = ''
    for (let i = 0; i < bytes.length; i += 1) {
      str += String.fromCharCode(bytes[i])
    }
    return decodeURIComponent(escape(str))
  } catch (e) {
    return ''
  }
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

    buffer += arrayBufferToString(chunkResp && chunkResp.data)
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
  __testables: { splitFrames, parseFrame, arrayBufferToString }
}
