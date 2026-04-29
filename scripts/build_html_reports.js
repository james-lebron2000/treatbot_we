#!/usr/bin/env node
/**
 * Build HTML + PDF reports for 16 patients.
 *
 * Inputs:
 *   scripts/output/patient_profiles.json
 *   scripts/output/match_results.json
 *   scripts/output/raw_texts/*.txt
 *
 * Outputs:
 *   scripts/output/html/index.html              总览
 *   scripts/output/html/overview.pdf            总览 PDF
 *   scripts/output/html/assets/style.css        共享样式
 *   scripts/output/html/patients/<id>/index.html
 *   scripts/output/html/patients/<id>/report.pdf
 *   scripts/output/html/patients/<id>/raw.txt
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT_ROOT = path.resolve(__dirname, 'output');
const HTML_ROOT = path.join(OUT_ROOT, 'html');
const ASSETS = path.join(HTML_ROOT, 'assets');
const PATIENTS = path.join(HTML_ROOT, 'patients');
const RAW_TEXTS = path.join(OUT_ROOT, 'raw_texts');

const profiles = JSON.parse(fs.readFileSync(path.join(OUT_ROOT, 'patient_profiles.json'), 'utf8'));
const matchesArr = JSON.parse(fs.readFileSync(path.join(OUT_ROOT, 'match_results.json'), 'utf8'));

// ---------- id rename (cancer·line·4-letter-code) ----------

const LINE_LABEL = { 1: '一线', 2: '二线', 3: '三线', 4: '四线', 5: '五线' };

function normalizeCancer(dx) {
  if (!dx) return '其他';
  const s = String(dx);
  if (/胰腺/.test(s)) return '胰腺癌';
  if (/胶质母/.test(s)) return '胶质母';
  if (/尿路上皮/.test(s)) return '尿路上皮癌';
  if (/胆管/.test(s)) return '胆管癌';
  if (/肝/.test(s)) return '肝癌';
  if (/结直肠|结肠|直肠/.test(s)) return '结直肠癌';
  if (/胃/.test(s)) return '胃癌'; // covers 胃贲门癌
  return s.replace(/[\(（].*$/, '').trim();
}

function extractCode(origId) {
  if (/^CRC/i.test(origId)) return 'CRC';
  // strip leading "姓名：" etc.
  const cleaned = origId.replace(/^姓名[:：]\s*/, '');
  const m = cleaned.match(/^([A-Za-z]{3,5})/);
  if (m) return m[1].toUpperCase().slice(0, 4);
  return cleaned.slice(0, 4).toUpperCase();
}

function renameProfile(profile) {
  const cancer = normalizeCancer(profile.diagnosis);
  const line = profile.treatmentLine != null ? (LINE_LABEL[profile.treatmentLine] || `${profile.treatmentLine}线`) : '线数未知';
  const code = extractCode(profile.id);
  const displayId = `${cancer}·${line}·${code}`;
  return { displayId, cancer, line, code };
}

// Apply rename: keep originalId, overwrite id with display form.
for (const p of profiles) {
  const { displayId } = renameProfile(p);
  p.originalId = p.id;
  p.id = displayId;
}

// index matches by profile.id — but match_results.json still uses original ids,
// so build a lookup via originalId.
const matchesByOriginal = new Map(matchesArr.map(m => [m.profile.id, m]));
const matchesById = new Map(profiles.map(p => [p.id, matchesByOriginal.get(p.originalId)]));

const NOW = new Date();
const GEN_TIME = NOW.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

// ---------- helpers ----------

