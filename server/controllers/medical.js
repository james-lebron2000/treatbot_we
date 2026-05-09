const multer = require('multer');
const { MedicalRecord, Trial } = require('../models');
const { success } = require('../utils/response');
const { BusinessError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const ossService = require('../services/oss');
const queueService = require('../services/queue');
const { scoreRecordAgainstTrial } = require('../services/matchEngine');
// PRD-2026Q4 followup：上传批次上限三端共享常量，避免历史的"server/WeApp/H5 各自
// 硬编码不同步"反复事故。env BATCH_UPLOAD_MAX 仍可覆盖默认（仅服务端，便于压测/灰度）。
const sharedUploadSchema = require('../../shared/schemas/upload.js');
const SHARED_BATCH_UPLOAD_MAX = sharedUploadSchema.BATCH_UPLOAD_MAX;

// 配置 multer 内存存储
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024  // 30MB（PDF 扫描件通常较大）
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/bmp',
      'application/pdf'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BusinessError('仅支持 JPG/PNG/WebP/BMP/PDF 文件格式', 400));
    }
  }
});

/**
 * 上传病历文件（单文件入口）
 */
const uploadMiddleware = upload.single('file');

/**
 * Phase E.2：批量上传中间件 —— 同一次请求最多 10 份文件。
 * field name 同时接受 `files` 和 `file`，方便客户端从单文件迁移过来。
 */
// PRD-2026Q4 followup（用户反馈 5 张限额过紧）：默认 5 → 9。
// 选 9：与 wx.chooseMedia 单次上限一致 + 朋友圈 9 张图心智模型 + 客户端 wxml 历史 `<9` 判断。
// multer hard cap 与 BATCH_UPLOAD_MAX 一致：multer 在 array() 阶段就拒掉超额，
// handleUploadBatch 里再做一次软校验作为兜底。
// 速率上限保护：用户 30/h × 9 = 270 份/小时，单份 OCR ~$0.05，~$13.5/h/user 上限可控。
const uploadMiddlewareBatch = upload.array('files', parseInt(process.env.BATCH_UPLOAD_MAX || String(SHARED_BATCH_UPLOAD_MAX), 10));

const mapParseStatus = (status) => {
  if (status === 'completed') {
    return { status: 'completed', progress: 100 };
  }
  if (status === 'error') {
    return { status: 'error', progress: 0 };
  }
  if (status === 'running') {
    return { status: 'analyzing', progress: 65 };
  }
  return { status: 'parsing', progress: 25 };
};

const truthyText = (value) => {
  const normalized = `${value || ''}`.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const hasMeaningfulExtraction = (record) => {
  if (!record) {
    return false;
  }

  const structured = normalizeStructured(record.structured);
  const entities = normalizeEntities(structured.entities);
  const candidates = [
    record.diagnosis,
    record.stage,
    record.gene_mutation,
    record.treatment,
    entities.diagnosis,
    entities.stage,
    entities.geneMutation,
    entities.gene_mutation,
    entities.treatment
  ];

  return candidates.some((item) => `${item || ''}`.trim() !== '');
};

const normalizeStructured = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return {};
};

const normalizeEntities = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return {};
};

/**
 * Phase E.2：抽出的「单文件 → record」处理函数，被 handleUpload（单）和 handleUploadBatch（批）共用。
 * 返回结构与 handleUpload 早期 res.json 完全一致，调用方决定包裹成单条响应还是数组。
 */
