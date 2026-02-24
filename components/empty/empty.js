// components/empty/empty.js
Component({
  properties: {
    // 图片路径
    image: {
      type: String,
      value: ''
    },
    // 标题
    title: {
      type: String,
      value: ''
    },
    // 描述
    desc: {
      type: String,
      value: ''
    },
    // 是否显示按钮
    showBtn: {
      type: Boolean,
      value: false
    },
    // 按钮文字
    btnText: {
      type: String,
      value: '去逛逛'
    }
  },
  methods: {
    onBtnTap() {
      this.triggerEvent('tap')
    }
  }
})