const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * JWT 认证中间件
 */
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      code: 401,
      message: '缺少认证令牌',
      data: null
    });
  }
  
  const token = authHeader.slice(7);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.openid = decoded.openid;
    next();
  } catch (error) {
    logger.warn('JWT 验证失败:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        code: 401,
        message: '令牌已过期',
        data: { expired: true }
      });
    }
    
    return res.status(401).json({
      code: 401,
      message: '无效的令牌',
      data: null
    });
  }
};

/**
 * 可选认证中间件 - 不强制要求登录，但会解析 token
 */
const optionalAuthMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.userId = decoded.userId;
      req.openid = decoded.openid;
    } catch (error) {
      // 忽略错误，继续执行
    }
  }
  
  next();
};

module.exports = { authMiddleware, optionalAuthMiddleware };