const processSingleUpload = async ({ file, userId, type, remark, forceReparse }) => {
  // 计算文件哈希（用于去重）
  const fileHash = ossService.calculateMD5(file.buffer);

  // 检查是否已存在相同文件
  // PRD-2026Q2 §3.5：软删除的记录不参与去重，允许用户删了重传。
  const existingRecord = await MedicalRecord.findOne({
    where: { user_id: userId, file_hash: fileHash, deleted_at: null }
  });

  if (existingRecord) {
    logger.info('检测到重复上传:', { userId, fileHash, existingId: existingRecord.id });
    const shouldReparse = forceReparse || !hasMeaningfulExtraction(existingRecord);
    if (shouldReparse) {
      await existingRecord.update({
        status: 'pending',
        diagnosis: null,
        stage: null,
        gene_mutation: null,
        treatment: null,
        structured: null
      });

      const imageUrl = await ossService.getInternalUrl(existingRecord.file_key);
      let reparseQueued = true;
      try {
        await queueService.addOCRTask(existingRecord.id, imageUrl, userId, {
          mimeType: file.mimetype,
          fileKey: existingRecord.file_key
        });
      } catch (queueErr) {
        reparseQueued = false;
        logger.warn('OCR队列不可用，重新解析任务将稍后重试:', {
          recordId: existingRecord.id,
          error: queueErr.message
        });
        try {
          await existingRecord.update({
            status: 'error',
            structured: { error: 'OCR队列暂不可用，请稍后重试或手动录入关键信息' }
          });
        } catch (statusErr) {
          logger.error('回写 record.status=error 失败:', {
            recordId: existingRecord.id,
            error: statusErr.message
          });
        }
      }
      logger.info('重复文件触发重新解析:', { userId, recordId: existingRecord.id, forceReparse, reparseQueued });
      return {
        fileId: existingRecord.id,
        recordId: existingRecord.id,
        status: 'pending',
        uploadedAt: existingRecord.created_at,
        isDuplicate: true,
        reparseTriggered: true,
        ocrQueued: reparseQueued,
        message: reparseQueued
          ? (forceReparse ? '检测到重复文件，已强制重新解析' : '检测到历史识别结果缺失，已自动重新解析')
          : '上传成功，解析服务暂时繁忙，将自动重试'
      };
    }
    return {
      fileId: existingRecord.id,
      recordId: existingRecord.id,
      status: existingRecord.status,
      uploadedAt: existingRecord.created_at,
      isDuplicate: true,
      message: '该文件已存在，直接返回已有记录'
    };
  }

  // 生成存储 Key
  const fileKey = ossService.generateKey(userId, file.originalname);
  // 上传到 COS
  await ossService.uploadFile(file.buffer, fileKey, {
    contentType: file.mimetype,
    metadata: { userId, originalName: file.originalname }
  });
  // 创建数据库记录
  const record = await MedicalRecord.create({
    user_id: userId,
    type: type || '其他',
    file_key: fileKey,
    file_hash: fileHash,
    file_size: file.size,
    status: 'pending',
    remark: remark || null
  });

  const imageUrl = await ossService.getInternalUrl(fileKey);
  let ocrQueued = true;
  try {
    await queueService.addOCRTask(record.id, imageUrl, userId, {
      mimeType: file.mimetype,
      fileKey
    });
  } catch (queueErr) {
    ocrQueued = false;
    logger.warn('OCR队列不可用，任务将稍后重试:', {
      recordId: record.id,
      error: queueErr.message
    });
    try {
      await record.update({
        status: 'error',
        structured: { error: 'OCR队列暂不可用，请稍后重试或手动录入关键信息' }
      });
    } catch (statusErr) {
      logger.error('回写 record.status=error 失败:', {
        recordId: record.id,
        error: statusErr.message
      });
    }
  }
  logger.info('病历上传成功:', { recordId: record.id, userId, fileKey, fileSize: file.size, ocrQueued });
  return {
    fileId: record.id,
    recordId: record.id,
    status: 'pending',
    ocrQueued,
    uploadedAt: record.created_at,
    isDuplicate: false,
    message: ocrQueued ? '上传成功，正在解析中' : '上传成功，解析服务暂时繁忙，将自动重试'
  };
};

const handleUpload = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new BusinessError('请选择要上传的文件', 400);
    }

    const { type, remark } = req.body;
    const userId = req.userId;
    const file = req.file;
    const forceReparse = truthyText(req.body.forceReparse);

    // Phase E.2：单文件路径委托到 processSingleUpload，与批量入口共享去重 / 入队 / 错误降级逻辑。
    const result = await processSingleUpload({ file, userId, type, remark, forceReparse });
    const { message, ...payload } = result;
    res.json(success(payload, message));
  } catch (err) {
    next(err);
  }
};

/**
 * Phase E.2：批量上传 —— 同一次请求最多 10 份文件。
 * 行为：
 *   - 每份文件**单独**走 processSingleUpload（拥有独立的 record_id 和 OCR 任务）
 *   - 单文件失败不影响其他文件（每份返回自己的 status / errorMsg）
 *   - 整体响应里同时给出 fileIds[] 和 records[] 两份信息，方便客户端轮询批量状态
 *   - 任何文件成功即返回 200；全部失败时仍返回 200 但 records 里都带 status='error'，
 *     由客户端负责显示模态（与 handleUpload 的失败语义一致）
 */
