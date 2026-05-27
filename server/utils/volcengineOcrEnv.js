const readPositiveIntEnv = (name, fallback) => {
  const value = parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const trim = (value) => `${value || ''}`.trim();

const getVolcengineOcrConfig = () => ({
  accessKeyId: trim(process.env.VOLCENGINE_AK || process.env.VOLC_ACCESSKEY),
  secretKey: trim(process.env.VOLCENGINE_SK || process.env.VOLC_SECRETKEY),
  sessionToken: trim(process.env.VOLCENGINE_SESSION_TOKEN || process.env.VOLC_SESSION_TOKEN),
  endpoint: trim(process.env.VOLCENGINE_OCR_ENDPOINT) || 'https://visual.volcengineapi.com',
  region: trim(process.env.VOLCENGINE_OCR_REGION) || 'cn-north-1',
  serviceName: trim(process.env.VOLCENGINE_OCR_SERVICE) || 'cv',
  action: trim(process.env.VOLCENGINE_OCR_ACTION) || 'OCRNormal',
  version: trim(process.env.VOLCENGINE_OCR_VERSION) || '2020-08-26',
  timeoutMs: readPositiveIntEnv('VOLCENGINE_OCR_TIMEOUT_MS', 30000),
  minTextChars: readPositiveIntEnv('VOLCENGINE_OCR_MIN_TEXT_CHARS', 8)
});

const hasVolcengineOcrCredential = () => {
  const cfg = getVolcengineOcrConfig();
  return Boolean(cfg.accessKeyId && cfg.secretKey);
};

module.exports = {
  getVolcengineOcrConfig,
  hasVolcengineOcrCredential
};
