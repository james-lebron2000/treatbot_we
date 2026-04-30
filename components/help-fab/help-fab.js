// PRD-2026Q3 §U5：小程序「需要帮忙」悬浮按钮。
// 文案完全来自 shared/copy/help.js，与 H5 共用同一份（H5 经 web/src/copy/help.ts 转 ESM）。
// 注意：原文件是 help.json，但 WeApp `require()` 不识别 .json 后缀（同 .cjs 一样会丢"module not defined"），
// 所以已迁移到 .js（CommonJS）。
const help = require('../../shared/copy/help.js')

Component({
  options: { multipleSlots: false },

  data: {
    fab: help.fab,
    options: help.options,
    promise: (help.expectations && help.expectations.promise) || '',
    open: false,
    modalText: ''
  },

  methods: {
    toggle() {
      this.setData({ open: !this.data.open })
    },

    close() {
      this.setData({ open: false })
    },

    onSelect(e) {
      const { key } = e.currentTarget.dataset
      const opt = this.data.options.find((o) => o.key === key)
      if (!opt) return
      this.setData({ open: false })

      if (opt.actionType === 'tel') {
        const phoneNumber = String(opt.actionPayload || '').replace(/[^0-9+\-]/g, '')
        if (phoneNumber) {
          wx.makePhoneCall({ phoneNumber, fail: () => {
            this.setData({ modalText: opt.subtitle })
          }})
          return
        }
        this.setData({ modalText: opt.subtitle })
        return
      }

      if (opt.actionType === 'modal') {
        this.setData({ modalText: opt.actionPayload })
        return
      }
    },

    closeModal() {
      this.setData({ modalText: '' })
    },

    // 阻止穿透：modal mask 上只有 closeModal 起作用，卡片本体吃掉点击。
    noop() {}
  }
})
