// PRD-2026Q4 流式 OCR 客户端：消费 GET /api/medical/parse-status-stream
//
// 与服务端合约（main / PR #11 Plan §Phase 2.3 + 本 PR 的 streaming 扩展）：
//   - URL: /api/medical/parse-status-stream?recordIds=a,b,c
//   - 服务端写出 `event: <name>\ndata: <json>\n\n`，name 已知集合：
//       state | done | noredis | error
//   - state.data 形如：
//       {
//         fileId, recordId, status, progress, result, partial, errorMsg, cancelledAt, ts,
//         // PRD-2026Q4 streaming OCR 扩展（仅在 worker 发 statusPhase='streaming' 时出现）：
//         statusPhase?, fieldGroup?, fields?, rawText?
//       }
//
// 本模块对外保留旧的 stage-based `StreamEvent` 接口（UploadView 早期版本以 stage 为中心写的渲染逻辑），
// 在 dispatch 这一层把 main 的 status-based frame 折成 stage：
//   - status='running' + statusPhase='queued'/'analyzing' / 未携带 streaming payload → 'preprocess'
//   - status='running' + 携带 rawText                                       → 'ocr_text'
//   - status='running' + 携带 fieldGroup+fields                              → 'field_group'
//   - status='running' + statusPhase='structuring'                          → 'preprocess'（进度条 90%）
//   - status='completed'                                                    → 'completed'
//   - status='error'                                                        → 'error'
//   - status='cancelled'                                                    → 'error'（携带 '已取消' 文案）
//
// 为什么不用 EventSource？
//   原生 EventSource 不支持自定义 header → 不能带 Authorization。
//   走 fetch + ReadableStream + AbortController 自己解 SSE 协议，方便鉴权 + 统一关停。
//
// fallback 策略：
//   - 连接失败 / 收到 noredis 事件 → handlers.onNoredis() 触发上游切到现有 parse-status-batch 轮询
//   - 收到 done → handlers.onDone()

import { http } from './api'

export type StreamStage =
  | 'received' | 'preprocess' | 'ocr_text' | 'field_group'
  | 'completed' | 'error' | 'heartbeat'

export interface StreamEvent {
  recordId: string
  stage: StreamStage
  progress: number | null
  seq?: number
  ts: number
  // stage='ocr_text'
  rawText?: string
  textLength?: number
  pageCount?: number
  providerWait?: {
    waiting?: number
    capacity?: number
    [key: string]: unknown
  }
  message?: string
  // stage='field_group'
  fieldGroup?: 'basic' | 'diagnosis' | 'treatment' | 'timeline'
  fields?: Record<string, unknown>
  fieldPatch?: boolean
  // stage='completed'
  result?: {
    entities: Record<string, unknown>
    text: string
    provider: string
    confidence: number
  }
  // stage='error'
  errorMsg?: string
}

export interface ParseStreamHandlers {
  onHello?: (info: { hasRedis: boolean; recordIds: string[] }) => void
  onState: (evt: StreamEvent) => void
  onDone?: (info: { reason: string }) => void
  onError?: (err: Error) => void
  /** Redis 不可用 / 浏览器不支持 fetch streaming → 上游切到轮询 */
  onNoredis?: (info: { reason: string }) => void
}

const SSE_DELIMITER = '\n\n'
export interface ParseStreamOptions {
  afterSeq?: Record<string, number>
}

/**
 * 把 main 的 status-based frame 折成 UploadView 早期版本用的 stage-based StreamEvent。
 * 关键点：
 *  - field_group 必须在 ocr_text 之前判定 —— streaming 阶段服务端可能同时携带 fieldGroup+rawText？
 *    （目前不会，但即使将来同帧也 OK，优先把"字段已就位"信号给前端）
 *  - completed 时，main 的 result 是平铺 {diagnosis, stage, geneMutation, treatment, rawText, confidence}，
 *    UploadView 期望 `evt.result.entities`（mergeRecords/normalizeRecord 读这个 key）；
 *    所以重新包成 { entities, text, provider, confidence }，rawText 截断 500 字也只能丢给 text。
 *  - cancelled 折成 error + errorMsg='已取消'，让上游一致的 erroredCount 走通；UI 文案再做兜底。
 */
