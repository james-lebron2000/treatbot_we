const Queue = require('bull');
const logger = require('../utils/logger');
const { runStreamingPipeline } = require('./ocrPipeline');
// PRD-2026Q4 流式 OCR：ocrPipeline 仍然以 stage-based 事件回调（preprocess/ocr_text/field_group/...）
// 让 emit 看到的是 { recordId, stage, progress, fieldGroup, fields, rawText } 这种语义清晰的形状；
// 然后 buildEmitAdapter 把它折成 main 的 status-based 形状（statusPhase + fields 附加）发给 SSE。
const { STAGE } = require('../../shared/streaming/events');
const { MedicalRecord, OcrJobFailure } = require('../models');
const metrics = require('../middleware/metrics');
// Plan §Phase 1.2：OCR 结果缓存（按 file_hash + prompt_version）
const ocrCache = require('./ocrCache');
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
const readPositiveIntEnv = (name, fallback) => {
  const value = parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
// Bull 的 timeout 只做 zombie protection。生产真实链路包含 PDF/vision OCR + 二次结构化，
// 8 分钟会在复杂文件上误杀任务；默认放宽到 15 分钟，同时允许运维按环境覆盖。
const OCR_JOB_TIMEOUT_MS = Math.max(60000, readPositiveIntEnv('OCR_JOB_TIMEOUT_MS', 900000));
// Plan §Phase 1.1：默认并发 2 → 4。上游 Doubao/Kimi 配额已确认可放开；token bucket
// （services/llmRateLimiter）兜底，永远不会撞 LLM provider 端的配额上限。
// 仍可通过 OCR_QUEUE_CONCURRENCY 环境变量覆盖（运维灰度回退用）。
const OCR_QUEUE_CONCURRENCY = Math.max(1, parseInt(process.env.OCR_QUEUE_CONCURRENCY || '4', 10));

// Redis 连接配置
//
// 修复方案 Track 4.1：撞 Redis 不可用时立即抛错，不要让 ioredis 内部一直 reconnect。
// 生产观察到的故障模式：Redis 容器没起来 → Bull 的 `ocrQueue.add()` 卡住 → handleUpload
// 等 30s+ 把客户端 wx.uploadFile 拖到超时 → 客户端报 statusCode:0 → 文案「网络有点卡」。
// 加这三条配置后，撞 Redis 不可用时 add() 在 ~3s 内即抛错，addOCRTask 走进程内兜底。
//
// 注意（2026-05-03 hotfix）：早期版本曾设 `enableOfflineQueue: false`，但 Bull v4 worker
// 在 Redis 连接 ready 之前就会发起 BRPOPLPUSH 命令，offlineQueue=false 会触发 unhandled
// rejection → process.exit。改为依赖 maxRetriesPerRequest:1 + connectTimeout:3000
// + addOCRTask 内的 5s Promise.race timeout 三道防线，效果一致但不会让进程崩溃。
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 1,        // 单条 Redis 命令最多重试 1 次
  connectTimeout: 3000            // 初次连接 Redis 必须 3 秒内成功
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
// Plan §Phase 3.1：用户主动取消 sentinel error。catch 块按 code 识别后：
//   - 不写 status='error'
//   - 不上报 Sentry
//   - SSE 推 cancelled 事件
//   - 返回 { success:false, cancelled:true }
class OcrCancelledError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OcrCancelledError';
    this.code = 'OCR_CANCELLED';
  }
}

// 读取最新 record 快照，cancelled_at 非空即抛 OcrCancelledError；
// 同时把快照返回给调用方（避免再发一次 findOne 给 Phase 1.2 cache 查询）。
const assertNotCancelled = async (recordId) => {
  const record = await MedicalRecord.findOne({ where: { id: recordId } });
  if (record && record.cancelled_at) {
    throw new OcrCancelledError('用户已取消解析');
  }
  return record;
};

const publishRecordEventSafe = async (recordId, payload) => {
  try {
    const recordEvents = require('./recordEvents');
    await recordEvents.publishRecordEvent(recordId, payload);
  } catch (e) {
    logger.warn('publishRecordEvent 抛错（忽略）', { recordId, error: e && e.message });
  }
};

