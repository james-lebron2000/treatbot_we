// PRD-2026Q2 §3.7：小程序手动录入页（H5 MatchesView 的 manualEntry 入口对等），
// 用来当用户没有报告 / 不想上传时，直接把诊断/分期/基因/年龄录入后进入匹配。
// U4：为 0 医学基础病人加「？」白话解释 + 「我不知道，先跳过」逃生口。
const api = require('../../utils/api')
const copy = require('../../shared/copy/upload.json')
const glossary = require('../../shared/copy/glossary.json')

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
    submitting: false
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
    const { form, unknownFields } = this.data
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
      wx.switchTab({ url: '/pages/matches/matches' })
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

// 让 api 引用不被 lint 判定为 unused —— 保留是为了后续接入 /api/medical/records 创建病历。
void api