const folMainFrameToStage = (payload: any): StreamEvent | null => {
  if (!payload || !payload.recordId) return null
  const recordId = String(payload.recordId)
  const progress = typeof payload.progress === 'number' ? payload.progress : null
  const seq = typeof payload.seq === 'number' ? payload.seq : undefined
  const ts = typeof payload.ts === 'number' ? payload.ts : Date.now()
  const status = String(payload.status || 'unknown')

  // streaming 扩展：fieldGroup + fields → field_group stage
  if (payload.fieldGroup && payload.fields && typeof payload.fields === 'object') {
    return {
      recordId,
      stage: 'field_group',
      progress,
      seq,
      ts,
      fieldGroup: payload.fieldGroup,
      fields: payload.fields,
      fieldPatch: !!payload.fieldPatch
    }
  }
  // streaming 扩展：rawText（取得 OCR 全文，前端展开 raw text 折叠面板）
  if ((typeof payload.rawText === 'string' && payload.rawText.length) || typeof payload.textLength === 'number') {
    return {
      recordId,
      stage: 'ocr_text',
      progress,
      seq,
      ts,
      rawText: typeof payload.rawText === 'string' ? payload.rawText : undefined,
      textLength: typeof payload.textLength === 'number' ? payload.textLength : undefined,
      pageCount: typeof payload.pageCount === 'number' ? payload.pageCount : undefined,
      providerWait: payload.providerWait && typeof payload.providerWait === 'object' ? payload.providerWait : undefined,
      message: typeof payload.message === 'string' ? payload.message : undefined
    }
  }

  if (status === 'completed') {
    const r = payload.result || {}
    // 新契约优先读 result.entities；旧契约仍兼容扁平 result。
    // 不再只挑 7 个字段，否则 age/pathologyType/lab/imaging 等富字段会在 Web 端丢失。
    const entities: Record<string, unknown> = (r.entities && typeof r.entities === 'object' && !Array.isArray(r.entities))
      ? { ...(r.entities as Record<string, unknown>) }
      : {}
    for (const [key, value] of Object.entries(r)) {
      if (['id', 'recordId', 'entities', 'schemaVersion', 'promptVersion', 'confidence', 'rawText', 'source', 'providerMeta'].includes(key)) {
        continue
      }
      if (value !== undefined && value !== null && value !== '') {
        entities[key] = value
      }
    }
    return {
      recordId,
      stage: 'completed',
      progress,
      seq,
      ts,
      result: {
        entities,
        text: typeof r.rawText === 'string' ? r.rawText : '',
        provider: typeof r.provider === 'string'
          ? r.provider
          : (r.providerMeta && typeof r.providerMeta === 'object' && typeof (r.providerMeta as Record<string, unknown>).provider === 'string'
              ? String((r.providerMeta as Record<string, unknown>).provider)
              : 'unknown'),
        confidence: typeof r.confidence === 'number' ? r.confidence : 0.5
      }
    }
  }
  if (status === 'error') {
    return {
      recordId,
      stage: 'error',
      progress,
      seq,
      ts,
      errorMsg: typeof payload.errorMsg === 'string' ? payload.errorMsg : '解析失败'
    }
  }
  if (status === 'cancelled') {
    return {
      recordId,
      stage: 'error',
      progress,
      seq,
      ts,
      errorMsg: '已取消'
    }
  }

  // 其他 running 阶段（queued / analyzing / structuring 未携带 streaming payload）
  // 折成 preprocess —— UploadView 的阶段指示器把它当作"准备/识别中"，进度条以 progress 数字为准。
  return {
    recordId,
    stage: 'preprocess',
    progress,
    seq,
    ts,
    pageCount: typeof payload.pageCount === 'number' ? payload.pageCount : undefined,
    providerWait: payload.providerWait && typeof payload.providerWait === 'object' ? payload.providerWait : undefined,
    message: typeof payload.message === 'string' ? payload.message : undefined
  }
}

const parseSseBlock = (block: string): { event: string; data: string; id?: string } | null => {
  let event = 'message'
  let id = ''
  const dataLines: string[] = []
  for (const rawLine of block.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('id:')) {
      id = line.slice(3).trim()
    } else if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''))
    }
  }
  if (!dataLines.length) return null
  return { event, data: dataLines.join('\n'), id: id || undefined }
}

