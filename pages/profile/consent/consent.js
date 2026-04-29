// Q3-红线 §A.2：我的同意记录页 —— 列出所有 scope + policyVersion + recordedAt。
// 后端：GET /api/me/consent (server/routes/index.js:50)。
const api = require('../../../utils/api')

const SCOPE_LABELS = {
  upload: '病历上传与解析',
  match: '匹配推荐',
  share_with_cro: '与研究团队共享',
  marketing: '产品改进与运营'
}

const formatTime = (value) => {
  if (!value) return '--'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return `${value}`
  const pad = (n) => `${n}`.padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

Page({
  data: {
    loading: true,
    list: [],
    errorMessage: ''
  },

  onLoad() {
    this.loadConsent()
  },

  async onPullDownRefresh() {
    await this.loadConsent()
    wx.stopPullDownRefresh()
  },

  async loadConsent() {
    this.setData({ loading: true, errorMessage: '' })
    try {
      const res = await api.getMyConsent()
      const payload = api.normalizePayload(res) || {}
      const raw = Array.isArray(payload) ? payload : (payload.list || payload.items || [])
      const list = raw.map((item) => ({
        scope: item.scope || '',
        scopeLabel: SCOPE_LABELS[item.scope] || item.scope || '其他',
        policyVersion: item.policyVersion || item.policy_version || '--',
        recordedAt: formatTime(item.recordedAt || item.recorded_at || item.createdAt || item.created_at)
      }))
      this.setData({ loading: false, list })
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error.message || '加载同意记录失败，请稍后重试'
      })
    }
  }
})
