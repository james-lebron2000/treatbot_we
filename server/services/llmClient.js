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
 * MiniMax 的官方文档路径是 `/text/chatcompletion_v2`，body 与 OpenAI 兼容。
 */
const PROVIDER_REGISTRY = {
  // MiniMax 是当前主推 provider（替换原 Kimi）；coding plan 凭证从 MINIMAX_API_KEY 取。
  minimax: () => ({
    apiKey: process.env.MINIMAX_API_KEY || '',
    baseUrl: (process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1').replace(/\/+$/, ''),
    model: process.env.MINIMAX_MODEL || 'MiniMax-Text-01',
    timeoutMs: parseInt(process.env.MINIMAX_TIMEOUT_MS || '45000', 10),
    chatCompletionPath: process.env.MINIMAX_CHAT_PATH || '/text/chatcompletion_v2'
  }),
  // Kimi 保留为可选 fallback；MINIMAX 不可用时可以启用 KIMI_API_KEY 顶上去。
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
  // Doubao / 火山方舟 Ark（OpenAI 兼容协议）。
  // 视觉默认模型：doubao-seed-1.6-vision；body shape 与 OpenAI/MiniMax 完全一致。
  doubao: () => ({
    apiKey: process.env.ARK_API_KEY || '',
    baseUrl: (process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, ''),
    // Ark 必须用带版本后缀的具体模型 ID（短名 doubao-seed-1.6-vision 会 404）。
    model: process.env.ARK_VISION_MODEL || 'doubao-seed-1-6-vision-250815',
    timeoutMs: parseInt(process.env.ARK_TIMEOUT_MS || '180000', 10),
    chatCompletionPath: '/chat/completions'
  })
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
    model: opts.model || cfg.model,
    temperature: typeof opts.temperature === 'number' ? opts.temperature : 1,
    messages,
    response_format: { type: 'json_object' }
  };

  // 大多数 provider 走 OpenAI 兼容的 `/chat/completions`；MiniMax 走 `/text/chatcompletion_v2`。
  // 二者 body shape 都是 OpenAI 风格（messages/model/temperature），只是 path 不同。
  const chatPath = cfg.chatCompletionPath || '/chat/completions';
  const response = await axios.post(
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
 * @param {string} provider 'minimax' | 'kimi' | 'openai'
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

module.exports = {
  chatJson,
  LlmSchemaError,
  // exposed for unit tests
  __internals: {
    callOnce,
    computePromptHash,
    cleanJsonContent
  }
};
