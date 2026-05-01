// PRD-2026Q3 §U5：H5 + 小程序 双端共用「需要帮忙」FAB 文案的单一来源。
//
// 历史：原文件是 help.json。WeApp `require()` 只识 .js 扩展（不识 .json / .cjs），
// 引到 small program 端时编译期 throw "module 'shared/copy/help.json.js' is not defined"。
// 同 utils/schema.js 那次 .cjs → .js 的修复语义一致：把 JSON 数据就地转成
// CommonJS module，单一 source of truth，仍然由 H5 + 小程序两端共用。
//
// H5 (web/src/copy/help.ts) 改成 `import help from '../../../shared/copy/help.js'`，
// Vite + TS 都能直接吃 CommonJS 默认导出（已配 `esModuleInterop`）。

module.exports = {
  _meta: {
    version: 'v2026Q3-1',
    rule: '悬浮帮助按钮文案。三类入口：找真人 / 看 1 分钟教学 / 常见问题。文案 ≤ 16 字。'
  },
  fab: {
    label: '需要帮忙',
    ariaLabel: '打开帮助菜单',
    icon: '?'
  },
  options: [
    {
      key: 'human',
      title: '想找真人聊聊',
      subtitle: '客服电话 400-666-8899（9:00–18:00）',
      actionType: 'tel',
      actionPayload: '4006668899'
    },
    {
      key: 'video',
      title: '看 1 分钟教学视频',
      subtitle: '我们怎么帮您家人找新药',
      actionType: 'modal',
      actionPayload: '我们做三件事：①看懂您家人的病历 ②帮您找出能免费用上的在研新药 ③帮您对接药企/医院。整个过程您只需要拍照上传病历，剩下的我们做。'
    },
    {
      key: 'faq',
      title: '看常见问题',
      subtitle: '怎么找到新药 / 用药要钱吗 / 数据安全吗',
      actionType: 'modal',
      actionPayload: '✓ 用药全程免费 —— 这些新药都通过临床研究免费供给入组的病人，您不用付药钱。\n✓ 和公立三甲医院 + 国内主流药企合作 —— 您看到的每一种新药，都是国家备案、医院在做的临床研究在用的。\n✓ 我们做的事是帮您把能用的新药整理出来 —— 是否真的用药、用哪个，由您和主治医生一起决定。\n✓ 您的数据您说了算 —— 随时可一键导出，账户和数据一并清掉。'
    }
  ],
  expectations: {
    _meta: '首屏期望管理：30 秒告诉用户「我们做什么 / 您要做什么 / 大致多久」',
    title: '30 秒了解我们',
    steps: [
      {
        icon: '1',
        title: '您要做的',
        body: '拿出您家人的病历（出院小结、检查报告、基因报告都行），手机拍照上传。拍模糊也没事。'
      },
      {
        icon: '2',
        title: '我们做的',
        body: 'AI 看懂病历内容 → 在全国正在做临床研究、能免费给入组病人的新药里找适合您家人情况的 → 把用药条件翻译成大白话给您看。'
      },
      {
        icon: '3',
        title: '大约多久',
        body: '上传到看到能用的新药通常 1-3 分钟。看完之后，您再决定要不要让药企/医院联络您。'
      }
    ],
    promise: '用药全程免费 · 您的数据您说了算 · 不卖给第三方',
    ctaPrimary: '好的，开始',
    ctaSecondary: '之前看过了，跳过'
  }
}
