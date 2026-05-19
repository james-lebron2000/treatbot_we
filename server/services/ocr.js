const axios = require('axios');
const fs = require('fs/promises');
const FormData = require('form-data');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const pdfParse = require('pdf-parse');
const tencentcloud = require('tencentcloud-sdk-nodejs');
const logger = require('../utils/logger');
// Q3-红线 §A.1：所有 LLM 调用走 llmClient（schema 校验 + 重试），原文先经 piiScrubber 脱敏。
const { scrubForLlm, restoreFromLlm } = require('../utils/piiScrubber');
const { chatJson } = require('./llmClient');
const { OcrExtractionSchema } = require('./llmSchemas');
// Plan §Phase 2.4：拉图加速。CDN host 改写无配置时是 identity。
const { wrapPresignedWithCdn } = require('./oss');
// Q3-红线 §B.1：所有 LLM prompt 走版本化 registry，禁止散落硬编码字符串。
const { getPrompt } = require('./promptRegistry');
// Q3-红线 §A.3.2：LLM 调用可观测性（计时 / token / 错误分类）。
// 软依赖：模块缺失（CI 裁剪）时退化为透传，不影响业务。
let _llmObs = null;
try {
  _llmObs = require('./llmObservability');
} catch (e) {
  _llmObs = null;
}
const instrumentLlmCall = (_llmObs && _llmObs.instrumentLlmCall)
  ? _llmObs.instrumentLlmCall
  : async (_ctx, fn) => fn();
const recordLlmFallback = (_llmObs && _llmObs.recordFallback)
  ? _llmObs.recordFallback
  : () => {};
const classifyLlmError = (_llmObs && _llmObs.classifyLlmError)
  ? _llmObs.classifyLlmError
  : () => 'other';

// PRD-2026Q4 T0-7 followup：所有 OCR 相关 env / 凭证 / provider 选择都走 per-call
// getter，禁止 init-time 捕获——这是 OCR_PROVIDER=kimi 残留生产事故的同 class
// of bug。只有 base URL / 默认模型名等"运维一次设好就不再改"的常量才直接 const。
const ocrConfig = require('../utils/ocrConfig');

const getOcrProvider = () => (process.env.OCR_PROVIDER || 'auto').toLowerCase();

// Kimi 凭证 / 模型名都 per-call 重读
const getKimiApiKey = () => process.env.KIMI_API_KEY || '';
const KIMI_BASE_URL = (process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1').replace(/\/+$/, '');
const getKimiModel = () => process.env.KIMI_MODEL || 'kimi-k2.5';
const getKimiVisionModel = () => process.env.KIMI_VISION_MODEL || 'moonshot-v1-128k-vision-preview';
const _KIMI_TIMEOUT_MS = parseInt(process.env.KIMI_TIMEOUT_MS || '45000', 10);

// 凭证 boolean → ocrConfig 集中导出的 per-call helper。变量名保留以减少调用点 diff。
const hasKimiCredential = () => ocrConfig.hasKimiCredential();

// Doubao / 火山方舟 Ark（OpenAI 兼容；生产 OCR 推荐主路径）
// llmClient.js 直接读 process.env.ARK_API_KEY；这里仅保留 getter 给将来需要在
// 本文件直接发起 ARK HTTP 调用时使用，命名上保持与 getKimiApiKey 一致。
// eslint-disable-next-line no-unused-vars
const _getArkApiKey = () => process.env.ARK_API_KEY || '';
// llmClient.js 自己从 process.env.ARK_BASE_URL 读，这里只保留供日志/调试参考。
const _ARK_BASE_URL = (process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '');
// Ark 必须用带版本日期后缀的具体模型 ID（短名 doubao-seed-1.6-vision 会 404）。
const getArkVisionModel = () => process.env.ARK_VISION_MODEL || 'doubao-seed-1-6-vision-250815';
// 大型扫描 PDF + 多页 vision 调用需要 90s+，timeout 默认 180s
const _ARK_TIMEOUT_MS = parseInt(process.env.ARK_TIMEOUT_MS || '180000', 10);
const readPositiveIntEnv = (name, fallback) => {
  const value = parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
// Wave 2 §F6：PDF 文本路径首跳按文本长度分档。
// 短文本仍 30s 快速失败转 vision；长文本 PDF 的结构化本身更慢，给到 60-90s，避免过早
// 切到拆页 vision 导致整体更慢。
const getPdfFirstHopTimeoutMs = (text = '') => {
  const length = `${text || ''}`.length;
  if (length >= 6000) {
    return readPositiveIntEnv('OCR_PDF_FIRSTHOP_LONG_TIMEOUT_MS', 90000);
  }
  if (length >= 2500) {
    return readPositiveIntEnv('OCR_PDF_FIRSTHOP_MEDIUM_TIMEOUT_MS', 60000);
  }
  return readPositiveIntEnv('OCR_PDF_FIRSTHOP_TIMEOUT_MS', 30000);
};
const hasDoubaoCredential = () => ocrConfig.hasDoubaoCredential();
const hasDoubaoVisionCredential = () => ocrConfig.hasDoubaoCredential();

const hasTencentCredential = () => ocrConfig.hasTencentCredential();

const OCR_PDF_VISION_MAX_PAGES = Math.max(1, Math.min(5, parseInt(process.env.OCR_PDF_VISION_MAX_PAGES || '3', 10)));
const OCR_PDF_VISION_DPI = Math.max(96, Math.min(200, parseInt(process.env.OCR_PDF_VISION_DPI || '150', 10)));
const OCR_PDF_RENDER_TIMEOUT_MS = parseInt(process.env.OCR_PDF_RENDER_TIMEOUT_MS || '25000', 10);

const OcrClient = tencentcloud.ocr.v20181119.Client;
// Tencent SDK 客户端：不在模块顶层缓存（init 时凭证可能还没注入）。
// 改为 lazy singleton：第一次有凭证调用时构造一次。后续凭证变化（旋转密钥）
// 需要重启进程——属于运维有意识的动作，不在常态 hot-reload 路径上。
let _tencentClient = null;
let _tencentClientCredentialKey = '';
const getTencentClient = () => {
  if (!hasTencentCredential()) return null;
  // 用凭证哈希做 cache-key，凭证轮换时自动重建。
  const credKey = `${process.env.OCR_SECRET_ID}|${process.env.OCR_REGION || 'ap-shanghai'}`;
  if (_tencentClient && _tencentClientCredentialKey === credKey) {
    return _tencentClient;
  }
  _tencentClient = new OcrClient({
    credential: {
      secretId: process.env.OCR_SECRET_ID,
      secretKey: process.env.OCR_SECRET_KEY
    },
    region: process.env.OCR_REGION || 'ap-shanghai',
    profile: {
      signMethod: 'TC3-HMAC-SHA256',
      httpProfile: {
        reqMethod: 'POST',
        reqTimeout: 30
      }
    }
  });
  _tencentClientCredentialKey = credKey;
  return _tencentClient;
};

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp'
};
const LOCAL_UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');

// Q3-红线 §A.1.2：原 cleanJsonContent / parseJsonSafe 已迁移至 services/llmClient.js，
// 所有 LLM JSON 解析均经 chatJson → cleanJsonContent → JSON.parse → zod.safeParse 完成。

const getImageMimeType = (imageUrl, contentType = '') => {
  if (contentType && contentType.includes('/')) {
    return contentType.split(';')[0].trim();
  }
  const ext = path.extname((imageUrl || '').split('?')[0]).toLowerCase();
  return MIME_BY_EXT[ext] || 'image/jpeg';
};

const isPdfSource = ({ sourceUrl, mimeType, fileKey }) => {
  const mime = (mimeType || '').toLowerCase();
  if (mime.includes('pdf')) {
    return true;
  }

  const candidates = [sourceUrl, fileKey].filter(Boolean);
  return candidates.some((candidate) => {
    const ext = path.extname(`${candidate}`.split('?')[0]).toLowerCase();
    return ext === '.pdf';
  });
};

const isPrivateOrIpUrl = (imageUrl) => {
  try {
    const parsed = new URL(imageUrl);
    const host = parsed.hostname || '';
    if (host === 'localhost' || host === '127.0.0.1') {
      return true;
    }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
};

// SSRF 防护：仅允许 http(s) + 非内网 + 命中 host 白名单的 URL。
// 白名单通过 OCR_IMAGE_HOST_ALLOWLIST（逗号分隔的 host 后缀）配置，默认放行腾讯云 COS。
const DEFAULT_IMAGE_HOST_ALLOWLIST = ['.myqcloud.com'];
const getImageHostAllowlist = () => {
  const raw = process.env.OCR_IMAGE_HOST_ALLOWLIST;
  if (!raw) return DEFAULT_IMAGE_HOST_ALLOWLIST;
  return raw.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
};

const assertSafeImageUrl = (imageUrl) => {
  let parsed;
  try {
    parsed = new URL(imageUrl);
  } catch (error) {
    throw new Error('invalid_url');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('protocol_not_allowed');
  }
  if (isPrivateOrIpUrl(imageUrl)) {
    throw new Error('blocked_private_host');
  }
  const host = (parsed.hostname || '').toLowerCase();
  const allowlist = getImageHostAllowlist();
  const passed = allowlist.some((suffix) => host === suffix.replace(/^\./, '') || host.endsWith(suffix));
  if (!passed) {
    throw new Error('host_not_allowed');
  }
};

const normalizeLocalKey = (fileKey = '') => `${fileKey}`.replace(/^\/+/, '').replace(/^uploads\//, '');

const getLocalFilePath = (fileKey = '') => {
  const normalized = normalizeLocalKey(fileKey);
  if (!normalized) {
    return '';
  }
  return path.join(LOCAL_UPLOAD_ROOT, normalized);
};

const readLocalFileAsDataUrl = async (fileKey, mimeType = '') => {
  const fullPath = getLocalFilePath(fileKey);
  if (!fullPath) {
    throw new Error('缺少本地文件路径');
  }

  const buffer = await fs.readFile(fullPath);
  const extMimeType = MIME_BY_EXT[path.extname(fullPath).toLowerCase()] || 'image/jpeg';
  const resolvedMimeType = (mimeType || '').split(';')[0].trim() || extMimeType;
  return `data:${resolvedMimeType};base64,${buffer.toString('base64')}`;
};

const fetchImageAsDataUrl = async (imageUrl) => {
  assertSafeImageUrl(imageUrl);
  const response = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 5000,
    maxContentLength: 15 * 1024 * 1024,
    maxBodyLength: 15 * 1024 * 1024,
    maxRedirects: 0
  });
  const mimeType = getImageMimeType(imageUrl, response.headers['content-type']);
  const base64 = Buffer.from(response.data).toString('base64');
  return `data:${mimeType};base64,${base64}`;
};

const resolveImageDataUrl = async ({ imageUrl, fileKey, mimeType }) => {
  const errors = [];

  if (imageUrl) {
    try {
      return await fetchImageAsDataUrl(imageUrl);
    } catch (error) {
      errors.push(`url:${error.message}`);
    }
  }

  if (fileKey) {
    try {
      return await readLocalFileAsDataUrl(fileKey, mimeType);
    } catch (error) {
      errors.push(`file:${error.message}`);
    }
  }

  throw new Error(`无法读取图片内容 (${errors.join(', ') || 'no-source'})`);
};

const estimateConfidence = (entities) => {
  let score = 0.45;
  if (entities.diagnosis) score += 0.18;
  if (entities.stage) score += 0.06;
  if (entities.geneMutation) score += 0.08;
  if (entities.treatment) score += 0.05;
  if (entities.ecog != null) score += 0.03;
  if (entities.pdl1) score += 0.03;
  if (entities.treatmentLine != null) score += 0.03;
  // Extended entities (Phase 0.3)
  if (entities.age != null) score += 0.02;
  if (entities.comorbidities && entities.comorbidities.length > 0) score += 0.02;
  if (entities.priorTherapies && entities.priorTherapies.length > 0) score += 0.03;
  if (entities.labValues && Object.keys(entities.labValues).length > 0) score += 0.04;
  if (entities.bloodCounts && Object.keys(entities.bloodCounts).length > 0) score += 0.03;
  return Math.min(0.98, Number(score.toFixed(2)));
};

const _extractTextFromPdf = async (sourceUrl) => {
  const response = await axios.get(sourceUrl, {
    responseType: 'arraybuffer',
    timeout: 30000
  });
  const parsed = await pdfParse(Buffer.from(response.data));
  return (parsed.text || '').trim();
};

/**
 * 读取 PDF 的原始字节（支持 URL 和本地文件）
 */
const readPdfBuffer = async ({ sourceUrl, fileKey }) => {
  // 优先尝试本地文件（更快，无网络依赖）
  if (fileKey) {
    const localPath = getLocalFilePath(fileKey);
    if (localPath) {
      try {
        return await fs.readFile(localPath);
      } catch (e) {
        logger.warn('PDF 本地文件读取失败，尝试 URL', { fileKey, error: e.message });
      }
    }
  }
  if (sourceUrl) {
    const resp = await axios.get(sourceUrl, { responseType: 'arraybuffer', timeout: 30000 });
    return Buffer.from(resp.data);
  }
  throw new Error('无法读取 PDF 内容：缺少 fileKey 和 sourceUrl');
};

const execFileAsync = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
  execFile(cmd, args, opts, (error, stdout, stderr) => {
    if (error) {
      error.stderr = stderr;
      return reject(error);
    }
    resolve({ stdout, stderr });
  });
});

