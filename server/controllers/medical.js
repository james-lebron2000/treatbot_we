const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { MedicalRecord, Trial } = require('../models');
const { success } = require('../utils/response');
const { BusinessError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const ossService = require('../services/oss');
const queueService = require('../services/queue');
const { scoreRecordAgainstTrial } = require('../services/matchEngine');
// PRD-2026Q4 T0-10：转化漏斗埋点
const funnelTracker = require('../services/funnelTracker');
// PRD-2026Q4 followup：上传批次上限三端共享常量，避免历史的"server/WeApp/Treatbot Web 各自
// 硬编码不同步"反复事故。env BATCH_UPLOAD_MAX 仍可覆盖默认（仅服务端，便于压测/灰度）。
const sharedUploadSchema = require('../../shared/schemas/upload.js');
const SHARED_BATCH_UPLOAD_MAX = sharedUploadSchema.BATCH_UPLOAD_MAX;

// PRD-2026Q4 followup（legacy multipart 内存安全）：从 memoryStorage 迁到 diskStorage。
// 默认落到 /app/uploads/tmp-multipart；生产部署已把 /app/uploads 绑定到宿主机磁盘，
// 避免 9 × 30MB 批量请求驻留在 Node RSS。MULTIPART_TMP_DIR 保留给运维覆盖。
const MULTIPART_TMP_DIR = process.env.MULTIPART_TMP_DIR || path.join(__dirname, '..', 'uploads', 'tmp-multipart');
try {
  fs.mkdirSync(MULTIPART_TMP_DIR, { recursive: true });
} catch (e) {
  // 启动期 mkdir 失败不致命：multer 自己也会再尝试一次；记录警告留排查。
  logger.warn('multipart tmp dir mkdir failed', { dir: MULTIPART_TMP_DIR, err: e && e.message });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: MULTIPART_TMP_DIR,
    // 文件名带时间戳 + 随机后缀避免同名碰撞；保留原始扩展名以便后续 mimetype/扩展名复检
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '') || '';
      const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
      cb(null, safe);
    }
  }),
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

// PRD-2026Q4 followup（legacy multipart 内存安全）：upload handlers finally 用这个清盘。
const cleanupMultipartTmpFiles = async (filesOrFile) => {
  const list = Array.isArray(filesOrFile)
    ? filesOrFile
    : (filesOrFile ? [filesOrFile] : []);
  await Promise.all(list.map(async (f) => {
    if (!f || !f.path) return;
    try {
      await fs.promises.unlink(f.path);
    } catch (err) {
      if (!err || err.code === 'ENOENT') {
        return;
      }
      logger.warn('multipart tmp unlink failed', { path: f.path, err: err.message });
    }
  }));
};

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

/**
 * Plan §Phase 1.3：把 (status, status_phase) 折成客户端能挑文案 + 渲染进度条的 (status, progress)。
 *
 * 终态短路：completed/error/cancelled 不查 status_phase，避免残留中间态污染卡片。
 *
 * 中段映射（status='running'）：
 *   queued       → (parsing,    25)   Bull 已收等 worker
 *   analyzing    → (analyzing,  55)   LLM 正在调用
 *   streaming    → (analyzing,  75)   流式拿到部分字段（broad 'analyzing' 兼容老客户端 COMPLETED_STATUSES）
 *   structuring  → (structuring,90)   schema 校验/合并阶段
 *   null/未识别  → (analyzing,  65)   兜底，永不抛
 *
 * pending / 兜底：(parsing, 25)。
 *
 * progress 数字必须 ≥ 客户端 STATUS_TEXT_MAP minProgress 才不会被卡在更低档；
 * tests/medicalParseStatus.test.js 防回归。
 */
const mapParseStatus = (status, statusPhase) => {
  if (status === 'completed') {
    return { status: 'completed', progress: 100 };
  }
  if (status === 'error') {
    return { status: 'error', progress: 0 };
  }
  if (status === 'cancelled') {
    return { status: 'cancelled', progress: 0 };
  }
  if (status === 'running') {
    switch (statusPhase) {
      case 'queued':       return { status: 'parsing',     progress: 25 };
      case 'analyzing':    return { status: 'analyzing',   progress: 55 };
      case 'streaming':    return { status: 'analyzing',   progress: 75 };
      case 'structuring':  return { status: 'structuring', progress: 90 };
      default:             return { status: 'analyzing',   progress: 65 };
    }
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

const firstNonEmpty = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    return value;
  }
  return null;
};

/**
 * Phase E.2：抽出的「单文件 → record」处理函数，被 handleUpload（单）和 handleUploadBatch（批）共用。
 * 返回结构与 handleUpload 早期 res.json 完全一致，调用方决定包裹成单条响应还是数组。
 */
