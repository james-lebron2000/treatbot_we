const Queue = require('bull');
const logger = require('../utils/logger');
const { processMedicalImage } = require('./ocr');
const { MedicalRecord, OcrJobFailure } = require('../models');
// Q3-红线 §A.3：Sentry 软依赖（DSN 未配置时退化为 noop）
let _sentry = null;
try {
  _sentry = require('../observability/sentry');
} catch (e) {
  _sentry = null;
}
const captureException = (_sentry && _sentry.captureException)
  ? _sentry.captureException
  : () => {};

// PRD-2026Q2 §3.2：OCR DLQ 调度参数
// - 共 5 次尝试（含首次），指数退避 delay=8s，但 Bull 原生没有 maxDelay，
//   因此 attempts * delay 的指数段若超过 90s 就会把后续延迟手动封顶。
const OCR_JOB_ATTEMPTS = 5;
const OCR_JOB_BACKOFF_DELAY = 8000;
const OCR_JOB_BACKOFF_MAX = 90000;
const OCR_QUEUE_CONCURRENCY = Math.max(1, parseInt(process.env.OCR_QUEUE_CONCURRENCY || '2', 10));

// Redis 连接配置
//
// 修复方案 Track 4.1：撞 Redis 不可用时立即抛错，不要让 ioredis 内部一直 reconnect。
// 生产观察到的故障模式：Redis 容器没起来 → Bull 的 `ocrQueue.add()` 卡住 → handleUpload
// 等 30s+ 把客户端 wx.uploadFile 拖到超时 → 客户端报 statusCode:0 → 文案「网络有点卡」。
// 加这三条配置后，撞 Redis 不可用时 add() 在 ~3s 内即抛错，addOCRTask 走进程内兜底。
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 1,        // 单条 Redis 命令最多重试 1 次
  connectTimeout: 3000,           // 初次连接 Redis 必须 3 秒内成功
  enableOfflineQueue: false       // Redis 离线时不缓冲命令，让 add() 立即报错而非堆积
};

// 创建队列
const ocrQueue = new Queue('ocr processing', { redis: redisConfig });
const notificationQueue = new Queue('notifications', { redis: redisConfig });

// PRD-2026Q2 §3.2：自定义指数退避策略，带 90s 封顶
// Bull 通过 settings.backoffStrategies 支持命名策略，在 job options 中用
// `backoff: { type: 'ocrExponential', delay: OCR_JOB_BACKOFF_DELAY }` 引用。
ocrQueue.setMaxListeners(50);
try {
  ocrQueue.settings = ocrQueue.settings || {};
  ocrQueue.settings.backoffStrategies = Object.assign({}, ocrQueue.settings.backoffStrategies, {
    ocrExponential: (attemptsMade) => {
      const raw = OCR_JOB_BACKOFF_DELAY * Math.pow(2, Math.max(0, attemptsMade - 1));
      return Math.min(raw, OCR_JOB_BACKOFF_MAX);
    }
  });
} catch (e) {
  // 测试环境 mock 的 Queue 实现可能不带 settings，忽略即可。
  logger.debug?.('queue: 无法注册 ocrExponential 策略（可能在测试 mock 下）');
}

ocrQueue.on('error', (err) => {
  logger.error('OCR队列连接错误:', { error: err.message });
});
notificationQueue.on('error', (err) => {
  logger.error('通知队列连接错误:', { error: err.message });
});

const hasMeaningfulOcrResult = (result = {}) => {
  const text = `${result.text || ''}`.trim();
  const entities = result.entities || {};
  return Boolean(
    text ||
    `${entities.diagnosis || ''}`.trim() ||
    `${entities.stage || ''}`.trim() ||
    `${entities.geneMutation || ''}`.trim() ||
    `${entities.treatment || ''}`.trim()
  );
};

/**
 * 修复方案 Track 4.1：抽出 OCR 任务主体，让 Bull processor 与进程内兜底共用同一段逻辑。
 *   - Bull processor → runOcrTask(job.data) （Redis 可用时走队列，享受重试 + 并发）
 *   - 进程内兜底 → setImmediate(runOcrTask(...)) （Redis 挂掉时不阻塞 HTTP 请求）
 * 共享语义：
 *   - 入口先 update status=running
 *   - 调 processMedicalImage 拿 OCR 结果
 *   - 空结果显式 throw（带 provider + 字数）让 catch 写 status=error
 *   - 成功 → update 全部结构化字段 + ocrMeta，再发完成通知
 *   - 任何失败 → update status=error + structured.error
 */
