// PRD-2026Q2 §P0-4：matches 场景文案字典（H5 + 小程序双端共享，单一来源）。
//
// 历史：原本写死在 matches.wxml 的 empty-state 里，一句「再找一次」就完事，
// 0 结果用户陷入死循环——再找一次还是 0 结果。
// 新版三步兜底：订阅通知（解决「我以后能不能用」）/ 拨打客服（解决「现在怎么办」）/
// 覆盖范围说明（缓解「是不是产品不行」的疑虑）。
//
// 文案温度：与 shared/copy/upload.js 一致——温暖陪伴、共情 + 可行动作、≤ 14 字。
// 数字 {n} 由 matches.js 注入（来自 utils/cancer-coverage 或后端 /api/medical/coverage）。

module.exports = {
  _comment: 'PRD-2026Q2 §P0-4：matches 场景共享文案字典。',

  empty: {
    title: '目前没找到完全贴合的新药',
    subtitle: '这不代表没有 —— 我们每周更新新药库，下面三种方式都行。',

    // Card 1：订阅通知（被动等）
    notify: {
      icon: 'bell',
      title: '新药出现立刻通知您',
      desc: '留个手机号，命中即刻短信告知。',
      cta: '留个联系方式',
      ctaShort: '订阅'
    },

    // Card 2：拨打客服（主动找人）
    contact: {
      icon: 'phone-call',
      title: '找真人帮看看',
      desc: '免费咨询顾问，对照病历给您讲讲下一步。',
      cta: '拨打客服',
      phone: '400-666-8899',
      hours: '工作日 9:00-18:00'
    },

    // Card 3：覆盖范围（缓解疑虑）
    coverage: {
      icon: 'clipboard-list',
      title: '我们目前覆盖 {n} 个癌种',
      desc: '您家人的诊断暂未在库 —— 不是没有，只是匹配引擎还在拓展。',
      defaultN: 32  // 占位：上线时改为后端真实数字
    }
  },

  // 订阅成功 / 失败的 toast 文案
  notifyResult: {
    success: '已记下，新药一出现就通知您',
    duplicate: '我们已经记着您了',
    fail: '网络有点卡，您再试一次？'
  }
}
