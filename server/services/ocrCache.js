/**
 * Plan §Phase 1.2：OCR 结果缓存（按 file_hash + prompt_version）。
 *
 * 命中场景：
 *   1. 软删后重传：用户删了一份病历，再传同一文件 → 直接 hydrate，不再走 90s LLM。
 *   2. 同文件多账号：A 上传过 → B 后续上传同一份（同事/家属共享），秒级返回。
 *   3. 客户端"换一份/重试"按钮再次提交同 hash → 不重复花钱。
 *
 * 不命中：
 *   - prompt 版本升级 → 把 PROMPT_VERSION bump，旧 key 自然失效（懒过期，30 天 TTL 内自然清理）。
 *   - file_hash 不同（拍照角度/裁剪差异）→ 老老实实走 OCR。
 *
 * 安全/隐私：
 *   - cache value 存的是已经过 LLM 抽取后的"结构化字段 + 摘要文本"，没有原始病历像素；
 *     与 MedicalRecord.structured 一致，已通过 piiScrubber 脱敏。
 *   - 30 天 TTL 后自动清掉，不积压；DSAR 删除时 cache 不需要专门清，
 *     因为 key 走 file_hash 而非 user_id，删除用户 record 不影响其它用户复用。
 *   - Redis 不可用时 get 返回 null（视作 miss），set 静默失败 —— 永远不让缓存层挡住主链路。
 *
 * 不做：
 *   - 不持久化原始 OCR text 到长期存储（已由 MedicalRecord.structured 承担）。
 *   - 不做缓存预热/批量失效；prompt 升级用版本号自然失效。
 */

const logger = require('../utils/logger');

// Plan §Phase 1.2：prompt 版本号常量。升级 prompt 后 bump 这个值，
// 旧缓存 key 自然失效。当前 OCR 流程统一用 'v1'（promptRegistry 默认版本）。
const PROMPT_VERSION = process.env.OCR_PROMPT_VERSION || 'v1';

const CACHE_TTL_SECONDS = parseInt(process.env.OCR_CACHE_TTL_SECONDS || `${30 * 24 * 60 * 60}`, 10);
const CACHE_KEY_PREFIX = 'ocr';

// Redis 客户端：复用 middleware/rateLimit 创建的共享实例，避免再开一条连接。
// 软依赖：测试场景下 mock module 时不应该 throw；middleware/rateLimit 没加载时降级为 noop。
let _redis = null;
const getRedis = () => {
  if (_redis) return _redis;
  try {
    const mod = require('../middleware/rateLimit');
    _redis = mod && mod.redisClient;
  } catch (_e) {
    _redis = null;
  }
  return _redis;
};

// metrics 软依赖：单测下 metrics 模块可能被 mock 成空对象。
const getMetrics = () => {
  try {
    const m = require('../middleware/metrics');
    return (m && m.ocrCacheTotal) ? m : null;
  } catch (_e) {
    return null;
  }
};

const incCacheMetric = (result) => {
  const m = getMetrics();
  if (!m || !m.ocrCacheTotal || typeof m.ocrCacheTotal.labels !== 'function') return;
  try {
    m.ocrCacheTotal.labels(result).inc();
  } catch (_e) {
    // 指标自爆不能影响业务
  }
};

const buildKey = (fileHash, version) => {
  const v = version || PROMPT_VERSION;
  return `${CACHE_KEY_PREFIX}:${v}:${fileHash}`;
};

/**
 * 尝试拿缓存。Redis 不可用 / 反序列化失败 / key 不存在 → 一律返回 null（视作 miss）。
 * @param {string} fileHash 文件 md5
 * @param {object} [opts]
 * @param {string} [opts.version] 覆盖 PROMPT_VERSION（测试用）
 * @returns {Promise<object|null>}
 */
