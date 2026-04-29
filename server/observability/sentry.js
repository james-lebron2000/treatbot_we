/**
 * Q3-红线 §A.3：Sentry 接入（合规红线 R6 + 高优 H1 可观测性）。
 *
 * 设计要点：
 *  - 未配置 SENTRY_DSN 时所有方法变 noop，避免 dev / CI 报错。
 *  - beforeSend 强制脱敏 event.request.data / event.extra 中的 PII（手机号、邮箱、身份证、姓名等）。
 *    优先复用 utils/piiScrubber.scrubForLlm，软依赖：模块缺失时回退到本地正则。
 *  - 仅暴露 requestHandler / errorHandler / captureException 三个外部入口；
 *    业务代码不直接 import @sentry/node，方便后续替换/灰度。
 *  - tracesSampleRate / profilesSampleRate 默认 5%，兼顾成本与可观测性。
 */

let Sentry = null;
let _enabled = false;

const DSN = process.env.SENTRY_DSN || '';
const TRACES_SAMPLE_RATE = Number(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.05');
const PROFILES_SAMPLE_RATE = Number(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.05');

// 软依赖 piiScrubber：模块缺失时使用内置正则
let _piiScrubber = null;
try {
  _piiScrubber = require('../utils/piiScrubber');
} catch (e) {
  _piiScrubber = null;
}

const PHONE_RE = /(?<!\d)1[3-9]\d{9}(?!\d)/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const ID_CARD_RE = /(?<!\d)\d{17}[0-9Xx](?!\d)/g;
const NAME_LABEL_RE = /(姓名|患者)[\s ]*[：:]\s*([一-龥A-Za-z·]{2,4})/g;

/**
 * 简单字符串脱敏：用 [redacted] 替换可识别 PII。
 */
const redactString = (text) => {
  if (typeof text !== 'string' || !text) return text;
  if (_piiScrubber && typeof _piiScrubber.scrubForLlm === 'function') {
    try {
      const { scrubbed } = _piiScrubber.scrubForLlm(text);
      // piiScrubber 会输出 <PHONE_1> 风格占位符，统一归一为 [redacted]
      return String(scrubbed).replace(/<[A-Z_]+_\d+>/g, '[redacted]');
    } catch (e) {
      // fallback to local regex
    }
  }
  return text
    .replace(NAME_LABEL_RE, (_, label) => `${label}:[redacted]`)
    .replace(ID_CARD_RE, '[redacted]')
    .replace(PHONE_RE, '[redacted]')
    .replace(EMAIL_RE, '[redacted]');
};

/**
 * 深度遍历对象，对所有字符串字段做 PII 脱敏。
 * 防御递归循环：用 WeakSet 记忆已访问对象。
 */
const deepRedact = (val, seen = new WeakSet()) => {
  if (val == null) return val;
  if (typeof val === 'string') return redactString(val);
  if (typeof val !== 'object') return val;
  if (seen.has(val)) return val;
  seen.add(val);
  if (Array.isArray(val)) {
    return val.map((item) => deepRedact(item, seen));
  }
  const out = {};
  for (const k of Object.keys(val)) {
    out[k] = deepRedact(val[k], seen);
  }
  return out;
};

/**
 * Sentry beforeSend 钩子：脱敏 PII，避免敏感数据外发。
 */
const scrubPii = (event) => {
  if (!event || typeof event !== 'object') return event;
  try {
    if (event.request && event.request.data) {
      event.request.data = deepRedact(event.request.data);
    }
    if (event.extra) {
      event.extra = deepRedact(event.extra);
    }
    if (event.message) {
      event.message = redactString(event.message);
    }
    // 不发送 user.email / user.username 字段（仅保留 id）
    if (event.user) {
      const { id } = event.user;
      event.user = id ? { id } : undefined;
    }
  } catch (e) {
    // 脱敏失败时丢弃整事件，比泄漏 PII 更安全
    return null;
  }
  return event;
};

if (DSN) {
  try {
    Sentry = require('@sentry/node');
    let profilingIntegration = [];
    try {
      const { ProfilingIntegration } = require('@sentry/profiling-node');
      profilingIntegration = [new ProfilingIntegration()];
    } catch (e) {
      // 无 profiling 包不影响主流程
    }
    Sentry.init({
      dsn: DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: Number.isFinite(TRACES_SAMPLE_RATE) ? TRACES_SAMPLE_RATE : 0.05,
      profilesSampleRate: Number.isFinite(PROFILES_SAMPLE_RATE) ? PROFILES_SAMPLE_RATE : 0.05,
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
        new Sentry.Integrations.Express({ app: undefined }),
        ...profilingIntegration
      ],
      beforeSend: scrubPii
    });
    _enabled = true;
  } catch (e) {
    // SDK 加载失败回退到 noop（不让错误打断启动）
    Sentry = null;
    _enabled = false;
  }
}

const noopMiddleware = (req, res, next) => next();
const noopErrorMiddleware = (err, req, res, next) => next(err);

const requestHandler = _enabled
  ? Sentry.Handlers.requestHandler()
  : noopMiddleware;

const errorHandler = _enabled
  ? Sentry.Handlers.errorHandler()
  : noopErrorMiddleware;

/**
 * 显式上报异常。ctx 会作为 extras（亦受 scrubPii 处理）。
 * 未启用时退化为 noop。
 */
const captureException = (err, ctx) => {
  if (!_enabled || !Sentry) return;
  try {
    Sentry.withScope((scope) => {
      if (ctx && typeof ctx === 'object') {
        scope.setExtras(ctx);
      }
      Sentry.captureException(err);
    });
  } catch (e) {
    // 永远不让上报本身炸业务
  }
};

module.exports = {
  Sentry,
  isEnabled: () => _enabled,
  requestHandler,
  errorHandler,
  captureException,
  scrubPii,
  // 暴露给单测验证脱敏行为
  _internal: { redactString, deepRedact }
};