function esc(s) {
  if (s === null || s === undefined || s === '') return '—';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Raw escape for use inside text blocks (no "—" fallback)
function escRaw(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeId(id) {
  // Keep Chinese characters; replace filesystem-problematic characters with '-'.
  // Also replace · (middle dot) with - for extra portability.
  return id
    .replace(/·/g, '-')
    .replace(/[\s/\\?%*:|"<>]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function scoreTier(score) {
  if (score >= 80) return { label: '高度匹配', cls: 'tier-high', note: '≥80 分' };
  if (score >= 60) return { label: '值得优先看', cls: 'tier-mid', note: '60–79 分' };
  if (score >= 40) return { label: '可参考', cls: 'tier-low', note: '40–59 分' };
  return { label: '相关性弱', cls: 'tier-weak', note: '<40 分' };
}

// Split reasons[] into three buckets.
function splitReasons(reasons = []) {
  const good = [];
  const gaps = [];
  const risks = [];
  for (const r of reasons) {
    const s = String(r);
    if (/排除风险|超出试验要求|不符合|禁忌|不符|不宜入组/.test(s)) {
      risks.push(s);
    } else if (
      /不确定|未知|无法|默认符合|请医生|需医生|需要确认|指标类型不同|需要补|未标注|暂无/.test(s)
    ) {
      gaps.push(s);
    } else {
      good.push(s);
    }
  }
  return { good, gaps, risks };
}

function fieldOrDash(v) {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) return v.length ? v.map(esc).join('、') : '—';
  if (v === '') return '—';
  return esc(v);
}

// ---------- CSS ----------

const CSS = `:root{
  --brand:#2563eb; --brand-hover:#1d4ed8; --brand-soft:#dbeafe;
  --coral:#fb923c; --coral-soft:#fff1e2;
  --mint:#10b981; --mint-soft:#d1fae5;
  --lilac:#8b5cf6; --lilac-soft:#ede9fe;
  --text:#0f172a; --text-dim:#475569;
  --line:#e2e8f0; --bg-soft:#f0f7ff; --bg:#ffffff;
  --danger:#e11d48; --danger-soft:#ffe4e6;
  --warn:#d97706; --warn-soft:#fef3c7;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Helvetica Neue",Arial,sans-serif;
  color:var(--text);
  background:linear-gradient(180deg,#f8fbff 0%,#ffffff 400px);
  font-size:14.5px;
  line-height:1.6;
  -webkit-font-smoothing:antialiased;
}
a{color:var(--brand);text-decoration:none}
a:hover{text-decoration:underline}
.container{max-width:1120px;margin:0 auto;padding:0 28px}
.nav{display:flex;justify-content:space-between;align-items:center;padding:18px 0;border-bottom:1px solid var(--line);margin-bottom:28px}
.nav-brand{font-weight:600;font-size:16px;color:var(--text)}
.nav-brand .dot{color:var(--brand)}
.nav-meta{color:var(--text-dim);font-size:13px}

.hero{padding:28px 0 18px}
.hero h1{margin:0 0 6px;font-size:28px;letter-spacing:-0.01em}
.hero .sub{color:var(--text-dim);font-size:15px;margin-bottom:4px}
.hero .gen{color:var(--text-dim);font-size:12.5px}

.notice{
  background:var(--brand-soft);color:#1e3a8a;
  border:1px solid #bfdbfe;border-radius:10px;
  padding:10px 14px;font-size:13px;margin:16px 0 20px;
}

.kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:8px 0 28px}
.kpi{
  background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px;
  box-shadow:0 1px 0 rgba(15,23,42,0.03);
}
.kpi .label{color:var(--text-dim);font-size:12.5px;margin-bottom:6px}
.kpi .value{font-size:26px;font-weight:600;letter-spacing:-0.01em}
.kpi .value .unit{font-size:13px;color:var(--text-dim);font-weight:400;margin-left:2px}
.kpi.b{border-top:3px solid var(--brand)}
.kpi.m{border-top:3px solid var(--mint)}
.kpi.c{border-top:3px solid var(--coral)}
.kpi.l{border-top:3px solid var(--lilac)}

h2{font-size:20px;margin:32px 0 14px;letter-spacing:-0.01em}
h3{font-size:16px;margin:18px 0 10px}

.card{
  background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px 20px;
  margin-bottom:14px;
}
.card.soft{background:var(--bg-soft);border-color:#cfe2ff}

.summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px 28px}
.summary-grid .row{display:flex;gap:10px;align-items:flex-start;font-size:14px}
.summary-grid .row .k{color:var(--text-dim);min-width:80px;flex:0 0 80px}
.summary-grid .row .v{color:var(--text);flex:1;word-break:break-word}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{
  background:var(--lilac-soft);color:#5b21b6;border-radius:999px;
  padding:3px 10px;font-size:12.5px;border:1px solid #ddd6fe;
}
.chip.mint{background:var(--mint-soft);color:#065f46;border-color:#a7f3d0}
.chip.coral{background:var(--coral-soft);color:#9a3412;border-color:#fed7aa}

table.overview{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:6px}
table.overview th,table.overview td{
  border-bottom:1px solid var(--line);padding:10px 10px;text-align:left;vertical-align:top;
}
table.overview th{background:#f8fafc;font-weight:600;color:var(--text-dim);font-size:12.5px}
table.overview tr:hover td{background:#fbfdff}
table.overview td.trial{max-width:260px}
table.overview td.institution{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}
table.overview td .tiny{color:var(--text-dim);font-size:12px}

.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:#fff}

.bar-row{display:grid;grid-template-columns:140px 1fr 60px;gap:10px;align-items:center;margin:6px 0;font-size:13.5px}
.bar{background:var(--brand-soft);height:10px;border-radius:6px;overflow:hidden}
.bar>span{display:block;height:100%;background:var(--brand);border-radius:6px}
.bar-row .count{color:var(--text-dim);text-align:right}

.missing-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.missing-cell{
  background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px;
}
.missing-cell .n{font-size:22px;font-weight:600}
.missing-cell .lbl{color:var(--text-dim);font-size:12.5px;margin-top:2px}
.missing-cell .hint{color:var(--text-dim);font-size:11.5px;margin-top:4px}

.trial-card{
  background:#fff;border:1px solid var(--line);border-radius:14px;
  padding:16px 18px;margin:12px 0;position:relative;
}
.trial-head{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap}
.trial-rank{
  background:#f1f5f9;color:var(--text-dim);border-radius:8px;
  font-size:12px;padding:3px 8px;font-weight:600;flex-shrink:0;
}
.trial-score{
  font-size:12.5px;font-weight:600;border-radius:999px;
  padding:3px 10px;flex-shrink:0;
}
.tier-high{background:var(--mint);color:#fff}
.tier-mid{background:var(--brand);color:#fff}
.tier-low{background:var(--coral);color:#fff}
.tier-weak{background:#94a3b8;color:#fff}
.trial-id{color:var(--text-dim);font-size:12.5px;font-family:ui-monospace,Menlo,monospace;flex-shrink:0}
.trial-name{flex:1 1 100%;margin-top:6px;font-size:14.5px;font-weight:500;color:var(--text);line-height:1.45}

.trial-cols{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-top:12px}
.trial-col h4{margin:0 0 6px;font-size:12.5px;color:var(--text-dim);font-weight:600;letter-spacing:0.02em}
.trial-col ul{margin:0;padding-left:16px;font-size:13px;line-height:1.55}
.trial-col.good ul li{color:#065f46}
.trial-col.gap ul li{color:#92400e}
.trial-col.risk ul li{color:#9f1239}
.trial-col .empty{color:var(--text-dim);font-size:12.5px;font-style:italic}

.trial-meta{
  display:flex;flex-wrap:wrap;gap:14px;margin-top:12px;
  padding-top:10px;border-top:1px dashed var(--line);
  font-size:12.5px;color:var(--text-dim);
}
.trial-meta .k{color:var(--text-dim)}
.trial-meta .v{color:var(--text)}

details.collapse{margin-top:10px}
details.collapse>summary{
  cursor:pointer;color:var(--brand);font-size:12.5px;list-style:none;
  padding:6px 0;user-select:none;
}
details.collapse>summary::-webkit-details-marker{display:none}
details.collapse[open]>summary{color:var(--text-dim)}
details.collapse .content{
  background:#f8fafc;border:1px solid var(--line);border-radius:8px;
  padding:10px 12px;margin-top:6px;font-size:12.5px;color:var(--text-dim);
  white-space:pre-wrap;word-break:break-word;max-height:400px;overflow:auto;
}

.foot-note{color:var(--text-dim);font-size:12.5px;text-align:center;margin:18px 0}

footer{
  margin:40px 0 24px;padding-top:20px;border-top:1px solid var(--line);
  text-align:center;color:var(--text-dim);font-size:13px;
}
footer .line1{font-weight:500;color:var(--text)}

.back-link{color:var(--brand);font-size:13.5px}

@media (max-width: 720px){
  .kpi-row{grid-template-columns:repeat(2,1fr)}
  .missing-grid{grid-template-columns:repeat(2,1fr)}
  .summary-grid{grid-template-columns:1fr}
  .trial-cols{grid-template-columns:1fr}
  table.overview{font-size:12.5px}
  table.overview td.institution{max-width:120px}
}

@media print{
  @page{size:A4;margin:14mm 12mm}
  html,body{background:#fff !important;font-size:11pt}
  .container{max-width:none;padding:0}
  .nav{display:none !important}
  .notice{background:#fff;border:1px solid #ccc}
  .kpi-row{grid-template-columns:repeat(4,1fr);gap:8px}
  .kpi{padding:10px;box-shadow:none}
  .kpi .value{font-size:18pt}
  h1{font-size:20pt}
  h2{font-size:13pt;margin-top:16pt}
  h3{font-size:11pt}
  .card,.trial-card{box-shadow:none;page-break-inside:avoid}
  .trial-card{margin:8px 0;padding:10px 12px}
  .trial-cols{grid-template-columns:1fr 1fr 1fr;gap:10px}
  .summary-grid{grid-template-columns:1fr 1fr;gap:6px 18px}
  details.collapse{display:none}
  table.overview{font-size:9.5pt}
  table.overview th,table.overview td{padding:5px 6px}
  .table-wrap{overflow:visible;border:1px solid #ddd}
  footer{margin:16pt 0 0;font-size:9.5pt}
  a{color:#111 !important;text-decoration:none}
}
`;

// ---------- templates ----------

function head(title, cssHref) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="${cssHref}">
</head>
<body>`;
}

function navBar(href, backLabel) {
  return `<nav class="nav container">
    <div class="nav-brand">数愈健康<span class="dot"> · </span><span style="color:var(--text-dim);font-weight:400;">患者匹配报告</span></div>
    <div class="nav-meta">${backLabel ? `<a class="back-link" href="${href}">${esc(backLabel)}</a> · ` : ''}生成于 ${esc(GEN_TIME)}</div>
  </nav>`;
}

function footer() {
  return `<footer class="container">
    <div class="line1">数愈健康 · 陪您一起，帮病人找到下一步</div>
    <div>本报告基于您上传的病历与公开试验库生成，仅供参考，不代替医生判断。</div>
  </footer></body></html>`;
}

function noticeBar() {
  return `<div class="container"><div class="notice">温馨提示：本报告仅供参考，不代替医生。数据由您掌管，随时可以删除。</div></div>`;
}

// ---------- overview ----------

function buildOverview() {
  // KPIs
  const nPatients = profiles.length;
  const trialLib = 496;
  const topScores = matchesArr.map(m => m.matches[0]?.score ?? 0);
  const nStrong = topScores.filter(s => s >= 60).length;
  const avgTop1 = Math.round(topScores.reduce((a, b) => a + b, 0) / topScores.length);

  // 按癌种分布
  const cancerMap = new Map();
  for (const p of profiles) {
    const key = (p.diagnosis || '其他').replace(/[\(（].*$/, '').trim();
    cancerMap.set(key, (cancerMap.get(key) || 0) + 1);
  }
  const cancerRows = [...cancerMap.entries()].sort((a, b) => b[1] - a[1]);
  const maxCancer = Math.max(...cancerRows.map(r => r[1]));

  // 总览表
  const tableRows = profiles
    .map(p => {
      const m = matchesById.get(p.id);
      const top = m?.matches?.[0];
      const sid = safeId(p.id);
      const topScore = top?.score ?? 0;
      const tier = scoreTier(topScore);
      const trialShort = top ? (top.name.length > 38 ? top.name.slice(0, 38) + '…' : top.name) : '—';
      const keyGene = (p.geneMutations || []).slice(0, 2).join('、') || '—';
      // 拟前往医院只取第一家（通常是牵头中心），完整列表放 title 悬停显示
      const institutionRaw = top?.institution || '';
      const institutionFirst = institutionRaw
        ? institutionRaw.split(/[、,，;；]/)[0].trim()
        : '';
      const institutionCell = institutionFirst
        ? `<td class="institution" title="${esc(institutionRaw)}">${esc(institutionFirst)}</td>`
        : `<td class="institution">—</td>`;
      const pickCount = m?.picks?.length ?? 0;
      const pickReason = m?.pickReason || 'adaptive';
      // 兜底/为空时用灰色样式，adaptive 走正常色
      const pickBadgeStyle = pickReason === 'adaptive'
        ? 'background:var(--mint-soft);color:#065f46;border:1px solid #a7f3d0;'
        : 'background:var(--warn-soft);color:#92400e;border:1px solid #fde68a;';
      const pickTip = pickReason === 'adaptive'
        ? `在 ${m?.total ?? 0} 条候选里按匹配度+多样性精选`
        : pickReason === 'floor-fallback'
          ? `这次没找到高度匹配的试验，展示 Top ${pickCount} 条供参考`
          : `暂时没有合适的招募中试验`;
      return `<tr>
        <td><strong>${esc(p.id)}</strong></td>
        <td>${fieldOrDash(p.diagnosis)}</td>
        <td>${fieldOrDash(p.stage)}</td>
        <td>${fieldOrDash(p.treatmentLine)}</td>
        <td>${esc(keyGene)}</td>
        <td>${fieldOrDash(p.city)}</td>
        ${institutionCell}
        <td title="匹配引擎找到的全部候选（≥30 分）">${m?.total ?? '—'}</td>
        <td><span class="trial-score" style="${pickBadgeStyle}" title="${esc(pickTip)}">${pickCount} 条</span></td>
        <td class="trial"><span class="tiny">${top ? esc(top.trialId) : '—'}</span><br>${esc(trialShort)}</td>
        <td><span class="trial-score ${tier.cls}">${topScore}</span></td>
        <td><a href="patients/${encodeURIComponent(sid)}/index.html">查看 →</a></td>
      </tr>`;
    })
    .join('\n');

  // 缺失信息统计
  const missing = {
    ECOG: profiles.filter(p => p.ecog === null || p.ecog === undefined).length,
    'PD-L1': profiles.filter(p => !p.pdl1).length,
    基因信息: profiles.filter(p => !p.geneMutations || p.geneMutations.length === 0).length,
    治疗线数: profiles.filter(p => p.treatmentLine === null || p.treatmentLine === undefined).length,
    城市: profiles.filter(p => !p.city).length,
  };

  const cancerBars = cancerRows
    .map(([name, n]) => {
      const pct = Math.round((n / maxCancer) * 100);
      return `<div class="bar-row"><div>${esc(name)}</div><div class="bar"><span style="width:${pct}%"></span></div><div class="count">${n} 位</div></div>`;
    })
    .join('\n');

  const missingCells = Object.entries(missing)
    .map(
      ([k, v]) => `<div class="missing-cell">
        <div class="n">${v}<span style="font-size:13px;color:var(--text-dim);font-weight:400;"> / ${nPatients}</span></div>
        <div class="lbl">${esc(k)} 待补</div>
        <div class="hint">建议在上传流程里补一下</div>
      </div>`
    )
    .join('');

  return `${head('患者批量匹配概览 · 数愈健康', 'assets/style.css')}
${navBar('', '')}
<section class="hero container">
  <h1>患者批量匹配概览</h1>
  <div class="sub">16 位病人的病例摘要与可能适合的试验</div>
  <div class="gen">生成时间 ${esc(GEN_TIME)}</div>
</section>
${noticeBar()}

<section class="container">
  <div class="kpi-row">
    <div class="kpi b"><div class="label">病例数</div><div class="value">${nPatients}<span class="unit">位病人</span></div></div>
    <div class="kpi m"><div class="label">试验库规模</div><div class="value">${trialLib}<span class="unit">条招募中</span></div></div>
    <div class="kpi c"><div class="label">Top1 ≥ 60 分</div><div class="value">${nStrong}<span class="unit">位</span></div></div>
    <div class="kpi l"><div class="label">平均 Top1 分数</div><div class="value">${avgTop1}<span class="unit">分</span></div></div>
  </div>

  <h2>按癌种分布</h2>
  <div class="card">${cancerBars}</div>

  <h2>16 位病人一览</h2>
  <div class="table-wrap">
    <table class="overview">
      <thead><tr>
        <th>病例 ID</th><th>主诊断</th><th>分期</th><th>治疗线</th><th>关键基因</th>
        <th>城市</th><th>拟前往医院</th>
        <th title="匹配引擎找到的全部候选（≥30 分）">候选总数</th>
        <th title="按匹配度 + 类型多样性为病人精选出的推荐试验（3–10 条）">精选数</th>
        <th>Top1 试验</th><th>Top1 分数</th><th></th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>
  <div class="foot-note">
    分数注脚：≥80 高度匹配 / 60–79 值得优先看 / 40–59 可参考 / &lt;40 相关性弱。<br>
    「候选总数」是引擎找到的全部相关试验（宽口径）；「精选数」是按病人匹配度 + 试验类型多样性挑出的 3–10 条推荐看的试验。
  </div>

  <h2>需补一下的信息</h2>
  <p style="color:var(--text-dim);font-size:13.5px;margin-top:0">这些字段在 OCR 时未能稳定抽取，若病人知晓可以在上传时补写，我们的匹配会更有底气。</p>
  <div class="missing-grid">${missingCells}</div>
</section>

${footer()}`;
}

// ---------- patient page ----------

function buildPatient(profile, matchPayload, rawText) {
  const sid = safeId(profile.id);
  const picks = matchPayload.picks || [];
  const pickReason = matchPayload.pickReason || 'adaptive';
  const pickThreshold = matchPayload.pickThreshold;
  const top = picks[0] || matchPayload.matches[0];
  const topTier = top ? scoreTier(top.score) : null;

  const summary = `
    <div class="card soft">
      <h3 style="margin-top:0">${esc(profile.id)}</h3>
      <div class="summary-grid">
        <div class="row"><div class="k">主诊断</div><div class="v">${fieldOrDash(profile.diagnosis)}</div></div>
        <div class="row"><div class="k">分期</div><div class="v">${fieldOrDash(profile.stage)}</div></div>
        <div class="row"><div class="k">年龄 / 性别</div><div class="v">${fieldOrDash(profile.age)} / ${fieldOrDash(profile.gender)}</div></div>
        <div class="row"><div class="k">ECOG</div><div class="v">${fieldOrDash(profile.ecog)}</div></div>
        <div class="row"><div class="k">PD-L1</div><div class="v">${fieldOrDash(profile.pdl1)}</div></div>
        <div class="row"><div class="k">城市</div><div class="v">${fieldOrDash(profile.city)}</div></div>
        <div class="row"><div class="k">当前治疗线</div><div class="v">${fieldOrDash(profile.treatmentLine)}</div></div>
        <div class="row"><div class="k">合并症</div><div class="v">${fieldOrDash(profile.comorbidities)}</div></div>
        <div class="row" style="grid-column:1 / -1"><div class="k">基因变异</div><div class="v">${
          profile.geneMutations && profile.geneMutations.length
            ? `<div class="chips">${profile.geneMutations.map(g => `<span class="chip">${esc(g)}</span>`).join('')}</div>`
            : '未从病历抽取'
        }</div></div>
        <div class="row" style="grid-column:1 / -1"><div class="k">既往用药</div><div class="v">${
          profile.priorTherapies && profile.priorTherapies.length
            ? profile.priorTherapies.map(t => `<span class="chip mint">${esc(t)}</span>`).join(' ')
            : '未从病历抽取'
        }</div></div>
        <div class="row" style="grid-column:1 / -1"><div class="k">既往治疗</div><div class="v">${fieldOrDash(profile.treatment)}</div></div>
        ${profile.notes ? `<div class="row" style="grid-column:1 / -1"><div class="k">备注</div><div class="v">${esc(profile.notes)}</div></div>` : ''}
      </div>
    </div>`;

  // 精选策略说明条
  let strategyNote = '';
  if (pickReason === 'adaptive' && picks.length > 0) {
    strategyNote = `引擎一共找到 <strong>${matchPayload.total}</strong> 条相关候选；我们按匹配度和试验类型多样性，为病人精选了下面这 <strong>${picks.length}</strong> 条（分数 ≥ ${pickThreshold}）。`;
  } else if (pickReason === 'floor-fallback') {
    strategyNote = `这次没找到高度匹配的试验。下面这 <strong>${picks.length}</strong> 条是候选里相对靠前的，<strong>供您和医生参考</strong>，不建议直接照方抓药。`;
  } else if (pickReason === 'empty-fallback' || picks.length === 0) {
    strategyNote = `暂时没有合适的招募中试验。试验库每周会更新，也可以让医生协助预筛。`;
  }

  const headlineBadge = top && picks.length > 0
    ? `<div class="card">
        <div style="margin-bottom:6px">${strategyNote}</div>
        <div>最匹配分数 <span class="trial-score ${topTier.cls}">${top.score}</span>
          <span style="color:var(--text-dim);font-size:13px">（${topTier.label}）</span>
          · 候选池 ${matchPayload.total} 条 → 精选 ${picks.length} 条
        </div>
      </div>`
    : `<div class="card">${strategyNote || '暂未找到合适的招募中试验，建议补齐病历字段后重新匹配。'}</div>`;

  const trialCards = picks
    .map((t, i) => {
      const tier = scoreTier(t.score);
      const { good, gaps, risks } = splitReasons(t.reasons || []);
      const riskBlock =
        risks.length === 0
          ? ''
          : `<div class="trial-col risk">
              <h4>✗ 需要留意的排除风险</h4>
              <ul>${risks.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
            </div>`;
      const goodBlock = `<div class="trial-col good">
          <h4>✓ 关键匹配原因</h4>
          ${good.length ? `<ul>${good.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : `<div class="empty">暂无</div>`}
        </div>`;
      const gapBlock = `<div class="trial-col gap">
          <h4>⚠ 需补一下</h4>
          ${gaps.length ? `<ul>${gaps.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : `<div class="empty">信息较完整</div>`}
        </div>`;

      const meta = [
        t.phase ? `<span class="k">阶段</span> <span class="v">${esc(t.phase)}</span>` : '',
        t.type ? `<span class="k">类型</span> <span class="v">${esc(t.type)}</span>` : '',
        t.statusText ? `<span class="k">状态</span> <span class="v">${esc(t.statusText)}</span>` : '',
        t.location ? `<span class="k">地点</span> <span class="v">${esc(t.location)}</span>` : '',
        t.institution ? `<span class="k">机构</span> <span class="v">${esc(t.institution)}</span>` : '',
      ]
        .filter(Boolean)
        .join(' · ');

      const indication = t.indication
        ? `<details class="collapse"><summary>查看试验适应症描述</summary><div class="content">${escRaw(t.indication)}</div></details>`
        : '';

      return `<article class="trial-card">
        <div class="trial-head">
          <span class="trial-rank">#${i + 1}</span>
          <span class="trial-score ${tier.cls}" title="${tier.note} · ${tier.label}">${t.score} · ${tier.label}</span>
          <span class="trial-id">${esc(t.trialId || t.id)}</span>
          <div class="trial-name">${esc(t.name)}</div>
        </div>
        <div class="trial-cols">${goodBlock}${gapBlock}${riskBlock || '<div class="trial-col"></div>'}</div>
        ${meta ? `<div class="trial-meta">${meta}</div>` : ''}
        ${indication}
      </article>`;
    })
    .join('\n');

  const remaining = matchPayload.total > picks.length ? matchPayload.total - picks.length : 0;
  const footNote = remaining
    ? `<div class="foot-note">另有 ${remaining} 条候选未展示（分数较低或类型重复）· 如需完整结果可向我们索取 match_results.json。</div>`
    : '';

  const rawBlock = rawText
    ? `<details class="collapse"><summary>查看原始病历 OCR 文本（供医生核对）</summary><div class="content">${escRaw(rawText)}</div></details>`
    : '<div class="foot-note">未找到对应 OCR 原始文本。</div>';

  return `${head(`${profile.id} · 病例与匹配 · 数愈健康`, '../../assets/style.css')}
${navBar('../../index.html', '← 返回总览')}
<section class="hero container">
  <h1>病例档案与匹配试验</h1>
  <div class="sub">${esc(profile.id)}</div>
  <div class="gen">生成时间 ${esc(GEN_TIME)}</div>
</section>
${noticeBar()}

<section class="container">
  <h2>病例摘要</h2>
  ${summary}

  <h2>为您精选的 ${picks.length} 条试验</h2>
  ${headlineBadge}
  ${trialCards}
  ${footNote}

  <h2>原始病历文本</h2>
  ${rawBlock}
</section>

${footer()}`;
}

// ---------- main ----------

function findRawText(profileId) {
  const candidates = fs.readdirSync(RAW_TEXTS);
  // Prefer exact filename match
  const exact = candidates.find(f => f === profileId + '.txt');
  if (exact) return { file: exact, text: fs.readFileSync(path.join(RAW_TEXTS, exact), 'utf8') };
  // Fallback: prefix / contains
  const token = profileId.split(/[\s（(]/)[0].replace(/^姓名：/, '');
  const hit = candidates.find(f => f.includes(token));
  if (hit) return { file: hit, text: fs.readFileSync(path.join(RAW_TEXTS, hit), 'utf8') };
  return null;
}

function main() {
  ensureDir(HTML_ROOT);
  ensureDir(ASSETS);
  ensureDir(PATIENTS);

  fs.writeFileSync(path.join(ASSETS, 'style.css'), CSS, 'utf8');

  // overview
  fs.writeFileSync(path.join(HTML_ROOT, 'index.html'), buildOverview(), 'utf8');

  const pdfTargets = [];
  pdfTargets.push({
    html: path.join(HTML_ROOT, 'index.html'),
    pdf: path.join(HTML_ROOT, 'overview.pdf'),
    label: 'overview',
  });

  for (const profile of profiles) {
    const m = matchesById.get(profile.id);
    if (!m) {
      console.warn('! no match payload for', profile.id);
      continue;
    }
    const sid = safeId(profile.id);
    const dir = path.join(PATIENTS, sid);
    ensureDir(dir);
    const rawHit = findRawText(profile.originalId || profile.id);
    // Truncate extremely long raw text to keep PDF sane (>8000 chars rare here)
    let rawText = rawHit ? rawHit.text : '';
    const MAX_RAW = 12000;
    let truncated = false;
    if (rawText.length > MAX_RAW) {
      rawText = rawText.slice(0, MAX_RAW) + '\n\n……（原始文本较长，已截断。完整版可在 raw.txt 中查看）……';
      truncated = true;
    }
    // raw.txt always dumps full text (not truncated) for doctor reference
    fs.writeFileSync(path.join(dir, 'raw.txt'), rawHit ? rawHit.text : '（未找到对应 OCR 文本）\n', 'utf8');

    const html = buildPatient(profile, m, rawText);
    fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');

    pdfTargets.push({
      html: path.join(dir, 'index.html'),
      pdf: path.join(dir, 'report.pdf'),
      label: profile.id + (truncated ? ' (raw truncated)' : ''),
    });
    console.log('  ✓ ' + profile.id + ' → ' + sid + (rawHit ? ` (raw: ${rawHit.file})` : ' (no raw)'));
  }

  // generate PDFs via Chrome headless, serially
  const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const hasChrome = fs.existsSync(CHROME);
  if (!hasChrome) {
    console.error('Chrome not found at', CHROME, '— skipping PDF step. Run weasyprint fallback separately.');
    return;
  }

  console.log('\nGenerating PDFs (serial)...');
  for (const t of pdfTargets) {
    const args = [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--print-to-pdf=' + t.pdf,
      '--print-to-pdf-no-header',
      '--virtual-time-budget=5000',
      '--no-pdf-header-footer',
      '--hide-scrollbars',
      'file://' + t.html,
    ];
    try {
      execFileSync(CHROME, args, { stdio: ['ignore', 'ignore', 'pipe'], timeout: 60000 });
      if (!fs.existsSync(t.pdf) || fs.statSync(t.pdf).size < 1000) {
        throw new Error('PDF empty');
      }
      console.log('  pdf ✓', t.label);
    } catch (e) {
      console.warn('  pdf ✗ chrome failed for', t.label, '-', e.message, '→ trying weasyprint');
      try {
        execFileSync('weasyprint', [t.html, t.pdf], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 90000 });
        console.log('  pdf ✓ (weasyprint)', t.label);
      } catch (e2) {
        console.error('  pdf ✗ weasyprint also failed for', t.label, '-', e2.message);
      }
    }
  }

  console.log('\nDone. Output at:', HTML_ROOT);
}

main();
