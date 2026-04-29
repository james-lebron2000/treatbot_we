/**
 * PRD-2026Q2 §3.3：统一响应信封中间件。
 *
 * - `res.ok(data, message?)` → 200 + `{ code: 0, message, data }`
 * - `res.fail(messageOrCode, statusCode?, data?)` → statusCode + `{ code, message, data }`
 * - `res.paginated(list, pagination, message?)` → 200 + `{ code: 0, message, data: { list, pagination } }`
 *
 * 设计要点：
 *  - 与 utils/response.js 的 success/error/pagination 完全同构（信封 shape 一致），
 *    既支持已有 `res.json(success(...))` 写法不动，又能让新代码少写两层。
 *  - 不包一层全局的 res.json 代理，避免误把二进制响应 / Content-Disposition 附件
 *    （如 CSV 导出、代理下载）套上 JSON 包裹。业务自己决定走哪条路。
 */

const { success, error, pagination } = require('../utils/response');

const responseEnvelope = (req, res, next) => {
  res.ok = (data = null, message = 'success') => res.json(success(data, message));

  res.fail = (messageOrCode = 'error', statusCode = 500, data = null) => {
    let message = messageOrCode;
    let code = statusCode;
    if (typeof messageOrCode === 'number') {
      code = messageOrCode;
      message = statusCode && typeof statusCode === 'string' ? statusCode : 'error';
      statusCode = messageOrCode;
    }
    return res.status(statusCode).json(error(message, code, data));
  };

  res.paginated = (list = [], paginationPayload = {}, message = 'success') => {
    const envelope = pagination(list, paginationPayload);
    if (message && message !== 'success') {
      envelope.message = message;
    }
    return res.json(envelope);
  };

  next();
};

module.exports = { responseEnvelope };
