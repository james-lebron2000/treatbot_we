const api = require('../../utils/api')
const { getCache, setCache } = require('../../utils/cache')
const MATCHES_CACHE_KEY = 'cache_matches'
const REFRESH_INTERVAL = 30 * 1000

Page({
  data: {
    matches: [],
    highMatches: 2,
    loading: false
  },

  onLoad() {
    this.loadMatches()
  },

  onShow() {
    const now = Date.now()
    if (this.lastLoadedAt && now - this.lastLoadedAt > REFRESH_INTERVAL) {
      this.loadMatches({ silent: true })
    }
  },

  async loadMatches(options = {}) {
    if (this.loadingPromise) {
      return this.loadingPromise
    }

    const { silent = false } = options
    const cachedMatches = getCache(MATCHES_CACHE_KEY)
    if (cachedMatches && cachedMatches.length) {
      this.setData({
        matches: cachedMatches,
        highMatches: cachedMatches.filter(item => item.score > 80).length
      })
    }

    if (!silent) {
      this.setData({ loading: true })
    }

    this.loadingPromise = (async () => {
      try {
        const res = await api.getMatches()
        const matches = res.data || []
        this.setData({
          matches,
          highMatches: matches.filter(item => item.score > 80).length
        })
        setCache(MATCHES_CACHE_KEY, matches)
        this.lastLoadedAt = Date.now()
      } catch (error) {
        console.error('加载匹配列表失败:', error)
        wx.showToast({ title: '匹配数据加载失败', icon: 'none' })
      } finally {
        if (!silent) {
          this.setData({ loading: false })
        }
        this.loadingPromise = null
      }
    })()

    return this.loadingPromise
  },

  viewDetail(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/matches/detail/detail?id=${id}` })
  },

  async applyTrial(e) {
    const { id } = e.currentTarget.dataset
    if (!id || this.applyingId) {
      return
    }

    wx.showModal({
      title: '确认报名',
      content: '报名后研究机构将在3个工作日内与您联系，确认是否继续？',
      success: async (res) => {
        if (res.confirm) {
          this.applyingId = id
          wx.showLoading({ title: '提交中...' })
          try {
            await api.applyTrial({ trialId: id })
            wx.showToast({ title: '报名成功', icon: 'success' })
          } catch (error) {
            console.error('报名失败:', error)
            wx.showToast({ title: '报名失败，请稍后重试', icon: 'none' })
          } finally {
            this.applyingId = ''
            wx.hideLoading()
          }
        }
      }
    })
  }
})
