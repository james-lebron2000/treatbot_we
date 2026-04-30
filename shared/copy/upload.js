// PRD-2026Q2 §3.7：H5 + 小程序双端共享的上传场景文案字典（单一来源）。
//
// 历史：原文件是 upload.json。WeApp `require()` 不识别 .json 后缀，会丢
// "module 'shared/copy/upload.json.js' is not defined"。同 help.json → help.js、
// schemas/upload.cjs → upload.js 的迁移语义一致：把 JSON 数据就地转成 CommonJS module，
// 单一 source of truth，仍然由 H5 + 小程序两端共用。
//
// H5 (web/src/pages/UploadView.vue) 改成 `import uploadCopy from '@shared/copy/upload.js'`，
// Vite + TS 都能直接吃 CommonJS 默认导出（已配 esModuleInterop）。
//
// 文案温度：温暖陪伴语气（empathy.ts 风格）—— 每条错误 = 共情 + 可行动作；
// 每条状态 ≤ 12 字、主动说明在做什么；字段 hint 解释为什么需要以及不确定时怎么办。

module.exports = {
  _comment: 'PRD-2026Q2 §3.7：H5 与小程序共享的上传场景文案字典。',
  error: {
    rate_limit: '您今天上传得挺多了 —— 我们想把每份都做对，稍等一会儿就能继续。不想等的话，直接告诉我们关键信息，一样能匹配。',
    parse_failed: '这张我们没能看清 —— 可能图片有点模糊，或者格式不太常见。换张清晰点的再试试？或者直接手动录入也行。',
    file_too_large: '这份文件有点大 —— 压缩一下或分几次传都可以，您的数据不会丢。',
    unsupported_format: '我们目前只能认图片和 PDF —— 换一种格式再传一次？',
    network: '网络有点卡，您的数据没丢。检查一下网络再试一次就好。',
    // DevTools-only：IDE 微信登录态过期 —— 真机不会触发，仅给研发同学看的友好提示，
    // 让用户在开发者工具看到这条提示时知道要重新登录 IDE，而不是怀疑后端炸了。
    wx_login_session_expired: '开发者工具的微信登录已过期。请点 IDE 右上角头像重新登录，再回来上传。',
    unknown: '刚刚卡了一下，您的数据都还在。再试一次？'
  },
  status: {
    pending: '刚开始排队，马上就到您这份…',
    parsing: '正在帮您看懂这份病历…',
    completed: '好了 ✓',
    failed: '这次没能看懂 —— 再试一次或手动录入都行'
  },
  fieldHints: {
    diagnosis: '例如「肺腺癌」「乳腺癌」。不确定就写医生最常提的那个说法，我们能认。',
    stage: '例如 I / II / III / IV 期。只有大致印象也可以写下来，后面还能改。',
    genes: '例如 EGFR、ALK、KRAS。没做基因检测就留空，不影响为您匹配。',
    age: '填家人的实际年龄就行 —— 用来判断试验的年龄入组范围。'
  },
  cta: {
    upload: '上传病历',
    manualEntry: '没有报告？手动填写',
    retry: '重试',
    cancel: '取消'
  }
}
