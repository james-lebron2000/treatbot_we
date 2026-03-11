const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');
const pdfParse = require('pdf-parse');
const tencentcloud = require('tencentcloud-sdk-nodejs');
const logger = require('../utils/logger');

const OCR_PROVIDER = (process.env.OCR_PROVIDER || 'auto').toLowerCase();
const KIMI_API_KEY = process.env.KIMI_API_KEY || '';
const KIMI_BASE_URL = (process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1').replace(/\/+$/, '');
const KIMI_MODEL = process.env.KIMI_MODEL || 'kimi-k2.5';
const KIMI_TIMEOUT_MS = parseInt(process.env.KIMI_TIMEOUT_MS || '45000', 10);

const hasKimiCredential = !!KIMI_API_KEY;
const hasTencentCredential = !!(process.env.OCR_SECRET_ID && process.env.OCR_SECRET_KEY);

const OcrClient = tencentcloud.ocr.v20181119.Client;
const tencentClient = hasTencentCredential
  ? new OcrClient({
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
    })
  : null;

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp'
};
const LOCAL_UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');

const cleanJsonContent = (content) => {
  if (!content) {
    return '';
  }

  const trimmed = String(content).trim();
  if (!trimmed.startsWith('```')) {
    return trimmed;
  }

  return trimmed
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
};

const parseJsonSafe = (content) => {
  const cleaned = cleanJsonContent(content);
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    return null;
  }
};

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
  const response = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 15000
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
  let score = 0.55;
  if (entities.diagnosis) {
    score += 0.2;
  }
  if (entities.stage) {
    score += 0.08;
  }
  if (entities.geneMutation) {
    score += 0.1;
  }
  if (entities.treatment) {
    score += 0.07;
  }
  return Math.min(0.98, Number(score.toFixed(2)));
};

const extractTextFromPdf = async (sourceUrl) => {
  const response = await axios.get(sourceUrl, {
    responseType: 'arraybuffer',
    timeout: 30000
  });
  const parsed = await pdfParse(Buffer.from(response.data));
  return (parsed.text || '').trim();
};

/**
 * 结构化医疗实体抽取（规则兜底）
 */
const extractMedicalEntities = (text) => {
  const entities = {
    diagnosis: null,
    stage: null,
    geneMutation: null,
    treatment: null
  };

  if (!text) {
    return entities;
  }

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

  const stageMatch = text.match(/((?:[IVX]+|[0-4]|第[一二三四])期[A-Da-d]?)\b/);
  if (stageMatch) {
    entities.stage = stageMatch[1];
  }

  const geneMatch = text.match(/(EGFR[^\n，,。；;]{0,20}|ALK[^\n，,。；;]{0,20}|ROS1[^\n，,。；;]{0,20}|KRAS[^\n，,。；;]{0,20}|BRAF[^\n，,。；;]{0,20})/i);
  if (geneMatch) {
    entities.geneMutation = geneMatch[1].trim();
  }

  const treatmentMatch = text.match(/(化疗[^\n，,。；;]{0,20}|靶向治疗[^\n，,。；;]{0,20}|免疫治疗[^\n，,。；;]{0,20}|放疗[^\n，,。；;]{0,20})/);
  if (treatmentMatch) {
    entities.treatment = treatmentMatch[1].trim();
  }

  return entities;
};

