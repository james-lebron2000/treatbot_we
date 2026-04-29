/**
 * PRD-2026Q2 §2.3：Admin 审计日志中间件。
 *
 * 用法：
 *   router.get('/admin/users', authMiddleware, requireAdmin,
 *     logAdmin('view_users'),
 *     adminController.getUserList);
 *
 * 行为：
 *   1. 在 response 的 `finish` 事件里异步写一条 admin_audit_log；
 *      写库失败 try-catch 吞掉，永远不阻塞主业务。
 *   2. query_summary = JSON.stringify({ query, params, bodyKeys }).slice(0, 1000)
 *      —— 只记 body 的 key 名，不记 value，避免把密码 / token 等明文落库。
 *   3. targetTypeGetter(req) 可选，用来把目标资源信息写进去（如 revealField 的 userId/field）。
 */

const logger = require('../utils/logger');
const { AdminAuditLog } = require('../models');

const SUMMARY_MAX_LEN = 1000;

const safeSummary = (req) => {
  try {
    const payload = {
      query: req.query || {},
      params: req.params || {},
      bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body) : []
    };
    const raw = JSON.stringify(payload);
    return raw.length > SUMMARY_MAX_LEN ? raw.slice(0, SUMMARY_MAX_LEN) : raw;
  } catch (error) {
    return '';
  }
};

const resolveTarget = (getter, req) => {
  if (!getter) return { targetType: null, targetId: null };
  try {
    const result = typeof getter === 'function' ? getter(req) : getter;
    if (!result || typeof result !== 'object') {
      return { targetType: null, targetId: null };
    }
    return {
      targetType: result.targetType || result.type || null,
      targetId: result.targetId || result.id || null
    };
  } catch (error) {
    return { targetType: null, targetId: null };
  }
};

const logAdmin = (action, targetTypeGetter) => (req, res, next) => {
  res.on('finish', () => {
    // 失败的请求（4xx/5xx）也记录，用于异常访问排查。
    const adminId = req.adminUser?.id || req.userId || 'unknown';
    const { targetType, targetId } = resolveTarget(targetTypeGetter, req);
    const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim().slice(0, 64);
    const ua = (req.headers['user-agent'] || '').toString().slice(0, 255);

    Promise.resolve()
      .then(() => AdminAuditLog.create({
        admin_id: adminId,
        action,
        target_type: targetType,
        target_id: targetId,
        query_summary: safeSummary(req),
        ip,
        user_agent: ua
      }))
      .catch((error) => {
        // 审计失败不能影响主链路，只记 warn 日志。
        logger.warn('[auditLog] 写入失败', {
          action,
          adminId,
          error: error.message
        });
      });
  });

  next();
};

module.exports = { logAdmin };
