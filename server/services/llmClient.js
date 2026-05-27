/**
 * Q3-红线 §A.1.2：统一 LLM 调用封装。
 *
 * 责任边界：
 *  - 调用方（ocr.js 等）负责把病历原文做 scrubForLlm，再把 messages 传给本模块；
 *    本模块本身不感知 mapping，也不打印 prompt 内容（只打 promptHash）。
 *  - 本模块负责：构造 axios 请求 → JSON.parse → schema.safeParse → 失败重试一次（temperature=0）→
 *    再失败抛出 LlmSchemaError，由调用方决定 fallback 到下一 provider 或规则兜底。
 *
 * 不做：
 *  - 不接管现有 OCR fallback 链（ocr.js 的 recognizeGeneral 仍掌控 provider 顺序）。
 *  - 不持久化 mapping、不持久化 prompt。
 */

const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const {
  getDoubaoApiKey,
  getDoubaoBaseUrl,
  getDoubaoVisionModel,
  getDoubaoTextModel
} = require('../utils/doubaoEnv');
// Plan §Phase 1.1：进程内 LLM 并发闸（token bucket / semaphore）。每次 axios 调用前 acquire，
// finally release，永远不会让同一 provider 在本进程内超出配额。
const llmRateLimiter = require('./llmRateLimiter');

class LlmSchemaError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'LlmSchemaError';
    this.details = details || {};
  }
}

/**
 * provider → endpoint config 表。新增 provider 在这里加一行即可。
 * apiKey / baseUrl / model 在调用时从 process.env 取，避免模块加载时缓存空值。
 *
 * `chatCompletionPath` 可选：默认 `/chat/completions`（OpenAI 兼容路径）。
 * 全部 provider（Doubao / Kimi / OpenAI）都用 OpenAI 兼容 body shape。
 */