const sortPdfPageImages = (files = []) => files
  .filter((name) => /^page-\d+\.png$/i.test(name))
  .sort((a, b) => {
    const ai = Number((a.match(/page-(\d+)\.png/i) || [])[1] || 0);
    const bi = Number((b.match(/page-(\d+)\.png/i) || [])[1] || 0);
    return ai - bi;
  });

const renderPdfPagesToDataUrls = async ({ sourceUrl, fileKey, maxPages = OCR_PDF_VISION_MAX_PAGES }) => {
  const pdfBuffer = await readPdfBuffer({ sourceUrl, fileKey });
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'treatbot-pdf-vision-'));
  const inputPath = path.join(tmpDir, 'input.pdf');
  const outputPrefix = path.join(tmpDir, 'page');

  try {
    await fs.writeFile(inputPath, pdfBuffer);
    await execFileAsync(
      'pdftoppm',
      [
        '-png',
        '-r', String(OCR_PDF_VISION_DPI),
        '-f', '1',
        '-l', String(maxPages),
        inputPath,
        outputPrefix
      ],
      {
        timeout: OCR_PDF_RENDER_TIMEOUT_MS,
        maxBuffer: 2 * 1024 * 1024
      }
    );

    const pageFiles = sortPdfPageImages(await fs.readdir(tmpDir)).slice(0, maxPages);
    if (!pageFiles.length) {
      throw new Error('pdftoppm 未生成页面图片');
    }

    const dataUrls = [];
    for (const file of pageFiles) {
      const buffer = await fs.readFile(path.join(tmpDir, file));
      dataUrls.push(`data:image/png;base64,${buffer.toString('base64')}`);
    }
    return dataUrls;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
};

/**
 * 使用 Kimi File API 处理 PDF（支持扫描件）
 * 流程：上传 PDF → 引用 file_id 发送消息 → 抽取实体 → 删除文件
 */