// PRD-2026Q4 followup（用户反馈 5 张限额过紧）：默认 5 → 9。
// 与 wx.chooseMedia 单次上限 + 朋友圈 9 张图心智模型对齐。每份 OCR ~$0.05，
// 用户 30/h × 9 ≈ 270 份/h 的上限仍受 uploadLimiter 总速率门控；要再大请显式调 ENV。
const BATCH_UPLOAD_MAX = parseInt(process.env.BATCH_UPLOAD_MAX || String(SHARED_BATCH_UPLOAD_MAX), 10);

const handleUploadBatch = async (req, res, next) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      throw new BusinessError('请选择要上传的文件', 400);
    }
    // Phase E.6 / Review #5：硬上限收紧到 BATCH_UPLOAD_MAX（默认 9，与 wx 朋友圈口径对齐）。
    if (files.length > BATCH_UPLOAD_MAX) {
      throw new BusinessError(`一次最多上传 ${BATCH_UPLOAD_MAX} 份文件，请分批上传`, 400);
    }

    const { type, remark } = req.body;
    const userId = req.userId;
    const forceReparse = truthyText(req.body.forceReparse);

    // 串行处理：避免单租户在同一秒并发占满 OCR 队列导致 Bull 入列失败。
    // 单文件耗时只在「计算 hash + 上传 COS + 入队」级别（毫秒），不是 OCR 本身（异步），所以串行也快。
    //
    // Phase E.6 / Review #6：同一批内若用户重复选了同一份文件（手抖 / 拖拽两次），
    // 用 in-memory hash map 短路重复入队 —— 否则两次 findOne 都会在 create 之前命中"无重复"，
    // 创建出两条同 file_key 的 record。跨请求竞态需要 DB 唯一索引兜底（见部署清单）。
    const records = [];
    const batchHashCache = new Map(); // file_md5 → result from first occurrence
    for (const file of files) {
      try {
        // 计算 hash 看是否已出现过
        const hash = ossService.calculateMD5(file.buffer);
        const existingInBatch = batchHashCache.get(hash);
        if (existingInBatch) {
          records.push({
            ...existingInBatch,
            isDuplicate: true,
            message: '同一批内重复文件，已合并到首份',
            originalName: file.originalname
          });
          continue;
        }

        const r = await processSingleUpload({ file, userId, type, remark, forceReparse });
        const entry = {
          fileId: r.fileId,
          recordId: r.recordId,
          status: r.status,
          ocrQueued: r.ocrQueued !== false,
          isDuplicate: !!r.isDuplicate,
          uploadedAt: r.uploadedAt,
          message: r.message,
          originalName: file.originalname
        };
        batchHashCache.set(hash, entry);
        records.push(entry);
      } catch (perFileErr) {
        logger.error('批量上传单文件失败', {
          userId,
          originalName: file && file.originalname,
          error: perFileErr.message
        });
        records.push({
          fileId: null,
          recordId: null,
          status: 'error',
          ocrQueued: false,
          isDuplicate: false,
          uploadedAt: null,
          message: perFileErr.message || '该文件上传失败',
          originalName: file && file.originalname
        });
      }
    }

    const fileIds = records.map((r) => r.fileId).filter(Boolean);
    const successCount = records.filter((r) => r.fileId && r.status !== 'error').length;
    const summary = `${successCount}/${records.length} 份文件已入队解析`;

    res.json(success({
      fileIds,
      records,
      total: records.length,
      successCount
    }, summary));
  } catch (err) {
    next(err);
  }
};

/**
 * Phase E.2：把单条 record 折成 parse-status 响应。
 * 给 getParseStatus（单）和 getParseStatusBatch（批）共享。
 */
const buildParseStatusEntry = (record) => {
  const mappedStatus = mapParseStatus(record.status);
  const entry = {
    fileId: record.id,
    recordId: record.id,
    status: mappedStatus.status,
    progress: mappedStatus.progress,
    result: null,
    createdAt: record.created_at,
    updatedAt: record.updated_at
  };
  if (record.status === 'completed' && record.structured) {
    entry.result = {
      id: record.id,
      recordId: record.id,
      diagnosis: record.diagnosis,
      stage: record.stage,
      geneMutation: record.gene_mutation,
      treatment: record.treatment,
      confidence: record.structured.confidence || 0.9,
      rawText: record.structured.text?.substring(0, 500)
    };
  }
  if (record.status === 'error' && record.structured?.error) {
    entry.errorMsg = record.structured.error;
  }
  return entry;
};

/**
 * 查询解析状态
 */
