// pages/matches/detail/detail.js
const api = require('../../../utils/api')

Page({
  data: {
    trialId: '',
    trial: {}
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ trialId: options.id })
      this.loadTrialDetail()
    }
  },

  // 加载试验详情
  async loadTrialDetail() {
    wx.showLoading({ title: '加载中...' })
    
    try {
      const res = await api.getTrialDetail(this.data.trialId)
      this.setData({ trial: res.data })
    } catch (error) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // 拨打电话
  callPhone() {
    const phone = this.data.trial.contact?.phone
    if (phone) {
      wx.makePhoneCall({ phoneNumber: phone })
    }
  },

  // 报名试验
  async applyTrial() {
    const { trialId } = this.data
    
    wx.showModal({
      title: '确认报名',
      content: '报名后研究机构将在3个工作日内与您联系，确认是否继续？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '提交中...' })
          
          try {
            const result = await api.applyTrial({ trialId })
            
            wx.showToast({
              title: '报名成功',
              icon: 'success'
            })
            
            // 跳转到报名记录
            setTimeout(() => {
              wx.navigateTo({ url: '/pages/profile/applications' })
            }, 1500)
          } catch (error) {
            wx.showToast({ title: '报名失败', icon: 'none' })
          } finally {
            wx.hideLoading()
          }
        }
      }
    })
  }
})