const requestKimiPdf = async ({ sourceUrl, fileKey }, opts = {}) => {
  if (!hasKimiCredential()) {
    throw new Error('Kimi API Key 未配置');
  }

  const pdfBuffer = await readPdfBuffer({ sourceUrl, fileKey });

  // Step 1: 上传 PDF 文件（purpose: file-extract 用于提取文本内容）
  const form = new FormData();
  const filename = (fileKey ? path.basename(fileKey) : null) || 'medical.pdf';
  form.append('file', pdfBuffer, { filename, contentType: 'application/pdf' });
  form.append('purpose', 'file-extract');

  let fileId = null;
  try {
    const uploadResp = await axios.post(
      `${KIMI_BASE_URL}/files`,
      form,
      {
        timeout: 60000,
        headers: {
          Authorization: `Bearer ${getKimiApiKey()}`,
          ...form.getHeaders()
        }
      }
    );
    fileId = uploadResp.data?.id;
    if (!fileId) {
      throw new Error('Kimi 文件上传返回缺少 file_id');
    }
    logger.info('PDF 上传至 Kimi 成功', { fileId, filename });
  } catch (uploadErr) {
    throw new Error(`Kimi PDF 上传失败: ${uploadErr.message}`);
  }

  // Step 1b: 获取提取的文本内容
  let extractedText = '';
  try {
    const contentResp = await axios.get(
      `${KIMI_BASE_URL}/files/${fileId}/content`,
      {
        timeout: 30000,
        headers: { Authorization: `Bearer ${getKimiApiKey()}` }
      }
    );
    extractedText = (typeof contentResp.data === 'string'
      ? contentResp.data
      : contentResp.data?.content || contentResp.data?.text || ''
    ).trim();
    // Q3-红线 §A.1.1：日志只记长度，不记原文。
    logger.info('Kimi 文件内容提取成功', { fileId, textLength: extractedText.length });
  } catch (contentErr) {
    logger.warn('Kimi 文件内容获取失败，将直接在消息中引用文件', { fileId, error: contentErr.message });
  }

  // Step 2: 发送聊天消息（若提取到文本则直接用文本，否则引用 file_id）
  let result = null;
  // Q3-红线 §A.1.1：在 LLM 调用前做 PII 脱敏；mapping 严格活到本函数返回，从不入日志/库。
  const { scrubbed, mapping } = scrubForLlm(extractedText.substring(0, 4000));
  try {
    // Q3-红线 §B.1：从 prompts/v1/ocr-pdf.md 读取版本化 prompt。
    // 文本路径直接拼到 user 段；扫描件（无文本）则取 system + 仅 prompt 头，把 file_id 与提示一起放进 multipart user。
    const pdfPrompt = getPrompt('ocr-pdf', 'v1', { extractedText: scrubbed || '' });
    // 用于 file_id 视觉模式时只取 prompt 头（去掉 "病历文本：{{...}}" 段尾）
    const promptHeadOnly = getPrompt('ocr-pdf', 'v1', { extractedText: '' })
      .user
      .replace(/\n*病历文本：\s*$/, '')
      .trim();

    let userContent;
    if (scrubbed) {
      userContent = pdfPrompt.user;
    } else {
      // 文本为空（扫描件）：引用 file_id，由 Kimi 视觉处理
      userContent = [
        { type: 'file', file_id: fileId },
        { type: 'text', text: promptHeadOnly }
      ];
    }

    const messages = [
      { role: 'system', content: pdfPrompt.system },
      { role: 'user', content: userContent }
    ];

    // Q3-红线 §A.3.2：LLM 调用埋点（PDF File API 模式）
    const parsed = await instrumentLlmCall(
      { provider: 'kimi', model: getKimiModel(), operation: 'ocr_pdf' },
      () => chatJson('kimi', messages, OcrExtractionSchema, {
        onWait: opts.onProviderWait
      })
    );

    const entities = parseKimiEntities(parsed);

    // Q3-红线 §A.1.1：把 entities 里残留的占位符还原（保险动作；rawText 维持脱敏态）。
    const restoredEntities = restoreFromLlm(entities, mapping);

    const normalizedConfidence = Number(parsed.confidence);
    result = {
      success: true,
      provider: 'kimi_pdf',
      text: (parsed.rawText || '').toString(),
      entities: restoredEntities,
      confidence: Number.isFinite(normalizedConfidence)
        ? Math.max(0, Math.min(1, normalizedConfidence))
        : estimateConfidence(restoredEntities),
      detections: []
    };
  } finally {
    // Step 3: 清理上传的文件
    try {
      await axios.delete(`${KIMI_BASE_URL}/files/${fileId}`, {
        timeout: 10000,
        headers: { Authorization: `Bearer ${getKimiApiKey()}` }
      });
      logger.info('Kimi 临时文件已清理', { fileId });
    } catch (delErr) {
      logger.warn('Kimi 临时文件清理失败（无害）', { fileId, error: delErr.message });
    }
  }

  return result;
};

/**
 * 结构化医疗实体抽取（规则兜底）
 */
