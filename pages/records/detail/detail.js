const api = require('../../../utils/api')

Page({
  data: {
    recordId: '',
    loading: false,
    record: null
  },

  onLoad(options) {
    if (!options.id) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      return
    }
    this.setData({ recordId: options.id })
    this.loadRecordDetail()
  },

  async loadRecordDetail() {
    this.setData({ loading: true })
    wx.showLoading({ title: '加载中...' })

    try {
      const res = await api.getMedicalRecordDetail(this.data.recordId)
      this.setData({ record: res.data || null })
    } catch (error) {
      console.error('加载病历详情失败:', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
      wx.hideLoading()
    }
  },

  previewImage(e) {
    const { current } = e.currentTarget.dataset
    const images = (this.data.record && this.data.record.images) || []
    if (!images.length) {
      return
    }

    wx.previewImage({
      current,
      urls: images
    })
  }
})
