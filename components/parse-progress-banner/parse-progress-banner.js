// PRD-2026Q2 §P1-3：解析进度条共用组件
// 视觉来自 matches/index 两处，归一化后只剩一份样式。
Component({
  options: {
    multipleSlots: true
  },
  properties: {
    // 标题，例如「病历还在帮您看懂中」
    title: { type: String, value: '病历还在帮您看懂中' },
    // 进度 0-100
    progress: { type: Number, value: 0 },
    // 状态文本，例如「在后台看清病历写了什么」
    statusText: { type: String, value: '' },
    // 是否显示 actions slot（看病历 / 看新药 等链接）
    showActions: { type: Boolean, value: false }
  }
})