const getParseStatus = async (req, res, next) => {
  try {
    const { fileId } = req.query;

    if (!fileId) {
      throw new BusinessError('缺少 fileId 参数', 400);
    }

    // PRD-2026Q2 §3.5：查询解析状态也过滤软删除记录，防止前端卡在已删病历上轮询。
    const record = await MedicalRecord.findOne({
      where: { id: fileId, user_id: req.userId, deleted_at: null }
    });

    if (!record) {
      return res.status(404).json({ code: 404, message: '记录不存在', data: null });
    }

    res.json(success(buildParseStatusEntry(record)));
  } catch (err) {
    next(err);
  }
};

/**
 * Phase E.2：批量查询解析状态。
 *   GET  /api/medical/parse-status-batch?fileIds=a,b,c
 *   POST /api/medical/parse-status-batch  body: { fileIds: ['a','b','c'] }
 *
 * 客户端用一次请求拿到所有文件的状态，避免 N 次 HTTP 轮询。
 * 当所有文件都进入终态（completed / error）时响应里 `done=true`，客户端可停轮询。
 */
const getParseStatusBatch = async (req, res, next) => {
  try {
    const raw = (req.method === 'POST' ? req.body && req.body.fileIds : req.query && req.query.fileIds) || [];
    let fileIds = [];
    if (Array.isArray(raw)) {
      fileIds = raw.map((x) => `${x || ''}`.trim()).filter(Boolean);
    } else if (typeof raw === 'string') {
      fileIds = raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (!fileIds.length) {
      throw new BusinessError('缺少 fileIds 参数', 400);
    }
    if (fileIds.length > 20) {
      throw new BusinessError('一次最多查询 20 个 fileId', 400);
    }
    // Phase E.6 / Review #8：单 fileId 长度限制，防止 Op.in 子句被巨长字符串撑爆 max_allowed_packet。
    // Sequelize 用参数化查询保护 SQL 注入；这里只防 DoS。
    if (fileIds.some((id) => id.length > 64)) {
      throw new BusinessError('fileId 过长（单个 ≤ 64 字符）', 400);
    }

    const { Op } = require('sequelize');
    const records = await MedicalRecord.findAll({
      where: {
        id: { [Op.in]: fileIds },
        user_id: req.userId,
        deleted_at: null
      }
    });

    // 用 fileId 做 map，缺失（被删 / 不属于本用户）则填 status='not_found'
    const byId = new Map(records.map((r) => [String(r.id), r]));
    const entries = fileIds.map((fid) => {
      const r = byId.get(String(fid));
      if (!r) {
        return { fileId: fid, recordId: fid, status: 'not_found', progress: 0, result: null, errorMsg: '记录不存在或已被删除' };
      }
      return buildParseStatusEntry(r);
    });

    const TERMINAL = new Set(['completed', 'error', 'not_found']);
    const done = entries.every((e) => TERMINAL.has(e.status));
    const completed = entries.filter((e) => e.status === 'completed').length;
    const errored = entries.filter((e) => e.status === 'error' || e.status === 'not_found').length;

    res.json(success({
      entries,
      total: entries.length,
      completedCount: completed,
      erroredCount: errored,
      done
    }));

  } catch (err) {
    next(err);
  }
};

/**
 * 获取病历列表
 */
const getRecords = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize) || 20, 100);  // 最大100
    const offset = (page - 1) * pageSize;

    const [recordResult, recruitingTrials] = await Promise.all([
      MedicalRecord.findAndCountAll({
        // PRD-2026Q2 §3.5：列表只返回未软删除的记录
        where: { user_id: req.userId, deleted_at: null },
        order: [['created_at', 'DESC']],
        limit: pageSize,
        offset
      }),
      Trial.findAll({
        where: { status: 'recruiting' },
        attributes: ['id', 'name', 'phase', 'type', 'indication', 'institution', 'location', 'description', 'inclusion_criteria', 'exclusion_criteria', 'status'],
        limit: 200
      })
    ]);
    const { count, rows } = recordResult;

    // 获取预签名URL
    const list = await Promise.all(rows.map(async (r) => {
      let imageUrl = null;
      try {
        imageUrl = await ossService.getRequestAwareUrl(r.file_key, req, 300);
      } catch (e) {
        logger.warn('获取图片URL失败:', { recordId: r.id, error: e.message });
      }

      return {
        id: r.id,
        type: r.type,
        diagnosis: r.diagnosis || '未识别',
        status: r.status,
        statusText: r.status === 'completed' ? '已解析' : r.status === 'error' ? '解析失败' : '处理中',
        uploadTime: r.created_at,
        matchCount: r.status === 'completed'
          ? recruitingTrials.filter((trial) => scoreRecordAgainstTrial(r, trial).score >= 60).length
          : 0,
        imageUrl
      };
    }));

    res.json({
      code: 0,
      message: 'success',
      data: list,
      pagination: {
        page,
        pageSize,
        total: count,
        hasMore: offset + rows.length < count
      }
    });

  } catch (err) {
    next(err);
  }
};

