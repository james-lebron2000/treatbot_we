// pages/profile/profile.js
Page({
  data: {
    userInfo: {
      nickName: '张三',
      avatarUrl: ''
    },
    userPhone: '138****8888',
    stats: {
      records: 2,
      matches: 8,
      applications: 1
    }
  },

  onLoad() {
    // 获取用户信息
    const app = getApp()
    if (app.globalData.userInfo) {
      this.setData({
        userInfo: app.globalData.userInfo
      })
    }
  },

  editProfile() {
    wx.showToast({ title: '编辑资料', icon: 'none' })
  },

  goToRecords() {
    wx.switchTab({ url: '/pages/records/records' })
  },

  goToMatches() {
    wx.switchTab({ url: '/pages/matches/matches' })
  },

  goToApplications() {
    wx.navigateTo({ url: '/pages/profile/applications' })
  },

  contactSupport() {
    wx.showModal({
      title: '联系客服',
      content: '客服电话：400-XXX-XXXX\n服务时间：9:00-18:00',
      showCancel: false
    })
  },

  aboutUs() {
    wx.navigateTo({ url: '/pages/profile/about' })
  },

  showPrivacyPolicy() {
    wx.navigateTo({ url: '/pages/profile/privacy' })
  }
})