const extractMedicalEntities = (text) => {
  const entities = {
    diagnosis: null,
    stage: null,
    geneMutation: null,
    treatment: null,
    ecog: null,
    pdl1: null,
    treatmentLine: null,
    // Extended fields (Phase 0.3)
    age: null,
    weight: null,
    height: null,
    comorbidities: [],
    priorTherapies: [],
    labValues: {},
    bloodCounts: {},
    fertilityStatus: null
  };

  if (!text) {
    return entities;
  }

  // ---- Original 7 fields ----

  const diagnosisPatterns = [
    /诊断[：:]\s*([^\n]+)/,
    /((?:非小细胞|小细胞)?肺癌[^\n，,。；;]*)/,
    /([\u4e00-\u9fa5]{1,12}癌[^\n，,。；;]{0,20})/
  ];

  for (const pattern of diagnosisPatterns) {
    const match = text.match(pattern);
    if (match) {
      entities.diagnosis = (match[1] || '').trim();
      break;
    }
  }

  const stageMatch = text.match(/((?:[IVX]+|[0-4]|第[一二三四])(?:期|A期|B期|C期)[A-Da-d]?)/);
  if (stageMatch) {
    entities.stage = stageMatch[1];
  }

  const geneMatch = text.match(/(EGFR[^\n，,。；;]{0,20}|ALK[^\n，,。；;]{0,20}|ROS1[^\n，,。；;]{0,20}|KRAS[^\n，,。；;]{0,20}|BRAF[^\n，,。；;]{0,20}|HER2[^\n，,。；;]{0,20}|NTRK[^\n，,。；;]{0,20}|RET[^\n，,。；;]{0,20}|MET[^\n，,。；;]{0,20}|FGFR[^\n，,。；;]{0,20}|PIK3CA[^\n，,。；;]{0,20}|MSI[^\n，,。；;]{0,10}|TMB[^\n，,。；;]{0,10})/i);
  if (geneMatch) {
    entities.geneMutation = geneMatch[1].trim();
  }

  const treatmentMatch = text.match(/(化疗[^\n，,。；;]{0,20}|靶向治疗[^\n，,。；;]{0,20}|免疫治疗[^\n，,。；;]{0,20}|放疗[^\n，,。；;]{0,20})/);
  if (treatmentMatch) {
    entities.treatment = treatmentMatch[1].trim();
  }

  const ecogMatch = text.match(/ECOG[^0-4]*([0-4])/i);
  if (ecogMatch) {
    entities.ecog = Number(ecogMatch[1]);
  }

  const pdl1Match = text.match(/PD-?L1[^\d]*(\d{1,3})\s*%/i);
  if (pdl1Match) {
    entities.pdl1 = `TPS ${pdl1Match[1]}%`;
  }
  if (!entities.pdl1) {
    const cpsMatch = text.match(/CPS[^\d]*(\d{1,3})/i);
    if (cpsMatch) {
      entities.pdl1 = `CPS ${cpsMatch[1]}`;
    }
  }

  // 治疗线数推断：匹配"X线...失败/进展/耐药"模式
  const lineMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
  const linePatterns = [
    /([一二三四五六1-6])\s*线[^\n]{0,30}(?:失败|进展|耐药|不耐受)/,
    /([一二三四五六1-6])\s*线[^\n]{0,60}(?:停止治疗|更换方案|疗效评估[^\n]{0,10}PD)/
  ];
  for (const pattern of linePatterns) {
    const lineMatch = text.match(pattern);
    if (lineMatch) {
      const raw = lineMatch[1];
      const num = lineMap[raw] || parseInt(raw, 10);
      if (num >= 1 && num <= 6) {
        entities.treatmentLine = num + 1;
      }
      break;
    }
  }
  if (!entities.treatmentLine) {
    const allLines = text.match(/([一二三四五六1-6])\s*线/g);
    if (allLines && allLines.length > 0) {
      const maxLine = allLines.reduce((max, m) => {
        const raw = m.match(/([一二三四五六1-6])/)[1];
        const num = lineMap[raw] || parseInt(raw, 10);
        return Math.max(max, num);
      }, 0);
      if (maxLine >= 1) {
        entities.treatmentLine = maxLine + 1;
      }
    }
  }

  // ---- Extended fields (Phase 0.3) ----

  // Age
  const ageMatch = text.match(/(?:年龄|Age)[：:\s]*(\d{1,3})\s*(?:岁|years)?/i)
    || text.match(/(\d{2,3})\s*岁/);
  if (ageMatch) {
    const age = Number(ageMatch[1]);
    if (age >= 1 && age <= 120) entities.age = age;
  }

  // Weight (kg)
  const weightMatch = text.match(/(?:体重|Weight)[：:\s]*(\d{2,3}(?:\.\d)?)\s*(?:kg|公斤)/i);
  if (weightMatch) entities.weight = Number(weightMatch[1]);

  // Height (cm)
  const heightMatch = text.match(/(?:身高|Height)[：:\s]*(\d{2,3}(?:\.\d)?)\s*(?:cm|厘米)/i);
  if (heightMatch) entities.height = Number(heightMatch[1]);

  // Comorbidities
  const comorbidityKeywords = [
    { pattern: /脑转移/g, label: '脑转移' },
    { pattern: /软脑膜[^\n]{0,4}转移/g, label: '软脑膜转移' },
    { pattern: /骨转移/g, label: '骨转移' },
    { pattern: /肝转移/g, label: '肝转移' },
    { pattern: /自身免疫[^\n]{0,6}(?:病|疾病)/g, label: '自身免疫病' },
    { pattern: /间质性肺[^\n]{0,4}(?:病|炎)/g, label: '间质性肺病' },
    { pattern: /器官移植/g, label: '器官移植史' },
    { pattern: /乙型?肝炎|HBV/gi, label: '乙型肝炎' },
    { pattern: /丙型?肝炎|HCV/gi, label: '丙型肝炎' },
    { pattern: /HIV|艾滋/gi, label: 'HIV' },
    { pattern: /糖尿病/g, label: '糖尿病' },
    { pattern: /高血压/g, label: '高血压' },
    { pattern: /心功能不全|心力衰竭|心衰/g, label: '心功能不全' },
    { pattern: /肾功能不全|肾衰/g, label: '肾功能不全' },
    { pattern: /活动性感染/g, label: '活动性感染' }
  ];
  for (const { pattern, label } of comorbidityKeywords) {
    if (pattern.test(text)) {
      entities.comorbidities.push(label);
    }
  }

  // Prior therapies (specific regimen names)
  const therapyPatterns = [
    /(?:曲妥珠单抗|赫赛汀|trastuzumab)/gi,
    /(?:帕博利珠单抗|可瑞达|keytruda|pembrolizumab)/gi,
    /(?:纳武利尤单抗|欧狄沃|opdivo|nivolumab)/gi,
    /(?:阿替利珠单抗|泰圣奇|tecentriq|atezolizumab)/gi,
    /(?:信迪利单抗|达伯舒|sintilimab)/gi,
    /(?:卡瑞利珠单抗|艾瑞卡|camrelizumab)/gi,
    /(?:仑伐替尼|乐卫玛|lenvatinib)/gi,
    /(?:索拉非尼|多吉美|sorafenib)/gi,
    /(?:奥希替尼|泰瑞沙|osimertinib)/gi,
    /(?:吉非替尼|易瑞沙|gefitinib)/gi,
    /(?:培美曲塞|力比泰|pemetrexed)/gi,
    /(?:多西他赛|泰索帝|docetaxel)/gi,
    /(?:紫杉醇|taxol|paclitaxel)/gi,
    /FOLFOX/gi,
    /FOLFIRI/gi,
    /XELOX|CapeOX/gi,
    /(?:西妥昔单抗|爱必妥|cetuximab)/gi,
    /(?:贝伐珠单抗|安维汀|bevacizumab)/gi,
    /T-?DM1|(?:恩美曲妥珠单抗|kadcyla)/gi,
    /(?:拉帕替尼|泰立沙|lapatinib)/gi,
    /(?:卡培他滨|希罗达|capecitabine)/gi
  ];
  const foundTherapies = new Set();
  for (const pattern of therapyPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const m of matches) foundTherapies.add(m);
    }
  }
  entities.priorTherapies = [...foundTherapies];

  // Lab values (liver/kidney function)
  const labPatterns = [
    { pattern: /ALT[^\d]{0,10}(\d+(?:\.\d+)?)\s*(?:U\/L|IU\/L)?/i, key: 'ALT', unit: 'U/L' },
    { pattern: /AST[^\d]{0,10}(\d+(?:\.\d+)?)\s*(?:U\/L|IU\/L)?/i, key: 'AST', unit: 'U/L' },
    { pattern: /(?:总胆红素|TBIL)[^\d]{0,10}(\d+(?:\.\d+)?)\s*(?:μmol\/L|umol\/L)?/i, key: 'TBIL', unit: 'μmol/L' },
    { pattern: /(?:肌酐|Cr|CRE)[^\d]{0,10}(\d+(?:\.\d+)?)\s*(?:μmol\/L|umol\/L)?/i, key: 'creatinine', unit: 'μmol/L' },
    { pattern: /(?:肌酐清除率|CrCl|CCr)[^\d]{0,10}(\d+(?:\.\d+)?)\s*(?:ml\/min)?/i, key: 'CrCl', unit: 'ml/min' },
    { pattern: /(?:白蛋白|ALB)[^\d]{0,10}(\d+(?:\.\d+)?)\s*(?:g\/L)?/i, key: 'albumin', unit: 'g/L' },
    { pattern: /LVEF[^\d]{0,10}(\d+(?:\.\d+)?)\s*%?/i, key: 'LVEF', unit: '%' }
  ];
  for (const { pattern, key, unit } of labPatterns) {
    const match = text.match(pattern);
    if (match) {
      entities.labValues[key] = { value: Number(match[1]), unit };
    }
  }

  // Blood counts
  const bloodPatterns = [
    { pattern: /(?:白细胞|WBC)[^\d]{0,10}(\d+(?:\.\d+)?)\s*(?:×?\s*10[⁹^9]?\/L)?/i, key: 'WBC', unit: '×10⁹/L' },
    { pattern: /(?:中性粒细胞|ANC|NEU)[^\d]{0,10}(\d+(?:\.\d+)?)\s*(?:×?\s*10[⁹^9]?\/L)?/i, key: 'ANC', unit: '×10⁹/L' },
    { pattern: /(?:血小板|PLT)[^\d]{0,10}(\d+(?:\.\d+)?)\s*(?:×?\s*10[⁹^9]?\/L)?/i, key: 'PLT', unit: '×10⁹/L' },
    { pattern: /(?:血红蛋白|Hb|HGB)[^\d]{0,10}(\d+(?:\.\d+)?)\s*(?:g\/L)?/i, key: 'Hb', unit: 'g/L' }
  ];
  for (const { pattern, key, unit } of bloodPatterns) {
    const match = text.match(pattern);
    if (match) {
      entities.bloodCounts[key] = { value: Number(match[1]), unit };
    }
  }

  // Fertility status
  const fertilityMatch = text.match(/(?:妊娠试验|HCG|β-?hCG)[^\n]{0,20}(阴性|阳性|negative|positive)/i)
    || text.match(/(绝经|未绝经|围绝经)/);
  if (fertilityMatch) {
    entities.fertilityStatus = fertilityMatch[1] || fertilityMatch[0];
  }

  return entities;
};

/**
 * Parse Kimi LLM response into normalized entities object.
 * Shared by requestKimi (vision) and requestKimiText (text mode).
 */
const asArray = (value) => (Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined && item !== '') : []);
const asObject = (value, fallback = {}) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : fallback
);

