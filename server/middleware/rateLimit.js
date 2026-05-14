const rateLimit = require('express-rate-limit');
const Redis = require('ioredis');
const logger = require('../utils/logger');

// PRD-2026Q4 T0-7 followup：Redis 连接 lazy singleton，凭证哈希做 cache-key。
// 老实现把 ioredis 客户端在 module 顶层 new，进程启动时如果 REDIS_HOST/PASSWORD
// env 还没注入，会捕获错误的连接参数（同 OCR_PROVIDER=kimi 残留事故的同一类）。
// idempotency.js 通过 module.exports.redisClient 拿连接，下面用 Proxy 让它依然
// 能直接调 .get / .setex 等方法，每次方法调用走 getRedisClient()。
let _redisClient = null;
let _redisClientCredKey = '';
const buildRedisClient = () => {
  return new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: 0,
    // lazyConnect:true → 真正发命令时才建 TCP 连接，避免 require 时连不上 Redis
    // 直接报 unhandled error。
    lazyConnect: true
  });
};
const getRedisClient = () => {
  const credKey = `${process.env.REDIS_HOST || ''}|${process.env.REDIS_PORT || ''}|${process.env.REDIS_PASSWORD || ''}`;
  if (_redisClient && _redisClientCredKey === credKey) {
    return _redisClient;
  }
  if (_redisClient) {
    // 凭证变了，先断老连接（best effort，不阻塞）。
    try { _redisClient.disconnect(); } catch (e) { /* ignore */ }
  }
  _redisClient = buildRedisClient();
  _redisClientCredKey = credKey;
  return _redisClient;
};

// 暴露给消费方（middleware/idempotency.js）：透明代理，每个方法访问都走
// getRedisClient()，从而享受 lazy + rotate-aware 行为。
const redisClient = new Proxy({}, {
  get(_target, prop) {
    const client = getRedisClient();
    const value = client[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  }
});

// 通用限流配置
const createRateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000,  // 15 分钟
    max = 100,  // 最多 100 次
    keyPrefix = 'rl:',
    message = '请求过于频繁，请稍后再试'
  } = options;
  
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // 优先使用用户 ID，其次是 IP
      return `${keyPrefix}${req.userId || req.ip}`;
    },
    handler: (req, res) => {
      // express-rate-limit v6+ 将 resetTime 挂在 req.rateLimit 上
      const resetTime = req.rateLimit && req.rateLimit.resetTime
        ? new Date(req.rateLimit.resetTime).getTime()
        : Date.now() + windowMs;
      const retryAfter = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
      logger.warn('限流触发:', { ip: req.ip, userId: req.userId, path: req.path, retryAfter });
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        code: 429,
        message,
        data: { retryAfter }
      });
    }
  });
};

// 默认限流：100 请求/15分钟
const defaultLimiter = createRateLimiter();

// 严格限流：20 请求/15分钟 - 用于敏感操作（登录、报名等）
const strictLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyPrefix: 'rl:strict:'
});

// 上传限流：30 次/小时（一份完整病历可能含 3 份文件：病理 + 出院小结 + 基因报告，
// 允许 2-3 次识别失败后的重试，避免正常用户被 10/小时卡死）
const uploadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyPrefix: 'rl:upload:',
  message: '上传过于频繁，请稍后再试'
});

module.exports = defaultLimiter;
module.exports.strictLimiter = strictLimiter;
module.exports.uploadLimiter = uploadLimiter;
module.exports.redisClient = redisClient;
