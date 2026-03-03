const api = require('../../utils/api')
const auth = require('../../utils/auth')
const schema = require('../../utils/schema')

const statusMap = {
  parsed: '已解析',
  completed: '已解析',
  parsing: '解析中',
  uploading: '上传中',
  failed: '解析失败',
  error: '解析失败'
}

const normalizeRecord = (item) => {
  const normalized = schema.normalizeStructuredRecord(item)
  const missingFields = schema.getMissingFields(normalized)

  return {
    id: item.id || item.recordId || item.fileId || '',
    type: item.type || item.recordType || '病历资料',
    diagnosis: normalized.diagnosis || '待补',
    stage: normalized.stage || '待补',
    status: item.status || 'parsed',
    statusText: item.statusText || statusMap[item.status] || '已上传',
    uploadTime: item.uploadTime || item.createdAt || '--',
    updatedAt: item.updatedAt || item.uploadTime || item.createdAt || '',
    matchCount: Number(item.matchCount || item.matches || 0),
    missingCount: missingFields.length,
    missingFields
  }
}

const pickList = (res) => {
  const payload = api.normalizePayload(res)
  if (Array.isArray(payload)) {
    return payload
  }

  return payload.list || payload.items || payload.records || payload.data || []
}

Page({
  data: {
    records: [],
    loading: false,
    errorMessage: ''
  },

  async onShow() {
    await this.loadRecords()
  },

  async loadRecords() {
    this.setData({ loading: true, errorMessage: '' })

    try {
      await auth.ensureLogin()
      const res = await api.getMedicalRecords()
      const records = pickList(res)
        .map(normalizeRecord)
        .sort((a, b) => `${b.updatedAt}`.localeCompare(`${a.updatedAt}`))

      this.setData({
        records,
        loading: false
      })
    } catch (error) {
      console.error('加载病历失败:', error)
      this.setData({
        loading: false,
        errorMessage: '加载病历失败，请稍后重试'
      })
    }
  },

  goToUpload() {
    wx.navigateTo({ url: '/pages/upload/upload' })
  },

  viewRecord(e) {
    const { id } = e.currentTarget.dataset
    if (!id) {
      wx.showToast({ title: '病历ID缺失', icon: 'none' })
      return
    }

    wx.navigateTo({ url: `/pages/matches/matches?recordId=${id}` })
  },

  async onPullDownRefresh() {
    await this.loadRecords()
    wx.stopPullDownRefresh()
  }
})
