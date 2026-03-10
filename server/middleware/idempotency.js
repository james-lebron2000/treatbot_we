const { redisClient } = require('./rateLimit');
const logger = require('../utils/logger');

const IDEMPOTENCY_TTL = 24 * 60 * 60;  // 24 小时

/**
 * 幂等性校验中间件
 * 防止重复提交（如重复报名、重复上传等）
 */
const idempotencyMiddleware = async (req, res, next) => {
  const idempotencyKey = req.headers['idempotency-key'];
  
  // GET 请求不需要幂等校验
  if (req.method === 'GET') {
    return next();
  }
  
  // 如果没有幂等键，允许通过（但建议客户端提供）
  if (!idempotencyKey) {
    logger.warn('缺少幂等键:', { path: req.path, userId: req.userId });
    return next();
  }

  const requestScope = `${req.method}:${req.baseUrl || ''}${req.path}`;
  const key = `idempotency:${req.userId}:${requestScope}:${idempotencyKey}`;
  
  try {
    // 检查是否已存在
    const existing = await redisClient.get(key);
    
    if (existing) {
      const result = JSON.parse(existing);
      logger.info('幂等命中，返回缓存结果:', { key, path: req.path });
      return res.json(result);
    }
    
    // 保存原始的 res.json 方法
    const originalJson = res.json.bind(res);
    
    // 重写 res.json 方法，在发送响应前缓存结果
    res.json = (data) => {
      // 只有成功的响应才缓存
      if (data.code === 0) {
        redisClient.setex(key, IDEMPOTENCY_TTL, JSON.stringify(data))
          .catch(err => logger.error('幂等缓存失败:', err));
      }
      
      return originalJson(data);
    };
    
    next();
  } catch (error) {
    logger.error('幂等校验失败:', error);
    next();
  }
};

module.exports = { idempotencyMiddleware };
