#!/usr/bin/env node
/**
 * batch_match_patients.js
 * Reads scripts/output/patient_profiles.json,
 * normalizes trials_data.json via importTrials.mapTrial,
 * runs matchRecordsToTrials, and writes match_results.json + match_report.md
 */

const path = require('path');
const fs = require('fs');

const { matchRecordsToTrials } = require('../server/services/matchEngine');
const { mapTrial } = require('../server/scripts/importTrials');
const { pickTrialsForPatient } = require('./lib/trial-picker');

const OUT_DIR = path.join(__dirname, 'output');
const PROFILES_PATH = path.join(OUT_DIR, 'patient_profiles.json');
const TRIALS_PATH = path.join(__dirname, '..', 'server', 'data', 'trials_data.json');

console.log('加载试验库...');
const rawTrials = require(TRIALS_PATH);
const trialsRaw = Array.isArray(rawTrials) ? rawTrials : (rawTrials['1.招募中项目'] || []);
console.log(`原始试验数：${trialsRaw.length}`);

const trials = trialsRaw.map((src) => {
  try { return mapTrial(src); } catch (_) { return null; }
}).filter(Boolean);
console.log(`归一化后：${trials.length}`);

const profiles = JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf-8'));
console.log(`患者数：${profiles.length}`);

const results = [];
// 引擎阈值放到 30：picker 的 Layer 1 会再用 40 做硬门槛，这里给 picker 更宽的池子
const MIN_SCORE = 30;

for (const p of profiles) {
  try {
    const record = {
      diagnosis: p.diagnosis || '',
      stage: p.stage || '',
      gene_mutation: (p.geneMutations || []).join('; '),
      treatment: p.treatment || '',
      pdl1: p.pdl1 || '',
      treatment_line: p.treatmentLine,
      ecog: p.ecog,
      age: p.age,
      _city: p.city || null,
      structured: {
        entities: {
          diagnosis: p.diagnosis,
          stage: p.stage,
          age: p.age,
          ecog: p.ecog,
          pdl1: p.pdl1,
          treatmentLine: p.treatmentLine,
          treatment: p.treatment,
          geneMutation: (p.geneMutations || []).join('; '),
          priorTherapies: p.priorTherapies || [],
          comorbidities: p.comorbidities || []
        }
      }
    };
    const matches = matchRecordsToTrials([record], trials, MIN_SCORE);
    const top = matches.slice(0, 10);

    // 以病人为中心的三层筛选（硬门槛 → 自适应阈值 → 多样性 re-rank）
    const { picks, threshold, reason, stats } = pickTrialsForPatient(matches);

    results.push({
      profile: p,
      total: matches.length,
      matches: top,             // 保留 Top 10 做回溯
      picks,                    // 精选（3–10 条）
      pickReason: reason,       // 'adaptive' | 'floor-fallback' | 'empty-fallback'
      pickThreshold: threshold,
      pickStats: stats
    });
    console.log(
      `✓ ${p.id} → 候选 ${matches.length} → 精选 ${picks.length} 条` +
      `（阈值 ${threshold}，策略 ${reason}，Top1=${top[0]?.score ?? '-'}）`
    );
  } catch (e) {
    console.error(`✗ ${p.id} 失败:`, e.message);
    results.push({
      profile: p, total: 0, matches: [], picks: [],
      pickReason: 'empty-fallback', pickThreshold: null, pickStats: null,
      error: e.message
    });
  }
}

fs.writeFileSync(path.join(OUT_DIR, 'match_results.json'), JSON.stringify(results, null, 2));
console.log(`写出 ${path.join(OUT_DIR, 'match_results.json')}`);

// ---------- Markdown 报告 ----------
const lines = [];
const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
lines.push('# 患者批量匹配报告');
lines.push('');
lines.push(`运行时间：${now}`);
lines.push(`病例数：${profiles.length}  试验库规模：${trials.length} 条招募中项目`);
lines.push(`最低匹配度阈值：${MIN_SCORE}`);
lines.push('');

lines.push('## 总览');
lines.push('');
lines.push('| 患者 ID | 主诊断 | 分期 | 治疗线 | 关键基因 | 城市 | 匹配总数 | Top1 试验 | Top1 分数 |');
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of results) {
  const p = r.profile;
  const top1 = r.matches[0];
  const gene = (p.geneMutations || []).slice(0, 3).join('；') || '-';
  const topName = top1 ? (top1.name?.slice(0, 40) || top1.id) : '—';
  const topScore = top1 ? top1.score : '—';
  lines.push(`| ${p.id} | ${p.diagnosis || '-'} | ${p.stage || '-'} | ${p.treatmentLine ?? '-'} | ${gene} | ${p.city || '-'} | ${r.total} | ${topName} | ${topScore} |`);
}
lines.push('');