const processSingleUpload = async ({ file, userId, type, remark, forceReparse }) => {
  // PRD-2026Q4 followup（legacy multipart 内存安全）：multer 现在落盘，file.path 才是真身。
  // calculateMD5Stream(filePath) 在 oss.js 已存在（Plan §Phase 1.5），常量内存消耗。
  // 老 calculateMD5(file.buffer) 仍保留在 oss.js 供测试/小负载场景，不删。
  const fileHash = await ossService.calculateMD5Stream(file.path);

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
      // Wave 3 §1：reparse 前先尝试同 hash 缓存命中（同 fileHash 可能已被其他用户/会话
      // 解析过并写入了 ocrCache）。命中即跳过 enqueue，直接返回 completed。
      if (await safeTryHydrateOcrFromCache(existingRecord.id, fileHash, userId)) {
        return {
          fileId: existingRecord.id,
          recordId: existingRecord.id,
          status: 'completed',
          uploadedAt: existingRecord.created_at,
          isDuplicate: true,
          reparseTriggered: false,
          ocrQueued: false,
          cacheHit: true,
          message: '检测到同文件已被识别，已直接复用结果'
        };
      }
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
  // PRD-2026Q4 followup（legacy multipart 内存安全）：流式上传到 COS（sliceUploadFile 自动分片）。
  // etagOverride 透传 fileHash，省一次 COS 端 etag 解析（与之前 calculateMD5(file.buffer) 行为同号）。
  await ossService.uploadStream(file.path, fileKey, {
    contentType: file.mimetype,
    metadata: { userId, originalName: file.originalname },
    etagOverride: fileHash
  });
  // 创建数据库记录
  // Plan §Phase 2.2：跨请求 race 兜底 —— 唯一索引 (user_id, file_hash, deleted_at) 抛
  // SequelizeUniqueConstraintError 时回查 winner，按 isDuplicate 返回，不重复入队。
  let record;
  try {
    record = await MedicalRecord.create({
      user_id: userId,
      type: type || '其他',
      file_key: fileKey,
      file_hash: fileHash,
      file_size: file.size,
      status: 'pending',
      remark: remark || null
    });
  } catch (err) {
    if (err && err.name === 'SequelizeUniqueConstraintError') {
      const winner = await MedicalRecord.findOne({
        where: { user_id: userId, file_hash: fileHash, deleted_at: null }
      });
      if (winner) {
        logger.info('upload race detected, joined winner', {
          userId, fileHash, winnerId: winner.id
        });
        return {
          fileId: winner.id,
          recordId: winner.id,
          status: winner.status,
          uploadedAt: winner.created_at,
          isDuplicate: true,
          ocrQueued: true,
          message: '检测到您正在同时上传相同文件，已合并到既有记录'
        };
      }
    }
    throw err;
  }

  const imageUrl = await ossService.getInternalUrl(fileKey);

  // Wave 3 §1：新 record 入队前先做一次同 hash 缓存查询。
  // 跨用户同文件（同事/家属共享病历、相同导出 PDF）会在此同步水合完成，
  // 不再经过 Bull 队列 + worker pickup ~100-500ms。
  const cacheHit = await safeTryHydrateOcrFromCache(record.id, fileHash, userId);

  let ocrQueued = cacheHit;   // 命中时无需 enqueue；不视作"队列失败"
  if (!cacheHit) {
    ocrQueued = true;
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
  }
  logger.info('病历上传成功:', {
    recordId: record.id, userId, fileKey, fileSize: file.size, ocrQueued, cacheHit
  });

  // PRD-2026Q4 T0-10：MEDICAL_UPLOADED 埋点。
  // 此处只表示"文件已落库 + 入队成功"，OCR 解析完成事件后续如需独立埋点可加 MEDICAL_PARSED。
  // 失败仅 logger.warn，绝不影响上传响应。
  try {
    funnelTracker.track(funnelTracker.EVENTS.MEDICAL_UPLOADED, {
      user_id: userId,
      entity_id: record.id,
      payload: { type: type || '其他', file_size: file.size, ocr_queued: ocrQueued }
    });
  } catch (trackErr) {
    logger.warn('[medical] 漏斗埋点失败（已吞）:', { recordId: record.id, error: trackErr.message });
  }

  return {
    fileId: record.id,
    recordId: record.id,
    // Wave 3 §1：cache 命中时直接报 completed，让客户端轮询第一次拍到就拿结果。
    status: cacheHit ? 'completed' : 'pending',
    ocrQueued,
    uploadedAt: record.created_at,
    isDuplicate: false,
    cacheHit,
    message: cacheHit
      ? '上传成功，已复用历史识别结果'
      : (ocrQueued ? '上传成功，正在解析中' : '上传成功，解析服务暂时繁忙，将自动重试')
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
    // Plan §Phase 3.4：附带队列深度，客户端 step 2 显示"前面还有 N 份在处理"
    const queueDepth = await safeGetQueueDepth();
    res.json(success({ ...payload, queueDepth }, message));
  } catch (err) {
    next(err);
  } finally {
    // PRD-2026Q4 followup（legacy multipart 内存安全）：disk-storage 落盘的 multer 临时文件
    // 必须显式清掉 —— 否则临时目录会被慢慢填满。
    await cleanupMultipartTmpFiles(req.file);
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

// PRD-2026Q4 followup（B5）：批量上传并发上限。
// 此前 `Promise.allSettled(files.map(processOne))` 是无界并发 —— 9 份文件触发 9 个
// 并发 COS sliceUploadFile（每个内部还分片并发），峰值入站带宽 + 文件句柄数能轻松击穿
// 单进程上限；且 9 份 calculateMD5Stream 同时跑会争 Node 主线程 IO。
// 默认 3：经验值 —— 与 cos-nodejs-sdk-v5 默认 ChunkParallelLimit 持平，且不会把单进程的
// libuv 线程池（默认 4）打满。要再大请显式调 ENV。
const BATCH_UPLOAD_CONCURRENCY = Math.max(
  1,
  parseInt(process.env.BATCH_UPLOAD_CONCURRENCY || '3', 10)
);

/**
 * 内联并发池：以固定 concurrency 跑 task(item, idx)，返回 Promise.allSettled 形状的结果数组（顺序与 items 对齐）。
 * 不引第三方 p-limit —— 避免新依赖；逻辑可在测试里独立断言。
 */
const runWithConcurrency = async (items, concurrency, task) => {
  const results = new Array(items.length);
  let nextIdx = 0;
  const worker = async () => {
    while (nextIdx < items.length) {
      const i = nextIdx++;
      try {
        const value = await task(items[i], i);
        results[i] = { status: 'fulfilled', value };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  };
  const pool = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(pool);
  return results;
};

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

    // Plan §Phase 2.2：并发处理多文件 —— 5 份并行的 e2e 接近最慢单份耗时（不是 5×）。
    // 单文件路径里的 ossService.uploadFile / MedicalRecord.create / addOCRTask 都是 IO，
    // 并发跑只在 LLM provider 层撞配额；llmRateLimiter token bucket 已兜底。
    //
    // 同批 hash 短路：用 Promise<entry> map（不是结果 map）让后到的同 hash 文件在
    // leader 完成时拿到同一个 entry —— 否则两份同时进入 processSingleUpload 都会先
    // findOne→null 再各自 create，产生跨请求 race（DB 唯一索引兜底，但本进程层先省一次冲突）。
    const batchHashLeaders = new Map(); // file_md5 → Promise<entry>

    const processOne = async (file) => {
      // PRD-2026Q4 followup（legacy multipart 内存安全）：流式 hash，避免读 30MB×9 入 RAM。
      // 注意：这里和 processSingleUpload 内会再算一次 hash —— 短期内可接受（同一磁盘文件、
      // 流式 IO 成本低；同批 dedup 仍是 leader/follower 语义不变）。后续若要去重可在
      // processSingleUpload 接受 prehash 参数。
      const hash = await ossService.calculateMD5Stream(file.path);
      const leader = batchHashLeaders.get(hash);
      if (leader) {
        const existing = await leader;
        // 第二份返回带 isDuplicate=true 的同主体
        return {
          fileId: existing.fileId,
          recordId: existing.recordId,
          status: existing.status,
          ocrQueued: existing.ocrQueued,
          isDuplicate: true,
          uploadedAt: existing.uploadedAt,
          message: '同一批内重复文件，已合并到首份',
          originalName: file.originalname
        };
      }
      const leaderPromise = (async () => {
        const r = await processSingleUpload({ file, userId, type, remark, forceReparse });
        return {
          fileId: r.fileId,
          recordId: r.recordId,
          status: r.status,
          ocrQueued: r.ocrQueued !== false,
          isDuplicate: !!r.isDuplicate,
          uploadedAt: r.uploadedAt,
          message: r.message,
          originalName: file.originalname
        };
      })();
      batchHashLeaders.set(hash, leaderPromise);
      return leaderPromise;
    };

    // PRD-2026Q4 followup（B5）：用 BATCH_UPLOAD_CONCURRENCY 上限替代无界并发。
    // 旧行为：`Promise.allSettled(files.map(processOne))` —— 9 份 ⇒ 9 路并发 COS 上传，
    //         内存峰值 + 文件句柄 + libuv 线程池都吃紧。
    // 新行为：池化跑（默认 3 路），返回形状仍是 PromiseSettledResult[]，下游 .map 不动。
    const settled = await runWithConcurrency(files, BATCH_UPLOAD_CONCURRENCY, processOne);
    const records = settled.map((res, idx) => {
      const file = files[idx];
      if (res.status === 'fulfilled') return res.value;
      const err = res.reason || {};
      logger.error('批量上传单文件失败', {
        userId,
        originalName: file && file.originalname,
        error: err.message
      });
      return {
        fileId: null,
        recordId: null,
        status: 'error',
        ocrQueued: false,
        isDuplicate: false,
        uploadedAt: null,
        message: err.message || '该文件上传失败',
        originalName: file && file.originalname
      };
    });

    const fileIds = records.map((r) => r.fileId).filter(Boolean);
    const successCount = records.filter((r) => r.fileId && r.status !== 'error').length;
    const summary = `${successCount}/${records.length} 份文件已入队解析`;

    // Plan §Phase 3.4：批量响应里附带队列深度，让客户端 step 2 显示"前面还有 N 份"。
    // 这次入队的本批 N 份会算在 active/waiting 里，所以 total 表示「含本批，整队当前总长」；
    // 客户端展示时减掉 successCount 才是"我前面还有几份"。
    const queueDepth = await safeGetQueueDepth();

    res.json(success({
      fileIds,
      records,
      total: records.length,
      successCount,
      queueDepth
    }, summary));
  } catch (err) {
    next(err);
  } finally {
    // PRD-2026Q4 followup（legacy multipart 内存安全）：批量入口的 disk-storage 临时文件
    // 也必须清掉 —— 9 份 × 30MB 不清就是每个失败请求往临时目录灌 ~270MB。
    await cleanupMultipartTmpFiles(req.files);
  }
};

// Plan §Phase 2.1 ★：客户端直传 COS —— 用户最痛点的解药。
// 全链路两步：
//   1) GET  /medical/upload-sts        →  handleStsIssue：拿 STS + N 个预生成 fileKey
//   2) POST /medical/upload-finalize   →  handleFinalize：客户端 PUT 完成后，逐文件确认并入队
// 与原 multipart 上传（handleUpload / handleUploadBatch）双轨并存，老客户端走老路。
const FILE_KEY_PREFIX = (userId) => `uploads/${userId}/`;
const MD5_HEX = /^[a-f0-9]{32}$/i;

const handleStsIssue = async (req, res, next) => {
  try {
    const userId = req.userId;
    if (!userId) {
      throw new BusinessError('未登录', 401);
    }

    const q = req.query || {};
    // count 默认 1；非整数 / ≤0 一律 400；超过批量上限给明确错误
    let count = 1;
    if (q.count !== undefined && q.count !== null && q.count !== '') {
      const raw = `${q.count}`.trim();
      const parsed = parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0 || `${parsed}` !== raw) {
        throw new BusinessError('count 必须是正整数', 400);
      }
      count = parsed;
    }
    if (count > BATCH_UPLOAD_MAX) {
      throw new BusinessError(`一次最多 ${BATCH_UPLOAD_MAX} 个 fileKey，请分批申请`, 400);
    }

    const originalNames = `${q.originalNames || ''}`.split(',').map((s) => s.trim());
    const types = `${q.types || ''}`.split(',').map((s) => s.trim());
    const fileSpecs = [];
    for (let i = 0; i < count; i += 1) {
      fileSpecs.push({
        originalName: originalNames[i] || `file_${i + 1}.bin`,
        mimeType: types[i] && types[i].length > 0 ? types[i] : null
      });
    }

    const info = await ossService.getDirectUploadInfo(userId, fileSpecs);
    res.json(success(info, '已下发 STS'));
  } catch (err) {
    next(err);
  }
};

const buildErrorEntry = (originalName, message) => ({
  fileId: null,
  recordId: null,
  status: 'error',
  ocrQueued: false,
  isDuplicate: false,
  uploadedAt: null,
  message,
  originalName: originalName || null
});

const handleFinalize = async (req, res, next) => {
  try {
    const userId = req.userId;
    if (!userId) {
      throw new BusinessError('未登录', 401);
    }

    const files = Array.isArray(req.body && req.body.files) ? req.body.files : [];
    if (files.length === 0) {
      throw new BusinessError('files 不能为空', 400);
    }
    if (files.length > BATCH_UPLOAD_MAX) {
      throw new BusinessError(`一次最多 finalize ${BATCH_UPLOAD_MAX} 份文件`, 400);
    }

    const prefix = FILE_KEY_PREFIX(userId);
    const records = [];
    // batchHashCache —— 单批次内同 hash 复用首条 record，避免 create 重复
    const batchHashCache = new Map();

    for (const f of files) {
      const fileKey = `${(f && f.fileKey) || ''}`.trim();
      const fileHash = `${(f && f.fileHash) || ''}`.trim();
      const declaredSize = Number((f && f.size) || 0);
      const mimeType = (f && f.mimeType) || null;
      const originalName = (f && f.originalName) || null;
      const remark = (f && f.remark) || null;
      const type = (f && f.type) || '其他';

      // 1) 资源域强校验：fileKey 必须落在 uploads/${userId}/ 下，防越权
      if (!fileKey.startsWith(prefix)) {
        records.push(buildErrorEntry(originalName, `fileKey 必须以 ${prefix} 开头`));
        continue;
      }

      // 2) fileHash 必须是 32 位 md5 hex —— 客户端流式 md5 算出来的就该是这格式
      if (!MD5_HEX.test(fileHash)) {
        records.push(buildErrorEntry(originalName, 'fileHash 必须是 32 位十六进制 md5'));
        continue;
      }

      // 3) headObject 二次验证 COS 上确实有这个对象，且 size 一致
      let head;
      try {
        head = await ossService.headObject(fileKey);
      } catch (e) {
        logger.warn('[finalize] headObject 异常', { fileKey, error: e.message });
        records.push(buildErrorEntry(originalName, 'COS 元信息获取异常，请稍后重试'));
        continue;
      }
      if (!head || !head.exists) {
        records.push(buildErrorEntry(originalName, 'COS 上未找到该对象，请重新上传'));
        continue;
      }
      if (declaredSize > 0 && head.size > 0 && head.size !== declaredSize) {
        records.push(buildErrorEntry(originalName, `size 不一致：声明 ${declaredSize}，实际 ${head.size}`));
        continue;
      }

      // 4) 同批内 dedup —— 命中则不再走 DB / queue
      const cachedInBatch = batchHashCache.get(fileHash);
      if (cachedInBatch) {
        records.push({
          ...cachedInBatch,
          isDuplicate: true,
          message: '同一批内重复文件，已合并到首份',
          originalName
        });
        continue;
      }

      // 5) 跨请求 dedup（与 processSingleUpload 一致：软删的不算重复）
      let entry;
      try {
        const existing = await MedicalRecord.findOne({
          where: { user_id: userId, file_hash: fileHash, deleted_at: null }
        });

        if (existing && hasMeaningfulExtraction(existing)) {
          entry = {
            fileId: existing.id,
            recordId: existing.id,
            status: existing.status || 'completed',
            ocrQueued: false,
            isDuplicate: true,
            uploadedAt: existing.created_at,
            message: '该文件已存在，直接返回已有记录',
            originalName
          };
        } else if (existing) {
          // 命中但无结果 → 触发 reparse（沿用 processSingleUpload 的语义）
          await existing.update({
            status: 'pending',
            diagnosis: null,
            stage: null,
            gene_mutation: null,
            treatment: null,
            structured: null
          });
          const imageUrl = await ossService.getInternalUrl(existing.file_key);
          // Wave 3 §1：批量 reparse 也先试 cache（跨用户同 hash 直接复用）。
          const reparseCacheHit = await safeTryHydrateOcrFromCache(existing.id, fileHash, userId);
          if (reparseCacheHit) {
            entry = {
              fileId: existing.id,
              recordId: existing.id,
              status: 'completed',
              ocrQueued: false,
              isDuplicate: true,
              reparseTriggered: false,
              uploadedAt: existing.created_at,
              cacheHit: true,
              message: '检测到同文件已被识别，已直接复用结果',
              originalName
            };
            batchHashCache.set(fileHash, entry);
            records.push(entry);
            continue;
          }
          let reparseQueued = true;
          try {
            await queueService.addOCRTask(existing.id, imageUrl, userId, {
              mimeType,
              fileKey: existing.file_key,
              fileHash
            });
          } catch (qerr) {
            reparseQueued = false;
            logger.warn('[finalize] reparse 入队失败', { recordId: existing.id, error: qerr.message });
            try {
              await existing.update({
                status: 'error',
                structured: { error: 'OCR队列暂不可用，请稍后重试或手动录入关键信息' }
              });
            } catch (statusErr) {
              logger.error('[finalize] 回写 record.status=error 失败', { recordId: existing.id, error: statusErr.message });
            }
          }
          entry = {
            fileId: existing.id,
            recordId: existing.id,
            status: 'pending',
            ocrQueued: reparseQueued,
            isDuplicate: true,
            reparseTriggered: true,
            uploadedAt: existing.created_at,
            message: reparseQueued ? '检测到历史识别结果缺失，已自动重新解析' : '上传成功，解析服务暂时繁忙，将自动重试',
            originalName
          };
        } else {
          // 全新：建 record + 入队
          const record = await MedicalRecord.create({
            user_id: userId,
            type,
            file_key: fileKey,
            file_hash: fileHash,
            file_size: declaredSize,
            status: 'pending',
            remark
          });
          const imageUrl = await ossService.getInternalUrl(fileKey);
          // Wave 3 §1：批量新 record 入队前也先试 cache。
          const newCacheHit = await safeTryHydrateOcrFromCache(record.id, fileHash, userId);
          if (newCacheHit) {
            entry = {
              fileId: record.id,
              recordId: record.id,
              status: 'completed',
              ocrQueued: false,
              isDuplicate: false,
              cacheHit: true,
              uploadedAt: record.created_at,
              message: '上传成功，已复用历史识别结果',
              originalName
            };
            batchHashCache.set(fileHash, entry);
            records.push(entry);
            continue;
          }
          let ocrQueued = true;
          try {
            await queueService.addOCRTask(record.id, imageUrl, userId, {
              mimeType,
              fileKey,
              fileHash
            });
          } catch (qerr) {
            ocrQueued = false;
            logger.warn('[finalize] 入队失败', { recordId: record.id, error: qerr.message });
            try {
              await record.update({
                status: 'error',
                structured: { error: 'OCR队列暂不可用，请稍后重试或手动录入关键信息' }
              });
            } catch (statusErr) {
              logger.error('[finalize] 回写 record.status=error 失败', { recordId: record.id, error: statusErr.message });
            }
          }
          entry = {
            fileId: record.id,
            recordId: record.id,
            status: 'pending',
            ocrQueued,
            isDuplicate: false,
            uploadedAt: record.created_at,
            message: ocrQueued ? '上传成功，正在解析中' : '上传成功，解析服务暂时繁忙，将自动重试',
            originalName
          };
        }
      } catch (perFileErr) {
        logger.error('[finalize] 单文件处理失败', { fileKey, error: perFileErr.message });
        records.push(buildErrorEntry(originalName, perFileErr.message || '处理失败'));
        continue;
      }

      batchHashCache.set(fileHash, entry);
      records.push(entry);
    }

    const fileIds = records.map((r) => r.fileId).filter(Boolean);
    const successCount = records.filter((r) => r.fileId && r.status !== 'error').length;
    // 与 handleUploadBatch 保持一致：附带队列深度，客户端展示"前面还有 N 份"
    // 队列深度获取是 best-effort 装饰 —— Bull 不可用 / mock 缺失都不能拖死 finalize。
    const queueDepth = await safeGetQueueDepth();
    res.json(success({
      fileIds,
      records,
      total: records.length,
      successCount,
      queueDepth
    }, `${successCount}/${records.length} 份文件已 finalize`));
  } catch (err) {
    next(err);
  }
};

// queueService.getQueueDepth 是后增的装饰指标 —— 老版本 / 测试桩可能没注册。
// 用本 helper 包一层，保证调用方拿到 null 而不是抛错。
const safeGetQueueDepth = async () => {
  if (typeof queueService.getQueueDepth !== 'function') {
    return null;
  }
  try {
    return await queueService.getQueueDepth();
  } catch (e) {
    return null;
  }
};

// Wave 3 §1：upload-time cache hydrate 的安全包装。同 safeGetQueueDepth：
// 测试桩 / 旧版本 queueService 可能没注册 tryHydrateOcrFromCache，
// 用 typeof 兜底，绝不让缺方法 throw 把上传链路炸掉。
const safeTryHydrateOcrFromCache = async (recordId, fileHash, userId) => {
  if (typeof queueService.tryHydrateOcrFromCache !== 'function') return false;
  try {
    return await queueService.tryHydrateOcrFromCache(recordId, fileHash, userId);
  } catch (e) {
    logger.warn('upload-time cache hydrate 异常（继续 enqueue）', {
      recordId, error: e && e.message
    });
    return false;
  }
};

/**
 * Phase E.2：把单条 record 折成 parse-status 响应。
 * 给 getParseStatus（单）和 getParseStatusBatch（批）共享。
 */
const buildParseStatusEntry = (record) => {
  const mappedStatus = mapParseStatus(record.status, record.status_phase);
  const entry = {
    fileId: record.id,
    recordId: record.id,
    status: mappedStatus.status,
    progress: mappedStatus.progress,
    // Phase 1.3：透传细分阶段，让客户端 STATUS_TEXT_MAP 在 status='analyzing' 内挑
    // streaming 文案；缺失明示为 null，前端永远不漏字段。
    statusPhase: record.status_phase || null,
    result: null,
    createdAt: record.created_at,
    updatedAt: record.updated_at
  };
  if (record.status === 'completed' && record.structured) {
    const structured = normalizeStructured(record.structured);
    const entities = normalizeEntities(structured.entities);
    const rawText = firstNonEmpty(structured.text, entities.rawText);
    const confidence = firstNonEmpty(structured.confidence, entities.confidence, 0.9);
    entry.result = {
      ...entities,
      id: record.id,
      recordId: record.id,
      diagnosis: firstNonEmpty(entities.diagnosis, record.diagnosis),
      stage: firstNonEmpty(entities.stage, record.stage),
      geneMutation: firstNonEmpty(entities.geneMutation, entities.gene_mutation, record.gene_mutation),
      treatment: firstNonEmpty(entities.treatment, record.treatment),
      treatmentLine: firstNonEmpty(entities.treatmentLine, record.treatment_line),
      pdl1: firstNonEmpty(entities.pdl1, record.pdl1),
      confidence: typeof confidence === 'number' ? confidence : Number(confidence) || 0.9,
      rawText: typeof rawText === 'string' ? rawText.substring(0, 500) : rawText
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

    // PRD-2026Q4 followup（"补全数据丢失"根因修复）：
    //   客户端 (pages/upload, pages/manualEntry) 历来传 **扁平** parsedData
    //   —— 41 个字段全在 body 顶层，没有 body.entities 包装。
    //   旧版只硬编码读 diagnosis/stage/geneMutation/treatment 4 个 key，
    //   其余 37 个（age/ecog/pathologyType/targetLesion/pdL1Status/lab values/...）
    //   全部静默丢弃，导致用户「填了 → toast 已保存 → 病历详情里却没了」。
    //   修法：除已知 meta key（entities / structured / unknownFields / id 之类）
    //   外，body 顶层所有 key 都视为 entity 补全；优先级在 nested 之上。
    const ENRICH_META_KEYS = new Set([
      'entities',
      'structured',
      'unknownFields',
      'id',
      'recordId',
      'fileId'
    ]);
    const bodyFlatEntities = {};
    for (const [key, value] of Object.entries(body)) {
      if (ENRICH_META_KEYS.has(key) || value === undefined) {
        continue;
      }
      bodyFlatEntities[key] = value;
    }
    // gene_mutation → geneMutation alias 保持与旧行为一致（schema 用 geneMutation 而 server 列名是 gene_mutation）。
    if (bodyFlatEntities.gene_mutation !== undefined && bodyFlatEntities.geneMutation === undefined) {
      bodyFlatEntities.geneMutation = bodyFlatEntities.gene_mutation;
    }

    const patchEntities = {
      ...bodyStructuredEntities,
      ...bodyEntities,
      ...bodyFlatEntities
    };

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
    // Plan §Phase 3.1：?abort=1 走"取消进行中的解析"分支；不带或非"1" 走原 softDelete。
    const abortFlag = req.query && `${req.query.abort || ''}` === '1';

    const record = await MedicalRecord.findOne({
      where: { id, user_id: req.userId, deleted_at: null }
    });

    if (!record) {
      return res.fail('记录不存在', 404);
    }

    if (abortFlag) {
      // completed → 已花了 LLM 钱，不允许再"取消"
      if (record.status === 'completed') {
        return res.fail('解析已完成，无法取消', 409);
      }
      // pending / queued / running / error 视情况标 cancelled_at；
      // pending / error / queued 同时软删（用户没看到结果）；
      // running：保留 record（OCR worker 阶段切换前会读 cancelled_at 自检），
      //          不软删 → 客户端追溯"为什么我看到中途消失"
      const now = new Date();
      const isInflight = record.status === 'running';
      const patch = isInflight
        ? { cancelled_at: now }
        : { cancelled_at: now, deleted_at: now };

      await record.update(patch);

      // 通知正在订阅 SSE 的客户端：跳出循环，立即收 close 帧
      try {
        const recordEvents = require('../services/recordEvents');
        await recordEvents.publishRecordEvent(record.id, {
          status: 'cancelled',
          cancelledAt: now.toISOString()
        });
      } catch (publishErr) {
        logger.warn('publishRecordEvent 抛错（取消主路径不阻塞）', {
          recordId: record.id,
          error: publishErr && publishErr.message
        });
      }

      logger.info('病历解析取消:', {
        recordId: id, userId: req.userId, prevStatus: record.status, isInflight
      });
      return res.ok({
        id: record.id,
        cancelled: true,
        cancelledAt: now.toISOString(),
        deletedAt: isInflight ? null : now.toISOString()
      });
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

/**
 * PRD-2026Q3 T1-3：多病历 active 切换。
 * 一个用户全局只有一份 is_active=true。事务里先把当前 active 重置为 0，
 * 再把目标置 1，避免出现"两份都 active / 切换中竞态"的窗口。
 */
const activateRecord = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const { MedicalRecord, sequelize } = require('../models');

    const result = await sequelize.transaction(async (t) => {
      const rec = await MedicalRecord.findOne({
        where: { id, user_id: userId, deleted_at: null },
        lock: t.LOCK ? t.LOCK.UPDATE : 'UPDATE',
        transaction: t
      });
      if (!rec) return { notFound: true };
      if (rec.is_active === true) {
        return { id: rec.id, isActive: true, noop: true };
      }
      await MedicalRecord.update(
        { is_active: false },
        { where: { user_id: userId, is_active: true }, transaction: t }
      );
      await rec.update({ is_active: true }, { transaction: t });
      return { id: rec.id, isActive: true, noop: false };
    });

    if (result && result.notFound) {
      if (typeof res.fail === 'function') return res.fail('记录不存在', 404);
      return res.status(404).json({ code: 404, message: '记录不存在', data: null });
    }
    if (typeof res.ok === 'function') return res.ok(result);
    return res.json(success(result, '已切换 active 病历'));
  } catch (err) {
    next(err);
  }
};

/**
 * Plan §Phase 2.3 + PRD-2026Q4 streaming OCR：SSE 解析状态推送主路径。
 *
 *   GET /medical/parse-status-stream?recordIds=a,b,c
 *
 * 设计要点：
 *  - HTTP/1.1 long-lived connection；前置 nginx 需 `X-Accel-Buffering: no` 关闭缓冲。
 *  - 初始 frame：每个 ownership-OK 的 record 推一条 `event: state`，
 *    覆盖"打开 SSE 之前已 completed 的 record"场景，不留下饿死客户端的角落。
 *  - 全部已终态 → 跳过 Redis 订阅，直接 `event: done` + end，省一次 Redis 往返。
 *  - Redis 不可用（subscribeRecordEvents 返回 null）→ 推 `event: noredis` + end，
 *    客户端 10s 内 fallback 现有 /parse-status 轮询；不阻塞 OCR 主流程。
 *  - 终态触发 `finishStream('terminal')`：同步写 done frame + end，
 *    再异步 unsubscribe（unsubscribe 慢/抛错都不影响客户端感知）。
 *  - `req.on('close')` 兜底 unsubscribe，防 zombie 订阅占 Redis 内存。
 *
 * Frame 格式：`event: <name>\ndata: <json>\n\n`
 *   - event: state    {fileId, recordId, status, statusPhase, progress, result, partial,
 *                      fieldGroup, fields, rawText, errorMsg, ts}
 *   - event: done     {reason: 'all_terminal'|'terminal'|'closed'}
 *   - event: noredis  {reason: 'redis_unavailable'} —— 客户端切回轮询信号
 *
 * PRD-2026Q4 流式 OCR 扩展（向后兼容）：
 *   - 当 worker 通过 publishRecordEventSafe 发出 `statusPhase: 'streaming'` 事件时，
 *     payload 里会附带 `fieldGroup`（basic/diagnosis/treatment/timeline）+ `fields`（本组已就位的字段）
 *     + `progress`（50/65/80/95）。这些字段在 onEvent 里被原样透传给客户端。
 *   - `statusPhase: 'preprocess'` / `'ocr_text'` 也可能携带 rawText 文本，前端按需展示原始识别区。
 *   - 老客户端只读 status/progress 字段时不会被破坏（额外字段直接忽略）。
 */
const handleParseStatusStream = async (req, res, next) => {
  try {
    const raw = (req.query && req.query.recordIds) || '';
    let ids = [];
    if (Array.isArray(raw)) {
      ids = raw.map((x) => `${x || ''}`.trim()).filter(Boolean);
    } else if (typeof raw === 'string') {
      ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (!ids.length) {
      throw new BusinessError('缺少 recordIds 参数', 400);
    }
    if (ids.length > 20) {
      throw new BusinessError('一次最多订阅 20 个 recordId', 400);
    }
    if (ids.some((id) => id.length > 64)) {
      throw new BusinessError('recordId 过长（单个 ≤ 64 字符）', 400);
    }

    const { Op } = require('sequelize');
    const records = await MedicalRecord.findAll({
      where: {
        id: { [Op.in]: ids },
        user_id: req.userId,
        deleted_at: null
      }
    });

    if (!records || !records.length) {
      throw new BusinessError('记录不存在或不属于本人', 404);
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const writeFrame = (event, data) => {
      if (res.writableEnded) return;
      try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch (e) {
        // socket 已断 / pipe 已关：忽略，下一次 close 事件会清理
      }
    };

    // PRD-2026Q4 followup（B4）：SSE 心跳兜底。
    // 背景：OCR 长任务 90-180s 内可能没有 stage 事件（视觉调用本身是单次 HTTP），
    // nginx 默认 `proxy_read_timeout 60s` 会把空闲 SSE 连接砍掉 → 客户端永远收不到 done。
    // 用 SSE 注释帧 `:keepalive\n\n` 每 20s 戳一下：浏览器/小程序自动丢弃注释行，不污染 onmessage；
    // 但 TCP 层会被识别为活跃，nginx/中间代理就不会断开。
    const HEARTBEAT_INTERVAL_MS = Math.max(
      5000,
      parseInt(process.env.SSE_HEARTBEAT_INTERVAL_MS || '20000', 10)
    );
    const heartbeatTimer = setInterval(() => {
      if (res.writableEnded) return;
      try { res.write(':keepalive\n\n'); } catch (_e) { /* socket 已断，下一次 close 兜底 */ }
    }, HEARTBEAT_INTERVAL_MS);
    // setInterval 单独不会阻塞 process exit（res.end 触发 close 后我们会 clearInterval），
    // 但保险起见 unref 一下 —— SSE handler 是 per-request 生命周期，进程退出时它不该撑住事件循环。
    if (typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref();

    const TERMINAL = new Set(['completed', 'error', 'cancelled']);

    const ownedIds = records.map((r) => String(r.id));
    let allTerminal = true;
    for (const r of records) {
      const entry = buildParseStatusEntry(r);
      writeFrame('state', entry);
      if (!TERMINAL.has(entry.status)) allTerminal = false;
    }

    if (allTerminal) {
      writeFrame('done', { reason: 'all_terminal' });
      clearInterval(heartbeatTimer);
      try { res.end(); } catch (e) { /* noop */ }
      return;
    }

    let unsubscribe = null;
    let ended = false;

    const finishStream = (reason) => {
      if (ended) return;
      ended = true;
      clearInterval(heartbeatTimer);
      writeFrame('done', { reason });
      try { res.end(); } catch (e) { /* noop */ }
      // 异步触发 unsubscribe；mock 与真实实现都返回 Promise，
      // 这里用 Promise.resolve 兼容 sync/async 两种返回类型，错误吞掉。
      if (typeof unsubscribe === 'function') {
        try { Promise.resolve(unsubscribe()).catch(() => {}); }
        catch (e) { /* noop */ }
      }
    };

    const ownedSet = new Set(ownedIds);
    const onEvent = (payload) => {
      if (ended || !payload || !payload.recordId) return;
      const rid = String(payload.recordId);
      if (!ownedSet.has(rid)) return;
      const status = payload.status || 'unknown';
      // PRD-2026Q4 流式 OCR：额外透传 statusPhase / fieldGroup / fields / rawText 给前端。
      // 这些字段仅在 worker 进入 streaming 阶段时被 publishRecordEventSafe 注入；
      // 老 worker 只发 status/progress/result —— 这里全部用 `?? null` 与"only if defined"
      // 防御性策略，避免历史数据被 undefined 污染。
      const frame = {
        fileId: rid,
        recordId: rid,
        status,
        progress: typeof payload.progress === 'number' ? payload.progress : null,
        result: payload.result || null,
        partial: payload.partial || null,
        errorMsg: payload.errorMsg || null,
        cancelledAt: payload.cancelledAt || null,
        ts: payload.ts || Date.now()
      };
      if (payload.statusPhase) frame.statusPhase = payload.statusPhase;
      if (payload.fieldGroup) frame.fieldGroup = payload.fieldGroup;
      if (payload.fields && typeof payload.fields === 'object') frame.fields = payload.fields;
      if (typeof payload.rawText === 'string' && payload.rawText.length) frame.rawText = payload.rawText;
      if (payload.message) frame.message = payload.message;
      if (payload.providerWait) frame.providerWait = payload.providerWait;
      writeFrame('state', frame);
      if (TERMINAL.has(status)) finishStream('terminal');
    };

    const recordEvents = require('../services/recordEvents');
    unsubscribe = await recordEvents.subscribeRecordEvents(ownedIds, onEvent);

    if (!unsubscribe) {
      writeFrame('noredis', { reason: 'redis_unavailable' });
      clearInterval(heartbeatTimer);
      try { res.end(); } catch (e) { /* noop */ }
      return;
    }

    // 客户端断开 → 立即清理（防 zombie 订阅 + 防心跳 timer 泄漏）
    req.on('close', () => {
      if (ended) return;
      ended = true;
      clearInterval(heartbeatTimer);
      if (typeof unsubscribe === 'function') {
        try { Promise.resolve(unsubscribe()).catch(() => {}); }
        catch (e) { /* noop */ }
      }
      try { res.end(); } catch (e) { /* noop */ }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  uploadMiddleware,
  uploadMiddlewareBatch,
  handleUpload,
  handleUploadBatch,
  // Plan §Phase 2.1：客户端直传 COS 双 endpoint
  handleStsIssue,
  handleFinalize,
  getParseStatus,
  getParseStatusBatch,
  // Plan §Phase 2.3：SSE 解析状态推送（PRD-2026Q4 流式 OCR 复用这条 pipe）
  handleParseStatusStream,
  getTimeline,
  getRecords,
  getRecordDetail,
  enrichRecord,
  downloadRecordFile,
  deleteRecord,
  softDeleteRecord,
  activateRecord,
  // Plan §Phase 1.3 测试钩子（仅供 tests/medicalParseStatus.test.js 直查纯函数）
  __mapParseStatus: mapParseStatus,
  __buildParseStatusEntry: buildParseStatusEntry,
  // PRD-2026Q4 followup（B5）：暴露给 streamingResilienceContract.test.js 锁住并发池行为，
  // 不让未来重构悄悄退化回 `Promise.allSettled(files.map(...))`。
  __runWithConcurrency: runWithConcurrency,
  __BATCH_UPLOAD_CONCURRENCY: BATCH_UPLOAD_CONCURRENCY
};