/**
 * Wave 3 §1：上传期同步缓存命中 —— 把原本由 worker 拿到任务后才执行的
 * `ocrCache.get -> buildUpdateArgsFromPayload -> publish completed` 一段，
 * 整体提前到 upload controller 拿到 fileHash 之后立即跑一次：
 *   - 命中 → 直接 UPDATE + publish SSE completed + 最佳努力 notify；调用方跳过 addOCRTask；
 *   - 不命中/任何异常 → 返回 false，调用方继续走原 addOCRTask 流程；
 *     in-worker 的同一段缓存查询仍然保留作为 race 兜底（不删，参见 runOcrTask）。
 *
 * 设计要点：
 *   1. 不抛错。任何异常（Redis 不可用、UPDATE 失败、recordEvents 抛错）都 swallow + 返回 false，
 *      绝对不阻塞 upload 关键路径。
 *   2. 不动 notify 时序。fromCache 通知与 worker 命中分支保持同样的 setImmediate + 2s 超时兜底。
 *   3. 不动 status_phase 语义。buildUpdateArgsFromPayload 已经把 status_phase 清空 → 客户端轮询
 *      立刻读到 (completed, 100, fromCache)。
 *
 * 返回值：boolean —— true 表示已经把 record 推到 completed，调用方不需要再 enqueue。
 */
const tryHydrateOcrFromCache = async (recordId, fileHash, userId) => {
  if (!recordId || !fileHash) return false;
  let cached;
  try {
    cached = await ocrCache.get(fileHash);
  } catch (e) {
    logger.warn('tryHydrateOcrFromCache: ocrCache.get 抛错（视作 miss）', {
      recordId, fileHash, error: e && e.message
    });
    return false;
  }
  if (!cached) return false;

  const updateArgs = ocrCache.buildUpdateArgsFromPayload(cached);
  if (!updateArgs) return false;

  try {
    await MedicalRecord.update(updateArgs, { where: { id: recordId } });
  } catch (e) {
    logger.warn('tryHydrateOcrFromCache: MedicalRecord.update 失败（回退到队列）', {
      recordId, fileHash, error: e && e.message
    });
    return false;
  }

  // 主链路已经写完，下面的 SSE / notify 都是 best-effort。
  publishRecordEventSafe(recordId, { status: 'completed', progress: 100, fromCache: true })
    .catch((e) => {
      logger.warn('tryHydrateOcrFromCache: publish completed 失败（忽略）', {
        recordId, error: e && e.message
      });
    });

  if (userId) {
    setImmediate(() => {
      Promise.race([
        notificationQueue.add({ type: 'ocr_completed', recordId, userId, fromCache: true }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('notify_add_timeout_2s')), 2000)
        )
      ]).catch((notifyErr) => {
        logger.warn('完成通知入队失败（upload 期 cache hit）', {
          recordId, error: notifyErr && notifyErr.message
        });
      });
    });
  }

  logger.info('OCR 缓存命中（upload 期同步水合）', { recordId, fileHash });
  return true;
};

