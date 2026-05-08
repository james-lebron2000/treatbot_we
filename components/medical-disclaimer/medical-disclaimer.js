// PRD-2026Q3 §UI-Audit-R1 §P0-3：医学免责声明组件 —— 单一来源 + 多处复用。
//
// 背景：上一轮（PRD-2026Q2 §T0/T1/T2）做完 5 页 UI 后从医学产品运营 + 合规视角再审，
// 发现整应用对「我们的看法」「能用 / 不能用 这种新药」「高度匹配」等带医学倾向判断
// **完全没有标准 disclaimer**。医疗类产品的合规底线：必须有"本平台仅做匹配 / 不构成
// 医学诊断 / 最终治疗方案请咨询主治医生"。
//
// 三种 variant：
//   - default：完整 4 行（认知 / 范围 / 决定 / 风险）—— 用在 matches 列表底部 + apply 页
//   - compact：1 行简版 —— 用在每张卡片末尾、records 列表底
//   - inline：与"我们的看法"等带判断的标签贴一起的小字 —— 用在 decision-banner 内嵌
//
// 文案温度：与 brand-voice-guidelines.md 对齐（诚实类 + 温暖陪伴），不装"专业的"硬腔，
// 而是承认"我们是匹配引擎、不是医生"。

Component({
  properties: {
    variant: {
      type: String,
      value: 'default'  // 'default' | 'compact' | 'inline'
    }
  }
})
