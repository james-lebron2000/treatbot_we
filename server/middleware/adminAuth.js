const { User } = require('../models');
const logger = require('../utils/logger');

const parseAllowList = (value) => new Set(
  `${value || ''}`
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
);

const ADMIN_USER_IDS = parseAllowList(process.env.ADMIN_USER_IDS);
const ADMIN_OPENIDS = parseAllowList(process.env.ADMIN_OPENIDS);
const ADMIN_PHONES = parseAllowList(process.env.ADMIN_PHONES);

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

module.exports = { requireAdmin };