const runOcrTask = async (data, opts = {}) => {
  const { recordId, imageUrl, mimeType, fileKey, userId } = data;
  const { jobId } = opts;
  logger.info('开始OCR处理:', { recordId, jobId: jobId || 'inproc' });
  const streamStartTs = Date.now();
  let firstStreamFrameObserved = false;
  let firstFieldObserved = false;
  const observeStreamLatency = (phase) => {
    try {
      if (!metrics.ocrStreamLatency) return;
      metrics.ocrStreamLatency.labels(phase).observe((Date.now() - streamStartTs) / 1000);
    } catch (_e) {
      // metrics must never affect OCR
    }
  };

  // PRD-2026Q4 流式 OCR：把 ocrPipeline 发出的 stage-based 事件折成 main 的 status-based SSE payload。
  // 设计点：
  //  - preprocess（queue.js 入口 worker 起步） → 由 queue.js 自己已经发了 analyzing 阶段事件，pipeline 的
  //    preprocess 与之重叠，直接丢弃（避免连发两条 statusPhase='analyzing'）。
  //  - ocr_text（拿到 rawText） → 折成 { statusPhase:'streaming', progress, rawText }，
  //    让前端立刻能展示原始识别文本面板。
  //  - field_group（每分组凑齐就 emit 一次） → 折成 { statusPhase:'streaming', progress, fieldGroup, fields }，
  //    SSE 帧里 fields 是这一组刚写好的字段，前端可逐组渲染骨架→实体。
  //  - completed / error / received → 全部丢弃，由 queue.js 主循环自己最后发终态（避免重复推 + 顺序漂移）。
  // PRD-2026Q4 followup（B6）：流式 OCR 期间的中段取消闸。
  // 此前只有"OCR 起步前"和"OCR 整体跑完"两个 cancel 闸；中间 60-180s 的视觉调用 + 流式
  // 结构化期间用户点取消，要等整段跑完才被识别 —— 用户体感"卡死"，且白烧 LLM 费用。
  // 这里在 emit adapter 里挂一个 5s 节流的 assertNotCancelled：每次 fieldGroup/ocr_text
  // 阶段事件到达时检查一次（最坏延迟 = 一条 fieldGroup 到下一条的间隔，通常 ≤5s）。
  // 节流避免对 MedicalRecord 做高频 SELECT —— 5s 一次足够触发上游 streamChatJson 的
  // AbortController + 让 runStreamingPipeline 抛 OcrCancelledError 走 catch 分支。
  const CANCEL_CHECK_THROTTLE_MS = 5000;
  // 初始化为"现在"而非 0：worker 入口处 assertNotCancelled 刚跑完，下一次 emit
  // 必然在 1~2s 内到达（runStreamingPipeline 的 OCR_TEXT 阶段），再 SELECT 一次
  // 就是浪费 —— 等 5s 后真正进入流式结构化时再开始查 cancelled_at 更划算。
  // 这同时保证了 runOcrTaskCancel 测试里"入口未取消 → OCR 后取消"路径仍只有
  // 2 次 findOne（emit 期间的中段查询会被节流跳过）。
  let lastCancelCheckTs = Date.now();
  const emit = async (evt) => {
    if (!evt || !evt.stage) return;
    if (evt.stage === STAGE.RECEIVED || evt.stage === STAGE.PREPROCESS) return;
    if (evt.stage === STAGE.COMPLETED || evt.stage === STAGE.ERROR) return;
    if (!firstStreamFrameObserved) {
      firstStreamFrameObserved = true;
      observeStreamLatency('first_frame');
    }
    if (!firstFieldObserved && evt.fields && typeof evt.fields === 'object' && Object.keys(evt.fields).length) {
      firstFieldObserved = true;
      observeStreamLatency('first_field');
    }
    // 中段取消闸（节流）—— 抛 OcrCancelledError 会冒泡到 runOcrTask 的 catch，
    // 走 cancelled 分支（不写 error、不进 Sentry、不入 Bull DLQ）。
    const now = Date.now();
    if (now - lastCancelCheckTs >= CANCEL_CHECK_THROTTLE_MS) {
      lastCancelCheckTs = now;
      try {
        await assertNotCancelled(recordId);
      } catch (cancelErr) {
        // 仅 OCR_CANCELLED 重抛；其他 DB 临时错误不应该中断 OCR 主流程
        if (cancelErr && (cancelErr.code === 'OCR_CANCELLED' || cancelErr instanceof OcrCancelledError)) {
          throw cancelErr;
        }
        logger.warn('mid-stream assertNotCancelled 抛非取消异常（忽略）', {
          recordId, error: cancelErr && cancelErr.message
        });
      }
    }
    const payload = { status: 'running', statusPhase: 'streaming' };
    if (typeof evt.progress === 'number') payload.progress = evt.progress;
    if (evt.fieldGroup) payload.fieldGroup = evt.fieldGroup;
    if (evt.fields && typeof evt.fields === 'object') payload.fields = evt.fields;
    if (evt.fieldPatch) payload.fieldPatch = true;
    if (typeof evt.textLength === 'number') payload.textLength = evt.textLength;
    if (typeof evt.pageCount === 'number') payload.pageCount = evt.pageCount;
    if (typeof evt.rawText === 'string' && evt.rawText.length) payload.rawText = evt.rawText;
    if (evt.message) payload.message = evt.message;
    if (evt.providerWait) payload.providerWait = evt.providerWait;
    await publishRecordEventSafe(recordId, payload);
  };

  let fileHash = null;
  try {
    // Plan §Phase 3.1：第一道取消闸 —— worker 启动瞬间用户已点过取消的快路径。
    // 同一次 findOne 顺手给 Phase 1.2 拿到 file_hash。
    const recordSnap = await assertNotCancelled(recordId);
    fileHash = recordSnap && recordSnap.file_hash;

    // Plan §Phase 1.2：先尝试缓存命中（按 file_hash + prompt_version）。
    // 命中时跳过整段 LLM/OCR 流程，直接 hydrate `MedicalRecord.structured` + status='completed'。
    if (fileHash) {
      const cached = await ocrCache.get(fileHash);
      const updateArgs = ocrCache.buildUpdateArgsFromPayload(cached);
      if (updateArgs) {
        await MedicalRecord.update(updateArgs, { where: { id: recordId } });
        logger.info('OCR 缓存命中，跳过 LLM 调用', { recordId, fileHash });
        await publishRecordEventSafe(recordId, { status: 'completed', progress: 100, fromCache: true });
        // Wave 1 §F1：cache hit 路径也用 setImmediate 移出关键路径。
        if (userId) {
          setImmediate(() => {
            Promise.race([
              notificationQueue.add({ type: 'ocr_completed', recordId, userId, fromCache: true }),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('notify_add_timeout_2s')), 2000)
              )
            ]).catch((notifyErr) => {
              logger.warn('完成通知入队失败（cache hit）', {
                recordId,
                error: notifyErr && notifyErr.message
              });
            });
          });
        }
        return { success: true, recordId, cacheHit: true };
      }
    }

    // Plan §Phase 1.3：阶段一 → analyzing（LLM 调用即将开始）。
    // 同步打 status='running' + status_phase='analyzing'，
    // 客户端轮询/SSE 立刻拿到 (analyzing, 55%) 而不是卡在 1%。
    await MedicalRecord.update(
      { status: 'running', status_phase: 'analyzing' },
      { where: { id: recordId } }
    );
    await publishRecordEventSafe(recordId, {
      status: 'running',
      statusPhase: 'analyzing',
      progress: 55
    });

    // 2) 走流式管线：内部会发 preprocess(15) → ocr_text(40) → field_group(50–95)
    const result = await runStreamingPipeline({
      source: { sourceUrl: imageUrl, mimeType, fileKey },
      emit
    });

    // Plan §Phase 3.1：第二道取消闸 —— OCR 跑完后再查一次 cancelled_at。
    // LLM 调用是 60-180s，用户在中途取消是常见场景；此时 OCR 结果丢弃，不写 completed。
    await assertNotCancelled(recordId);

    // Wave 1 §F1：structuring 中间帧只推 SSE，不写 DB。
    // 之前这里有一次 `MedicalRecord.update({status_phase:'structuring'})`，
    // 但 ~100ms 后的 completed UPDATE 又把 status_phase 改回 null，等于一次浪费的 RTT。
    // SSE 帧保留（progress=90 让客户端进度条平滑过渡），但 DB 写入跳过 —— tail 死区缩短一次 DB RTT。
    publishRecordEventSafe(recordId, {
      status: 'running',
      statusPhase: 'structuring',
      progress: 90
    }).catch((phaseErr) => {
      logger.warn('structuring SSE 推送失败（忽略）', {
        recordId, error: phaseErr && phaseErr.message
      });
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
      // Plan §Phase 1.3：终态清空 status_phase，避免 mapParseStatus 在边缘 case 上误判。
      status_phase: null,
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

    // Wave 1 §F1：把 SSE `completed` 帧前置到 cache/notify 之前 ——
    // 客户端的「真正完成态」由轮询 parse-status-batch 决定，而前一次 UPDATE 已经把
    // status='completed' 落库；现在 publish 出去，客户端下一次 poll 立即拿到完成态，
    // tail 死区从 (DB UPDATE + cache.set + notify.add + SSE) 缩到只剩 (DB UPDATE + SSE)。
    // Wave 1 §F2：附带 progress:100 让客户端 handleStreamState 把进度条推到 100，
    // 不再视觉上停在 99 等下一次 polling tick。
    await publishRecordEventSafe(recordId, { status: 'completed', progress: 100 });

    // Plan §Phase 1.2：OCR 成功后写回缓存（best-effort）。同 hash 后续上传 → 直接命中。
    // Wave 1 §F1：用 setImmediate 把 cache + notify 完全移出关键路径 —— 即使两者各自慢 200ms，
    // 用户也已经看到 completed 帧了。
    if (fileHash) {
      const cachePayload = ocrCache.buildPayloadFromResult(result);
      setImmediate(() => {
        ocrCache.set(fileHash, cachePayload).catch((e) => {
          logger.warn('ocrCache.set 异常（忽略）', { recordId, error: e && e.message });
        });
      });
    }

    // 完成通知（best-effort：通知队列也要 Redis，挂掉不影响主流程）
    // Wave 1 §F1：从 await Promise.race 改成 setImmediate 异步丢出，本来就允许丢失，
    // 不再阻塞 worker 返回；2s race 保留在 setImmediate 内部，防止 Redis 卡住积压闭包。
    if (userId) {
      setImmediate(() => {
        Promise.race([
          notificationQueue.add({ type: 'ocr_completed', recordId, userId }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('notify_add_timeout_2s')), 2000)
          )
        ]).catch((notifyErr) => {
          logger.warn('完成通知入队失败（忽略，不影响 OCR 结果）', {
            recordId,
            error: notifyErr && notifyErr.message
          });
        });
      });
    }

    logger.info('OCR处理完成:', { recordId });
    return { success: true, recordId };
  } catch (error) {
    // Plan §Phase 3.1：用户取消是"软"事件 —— 不写 status='error'、不进 Sentry、不重抛（避免 Bull DLQ）。
    if (error && (error.code === 'OCR_CANCELLED' || error instanceof OcrCancelledError)) {
      logger.info('OCR 任务被用户取消', { recordId, jobId: jobId || 'inproc' });
      await publishRecordEventSafe(recordId, { status: 'cancelled' });
      return { success: false, recordId, cancelled: true };
    }
    logger.error('OCR处理失败:', { recordId, error: error.message });
    // Q3-红线 §A.3：上报到 Sentry（DSN 未配置时静默 noop）
    captureException(error, {
      tags: { component: 'ocr_queue', stage: 'process' },
      extra: { recordId, jobId: jobId || 'inproc' }
    });

    // 失败状态回写也用 try/catch，避免再次抛异常吃掉原始错误
    // 注：error 事件由本块末尾 publishRecordEventSafe(status:'error') 统一推 SSE，
    // 不需要单独 emit STAGE.ERROR —— PRD-2026Q4 的 emit adapter 已显式丢弃 ERROR/COMPLETED 阶段事件。
    try {
      await MedicalRecord.update({
        status: 'error',
        // Phase 1.3：error 是终态，清空 status_phase
        status_phase: null,
        structured: { error: error.message }
      }, {
        where: { id: recordId }
      });
    } catch (dbErr) {
      logger.error('OCR 失败状态回写失败:', { recordId, error: dbErr.message });
    }

    // Plan §Phase 2.3：把 error 状态推给在线 SSE 客户端（best-effort，不阻塞重抛）
    try {
      await publishRecordEventSafe(recordId, {
        status: 'error',
        errorMsg: error.message
      });
    } catch (_e) { /* noop */ }

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
    // Track D（2026-05-03）：每次 attempt 服务端硬上限，zombie protection。
    //   - Doubao 单次 HTTP timeout 已是 180s（llmClient.js）；正常 88-180s 完成。
    //   - 加这条只为防御 worker 内部死锁 / HTTP socket 不释放等极端情况；
    //     触发后 Bull 会发 'failed' 事件，handleOcrJobFailed 写 status='error'，
    //     客户端轮询读到 status='error' 才弹失败模态框。
    //   - 客户端已彻底删除硬超时（pages/upload/upload.js Track D），
    //     服务端是终态唯一来源；这条 timeout 是兜底，不是默认路径。
    const job = await Promise.race([
      ocrQueue.add(taskData, {
        attempts: OCR_JOB_ATTEMPTS,
        backoff: {
          type: 'ocrExponential',
          delay: OCR_JOB_BACKOFF_DELAY
        },
        timeout: OCR_JOB_TIMEOUT_MS,
        removeOnComplete: 10,
        removeOnFail: false
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('bull_add_timeout_5s')), 5000)
      )
    ]);

    logger.info('OCR任务已添加:', { recordId, jobId: job.id });
    // Plan §Phase 1.3：入队成功立刻打 status_phase='queued'。
    // 这一步是 advisory（DB 写失败不影响主路径），让客户端进度条 25% → "等待解析中…"
    // 不再卡在 1%。
    try {
      await MedicalRecord.update(
        { status_phase: 'queued' },
        { where: { id: recordId } }
      );
      await publishRecordEventSafe(recordId, {
        status: 'pending',
        statusPhase: 'queued',
        progress: 25
      });
    } catch (phaseErr) {
      logger.warn('status_phase=queued 切换失败（忽略）', {
        recordId, error: phaseErr && phaseErr.message
      });
    }
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

