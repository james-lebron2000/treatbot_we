/**
 * trial-picker.js — 以病人为中心的三层筛选漏斗
 *
 * Layer 1 硬门槛：status=recruiting、excluded=false、分数 ≥ absoluteFloor(40)
 * Layer 2 自适应阈值：max(softFloor=50, topScore - adaptiveDrop=18)
 * Layer 3 多样性 re-rank：按 trial.type 分组，每类 ≤ perTypeCap(3) 条
 *
 * 卡口：上限 maxReturn=10、下限 minReturn=3（不足触发 floor-fallback）
 */

const DEFAULTS = {
  absoluteFloor: 40,     // Layer 1 硬门槛
  adaptiveDrop: 18,      // Layer 2 减量
  softFloor: 50,         // Layer 2 保底
  perTypeCap: 3,         // Layer 3 每类上限
  maxReturn: 10,         // 上限
  minReturn: 3           // 下限兜底
};

/**
 * 把试验的 type 字段归一到 7 个大类，避免"靶向/靶向药物/小分子"各占一组
 * 找不到归属的落到 '其他'，保证 Layer 3 分组不会爆表
 */
const normalizeType = (type) => {
  const t = `${type || ''}`.trim();
  if (!t || t === '—' || t === '未标注') return '其他';
  if (/双抗|bispecific/i.test(t)) return '双抗';
  if (/抗体偶联|ADC|偶联/i.test(t)) return '抗体偶联';
  if (/细胞|CAR[- ]?T|TCR|NK/i.test(t)) return '细胞治疗';
  if (/免疫|PD-?1|PD-?L1|CTLA|检查点/i.test(t)) return '免疫';
  if (/靶向|激酶|抑制剂|KRAS|EGFR|HER2|MET/i.test(t)) return '靶向';
  if (/化疗|紫杉|铂|氟尿嘧啶|吉西他滨/i.test(t)) return '化疗';
  if (/抗体(?!偶联)|单抗/i.test(t)) return '单抗';
  return '其他';
};

/**
 * 主函数
 * @param {Array} allMatches - matchRecordsToTrials 返回的完整列表（已按 score 降序）
 * @param {Object} [opts]
 * @returns {{ picks, threshold, reason, stats }}
 *   reason ∈ 'adaptive' | 'floor-fallback' | 'empty-fallback'
 */
const pickTrialsForPatient = (allMatches, opts = {}) => {
  const cfg = { ...DEFAULTS, ...opts };
  const stats = { total: allMatches.length, afterGate: 0, afterThreshold: 0, afterDiversity: 0 };

  // ---------- Layer 1 硬门槛 ----------
  const gated = allMatches.filter((m) => {
    if (m.excluded === true) return false;
    // status 可能是 "recruiting" 或 statusText "招募中"；我们宽松一点
    const s = `${m.status || ''}`.toLowerCase();
    const sText = `${m.statusText || ''}`;
    const isRecruiting = s === 'recruiting' || /招募/.test(sText);
    if (!isRecruiting) return false;
    if ((m.score || 0) < cfg.absoluteFloor) return false;
    return true;
  });
  stats.afterGate = gated.length;

  // Layer 1 全空 → 没任何招募中 & 未被排除的候选
  if (gated.length === 0) {
    return { picks: [], threshold: cfg.absoluteFloor, reason: 'empty-fallback', stats };
  }

  // ---------- Layer 2 自适应阈值 ----------
  const topScore = gated[0].score || 0;
  const threshold = Math.max(cfg.softFloor, topScore - cfg.adaptiveDrop);
  const passed = gated.filter((m) => (m.score || 0) >= threshold);
  stats.afterThreshold = passed.length;

  // Layer 2 通过数不足 minReturn → 退到只过 Layer 1 的 Top minReturn
  if (passed.length < cfg.minReturn) {
    const picks = gated.slice(0, cfg.minReturn);
    stats.afterDiversity = picks.length;
    return { picks, threshold, reason: 'floor-fallback', stats };
  }

  // ---------- Layer 3 多样性 re-rank ----------
  // 规则：保留 gated[0]（全局 Top1 无条件入选），其余按 type 分组，每组至多 perTypeCap
  const top1 = gated[0];
  const groupCounts = new Map();
  groupCounts.set(normalizeType(top1.type), 1);
  const selected = [top1];

  for (const m of passed) {
    if (m === top1) continue;
    if (selected.length >= cfg.maxReturn) break;
    const group = normalizeType(m.type);
    const count = groupCounts.get(group) || 0;
    if (count >= cfg.perTypeCap) continue;
    selected.push(m);
    groupCounts.set(group, count + 1);
  }

  // 如果 Layer 3 过度压缩（比如 passed 里全是同一类），补齐到 minReturn
  if (selected.length < cfg.minReturn) {
    for (const m of passed) {
      if (selected.length >= cfg.minReturn) break;
      if (!selected.includes(m)) selected.push(m);
    }
  }

  // 最终按 score 再排一次（保持可读顺序）
  selected.sort((a, b) => (b.score || 0) - (a.score || 0));
  stats.afterDiversity = selected.length;

  return { picks: selected, threshold, reason: 'adaptive', stats };
};

module.exports = { pickTrialsForPatient, normalizeType, DEFAULTS };
