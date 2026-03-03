const api = require('../../utils/api')
const { getCache, setCache } = require('../../utils/cache')
const RECENT_MATCHES_CACHE_KEY = 'cache_recent_matches'
const REFRESH_INTERVAL = 30 * 1000

Page({
  data: {
    recentMatches: [],
    loading: false
  },

  onLoad() {
    this.loadRecentMatches()
  },

  onShow() {
    const now = Date.now()
    if (this.lastLoadedAt && now - this.lastLoadedAt > REFRESH_INTERVAL) {
      this.loadRecentMatches({ silent: true })
    }
  },

  // 加载最近匹配记录
  async loadRecentMatches(options = {}) {
    if (this.loadingPromise) {
      return this.loadingPromise
    }

    const { silent = false } = options
    const cachedMatches = getCache(RECENT_MATCHES_CACHE_KEY)
    if (cachedMatches && cachedMatches.length) {
      this.setData({ recentMatches: cachedMatches })
    }

    if (!silent) {
      this.setData({ loading: true })
    }

    this.loadingPromise = (async () => {
      try {
        const result = await api.getMatches({ page: 1, pageSize: 3 })
        const matches = (result.data || []).map((item) => ({
          id: item.id,
          trialName: item.name,
          matchScore: item.score,
          phase: item.phase,
          location: item.location,
          indication: item.indication,
          institution: item.institution
        }))

        this.setData({ recentMatches: matches })
        setCache(RECENT_MATCHES_CACHE_KEY, matches)
        this.lastLoadedAt = Date.now()
      } catch (error) {
        console.error('加载匹配记录失败:', error)
        wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' })
      } finally {
        if (!silent) {
          this.setData({ loading: false })
        }
        this.loadingPromise = null
      }
    })()

    return this.loadingPromise
  },

  // 跳转到上传页面
  goToUpload() {
    wx.navigateTo({
      url: '/pages/upload/upload'
    })
  },

  // 跳转到病历页面
  goToRecords() {
    wx.switchTab({
      url: '/pages/records/records'
    })
  },

  // 跳转到匹配页面
  goToMatches() {
    wx.switchTab({
      url: '/pages/matches/matches'
    })
  },

  // 跳转到搜索页面
  goToSearch() {
    wx.navigateTo({
      url: '/pages/search/search'
    })
  },

  // 查看匹配详情
  viewMatchDetail(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/matches/detail/detail?id=${id}`
    })
  },

  // 下拉刷新
  async onPullDownRefresh() {
    await this.loadRecentMatches()
    wx.stopPullDownRefresh()
  }
})
