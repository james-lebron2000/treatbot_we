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
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS 配置
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
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

// API 路由
app.use('/api', routes);

// 根路径重定向到管理后台
app.get('/', (req, res) => {
  res.redirect('/admin');
});

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
