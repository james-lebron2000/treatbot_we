const api = require('../../utils/api')
const auth = require('../../utils/auth')
const parseTask = require('../../utils/parse-task')
const schema = require('../../utils/schema')
// PRD-2026Q2 §P1-6：复购钩子文案 + §T2-6：删除 modal 文案
const recordsCopy = require('../../shared/copy/records.js')

const statusMap = {
  parsed: '已解析',
  completed: '已解析',
  parsing: '解析中',
  uploading: '上传中',
  failed: '解析失败',
  error: '解析失败'
}

// PRD-2026Q2 §P1-6：把「上次更新时间 / 字段缺失」翻译成一句行动提示。
// 优先级：基因缺 > 重度过期 > 轻度过期 > 通用缺。返回 '' 表示不显示。
const computeDaysSince = (timestamp) => {
  if (!timestamp) return null
  const date = new Date(timestamp)
  if (isNaN(date.getTime())) return null
  return Math.floor((Date.now() - date.getTime()) / 86400000)
}

const buildHookText = (normalized, daysSince, missingFields) => {
  const tpl = recordsCopy.hooks
  // 1. 基因缺：所有用户都关心，最高优先级
  if (!normalized.geneMutation || normalized.geneMutation === '待补') {
    return tpl.geneMissing
  }
  // 2. 严重过期（≥ 90 天）—— 治疗方案可能已变
  if (daysSince !== null && daysSince >= 90) {
    return tpl.updateUrgent.replace('{n}', daysSince)
  }
  // 3. 轻度过期（30-90 天）
  if (daysSince !== null && daysSince >= 30) {
    return tpl.updateGentle.replace('{n}', daysSince)
  }
  // 4. 缺其它关键字段（stage / lineOfTherapy 等）
  if (missingFields.length >= 2) {
    return tpl.generalMissing.replace('{n}', missingFields.length)
  }
  return ''
}

const normalizeRecord = (item) => {
  const normalized = schema.normalizeStructuredRecord(item)
  const missingFields = schema.getMissingFields(normalized)
  const updatedAt = item.updatedAt || item.uploadTime || item.createdAt || ''
  const daysSince = computeDaysSince(updatedAt)

  return {
    id: item.id || item.recordId || item.fileId || '',
    type: item.type || item.recordType || '病历资料',
    diagnosis: normalized.diagnosis || '待补',
    stage: normalized.stage || '待补',
    status: item.status || 'parsed',
    statusText: item.statusText || statusMap[item.status] || '已上传',
    uploadTime: item.uploadTime || item.createdAt || '--',
    updatedAt,
    matchCount: Number(item.matchCount || item.matches || 0),
    missingCount: missingFields.length,
    missingFields,
    // PRD-2026Q2 §P1-6：复购钩子文本，空字符串 = wxml 不显示
    hookText: buildHookText(normalized, daysSince, missingFields)
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

    // PRD-2026Q3 §U7：病历 tab 点进每条记录，目标是「看自家病历的完整卡片 + 已匹配试验」
    // —— 即 records/detail。匹配 tab 仍可独立浏览所有匹配。
    wx.navigateTo({ url: `/pages/records/detail/detail?id=${encodeURIComponent(id)}` })
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

  // PRD-2026Q2 §T2-6：删除前先给一个「联系客服」逃生口。
  // 老人误删病历后找不回的场景在客服记录里出现 ≥ 3 次/月。
  // 流程：先弹「确认删除 / 联系客服 / 取消」三选一，confirm 才进真删除流程。
  confirmDeleteRecord(id) {
    const cfg = recordsCopy.delete
    wx.showModal({
      title: cfg.title,
      content: `${cfg.content}\n\n${cfg.contactFallback}`,
      confirmText: cfg.contactText,    // 主按钮 = 联系客服（防误删的稳态选项）
      cancelText: cfg.cancelText,
      confirmColor: '#2563eb',
      success: (res) => {
        if (res.confirm) {
          // 选「联系客服」直接拨打
          wx.makePhoneCall({ phoneNumber: cfg.contactPhone })
          return
        }
        // 选「再想想」/ 关闭：弹第二轮真正的删除确认（颜色 + 复述后果）
        wx.showModal({
          title: '再次确认',
          content: '确定要删除这份病历吗？删除后匹配过的新药也会一起消失。',
          confirmText: cfg.confirmText,
          cancelText: '取消',
          confirmColor: '#d93025',
          success: async (res2) => {
            if (!res2.confirm) return
            wx.showLoading({ title: '删除中…', mask: true })
            try {
              await api.softDeleteMedicalRecord(id)
              wx.hideLoading()
              const records = (this.data.records || []).filter((r) => `${r.id}` !== `${id}`)
              this.setData({ records })
              wx.showToast({ title: '已删除', icon: 'success' })
            } catch (error) {
              wx.hideLoading()
              wx.showToast({ title: error.message || '删除失败，请稍后重试', icon: 'none' })
            }
          }
        })
      }
    })
  },

  async onPullDownRefresh() {
    await this.loadRecords()
    wx.stopPullDownRefresh()
  }
})
