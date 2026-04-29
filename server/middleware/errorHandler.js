const logger = require('../utils/logger');
// Q3-红线 §A.3：Sentry 兜底上报。Sentry 自带的 errorHandler middleware 会捕获 5xx，
// 这里再 capture 一次保证业务错误（含已知 SequelizeError）也能被采集，便于排障。
let _sentry = null;
try {
  _sentry = require('../observability/sentry');
} catch (e) {
  _sentry = null;
}
const captureException = (_sentry && _sentry.captureException)
  ? _sentry.captureException
  : () => {};

/**
 * 全局错误处理中间件
 */
const errorHandler = (err, req, res, next) => {
  // 记录错误日志
  logger.error('请求错误:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    requestId: req.requestId,
    userId: req.userId,
    ip: req.ip
  });
  
  // 已知错误类型处理
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      code: 400,
      message: '数据验证失败: ' + err.errors.map(e => e.message).join(', '),
      data: null
    });
  }
  
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      code: 409,
      message: '数据已存在',
      data: null
    });
  }
  
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({
      code: 400,
      message: '关联数据不存在',
      data: null
    });
  }
  
  // 业务错误（自定义错误）
  if (err.isBusinessError) {
    return res.status(400).json({
      code: err.code || 400,
      message: err.message,
      data: err.data || null
    });
  }
  
  // 文件上传错误
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      code: 400,
      message: '文件大小超出限制',
      data: null
    });
  }
  
  // 默认 500 错误：显式上报到 Sentry（受 beforeSend PII 脱敏保护）
  captureException(err, {
    tags: { component: 'errorHandler', method: req.method },
    extra: { path: req.path, requestId: req.requestId, userId: req.userId }
  });
  const isDev = process.env.NODE_ENV === 'development';

  res.status(500).json({
    code: 500,
    message: isDev ? err.message : '服务器内部错误',
    data: isDev ? { stack: err.stack } : null
  });
};

/**
 * 业务错误类
 */
class BusinessError extends Error {
  constructor(message, code = 400, data = null) {
    super(message);
    this.name = 'BusinessError';
    this.isBusinessError = true;
    this.code = code;
    this.data = data;
  }
}

module.exports = { errorHandler, BusinessError };