lines.push('## 逐患者详情');
lines.push('');
for (const r of results) {
  const p = r.profile;
  lines.push(`### ${p.id}`);
  lines.push('');
  lines.push('**病例摘要**');
  lines.push('');
  lines.push(`- 主诊断：${p.diagnosis || '-'}`);
  lines.push(`- 分期：${p.stage || '-'}`);
  lines.push(`- 年龄 / 性别：${p.age ?? '-'} / ${p.gender || '-'}`);
  lines.push(`- ECOG：${p.ecog ?? '-'}`);
  lines.push(`- PD-L1：${p.pdl1 || '-'}`);
  lines.push(`- 治疗线数：${p.treatmentLine ?? '-'}`);
  lines.push(`- 既往治疗：${p.treatment || '-'}`);
  lines.push(`- 基因变异：${(p.geneMutations || []).join('；') || '-'}`);
  lines.push(`- 既往用药：${(p.priorTherapies || []).join('、') || '-'}`);
  lines.push(`- 合并症：${(p.comorbidities || []).join('、') || '-'}`);
  lines.push(`- 城市：${p.city || '-'}`);
  if (p.notes) lines.push(`- 备注：${p.notes}`);
  lines.push(`- 匹配总数（≥${MIN_SCORE}）：${r.total}`);
  lines.push('');

  if (r.error) {
    lines.push(`> 匹配失败：${r.error}`);
    lines.push('');
    continue;
  }

  if (r.matches.length === 0) {
    lines.push('> 暂无达到阈值的试验。');
    lines.push('');
    continue;
  }

  lines.push('**Top 10 匹配试验**');
  lines.push('');
  lines.push('| 试验 ID | 试验名 | 分数 | 阶段 | 机构 | 关键匹配原因 |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const m of r.matches) {
    const reasons = (m.reasons || []).slice(0, 3).map(s => s.replace(/\|/g, '/').replace(/\n/g, ' ')).join('；');
    const name = (m.name || '').slice(0, 50).replace(/\|/g, '/');
    const inst = (m.institution || '').slice(0, 24).replace(/\|/g, '/');
    lines.push(`| ${m.id} | ${name} | ${m.score} | ${m.phase} | ${inst} | ${reasons} |`);
  }
  lines.push('');
}

lines.push('## 全局观察');
lines.push('');
const highHit = results.filter(r => (r.matches[0]?.score ?? 0) >= 60).length;
const midHit = results.filter(r => (r.matches[0]?.score ?? 0) >= 45 && (r.matches[0]?.score ?? 0) < 60).length;
const lowHit = results.filter(r => (r.matches[0]?.score ?? 0) < 45).length;
lines.push(`- 高分患者（Top1 ≥ 60）：${highHit} / ${results.length}`);
lines.push(`- 中等匹配（45 ≤ Top1 < 60）：${midHit}`);
lines.push(`- 低匹配（Top1 < 45）：${lowHit}`);

// 常见缺失证据
const missingCity = results.filter(r => !r.profile.city).length;
const missingEcog = results.filter(r => r.profile.ecog == null).length;
const missingPdl1 = results.filter(r => !r.profile.pdl1).length;
const missingGene = results.filter(r => !r.profile.geneMutations || r.profile.geneMutations.length === 0).length;
const missingLine = results.filter(r => r.profile.treatmentLine == null).length;
lines.push('');
lines.push('**常见缺失信息**');
lines.push('');
lines.push(`- 未提供 ECOG：${missingEcog}`);
lines.push(`- 未提供 PD-L1：${missingPdl1}`);
lines.push(`- 未提供基因变异：${missingGene}`);
lines.push(`- 未提供治疗线数：${missingLine}`);
lines.push(`- 未提供常住城市：${missingCity}`);

// 癌种分布
const cancerCount = {};
for (const r of results) {
  const d = r.profile.diagnosis || '未知';
  cancerCount[d] = cancerCount[d] || { count: 0, avgTop: 0, hits: 0 };
  cancerCount[d].count += 1;
  if (r.matches[0]) {
    cancerCount[d].avgTop += r.matches[0].score;
    cancerCount[d].hits += 1;
  }
}
lines.push('');
lines.push('**按癌种分布与命中情况**');
lines.push('');
lines.push('| 癌种 | 病例数 | 平均 Top1 分数 |');
lines.push('| --- | --- | --- |');
for (const [d, v] of Object.entries(cancerCount).sort((a, b) => b[1].count - a[1].count)) {
  const avg = v.hits ? (v.avgTop / v.hits).toFixed(1) : '—';
  lines.push(`| ${d} | ${v.count} | ${avg} |`);
}

fs.writeFileSync(path.join(OUT_DIR, 'match_report.md'), lines.join('\n'));
console.log(`写出 ${path.join(OUT_DIR, 'match_report.md')}`);
