const api = require('../../../utils/api')
const auth = require('../../../utils/auth')
// Q3-红线 §B.2：报名提交成功 = 漏斗 application_submitted
const { track } = require('../../../utils/track')
// P0：报名前知情同意文案与 scope/policyVersion（单一来源）
const safety = require('../../../shared/copy/safety.js')

const PHONE_REG = /^1\d{10}$/

Page({
  data: {
    trialId: '',
    trialName: '',
    trialPhase: '',
    trialLocation: '',
    form: {
      name: '',
      disease: '',
      phone: ''
    },
    submitting: false,
    // P0 知情同意
    consent: safety.consent,
    consentChecked: false
  },

  toggleConsent() {
    this.setData({ consentChecked: !this.data.consentChecked })
  },

  onLoad(options) {
    const cachedTrial = wx.getStorageSync('selectedApplyTrial') || {}
    const draft = wx.getStorageSync('structuredRecordDraft') || {}
    const cachedPhone = wx.getStorageSync('patientPhone') || ''

    const trialId = options.trialId || cachedTrial.id || ''
    const trialName = cachedTrial.name || cachedTrial.title || ''
    const trialPhase = cachedTrial.phase || ''
    const trialLocation = cachedTrial.location || ''

    this.setData({
      trialId: `${trialId}`,
      trialName,
      trialPhase,
      trialLocation,
      form: {
        name: '',
        disease: draft.diagnosis || draft.disease || '',
        phone: cachedPhone
      }
    })
  },

  onNameInput(e) {
    this.setData({
      'form.name': e.detail.value
    })
  },

  onDiseaseInput(e) {
    this.setData({
      'form.disease': e.detail.value
    })
  },

  onPhoneInput(e) {
    this.setData({
      'form.phone': e.detail.value
    })
  },

  validateForm() {
    const form = this.data.form
    if (!`${this.data.trialId || ''}`.trim()) {
      return '试验信息缺失'
    }
    const phone = `${form.phone || ''}`.trim()
    if (phone && !PHONE_REG.test(phone)) {
      return '手机号格式不正确'
    }
    return ''
  },

  async submitApplication() {
    if (this.data.submitting) {
      return
    }

    // P0：未勾选知情同意不允许提交
    if (!this.data.consentChecked) {
      wx.showToast({ title: this.data.consent.requireToast, icon: 'none' })
      return
    }

    const validationMessage = this.validateForm()
    if (validationMessage) {
      wx.showToast({
        title: validationMessage,
        icon: 'none'
      })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...' })

    try {
      await auth.ensureLogin()

      // P0：报名前记录 share_with_cro 知情同意（审计轨迹）。
      // 勾选框是强制闸；此处补一条服务端 UserConsent 记录，失败不阻断报名。
      try {
        await api.recordConsent(this.data.consent.scope, this.data.consent.policyVersion)
      } catch (e) { /* 网络失败不阻断；同意已前端强制勾选 */ }

      const recordId = wx.getStorageSync('currentRecordId') || ''
      const disease = `${this.data.form.disease || ''}`.trim()
      const name = `${this.data.form.name || ''}`.trim()
      const phone = `${this.data.form.phone || ''}`.trim()

      const payload = {
        trialId: this.data.trialId,
        trialName: this.data.trialName,
        location: this.data.trialLocation,
        name,
        disease,
        phone,
        recordId,
        recordIds: recordId ? [recordId] : [],
        remark: `来源:小程序${name ? `；姓名:${name}` : ''}${disease ? `；疾病:${disease}` : ''}`
      }

      const res = await api.applyTrial(payload)
      if (phone) {
        wx.setStorageSync('patientPhone', phone)
      }

      // Q3-红线 §B.2：服务端 200 即记 application_submitted（fallback 也算一次完整漏斗）
      try {
        track('application_submitted', {
          trialId: this.data.trialId,
          fallback: !!(res && res.fallback)
        })
      } catch (e) { /* ignore */ }

      if (res && res.fallback) {
        const fallbackMessage =
          (res.data && (res.data.message || res.data.msg)) || '后端报名接口暂未开放，信息已在本地保存。后端开通后可继续提交。'
        wx.showModal({
          title: '已暂存报名信息',
          content: fallbackMessage,
          showCancel: false,
          success: () => {
            wx.navigateBack()
          }
        })
        return
      }

      wx.showModal({
        title: '提交成功',
        content: '报名信息已提交，后续将有人工与您联系。',
        showCancel: false,
        success: () => {
          wx.navigateBack()
        }
      })
    } catch (error) {
      wx.showToast({
        title: error.message || '提交失败，请稍后重试',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
      this.setData({ submitting: false })
    }
  }
})
