const SCORE_MIN = 60;

const STATUS_TEXT_MAP = {
  recruiting: '招募中',
  closed: '已关闭',
  completed: '已结束'
};

const safeLower = (value) => (value || '').toString().toLowerCase();

const parseArrayField = (value) => {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }
  return [];
};

const getTrialText = (trial) => {
  return [
    trial.name,
    trial.indication,
    trial.description,
    ...(parseArrayField(trial.inclusion_criteria)),
    ...(parseArrayField(trial.exclusion_criteria))
  ].join(' ');
};

const scoreRecordAgainstTrial = (record, trial) => {
  let score = 35;
  const reasons = [];
  const trialText = safeLower(getTrialText(trial));
  const indicationText = safeLower(trial.indication);

  if (safeLower(record.diagnosis) && trialText.includes(safeLower(record.diagnosis))) {
    score += 32;
    reasons.push('诊断信息与试验适应症高度相关');
  } else if (safeLower(record.diagnosis) && indicationText.includes(safeLower(record.diagnosis).slice(0, 4))) {
    score += 18;
    reasons.push('诊断信息与试验适应症部分匹配');
  }

  if (safeLower(record.gene_mutation) && trialText.includes(safeLower(record.gene_mutation))) {
    score += 25;
    reasons.push('基因突变信息符合试验入组要求');
  }

  if (safeLower(record.stage) && trialText.includes(safeLower(record.stage))) {
    score += 8;
    reasons.push('分期信息在试验标准中有对应条件');
  }

  if (trial.status === 'recruiting') {
    score += 8;
    reasons.push('试验当前处于招募中');
  }

  if (reasons.length === 0) {
    reasons.push('已根据病历基础信息进行规则匹配');
  }

  return {
    score: Math.min(99, score),
    reasons
  };
};

const buildMatchItem = (trial, scored) => ({
  id: trial.id,
  trialId: trial.id,
  name: trial.name,
  score: scored.score,
  phase: trial.phase || '未标注',
  location: trial.location || '待补充',
  type: trial.type || '未标注',
  indication: trial.indication || '待补充',
  institution: trial.institution || '待补充',
  status: trial.status,
  statusText: STATUS_TEXT_MAP[trial.status] || trial.status,
  reasons: scored.reasons
});

const matchRecordsToTrials = (records, trials, minScore = SCORE_MIN) => {
  const matches = [];
  for (const trial of trials) {
    let best = null;
    for (const record of records) {
      const scored = scoreRecordAgainstTrial(record, trial);
      if (!best || scored.score > best.score) {
        best = scored;
      }
    }
    if (best && best.score >= minScore) {
      matches.push(buildMatchItem(trial, best));
    }
  }
  matches.sort((a, b) => b.score - a.score);
  return matches;
};

module.exports = {
  SCORE_MIN,
  STATUS_TEXT_MAP,
  parseArrayField,
  scoreRecordAgainstTrial,
  matchRecordsToTrials
};
