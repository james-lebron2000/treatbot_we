const api = require('../../../utils/api')
const privacy = require('../../../utils/privacy')
const matchExplainer = require('../../../utils/match-explainer')

const withMaskedContact = (trial) => {
  const contact = trial.contact || {}
  return {
    ...trial,
    contact: {
      name: contact.name || '--',
      phone: contact.phone || '',
      phoneMasked: privacy.maskPhone(contact.phone || ''),
      email: contact.email || '--'
    }
  }
}

const mergeCachedTrial = (remoteTrial, cachedTrial) => {
  if (!cachedTrial || `${cachedTrial.id}` !== `${remoteTrial.id}`) {
    return remoteTrial
  }

  const merged = {
    ...cachedTrial,
    ...remoteTrial
  }

  if (Number(remoteTrial.score || 0) <= 0 && Number(cachedTrial.score || 0) > 0) {
    merged.score = cachedTrial.score
    merged.matchLevel = cachedTrial.matchLevel || merged.matchLevel
  }

  if ((!remoteTrial.reasons || remoteTrial.reasons.length === 0) && cachedTrial.reasons) {
    merged.reasons = cachedTrial.reasons
  }

  return merged
}

Page({
  data: {
    trialId: '',
    trial: null,
    loading: false,
    errorMessage: '',
    usingCachedData: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ trialId: options.id })
      this.loadTrialDetail()
    }
  },

  async loadTrialDetail() {
    this.setData({ loading: true, errorMessage: '' })

    try {
      const cachedTrial = wx.getStorageSync('selectedMatchDetail') || null
      const res = await api.getTrialDetail(this.data.trialId)
      const payload = api.normalizePayload(res) || {}

      const remoteTrial = matchExplainer.normalizeMatchItem(payload)
      const mergedTrial = mergeCachedTrial(remoteTrial, cachedTrial)
      const profile = matchExplainer.getPatientProfile()
      const explained = matchExplainer.enrichMatchExplanation(mergedTrial, profile)
      const trial = withMaskedContact(explained)

      this.setData({
        trial,
        usingCachedData: !!res.fallback
      })
    } catch (error) {
      this.setData({ errorMessage: '加载试验详情失败' })
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  callPhone() {
    const trial = this.data.trial || {}
    const contact = trial.contact || {}
    const phone = contact.phone
    if (!phone) {
      wx.showToast({ title: '暂无联系电话', icon: 'none' })
      return
    }

    wx.makePhoneCall({ phoneNumber: phone })
  },

  goToUpload() {
    wx.navigateTo({
      url: '/pages/upload/upload'
    })
  },

  applyTrial() {
    const trial = this.data.trial
    if (!trial || !trial.id) {
      wx.showToast({ title: '试验信息缺失', icon: 'none' })
      return
    }

    wx.setStorageSync('selectedApplyTrial', trial)
    wx.navigateTo({
      url: `/pages/matches/apply/apply?trialId=${encodeURIComponent(trial.id)}`
    })
  },

  async onPullDownRefresh() {
    await this.loadTrialDetail()
    wx.stopPullDownRefresh()
  }
})