/**
 * 获取病历详情
 */
const getRecordDetail = async (req, res, next) => {
  try {
    const { id } = req.params;

    // PRD-2026Q2 §3.5：软删除记录不返回详情
    const record = await MedicalRecord.findOne({
      where: { id, user_id: req.userId, deleted_at: null }
    });

    if (!record) {
      return res.status(404).json({ code: 404, message: '病历不存在', data: null });
    }

    // 获取图片URL
    let images = [];
    try {
      const url = await ossService.getRequestAwareUrl(record.file_key, req, 300);
      images = [url];
    } catch (e) {
      logger.warn('获取图片URL失败:', { recordId: id, error: e.message });
    }

    res.json(success({
      id: record.id,
      type: record.type,
      diagnosis: record.diagnosis || '未识别',
      stage: record.stage || '未识别',
      geneMutation: record.gene_mutation || '未识别',
      treatment: record.treatment || '未识别',
      status: record.status,
      uploadTime: record.created_at,
      images,
      structured: record.structured?.entities || {}
    }));

  } catch (err) {
    next(err);
  }
};

/**
 * 病历信息补全
 */
const enrichRecord = async (req, res, next) => {
  try {
    const { id } = req.params;
    // PRD-2026Q2 §3.5：软删除记录不允许补全
    const record = await MedicalRecord.findOne({
      where: { id, user_id: req.userId, deleted_at: null }
    });

    if (!record) {
      return res.status(404).json({ code: 404, message: '病历不存在', data: null });
    }

    const body = req.body || {};
    const structured = normalizeStructured(record.structured);
    const currentEntities = normalizeEntities(structured.entities);
    const bodyEntities = normalizeEntities(body.entities);
    const bodyStructuredEntities = normalizeEntities(body.structured?.entities);

    const patchEntities = {
      ...bodyStructuredEntities,
      ...bodyEntities
    };

    if (body.diagnosis !== undefined) {
      patchEntities.diagnosis = body.diagnosis;
    }
    if (body.stage !== undefined) {
      patchEntities.stage = body.stage;
    }
    if (body.geneMutation !== undefined) {
      patchEntities.geneMutation = body.geneMutation;
    }
    if (body.gene_mutation !== undefined) {
      patchEntities.geneMutation = body.gene_mutation;
    }
    if (body.treatment !== undefined) {
      patchEntities.treatment = body.treatment;
    }

    const mergedEntities = {
      ...currentEntities,
      ...patchEntities
    };

    const diagnosis = body.diagnosis ?? mergedEntities.diagnosis ?? record.diagnosis;
    const stage = body.stage ?? mergedEntities.stage ?? record.stage;
    const geneMutation = body.gene_mutation ?? body.geneMutation ?? mergedEntities.geneMutation ?? record.gene_mutation;
    const treatment = body.treatment ?? mergedEntities.treatment ?? record.treatment;

    const updatedStructured = {
      ...structured,
      entities: mergedEntities,
      enrichedAt: new Date().toISOString()
    };

    await record.update({
      diagnosis: diagnosis || null,
      stage: stage || null,
      gene_mutation: geneMutation || null,
      treatment: treatment || null,
      structured: updatedStructured
    });

    res.json(success({
      id: record.id,
      updatedAt: record.updated_at,
      structured: updatedStructured
    }));
  } catch (err) {
    next(err);
  }
};

/**
 * 通过后端代理下载病历原文件。
 *
 * PRD-2026Q2 §2.2：敏感路径不再把 COS 预签名 URL 暴露给浏览器；
 * 前端走本接口，由后端鉴权 + 拉回 + stream 回去，保证只有 record.user_id
 * 本人（或 admin，后续 W3 加）能访问。Cache-Control 私有，防止中间层缓存。
 */
