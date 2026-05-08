/**
 * PRD-2026Q3 T0-1：CRO 跨试验导出的"试验归属校验"
 *
 * 任何 CRO API 处理 trial_ids[] 入参时都必须先调一次 assertTrialOwnership ——
 * 否则越权风险：CRO-A 在 query 里传 trial-of-CRO-B 就能拿到不属于自己的患者数据。
 *
 * 单试验路径（getCroApplications）已在 controller 内联做了 includes 检查；
 * 多试验场景（exportCroApplications / 未来 bulk-status by trial）必须走这里。
 */

class TrialOwnershipError extends Error {
  constructor(unauthorizedTrialIds) {
    super(`无权访问试验: ${unauthorizedTrialIds.join(', ')}`);
    this.name = 'TrialOwnershipError';
    this.unauthorizedTrialIds = unauthorizedTrialIds;
  }
}

/**
 * @param {{ trial_ids?: string[] } | string[]} croOwnedTrialsOrCompany
 *   传 croCompany 对象（取 .trial_ids），或者直接传字符串数组
 * @param {string[]} requestedTrialIds
 * @throws {TrialOwnershipError} 任意一个 trial 不在 CRO 名单内即抛
 */
function assertTrialOwnership(croOwnedTrialsOrCompany, requestedTrialIds) {
  const owned = Array.isArray(croOwnedTrialsOrCompany)
    ? croOwnedTrialsOrCompany
    : (croOwnedTrialsOrCompany?.trial_ids || []);
  const ownedSet = new Set(owned);
  const unauthorized = (requestedTrialIds || []).filter((id) => !ownedSet.has(id));
  if (unauthorized.length) {
    throw new TrialOwnershipError(unauthorized);
  }
}

module.exports = { assertTrialOwnership, TrialOwnershipError };
