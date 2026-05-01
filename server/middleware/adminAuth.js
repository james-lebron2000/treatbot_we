const { User } = require('../models');
const logger = require('../utils/logger');
const { verifyAdminToken } = require('../utils/adminCredential');

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
        canReveal: admin.canReveal
      };
      req.adminCredential = admin;
      req.userId = admin.id;
      return next();
    }
  } catch (error) {
    // 不是专用 admin token 时继续尝试兼容旧的用户白名单 token。
  }

  return requireAdmin(req, res, next);
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

module.exports = { requireAdmin, requireAdminToken };