const get = async (fileHash, opts = {}) => {
  if (!fileHash) {
    incCacheMetric('miss');
    return null;
  }
  const redis = getRedis();
  if (!redis || typeof redis.get !== 'function') {
    incCacheMetric('error');
    return null;
  }

  const key = buildKey(fileHash, opts.version);
  let raw;
  try {
    raw = await redis.get(key);
  } catch (err) {
    logger.warn('ocrCache.get Redis 读取失败（视作 miss）', { fileHash, error: err.message });
    incCacheMetric('error');
    return null;
  }

  if (!raw) {
    incCacheMetric('miss');
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    logger.warn('ocrCache.get JSON 解析失败（视作 miss）', { fileHash, error: err.message });
    incCacheMetric('error');
    return null;
  }

  incCacheMetric('hit');
  return payload;
};

/**
 * 写回缓存；失败静默（永远不影响主链路）。
 * @param {string} fileHash
 * @param {object} payload  要存的对象（必须可 JSON.stringify）
 * @param {object} [opts]
 * @param {string} [opts.version]
 * @param {number} [opts.ttlSeconds]
 * @returns {Promise<boolean>}
 */
const set = async (fileHash, payload, opts = {}) => {
  if (!fileHash || !payload) return false;
  const redis = getRedis();
  if (!redis || typeof redis.setex !== 'function') return false;

  const key = buildKey(fileHash, opts.version);
  const ttl = Number.isFinite(opts.ttlSeconds) && opts.ttlSeconds > 0
    ? Math.floor(opts.ttlSeconds)
    : CACHE_TTL_SECONDS;

  let serialized;
  try {
    serialized = JSON.stringify(payload);
  } catch (err) {
    logger.warn('ocrCache.set JSON.stringify 失败', { fileHash, error: err.message });
    return false;
  }

  try {
    await redis.setex(key, ttl, serialized);
    return true;
  } catch (err) {
    logger.warn('ocrCache.set Redis 写入失败（忽略）', { fileHash, error: err.message });
    return false;
  }
};

/**
 * 把 OCR 任务结果序列化为 cache payload 形态。
 * 与 queue.js runOcrTask 写库 update 时使用的字段保持一致；hydrate 时直接用同一个对象 reverse 出 update args。
 */
const buildPayloadFromResult = (result) => {
  const entities = (result && result.entities) || {};
  return {
    schemaVersion: 1,
    promptVersion: PROMPT_VERSION,
    cachedAt: new Date().toISOString(),
    fields: {
      diagnosis: entities.diagnosis || null,
      stage: entities.stage || null,
      gene_mutation: entities.geneMutation || null,
      treatment: entities.treatment || null,
      treatment_line: entities.treatmentLine || null,
      pdl1: entities.pdl1 || null
    },
    structured: {
      text: result.text || '',
      entities,
      confidence: result.confidence || null,
      detections: result.detections || [],
      ocrMeta: {
        provider: result.provider || 'unknown',
        pageCount: result.pageCount || null,
        completedAt: new Date().toISOString()
      }
    }
  };
};

/**
 * 从 cache payload hydrate 出 MedicalRecord.update 需要的 args；
 * 复用 buildPayloadFromResult 的契约 → runOcrTask 命中 cache 时不需要再跑 LLM 路径。
 */
const buildUpdateArgsFromPayload = (payload) => {
  if (!payload || !payload.fields || !payload.structured) return null;
  const ocrMeta = Object.assign(
    {},
    payload.structured.ocrMeta || {},
    { cacheHit: true, completedAt: new Date().toISOString() }
  );
  return {
    status: 'completed',
    // Plan §Phase 1.3：缓存命中后必须清空 status_phase，否则可能继承旧的过程态。
    status_phase: null,
    diagnosis: payload.fields.diagnosis,
    stage: payload.fields.stage,
    gene_mutation: payload.fields.gene_mutation,
    treatment: payload.fields.treatment,
    treatment_line: payload.fields.treatment_line,
    pdl1: payload.fields.pdl1,
    structured: Object.assign({}, payload.structured, { ocrMeta })
  };
};

module.exports = {
  PROMPT_VERSION,
  CACHE_TTL_SECONDS,
  buildKey,
  get,
  set,
  buildPayloadFromResult,
  buildUpdateArgsFromPayload
};
