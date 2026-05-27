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

const getDoubaoVisionModel = () => {
  return `${process.env.ARK_VISION_MODEL || process.env.DOUBAO_MODEL || 'doubao-seed-1-6-vision-250815'}`.trim();
};

const getDoubaoTextModel = () => {
  return `${process.env.ARK_TEXT_MODEL || process.env.DOUBAO_TEXT_MODEL || process.env.DOUBAO_MODEL || getDoubaoVisionModel()}`.trim();
};

const hasDoubaoCredential = () => {
  return Boolean(getDoubaoApiKey());
};

module.exports = {
  getDoubaoApiKey,
  getDoubaoBaseUrl,
  getDoubaoVisionModel,
  getDoubaoTextModel,
  hasDoubaoCredential
};
