const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
require('dotenv').config();

// Q3-红线 §A.3：Sentry 必须在其它 middleware 之前 require，
// 这样 Sentry SDK 内部的 http instrumentation 能正常 patch。
const sentry = require('./observability/sentry');

const { errorHandler } = require('./middleware/errorHandler');
const rateLimitMiddleware = require('./middleware/rateLimit');
const { responseEnvelope } = require('./middleware/responseEnvelope');
const {
  register: metricsRegister,
  collectOcrQueueStats,
  httpMetricsMiddleware
} = require('./middleware/metrics');
const routes = require('./routes');
const logger = require('./utils/logger');
const healthController = require('./controllers/health');

const app = express();
const PORT = process.env.PORT || 3000;

// Q3-红线 §A.3：Sentry requestHandler 必须放在所有业务 middleware 之前，
// 这样它能捕获完整的请求上下文。SENTRY_DSN 未配置时退化为 noop。
app.use(sentry.requestHandler);

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

// 非 production 环境放开本地预览域，避免 demo / e2e 跑 vite preview / dev 时
// 出现「Network Error」（CORS preflight 被拒）。production 仍然严格按 ALLOWED_ORIGINS。
const LOCAL_DEV_ORIGIN_PATTERNS = process.env.NODE_ENV === 'production'
  ? []
  : [/^https?:\/\/localhost(:\d+)?$/, /^https?:\/\/127\.0\.0\.1(:\d+)?$/];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      return cb(null, true);
    }
    if (LOCAL_DEV_ORIGIN_PATTERNS.some((re) => re.test(origin))) {
      return cb(null, true);
    }
    cb(null, false);
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

// PRD-2026Q2 §4.1：HTTP 请求耗时直方图埋点，必须在响应信封之前，
// 以便 res.on('finish') 能捕获最终 status。
app.use(httpMetricsMiddleware);

// 响应信封（res.ok / res.fail / res.paginated），与 utils/response 同构
app.use(responseEnvelope);

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

// PRD-2026Q2 §4.1：Prometheus /metrics endpoint
// - 仅允许内网 IP（10/8, 172.16/12, 192.168/16, 127.0.0.1, ::1）抓取
// - METRICS_ALLOW_ALL=true 用于测试 / 本地打开白名单
// - /metrics 顶层路径，不走 /api 前缀，方便 Prometheus scrape_config
const allowInternalOnly = (req, res, next) => {
  const raw = req.ip || (req.connection && req.connection.remoteAddress) || '';
  const ip = raw.replace('::ffff:', '');
  const isInternal = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1)/.test(ip);
  if (!isInternal && process.env.METRICS_ALLOW_ALL !== 'true') {
    return res.status(403).end();
  }
  next();
};

app.get('/metrics', allowInternalOnly, async (req, res) => {
  await collectOcrQueueStats().catch(() => {});
  res.set('Content-Type', metricsRegister.contentType);
  res.end(await metricsRegister.metrics());
});

// 静态文件服务（管理后台）
app.use('/admin', express.static(path.join(__dirname, 'public/admin')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// 演示样例图片（公开，可被 /api/demo/samples 返回的 imageUrl 引用）
app.use('/demo-assets', express.static(path.join(__dirname, 'public/demo'), {
  maxAge: '1d',
  fallthrough: true
}));

// PRD-2026Q2 §2.4：试验新鲜度每日巡检。需显式开启，避免本地/CI 意外触发。
if (process.env.ENABLE_TRIAL_FRESHNESS_CRON === 'true') {
  require('./jobs/trialFreshnessJob');
}

// API 路由
app.use('/api', routes);

// 根路径落地页（静态 HTML，纯介绍 + 2 个 CTA 按钮）
// 放在 /api 之后、404 之前；index: 'index.html' 让 `/` 直接命中 landing/index.html
// Cache 策略：HTML 设为 no-cache + must-revalidate，靠 ETag/If-None-Match 做 304，
// 这样每次主页改版用户刷新就能看到新版，不会被 5 分钟 max-age 卡住。
app.use('/', express.static(path.join(__dirname, 'public/landing'), {
  index: 'index.html',
  extensions: ['html'],   // `/privacy` → `privacy.html`（独立隐私页）
  fallthrough: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    } else {
      // 其它静态资源（目前只有 HTML，但预留给以后的 /favicon.ico 等）缓存 1 天
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));

// 404 处理
app.use((req, res) => {
  res.fail('接口不存在', 404);
});

// Q3-红线 §A.3：Sentry errorHandler 必须放在自定义 errorHandler 之前，
// 让 Sentry 优先捕获未知异常；自定义 errorHandler 仍负责返回 JSON。
app.use(sentry.errorHandler);

// 错误处理
app.use(errorHandler);

if (require.main === module) {
  // 修复方案 Track 2.5：启动时校验 OCR 凭证。未配置不阻断 listen
  // （手动录入路径仍可用），但日志里 logger.error 让运维 deploy 后立刻可见，
  // 避免「上线后 PDF 上传永远 OCR_NOT_CONFIGURED」这种事故没人知道。
  try {
    const ocrConfig = require('./utils/ocrConfig');
    if (!ocrConfig.isOcrEnabled()) {
      logger.error('[STARTUP] OCR 服务未配置 (MINIMAX_API_KEY / KIMI_API_KEY / OCR_SECRET_ID 均缺失)，所有 PDF 上传将立即返回 OCR_NOT_CONFIGURED。请检查 server/.env');
    } else {
      logger.info(`[STARTUP] OCR 凭证已配置: providers=${ocrConfig.describeOcrProviders()}`);
    }
  } catch (e) {
    logger.warn('[STARTUP] OCR 配置检查模块加载失败:', { error: e.message });
  }

  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    logger.info(`Health check: http://localhost:${PORT}/health`);
    logger.info(`Admin dashboard: http://localhost:${PORT}/admin`);
  });
}

module.exports = app;
