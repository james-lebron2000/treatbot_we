const api = require('../../utils/api')
const REFRESH_INTERVAL = 20 * 1000

Page({
  data: {
    records: [],
    loading: false
  },

  onLoad() {
    this.loadRecords()
  },

  onShow() {
    const now = Date.now()
    if (this.lastLoadedAt && now - this.lastLoadedAt > REFRESH_INTERVAL) {
      this.loadRecords({ silent: true })
    }
  },

  async loadRecords(options = {}) {
    if (this.loadingPromise) {
      return this.loadingPromise
    }
    const { silent = false } = options

    if (!silent) {
      this.setData({ loading: true })
    }

    this.loadingPromise = (async () => {
      try {
        const res = await api.getMedicalRecords()
        const records = res.data || []
        this.setData({ records })
        this.lastLoadedAt = Date.now()
      } catch (error) {
        console.error('加载病历失败:', error)
        wx.showToast({ title: '病历加载失败', icon: 'none' })
      } finally {
        if (!silent) {
          this.setData({ loading: false })
        }
        this.loadingPromise = null
      }
    })()

    return this.loadingPromise
  },

  goToUpload() {
    wx.navigateTo({ url: '/pages/upload/upload' })
  },

  viewRecord(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/records/detail/detail?id=${id}` })
  }
})
