const api = require('../../utils/api')
const auth = require('../../utils/auth')
const parseTask = require('../../utils/parse-task')
const matchExplainer = require('../../utils/match-explainer')

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
    id: `${item.id || item.trialId || ''}`,
    trialName: matchExplainer.safeText(item.trialName || item.name || item.title || '未命名临床试验'),
    matchScore: Number(item.matchScore || item.score || 0),
    phase: matchExplainer.safeText(item.phase || item.trialPhase || '待补'),
    location: matchExplainer.safeText(item.location || item.city || '待补'),
    indication: matchExplainer.safeText(item.indication || item.cancerType || '待补'),
    institution: matchExplainer.safeText(item.institution || item.hospital || '待补'),
    updatedAt: matchExplainer.safeText(item.updatedAt || item.updateTime || item.createdAt || '')
  }
}

const ACTIVE_TASK_TEXT_MAP = {
  uploading: '文件已上传，准备开始识别',
  parsing: '正在识别病历文字',
  analyzing: '正在提取诊断、分期和治疗信息',
  structuring: '正在整理结构化病历并生成匹配'
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

Page({
  data: {
    recentMatches: [],
    loading: false,
    errorMessage: '',
    activeParseTask: null
  },

  async onLoad() {
    await this.bootstrap()
  },

  async onShow() {
    await this.loadRecentMatches()
  },

  async bootstrap() {
    const token = `${wx.getStorageSync('token') || ''}`.trim()
    if (!token) {
      this.setData({
        recentMatches: [],
        loading: false,
        errorMessage: '',
        activeParseTask: null
      })
      return
    }

    await this.loadRecentMatches()
  },

  async loadRecentMatches() {
    this.setData({ loading: true })

    const token = `${wx.getStorageSync('token') || ''}`.trim()
    if (!token) {
      this.setData({
        recentMatches: [],
        loading: false,
        errorMessage: '',
        activeParseTask: null
      })
      return
    }

    try {
      await auth.ensureLogin()
      await parseTask.syncActiveParseTask().catch(() => null)
      const activeParseTask = normalizeActiveTask(parseTask.getActiveParseTask())
      const currentRecordId = wx.getStorageSync('currentRecordId')
      const cachedMatches = parseTask.getCachedMatches(currentRecordId)
      if (cachedMatches && Array.isArray(cachedMatches.list) && cachedMatches.list.length > 0) {
        const cachedNormalized = cachedMatches.list
          .map(normalizeMatch)
          .sort((a, b) => b.matchScore - a.matchScore)
          .slice(0, 3)

        this.setData({
          recentMatches: cachedNormalized,
          activeParseTask
        })
      } else {
        this.setData({ activeParseTask })
      }

      if (activeParseTask && !currentRecordId) {
        this.setData({
          loading: false,
          errorMessage: '',
          recentMatches: cachedMatches && cachedMatches.list && cachedMatches.list.length ? this.data.recentMatches : []
        })
        return
      }

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
        errorMessage: '',
        activeParseTask
      })
    } catch (error) {
      console.error('加载匹配记录失败:', error)
      const activeParseTask = normalizeActiveTask(parseTask.getActiveParseTask())
      this.setData({
        recentMatches: this.data.recentMatches,
        loading: false,
        errorMessage: activeParseTask || this.data.recentMatches.length > 0 ? '' : '暂时无法加载匹配记录',
        activeParseTask
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
