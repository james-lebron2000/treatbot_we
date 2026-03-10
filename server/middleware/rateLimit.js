const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');
const logger = require('../utils/logger');

// 创建 Redis 客户端
const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: 0
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
      logger.warn('限流触发:', { ip: req.ip, userId: req.userId, path: req.path });
      res.status(429).json({
        code: 429,
        message,
        data: null
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

// 上传限流：10 次/小时
const uploadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyPrefix: 'rl:upload:',
  message: '上传过于频繁，请稍后再试'
});

module.exports = defaultLimiter;
module.exports.strictLimiter = strictLimiter;
module.exports.uploadLimiter = uploadLimiter;
module.exports.redisClient = redisClient;
