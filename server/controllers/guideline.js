/**
 * guideline.js — A 轨控制器：返回「标准治疗（指南）」匹配（P1）
 *
 * 与 B 轨（match.js）复用同一份病历 → structuredProfile，但出口是「规范治疗大概是什么」，
 * 而不是临床试验。家属先用 A 轨看懂病、建立「尺子」，再去看 B 轨的试验。
 *
 * GET /api/medical/guidelines[?recordId=]
 *   - 不传 recordId：取用户全部已完成病历，合并成画像
 *   - 传 recordId：仅用该病历
 * 响应：{ code, message, data: <matchGuidelines 结果>, safety: <红旗> }
 */

const { MedicalRecord } = require('../models');
const { BusinessError } = require('../middleware/errorHandler');
const { buildProfile } = require('../services/patientProfile');
const { matchGuidelines, listCancers, getCancerEducation } = require('../services/guidelineMatcher');
const { detectRedFlags, buildSearchableText } = require('../services/redFlags');
const { safeText } = require('../utils/text');
const logger = require('../utils/logger');

const RECORD_ATTRS = ['id', 'diagnosis', 'stage', 'gene_mutation', 'treatment_line', 'pdl1', 'structured', 'created_at'];

const getUserCompletedRecords = (userId) =>
  MedicalRecord.findAll({
    where: { user_id: userId, status: 'completed', deleted_at: null },
    attributes: RECORD_ATTRS,
    order: [['created_at', 'DESC']]
  });

const getGuidelines = async (req, res, next) => {
  try {
    const recordId = safeText(req.query.recordId);

    let records = [];
    if (recordId) {
      const record = await MedicalRecord.findOne({
        where: { id: recordId, user_id: req.userId, deleted_at: null },
        attributes: RECORD_ATTRS
      });
      if (!record) {
        throw new BusinessError('病历不存在或无权限访问', 404);
      }
      records = [record];
    } else {
      records = await getUserCompletedRecords(req.userId);
    }

    // 急症红旗（与 B 轨同源），A 轨页面也要能首屏提示就医。
    const safety = detectRedFlags(buildSearchableText(records));

    if (!records.length) {
      // 没有病历也返回一个「未匹配」骨架，前端引导去上传。
      const empty = matchGuidelines(null);
      return res.json({ code: 0, message: 'success', data: empty, safety });
    }

    const { structuredProfile } = buildProfile(records);
    const result = matchGuidelines(structuredProfile);

    return res.json({ code: 0, message: 'success', data: result, safety });
  } catch (err) {
    if (err instanceof BusinessError) return next(err);
    logger.error('[guideline] getGuidelines 失败', { error: err.message });
    return next(err);
  }
};

// 病种科普（公开，无 PHI）：列出覆盖癌种。
const getCancerList = (req, res) => res.json({ code: 0, message: 'success', data: listCancers() });

// 病种科普（公开，无 PHI）：按癌种返回标准治疗概览；未收录返回 matched=false 骨架。
const getCancerEducationHandler = (req, res) => {
  const key = safeText(req.params.key);
  const edu = getCancerEducation(key) || matchGuidelines(null);
  return res.json({ code: 0, message: 'success', data: edu });
};

module.exports = { getGuidelines, getCancerList, getCancerEducationHandler, getUserCompletedRecords };
