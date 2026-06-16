// PRD-2026Q2 §3.7：小程序手动录入页（Treatbot Web MatchesView 的 manualEntry 入口对等），
// 用来当用户没有报告 / 不想上传时，直接把诊断/分期/基因/年龄录入后进入匹配。
// U4：为 0 医学基础病人加「？」白话解释 + 「我不知道，先跳过」逃生口。
const api = require('../../utils/api')
// shared/copy/* 已从 .json 迁到 .js，因 WeApp `require()` 不识 .json 后缀。
const copy = require('../../shared/copy/upload.js')
const glossary = require('../../shared/copy/glossary.js')

// 字段 key → glossary.fields key 映射（manualEntry 用的 genes 在 glossary 里叫 geneMutation）。
const FIELD_GLOSSARY_MAP = {
  diagnosis: 'diagnosis',
  stage: 'stage',
  genes: 'geneMutation',
  age: 'age'
}

const buildExplainers = () => {
  const out = {}
  Object.keys(FIELD_GLOSSARY_MAP).forEach((key) => {
    const entry = glossary.fields[FIELD_GLOSSARY_MAP[key]] || {}
    out[key] = {
      plain: entry.plain || '',
      example: entry.example || '',
      whyAsk: entry.whyAsk || '',
      iDontKnow: entry.iDontKnow || ''
    }
  })
  return out
}

Page({
  data: {
    copy,
    explainers: buildExplainers(),
    explainerOpen: {
      diagnosis: false,
      stage: false,
      genes: false,
      age: false
    },
    form: {
      diagnosis: '',
      stage: '',
      genes: '',
      age: ''
    },
    unknownFields: [],
    submitting: false,
    // 修复方案 Track 3.6：接收来自 OCR 失败模态的 fileId，让手填值挂到同一条 record_id 上，
    // 避免「OCR 失败 → 手填 → 又生一条新记录」导致用户回看时同一份病历有两条。
    fileId: ''
  },

  onLoad(options) {
    if (options && options.fileId) {
      this.setData({ fileId: options.fileId })
    }
  },

  onFieldInput(e) {
    const key = e.currentTarget.dataset.key
    if (!key) {
      return
    }
    this.setData({
      [`form.${key}`]: e.detail.value
    })
  },

  toggleExplainer(e) {
    const key = e.currentTarget.dataset.key
    if (!key) {
      return
    }
    const next = !this.data.explainerOpen[key]
    this.setData({
      [`explainerOpen.${key}`]: next
    })
  },

  markUnknown(e) {
    const key = e.currentTarget.dataset.key
    if (!key) {
      return
    }
    const list = (this.data.unknownFields || []).slice()
    if (list.indexOf(key) === -1) {
      list.push(key)
    }
    this.setData({
      [`form.${key}`]: '',
      [`explainerOpen.${key}`]: false,
      unknownFields: list
    })
    wx.showToast({ title: '已记下，继续后面的', icon: 'none' })
  },

  async submit() {
    const { form, unknownFields, fileId } = this.data
    if (!form.diagnosis && !form.stage) {
      wx.showToast({ title: '至少告诉我们诊断或分期', icon: 'none' })
      return
    }
    this.setData({ submitting: true })

    try {
      // PRD-2026Q2 §3.7：无文件场景 —— 直接写 structuredRecordDraft，跳到 matches。
      // 后端 enrichMedicalRecord 走服务端幂等；没有 recordId 时先挂本地草稿，
      // matches 页会按 draft 里的 disease/stage/gene_mutation 参数请求 /api/matches。
      const draft = {
        diagnosis: form.diagnosis,
        disease: form.diagnosis,
        stage: form.stage,
        geneMutation: form.genes,
        gene_mutation: form.genes,
        age: form.age,
        // U4：把用户主动跳过的字段一起带过去，后端目前可忽略，前端可用作埋点/兜底。
        unknownFields: unknownFields || []
      }
      wx.setStorageSync('structuredRecordDraft', draft)

      // 修复方案 Track 3.6：如果是从 OCR 失败模态过来的（带 fileId），把手填字段
      // 通过 PATCH /api/medical/records/:id/enrich 挂回同一条 record，让用户的「上传 → OCR 失败 → 手填」
      // 是同一条病历，不至于在 records 页看到两条同源记录。
      // enrich 失败仍然继续走 matches 流程（用本地 draft 兜底），不阻塞用户。
      if (fileId) {
        try {
          await api.enrichMedicalRecord(fileId, draft)
          wx.setStorageSync('currentRecordId', fileId)
        } catch (enrichErr) {
          console.warn('manualEntry: enrichMedicalRecord 失败，继续走本地 draft', enrichErr)
        }
      }

      // P2：录入完成先落「治疗方案」(标准治疗 A 轨)
      wx.switchTab({ url: '/pages/guideline/guideline' })
    } catch (error) {
      wx.showToast({ title: copy.error.unknown, icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  cancel() {
    wx.navigateBack({ delta: 1 })
  }
})
