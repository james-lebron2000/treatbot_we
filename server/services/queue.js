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
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined
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
 * OCR 任务处理器
 */
ocrQueue.process(OCR_QUEUE_CONCURRENCY, async (job) => {
  const { recordId, imageUrl, mimeType, fileKey } = job.data;
  
  logger.info('开始OCR处理:', { recordId, jobId: job.id });
  
  try {
    // 更新状态为处理中
    await MedicalRecord.update(
      { status: 'running' },
      { where: { id: recordId } }
    );
    
    // 发送进度更新（50%）
    await job.progress(50);
    
    // 执行 OCR
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
    
    // 更新数据库
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
    
    // 发送完成通知
    await notificationQueue.add({
      type: 'ocr_completed',
      recordId,
      userId: job.data.userId
    });
    
    logger.info('OCR处理完成:', { recordId });
    
    return { success: true, recordId };
  } catch (error) {
    logger.error('OCR处理失败:', { recordId, error: error.message });
    // Q3-红线 §A.3：上报到 Sentry（DSN 未配置时静默 noop）
    captureException(error, {
      tags: { component: 'ocr_queue', stage: 'process' },
      extra: { recordId, jobId: job?.id }
    });

    // 更新失败状态
    await MedicalRecord.update({
      status: 'error',
      structured: { error: error.message }
    }, {
      where: { id: recordId }
    });

    throw error;
  }
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
 */
const addOCRTask = async (recordId, imageUrl, userId, options = {}) => {
  // PRD-2026Q2 §3.2：OCR 队列 DLQ - 5 次尝试 + 带封顶指数退避；
  // 保留失败 job 以便 DLQ handler 能在最终失败时读到 opts.attempts。
  const job = await ocrQueue.add({
    recordId,
    imageUrl,
    userId,
    mimeType: options.mimeType || null,
    fileKey: options.fileKey || null
  }, {
    attempts: OCR_JOB_ATTEMPTS,
    backoff: {
      type: 'ocrExponential',
      delay: OCR_JOB_BACKOFF_DELAY
    },
    removeOnComplete: 10,
    removeOnFail: false
  });
  
  logger.info('OCR任务已添加:', { recordId, jobId: job.id });
  return job.id;
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
