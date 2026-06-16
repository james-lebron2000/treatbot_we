// PRD-2026Q3 §U5：申请状态（application status）标签 + 色调的单一来源。
//
// 一处定义，多端复用：患者端（web ApplicationsView）现在就用；CRO / Operations
// 控制台后续迭代接入。每个状态有两套文案——patient（温和、安抚）与 cro（运营、直白），
// 外加一个 tone（映射到 tokens.css 的色板），由 StatusPill 等组件转成 token class。
//
// 历史 / 约束：与 shared/copy/help.js、upload.js 同源——这是给 WeApp `require()` 用的
// 纯数据 CommonJS 模块（module.exports = {...}，无 require/import）。WeApp `require()`
// 不识 .json / .cjs，必须保留 .js 扩展。H5 (Vite + TS) 通过 esModuleInterop 直接吃
// 默认导出（dev 由 vite.config 的 shared-copy-cjs-to-esm-dev 插件兜底，生产由
// build.commonjsOptions 处理 CJS 互操作）。保持纯数据，勿在此引入逻辑。
//
// patient 文案为患者可见副本，改动需谨慎——务必与现网保持一致（详见 ApplicationsView）。
// tone 取值：amber | brand | mint | red | muted（对应 tokens.css 的 *-soft / *-text）。

module.exports = {
  _comment: 'PRD-2026Q3 §U5：申请状态标签 + 色调单一来源（患者端 / CRO 端共享）。',

  // 规范状态键 → { patient 文案, cro 文案, tone }
  applicationStatus: {
    pending: { patient: '等待研究团队联系', cro: '待筛查', tone: 'amber' },
    contacted: { patient: '研究团队已联系', cro: '已联系', tone: 'brand' },
    screened: { patient: '正在评估是否合适', cro: '已筛查', tone: 'brand' },
    enrolled: { patient: '已成功入组', cro: '已入组', tone: 'mint' },
    rejected: { patient: '这次不太合适', cro: '已排除', tone: 'red' },
    cancelled: { patient: '已取消', cro: '已取消', tone: 'muted' },
    withdrawn: { patient: '已退出', cro: '已退出', tone: 'muted' }
  },

  // 推荐的展示 / 流转顺序（终态在后）。消费端可据此排序 tab / 列。
  applicationStatusOrder: [
    'pending',
    'contacted',
    'screened',
    'enrolled',
    'rejected',
    'cancelled',
    'withdrawn'
  ]
}
