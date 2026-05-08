const { User } = require('../models');
const logger = require('../utils/logger');
const { verifyAdminToken, sanitizeRole, DEFAULT_ROLE } = require('../utils/adminCredential');

const parseAllowList = (value) => new Set(
  `${value || ''}`
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
);

const ADMIN_USER_IDS = parseAllowList(process.env.ADMIN_USER_IDS);
const ADMIN_OPENIDS = parseAllowList(process.env.ADMIN_OPENIDS);
const ADMIN_PHONES = parseAllowList(process.env.ADMIN_PHONES);

const extractBearerToken = (req) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return '';
  }
  return authHeader.slice(7);
};

const requireAdminToken = async (req, res, next) => {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({
      code: 401,
      message: '缺少管理员认证令牌',
      data: null
    });
  }

  try {
    const admin = verifyAdminToken(token);
    if (admin) {
      req.adminUser = {
        id: admin.id,
        username: admin.username,
        role: admin.role || DEFAULT_ROLE,
        canReveal: admin.canReveal
      };
      req.adminCredential = admin;
      req.adminRole = req.adminUser.role;
      req.userId = admin.id;
      return next();
    }
  } catch (error) {
    // 不是专用 admin token 时继续尝试兼容旧的用户白名单 token。
  }

  return requireAdmin(req, res, next);
};

// PRD-2026Q3 T1-6：路由级角色门。requireAdminToken 之后挂，
// 用法：router.get('/admin/users/:id/reveal', authMiddleware, requireAdminToken,
//         requireRole('super'), logAdmin('reveal_field'), adminController.revealField);
//
// 行为：
//   - 没解析出 adminRole（旧 user-allowlist 路径）→ 兜底 DEFAULT_ROLE='super'，
//     这样在 RBAC 全量启用前，旧 admin 账号不会被锁在门外；上线后通过下线 user-allowlist 收口。
//   - role 不在允许集合 → 403，并写一条 warn 日志（含 username + 目标 action）。
//   - 允许任意一个匹配即放行（OR 语义）。
const requireRole = (...allowedRoles) => {
  const allowed = new Set(allowedRoles.map((r) => sanitizeRole(r)));
  return (req, res, next) => {
    const role = sanitizeRole(req.adminRole || (req.adminUser && req.adminUser.role));
    if (!allowed.has(role)) {
      logger.warn('[RBAC] 角色不足', {
        adminUsername: req.adminUser && req.adminUser.username,
        adminId: req.adminUser && req.adminUser.id,
        role,
        required: Array.from(allowed),
        path: req.path
      });
      return res.status(403).json({
        code: 403,
        message: '角色权限不足',
        data: { required: Array.from(allowed), actual: role }
      });
    }
    next();
  };
};

const requireAdmin = async (req, res, next) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        code: 401,
        message: '缺少认证令牌',
        data: null
      });
    }

    const user = await User.findByPk(req.userId, {
      attributes: ['id', 'openid', 'phone']
    });

    if (!user) {
      return res.status(401).json({
        code: 401,
        message: '用户不存在',
        data: null
      });
    }

    const allowed = ADMIN_USER_IDS.has(user.id)
      || ADMIN_OPENIDS.has(user.openid)
      || (user.phone && ADMIN_PHONES.has(user.phone));

    if (!allowed) {
      logger.warn('管理员权限校验失败', {
        userId: req.userId,
        openid: user.openid,
        phone: user.phone
      });

      return res.status(403).json({
        code: 403,
        message: '需要管理员权限',
        data: null
      });
    }

    req.adminUser = user;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { requireAdmin, requireAdminToken, requireRole };
