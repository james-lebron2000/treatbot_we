const api = require('../../../utils/api')
const auth = require('../../../utils/auth')

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
    submitting: false
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
    if (!PHONE_REG.test(`${form.phone || ''}`.trim())) {
      return '请输入11位手机号'
    }
    return ''
  },

  async submitApplication() {
    if (this.data.submitting) {
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
      wx.setStorageSync('patientPhone', payload.phone)

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