const parseKimiEntities = (parsed) => {
  const ecogRaw = parsed.ecog;
  const ecogValue = ecogRaw != null && ecogRaw !== '' ? Number(ecogRaw) : null;
  const lineRaw = parsed.treatmentLine;
  const lineValue = lineRaw != null && lineRaw !== '' ? Number(lineRaw) : null;
  const ageRaw = parsed.age;
  const ageValue = ageRaw != null && ageRaw !== '' ? Number(ageRaw) : null;
  const confidenceRaw = Number(parsed.confidence);

  return {
    diagnosis: parsed.diagnosis || null,
    stage: parsed.stage || null,
    geneMutation: parsed.geneMutation || null,
    treatment: parsed.treatment || null,
    ecog: Number.isFinite(ecogValue) && ecogValue >= 0 && ecogValue <= 4 ? ecogValue : null,
    pdl1: parsed.pdl1 || null,
    treatmentLine: Number.isFinite(lineValue) && lineValue >= 1 && lineValue <= 10 ? lineValue : null,
    // Extended fields (Phase 0.3)
    age: Number.isFinite(ageValue) && ageValue >= 1 && ageValue <= 120 ? ageValue : null,
    weight: Number.isFinite(Number(parsed.weight)) ? Number(parsed.weight) : null,
    height: Number.isFinite(Number(parsed.height)) ? Number(parsed.height) : null,
    comorbidities: asArray(parsed.comorbidities),
    priorTherapies: asArray(parsed.priorTherapies),
    labValues: asObject(parsed.labValues, {}),
    bloodCounts: asObject(parsed.bloodCounts, {}),
    fertilityStatus: parsed.fertilityStatus || null,
    confidence: Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : null,
    // Rich OCR schema fields. These used to be dropped here, so F4 fast path could skip the
    // second LLM and silently shrink 30+ fields down to the legacy subset.
    tnmStage: parsed.tnmStage || null,
    pathologyType: parsed.pathologyType || null,
    sex: parsed.sex || parsed.gender || null,
    hospital: parsed.hospital || null,
    diagnosisDate: parsed.diagnosisDate || null,
    metastasisSites: asArray(parsed.metastasisSites),
    surgicalHistory: asArray(parsed.surgicalHistory),
    timeline: asArray(parsed.timeline),
    molecular: asObject(parsed.molecular, null),
    organoidDrugSensitivity: asObject(parsed.organoidDrugSensitivity, null),
    imaging: asArray(parsed.imaging),
    tumorMarkers: asArray(parsed.tumorMarkers),
    treatmentHistory: asArray(parsed.treatmentHistory)
  };
};

const requestKimi = async (imageRef, opts = {}) => {
  // Q3-红线 §A.1：图片模式没有客户端可见的「原文」，但 LLM 输出仍走 schema 校验。
  // imageRef 是 data URL 或公网 URL，本身不需要脱敏（PII 在像素里，由 provider 处理）。
  // Q3-红线 §B.1：从 prompts/v1/ocr-image.md 读取版本化 prompt。
  const imagePrompt = getPrompt('ocr-image', 'v1', {});
  const messages = [
    { role: 'system', content: imagePrompt.system },
    {
      role: 'user',
      content: [
        { type: 'text', text: imagePrompt.user },
        { type: 'image_url', image_url: { url: imageRef } }
      ]
    }
  ];

  // Q3-红线 §A.3.2：LLM 调用埋点（图片/视觉模式）
  const parsed = await instrumentLlmCall(
    { provider: 'kimi', model: getKimiVisionModel(), operation: 'ocr_image' },
    () => chatJson('kimi', messages, OcrExtractionSchema, {
      model: getKimiVisionModel(),
      onWait: opts.onProviderWait
    })
  );

  const entities = parseKimiEntities(parsed);

  const normalizedConfidence = Number(parsed.confidence);

  return {
    success: true,
    provider: 'kimi',
    text: (parsed.rawText || '').toString(),
    entities,
    confidence: Number.isFinite(normalizedConfidence)
      ? Math.max(0, Math.min(1, normalizedConfidence))
      : estimateConfidence(entities),
    detections: []
  };
};

/**
 * 使用 Kimi 对纯文本（已提取的 PDF 文本）做结构化抽取
 * 不需要图片，直接传文本内容
 */
const requestKimiText = async (text, opts = {}) => {
  if (!hasKimiCredential()) {
    throw new Error('Kimi API Key 未配置');
  }

  // Q3-红线 §A.1.1：在文本进入 LLM 前做 PII 脱敏，mapping 仅在本函数栈内活到 restoreFromLlm。
  const safeInput = (text || '').substring(0, 4000);
  const { scrubbed, mapping } = scrubForLlm(safeInput);

  const messages = [
    {
      role: 'system',
      content: '你是医疗病历信息抽取助手。必须返回JSON对象，不要输出其他文本。文本中的 <PHONE_x>/<NAME_x>/<ID_x> 是占位符，请原样保留在 rawText 中，不要尝试推断真实值。'
    },
    {
      role: 'user',
      content: [
        '请从以下病历文本中提取字段，返回 JSON：',
        '{ "rawText": "", "diagnosis": null, "stage": null, "geneMutation": null, "pdl1": null, "treatment": null, "treatmentLine": null, "ecog": null, "age": null, "weight": null, "height": null, "comorbidities": [], "priorTherapies": [], "labValues": {}, "bloodCounts": {}, "fertilityStatus": null, "confidence": 0.0 }',
        '要求：',
        '1) diagnosis：规范化诊断名称，如"非小细胞肺癌"或"肺腺癌"',
        '2) stage：AJCC分期，如"IVA期"，或临床描述"晚期"/"局部晚期"',
        '3) geneMutation：基因变异，如"EGFR 19del阳性"，多个用分号分隔',
        '4) pdl1：PD-L1表达，如"TPS 80%"或"CPS 15"，不存在填null',
        '5) treatment：既往治疗史，如"铂类化疗2周期"',
        '6) treatmentLine：患者当前需要的治疗线数（整数），如一线治疗失败后填2，不存在填null',
        '7) ecog：0~4整数或null',
        '8) age：患者年龄（整数），不存在填null',
        '9) weight：体重(kg)，不存在填null',
        '10) height：身高(cm)，不存在填null',
        '11) comorbidities：合并症数组，如["脑转移","高血压"]，无则填[]',
        '12) priorTherapies：既往具体治疗方案数组，如["曲妥珠单抗","FOLFOX"]，无则填[]',
        '13) labValues：肝肾功能对象，如{"ALT":{"value":35,"unit":"U/L"}}，无则填{}',
        '14) bloodCounts：血常规对象，如{"WBC":{"value":5.2,"unit":"×10⁹/L"}}，无则填{}',
        '15) fertilityStatus：生育状态，不存在填null',
        '16) confidence：0~1置信度',
        '17) rawText：保留核心原文，不超过2000字符',
        '所有字段不存在则填null/[]/{} 对应类型',
        '',
        '病历文本：',
        scrubbed
      ].join('\n')
    }
  ];

  // Q3-红线 §A.3.2：LLM 调用埋点（纯文本/Markdown 抽取模式）
  const parsed = await instrumentLlmCall(
    { provider: 'kimi', model: getKimiModel(), operation: 'ocr_text' },
    () => chatJson('kimi', messages, OcrExtractionSchema, {
      onWait: opts.onProviderWait
    })
  );

  const entities = parseKimiEntities(parsed);

  const normalizedConfidence = Number(parsed.confidence);

  // 仅对前端展示字段做占位符还原，rawText 保留占位符（避免再次落库时 PII 泄露）。
  // 当前 entities 内字段都已是结构化值（diagnosis/stage 等），不太会包含 <NAME_x>，
  // 但仍走一遍 restoreFromLlm 做 belt-and-suspenders。
  const restoredEntities = restoreFromLlm(entities, mapping);

  return {
    success: true,
    provider: 'kimi_text',
    // text 字段保留 scrubbed 形式，避免病历原文 PII 经响应回写到调用方日志/数据库。
    text: (parsed.rawText || scrubbed).toString(),
    entities: restoredEntities,
    confidence: Number.isFinite(normalizedConfidence)
      ? Math.max(0, Math.min(1, normalizedConfidence))
      : estimateConfidence(restoredEntities),
    detections: []
  };
};

// ============================================================================
// Doubao（火山方舟 Ark）路径：OpenAI 兼容协议，与 Kimi 对齐三件套：
//   - requestDoubao(imageRef)              → 视觉 OCR
//   - requestDoubaoText(text)              → 纯文本结构化抽取
//   - requestDoubaoPdf({ sourceUrl, ... }) → PDF 抽文本后走 requestDoubaoText
//                                            （Ark 暂未稳定提供文件抽取端点，故走 pdf-parse）
// 生产 OCR pipeline 已接入 recognizeGeneral / processMedicalImage。
// ============================================================================

