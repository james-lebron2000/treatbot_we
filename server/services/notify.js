// PRD-2026Q3 P2-5：通知微服务的统一入口（当前阶段为 stub）。
// 目标：T0-2 状态机产生 transition 后调一次 notify.applicationStatusChanged，
// 让"用户被联系/初筛通过/入组"这种关键节点有 SMS / 站内信 / 微信触达。
// 现阶段只 logger.info，等 P2-5 接入时把这层换成真正的 队列 publish 即可，
// 上游（controllers + state machine）不需要改 import 路径。

const logger = require('../utils/logger');

const applicationStatusChanged = async ({ applicationId, from, to, actor, reason }) => {
  logger.info('[notify:stub] application status changed', {
    applicationId, from, to, actorType: actor && actor.type, actorId: actor && actor.id, reason: reason || null
  });
  // TODO(P2-5)：投递到通知微服务的 message bus（Bull queue 或 HTTP webhook）。
};

module.exports = {
  applicationStatusChanged
};
