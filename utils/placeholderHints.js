// Plan §Phase 3.3：文件名启发式占位卡规则。
//   wx.chooseMedia 拿到的 file.name 走这里给一句"可能是 X 报告"，让用户在
//   step 2（OCR 跑 30-90s）时不至于盯着空白进度条；服务端结果回到 step 3 时
//   这张卡随 currentStep 切换自然消失，不冲突。
//
//   命中即返回不做加权 —— 占位卡是 best effort，错了只是文案不准，不影响数据
//   正确性。规则按"识别度"从高到低排：先病理 / 影像（命名最规范），最后兜底
//   到通用关键词「报告」。
//
//   独立于 wx 全局，可在 jest 单测里直接 require。
const FILENAME_HINT_RULES = [
  { keywords: ['病理', '活检'], label: '病理报告' },
  { keywords: ['ct', 'CT', 'Ｃｔ'], label: 'CT 报告' },
  { keywords: ['mri', 'MRI', '核磁', '磁共振'], label: 'MRI 报告' },
  { keywords: ['pet', 'PET'], label: 'PET-CT 报告' },
  { keywords: ['超声', 'B超', 'b超'], label: '超声报告' },
  { keywords: ['x光', 'X光', 'X线', 'x线'], label: 'X 线报告' },
  { keywords: ['基因', 'NGS', 'ngs', '测序'], label: '基因检测报告' },
  { keywords: ['血常规'], label: '血常规' },
  { keywords: ['生化'], label: '生化检验' },
  { keywords: ['免疫'], label: '免疫检查' },
  { keywords: ['化验', '检验'], label: '检验报告' },
  { keywords: ['出院'], label: '出院记录' },
  { keywords: ['处方'], label: '处方' },
  { keywords: ['手术'], label: '手术记录' },
  { keywords: ['影像'], label: '影像报告' },
  { keywords: ['报告'], label: '检查报告' }
]

const inferFileHint = (file) => {
  if (!file) return null
  const name = `${file.name || ''}`.trim()
  if (!name) {
    // 没文件名（相机直拍常见）→ PDF 用文件类型兜底，图片不猜（避免乱讲）
    return file.fileType === 'pdf' ? { label: 'PDF 报告' } : null
  }
  for (const rule of FILENAME_HINT_RULES) {
    if (rule.keywords.some((kw) => name.includes(kw))) {
      return { label: rule.label }
    }
  }
  return file.fileType === 'pdf' ? { label: 'PDF 报告' } : null
}

// 把 tempFiles 数组折叠成 step 2 占位卡数据：相同 label 合并 + count，
// 比如 "病理报告 ×2 / CT 报告 ×1"。
const buildPlaceholderHints = (files) => {
  if (!Array.isArray(files) || files.length === 0) return []
  const counter = new Map()
  for (const f of files) {
    const hint = (f && f.hint) || inferFileHint(f)
    const label = hint && hint.label
    if (!label) continue
    counter.set(label, (counter.get(label) || 0) + 1)
  }
  return Array.from(counter.entries()).map(([label, count]) => ({ label, count }))
}

module.exports = {
  FILENAME_HINT_RULES,
  inferFileHint,
  buildPlaceholderHints
}
