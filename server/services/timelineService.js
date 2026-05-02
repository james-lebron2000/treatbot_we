/**
 * Phase E.3：跨多份病历的「疾病发展 + 治疗经过」时间线生成服务。
 *
 * 触发场景：
 *   - 用户上传 N 份病历后，前端调用 POST /api/medical/timeline
 *   - records 详情页加载某条 record 时，若该用户共有 ≥ 2 份 completed record，
 *     可以异步触发本服务并把结果缓存到最近一条 record 的 structured.timeline
 *
 * 设计要点：
 *   - 输入：本用户全部 status='completed' 的 record，按 created_at 倒序，最多 6 条
 *     （LLM 输入限到 ~8000 字以内即可保证 OCR-PDF 等场景稳定）
 *   - PII 全程通过 scrubForLlm 占位符化；mapping 严格活到本函数返回
 *   - 主 provider：Doubao/ARK；缺凭证时降级到 Kimi → 仍失败则返回规则兜底（按 created_at 排序的事件列）
 *   - 任何返回都通过 TimelineSchema 校验 —— 解析失败抛 LlmSchemaError 由调用方决定降级
 */

const logger = require('../utils/logger');
const { chatJson, LlmSchemaError } = require('./llmClient');
const { TimelineSchema } = require('./llmSchemas');
const { getPrompt } = require('./promptRegistry');
const { scrubForLlm, restoreFromLlm } = require('../utils/piiScrubber');
const { instrumentLlmCall } = require('./llmObservability');
const ocrConfig = require('../utils/ocrConfig');

const MAX_RECORDS = 6;
const MAX_INPUT_CHARS = 8000;

// 把单条 record 折成给 LLM 看的「第 i 份病历」段落。
// 只取 structured.entities + 关键字段，避免把整份原始 OCR 文本塞回去。
const recordToSnippet = (record, idx) => {
  const e = (record.structured && record.structured.entities) || {};
  const lines = [
    `## 第 ${idx + 1} 份病历（recordId=${record.id}, 上传时间=${(record.created_at || '').toString().slice(0, 10)}）`,
    `- 诊断: ${record.diagnosis || e.diagnosis || '—'}`,
    `- 分期: ${record.stage || e.stage || '—'}`,
    `- 基因变异: ${record.gene_mutation || e.geneMutation || '—'}`,
    `- 治疗记录: ${record.treatment || e.treatment || '—'}`,
    `- 治疗线: ${record.treatment_line || e.treatmentLine || '—'}`,
    `- ECOG: ${e.ecog != null ? e.ecog : '—'}`,
    `- PD-L1: ${record.pdl1 || e.pdl1 || '—'}`,
    `- 既往疗法: ${(e.priorTherapies || []).join('；') || '—'}`,
    `- 合并症: ${(e.comorbidities || []).join('；') || '—'}`
  ];
  // 富化时间线 / 治疗历史（demo 12 节）— 若已经存在，给 LLM 一份「半成品」，让它合并而非重新发明
  if (Array.isArray(e.timeline) && e.timeline.length) {
    lines.push(`- 已有事件: ${e.timeline.slice(0, 6).map((t) => `${t.date || '?'} ${t.event || ''}`).join('；')}`);
  }
  if (Array.isArray(e.treatmentHistory) && e.treatmentHistory.length) {
    lines.push(`- 既往方案: ${e.treatmentHistory.slice(0, 6).map((t) => `${t.name}${t.startDate ? ` (${t.startDate})` : ''}`).join('；')}`);
  }
  // 如有原文则截一段（已在 ocr 阶段被 scrubbed）
  const text = ((record.structured && record.structured.text) || '').toString();
  if (text) {
    lines.push('- 原文摘要:');
    lines.push(text.slice(0, 600));
  }
  return lines.join('\n');
};

/**
 * 规则兜底：当所有 LLM provider 都不可用时，把 records 折成最朴素的时间线，
 * 不调用任何外部 API，保证调用方一定能拿到「某种结果」。
 */
