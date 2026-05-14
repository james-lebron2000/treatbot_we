/**
 * PRD-2026Q3 T1-2：泛瘤种 / 不限基因信号识别（多语言词典）
 *
 * 历史：原本词典内嵌 services/matchEngine.js，仅简体中文；
 *      线上有英文 / 繁体试验文本被漏判 → 召回率盲点。
 *
 * 这里把词典抽出来形成单一事实源；matchEngine.js 直接 require。
 * 临床顾问 / 产品可在 docs/trial-vocabulary.md 维护词典并提 PR，无需碰代码。
 *
 * 设计原则：
 *  - **泛瘤种** = 不限癌种入组（实体瘤 / 多瘤种 / 篮子试验），命中即视为对癌种"宽容"。
 *  - **基因豁免** = 文本明确说"不限基因"，命中即视为不强制要求基因。
 *  - 两者有重叠（例：MSI-H 通常意味着不限基因 + 多瘤种），词典间允许重复。
 *  - 大小写不敏感、空白宽松（normalize 后比较）。
 */

// === 泛瘤种 / 多瘤种入组口径 ===
const GENERIC_CANCER_ALIASES = [
  // 简体中文
  '实体瘤', '实体性肿瘤', '恶性肿瘤', '晚期实体瘤', '进展期实体瘤', '实体肿瘤',
  '泛实体瘤', '转移性实体瘤', '多瘤种', '多种实体瘤', '全部实体瘤', '任何实体瘤',
  // 繁体中文（PRD-2026Q3 T1-2 新增）
  '實體瘤', '實體性腫瘤', '惡性腫瘤', '晚期實體瘤', '進展期實體瘤', '實體腫瘤',
  '泛實體瘤', '轉移性實體瘤', '多瘤種', '多種實體瘤', '全部實體瘤', '任何實體瘤',
  // 英文：NCT / 国际多中心常用入组口径
  'solid tumor', 'solid tumors', 'solid tumour', 'solid tumours',
  'advanced solid tumor', 'advanced solid tumors',
  'metastatic solid tumor', 'metastatic solid tumors',
  'all solid tumors', 'any solid tumor', 'any solid tumors',
  'pan-tumor', 'pan tumor', 'pantumor', 'tumor agnostic', 'tumor-agnostic',
  'tissue agnostic', 'tissue-agnostic', 'basket trial', 'basket study',
  'advanced malignancies', 'advanced malignancy',
  // 生物标志物驱动、不限癌种（FDA / NMPA 泛瘤种适应症）
  'msi-h', 'msih', 'dmmr', 'mmr deficient', 'mismatch repair deficient',
  'tmb-h', 'tmbh', 'tmb high', 'high tumor mutational burden',
  'pd-l1 positive', 'pd-l1 高表达', 'pd-l1 高表現', 'pd-l1≥1%', 'pd-l1 ≥ 1%',
  'pd-l1≥1', 'pd-l1 ≥1%'
];

// === 显式「不限基因 / 无需基因检测」口径 ===
// inferGeneRequired 优先扫这里 —— 命中即判 false（不强制要求基因）。
const GENE_AGNOSTIC_HINTS = [
  // 简体
  '不限基因', '不限制基因', '不限突变', '无需基因检测', '无需基因检查',
  '不要求基因', '不要求检测', '基因检测非必需', '基因非必需',
  // 繁体（PRD-2026Q3 T1-2 新增）
  '不限基因', '不限制基因', '不限突變', '無需基因檢測', '無需基因檢查',
  '不要求基因', '不要求檢測', '基因檢測非必需', '基因非必需',
  // 英文
  'any mutation', 'regardless of mutation', 'biomarker-agnostic',
  'without prior molecular testing', 'no genetic testing required',
  'irrespective of mutation status',
  // 兼容：把 GENERIC_CANCER_ALIASES 里"暗示无基因要求"的项也复制一份
  // —— 历史上 inferGeneRequired 只查 GENE_AGNOSTIC_HINTS，不动它会丢掉这些命中。
  'advanced solid tumor', 'advanced solid tumors',
  'metastatic solid tumor', 'metastatic solid tumors',
  'solid tumors', 'all solid tumors', 'any solid tumor',
  '泛实体瘤', '泛實體瘤', '晚期实体瘤', '晚期實體瘤',
  '转移性实体瘤', '轉移性實體瘤', '多瘤种', '多瘤種',
  'pd-l1 高表达', 'pd-l1 高表現', 'pd-l1 positive', 'pd-l1≥1%', 'pd-l1 ≥ 1%',
  'msi-h', 'dmmr', 'tmb-h', 'tmb high',
  'pan-tumor', 'tumor agnostic', 'tumor-agnostic'
];

module.exports = { GENERIC_CANCER_ALIASES, GENE_AGNOSTIC_HINTS };
