// P0 安全护栏：全局医疗免责声明组件。
// 任何展示「病情解读 / 试验匹配 / 标准方案」结果的页面都应放一处，纠正
// 「这是诊疗建议」的误读。文案默认取 shared/copy/safety.js（单一来源），可用 text 覆盖。
const safety = require('../../shared/copy/safety.js')

Component({
  options: { multipleSlots: false },
  properties: {
    // 覆盖文案；不传则用 safety.disclaimer.short
    text: { type: String, value: '' },
    // muted（默认，弱化的一行）| card（带边框的卡片，用于强调场景）
    tone: { type: String, value: 'muted' }
  },
  data: {
    fallback: safety.disclaimer.short
  }
})
