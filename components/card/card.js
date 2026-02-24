// components/card/card.js
Component({
  properties: {
    // 是否显示阴影
    shadow: {
      type: Boolean,
      value: true
    },
    // 是否显示边框
    border: {
      type: Boolean,
      value: false
    },
    // 内边距
    padding: {
      type: Number,
      value: 30
    }
  }
})