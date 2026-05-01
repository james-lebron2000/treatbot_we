/**
 * LLM 计价工具 — 把 provider/model/usage 换算为 CNY 成本。
 *
 * 调用方：
 *  - server/scripts/benchVisionLlm.js（本轮 Track A 离线 benchmark）
 *  - 后续 Track B：server/services/llmObservability.js 落 prom counter
 *
 * 不接管现有 chatJson / instrumentLlmCall —— 那两处只关心 token 数；
 * 本模块单独负责「token → CNY」这一步，让定价表的更新不会污染业务代码。
 *
 * RATE_TABLE 单位：CNY per 1,000,000 tokens（与各家公开价目页一致）。
 * 缺失某 (provider, model) 条目 → computeCost 返回 rateFound:false，totalCost=null，
 * 由调用方决定 CSV 显示 'N/A' 还是回退到默认 model。
 *
 * rates last verified 2026-05-01
 */

const RATE_TABLE = {
  minimax: {
    // 主力多模态视觉模型（abab6.5s 系列）
    'abab6.5s-chat':                        { inputPerM: 2.16, outputPerM: 8.64,  unit: 'CNY' },
    'abab6.5s':                             { inputPerM: 2.16, outputPerM: 8.64,  unit: 'CNY' },
    // 文本主模型（结构化抽取兜底）
    'MiniMax-Text-01':                      { inputPerM: 1.00, outputPerM: 5.00,  unit: 'CNY' },
    'MiniMax-VL-01':                        { inputPerM: 2.16, outputPerM: 8.64,  unit: 'CNY' },
    // Coding Plan 限定模型（sk-cp- 前缀凭证仅可访问 M2，文本+推理）
    'MiniMax-M2':                           { inputPerM: 1.20, outputPerM: 6.00,  unit: 'CNY' }
  },
  kimi: {
    'moonshot-v1-128k-vision-preview':      { inputPerM: 6.84, outputPerM: 28.80, unit: 'CNY' },
    'moonshot-v1-128k':                     { inputPerM: 4.00, outputPerM: 12.00, unit: 'CNY' },
    'moonshot-v1-32k':                      { inputPerM: 2.40, outputPerM: 7.20,  unit: 'CNY' },
    'kimi-k2.5':                            { inputPerM: 4.00, outputPerM: 12.00, unit: 'CNY' }
  },
  doubao: {
    // 火山方舟（Volcano Engine Ark）OpenAI 兼容
    // 注意：Ark 控制台要求带版本日期后缀的具体模型 ID（短名形如 doubao-seed-1.6-vision 会 404）。
    'doubao-seed-1-6-vision-250815':        { inputPerM: 0.86, outputPerM: 8.28,  unit: 'CNY' },
    'doubao-1-5-vision-pro-32k-250115':     { inputPerM: 0.86, outputPerM: 8.28,  unit: 'CNY' },
    // 短名保留，方便手动覆盖；与上面 250815 同价
    'doubao-seed-1.6-vision':               { inputPerM: 0.86, outputPerM: 8.28,  unit: 'CNY' },
    'doubao-1.5-vision-pro':                { inputPerM: 0.86, outputPerM: 8.28,  unit: 'CNY' },
    'doubao-pro-vision':                    { inputPerM: 0.86, outputPerM: 8.28,  unit: 'CNY' }
  },
  openai: {
    // 仅供本地脚本调试参考，不参与生产 OCR。
    'gpt-4o':                               { inputPerM: 18.00, outputPerM: 72.00, unit: 'CNY' },
    'gpt-4o-mini':                          { inputPerM: 1.08,  outputPerM: 4.32,  unit: 'CNY' }
  }
};

/**
 * 把 token 用量换算为 CNY 成本。
 *
 * @param {string} provider 'minimax' | 'kimi' | 'doubao' | 'openai'
 * @param {string} model    具体模型名（例如 'abab6.5s-chat'）
 * @param {object} usage    { prompt_tokens, completion_tokens, total_tokens? }
 *                          字段缺失时按 0 处理；usage=null/undefined 整体当未知。
 * @returns {{
 *   inputCost: number|null,
 *   outputCost: number|null,
 *   totalCost: number|null,
 *   currency: 'CNY',
 *   rateFound: boolean,
 *   rate?: { inputPerM: number, outputPerM: number }
 * }}
 */
const computeCost = (provider, model, usage) => {
  const fallback = {
    inputCost: null,
    outputCost: null,
    totalCost: null,
    currency: 'CNY',
    rateFound: false
  };

  if (!provider || !model || !usage || typeof usage !== 'object') {
    return fallback;
  }

  const providerTable = RATE_TABLE[String(provider).toLowerCase()];
  if (!providerTable) return fallback;

  const rate = providerTable[model] || null;
  if (!rate) return fallback;

  const promptTokens = Number(usage.prompt_tokens) || 0;
  const completionTokens = Number(usage.completion_tokens) || 0;

  const inputCost = (promptTokens / 1_000_000) * rate.inputPerM;
  const outputCost = (completionTokens / 1_000_000) * rate.outputPerM;
  const totalCost = inputCost + outputCost;

  return {
    inputCost: Number(inputCost.toFixed(6)),
    outputCost: Number(outputCost.toFixed(6)),
    totalCost: Number(totalCost.toFixed(6)),
    currency: 'CNY',
    rateFound: true,
    rate: { inputPerM: rate.inputPerM, outputPerM: rate.outputPerM }
  };
};

/**
 * 估算单次调用上限成本（dry-run 用）—— 用「max input + max output」概念给出保守上限，
 * 避免实跑前低估烧钱。
 */
const estimateUpperBound = (provider, model, { maxPromptTokens = 4000, maxCompletionTokens = 1500 } = {}) => {
  return computeCost(provider, model, {
    prompt_tokens: maxPromptTokens,
    completion_tokens: maxCompletionTokens
  });
};

module.exports = {
  RATE_TABLE,
  computeCost,
  estimateUpperBound
};
