// PRD-2026Q2 §P1-6：records 场景文案字典 + 复购钩子模板
// 复购钩子目的：让长期用户主动「补一份新报告」 —— 复诊后病情有变化，
// 旧匹配可能失效；同时基因报告越完整，匹配命中率越高。
//
// 触发条件由 records.js 的 buildHookText 决定：
//  - daysSinceUpdate < 30：不显示
//  - daysSinceUpdate ∈ [30, 90)：温和提醒（updateGentle）
//  - daysSinceUpdate >= 90：强建议（updateUrgent）
//  - 缺基因（geneMutation 为空）：geneMissing
//  - 缺其它高价值字段（stage, lineOfTherapy）：generalMissing

module.exports = {
  _comment: 'PRD-2026Q2 §P1-6：records 场景文案 + 复购钩子模板',

  hooks: {
    updateGentle: '上次更新于 {n} 天前 —— 传一份近期检查报告，匹配会更准',
    updateUrgent: '上次更新于 {n} 天前 —— 建议传新一份检查报告，避免老数据漏掉新药',
    geneMissing: '补一份基因报告，可能多解锁 5+ 种针对性新药',
    generalMissing: '补 {n} 项关键信息，匹配会更精准'
  },

  // 卡片底部的辅助文案（已用在 wxml 里的 match-count / gap-hint，集中放这里以便复用）
  // PRD-2026Q3 §UI-Audit-R1 §P0-7（C1 同源）：empty 措辞改正向 —— 与 records.wxml inline 一致
  // 防止 wxml 后续切换到从 copy 取值时再次出现失败感。
  matchCount: {
    found: '为家人找到 {n} 种新药',
    empty: '正在帮您扩大搜索范围'
  },

  delete: {
    title: '确认删除',
    content: '删除后该病历将不再用于匹配，您可在 30 天内联系客服恢复。是否继续？',
    contactFallback: '如果不确定要不要删，可先拨打 400-666-8899 咨询。',
    confirmText: '删除',
    cancelText: '再想想',
    contactText: '联系客服',
    contactPhone: '400-666-8899'
  }
}
