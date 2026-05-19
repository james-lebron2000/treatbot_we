/**
 * 流式版 chatJson —— 调 OpenAI 兼容 SSE 接口，边收 token 边按"字段分组"广播。
 *
 * 与 llmClient.chatJson 的关系：
 *   - 同一个 PROVIDER_REGISTRY，同一个 schema 校验语义；
 *   - 默认：流式失败（网络/解析/schema）fallback 到非流式 chatJson，调用方拿到等价结果；
 *   - opts.fallbackToChatJson === false 时：流式失败直接 reject，供上层用本地 OCR 结果兜底，
 *     避免一次 OCR 链路里额外追加 1-2 个完整非流式 LLM timeout。
 *   - onFieldGroup 是流式专属能力：每凑齐一个分组就回调一次，调用方串接 publishRecordEvent。
 *
 * 不依赖 npm 'partial-json'：内置 parsePartialObject——基于"找最后一个安全逗号"的简单策略，
 * 对扁平 OCR schema 足够用（最复杂结构是 treatmentHistory 数组）。
 */

const axios = require('axios')
const { StringDecoder } = require('string_decoder')
const logger = require('../utils/logger')
const { chatJson } = require('./llmClient')
const llmRateLimiter = require('./llmRateLimiter')
const {
  GROUP_ORDER,
  GROUPS,
  findCompletedGroups,
  pickGroupFields
} = require('../../shared/streaming/fieldGroups')

const PROVIDER_REGISTRY = {
  kimi: () => ({
    apiKey: process.env.KIMI_API_KEY || '',
    baseUrl: (process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1').replace(/\/+$/, ''),
    model: process.env.KIMI_MODEL || 'kimi-k2.5',
    timeoutMs: parseInt(process.env.KIMI_TIMEOUT_MS || '60000', 10)
  }),
  openai: () => ({
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    timeoutMs: parseInt(process.env.OPENAI_TIMEOUT_MS || '60000', 10)
  }),
  doubao: () => ({
    apiKey: process.env.ARK_API_KEY || '',
    baseUrl: (process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, ''),
    model: process.env.ARK_VISION_MODEL || 'doubao-seed-1-6-vision-250815',
    timeoutMs: parseInt(process.env.ARK_TIMEOUT_MS || '180000', 10)
  })
}

/**
 * 解析一个"在写中"的 JSON 对象字符串，返回所有"已完整写完"的 top-level 键值对。
 * 思路：找到最后一个 depth=1 的逗号或闭合 `}`，截断到那里再 JSON.parse。
 * 这样在写中的最后一个键值对会被丢弃，已完成的全部保留。
 */
const parsePartialObject = (buffer) => {
  if (typeof buffer !== 'string') return {}
  const startIdx = buffer.indexOf('{')
  if (startIdx < 0) return {}

  let depth = 0
  let inString = false
  let escape = false
  let lastSafeCommaIdx = -1
  let closeBraceIdx = -1

  for (let i = startIdx; i < buffer.length; i++) {
    const c = buffer[i]
    if (escape) { escape = false; continue }
    if (inString) {
      if (c === '\\') { escape = true; continue }
      if (c === '"') inString = false
      continue
    }
    if (c === '"') { inString = true; continue }
    if (c === '{' || c === '[') {
      depth++
    } else if (c === '}' || c === ']') {
      depth--
      if (depth === 0 && c === '}') { closeBraceIdx = i; break }
    } else if (c === ',' && depth === 1) {
      lastSafeCommaIdx = i
    }
  }

  let candidate
  if (closeBraceIdx >= 0) {
    candidate = buffer.slice(startIdx, closeBraceIdx + 1)
  } else if (lastSafeCommaIdx > startIdx) {
    candidate = buffer.slice(startIdx, lastSafeCommaIdx) + '}'
  } else {
    // 还没完成第一个键值对——返回空，等下一次再试
    return {}
  }

  try {
    const parsed = JSON.parse(candidate)
    return (parsed && typeof parsed === 'object') ? parsed : {}
  } catch (_err) {
    return {}
  }
}

/**
 * 把 OpenAI 风格 SSE chunk buffer 切成 data 行，提取 delta.content。
 * 返回 { contents: string[], leftover: string }，leftover 是不完整的尾巴（下次再拼）。
 */
const extractDeltaContents = (buffer) => {
  const contents = []
  let leftover = buffer

  while (true) {
    const idx = leftover.indexOf('\n\n')
    if (idx < 0) break
    const block = leftover.slice(0, idx)
    leftover = leftover.slice(idx + 2)

    // 一个 block 可能包含多个 `data: ...` 行；OpenAI 流通常只有一条
    const lines = block.split('\n')
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const evt = JSON.parse(payload)
        const delta = evt?.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta.length) {
          contents.push(delta)
        }
      } catch (_e) {
        // 部分 provider 偶尔会插入心跳字段，忽略
      }
    }
  }

  return { contents, leftover }
}