const requestDoubaoImages = async (imageRefs, operation = 'ocr_image', providerName = 'doubao', opts = {}) => {
  if (!hasDoubaoVisionCredential()) {
    throw new Error('Doubao 视觉模型未配置（需 ARK_API_KEY）');
  }
  const refs = Array.isArray(imageRefs) ? imageRefs.filter(Boolean) : [imageRefs].filter(Boolean);
  if (!refs.length) {
    throw new Error('Doubao 视觉识别缺少图片内容');
  }
  // Q3-红线 §B.1：与 Kimi 共享 prompts/v1/ocr-image.md
  const imagePrompt = getPrompt('ocr-image', 'v1', {});
  const userContent = [{ type: 'text', text: imagePrompt.user }];
  refs.forEach((ref) => {
    userContent.push({ type: 'image_url', image_url: { url: ref } });
  });

  const messages = [
    { role: 'system', content: imagePrompt.system },
    {
      role: 'user',
      content: userContent
    }
  ];

  const parsed = await instrumentLlmCall(
    { provider: 'doubao', model: getArkVisionModel(), operation },
    () => chatJson('doubao', messages, OcrExtractionSchema, {
      model: getArkVisionModel(),
      onWait: opts.onProviderWait
    })
  );

  const entities = parseKimiEntities(parsed); // 复用同一套字段抽取
  const normalizedConfidence = Number(parsed.confidence);

  return {
    success: true,
    provider: providerName,
    text: (parsed.rawText || '').toString(),
    entities,
    confidence: Number.isFinite(normalizedConfidence)
      ? Math.max(0, Math.min(1, normalizedConfidence))
      : estimateConfidence(entities),
    detections: []
  };
};

const requestDoubao = async (imageRef, opts = {}) => requestDoubaoImages(imageRef, 'ocr_image', 'doubao', opts);

// Wave 2 §F6：opts.timeoutMs 允许 caller 收紧/放宽这次调用的超时。
// 默认沿用 cfg.timeoutMs（_ARK_TIMEOUT_MS=180s），PDF 首跳由 requestDoubaoPdf 传 30s 进来。
const requestDoubaoText = async (text, opts = {}) => {
  if (!hasDoubaoCredential()) {
    throw new Error('Doubao API Key 未配置（ARK_API_KEY）');
  }

  const safeInput = (text || '').substring(0, 4000);
  const { scrubbed, mapping } = scrubForLlm(safeInput);

  // Prompt 与 requestKimiText 完全对称
  const messages = [
    {
      role: 'system',
      content: '你是医疗病历信息抽取助手。必须返回JSON对象，不要输出其他文本。文本中的 <PHONE_x>/<NAME_x>/<ID_x> 是占位符，请原样保留在 rawText 中，不要尝试推断真实值。'
    },
    {
      role: 'user',
      content: [
        '请从以下病历文本中提取字段，返回 JSON：',
        '{ "rawText": "", "diagnosis": null, "stage": null, "geneMutation": null, "pdl1": null, "treatment": null, "treatmentLine": null, "ecog": null, "age": null, "weight": null, "height": null, "comorbidities": [], "priorTherapies": [], "labValues": {}, "bloodCounts": {}, "fertilityStatus": null, "confidence": 0.0 }',
        '要求：',
        '1) diagnosis：规范化诊断名称，如"非小细胞肺癌"或"肺腺癌"',
        '2) stage：AJCC分期，如"IVA期"，或临床描述"晚期"/"局部晚期"',
        '3) geneMutation：基因变异，如"EGFR 19del阳性"，多个用分号分隔',
        '4) pdl1：PD-L1表达，如"TPS 80%"或"CPS 15"，不存在填null',
        '5) treatment：既往治疗史，如"铂类化疗2周期"',
        '6) treatmentLine：患者当前需要的治疗线数（整数），如一线治疗失败后填2，不存在填null',
        '7) ecog：0~4整数或null',
        '8) age：患者年龄（整数），不存在填null',
        '9) weight：体重(kg)，不存在填null',
        '10) height：身高(cm)，不存在填null',
        '11) comorbidities：合并症数组，如["脑转移","高血压"]，无则填[]',
        '12) priorTherapies：既往具体治疗方案数组，如["曲妥珠单抗","FOLFOX"]，无则填[]',
        '13) labValues：肝肾功能对象，如{"ALT":{"value":35,"unit":"U/L"}}，无则填{}',
        '14) bloodCounts：血常规对象，如{"WBC":{"value":5.2,"unit":"×10⁹/L"}}，无则填{}',
        '15) fertilityStatus：生育状态，不存在填null',
        '16) confidence：0~1置信度',
        '17) rawText：保留核心原文，不超过2000字符',
        '所有字段不存在则填null/[]/{} 对应类型',
        '',
        '病历文本：',
        scrubbed
      ].join('\n')
    }
  ];

  const parsed = await instrumentLlmCall(
    { provider: 'doubao', model: getArkVisionModel(), operation: 'ocr_text' },
    () => chatJson('doubao', messages, OcrExtractionSchema, {
      model: getArkVisionModel(),
      // Wave 2 §F6：透传 caller 给的 timeoutMs；未传时 chatJson 自己回落到 cfg.timeoutMs。
      ...(typeof opts.timeoutMs === 'number' ? { timeoutMs: opts.timeoutMs } : {}),
      onWait: opts.onProviderWait
    })
  );

  const entities = parseKimiEntities(parsed);
  const normalizedConfidence = Number(parsed.confidence);
  const restoredEntities = restoreFromLlm(entities, mapping);

  return {
    success: true,
    provider: 'doubao_text',
    text: (parsed.rawText || scrubbed).toString(),
    entities: restoredEntities,
    confidence: Number.isFinite(normalizedConfidence)
      ? Math.max(0, Math.min(1, normalizedConfidence))
      : estimateConfidence(restoredEntities),
    detections: []
  };
};

/**
 * Doubao PDF 处理：Ark 暂未稳定提供文件抽取端点（不像 Kimi /files purpose=file-extract），
 * 所以这里走「pdf-parse 抽文本 → requestDoubaoText」。
 * 扫描件 PDF 没有文本层时返回空文本 → 调用方应改走 vision 路径（pdftoppm 拆页 → requestDoubao）。
 */
const requestDoubaoPdf = async ({ sourceUrl, fileKey }, opts = {}) => {
  if (!hasDoubaoCredential()) {
    throw new Error('Doubao API Key 未配置（ARK_API_KEY）');
  }

  const pdfBuffer = await readPdfBuffer({ sourceUrl, fileKey });
  let extractedText = '';
  try {
    const parsedPdf = await pdfParse(pdfBuffer);
    extractedText = `${parsedPdf.text || ''}`.trim();
    logger.info('Doubao PDF 文本抽取（pdf-parse）', { textLength: extractedText.length });
  } catch (parseErr) {
    logger.warn('Doubao PDF pdf-parse 失败（可能为扫描件）', { error: parseErr.message });
    extractedText = '';
  }

  if (!extractedText) {
    throw new Error('Doubao PDF 抽空文本（疑似扫描件）：请走 vision 路径（pdftoppm 拆页）');
  }

  // Wave 2 §F6：PDF 首跳按文本长度给 30/60/90s。
  // 失败后让 processMedicalImage 的 catch 切到 vision 路径，而不是固定干等全局 180s。
  const result = await requestDoubaoText(extractedText.substring(0, 4000), {
    timeoutMs: getPdfFirstHopTimeoutMs(extractedText),
    onProviderWait: opts.onProviderWait
  });
  return { ...result, provider: 'doubao_pdf' };
};

const requestDoubaoPdfVision = async ({ sourceUrl, fileKey }, opts = {}) => {
  const dataUrls = await renderPdfPagesToDataUrls({ sourceUrl, fileKey });
  const result = await requestDoubaoImages(dataUrls, 'ocr_pdf', 'doubao_pdf_vision', opts);
  return {
    ...result,
    provider: 'doubao_pdf_vision',
    pageCount: dataUrls.length
  };
};

