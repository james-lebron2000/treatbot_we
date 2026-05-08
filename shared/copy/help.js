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
      // PRD-2026Q3 §UI-Audit-R1 §P0-8：①②③ Unicode 圆圈数字 → "1." "2." "3."（Android 老旧字体兼容）
      // PRD-2026Q3 §UI-Audit-R2 §R2-2（同步）：「帮您对接药企 / 医院」抽象 → 改为更具体的研究方接触口径
      // 与 index.wxml step 3 desc / matches/apply flow-card 步骤 2 文案对齐
      actionPayload: '我们做三件事：\n1. 看懂您家人的病历\n2. 帮您找出能免费用上、医院在做的临床研究新药\n3. 您说要的话，再让研究方在 3 个工作日内联系您\n\n整个过程您只需要拍照上传病历，剩下的我们做。'
    },
    {
      key: 'faq',
      title: '看常见问题',
      subtitle: '怎么找到新药 / 用药要钱吗 / 数据安全吗',
      actionType: 'modal',
      // PRD-2026Q3 §UI-Audit-R1 §P0-8：✓ → "·"（Unicode 兼容）
      // PRD-2026Q3 §UI-Audit-R1 §P0-4：第一条措辞前置「加入临床研究」，把"免费"放后面，避免淡化研究本质
      // PRD-2026Q3 §UI-Audit-R1 §P0-11：「不卖给第三方」反向措辞 → 改正向「数据只在您账户里」
      actionPayload: '· 怎么免费拿到新药 —— 通过加入临床研究免费拿到。这些新药都是国家备案、医院在做的研究在用，您不用付药钱，但需配合研究方案与随访。\n\n· 谁在做这些研究 —— 公立三甲医院 + 国内主流药企。每一种您看到的新药都对得上医院的临床研究。\n\n· 我们做什么、不做什么 —— 我们只做匹配，把能用的新药整理出来；是否真的用药、用哪个，由研究医生筛查 + 您和主治医生一起决定。\n\n· 数据怎么处理 —— 您的数据只在您自己的账户里，随时可一键导出，账户和数据一并清掉。'
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
    // PRD-2026Q3 §UI-Audit-R1 §P0-4：把「免费 = 加入临床研究」摆出来，避免单纯「免费」淡化研究本质
    // PRD-2026Q3 §UI-Audit-R1 §P0-11：「不卖给第三方」反向措辞 → 「数据只在您账户里」正向陈述
    promise: '免费用药 = 加入临床研究 · 数据只在您账户里 · 您随时可带走或删除',
    ctaPrimary: '好的，开始',
    ctaSecondary: '之前看过了，跳过'
  }
}
