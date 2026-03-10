Page({
  data: {
    currentStep: 0,
    steps: [
      {
        image: '/images/guide-step1.png',
        title: '上传病历',
        desc: '拍照或从相册选择病历图片，AI 将自动识别关键信息'
      },
      {
        image: '/images/guide-step2.png',
        title: '智能匹配',
        desc: '基于您的病历信息，系统会智能推荐适合的临床试验'
      },
      {
        image: '/images/guide-step3.png',
        title: '一键报名',
        desc: '选择合适的试验项目，一键提交报名申请'
      }
    ]
  },

  onLoad() {
    // 检查是否是首次使用
    const hasSeenGuide = wx.getStorageSync('has_seen_guide')
    if (hasSeenGuide) {
      wx.switchTab({
        url: '/pages/index/index'
      })
    }
  },

  // 下一步
  nextStep() {
    if (this.data.currentStep < this.data.steps.length - 1) {
      this.setData({
        currentStep: this.data.currentStep + 1
      })
    } else {
      this.finishGuide()
    }
  },

  // 上一步
  prevStep() {
    if (this.data.currentStep > 0) {
      this.setData({
        currentStep: this.data.currentStep - 1
      })
    }
  },

  // 跳过引导
  skipGuide() {
    this.finishGuide()
  },

  // 完成引导
  finishGuide() {
    wx.setStorageSync('has_seen_guide', true)
    wx.switchTab({
      url: '/pages/index/index'
    })
  },

  // 点击指示器
  onIndicatorTap(e) {
    const { index } = e.currentTarget.dataset
    this.setData({
      currentStep: index
    })
  },

  // 滑动切换
  onSwiperChange(e) {
    this.setData({
      currentStep: e.detail.current
    })
  }
})