const recognizeByDoubao = async ({ imageUrl, fileKey, mimeType }, opts = {}) => {
  if (!hasDoubaoVisionCredential()) {
    throw new Error('Doubao 视觉模型未配置（需 ARK_API_KEY）');
  }

  if (!imageUrl || isPrivateOrIpUrl(imageUrl)) {
    const dataUrl = await resolveImageDataUrl({ imageUrl, fileKey, mimeType });
    return requestDoubao(dataUrl, opts);
  }

  // Plan §Phase 2.4：把 *.cos.{region}.myqcloud.com 改写成 CDN 域；
  // COS_CDN_DOMAIN 未配置时 wrapPresignedWithCdn 是 identity。
  const cdnUrl = wrapPresignedWithCdn(imageUrl);
  try {
    return await requestDoubao(cdnUrl, opts);
  } catch (firstError) {
    // 一级回退：CDN 出错回退到原 COS URL（CDN 短期故障不阻塞 OCR 主路径）
    if (cdnUrl !== imageUrl) {
      logger.warn('Doubao CDN URL 失败，回退到原 COS URL', { error: firstError.message });
      try {
        return await requestDoubao(imageUrl, opts);
      } catch (secondError) {
        logger.warn('Doubao 原 URL 模式也失败，再尝试 Base64 回退', { error: secondError.message });
        const dataUrl = await resolveImageDataUrl({ imageUrl, fileKey, mimeType });
        return requestDoubao(dataUrl, opts);
      }
    }
    logger.warn('Doubao URL 模式失败，尝试 Base64 回退', { error: firstError.message });
    const dataUrl = await resolveImageDataUrl({ imageUrl, fileKey, mimeType });
    return requestDoubao(dataUrl, opts);
  }
};

const recognizeByKimi = async ({ imageUrl, fileKey, mimeType }, opts = {}) => {
  if (!hasKimiCredential()) {
    throw new Error('Kimi API Key 未配置');
  }

  if (!imageUrl || isPrivateOrIpUrl(imageUrl)) {
    const dataUrl = await resolveImageDataUrl({ imageUrl, fileKey, mimeType });
    return requestKimi(dataUrl, opts);
  }

  try {
    return await requestKimi(imageUrl, opts);
  } catch (firstError) {
    logger.warn('Kimi URL 模式失败，尝试 Base64 回退', { error: firstError.message });
    const dataUrl = await resolveImageDataUrl({ imageUrl, fileKey, mimeType });
    return requestKimi(dataUrl, opts);
  }
};

const recognizeByTencent = async (imageUrl) => {
  if (!getTencentClient()) {
    throw new Error('Tencent OCR 凭证未配置');
  }

  const params = {
    ImageUrl: imageUrl,
    EnablePdf: false,
    EnableWordPolygon: false
  };

  const result = await getTencentClient().GeneralBasicOCR(params);
  const text = result.TextDetections?.map((item) => item.DetectedText).join('\n') || '';
  const entities = extractMedicalEntities(text);
  return {
    success: true,
    provider: 'tencent',
    text,
    entities,
    confidence: estimateConfidence(entities),
    detections: result.TextDetections || []
  };
};

const recognizeByRule = async ({ imageUrl, fileKey, mimeType: _mimeType }) => {
  let text = '';

  // 尝试从本地文件直接读取文本（对纯文本文件有效，对图片二进制无害，regex 不会命中乱码）
  if (fileKey) {
    try {
      const localPath = getLocalFilePath(fileKey);
      if (localPath) {
        const raw = await fs.readFile(localPath, 'utf-8');
        text = raw;
      }
    } catch (error) {
      logger.warn('规则OCR本地文件读取失败', { fileKey, error: error.message });
    }
  }

  // 若本地读取无内容，尝试从公网 URL 抓取纯文本
  if (!text && imageUrl) {
    try {
      assertSafeImageUrl(imageUrl);
      const response = await axios.get(imageUrl, {
        responseType: 'text',
        timeout: 5000,
        maxContentLength: 15 * 1024 * 1024,
        maxBodyLength: 15 * 1024 * 1024,
        maxRedirects: 0,
        headers: { Accept: 'text/plain, */*' }
      });
      if (typeof response.data === 'string') {
        text = response.data;
      }
    } catch (error) {
      logger.warn('规则OCR URL文本抓取失败', { imageUrl, error: error.message });
    }
  }

  const entities = extractMedicalEntities(text);
  return {
    success: true,
    provider: 'rule',
    text,
    entities,
    confidence: estimateConfidence(entities),
    detections: []
  };
};

const recognizeGeneral = async ({ imageUrl, fileKey, mimeType }, opts = {}) => {
  const providerPreference = getOcrProvider();
  const attemptedProviders = new Set();

  try {
    // 主路径：Doubao/ARK。生产 OCR 唯一视觉 provider，coding-plan key 已弃用。
    if (providerPreference === 'doubao' || (providerPreference === 'auto' && hasDoubaoVisionCredential())) {
      attemptedProviders.add('doubao');
      return await recognizeByDoubao({ imageUrl, fileKey, mimeType }, opts);
    }

    if (providerPreference === 'kimi' || (providerPreference === 'auto' && hasKimiCredential())) {
      attemptedProviders.add('kimi');
      return await recognizeByKimi({ imageUrl, fileKey, mimeType }, opts);
    }

    if (providerPreference === 'tencent' || (providerPreference === 'auto' && hasTencentCredential())) {
      attemptedProviders.add('tencent');
      return await recognizeByTencent(imageUrl);
    }

    return recognizeByRule({ imageUrl, fileKey, mimeType });
  } catch (error) {
    logger.warn('首选OCR提供方失败，进入回退路径', {
      provider: providerPreference,
      error: error.message
    });
    // Q3-红线 §A.3.2：标记 fallback 触发（计入 llm_fallback_triggered_total）
    const fromProvider = [...attemptedProviders][0] || providerPreference || 'unknown';
    const fallbackReason = classifyLlmError(error);

    // 回退顺序：Doubao → Kimi → Tencent → 规则。
    if (hasDoubaoVisionCredential() && providerPreference !== 'doubao' && !attemptedProviders.has('doubao')) {
      try {
        recordLlmFallback(fromProvider, 'doubao', fallbackReason);
        return await recognizeByDoubao({ imageUrl, fileKey, mimeType }, opts);
      } catch (e) {
        logger.warn('Doubao 回退失败', { error: e.message });
      }
    }

    if (hasKimiCredential() && providerPreference !== 'kimi' && !attemptedProviders.has('kimi')) {
      try {
        recordLlmFallback(fromProvider, 'kimi', fallbackReason);
        return await recognizeByKimi({ imageUrl, fileKey, mimeType }, opts);
      } catch (e) {
        logger.warn('Kimi 回退失败', { error: e.message });
      }
    }

    if (hasTencentCredential() && providerPreference !== 'tencent' && !attemptedProviders.has('tencent')) {
      try {
        recordLlmFallback(fromProvider, 'tencent', fallbackReason);
        return await recognizeByTencent(imageUrl);
      } catch (e) {
        logger.warn('Tencent 回退失败', { error: e.message });
      }
    }

    recordLlmFallback(fromProvider, 'rule', fallbackReason);
    return recognizeByRule({ imageUrl, fileKey, mimeType });
  }
};

const recognizeMedical = async (imageUrl) => {
  return recognizeGeneral(imageUrl);
};

/**
 * markitdown 预处理：尝试用 markitdown 将文件转为 Markdown，再交给 Kimi 结构化
 * 对 PDF（文本型）和文档格式效果最好；扫描件/图片可能返回空文本，自动降级
 */
const tryMarkitdownPipeline = async ({ fileKey, sourceUrl, mimeType: _mimeType }, opts = {}) => {
  let markitdownService;
  try {
    markitdownService = require('./markitdown');
  } catch (loadErr) {
    return null;
  }

  let markdown = '';

  // 优先尝试本地文件
  if (fileKey) {
    markdown = await markitdownService.convertFileToMarkdown(fileKey);
  }

  // 本地无结果则尝试从 URL 下载后转换
  if (!markdown && sourceUrl) {
    const ext = path.extname((sourceUrl || '').split('?')[0]).toLowerCase() || '.pdf';
    markdown = await markitdownService.convertUrlToMarkdown(sourceUrl, ext);
  }

  // 文本过短视为无效（扫描件/图片可能只有元数据）
  if (!markdown || markdown.length < 50) {
    return null;
  }

  logger.info('markitdown 产出有效文本，送入 LLM 结构化', {
    fileKey,
    markdownLength: markdown.length
  });

  // 优先用 Doubao/ARK 进行结构化抽取，缺失则回退 Kimi。
  if (hasDoubaoCredential()) {
    try {
      const doubaoResult = await requestDoubaoText(markdown, opts);
      return {
        success: true,
        text: doubaoResult.text || markdown,
        entities: doubaoResult.entities,
        confidence: doubaoResult.confidence,
        detections: [],
        // 修复方案 Track 2.2：返回 provider 让 queue 在解析失败时能在错误信息里写明具体哪一层降级。
        provider: 'markitdown+doubao'
      };
    } catch (doubaoErr) {
      logger.warn('markitdown + Doubao 文本抽取失败，尝试 Kimi 回退', { error: doubaoErr.message });
    }
  }

  // 次选：Kimi 文本抽取（fallback）
  if (hasKimiCredential()) {
    try {
      const kimiResult = await requestKimiText(markdown, opts);
      return {
        success: true,
        text: kimiResult.text || markdown,
        entities: kimiResult.entities,
        confidence: kimiResult.confidence,
        detections: [],
        provider: 'markitdown+kimi'
      };
    } catch (kimiErr) {
      logger.warn('markitdown + Kimi 文本抽取失败，降级到规则', { error: kimiErr.message });
    }
  }

  // 无 LLM 或 LLM 失败：用规则兜底
  const entities = extractMedicalEntities(markdown);
  return {
    success: true,
    text: markdown,
    entities,
    confidence: estimateConfidence(entities),
    detections: [],
    provider: 'markitdown+rule'
  };
};

