const multer = require('multer');
const { MedicalRecord, Trial } = require('../models');
const { success } = require('../utils/response');
const { BusinessError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const ossService = require('../services/oss');
const queueService = require('../services/queue');
const { scoreRecordAgainstTrial } = require('../services/matchEngine');

// 配置 multer 内存存储
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024  // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BusinessError('仅支持 JPG/PNG/PDF 文件格式', 400));
    }
  }
});

/**
 * 上传病历文件
 */
const uploadMiddleware = upload.single('file');

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

const handleUpload = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new BusinessError('请选择要上传的文件', 400);
    }

    const { type, remark } = req.body;
    const userId = req.userId;
    const file = req.file;

    // 计算文件哈希（用于去重）
    const fileHash = ossService.calculateMD5(file.buffer);

    // 检查是否已存在相同文件
    const existingRecord = await MedicalRecord.findOne({
      where: { user_id: userId, file_hash: fileHash }
    });

    if (existingRecord) {
      logger.info('检测到重复上传:', { userId, fileHash, existingId: existingRecord.id });

      const forceReparse = truthyText(req.body.forceReparse);
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
        await queueService.addOCRTask(existingRecord.id, imageUrl, userId, {
          mimeType: file.mimetype,
          fileKey: existingRecord.file_key
        });

        logger.info('重复文件触发重新解析:', {
          userId,
          recordId: existingRecord.id,
          forceReparse
        });

        return res.json(success({
          fileId: existingRecord.id,
          status: 'pending',
          uploadedAt: existingRecord.created_at,
          isDuplicate: true,
          reparseTriggered: true
        }, forceReparse ? '检测到重复文件，已强制重新解析' : '检测到历史识别结果缺失，已自动重新解析'));
      }

      return res.json(success({
        fileId: existingRecord.id,
        status: existingRecord.status,
        uploadedAt: existingRecord.created_at,
        isDuplicate: true
      }, '该文件已存在，直接返回已有记录'));
    }

    // 生成存储 Key
    const fileKey = ossService.generateKey(userId, file.originalname);

    // 上传到 COS
    const uploadResult = await ossService.uploadFile(file.buffer, fileKey, {
      contentType: file.mimetype,
      metadata: {
        userId,
        originalName: file.originalname
      }
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

    // OCR 优先走服务内网回源，避免依赖对外 HTTPS 域名
    const imageUrl = await ossService.getInternalUrl(fileKey);

    // 添加 OCR 异步任务
    await queueService.addOCRTask(record.id, imageUrl, userId, {
      mimeType: file.mimetype,
      fileKey
    });

    logger.info('病历上传成功:', { 
      recordId: record.id, 
      userId, 
      fileKey,
      fileSize: file.size 
    });

    res.json(success({
      fileId: record.id,
      status: 'pending',
      uploadedAt: record.created_at
    }, '上传成功，正在解析中'));

  } catch (err) {
    next(err);
  }
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

    const record = await MedicalRecord.findOne({
      where: { id: fileId, user_id: req.userId }
    });

    if (!record) {
      return res.status(404).json({ code: 404, message: '记录不存在', data: null });
    }

    // 构建响应
    const mappedStatus = mapParseStatus(record.status);
    const response = {
      fileId: record.id,
      status: mappedStatus.status,
      progress: mappedStatus.progress,
      result: null,
      createdAt: record.created_at,
      updatedAt: record.updated_at
    };

    // 如果已完成，返回解析结果
    if (record.status === 'completed' && record.structured) {
      response.result = {
        diagnosis: record.diagnosis,
        stage: record.stage,
        geneMutation: record.gene_mutation,
        treatment: record.treatment,
        confidence: record.structured.confidence || 0.9,
        rawText: record.structured.text?.substring(0, 500) // 限制返回文本长度
      };
    }

    // 如果失败，返回错误信息
    if (record.status === 'error' && record.structured?.error) {
      response.errorMsg = record.structured.error;
    }

    res.json(success(response));

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
        where: { user_id: req.userId },
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
        imageUrl = await ossService.getRequestAwareUrl(r.file_key, req, 3600);
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

    const record = await MedicalRecord.findOne({
      where: { id, user_id: req.userId }
    });

    if (!record) {
      return res.status(404).json({ code: 404, message: '病历不存在', data: null });
    }

    // 获取图片URL
    let images = [];
    try {
      const url = await ossService.getRequestAwareUrl(record.file_key, req, 3600);
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
    const record = await MedicalRecord.findOne({
      where: { id, user_id: req.userId }
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
 * 删除病历
 */
const deleteRecord = async (req, res, next) => {
  try {
    const { id } = req.params;

    const record = await MedicalRecord.findOne({
      where: { id, user_id: req.userId }
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

module.exports = {
  uploadMiddleware,
  handleUpload,
  getParseStatus,
  getRecords,
  getRecordDetail,
  enrichRecord,
  deleteRecord
};