const runOcrTask = async (data, opts = {}) => {
  const { recordId, imageUrl, mimeType, fileKey, userId } = data;
  const { jobId } = opts;
  logger.info('开始OCR处理:', { recordId, jobId: jobId || 'inproc' });

  try {
    await MedicalRecord.update(
      { status: 'running' },
      { where: { id: recordId } }
    );

    const result = await processMedicalImage({
      sourceUrl: imageUrl,
      mimeType,
      fileKey
    });

    if (!hasMeaningfulOcrResult(result)) {
      // 修复方案 Track 2.2：错误信息带 provider + text.length，写到 structured.error
      // 让客户端模态/手填路径能展示真实失败原因（比如 "markitdown+rule" 表示已经走到最末端正则兜底）。
      const provider = (result && result.provider) || 'unknown';
      const textLen = `${(result && result.text) || ''}`.length;
      throw new Error(`OCR未识别到有效文本（provider=${provider}, text=${textLen}字）`);
    }

    await MedicalRecord.update({
      status: 'completed',
      diagnosis: result.entities.diagnosis,
      stage: result.entities.stage,
      gene_mutation: result.entities.geneMutation,
      treatment: result.entities.treatment,
      treatment_line: result.entities.treatmentLine || null,
      pdl1: result.entities.pdl1 || null,
      structured: {
        text: result.text,
        entities: result.entities,
        confidence: result.confidence,
        detections: result.detections,
        ocrMeta: {
          provider: result.provider || 'unknown',
          pageCount: result.pageCount || null,
          completedAt: new Date().toISOString()
        }
      }
    }, {
      where: { id: recordId }
    });

    // 完成通知（best-effort：通知队列也要 Redis，挂掉不影响主流程）
    if (userId) {
      try {
        await Promise.race([
          notificationQueue.add({ type: 'ocr_completed', recordId, userId }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('notify_add_timeout_2s')), 2000)
          )
        ]);
      } catch (notifyErr) {
        logger.warn('完成通知入队失败（忽略，不影响 OCR 结果）', {
          recordId,
          error: notifyErr.message
        });
      }
    }

    logger.info('OCR处理完成:', { recordId });
    return { success: true, recordId };
  } catch (error) {
    logger.error('OCR处理失败:', { recordId, error: error.message });
    // Q3-红线 §A.3：上报到 Sentry（DSN 未配置时静默 noop）
    captureException(error, {
      tags: { component: 'ocr_queue', stage: 'process' },
      extra: { recordId, jobId: jobId || 'inproc' }
    });

    // 失败状态回写也用 try/catch，避免再次抛异常吃掉原始错误
    try {
      await MedicalRecord.update({
        status: 'error',
        structured: { error: error.message }
      }, {
        where: { id: recordId }
      });
    } catch (dbErr) {
      logger.error('OCR 失败状态回写失败:', { recordId, error: dbErr.message });
    }

    throw error;
  }
};

/**
 * OCR 任务处理器（Bull 路径）
 */
ocrQueue.process(OCR_QUEUE_CONCURRENCY, async (job) => {
  // 兼容旧 progress 接口
  try { await job.progress(50); } catch (_e) { /* progress 失败可忽略 */ }
  return runOcrTask(job.data, { jobId: job.id });
});

/**
 * 通知任务处理器
 */
notificationQueue.process(async (job) => {
  const { type, recordId, userId } = job.data;
  
  logger.info('发送通知:', { type, recordId, userId });
  
  // TODO: 接入微信订阅消息或短信通知
  
  return { success: true };
});

/**
 * 添加 OCR 任务
 *
 * 修复方案 Track 4.1：双管齐下，撞 Redis 不可用时不让 HTTP 请求挂死：
 *   1) Promise.race + 5s timeout —— 即使 ioredis 配置兜不住，这里也保底兜
 *   2) Bull add 失败 → 进程内 OCR 兜底（fire-and-forget），HTTP 立即 ack，
 *      客户端轮询 parse-status 拿结果（与正常路径一致）。
 * 设计取舍：
 *   - 进程内兜底失去 Bull 的重试 + 多 worker 并发，但单次 OCR 仍可完成，
 *     比让用户看到"网络有点卡"靠谱得多。
 *   - 重试机制由客户端"换一份/重试"按钮承担。
 *   - DLQ 仅对 Bull 路径有效；进程内失败只落 logger.error + structured.error。
 */
