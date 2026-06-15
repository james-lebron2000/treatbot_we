// A 轨页面（P1）：标准治疗（指南）。回答家属最先问的「我家人这个病，规范治疗大概是什么？
// 我们走到哪一步了？」与 B 轨（新药/试验）并联——这里先建立「尺子」与信任。
const api = require('../../utils/api')
const auth = require('../../utils/auth')
const { track } = require('../../utils/track')
const safety = require('../../shared/copy/safety.js')

const STAGE_LABEL = {
  early: '早期',
  local_advanced: '局部晚期',
  advanced: '晚期 / 转移性',
  limited: '局限期',
  extensive: '广泛期'
}

// 治疗线数 → 人话的「走到哪一步」。
const journeyText = (line) => {
  if (line == null) return '还不确定您家人已经用过几轮治疗 —— 补充病历能让判断更准。'
  if (line <= 0) return '看起来还未开始系统性抗肿瘤治疗，或正处在一线治疗阶段。'
  if (line === 1) return '已经接受过一线治疗。'
  return `已经接受过约 ${line} 线治疗。`
}

// WXML 不便 join 数组：把 drugs/sideEffects 预拼成文本。
const decorateRegimens = (result) => {
  if (result && Array.isArray(result.regimens)) {
    result.regimens = result.regimens.map((r) => ({
      ...r,
      drugsText: (r.drugs || []).join('、'),
      sideEffectsText: (r.sideEffects || []).join('、')
    }))
  }
  return result
}

Page({
  data: {
    loading: false,
    errorMessage: '',
    recordId: '',
    educationKey: '',    // 病种科普模式：按癌种 key 查（无需病历）
    mode: '',            // '' 画像匹配 | 'education' 病种科普
    cancers: [],         // 无病历时的病种选择 chips
    pendingRecord: false, // 刚上传但病历还没解析完（区分「整理中」vs「先上传」）
    result: null,        // matchGuidelines / getCancerEducation 结果
    stageLabel: '',
    journeyText: '',
    // 静态文案
    emergencyCopy: safety.emergency,
    disclaimerLong: safety.disclaimer.long,
    safety: null
  },

  buildSafetyBanner(raw) {
    if (!raw || !raw.redFlag) return null
    const labels = (raw.categories || []).map((c) => (c && c.label) || '').filter(Boolean)
    return { redFlag: true, categoryLabels: labels.length ? labels.join('、') : safety.emergency.fallbackCategory }
  },

  onLoad(options) {
    if (options && options.recordId) {
      this.setData({ recordId: options.recordId })
    }
  },

  // 病种科普是「页内瞬态」：每次进入/回到本 tab 都回到画像匹配模式，避免
  // 「先浏览了某病种科普 → 上传病历后被带回 tab → 却仍停在旧科普」的串台。
  // 科普只在用户当前会话内点 chip（pickCancer）时临时进入。
  async onShow() {
    if (this.data.educationKey) {
      this.setData({ educationKey: '', mode: '' })
    }
    await this.loadGuidelines()
  },

  async loadGuidelines() {
    this.setData({ loading: true, errorMessage: '' })
    const token = `${wx.getStorageSync('token') || ''}`.trim()
    if (!token) {
      // 未登录也给病种科普入口（chips 接口是公开的，无需登录）。
      // 注意清掉 safety/mode——tab 页常驻，否则上一会话的急诊 banner 会悬挂在空页上。
      this.setData({ loading: false, result: null, mode: '', pendingRecord: false, safety: null, errorMessage: '' })
      this.loadCancerList()
      return
    }

    try {
      await auth.ensureLogin()
      const recordId = this.data.recordId || wx.getStorageSync('currentRecordId') || ''
      const res = await api.getGuidelines(recordId ? { recordId } : {})
      const result = decorateRegimens((res && res.data) || null)

      const matched = !!(result && result.matched)
      this.setData({
        loading: false,
        mode: '',
        result,
        // 没匹配但本地有 currentRecordId → 刚上传、还在解析，给「整理中」而非「先上传」
        pendingRecord: !matched && !!(this.data.recordId || wx.getStorageSync('currentRecordId')),
        stageLabel: result ? (STAGE_LABEL[result.stageBucket] || '') : '',
        journeyText: result ? journeyText(result.treatmentLine) : '',
        safety: this.buildSafetyBanner(res && res.safety)
      })

      // 没匹配到（无病历 / 癌种未覆盖）→ 拉病种 chips，给无门槛科普入口
      if (!result || !result.matched) {
        this.loadCancerList()
      }

      try { track('guideline_view', { matched: !!(result && result.matched), cancer: result && result.cancer && result.cancer.key }) } catch (e) { /* ignore */ }
    } catch (error) {
      this.setData({ loading: false, errorMessage: '标准治疗信息暂时没拿到，请稍后再试。' })
      this.loadCancerList()
    }
  },

  // 病种科普：拉取覆盖癌种（公开接口，无需登录）
  async loadCancerList() {
    if (this.data.cancers.length) return
    try {
      const res = await api.getGuidelineCancers()
      this.setData({ cancers: (res && res.data) || [] })
    } catch (e) { /* 静默：chips 只是增强项 */ }
  },

  // 病种科普：按癌种加载标准治疗概览（无需病历）
  async loadEducation(key) {
    this.setData({ loading: true, errorMessage: '' })
    try {
      const res = await api.getCancerEducation(key)
      const result = decorateRegimens((res && res.data) || null)
      this.setData({
        loading: false,
        mode: (result && result.mode) || 'education',
        result,
        stageLabel: '',
        journeyText: '',
        safety: null
      })
      if (!result || !result.matched) this.loadCancerList()
      try { track('guideline_education', { cancer: key, matched: !!(result && result.matched) }) } catch (e) { /* ignore */ }
    } catch (error) {
      this.setData({ loading: false, errorMessage: '病种信息暂时没拿到，请稍后再试。' })
    }
  },

  // 点病种 chip → 进入科普模式
  pickCancer(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    this.setData({ educationKey: key })
    this.loadEducation(key)
  },

  // 从科普模式返回（回到我的病历匹配）
  exitEducation() {
    this.setData({ educationKey: '', mode: '', result: null })
    this.loadGuidelines()
  },

  callEmergency() {
    wx.makePhoneCall({
      phoneNumber: this.data.emergencyCopy.phone,
      fail: () => wx.showToast({ title: `请尽快拨打 ${this.data.emergencyCopy.phone} 或就近就医`, icon: 'none' })
    })
  },

  goToUpload() {
    wx.navigateTo({ url: '/pages/upload/upload' })
  },

  goToMatches() {
    wx.navigateTo({ url: '/pages/matches/matches' })
  },

  async onPullDownRefresh() {
    if (this.data.educationKey) await this.loadEducation(this.data.educationKey)
    else await this.loadGuidelines()
    wx.stopPullDownRefresh()
  }
})