const buildFallbackTimeline = (records) => {
  const events = [];
  records.forEach((r, idx) => {
    const e = (r.structured && r.structured.entities) || {};
    const date = (r.created_at || '').toString().slice(0, 10) || null;
    if (r.diagnosis || e.diagnosis) {
      events.push({
        date,
        type: 'diagnosis',
        title: `${r.diagnosis || e.diagnosis}${(r.stage || e.stage) ? `（${r.stage || e.stage}）` : ''}`,
        detail: '',
        sourceHint: idx + 1
      });
    }
    if (r.treatment || e.treatment) {
      events.push({
        date,
        type: 'treatment_start',
        title: `${r.treatment || e.treatment}`.slice(0, 30),
        detail: '',
        sourceHint: idx + 1
      });
    }
  });
  const latest = records[0] || {};
  const le = (latest.structured && latest.structured.entities) || {};
  return {
    patientSummary: {
      diagnosis: latest.diagnosis || le.diagnosis || null,
      stage: latest.stage || le.stage || null,
      geneMutation: latest.gene_mutation || le.geneMutation || null,
      pdl1: latest.pdl1 || le.pdl1 || null,
      currentLine: latest.treatment_line != null ? Number(latest.treatment_line) : (le.treatmentLine != null ? Number(le.treatmentLine) : null),
      ecog: le.ecog != null ? Number(le.ecog) : null,
      age: le.age != null ? Number(le.age) : null
    },
    events: events.slice(0, 20),
    summaryNarrative: '已根据上传的多份病历生成基础时间线。建议补充就诊日期与疗效评估细节，以便我们更精准地为家人匹配新药。',
    confidence: 0.4,
    provider: 'rule'
  };
};

const buildPromptText = (records) => {
  const snippets = records.map((r, idx) => recordToSnippet(r, idx));
  let joined = snippets.join('\n\n');
  if (joined.length > MAX_INPUT_CHARS) {
    joined = `${joined.slice(0, MAX_INPUT_CHARS)}\n\n...（已截断，共 ${records.length} 份病历）`;
  }
  return joined;
};

/**
 * 生成时间线。
 * @param {Array<MedicalRecord>} records   按 created_at 倒序的多份 completed record
 * @param {Object} [opts]
 * @param {boolean} [opts.restorePii=true]  是否把 LLM 输出里的 <NAME_x>/<PHONE_x> 占位符还原为真实文本。
 *                                          admin 路径应传 false，避免泄漏 PII 给 admin 用户。
 * @returns {Promise<Timeline>}             校验通过的 timeline 对象（含 provider 字段）
 */
const generateTimeline = async (records, opts = {}) => {
  const { restorePii = true } = opts;

  if (!Array.isArray(records) || !records.length) {
    return {
      patientSummary: {
        diagnosis: null, stage: null, geneMutation: null, pdl1: null,
        currentLine: null, ecog: null, age: null
      },
      events: [],
      summaryNarrative: '尚未上传任何病历。上传后我们会自动整理疾病和治疗经过。',
      confidence: 0,
      provider: 'empty'
    };
  }

  const limited = records.slice(0, MAX_RECORDS);
  const recordsText = buildPromptText(limited);

  // 整段 PII 脱敏，mapping 留在函数 scope 内，return 时 restore
  const { scrubbed, mapping } = scrubForLlm(recordsText);

  const tryProvider = async (providerKey) => {
    const prompt = getPrompt('timeline', 'v1', {
      recordsText: scrubbed || recordsText,
      recordCount: limited.length
    });
    const messages = [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ];
    const parsed = await instrumentLlmCall(
      { provider: providerKey, model: process.env[`${providerKey.toUpperCase()}_MODEL`] || 'auto', operation: 'timeline' },
      () => chatJson(providerKey, messages, TimelineSchema)
    );
    return parsed;
  };

  // 主路径：Doubao/ARK → 备路：Kimi → 最终兜底：规则
  const providerOrder = [];
  if (ocrConfig.hasDoubaoCredential()) providerOrder.push('doubao');
  if (ocrConfig.hasKimiCredential()) providerOrder.push('kimi');

  let lastErr;
  for (const p of providerOrder) {
    try {
      const parsed = await tryProvider(p);
      // Phase E.6 / Review #4：admin 路径不还原 PII，避免占位符 → 真姓名/电话泄漏。
      const final = restorePii ? restoreFromLlm(parsed, mapping) : parsed;
      logger.info('timelineService 生成成功', {
        provider: p,
        eventCount: (final.events || []).length,
        confidence: final.confidence,
        restorePii
      });
      return { ...final, provider: p };
    } catch (err) {
      lastErr = err;
      const tag = err instanceof LlmSchemaError ? 'schema_error' : 'network_error';
      logger.warn(`timelineService provider=${p} ${tag}，准备 fallback`, { error: err.message });
    }
  }

  logger.warn('timelineService 所有 LLM provider 均失败，回退到规则兜底', {
    lastErr: lastErr && lastErr.message,
    providersTried: providerOrder
  });
  return buildFallbackTimeline(limited);
};

module.exports = {
  generateTimeline,
  // exposed for unit tests
  __internals: {
    recordToSnippet,
    buildFallbackTimeline,
    buildPromptText,
    MAX_RECORDS,
    MAX_INPUT_CHARS
  }
};