const safeOcrErrorMessage = (err) => {
  const raw = `${err?.message || err || 'OCR任务失败'}`;
  return raw
    .replace(/https?:\/\/\S+/g, '[redacted-url]')
    .slice(0, 500);
};

const handleOcrJobFailed = async (job, err) => {
  const attemptsMade = job?.attemptsMade || 0;
  const maxAttempts = job?.opts?.attempts || 0;
  const recordId = job?.data?.recordId || '';
  const errorMsg = safeOcrErrorMessage(err);

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

  if (recordId) {
    try {
      await MedicalRecord.update({
        status: 'error',
        status_phase: null,
        structured: { error: errorMsg }
      }, {
        where: { id: recordId }
      });
      await publishRecordEventSafe(recordId, {
        status: 'error',
        errorMsg
      });
    } catch (recordErr) {
      logger.error('Bull 最终失败后回写 OCR 终态失败:', {
        jobId: job?.id,
        recordId,
        error: recordErr.message
      });
    }
  }

  try {
    await OcrJobFailure.create({
      job_id: String(job.id),
      record_id: recordId,
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
    timeout: OCR_JOB_TIMEOUT_MS,
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

// Plan §Phase 3.4：客户端 step 2 占位卡上方"前面还有 N 份在处理"。
//   返回 { waiting, active, total }。
//   - waiting：还没被 worker pick 的；
//   - active：正在跑（受 OCR_QUEUE_CONCURRENCY 限）；
//   - total：waiting + active —— 用户体感"前面还有"的口径；
//
// 容错：Redis 连不通 / Bull 异常时返回 null —— 上层渲染 null 时直接不显示文案，
// 不能因为这点装饰拖死上传响应。
const getQueueDepth = async () => {
  try {
    const counts = await ocrQueue.getJobCounts();
    const waiting = Number(counts.waiting || 0);
    const active = Number(counts.active || 0);
    return {
      waiting,
      active,
      total: waiting + active
    };
  } catch (e) {
    logger.warn('[queue] getQueueDepth 失败:', { error: e.message });
    return null;
  }
};

module.exports = {
  ocrQueue,
  notificationQueue,
  addOCRTask,
  // Wave 3 §1：upload 期同步缓存水合，把 worker 内 cache 命中分支提前到 controller。
  tryHydrateOcrFromCache,
  getJobStatus,
  retryFailure,
  getQueueDepth,
  __testables: {
    handleOcrJobFailed, classifyError, safeOcrErrorMessage,
    OCR_QUEUE_CONCURRENCY, OCR_JOB_TIMEOUT_MS, getQueueDepth,
    // Plan §Phase 3.1 单测入口
    runOcrTask, OcrCancelledError, assertNotCancelled
  }
};
