const api = require('../../utils/api')
const auth = require('../../utils/auth')
const matchExplainer = require('../../utils/match-explainer')
const parseTask = require('../../utils/parse-task')
// Q3-红线 §B.2：match_view / trial_apply 漏斗事件
const { track } = require('../../utils/track')
// U4：把后端返回的英文/术语 reasons 翻译成普通人能读懂的一句话。
// 共享文案已从 .json 迁到 .js（WeApp require 不识 .json）；详见 shared/copy/glossary.js。
const glossary = require('../../shared/copy/glossary.js')

const humanizeReasons = (reasons) => {
  if (!Array.isArray(reasons) || reasons.length === 0) return glossary.matchReasons.fallback
  const map = glossary.matchReasons || {}
  const sentences = reasons.slice(0, 2).map((k) => map[k] || map.fallback).filter(Boolean)
  return sentences.join('；') + '。'
}

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
  uploading: '文件上传好了，马上开始看',
  parsing: '在后台看清病历写了什么',
  analyzing: '找诊断、分期、治疗等关键信息',
  structuring: '整理成病历卡片，同时为您预取可能的试验'
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
      subCenters: splitSubCenters(item.location),
      // U4：人话理由 —— 用 glossary 把 reasons 翻成普通人能看的一句话；
      // 没有 reasons 时走 fallback「与您家人的情况比较接近」。
      humanReason: humanizeReasons(item.reasons)
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

      // Q3-红线 §B.2：列表加载完成 = 漏斗 match_view（5s 去重防 onShow 重复）
      try {
        track('match_view', {
          count: matches.length,
          highMatches,
          fallback: !!res.fallback
        })
      } catch (e) { /* ignore */ }

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

    // Q3-红线 §B.2：报名按钮被点击 = 漏斗 trial_apply（提交成功的 application_submitted
    // 在 apply 页 / utils/api.js applyTrial 调用方那里再埋一次）。
    try { track('trial_apply', { trialId: trial.id }) } catch (e2) { /* ignore */ }

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
