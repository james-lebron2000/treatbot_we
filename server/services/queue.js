const Queue = require('bull');
const logger = require('../utils/logger');
const { processMedicalImage } = require('./ocr');
const { MedicalRecord } = require('../models');

// Redis 连接配置
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined
};

// 创建队列
const ocrQueue = new Queue('ocr processing', { redis: redisConfig });
const notificationQueue = new Queue('notifications', { redis: redisConfig });

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
ocrQueue.process(async (job) => {
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
      throw new Error('OCR未识别到有效文本');
    }
    
    // 更新数据库
    await MedicalRecord.update({
      status: 'completed',
      diagnosis: result.entities.diagnosis,
      stage: result.entities.stage,
      gene_mutation: result.entities.geneMutation,
      treatment: result.entities.treatment,
      structured: {
        text: result.text,
        entities: result.entities,
        confidence: result.confidence,
        detections: result.detections
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
  const job = await ocrQueue.add({
    recordId,
    imageUrl,
    userId,
    mimeType: options.mimeType || null,
    fileKey: options.fileKey || null
  }, {
    attempts: 3,  // 重试3次
    backoff: {
      type: 'exponential',
      delay: 5000  // 首次重试延迟5秒
    },
    removeOnComplete: 10,  // 保留最近10个已完成任务
    removeOnFail: 5        // 保留最近5个失败任务
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

ocrQueue.on('failed', (job, err) => {
  logger.error('任务失败:', { jobId: job.id, error: err.message });
});

module.exports = {
  ocrQueue,
  notificationQueue,
  addOCRTask,
  getJobStatus
};
