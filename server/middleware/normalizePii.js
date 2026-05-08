/**
 * PRD-2026Q4 T0-7：用户写入路径强制归一化 phone / id_card。
 *
 * 挂载位置：所有会写入 user.phone / user.id_card 的路由（注册 / 绑定手机 /
 * 修改资料 / 注销验证 / 报名联系方式）前置。中间件只在 req.body 存在对应字段
 * 时动作，避免误伤 GET 等无 body 的路由。
 *
 * 失败语义：直接 422 + { code, message }，与已有 errorHandler 解耦——上层
 * 业务报错也走同样的 422 envelope，前端拿 code 做交互即可。
 */

const { normalizePhone, normalizeIdCard, ValidationError } = require('../utils/normalize');

module.exports = (req, res, next) => {
  try {
    if (req.body && req.body.phone !== undefined && req.body.phone !== null && req.body.phone !== '') {
      req.body.phone = normalizePhone(req.body.phone);
    }
    if (req.body && req.body.id_card !== undefined && req.body.id_card !== null && req.body.id_card !== '') {
      req.body.id_card = normalizeIdCard(req.body.id_card);
    }
    if (req.body && req.body.idCard !== undefined && req.body.idCard !== null && req.body.idCard !== '') {
      req.body.idCard = normalizeIdCard(req.body.idCard);
    }
    next();
  } catch (e) {
    if (e instanceof ValidationError) {
      return res.status(e.statusCode).json({ code: e.code, message: e.message });
    }
    next(e);
  }
};
