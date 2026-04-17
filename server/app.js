const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
require('dotenv').config();

const { errorHandler } = require('./middleware/errorHandler');
const rateLimitMiddleware = require('./middleware/rateLimit');
const routes = require('./routes');
const logger = require('./utils/logger');
const healthController = require('./controllers/health');

const app = express();
const PORT = process.env.PORT || 3000;

// 安全中间件
// CSP 策略：
//   - scriptSrc 生产环境**禁止** 'unsafe-inline'，防止 XSS payload 直接执行
//   - 开发环境（NODE_ENV !== 'production'）保留 'unsafe-inline' 以兼容 Vite HMR
//   - styleSrc 暂时保留 'unsafe-inline'，因为 Element Plus / Vue 的样式注入依赖它；
//     后续可通过 nonce 机制彻底移除
const isProduction = process.env.NODE_ENV === 'production';
const scriptSrc = ["'self'"];
if (!isProduction) {
  scriptSrc.push("'unsafe-inline'", "'unsafe-eval'"); // 本地 HMR 需要
}
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc,
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", process.env.PUBLIC_BASE_URL || 'https://inseq.top'].filter(Boolean),
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // 强制 HTTPS 传输（生产）；hsts 默认 180 天，包含子域
  hsts: isProduction ? { maxAge: 15552000, includeSubDomains: true, preload: false } : false,
  referrerPolicy: { policy: 'no-referrer-when-downgrade' }
}));

// CORS 配置
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['https://inseq.top', 'https://www.inseq.top'];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
  credentials: true
}));

// 压缩响应
app.use(compression());

// 限流
app.use(rateLimitMiddleware);

// 解析 JSON 请求体
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 请求日志
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  
  logger.info(`${req.method} ${req.path}`, {
    requestId,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });
  
  next();
});

// 健康检查端点
app.get('/health', healthController.basicHealth);
app.get('/health/detailed', healthController.detailedHealth);
app.get('/ready', healthController.readinessCheck);
app.get('/live', healthController.livenessCheck);

// 静态文件服务（管理后台）
app.use('/admin', express.static(path.join(__dirname, 'public/admin')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// 演示样例图片（公开，可被 /api/demo/samples 返回的 imageUrl 引用）
app.use('/demo-assets', express.static(path.join(__dirname, 'public/demo'), {
  maxAge: '1d',
  fallthrough: true
}));

// API 路由
app.use('/api', routes);

// 根路径落地页（静态 HTML，纯介绍 + 2 个 CTA 按钮）
// 放在 /api 之后、404 之前；index: 'index.html' 让 `/` 直接命中 landing/index.html
app.use('/', express.static(path.join(__dirname, 'public/landing'), {
  index: 'index.html',
  maxAge: '5m',
  fallthrough: true
}));

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    code: 404,
    message: '接口不存在',
    data: null
  });
});

// 错误处理
app.use(errorHandler);

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    logger.info(`Health check: http://localhost:${PORT}/health`);
    logger.info(`Admin dashboard: http://localhost:${PORT}/admin`);
  });
}

module.exports = app;