/**
 * 完整的 OCR 处理流程
 */
const processMedicalImage = async (imageUrl, opts = {}) => {
  try {
    const source = typeof imageUrl === 'string'
      ? { sourceUrl: imageUrl }
      : (imageUrl || {});
    const sourceUrl = source.sourceUrl || source.imageUrl || '';

    if (!sourceUrl && !source.fileKey) {
      throw new Error('缺少可识别的文件地址');
    }

    // 修复方案 Track 2.1：缺所有 OCR 凭证时直接抛 OCR_NOT_CONFIGURED，
    // 不再走 4 层降级让用户白等 30 秒最后落到一句通用 toast。
    // 客户端会展示 errorMsg + 让用户跳手动录入。
    if (!ocrConfig.isOcrEnabled()) {
      const err = new Error('OCR_NOT_CONFIGURED: 该环境暂不支持自动解析，请联系管理员配置 ARK_API_KEY（Doubao，推荐）/ KIMI_API_KEY 或腾讯云 OCR 凭证');
      err.code = 'OCR_NOT_CONFIGURED';
      throw err;
    }

    // 第一优先级：markitdown 预处理（对 PDF 文本型文件效果最佳）
    try {
      const markitdownResult = await tryMarkitdownPipeline({
        fileKey: source.fileKey,
        sourceUrl,
        mimeType: source.mimeType
      }, opts);
      if (markitdownResult) {
        logger.info('markitdown 管线成功，跳过传统 OCR', { provider: markitdownResult.provider || 'markitdown' });
        return markitdownResult;
      }
    } catch (mdErr) {
      logger.warn('markitdown 预处理异常，继续传统管线', { error: mdErr.message });
    }

    // 第二优先级：传统 OCR 管线
    if (isPdfSource({
      sourceUrl,
      mimeType: source.mimeType,
      fileKey: source.fileKey
    })) {
      // 主路径：Doubao。先尝试 PDF 文本层，抽空时立即转扫描件 vision 路径。
      if (hasDoubaoCredential()) {
        try {
          const doubaoPdfResult = await requestDoubaoPdf({
            sourceUrl,
            fileKey: source.fileKey
          }, opts);
          logger.info('PDF 走 Doubao 文本模式完成', { provider: doubaoPdfResult.provider });
          return {
            success: true,
            text: doubaoPdfResult.text,
            entities: doubaoPdfResult.entities,
            confidence: doubaoPdfResult.confidence,
            detections: [],
            provider: doubaoPdfResult.provider || 'doubao_pdf'
          };
        } catch (doubaoTextErr) {
          logger.warn('Doubao PDF 文本路径失败，尝试扫描件 vision 路径', { error: doubaoTextErr.message });
          try {
            const doubaoVisionResult = await requestDoubaoPdfVision({
              sourceUrl,
              fileKey: source.fileKey
            }, opts);
            logger.info('PDF 走 Doubao vision 拆页模式完成', {
              provider: doubaoVisionResult.provider,
              pageCount: doubaoVisionResult.pageCount
            });
            return {
              success: true,
              text: doubaoVisionResult.text,
              entities: doubaoVisionResult.entities,
              confidence: doubaoVisionResult.confidence,
              detections: [],
              provider: doubaoVisionResult.provider || 'doubao_pdf_vision',
              pageCount: doubaoVisionResult.pageCount
            };
          } catch (doubaoVisionErr) {
            logger.warn('Doubao PDF vision 路径失败，尝试 Kimi 回退', { error: doubaoVisionErr.message });
          }
        }
      }

      // 次选：Kimi File API（fallback）
      if (hasKimiCredential()) {
        try {
          const kimiPdfResult = await requestKimiPdf({
            sourceUrl,
            fileKey: source.fileKey
          }, opts);
          logger.info('PDF 走 Kimi File API 模式完成', { provider: kimiPdfResult.provider });
          return {
            success: true,
            text: kimiPdfResult.text,
            entities: kimiPdfResult.entities,
            confidence: kimiPdfResult.confidence,
            detections: [],
            provider: kimiPdfResult.provider || 'kimi_pdf'
          };
        } catch (kimiPdfErr) {
          logger.warn('Kimi File API 处理 PDF 失败，降级到文本解析', { error: kimiPdfErr.message });
        }
      }

      // 降级路径：pdf-parse 提取文本层（仅对非扫描件有效）
      let text = '';
      try {
        const pdfBuf = await readPdfBuffer({ sourceUrl, fileKey: source.fileKey });
        const parsed = await pdfParse(pdfBuf);
        text = (parsed.text || '').trim();
      } catch (pdfError) {
        logger.warn('PDF 文本层解析失败', { error: pdfError.message });
      }

      // 有文本则优先用 Doubao 文本模式结构化
      if (text && hasDoubaoCredential()) {
        try {
          const doubaoResult = await requestDoubaoText(text, opts);
          logger.info('PDF 走 Doubao 文本模式结构化完成');
          return {
            success: true,
            text: doubaoResult.text || text,
            entities: doubaoResult.entities,
            confidence: doubaoResult.confidence,
            detections: [],
            provider: doubaoResult.provider || 'pdf_doubao_text'
          };
        } catch (doubaoTextErr) {
          logger.warn('PDF Doubao 文本模式失败，尝试 Kimi 文本模式回退', { error: doubaoTextErr.message });
        }
      }

      // 次选：Kimi 文本模式（fallback）
      if (text && hasKimiCredential()) {
        try {
          const kimiResult = await requestKimiText(text, opts);
          logger.info('PDF 走 Kimi 文本模式结构化完成');
          return {
            success: true,
            text: kimiResult.text || text,
            entities: kimiResult.entities,
            confidence: kimiResult.confidence,
            detections: [],
            provider: kimiResult.provider || 'pdf_kimi_text'
          };
        } catch (kimiErr) {
          logger.warn('PDF Kimi 文本模式失败，降级到规则抽取', { error: kimiErr.message });
        }
      }

      // 最终兜底：规则抽取（对空文本几乎无效，但不抛错）
      const entities = extractMedicalEntities(text);
      return {
        success: true,
        text,
        entities,
        confidence: estimateConfidence(entities),
        detections: [],
        provider: 'pdf_rule'
      };
    }

    const result = await recognizeGeneral({
      imageUrl: sourceUrl,
      fileKey: source.fileKey,
      mimeType: source.mimeType
    }, opts);
    return {
      success: true,
      text: result.text,
      entities: result.entities,
      confidence: result.confidence,
      detections: result.detections,
      provider: result.provider || 'image'
    };
  } catch (error) {
    logger.error('医疗图片处理失败:', error);
    throw error;
  }
};

module.exports = {
  recognizeGeneral,
  recognizeMedical,
  extractMedicalEntities,
  processMedicalImage,
  // Doubao（火山方舟 Ark；生产 OCR 主路径）
  requestDoubao,
  requestDoubaoText,
  requestDoubaoPdf,
  requestDoubaoPdfVision,
  // Kimi（fallback；Doubao 不可用时启用）
  requestKimi,
  requestKimiText,
  requestKimiPdf,
  // exposed for unit tests
  __testables: {
    isPrivateOrIpUrl,
    assertSafeImageUrl,
    fetchImageAsDataUrl,
    renderPdfPagesToDataUrls,
    parseKimiEntities,
    getPdfFirstHopTimeoutMs
  }
};