const dispatchBlock = (block: string, handlers: ParseStreamHandlers) => {
  const parsed = parseSseBlock(block)
  if (!parsed) return
  let payload: any
  try {
    payload = JSON.parse(parsed.data)
  } catch {
    return  // 心跳行或损坏数据，忽略
  }
  if (parsed.id && payload && typeof payload === 'object' && payload.seq === undefined) {
    const colon = parsed.id.lastIndexOf(':')
    const seq = colon > 0 ? Number(parsed.id.slice(colon + 1)) : Number(parsed.id)
    if (Number.isFinite(seq)) payload.seq = seq
  }
  switch (parsed.event) {
    case 'noredis': handlers.onNoredis?.(payload); break
    case 'state': {
      const evt = folMainFrameToStage(payload)
      if (evt) handlers.onState(evt)
      break
    }
    case 'done':    handlers.onDone?.(payload); break
    case 'error':   handlers.onError?.(new Error(payload?.message || 'stream error')); break
    default: break
  }
}

/**
 * 打开一条 parse-status-stream SSE 连接，返回 close() 函数。
 * 错误已经回调 handlers.onError 了；调用方拿到 close 主要用于"页面切走 / 取消上传"时主动断。
 */
export const openParseStream = (
  recordIds: string[],
  handlers: ParseStreamHandlers,
  options: ParseStreamOptions = {}
): (() => void) => {
  const ids = recordIds.map((s) => `${s ?? ''}`.trim()).filter(Boolean)
  if (!ids.length) {
    handlers.onError?.(new Error('parseStream: 没有 recordIds'))
    return () => {}
  }

  const baseURL = http.defaults.baseURL || ''
  const token = localStorage.getItem('token') || ''
  const query = new URLSearchParams({ recordIds: ids.join(',') })
  const afterPairs = Object.entries(options.afterSeq || {})
    .filter(([id, seq]) => ids.includes(id) && Number.isFinite(Number(seq)) && Number(seq) >= 0)
    .map(([id, seq]) => `${id}:${Number(seq)}`)
  if (afterPairs.length) query.set('afterSeq', afterPairs.join(','))
  const url = `${baseURL}/api/medical/parse-status-stream?${query.toString()}`

  const ctrl = new AbortController()
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    try { ctrl.abort() } catch { /* ignore */ }
  }

  // 浏览器不支持 ReadableStream → 直接 noredis 让上游轮询兜底
  if (typeof ReadableStream === 'undefined' || typeof TextDecoder === 'undefined') {
    handlers.onNoredis?.({ reason: 'browser does not support fetch streaming' })
    return close
  }

  const run = async () => {
    let response: Response
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        signal: ctrl.signal,
        credentials: 'omit',
        cache: 'no-store'
      })
    } catch (err) {
      if (closed) return
      handlers.onError?.(err as Error)
      return
    }

    if (!response.ok || !response.body) {
      handlers.onError?.(new Error(`parse-status-stream HTTP ${response.status}`))
      return
    }

    // Content-Type 守门：如果不是 text/event-stream（例如 nginx 把 SSE 当普通 JSON 缓冲、
    // 测试环境的 catch-all mock 返了 application/json、网关把 SSE 转成了 chunked JSON），
    // 继续按 SSE 解析会"读完 body 都没 \n\n → 静默退出 → 没人触发 fallback"，
    // 上游就死等到超时。
    //
    // 注意走 onError 而不是 onNoredis：onNoredis 在调用方有个 8s 哨兵（等本地 EventEmitter
    // 兜底），但当前情形下 SSE 通道根本不可用，再等 8s 是浪费。onError 直接进入轮询 fallback。
    const ct = (response.headers.get('content-type') || '').toLowerCase()
    if (!ct.includes('text/event-stream')) {
      handlers.onError?.(new Error(`parse-status-stream non-SSE content-type: ${ct || 'none'}`))
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    try {
      while (!closed) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let idx
        while ((idx = buffer.indexOf(SSE_DELIMITER)) >= 0) {
          const block = buffer.slice(0, idx)
          buffer = buffer.slice(idx + SSE_DELIMITER.length)
          if (block.length) dispatchBlock(block, handlers)
        }
      }
      // flush 残留：服务端 res.end() 之前写了一段没换行的就在这
      const tail = buffer + decoder.decode()
      if (tail.trim()) dispatchBlock(tail, handlers)
    } catch (err) {
      if (!closed) handlers.onError?.(err as Error)
    } finally {
      try { reader.releaseLock() } catch { /* ignore */ }
    }
  }

  run().catch((err) => {
    if (!closed) handlers.onError?.(err as Error)
  })

  return close
}

// 测试桩：让 web/tests 单测能直接断言 frame 折叠逻辑（不必启 fetch / SSE 真实通道）
export const __internals = { folMainFrameToStage, parseSseBlock }
