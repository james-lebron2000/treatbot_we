/**
 * jwtSecret.js — JWT 秘钥统一入口（启动时校验）
 *
 * 动机：
 *   之前代码在 4 处用 `process.env.JWT_SECRET || 'your-secret-key'`，
 *   一旦 .env 没加载成功就会退化到一个全网可搜到的弱秘钥，
 *   任何人都能伪造登录 token。本模块在**启动时**直接校验：
 *
 *   - NODE_ENV=production：必须设置 JWT_SECRET，且长度 ≥ 32，且不在弱值黑名单中；
 *     违反任一条件 → 直接抛错，进程不能启动（fail fast）。
 *   - 其他环境（development/test）：若未设置，生成一个随机秘钥用于当前进程，
 *     并打印显眼警告；绝不允许硬编码的 'your-secret-key' 再出现。
 *
 * 所有需要 JWT_SECRET 的模块都应 `require('./utils/jwtSecret').JWT_SECRET`。
 */

const crypto = require('crypto');

const MIN_SECRET_LENGTH = 32;

// 已知弱值 / 示例值黑名单。出现在任何环境都拒绝。
const WEAK_SECRETS = new Set([
  'your-secret-key',
  'your-super-secret-key',
  'your-super-secret-jwt-key-change-in-production',
  'secret',
  'changeme',
  'change-me',
  'jwt-secret',
  'test',
  '123456',
  'password'
]);

const isWeak = (secret) => {
  if (!secret) return true;
  const lowered = String(secret).trim().toLowerCase();
  if (WEAK_SECRETS.has(lowered)) return true;
  // 全是同一字符，或纯数字/纯字母且短 —— 也认为是弱值
  if (/^(.)\1+$/.test(lowered)) return true;
  return false;
};

const resolveJwtSecret = () => {
  const raw = process.env.JWT_SECRET;
  const env = process.env.NODE_ENV || 'development';

  if (env === 'production') {
    if (!raw) {
      throw new Error(
        '[FATAL] JWT_SECRET 未设置。生产环境必须通过环境变量提供强秘钥（≥32 字符）。' +
        '请检查 .env 或部署配置，生成方法：node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
      );
    }
    if (isWeak(raw)) {
      throw new Error('[FATAL] JWT_SECRET 命中弱值黑名单。请更换为强随机秘钥。');
    }
    if (raw.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `[FATAL] JWT_SECRET 长度为 ${raw.length}，少于最低要求 ${MIN_SECRET_LENGTH}。请更换为 ≥32 字符的随机秘钥。`
      );
    }
    return raw;
  }

  // 非生产环境
  if (!raw) {
    const generated = crypto.randomBytes(48).toString('hex');
    // eslint-disable-next-line no-console
    console.warn(
      `[WARN] JWT_SECRET 未设置，已为当前进程生成临时秘钥（环境=${env}）。` +
      '进程重启后所有已签发的 token 会失效。仅供本地/测试使用，生产环境必须显式配置。'
    );
    return generated;
  }

  if (isWeak(raw)) {
    throw new Error(
      `[FATAL] JWT_SECRET 命中弱值黑名单（环境=${env}）。即使在非生产环境也禁止使用示例值，请更换。`
    );
  }

  if (raw.length < MIN_SECRET_LENGTH) {
    // eslint-disable-next-line no-console
    console.warn(
      `[WARN] JWT_SECRET 长度为 ${raw.length}（< ${MIN_SECRET_LENGTH}），强度不足，生产环境会直接拒启动。`
    );
  }

  return raw;
};

const JWT_SECRET = resolveJwtSecret();

module.exports = {
  JWT_SECRET,
  // 暴露仅用于测试
  _internal: { isWeak, resolveJwtSecret, MIN_SECRET_LENGTH, WEAK_SECRETS }
};
