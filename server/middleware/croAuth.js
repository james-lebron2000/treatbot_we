const jwt = require('jsonwebtoken');
const { CroCompany } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * CRO 认证中间件
 * 从 JWT 中读取 croId + role=cro，查询 CroCompany 并挂载到 req.croCompany
 */
const croAuthMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: '缺少认证令牌', data: null });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.role !== 'cro' || !decoded.croId) {
      return res.status(403).json({ code: 403, message: '非 CRO 账号', data: null });
    }

    const company = await CroCompany.findByPk(decoded.croId);
    if (!company || company.status !== 'active') {
      return res.status(403).json({ code: 403, message: '账号已被禁用', data: null });
    }

    req.croCompany = company;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ code: 401, message: '令牌已过期', data: { expired: true } });
    }
    return res.status(401).json({ code: 401, message: '无效的令牌', data: null });
  }
};

module.exports = { croAuthMiddleware };
