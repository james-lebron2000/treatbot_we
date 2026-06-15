const api = require('../../utils/api')
const auth = require('../../utils/auth')
const parseTask = require('../../utils/parse-task')
const matchExplainer = require('../../utils/match-explainer')
// 阿里健康/美团买药货架风格：把"研究"翻译成"药"作为卡片主标题。
const { resolveDrug } = require('../../utils/drug-extractor')
// PRD-2026Q3 §U5：首屏期望管理 banner 的文案 = shared/copy/help.js 的 expectations 段
// （原 help.json 已迁移到 .js，因 WeApp require 不识别 .json，详见 shared/copy/help.js 顶部）
const help = require('../../shared/copy/help.js')

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
  const drug = resolveDrug(item)
  return {
    id: `${item.id || item.trialId || ''}`,
    // trialName 仍保留作为副信息（详情页或追溯需要），但主标题 UI 用 drugName
    trialName: matchExplainer.safeText(item.trialName || item.name || item.title || '未命名临床研究'),
    drugName: drug.name,
    drugCode: drug.code,
    drugClass: drug.class,
    manufacturer: drug.manufacturer,
    matchScore: Number(item.matchScore || item.score || 0),
    phase: matchExplainer.safeText(item.phase || item.trialPhase || '待补'),
    location: matchExplainer.safeText(item.location || item.city || '待补'),
    indication: matchExplainer.safeText(item.indication || item.cancerType || '待补'),
    institution: matchExplainer.safeText(item.institution || item.hospital || '待补'),
    updatedAt: matchExplainer.safeText(item.updatedAt || item.updateTime || item.createdAt || '')
  }
}

const ACTIVE_TASK_TEXT_MAP = {
  uploading: '文件上传好了，马上开始看',
  parsing: '在看清病历上写的什么',
  analyzing: '找诊断、分期和治疗信息',
  structuring: '整理成病历卡片，一并准备匹配'
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
    activeParseTask: null,
    // PRD-2026Q3 §U5
    onboarding: help.expectations || null,
    onboardingSeen: false,
    onboardingExpanded: true
  },

  async onLoad() {
    // 读取本地「我看过了」状态；同 H5 用 localStorage('onboardingSeenAt')
    const seenAt = wx.getStorageSync('onboardingSeenAt')
    this.setData({
      onboardingSeen: Boolean(seenAt),
      onboardingExpanded: !seenAt
    })
    await this.bootstrap()
  },

  toggleOnboarding() {
    this.setData({ onboardingExpanded: !this.data.onboardingExpanded })
  },

  dismissOnboarding() {
    wx.setStorageSync('onboardingSeenAt', Date.now())
    this.setData({ onboardingSeen: true, onboardingExpanded: false })
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

  // PRD-2026Q3 §U7：先看个例子。0 医学基础家属面对一个空首页常常不敢点上传 ——
  // 给一个「无门槛预览」入口，带他们看一份完整的样例病历 + 匹配结果，再决定要不要传。
  goToDemo() {
    wx.navigateTo({
      url: '/pages/demo/demo'
    })
  },

  goToRecords() {
    wx.switchTab({
      url: '/pages/records/records'
    })
  },

  goToMatches() {
    wx.navigateTo({
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
