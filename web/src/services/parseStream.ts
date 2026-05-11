// PRD-2026Q4 流式 OCR 客户端：消费 GET /api/medical/parse-stream
//
// 为什么不用 EventSource？
//   原生 EventSource 不支持自定义 header → 不能带 Authorization。
//   走 fetch + ReadableStream + AbortController 自己解 SSE 协议，方便鉴权 + 统一关停。
//
// fallback 策略：
//   - 连接失败 / 收到 noredis 事件 → handlers.onNoredis() 触发上游切到现有 parse-status-batch 轮询
//   - 收到 done → handlers.onDone()
//
// 协议：服务端写出 `event: <name>\ndata: <json>\n\n` 块，name 已知集合：
//   hello | noredis | state | done | error
// 其中 state.data 是 composeEvent 产物：{ recordId, stage, progress, ts, ...payload }

import { http } from './api'

export type StreamStage =
  | 'received' | 'preprocess' | 'ocr_text' | 'field_group'
  | 'completed' | 'error' | 'heartbeat'

export interface StreamEvent {
  recordId: string
  stage: StreamStage
  progress: number | null
  ts: number
  // stage='ocr_text'
  rawText?: string
  // stage='field_group'
  fieldGroup?: 'basic' | 'diagnosis' | 'treatment' | 'timeline'
  fields?: Record<string, unknown>
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

const parseSseBlock = (block: string): { event: string; data: string } | null => {
  // 一个 block 形如：
  //   event: state
  //   data: {"...":...}
  // 没有 event 行时默认 'message'
  let event = 'message'
  const dataLines: string[] = []
  for (const rawLine of block.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''))
    }
  }
  if (!dataLines.length) return null
  return { event, data: dataLines.join('\n') }
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
  switch (parsed.event) {
    case 'hello':   handlers.onHello?.(payload); break
    case 'noredis': handlers.onNoredis?.(payload); break
    case 'state':   handlers.onState(payload as StreamEvent); break
    case 'done':    handlers.onDone?.(payload); break
    case 'error':   handlers.onError?.(new Error(payload?.message || 'stream error')); break
    default: break
  }
}

/**
 * 打开一条 parse-stream SSE 连接，返回 close() 函数。
 * 错误已经回调 handlers.onError 了；调用方拿到 close 主要用于"页面切走 / 取消上传"时主动断。
 */
export const openParseStream = (
  recordIds: string[],
  handlers: ParseStreamHandlers
): (() => void) => {
  const ids = recordIds.map((s) => `${s ?? ''}`.trim()).filter(Boolean)
  if (!ids.length) {
    handlers.onError?.(new Error('parseStream: 没有 recordIds'))
    return () => {}
  }

  const baseURL = http.defaults.baseURL || ''
  const token = localStorage.getItem('token') || ''
  const url = `${baseURL}/api/medical/parse-stream?recordIds=${encodeURIComponent(ids.join(','))}`

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
      handlers.onError?.(new Error(`parse-stream HTTP ${response.status}`))
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
