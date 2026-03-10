const api = require('../../utils/api')
const auth = require('../../utils/auth')
const matchExplainer = require('../../utils/match-explainer')

const pickList = (res) => {
  const payload = api.normalizePayload(res)
  if (!payload) {
    return []
  }
  if (Array.isArray(payload)) {
    return payload
  }
  return payload.list || payload.items || payload.trials || payload.matches || payload.data || payload.results || []
}

Page({
  data: {
    recordId: '',
    matches: [],
    highMatches: 0,
    readyMatches: 0,
    needSupplement: 0,
    loading: false,
    errorMessage: '',
    lowScoreMode: false,
    usingFallback: false,
    fallbackMessage: ''
  },

  onLoad(options) {
    if (options.recordId) {
      this.setData({ recordId: options.recordId })
    }
  },

  async onShow() {
    await this.loadMatches()
  },

  async loadMatches() {
    this.setData({
      loading: true,
      errorMessage: '',
      lowScoreMode: false,
      usingFallback: false,
      fallbackMessage: ''
    })

    try {
      await auth.ensureLogin()
      const storageRecordId = wx.getStorageSync('currentRecordId')
      const recordId = this.data.recordId || storageRecordId || ''
      const params = recordId ? { recordId } : {}
      const patientProfile = matchExplainer.getPatientProfile()

      const res = await api.getMatches(params)
      const rawMatches = pickList(res)

      const normalizedAll = rawMatches
        .map((item, index) => matchExplainer.normalizeMatchItem(item, index))
        .map((item) => matchExplainer.enrichMatchExplanation(item, patientProfile))

      const highOrMidMatches = normalizedAll.filter((item) => item.score >= 40)
      const lowScoreMode = highOrMidMatches.length === 0 && normalizedAll.length > 0
      const matches = matchExplainer.sortMatchesByScoreAndTime(lowScoreMode ? normalizedAll : highOrMidMatches)
      const highMatches = matches.filter((item) => item.score >= 80).length
      const readyMatches = matches.filter((item) => item.exclusionRisks.length === 0 && item.missingEvidence.length <= 2).length
      const needSupplement = matches.filter((item) => item.missingEvidence.length >= 3).length

      this.setData({
        matches,
        highMatches,
        readyMatches,
        needSupplement,
        lowScoreMode,
        loading: false,
        errorMessage: '',
        usingFallback: !!res.fallback,
        fallbackMessage: res.message || ''
      })

      if (res && res.fallback) {
        wx.showToast({
          title: '匹配接口异常，已使用兜底推荐',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('加载匹配失败:', error)
      this.setData({
        matches: [],
        highMatches: 0,
        readyMatches: 0,
        needSupplement: 0,
        loading: false,
        errorMessage: '暂无匹配结果，请稍后重试',
        lowScoreMode: false,
        usingFallback: false,
        fallbackMessage: ''
      })
    }
  },

  viewDetail(e) {
    const { id } = e.currentTarget.dataset
    const trial = this.data.matches.find((item) => `${item.id}` === `${id}`)
    if (trial) {
      wx.setStorageSync('selectedMatchDetail', trial)
    }
    wx.navigateTo({ url: `/pages/matches/detail/detail?id=${id}` })
  },

  applyTrial(e) {
    const { id } = e.currentTarget.dataset
    const trial = this.data.matches.find((item) => `${item.id}` === `${id}`)
    if (!trial) {
      wx.showToast({ title: '试验信息缺失', icon: 'none' })
      return
    }

    wx.setStorageSync('selectedApplyTrial', trial)
    wx.navigateTo({
      url: `/pages/matches/apply/apply?trialId=${encodeURIComponent(trial.id)}`
    })
  },

  goToUpload() {
    wx.navigateTo({
      url: '/pages/upload/upload'
    })
  },

  async onPullDownRefresh() {
    await this.loadMatches()
    wx.stopPullDownRefresh()
  }
})