const requestKimi = async (imageRef) => {
  const messages = [
    {
      role: 'system',
      content: '你是医疗病历OCR与信息抽取助手。必须返回JSON对象，不要输出其他文本。'
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: [
            '请从图片中识别病历文本并提取字段，返回 JSON：',
            '{ "rawText": "", "diagnosis": null, "stage": null, "geneMutation": null, "treatment": null, "ecog": null, "confidence": 0.0 }',
            '要求：',
            '1) 所有字段不存在则填 null',
            '2) confidence 在 0~1',
            '3) rawText 保留核心原文，不超过 2000 字符'
          ].join('\n')
        },
        {
          type: 'image_url',
          image_url: { url: imageRef }
        }
      ]
    }
  ];

  const response = await axios.post(
    `${KIMI_BASE_URL}/chat/completions`,
    {
      model: KIMI_MODEL,
      temperature: 1,
      messages,
      response_format: { type: 'json_object' }
    },
    {
      timeout: KIMI_TIMEOUT_MS,
      headers: {
        Authorization: `Bearer ${KIMI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const content = response?.data?.choices?.[0]?.message?.content || '';
  const parsed = parseJsonSafe(content);
  if (!parsed) {
    throw new Error('Kimi 返回内容无法解析为 JSON');
  }

  const entities = {
    diagnosis: parsed.diagnosis || null,
    stage: parsed.stage || null,
    geneMutation: parsed.geneMutation || null,
    treatment: parsed.treatment || null
  };

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

const recognizeByKimi = async ({ imageUrl, fileKey, mimeType }) => {
  if (!hasKimiCredential) {
    throw new Error('Kimi API Key 未配置');
  }

  if (isPrivateOrIpUrl(imageUrl)) {
    const dataUrl = await resolveImageDataUrl({ imageUrl, fileKey, mimeType });
    return requestKimi(dataUrl);
  }

  try {
    return await requestKimi(imageUrl);
  } catch (firstError) {
    logger.warn('Kimi URL 模式失败，尝试 Base64 回退', { error: firstError.message });
    const dataUrl = await resolveImageDataUrl({ imageUrl, fileKey, mimeType });
    return requestKimi(dataUrl);
  }
};

const recognizeByTencent = async (imageUrl) => {
  if (!tencentClient) {
    throw new Error('Tencent OCR 凭证未配置');
  }

  const params = {
    ImageUrl: imageUrl,
    EnablePdf: false,
    EnableWordPolygon: false
  };

  const result = await tencentClient.GeneralBasicOCR(params);
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

const recognizeByRule = async ({ imageUrl, fileKey, mimeType }) => {
  let text = '';
  try {
    await resolveImageDataUrl({ imageUrl, fileKey, mimeType });
  } catch (error) {
    logger.warn('规则OCR读取图片失败，继续返回空文本', { error: error.message });
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

const recognizeGeneral = async ({ imageUrl, fileKey, mimeType }) => {
  const providerPreference = OCR_PROVIDER;
  const attemptedProviders = new Set();

  try {
    if (providerPreference === 'kimi' || (providerPreference === 'auto' && hasKimiCredential)) {
      attemptedProviders.add('kimi');
      return await recognizeByKimi({ imageUrl, fileKey, mimeType });
    }

    if (providerPreference === 'tencent' || (providerPreference === 'auto' && hasTencentCredential)) {
      attemptedProviders.add('tencent');
      return await recognizeByTencent(imageUrl);
    }

    return recognizeByRule({ imageUrl, fileKey, mimeType });
  } catch (error) {
    logger.warn('首选OCR提供方失败，进入回退路径', {
      provider: providerPreference,
      error: error.message
    });

    if (hasKimiCredential && providerPreference !== 'kimi' && !attemptedProviders.has('kimi')) {
      try {
        return await recognizeByKimi({ imageUrl, fileKey, mimeType });
      } catch (e) {
        logger.warn('Kimi 回退失败', { error: e.message });
      }
    }

    if (hasTencentCredential && providerPreference !== 'tencent' && !attemptedProviders.has('tencent')) {
      try {
        return await recognizeByTencent(imageUrl);
      } catch (e) {
        logger.warn('Tencent 回退失败', { error: e.message });
      }
    }

    return recognizeByRule({ imageUrl, fileKey, mimeType });
  }
};

const recognizeMedical = async (imageUrl) => {
  return recognizeGeneral(imageUrl);
};

/**
 * 完整的 OCR 处理流程
 */
const processMedicalImage = async (imageUrl) => {
  try {
    const source = typeof imageUrl === 'string'
      ? { sourceUrl: imageUrl }
      : (imageUrl || {});
    const sourceUrl = source.sourceUrl || source.imageUrl || '';

    if (!sourceUrl) {
      throw new Error('缺少可识别的文件地址');
    }

    if (isPdfSource({
      sourceUrl,
      mimeType: source.mimeType,
      fileKey: source.fileKey
    })) {
      let text = '';
      try {
        text = await extractTextFromPdf(sourceUrl);
      } catch (pdfError) {
        if (source.fileKey) {
          const localPdfPath = getLocalFilePath(source.fileKey);
          try {
            const parsed = await pdfParse(await fs.readFile(localPdfPath));
            text = (parsed.text || '').trim();
          } catch (localPdfError) {
            logger.warn('PDF 本地文本解析失败，使用空文本回退', { error: localPdfError.message });
          }
        } else {
          logger.warn('PDF 文本解析失败，使用空文本回退', { error: pdfError.message });
        }
      }
      const entities = extractMedicalEntities(text);
      return {
        success: true,
        text,
        entities,
        confidence: estimateConfidence(entities),
        detections: []
      };
    }

    const result = await recognizeGeneral({
      imageUrl: sourceUrl,
      fileKey: source.fileKey,
      mimeType: source.mimeType
    });
    return {
      success: true,
      text: result.text,
      entities: result.entities,
      confidence: result.confidence,
      detections: result.detections
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
  processMedicalImage
};
