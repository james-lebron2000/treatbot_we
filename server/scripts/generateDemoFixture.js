/**
 * generateDemoFixture.js — 用真实 matchEngine 为 demo 样例生成 top-5 匹配结果
 *
 * 读取 fixtures/demoSamples.json，对每个 sample.matchInput 跑全量试验评分，
 * 取 top 5 回写到 sample.matches。一次性脚本，需在 trials_data.json 变更后重跑。
 *
 * 不依赖数据库：通过 scripts/importTrials.js 的 mapTrial() 把 raw JSON 转为 Trial shape。
 */

const fs = require('fs');
const path = require('path');

const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'demoSamples.json');
const TRIALS_DATA_PATH = path.join(__dirname, '..', 'data', 'trials_data.json');

const { mapTrial } = require('./importTrials');
const { scoreRecordAgainstTrial, STATUS_TEXT_MAP } = require('../services/matchEngine');

const loadAllTrials = () => {
  const raw = JSON.parse(fs.readFileSync(TRIALS_DATA_PATH, 'utf-8'));
  const recruiting = Array.isArray(raw) ? raw : (raw['1.招募中项目'] || []);
  // demo 中只推荐招募中的试验
  return recruiting.map(mapTrial).filter((t) => t && t.status === 'recruiting');
};

const toApiMatch = (trial, scored) => ({
  id: trial.id,
  name: trial.name,
  score: scored.score,
  phase: trial.phase || '',
  location: trial.location || '',
  indication: trial.indication || '',
  institution: trial.institution || '',
  reasons: scored.reasons || [],
  statusText: STATUS_TEXT_MAP[trial.status] || '招募中'
});

const generate = () => {
  const trials = loadAllTrials();
  console.log(`[demo-fixture] 加载 ${trials.length} 条招募中试验`);

  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8'));

  fixture.samples.forEach((sample) => {
    const input = sample.matchInput;
    const scored = trials
      .map((trial) => ({ trial, scored: scoreRecordAgainstTrial(input, trial) }))
      .filter(({ scored }) => scored && !scored.excluded)
      .sort((a, b) => b.scored.score - a.scored.score)
      .slice(0, 5)
      .map(({ trial, scored }) => toApiMatch(trial, scored));

    sample.matches = scored;
    console.log(
      `[demo-fixture] ${sample.id} → top 5: ` +
        scored.map((m) => `${m.name.slice(0, 20)}(${m.score})`).join(', ')
    );
  });

  fs.writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2) + '\n', 'utf-8');
  console.log(`[demo-fixture] 已写回 ${FIXTURE_PATH}`);
};

if (require.main === module) {
  try {
    generate();
  } catch (err) {
    console.error('[demo-fixture] 失败:', err);
    process.exit(1);
  }
}

module.exports = { generate, loadAllTrials };
