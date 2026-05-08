const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const logger = require('./logger');
const { JWT_SECRET } = require('./jwtSecret');

const ADMIN_TOKEN_EXPIRES_IN = parseInt(process.env.ADMIN_LOGIN_TOKEN_TTL || '3600', 10);

// PRD-2026Q3 T1-6：admin 角色枚举
//   super        - 工程 leader，可看 PII / 改 CRO / 计费
//   ops          - 运营，看脱敏列表 + 改报名状态 + 试验维护
//   cro_liaison  - 客户关系，CRO 公司维护 + 导出（脱敏）
// ADMIN_ROLES 顺序无关，仅做集合校验用。
const ADMIN_ROLES = new Set(['super', 'ops', 'cro_liaison']);
const DEFAULT_ROLE = 'super';

const normalize = (value) => `${value || ''}`.trim();

const constantTimeEqual = (left, right) => {
  const leftBuffer = Buffer.from(`${left || ''}`);
  const rightBuffer = Buffer.from(`${right || ''}`);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const sha256 = (value) => crypto.createHash('sha256').update(`${value || ''}`).digest('hex');

const sanitizeRole = (raw) => {
  const role = normalize(raw).toLowerCase();
  return ADMIN_ROLES.has(role) ? role : DEFAULT_ROLE;
};

// 解析 ADMIN_ACCOUNTS_JSON：多账号、多角色的统一来源。
// 示例：
//   ADMIN_ACCOUNTS_JSON='[
//     {"username":"alice","keyHash":"sha256:abcd...","role":"super","canReveal":true},
//     {"username":"bob",  "keyHash":"sha256:efgh...","role":"ops"},
//     {"username":"carol","keyHash":"sha256:ijkl...","role":"cro_liaison"}
//   ]'
// 解析失败 / 不存在则返回 []，让单账号 ENV 路径接管。
const parseAccountsEnv = () => {
  const raw = normalize(process.env.ADMIN_ACCOUNTS_JSON);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((a) => a && typeof a === 'object' && a.username && a.keyHash)
      .map((a) => ({
        username: normalize(a.username),
        keyHash: normalize(a.keyHash),
        role: sanitizeRole(a.role),
        canReveal: Boolean(a.canReveal)
      }));
  } catch (e) {
    logger.warn('[adminCredential] ADMIN_ACCOUNTS_JSON 解析失败，已忽略', { err: e.message });
    return [];
  }
};

const getConfiguredAdmin = () => {
  // back-compat：单账号 ENV，自动 role=super，canReveal 受 ADMIN_LOGIN_CAN_REVEAL 控制。
  const username = normalize(process.env.ADMIN_LOGIN_USERNAME);
  const keyHash = normalize(process.env.ADMIN_LOGIN_KEY_HASH);
  if (!username || !keyHash) {
    return null;
  }
  return {
    username,
    keyHash,
    role: sanitizeRole(process.env.ADMIN_LOGIN_ROLE) || DEFAULT_ROLE,
    canReveal: process.env.ADMIN_LOGIN_CAN_REVEAL === 'true'
  };
};

// 全集合：JSON 多账号 + 单账号 ENV，按 username 去重（JSON 优先）。
const getConfiguredAccounts = () => {
  const json = parseAccountsEnv();
  const single = getConfiguredAdmin();
  const map = new Map(json.map((a) => [a.username, a]));
  if (single && !map.has(single.username)) {
    map.set(single.username, single);
  }
  return Array.from(map.values());
};

// PRD-2026Q4 T0-7 followup（admin login timing attack / OWASP A07）：
// 老实现在 username 找不到时 early-return，跳过 SHA-256 + constant-time hash
// compare。攻击者通过响应耗时可以区分：
//   - "用户名未知"     → 几十 µs 内返回（仅 username find loop）
//   - "用户名命中、key 错" → 几百 µs 后返回（多了一次 SHA-256 + hash compare）
// 单次差距 ≪ 网络抖动，但配合大量样本 + LAN 延迟可放大为可分辨差异。
// 这是一个教科书级 OWASP A07 反模式，审计必挂。
//
// 修复：永远走相同路径——
//   1) 始终对 inputKey 做一次 sha256；
//   2) 找不到 account 时用 sentinel keyHash（全 0 的 64 位 hex），让 constant-time
//      compare 也跑完整 64 字节比对；
//   3) 最后用 (matched && hashMatches) 决定 ok。
//
// 64 字节常量哈希——选 'a' × 64 而非 'f' × 64 / '0' × 64 是为了避免与极端弱口令
// 巧合（如 sha256("") = e3b0...，sha256("admin") 等都不命中 'a'×64）。
const SENTINEL_KEYHASH = 'a'.repeat(64);

const verifyAdminCredential = ({ username, key }) => {
  const accounts = getConfiguredAccounts();
  const notConfigured = !accounts.length;

  const inputUser = normalize(username);
  // username compare 这里不需要 constant-time——username 不是机密（管理员邮箱 / 工号
  // 通常半公开），且后续的 hash compare 才是身份校验主线。但仍然要保证 path 长度一致。
  const matched = !notConfigured && accounts.find((a) => a.username === inputUser) || null;
  const target = matched || { keyHash: `sha256:${SENTINEL_KEYHASH}` };

  const expectedHash = target.keyHash.startsWith('sha256:')
    ? target.keyHash.slice('sha256:'.length)
    : target.keyHash;
  const actualHash = sha256(key);
  const hashMatches = constantTimeEqual(actualHash, expectedHash);

  if (notConfigured) {
    return { ok: false, reason: 'not_configured' };
  }
  if (!matched || !hashMatches) {
    return { ok: false, reason: 'invalid' };
  }

  return {
    ok: true,
    admin: {
      id: `admin:${matched.username}`,
      username: matched.username,
      role: matched.role,
      canReveal: matched.canReveal
    }
  };
};

const issueAdminToken = (admin) => jwt.sign(
  {
    type: 'admin',
    adminId: admin.id,
    adminUsername: admin.username,
    role: admin.role || DEFAULT_ROLE,
    canReveal: Boolean(admin.canReveal)
  },
  JWT_SECRET,
  { expiresIn: ADMIN_TOKEN_EXPIRES_IN }
);

const verifyAdminToken = (token) => {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (decoded.type !== 'admin' || !decoded.adminUsername || !decoded.adminId) {
    return null;
  }
  return {
    id: decoded.adminId,
    username: decoded.adminUsername,
    // 老 token 没有 role 字段：兜底 'super' 让历史会话不至于直接踢下线，
    // 真正强制角色门由 requireRole 中间件在路由层把关。
    role: sanitizeRole(decoded.role) || DEFAULT_ROLE,
    canReveal: Boolean(decoded.canReveal)
  };
};

module.exports = {
  ADMIN_TOKEN_EXPIRES_IN,
  ADMIN_ROLES: Array.from(ADMIN_ROLES),
  DEFAULT_ROLE,
  getConfiguredAdmin,
  getConfiguredAccounts,
  verifyAdminCredential,
  issueAdminToken,
  verifyAdminToken,
  sanitizeRole
};
