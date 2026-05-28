// Doubao / 火山方舟环境变量兼容层。
//
// 历史生产使用 ARK_*；部分本地/运维环境使用 DOUBAO_*。
// 这里统一做 per-call 读取，避免模块加载时冻结凭证，也避免把火山引擎
// AK/SK 误当成方舟 OpenAI-compatible API key。

const getDoubaoApiKey = () => {
  return `${process.env.ARK_API_KEY || process.env.DOUBAO_API_KEY || ''}`.trim();
};

const getDoubaoBaseUrl = () => {
  return `${process.env.ARK_BASE_URL || process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3'}`
    .trim()
    .replace(/\/+$/, '');
};

const DEFAULT_DOUBAO_VISION_MODEL = 'doubao-seed-1-6-vision-250815';
const DEFAULT_DOUBAO_TEXT_MODEL = 'doubao-seed-2-0-lite-260215';

const getDoubaoVisionModel = () => {
  return `${process.env.ARK_VISION_MODEL || process.env.DOUBAO_MODEL || DEFAULT_DOUBAO_VISION_MODEL}`.trim();
};

const getDoubaoTextModel = () => {
  // DOUBAO_MODEL is kept as a legacy vision alias; text structuring must not
  // silently inherit a slower vision/pro model.
  return `${process.env.ARK_TEXT_MODEL || process.env.DOUBAO_TEXT_MODEL || DEFAULT_DOUBAO_TEXT_MODEL}`.trim();
};

const hasDoubaoCredential = () => {
  return Boolean(getDoubaoApiKey());
};

module.exports = {
  getDoubaoApiKey,
  getDoubaoBaseUrl,
  getDoubaoVisionModel,
  getDoubaoTextModel,
  DEFAULT_DOUBAO_VISION_MODEL,
  DEFAULT_DOUBAO_TEXT_MODEL,
  hasDoubaoCredential
};
