const axios = require('axios');
const fs = require('fs/promises');
const FormData = require('form-data');
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

const extractTextFromPdf = async (sourceUrl) => {
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

/**
 * 使用 Kimi File API 处理 PDF（支持扫描件）
 * 流程：上传 PDF → 引用 file_id 发送消息 → 抽取实体 → 删除文件
 */
const requestKimiPdf = async ({ sourceUrl, fileKey }) => {
  if (!hasKimiCredential) {
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
          Authorization: `Bearer ${KIMI_API_KEY}`,
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
        headers: { Authorization: `Bearer ${KIMI_API_KEY}` }
      }
    );
    extractedText = (typeof contentResp.data === 'string'
      ? contentResp.data
      : contentResp.data?.content || contentResp.data?.text || ''
    ).trim();
    logger.info('Kimi 文件内容提取成功', { fileId, textLength: extractedText.length });
  } catch (contentErr) {
    logger.warn('Kimi 文件内容获取失败，将直接在消息中引用文件', { fileId, error: contentErr.message });
  }

  // Step 2: 发送聊天消息（若提取到文本则直接用文本，否则引用 file_id）
  let result = null;
  try {
    const extractionPrompt = [
      '请从以下病历文件中识别并提取字段，返回 JSON：',
      '{ "rawText": "", "diagnosis": null, "stage": null, "geneMutation": null, "pdl1": null, "treatment": null, "treatmentLine": null, "ecog": null, "confidence": 0.0 }',
      '字段说明：',
      '1) diagnosis：规范化诊断名称，如"非小细胞肺癌"/"肺腺癌"/"胰腺导管腺癌"，不存在填null',
      '2) stage：AJCC分期（如"IVA期"）或临床描述（如"晚期"/"局部晚期"/"转移性"），不存在填null',
      '3) geneMutation：基因变异（如"KRAS G12V突变"），多个用分号分隔，不存在填null',
      '4) pdl1：PD-L1表达（如"TPS 80%"或"CPS 15"或"TPS 0%"），不存在填null',
      '5) treatment：既往治疗史（如"吉西他滨+白蛋白紫杉醇一线化疗"），不存在填null',
      '6) treatmentLine：患者当前需要的治疗线数（整数），如一线治疗失败后填2，不存在填null',
      '7) ecog：体能状态评分，0~4整数，不存在填null',
      '8) confidence：识别整体置信度，0~1',
      '9) rawText：保留核心原文，不超过2000字符'
    ].join('\n');

    let userContent;
    if (extractedText) {
      // 文本已提取：直接发文本消息（更快）
      userContent = `${extractionPrompt}\n\n病历文本：\n${extractedText.substring(0, 4000)}`;
    } else {
      // 文本为空（扫描件）：引用 file_id，由 Kimi 视觉处理
      userContent = [
        { type: 'file', file_id: fileId },
        { type: 'text', text: extractionPrompt }
      ];
    }

    const messages = [
      {
        role: 'system',
        content: '你是医疗病历OCR与信息抽取助手。必须返回JSON对象，不要输出其他文本。'
      },
      {
        role: 'user',
        content: userContent
      }
    ];

    const chatResp = await axios.post(
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

    const content = chatResp?.data?.choices?.[0]?.message?.content || '';
    const parsed = parseJsonSafe(content);
    if (!parsed) {
      throw new Error('Kimi PDF 模式返回内容无法解析为 JSON');
    }

    const ecogRaw = parsed.ecog;
    const ecogValue = ecogRaw != null && ecogRaw !== '' ? Number(ecogRaw) : null;
    const lineRaw = parsed.treatmentLine;
    const lineValue = lineRaw != null && lineRaw !== '' ? Number(lineRaw) : null;

    const entities = {
      diagnosis: parsed.diagnosis || null,
      stage: parsed.stage || null,
      geneMutation: parsed.geneMutation || null,
      treatment: parsed.treatment || null,
      ecog: Number.isFinite(ecogValue) && ecogValue >= 0 && ecogValue <= 4 ? ecogValue : null,
      pdl1: parsed.pdl1 || null,
      treatmentLine: Number.isFinite(lineValue) && lineValue >= 1 && lineValue <= 10 ? lineValue : null
    };

    const normalizedConfidence = Number(parsed.confidence);
    result = {
      success: true,
      provider: 'kimi_pdf',
      text: (parsed.rawText || '').toString(),
      entities,
      confidence: Number.isFinite(normalizedConfidence)
        ? Math.max(0, Math.min(1, normalizedConfidence))
        : estimateConfidence(entities),
      detections: []
    };
  } finally {
    // Step 3: 清理上传的文件
    try {
      await axios.delete(`${KIMI_BASE_URL}/files/${fileId}`, {
        timeout: 10000,
        headers: { Authorization: `Bearer ${KIMI_API_KEY}` }
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
const parseKimiEntities = (parsed) => {
  const ecogRaw = parsed.ecog;
  const ecogValue = ecogRaw != null && ecogRaw !== '' ? Number(ecogRaw) : null;
  const lineRaw = parsed.treatmentLine;
  const lineValue = lineRaw != null && lineRaw !== '' ? Number(lineRaw) : null;
  const ageRaw = parsed.age;
  const ageValue = ageRaw != null && ageRaw !== '' ? Number(ageRaw) : null;

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
    comorbidities: Array.isArray(parsed.comorbidities) ? parsed.comorbidities.filter(Boolean) : [],
    priorTherapies: Array.isArray(parsed.priorTherapies) ? parsed.priorTherapies.filter(Boolean) : [],
    labValues: (parsed.labValues && typeof parsed.labValues === 'object' && !Array.isArray(parsed.labValues)) ? parsed.labValues : {},
    bloodCounts: (parsed.bloodCounts && typeof parsed.bloodCounts === 'object' && !Array.isArray(parsed.bloodCounts)) ? parsed.bloodCounts : {},
    fertilityStatus: parsed.fertilityStatus || null
  };
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
            '请从图片中识别病历文本并提取以下字段，返回 JSON：',
            '{ "rawText": "", "diagnosis": null, "stage": null, "geneMutation": null, "pdl1": null, "treatment": null, "treatmentLine": null, "ecog": null, "age": null, "weight": null, "height": null, "comorbidities": [], "priorTherapies": [], "labValues": {}, "bloodCounts": {}, "fertilityStatus": null, "confidence": 0.0 }',
            '字段说明：',
            '1) diagnosis：规范化诊断名称，如"非小细胞肺癌"/"肺腺癌"/"肝细胞癌"，不存在填null',
            '2) stage：AJCC分期（如"IVA期"）或临床描述（如"晚期"/"局部晚期"/"转移性"），不存在填null',
            '3) geneMutation：基因变异（如"EGFR 19del阳性"），多个用分号分隔，不存在填null',
            '4) pdl1：PD-L1表达（如"TPS 80%"或"CPS 15"），不存在填null',
            '5) treatment：既往治疗史（如"铂类化疗2周期+培美曲塞"），不存在填null',
            '6) treatmentLine：患者当前需要的治疗线数（整数），如一线治疗失败后填2，不存在填null',
            '7) ecog：体能状态评分，0~4整数，不存在填null',
            '8) age：患者年龄（整数），不存在填null',
            '9) weight：体重(kg)，不存在填null',
            '10) height：身高(cm)，不存在填null',
            '11) comorbidities：合并症数组，如["脑转移","高血压","糖尿病"]，无则填[]',
            '12) priorTherapies：既往具体治疗方案数组，如["曲妥珠单抗","卡铂+培美曲塞"]，无则填[]',
            '13) labValues：肝肾功能指标对象，如{"ALT":{"value":35,"unit":"U/L"},"creatinine":{"value":68,"unit":"μmol/L"}}，无则填{}',
            '14) bloodCounts：血常规对象，如{"WBC":{"value":5.2,"unit":"×10⁹/L"},"PLT":{"value":180,"unit":"×10⁹/L"}}，无则填{}',
            '15) fertilityStatus：生育状态（如"绝经"/"妊娠试验阴性"），不存在填null',
            '16) confidence：识别整体置信度，0~1',
            '17) rawText：保留核心原文，不超过2000字符'
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
const requestKimiText = async (text) => {
  if (!hasKimiCredential) {
    throw new Error('Kimi API Key 未配置');
  }

  const messages = [
    {
      role: 'system',
      content: '你是医疗病历信息抽取助手。必须返回JSON对象，不要输出其他文本。'
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
        text.substring(0, 4000)
      ].join('\n')
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
    throw new Error('Kimi 文本模式返回内容无法解析为 JSON');
  }

  const entities = parseKimiEntities(parsed);

  const normalizedConfidence = Number(parsed.confidence);

  return {
    success: true,
    provider: 'kimi_text',
    text: (parsed.rawText || text).toString(),
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
  if (!text && imageUrl && !isPrivateOrIpUrl(imageUrl)) {
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'text',
        timeout: 10000,
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
 * markitdown 预处理：尝试用 markitdown 将文件转为 Markdown，再交给 Kimi 结构化
 * 对 PDF（文本型）和文档格式效果最好；扫描件/图片可能返回空文本，自动降级
 */
const tryMarkitdownPipeline = async ({ fileKey, sourceUrl, mimeType }) => {
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

  // 优先用 Kimi 进行结构化抽取
  if (hasKimiCredential) {
    try {
      const kimiResult = await requestKimiText(markdown);
      return {
        success: true,
        text: kimiResult.text || markdown,
        entities: kimiResult.entities,
        confidence: kimiResult.confidence,
        detections: []
      };
    } catch (kimiErr) {
      logger.warn('markitdown + Kimi 文本抽取失败，降级到规则', { error: kimiErr.message });
    }
  }

  // 无 Kimi 或 Kimi 失败：用规则兜底
  const entities = extractMedicalEntities(markdown);
  return {
    success: true,
    text: markdown,
    entities,
    confidence: estimateConfidence(entities),
    detections: []
  };
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

    // 第一优先级：markitdown 预处理（对 PDF 文本型文件效果最佳）
    try {
      const markitdownResult = await tryMarkitdownPipeline({
        fileKey: source.fileKey,
        sourceUrl,
        mimeType: source.mimeType
      });
      if (markitdownResult) {
        logger.info('markitdown 管线成功，跳过传统 OCR', { provider: 'markitdown' });
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
      // 优先路径：Kimi File API（原生支持扫描件 PDF，无需图片转换）
      if (hasKimiCredential) {
        try {
          const kimiPdfResult = await requestKimiPdf({
            sourceUrl,
            fileKey: source.fileKey
          });
          logger.info('PDF 走 Kimi File API 模式完成', { provider: kimiPdfResult.provider });
          return {
            success: true,
            text: kimiPdfResult.text,
            entities: kimiPdfResult.entities,
            confidence: kimiPdfResult.confidence,
            detections: []
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

      // 有文本则用 Kimi 文本模式结构化（更准确）
      if (text && hasKimiCredential) {
        try {
          const kimiResult = await requestKimiText(text);
          logger.info('PDF 走 Kimi 文本模式结构化完成');
          return {
            success: true,
            text: kimiResult.text || text,
            entities: kimiResult.entities,
            confidence: kimiResult.confidence,
            detections: []
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
  processMedicalImage,
  requestKimiText,
  requestKimiPdf
};
