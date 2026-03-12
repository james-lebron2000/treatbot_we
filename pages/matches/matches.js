const api = require('../../utils/api')
const auth = require('../../utils/auth')
const matchExplainer = require('../../utils/match-explainer')
const parseTask = require('../../utils/parse-task')

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

const ACTIVE_TASK_TEXT_MAP = {
  uploading: '文件已上传，等待识别任务启动',
  parsing: '正在后台识别病历文字',
  analyzing: '正在抽取诊断、分期和治疗信息',
  structuring: '正在生成结构化病历并预取匹配结果'
}

const normalizeActiveTask = (task) => {
  if (!task || !task.fileId) {
    return null
  }

  return {
    recordId: task.recordId || '',
    progress: Math.max(8, Math.min(99, Number(task.progress || 0))),
    text: ACTIVE_TASK_TEXT_MAP[task.status] || '病历正在后台整理'
  }
}

const splitSubCenters = (value) => {
  return `${value || ''}`
    .split(/[，,、；;\/]/)
    .map((item) => `${item || ''}`.trim())
    .filter(Boolean)
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
    fallbackMessage: '',
    activeParseTask: null
  },

  decorateMatches(list = [], previousMatches = this.data.matches || []) {
    const expandedMap = previousMatches.reduce((acc, item) => {
      acc[`${item.id}`] = !!item.expanded
      return acc
    }, {})

    return list.map((item) => ({
      ...item,
      expanded: !!expandedMap[`${item.id}`],
      subCenters: splitSubCenters(item.location)
    }))
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

    const token = `${wx.getStorageSync('token') || ''}`.trim()
    if (!token) {
      this.setData({
        matches: [],
        highMatches: 0,
        readyMatches: 0,
        needSupplement: 0,
        loading: false,
        errorMessage: '',
        lowScoreMode: false,
        usingFallback: false,
        fallbackMessage: '',
        activeParseTask: null
      })
      return
    }

    try {
      await auth.ensureLogin()
      await parseTask.syncActiveParseTask().catch(() => null)
      const activeParseTask = normalizeActiveTask(parseTask.getActiveParseTask())
      const storageRecordId = wx.getStorageSync('currentRecordId')
      const recordId = this.data.recordId || storageRecordId || ''
      const patientProfile = matchExplainer.getPatientProfile()
      const cachedMatches = parseTask.getCachedMatches(recordId)

      if (cachedMatches && Array.isArray(cachedMatches.list) && cachedMatches.list.length > 0) {
        const cachedNormalized = cachedMatches.list
          .map((item, index) => matchExplainer.normalizeMatchItem(item, index))
          .map((item) => matchExplainer.enrichMatchExplanation(item, patientProfile))
        const cachedHighOrMidMatches = cachedNormalized.filter((item) => item.score >= 40)
        const cachedLowScoreMode = cachedHighOrMidMatches.length === 0 && cachedNormalized.length > 0
        const cachedSorted = this.decorateMatches(
          matchExplainer.sortMatchesByScoreAndTime(cachedLowScoreMode ? cachedNormalized : cachedHighOrMidMatches)
        )

        this.setData({
          matches: cachedSorted,
          highMatches: cachedSorted.filter((item) => item.score >= 80).length,
          readyMatches: cachedSorted.filter((item) => item.exclusionRisks.length === 0 && item.missingEvidence.length <= 2).length,
          needSupplement: cachedSorted.filter((item) => item.missingEvidence.length >= 3).length,
          lowScoreMode: cachedLowScoreMode,
          activeParseTask
        })
      } else {
        this.setData({ activeParseTask })
      }

      if (activeParseTask && !recordId && !(cachedMatches && cachedMatches.list && cachedMatches.list.length > 0)) {
        this.setData({
          loading: false,
          errorMessage: '',
          usingFallback: false,
          fallbackMessage: ''
        })
        return
      }

      const params = recordId ? { recordId } : {}

      const res = await api.getMatches(params)
      const rawMatches = pickList(res)

      const normalizedAll = rawMatches
        .map((item, index) => matchExplainer.normalizeMatchItem(item, index))
        .map((item) => matchExplainer.enrichMatchExplanation(item, patientProfile))

      const highOrMidMatches = normalizedAll.filter((item) => item.score >= 40)
      const lowScoreMode = highOrMidMatches.length === 0 && normalizedAll.length > 0
      const matches = this.decorateMatches(
        matchExplainer.sortMatchesByScoreAndTime(lowScoreMode ? normalizedAll : highOrMidMatches)
      )
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
        fallbackMessage: res.message || '',
        activeParseTask
      })
      if (recordId) {
        parseTask.setCachedMatches(recordId, {
          list: rawMatches,
          fallback: !!res.fallback,
          message: res.message || ''
        })
      }

      if (res && res.fallback) {
        wx.showToast({
          title: '匹配接口异常，已使用兜底推荐',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('加载匹配失败:', error)
      const activeParseTask = normalizeActiveTask(parseTask.getActiveParseTask())
      this.setData({
        matches: this.data.matches,
        highMatches: this.data.highMatches,
        readyMatches: this.data.readyMatches,
        needSupplement: this.data.needSupplement,
        loading: false,
        errorMessage: activeParseTask || this.data.matches.length > 0 ? '' : '暂无匹配结果，请稍后重试',
        lowScoreMode: this.data.lowScoreMode,
        usingFallback: false,
        fallbackMessage: '',
        activeParseTask
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

  toggleMatchExpand(e) {
    const { id } = e.currentTarget.dataset
    if (!id) {
      return
    }

    const matches = this.data.matches.map((item) => {
      if (`${item.id}` !== `${id}`) {
        return item
      }
      return {
        ...item,
        expanded: !item.expanded
      }
    })

    this.setData({ matches })
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
