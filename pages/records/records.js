const api = require('../../utils/api')
const auth = require('../../utils/auth')
const parseTask = require('../../utils/parse-task')
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

    const token = `${wx.getStorageSync('token') || ''}`.trim()
    if (!token) {
      this.setData({
        records: [],
        loading: false,
        errorMessage: ''
      })
      return
    }

    try {
      await auth.ensureLogin()
      await parseTask.syncActiveParseTask().catch(() => null)
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

  // PRD-2026Q2 §3.5：长按弹「删除」action sheet。后端 DELETE /medical/records/:id
  // 已是软删（routes/index.js:68 → softDeleteRecord），UI 直接从列表 splice 即可。
  longPressRecord(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return
    wx.showActionSheet({
      itemList: ['删除该病历'],
      itemColor: '#d93025',
      success: (res) => {
        if (res.tapIndex === 0) {
          this.confirmDeleteRecord(id)
        }
      }
    })
  },

  confirmDeleteRecord(id) {
    wx.showModal({
      title: '确认删除',
      content: '删除后该病历将不再用于匹配，您可在 30 天内联系客服恢复。是否继续？',
      confirmText: '删除',
      confirmColor: '#d93025',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中…', mask: true })
        try {
          await api.softDeleteMedicalRecord(id)
          wx.hideLoading()
          // 立即从本地列表移除，避免一次完整 reload 抖动
          const records = (this.data.records || []).filter((r) => `${r.id}` !== `${id}`)
          this.setData({ records })
          wx.showToast({ title: '已删除', icon: 'success' })
        } catch (error) {
          wx.hideLoading()
          wx.showToast({ title: error.message || '删除失败，请稍后重试', icon: 'none' })
        }
      }
    })
  },

  async onPullDownRefresh() {
    await this.loadRecords()
    wx.stopPullDownRefresh()
  }
})
