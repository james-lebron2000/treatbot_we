// PRD-2026Q3 §U5：小程序「需要帮忙」悬浮按钮。
// 文案完全来自 shared/copy/help.json，与 H5 共用同一份。
const help = require('../../shared/copy/help.json')

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
