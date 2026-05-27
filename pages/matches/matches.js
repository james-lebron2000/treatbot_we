const api = require('../../utils/api')
const auth = require('../../utils/auth')
const matchExplainer = require('../../utils/match-explainer')
const parseTask = require('../../utils/parse-task')
// Q3-红线 §B.2：match_view / trial_apply 漏斗事件
const { track } = require('../../utils/track')
// U4：把后端返回的英文/术语 reasons 翻译成普通人能读懂的一句话。
// 共享文案已从 .json 迁到 .js（WeApp require 不识 .json）；详见 shared/copy/glossary.js。
const glossary = require('../../shared/copy/glossary.js')
// PRD-2026Q2 §P0-4：matches 场景文案字典（含 0 结果三步兜底文案）
const matchesCopy = require('../../shared/copy/matches.js')
// 阿里健康/美团买药货架风格：把研究包装成"药品" — 主标题展示通用名/代号。
const { resolveDrug } = require('../../utils/drug-extractor')

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
    activeParseTask: null,
    // PRD-2026Q2 §P0-4：0 结果三步兜底文案
    emptyCopy: matchesCopy.empty,
    coverageTitle: matchesCopy.empty.coverage.title.replace('{n}', matchesCopy.empty.coverage.defaultN),
    // PRD-2026Q2 §P1-5：三 stat 区分判定依据 —— 已申请数从 trial.applied 累加
    appliedCount: 0
  },

  decorateMatches(list = [], previousMatches = this.data.matches || []) {
    const expandedMap = previousMatches.reduce((acc, item) => {
      acc[`${item.id}`] = !!item.expanded
      return acc
    }, {})

    return list.map((item) => {
      const drug = resolveDrug(item)
      return {
        ...item,
        expanded: !!expandedMap[`${item.id}`],
        subCenters: splitSubCenters(item.location),
        // U4：人话理由 —— 用 glossary 把 reasons 翻成普通人能看的一句话；
        // 没有 reasons 时走 fallback「这种新药的招募条件和您家人比较接近」。
        humanReason: humanizeReasons(item.reasons),
        // 货架视图核心字段：把研究翻译成「药」— 优先用后端返回的 drug，
        // 否则从 trial.name 词典抽取，再 fallback 到 type-based 占位。
        drugName: drug.name,
        drugCode: drug.code,
        drugClass: drug.class,
        drugForm: drug.form,
        drugBrand: drug.brand,
        manufacturer: drug.manufacturer,
        freeAccess: drug.freeAccess
      }
    })
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
      // PRD-2026Q2 §P1-5：「找到的新药」caption「含已申请 X 种」
      const appliedCount = matches.filter((item) => item.applied || item.applicationStatus).length

      this.setData({
        matches,
        highMatches,
        readyMatches,
        needSupplement,
        appliedCount,
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

  // 2026-05 UX：「打印给医生看看」—— 病友群口碑增长的物理载体之一。
  // 主治医生背书是中国家庭决策催化剂，把这张「方案」做成医生能扫一眼就懂的
  // 单页摘要（PDF / 长图），点开后可保存到相册或发到打印小程序。
  // 现阶段后端单页摘要 endpoint 还没就绪，先 navigateTo 详情页 + 提示，
  // 上线后改成 wx.canvasToTempFilePath 或调一个 share-card 渲染页即可。
  shareToDoctor(e) {
    const { id } = e.currentTarget.dataset
    const trial = this.data.matches.find((item) => `${item.id}` === `${id}`)
    if (!trial) return
    try { track('share_to_doctor', { trialId: trial.id }) } catch (e2) { /* ignore */ }
    wx.showToast({ title: '正在生成医生版方案…', icon: 'loading', duration: 1200 })
    setTimeout(() => {
      wx.setStorageSync('selectedMatchDetail', trial)
      wx.navigateTo({ url: `/pages/matches/detail/detail?id=${id}&mode=doctor` })
    }, 600)
  },

  // 2026-05 UX：「发给家人讨论」—— 让家属不用一个人扛决策的心理安全网，
  // 同时通过家庭群转发产生口碑外溢。走小程序原生分享卡片，跳到详情页带
  // ?share=family 让对方进来直接看这一种药。
  shareToFamily(e) {
    const { id } = e.currentTarget.dataset
    const trial = this.data.matches.find((item) => `${item.id}` === `${id}`)
    if (!trial) return
    try { track('share_to_family', { trialId: trial.id }) } catch (e2) { /* ignore */ }
    // 小程序里点击 share-link 不能直接拉起分享面板（必须是 button open-type="share"），
    // 这里先用 showActionSheet 给一个引导，告诉用户右上角分享按钮的位置 + 复制摘要兜底。
    const summary = `${trial.drugName}${trial.drugCode ? ' / ' + trial.drugCode : ''}\n` +
      `匹配度 ${trial.score}% · ${trial.decisionHint || ''}\n` +
      `${trial.manufacturer || ''}${trial.institution && trial.institution !== '待补' ? ' ｜ ' + trial.institution : ''}`
    wx.setClipboardData({
      data: summary,
      success: () => {
        wx.showModal({
          title: '已复制摘要',
          content: '可以粘到家庭群里 · 也可以点右上角「···」分享小程序卡片',
          showCancel: false,
          confirmText: '知道了'
        })
      }
    })
  },

  // PRD-2026Q2 §P0-4：0 结果三步兜底之一 —— 订阅通知
  // 现阶段后端 /api/medical/notify-subscribe 还没就绪，先存本地 + 给 toast。
  // 上线后改 await api.subscribeNotify({ recordId, phone }) 即可。
  notifyOnNewMatch() {
    const recordId = this.data.recordId
    const existed = wx.getStorageSync('notifySubscribed') || {}
    if (existed[recordId]) {
      wx.showToast({ title: matchesCopy.notifyResult.duplicate, icon: 'none' })
      return
    }

    // 让用户填手机号；在小程序里复用 wx.getUserProfile 流程会更复杂，
    // 这里走一个简单的 prompt。后续接 wx.login + 真实接口再升级。
    wx.showModal({
      title: '留个手机号',
      editable: true,
      placeholderText: '11 位手机号',
      confirmText: '订阅',
      cancelText: '再想想',
      success: (res) => {
        if (!res.confirm) return
        const phone = (res.content || '').trim()
        if (!/^1\d{10}$/.test(phone)) {
          wx.showToast({ title: '手机号好像不对', icon: 'none' })
          return
        }
        // 本地存下，不上传服务器（避免在没有同意书的情况下传 PII）
        existed[recordId] = { phone, ts: Date.now() }
        wx.setStorageSync('notifySubscribed', existed)
        wx.showToast({ title: matchesCopy.notifyResult.success, icon: 'success' })
        try { track('notify_subscribed', { recordId }) } catch (e) { /* ignore */ }
      }
    })
  },

  // PRD-2026Q2 §P0-4：0 结果三步兜底之二 —— 拨打客服
  callSupport() {
    const phone = matchesCopy.empty.contact.phone
    wx.makePhoneCall({
      phoneNumber: phone,
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: `请手动拨打 ${phone}`, icon: 'none' })
        }
      }
    })
    try { track('support_called', { from: 'matches_empty' }) } catch (e) { /* ignore */ }
  },

  async onPullDownRefresh() {
    await this.loadMatches()
    wx.stopPullDownRefresh()
  }
})