/**
 * 主入口：流式 + 增量字段分组广播。
 *
 * @param {object} args
 * @param {'doubao'|'kimi'|'openai'} args.provider
 * @param {Array} args.messages OpenAI 风格 messages（已 PII 脱敏）
 * @param {import('zod').ZodTypeAny} args.schema 最终 zod 校验
 * @param {(group: string, fields: object, progress: number) => void} [args.onFieldGroup]
 * @param {object} [args.opts] 透传给 axios（如 timeoutMs、fallbackToChatJson）
 * @returns {Promise<any>} schema 校验通过的最终对象
 */
const streamChatJson = async ({ provider, messages, schema, onFieldGroup, opts = {} }) => {
  if (!schema || typeof schema.safeParse !== 'function') {
    throw new Error('streamChatJson: schema 必须是 zod schema')
  }
  const fallbackToChatJson = opts.fallbackToChatJson !== false

  const cfg = PROVIDER_REGISTRY[provider] && PROVIDER_REGISTRY[provider]()
  if (!cfg || !cfg.apiKey) {
    // 直接降级：没凭证根本流不起来
    if (!fallbackToChatJson) {
      const err = new Error(`streamChatJson provider ${provider} not configured`)
      err.code = 'STREAM_PROVIDER_NOT_CONFIGURED'
      throw err
    }
    return chatJson(provider, messages, schema, opts)
  }

  const body = {
    model: opts.model || cfg.model,
    temperature: typeof opts.temperature === 'number' ? opts.temperature : 1,
    messages,
    response_format: { type: 'json_object' },
    stream: true
  }

  await llmRateLimiter.acquire(provider, opts.onWait)
  let limiterReleased = false
  const releaseLimiter = () => {
    if (limiterReleased) return
    limiterReleased = true
    llmRateLimiter.release(provider)
  }

  let response
  try {
    response = await axios.post(
      `${cfg.baseUrl}/chat/completions`,
      body,
      {
        timeout: opts.timeoutMs || cfg.timeoutMs,
        responseType: 'stream',
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream'
        }
      }
    )
  } catch (err) {
    logger.warn(fallbackToChatJson
      ? 'streamChatJson 建连失败，降级到非流式 chatJson'
      : 'streamChatJson 建连失败，交给上层兜底', {
      provider, error: err.message
    })
    releaseLimiter()
    if (!fallbackToChatJson) throw err
    return chatJson(provider, messages, schema, opts)
  }

  if (!response || !response.data || typeof response.data.on !== 'function') {
    const err = new Error('streamChatJson provider did not return a stream')
    releaseLimiter()
    if (!fallbackToChatJson) throw err
    return chatJson(provider, messages, schema, opts)
  }

  return new Promise((resolve, reject) => {
    let sseBuffer = ''
    let contentBuffer = ''
    const emittedGroups = new Set()
    let lastEmitTs = 0
    const EMIT_THROTTLE_MS = 150
    // utf-8 chunk 边界保护：Buffer.toString('utf8') 在 chunk 末尾落在多字节序列中间时，
    // 会把这几个字节替换成 U+FFFD（黑底问号）。OpenAI/Doubao 的 delta.content 是 CJK 病历文本，
    // 一旦字符级损坏，最终 JSON.parse 可能还能过，但 rawText/治疗方案这些字段里就藏着乱码。
    // 用 string_decoder.StringDecoder 把不完整的尾巴留到下次 write/end，保证字符完整。
    const sseStringDecoder = new StringDecoder('utf8')
    // 防止 axios stream 同时触发 'error' 与 'end'，或 'end' 内部 chatJson 已发起后 'error' 再触发
    // —— 这两条路径都会调 chatJson 兜底，重复调 = 多花一次 token。
    // settled 一旦为 true 就吞掉后续的兜底路径；Promise 也只 resolve/reject 一次。
    let settled = false
    const safeResolve = (v) => { if (!settled) { settled = true; releaseLimiter(); resolve(v) } }
    const safeReject = (err) => { if (!settled) { settled = true; releaseLimiter(); reject(err) } }
    const fallbackChatJson = (err) => {
      if (settled) return
      if (!fallbackToChatJson) {
        safeReject(err || new Error('streamChatJson failed'))
        return
      }
      settled = true
      releaseLimiter()
      chatJson(provider, messages, schema, opts).then(resolve, reject)
    }

    const tryEmitGroups = (force = false) => {
      const now = Date.now()
      if (!force && now - lastEmitTs < EMIT_THROTTLE_MS) return
      lastEmitTs = now

      const partial = parsePartialObject(contentBuffer)
      const completed = findCompletedGroups(partial)
      for (const groupName of GROUP_ORDER) {
        if (completed.includes(groupName) && !emittedGroups.has(groupName)) {
          emittedGroups.add(groupName)
          const fields = pickGroupFields(partial, groupName)
          try {
            if (typeof onFieldGroup === 'function') {
              onFieldGroup(groupName, fields, GROUPS[groupName].progress)
            }
          } catch (cbErr) {
            logger.warn('streamChatJson onFieldGroup 回调异常（忽略）', { error: cbErr.message })
          }
        }
      }
    }

    response.data.on('data', (chunk) => {
      sseBuffer += sseStringDecoder.write(chunk)
      const { contents, leftover } = extractDeltaContents(sseBuffer)
      sseBuffer = leftover
      if (contents.length) {
        contentBuffer += contents.join('')
        tryEmitGroups(false)
      }
    })

    response.data.on('end', () => {
      if (settled) return
      // flush 残留的 utf-8 不完整尾巴（理论上 SSE 应当以 \n\n 结尾，但极端情况兜底）
      const tail = sseStringDecoder.end()
      if (tail) {
        sseBuffer += tail
        const { contents, leftover } = extractDeltaContents(sseBuffer)
        sseBuffer = leftover
        if (contents.length) contentBuffer += contents.join('')
      }
      tryEmitGroups(true)

      // 最终校验：整段 contentBuffer 必须能 JSON.parse 且过 schema
      let finalObj
      try {
        const cleaned = contentBuffer.trim().replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '')
        finalObj = JSON.parse(cleaned)
      } catch (_e) {
        finalObj = null
      }
      if (!finalObj) {
        logger.warn(fallbackToChatJson
          ? 'streamChatJson 最终内容无法 JSON.parse，降级到 chatJson'
          : 'streamChatJson 最终内容无法 JSON.parse，交给上层兜底')
        const parseErr = new Error('streamChatJson_unparseable')
        parseErr.code = 'STREAM_JSON_PARSE_FAILED'
        fallbackChatJson(parseErr)
        return
      }
      const valid = schema.safeParse(finalObj)
      if (valid.success) {
        safeResolve(valid.data)
      } else {
        logger.warn(fallbackToChatJson
          ? 'streamChatJson 最终 schema 校验失败，降级到 chatJson'
          : 'streamChatJson 最终 schema 校验失败，交给上层兜底', {
          provider,
          issues: (valid.error.issues || []).slice(0, 3)
        })
        const schemaErr = new Error('streamChatJson_schema_invalid')
        schemaErr.code = 'STREAM_SCHEMA_INVALID'
        schemaErr.issues = valid.error.issues || []
        fallbackChatJson(schemaErr)
      }
    })

    response.data.on('error', (err) => {
      if (settled) return
      logger.warn(fallbackToChatJson
        ? 'streamChatJson 流式异常，降级到 chatJson'
        : 'streamChatJson 流式异常，交给上层兜底', { provider, error: err.message })
      fallbackChatJson(err)
    })
  })
}

module.exports = {
  streamChatJson,
  __internals: {
    parsePartialObject,
    extractDeltaContents
  }
}