const PROVIDER_REGISTRY = {
  // Kimi 保留为可选 fallback；Doubao 不可用时可以启用 KIMI_API_KEY 顶上去。
  kimi: () => ({
    apiKey: process.env.KIMI_API_KEY || '',
    baseUrl: (process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1').replace(/\/+$/, ''),
    model: process.env.KIMI_MODEL || 'kimi-k2.5',
    timeoutMs: parseInt(process.env.KIMI_TIMEOUT_MS || '45000', 10),
    chatCompletionPath: '/chat/completions'
  }),
  openai: () => ({
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    timeoutMs: parseInt(process.env.OPENAI_TIMEOUT_MS || '45000', 10),
    chatCompletionPath: '/chat/completions'
  }),
  // Doubao / 火山方舟 Ark（OpenAI 兼容协议；生产 OCR 主路径）。
  // 视觉默认模型：doubao-seed-1-6-vision-250815；body shape 与 OpenAI 完全一致。
  doubao: () => ({
    apiKey: getDoubaoApiKey(),
    baseUrl: getDoubaoBaseUrl(),
    // Ark 必须用带版本后缀的具体模型 ID（短名 doubao-seed-1.6-vision 会 404）。
    model: getDoubaoVisionModel(),
    timeoutMs: parseInt(process.env.ARK_TIMEOUT_MS || '180000', 10),
    chatCompletionPath: '/chat/completions'
  })
};

const resolveDefaultModel = (providerKey, cfg, opts = {}) => {
  if (opts.model) return opts.model;
  if (providerKey === 'doubao' && `${opts.operation || ''}`.includes('ocr_text')) {
    return getDoubaoTextModel();
  }
  return cfg.model;
};

const cleanJsonContent = (content) => {
  if (!content) return '';
  const trimmed = String(content).trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
};

const computePromptHash = (messages) => {
  try {
    return crypto
      .createHash('sha1')
      .update(JSON.stringify(messages))
      .digest('hex')
      .slice(0, 12);
  } catch (_e) {
    return 'unhashable';
  }
};

/**
 * 单次 chat completion 调用（不带 schema 校验、不带重试）。
 * @returns {Promise<{rawContent: string, parsed: any}>}
 */
const callOnce = async (providerKey, messages, opts = {}) => {
  const cfg = PROVIDER_REGISTRY[providerKey] && PROVIDER_REGISTRY[providerKey]();
  if (!cfg || !cfg.apiKey) {
    throw new Error(`provider_not_configured:${providerKey}`);
  }

  const body = {
    model: resolveDefaultModel(providerKey, cfg, opts),
    temperature: typeof opts.temperature === 'number' ? opts.temperature : 1,
    messages,
    response_format: { type: 'json_object' }
  };

  // 所有 provider 走 OpenAI 兼容的 `/chat/completions`（body shape 是 OpenAI 风格）。
  const chatPath = cfg.chatCompletionPath || '/chat/completions';

  // Plan §Phase 1.1：进入限流闸；finally 释放即使 axios 抛错。
  // Wave 2 §F5：opts.onWait（可选）—— 进入排队时回调一次，caller 可以推 SSE 'queued' 帧。
  await llmRateLimiter.acquire(providerKey, opts.onWait);
  let response;
  try {
    response = await axios.post(
      `${cfg.baseUrl}${chatPath}`,
      body,
      {
        timeout: opts.timeoutMs || cfg.timeoutMs,
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
  } finally {
    llmRateLimiter.release(providerKey);
  }

  const rawContent = response?.data?.choices?.[0]?.message?.content || '';
  const cleaned = cleanJsonContent(rawContent);
  let parsed;
  try {
    // 这里是受信任入口：内容来自 LLM provider，且后面会立刻过 zod 校验。
    parsed = JSON.parse(cleaned);
  } catch (_jsonErr) {
    parsed = null;
  }

  return { rawContent, parsed };
};

/**
 * 主入口：调一次 → schema 不通过则换 temperature=0 重试一次 → 仍失败抛 LlmSchemaError。
 * 调用方按需在 catch 块里 fallback 到下一个 provider / 规则兜底。
 *
 * @param {string} provider 'doubao' | 'kimi' | 'openai'
 * @param {Array} messages OpenAI 风格 messages 数组（已 PII 脱敏）
 * @param {import('zod').ZodTypeAny} schema zod schema
 * @param {object} [opts] 透传给 callOnce 的额外参数
 * @returns {Promise<any>} schema 校验通过的对象
 */
const chatJson = async (provider, messages, schema, opts = {}) => {
  if (!schema || typeof schema.safeParse !== 'function') {
    throw new Error('chatJson: schema 必须是 zod schema');
  }
  const promptHash = computePromptHash(messages);

  // 第一次尝试：调用方传入的 temperature（默认 1）。
  // 网络/凭证错误直接抛，不在这里重试 —— 重试只针对 schema 失败的情形。
  const firstResult = await callOnce(provider, messages, opts);

  if (firstResult.parsed) {
    const valid = schema.safeParse(firstResult.parsed);
    if (valid.success) {
      return valid.data;
    }
    logger.warn('llmClient schema 校验失败，准备重试', {
      provider,
      promptHash,
      schemaError: (valid.error.issues || []).slice(0, 5)
    });
  } else {
    logger.warn('llmClient 返回内容无法 JSON.parse，准备重试', { provider, promptHash });
  }

  // 第二次尝试：temperature=0，让模型更确定地返回结构化输出。
  let retryResult;
  try {
    retryResult = await callOnce(provider, messages, { ...opts, temperature: 0 });
  } catch (err) {
    throw new LlmSchemaError(`llmClient retry network error: ${err.message}`, {
      provider,
      promptHash
    });
  }

  if (retryResult.parsed) {
    const retryValid = schema.safeParse(retryResult.parsed);
    if (retryValid.success) {
      return retryValid.data;
    }
    logger.warn('llmClient 重试后 schema 仍失败', {
      provider,
      promptHash,
      schemaError: (retryValid.error.issues || []).slice(0, 5)
    });
    throw new LlmSchemaError('llmClient_schema_invalid', {
      provider,
      promptHash,
      issues: retryValid.error.issues
    });
  }

  throw new LlmSchemaError('llmClient_unparseable', { provider, promptHash });
};

/**
 * Plan §Phase 1.4：流式 OCR 字段抽取。
 *
 * 输入：partial JSON buffer（流式累积，可能未闭合）
 * 输出：已闭合且属于 OCR 白名单的字段 → object；无任何字段 → null
 *
 * 实现要点：
 *   - 只挑"已经闭合"的字段值 —— 字符串必须有结尾 `"`、null 必须完整、数字必须确认结束。
 *   - 字段白名单与 OcrExtractionSchema 顶层 17+ 富化字段对齐（见 llmSchemas.js）。
 *   - 字符串值用 JSON.parse 解码（处理 \", \\, \uXXXX 等转义），保证渲染时不出现裸 \"。
 *   - 函数体内用局部 RegExp，避免共享 lastIndex 污染（多次调用幂等）。
 *
 * 边界：buffer 太短（<5）或为空时直接返回 null，避免 regex 跑空。
 */
const OCR_FIELD_WHITELIST = new Set([
  'rawText', 'diagnosis', 'stage', 'geneMutation', 'pdl1',
  'treatment', 'treatmentLine', 'ecog', 'age', 'weight', 'height',
  'fertilityStatus', 'confidence',
  'tnmStage', 'pathologyType', 'sex', 'hospital', 'diagnosisDate'
]);

const extractPartialOcrFields = (buffer) => {
  if (!buffer || typeof buffer !== 'string') return null;
  if (buffer.length < 5) return null;

  // KEY: ASCII 标识符；VALUE: 已闭合字符串 / null / 数字。
  // 字符串部分用 (?:[^"\\]|\\.)*  支持任意转义字符。
  const re = /"([a-zA-Z][a-zA-Z0-9_]*)"\s*:\s*("(?:[^"\\]|\\.)*"|null|-?\d+(?:\.\d+)?)/g;

  const result = {};
  let m;
  while ((m = re.exec(buffer)) !== null) {
    const key = m[1];
    if (!OCR_FIELD_WHITELIST.has(key)) continue;
    const rawVal = m[2];
    if (rawVal === 'null') {
      result[key] = null;
    } else if (rawVal[0] === '"') {
      try { result[key] = JSON.parse(rawVal); } catch (_e) { /* skip */ }
    } else {
      const n = Number(rawVal);
      if (!Number.isNaN(n)) result[key] = n;
    }
  }

  return Object.keys(result).length ? result : null;
};

/**
 * Plan §Phase 1.4：流式 chat completion。
 *
 *   await streamingChatJson(provider, messages, schema, {
 *     onFirstToken(elapsedMs)  → 首段 delta 到达时
 *     onPartial(partialObj)    → 已抽出的字段集合发生变化时
 *     operation: 'ocr_image'   → 用作 prom-client 标签
 *     temperature, model, timeoutMs ...
 *   })
 *
 * 与 chatJson 的差异：
 *   - 一定走 stream:true；axios responseType:'stream'。
 *   - 用户感知"30s 看到诊断、分期"在这里实现 —— OCR 主路径调本函数后用
 *     onPartial 把 partial 写到 record.structured.partial + status_phase='streaming'。
 *   - 不做"换温度重试一次"—— 流式只走一遍；上层若 schema 失败再决定 fallback。
 *
 * 错误：
 *   - schema 缺失 → throw Error /schema/
 *   - provider 未配置 → throw Error provider_not_configured:<key>
 *   - 流式 JSON 不可解析 / schema 校验失败 → throw LlmSchemaError
 *   - HTTP / 网络错误 → 透传 axios error
 */
const streamingChatJson = async (providerKey, messages, schema, opts = {}) => {
  if (!schema || typeof schema.safeParse !== 'function') {
    throw new Error('streamingChatJson: schema 必须是 zod schema');
  }
  const cfg = PROVIDER_REGISTRY[providerKey] && PROVIDER_REGISTRY[providerKey]();
  if (!cfg || !cfg.apiKey) {
    throw new Error(`provider_not_configured:${providerKey}`);
  }

  const { onPartial, onFirstToken, operation = 'unknown' } = opts || {};
  const promptHash = computePromptHash(messages);

  const body = {
    model: opts.model || cfg.model,
    temperature: typeof opts.temperature === 'number' ? opts.temperature : 1,
    messages,
    response_format: { type: 'json_object' },
    stream: true
  };
  const chatPath = cfg.chatCompletionPath || '/chat/completions';
  const startedAt = Date.now();

  // 限流闸；但是流式持续时间长，acquire 后必须确保 finally 释放。
  // Wave 2 §F5：opts.onWait 透传到 acquire，让流式调用也能在排队时给前端推 'queued' 帧。
  await llmRateLimiter.acquire(providerKey, opts.onWait);

  let response;
  try {
    response = await axios.post(
      `${cfg.baseUrl}${chatPath}`,
      body,
      {
        timeout: opts.timeoutMs || cfg.timeoutMs,
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream'
      }
    );
  } catch (httpErr) {
    llmRateLimiter.release(providerKey);
    throw httpErr;
  }

  const stream = response && response.data;
  if (!stream || typeof stream.on !== 'function') {
    llmRateLimiter.release(providerKey);
    throw new Error('streamingChatJson: provider 未返回 stream');
  }

  // 用户回调一律 try/catch，避免业务回调把流式主路径搞垮。
  const safeCall = (fn, ...args) => {
    if (typeof fn !== 'function') return;
    try { fn(...args); } catch (cbErr) {
      logger.warn('streamingChatJson 回调抛错（忽略）', { error: cbErr && cbErr.message });
    }
  };

  let firstTokenFired = false;
  let lastKeysFingerprint = '';
  let pendingFrame = '';
  let contentBuffer = '';

  const handleSseLine = (line) => {
    if (!line) return;
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload) return;
    if (payload === '[DONE]') return;

    let evt;
    try { evt = JSON.parse(payload); } catch (_e) { return; }
    const delta = evt && evt.choices && evt.choices[0] && evt.choices[0].delta;
    if (!delta) return;
    const piece = typeof delta.content === 'string' ? delta.content : '';
    if (!piece) return;

    if (!firstTokenFired) {
      firstTokenFired = true;
      const firstTokenMs = Date.now() - startedAt;
      try {
        const metrics = require('../middleware/metrics');
        if (metrics && metrics.llmFirstTokenDuration && metrics.llmFirstTokenDuration.labels) {
          metrics.llmFirstTokenDuration
            .labels(providerKey, cfg.model, operation)
            .observe(firstTokenMs / 1000);
        }
      } catch (_e) { /* metrics 不可用就忽略 */ }
      safeCall(onFirstToken, firstTokenMs);
    }

    contentBuffer += piece;
    const partial = extractPartialOcrFields(contentBuffer);
    if (partial) {
      const fingerprint = Object.keys(partial).sort().join('|');
      if (fingerprint !== lastKeysFingerprint) {
        lastKeysFingerprint = fingerprint;
        safeCall(onPartial, partial);
      }
    }
  };

  try {
    await new Promise((resolve, reject) => {
      stream.on('data', (chunk) => {
        const text = pendingFrame + chunk.toString('utf8');
        // SSE frames are separated by \n\n. Last element may be partial → 留到下个 chunk。
        const frames = text.split('\n\n');
        pendingFrame = frames.pop() || '';
        for (const frame of frames) {
          if (!frame) continue;
          for (const line of frame.split('\n')) {
            if (line) handleSseLine(line);
          }
        }
      });
      stream.on('end', () => resolve());
      stream.on('error', (err) => reject(err));
    });

    // 最后一个 pending（流结束但没有终结 \n\n 的情况）
    if (pendingFrame.trim()) {
      for (const line of pendingFrame.split('\n')) {
        if (line) handleSseLine(line);
      }
    }
  } finally {
    llmRateLimiter.release(providerKey);
  }

  // 终态：合并 buffer → JSON.parse → schema validate
  const cleaned = cleanJsonContent(contentBuffer);
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (_e) {
    throw new LlmSchemaError('streamingChatJson_unparseable', {
      provider: providerKey,
      promptHash,
      bufferLength: contentBuffer.length
    });
  }
  const valid = schema.safeParse(parsed);
  if (!valid.success) {
    throw new LlmSchemaError('streamingChatJson_schema_invalid', {
      provider: providerKey,
      promptHash,
      issues: valid.error.issues
    });
  }
  return valid.data;
};

module.exports = {
  chatJson,
  // Plan §Phase 1.4：流式调用 + 首 token 指标 + onPartial / onFirstToken 回调
  streamingChatJson,
  LlmSchemaError,
  // exposed for unit tests
  __internals: {
    callOnce,
    computePromptHash,
    cleanJsonContent,
    extractPartialOcrFields
  }
};