const downloadRecordFile = async (req, res, next) => {
  try {
    const { id } = req.params;

    // PRD-2026Q2 §3.5：软删除后不再允许下载原文件
    const record = await MedicalRecord.findOne({
      where: { id, user_id: req.userId, deleted_at: null }
    });

    if (!record) {
      return res.status(404).json({ code: 404, message: '病历不存在', data: null });
    }

    if (!record.file_key) {
      return res.status(404).json({ code: 404, message: '原文件不存在', data: null });
    }

    let object;
    try {
      object = await ossService.getObjectBuffer(record.file_key);
    } catch (e) {
      logger.warn('代理下载失败:', { recordId: id, error: e.message });
      return res.status(502).json({ code: 502, message: '对象存储读取失败', data: null });
    }

    const safeName = encodeURIComponent(record.file_name || `record-${id}.bin`);
    res.setHeader('Content-Type', object.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${safeName}`);
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    if (object.etag) {
      res.setHeader('ETag', object.etag);
    }
    return res.end(object.buffer);
  } catch (err) {
    next(err);
  }
};

/**
 * 删除病历
 */
const deleteRecord = async (req, res, next) => {
  try {
    const { id } = req.params;

    // PRD-2026Q2 §3.5：旧硬删接口仅对未软删除记录生效
    const record = await MedicalRecord.findOne({
      where: { id, user_id: req.userId, deleted_at: null }
    });

    if (!record) {
      return res.status(404).json({ code: 404, message: '病历不存在', data: null });
    }

    // 删除 COS 文件
    try {
      await ossService.deleteFile(record.file_key);
    } catch (e) {
      logger.error('删除COS文件失败:', { recordId: id, error: e.message });
      // 继续删除数据库记录
    }

    await record.destroy();

    logger.info('病历删除成功:', { recordId: id, userId: req.userId });

    res.json(success(null, '删除成功'));

  } catch (err) {
    next(err);
  }
};

/**
 * PRD-2026Q2 §3.5：多病历管理页 —— 软删除接口。
 *
 * 仅做 deleted_at = now()，不触碰 COS 原文件，也不删申请记录快照，
 * 保证误删可以后续人工恢复；真正的物理清理走运维定期任务。
 * 鉴权要求：record.user_id === req.userId，否则统一返回 404 避免泄漏存在性。
 */
const softDeleteRecord = async (req, res, next) => {
  try {
    const { id } = req.params;

    const record = await MedicalRecord.findOne({
      where: { id, user_id: req.userId, deleted_at: null }
    });

    if (!record) {
      return res.fail('记录不存在', 404);
    }

    const deletedAt = new Date();
    await record.update({ deleted_at: deletedAt });

    logger.info('病历软删除成功:', { recordId: id, userId: req.userId });

    return res.ok({ id: record.id, deletedAt: deletedAt.toISOString() });
  } catch (err) {
    next(err);
  }
};

/**
 * Phase E.3：跨多份病历的时间线 / 治疗经过聚合。
 *   GET /api/medical/timeline → 返回当前用户全部 completed record 整合后的时间线
 *
 * 调用 timelineService（Doubao → Kimi → 规则）三段式降级；用户感知是「一定能拿到结果」。
 */
const getTimeline = async (req, res, next) => {
  try {
    const records = await MedicalRecord.findAll({
      where: {
        user_id: req.userId,
        status: 'completed',
        deleted_at: null
      },
      attributes: [
        'id', 'diagnosis', 'stage', 'gene_mutation', 'treatment',
        'treatment_line', 'pdl1', 'structured', 'created_at'
      ],
      order: [['created_at', 'DESC']],
      limit: 6
    });

    // Phase E.6 / Review #3：少于 2 份完成时不调 LLM —— 单条没有"跨时间线"价值，
    // 而 LLM 调用按 8000 字 ~ $0.05 计，避免误用为防误调用 burst。
    if (records.length < 2) {
      return res.json(success({
        timeline: null,
        recordCount: records.length,
        sourceRecordIds: records.map((r) => r.id),
        reason: records.length === 0 ? 'no_records' : 'need_more_records'
      }, '需至少 2 份已完成解析的病历才能生成跨时间线'));
    }

    const timelineService = require('../services/timelineService');
    const timeline = await timelineService.generateTimeline(records);

    res.json(success({
      timeline,
      recordCount: records.length,
      sourceRecordIds: records.map((r) => r.id)
    }));
  } catch (err) {
    next(err);
  }
};

module.exports = {
  uploadMiddleware,
  uploadMiddlewareBatch,
  handleUpload,
  handleUploadBatch,
  getParseStatus,
  getParseStatusBatch,
  getTimeline,
  getRecords,
  getRecordDetail,
  enrichRecord,
  downloadRecordFile,
  deleteRecord,
  softDeleteRecord
};