const addOCRTask = async (recordId, imageUrl, userId, options = {}) => {
  const taskData = {
    recordId,
    imageUrl,
    userId,
    mimeType: options.mimeType || null,
    fileKey: options.fileKey || null
  };

  try {
    // PRD-2026Q2 §3.2：OCR 队列 DLQ - 5 次尝试 + 带封顶指数退避；
    // 保留失败 job 以便 DLQ handler 能在最终失败时读到 opts.attempts。
    const job = await Promise.race([
      ocrQueue.add(taskData, {
        attempts: OCR_JOB_ATTEMPTS,
        backoff: {
          type: 'ocrExponential',
          delay: OCR_JOB_BACKOFF_DELAY
        },
        removeOnComplete: 10,
        removeOnFail: false
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('bull_add_timeout_5s')), 5000)
      )
    ]);

    logger.info('OCR任务已添加:', { recordId, jobId: job.id });
    return job.id;
  } catch (queueErr) {
    // Bull 入队失败（多半是 Redis 不可达 / connectTimeout 触发 / enableOfflineQueue=false 直接抛）
    // → 进程内兜底，让用户至少能拿到结果。
    logger.warn('Bull 入队失败，转入进程内 OCR 兜底（不阻塞 HTTP 请求）', {
      recordId,
      error: queueErr.message
    });
    setImmediate(() => {
      runOcrTask(taskData).catch((err) => {
        logger.error('进程内 OCR 兜底失败', { recordId, error: err.message });
      });
    });
    return `inproc:${recordId}`;
  }
};

/**
 * 获取任务状态
 */
const getJobStatus = async (jobId) => {
  const job = await ocrQueue.getJob(jobId);
  
  if (!job) {
    return null;
  }
  
  const state = await job.getState();
  const progress = job.progress();
  
  return {
    id: job.id,
    state,
    progress,
    data: job.data,
    returnvalue: job.returnvalue,
    failedReason: job.failedReason
  };
};

// 事件监听
ocrQueue.on('completed', (job, result) => {
  logger.info('任务完成:', { jobId: job.id, result });
});

// PRD-2026Q2 §3.2：DLQ 落库 - 只在 attemptsMade 达到 opts.attempts 时写入，
// 中途 transient 失败只记日志不写表，避免污染 DLQ。
const classifyError = (err = {}) => {
  const msg = `${err.message || err}`.toLowerCase();
  if (msg.includes('timeout')) return 'timeout';
  if (msg.includes('未识别') || msg.includes('ocr')) return 'ocr_empty';
  if (msg.includes('network') || msg.includes('econn') || msg.includes('fetch')) return 'network';
  return 'other';
};

const handleOcrJobFailed = async (job, err) => {
  const attemptsMade = job?.attemptsMade || 0;
  const maxAttempts = job?.opts?.attempts || 0;

  logger.error('任务失败:', {
    jobId: job?.id,
    attemptsMade,
    maxAttempts,
    error: err?.message
  });

  // attempts 未耗尽 → 交给 Bull 继续重试，不写 DLQ
  if (!maxAttempts || attemptsMade < maxAttempts) {
    return;
  }

  try {
    await OcrJobFailure.create({
      job_id: String(job.id),
      record_id: job.data?.recordId || '',
      error_type: classifyError(err),
      error_message: err?.message ? err.message.slice(0, 2000) : null,
      payload: job.data || null,
      retried: 0
    });
    logger.warn('OCR 任务进入 DLQ:', { jobId: job.id, recordId: job.data?.recordId });
  } catch (dbErr) {
    logger.error('写入 ocr_job_failures 失败:', { error: dbErr.message, jobId: job?.id });
  }
};

ocrQueue.on('failed', handleOcrJobFailed);

/**
 * PRD-2026Q2 §3.2：手动重试 DLQ 中的任务。
 * 读一条 ocr_job_failures → 用原 payload 重新 add → 更新 retried/last_retried_at。
 * 不删除 DLQ 行，保留审计痕迹；若重试仍失败会再次写一条新的 DLQ 记录。
 */
const retryFailure = async (failureId) => {
  const failure = await OcrJobFailure.findByPk(failureId);
  if (!failure) {
    const err = new Error('failure_not_found');
    err.code = 404;
    throw err;
  }

  const payload = failure.payload || {};
  const job = await ocrQueue.add(payload, {
    attempts: OCR_JOB_ATTEMPTS,
    backoff: { type: 'ocrExponential', delay: OCR_JOB_BACKOFF_DELAY },
    removeOnComplete: 10,
    removeOnFail: false
  });

  await failure.update({
    retried: (failure.retried || 0) + 1,
    last_retried_at: new Date()
  });

  logger.info('DLQ 手动重试已入队:', { failureId, newJobId: job.id });
  return { jobId: job.id, retried: failure.retried + 1 };
};

module.exports = {
  ocrQueue,
  notificationQueue,
  addOCRTask,
  getJobStatus,
  retryFailure,
  __testables: { handleOcrJobFailed, classifyError, OCR_QUEUE_CONCURRENCY }
};
