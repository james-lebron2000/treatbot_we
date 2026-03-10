const api = require('../../utils/api')
const auth = require('../../utils/auth')

const pickList = (res) => {
  if (!res) {
    return []
  }

  const payload = api.normalizePayload(res)
  if (Array.isArray(payload)) {
    return payload
  }

  return payload.list || payload.items || payload.records || payload.matches || payload.data || []
}

const normalizeMatch = (item) => {
  return {
    id: item.id || item.trialId || '',
    trialName: item.trialName || item.name || item.title || '未命名临床试验',
    matchScore: Number(item.matchScore || item.score || 0),
    phase: item.phase || item.trialPhase || '待补',
    location: item.location || item.city || '待补',
    indication: item.indication || item.cancerType || '待补',
    institution: item.institution || item.hospital || '待补',
    updatedAt: item.updatedAt || item.updateTime || item.createdAt || ''
  }
}

Page({
  data: {
    recentMatches: [],
    loading: false,
    errorMessage: ''
  },

  async onLoad() {
    await this.bootstrap()
  },

  async onShow() {
    await this.loadRecentMatches()
  },

  async bootstrap() {
    try {
      await auth.ensureLogin()
      this.setData({ errorMessage: '' })
    } catch (error) {
      this.setData({ errorMessage: '登录失败，请稍后重试' })
      wx.showToast({ title: '登录失败', icon: 'none' })
      return
    }

    await this.loadRecentMatches()
  },

  async loadRecentMatches() {
    this.setData({ loading: true })

    try {
      await auth.ensureLogin()
      const currentRecordId = wx.getStorageSync('currentRecordId')
      const params = { pageSize: 3 }
      if (currentRecordId) {
        params.recordId = currentRecordId
      }

      const res = await api.getMatches(params)
      const list = pickList(res)
      const normalized = list
        .map(normalizeMatch)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 3)

      this.setData({
        recentMatches: normalized,
        loading: false,
        errorMessage: ''
      })
    } catch (error) {
      console.error('加载匹配记录失败:', error)
      this.setData({
        recentMatches: [],
        loading: false,
        errorMessage: '暂时无法加载匹配记录'
      })
    }
  },

  goToUpload() {
    wx.navigateTo({
      url: '/pages/upload/upload'
    })
  },

  goToRecords() {
    wx.switchTab({
      url: '/pages/records/records'
    })
  },

  goToMatches() {
    wx.switchTab({
      url: '/pages/matches/matches'
    })
  },

  viewMatchDetail(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/matches/detail/detail?id=${id}`
    })
  },

  async onPullDownRefresh() {
    await this.loadRecentMatches()
    wx.stopPullDownRefresh()
  }
})
