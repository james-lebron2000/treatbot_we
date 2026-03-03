const api = require('../../utils/api')
const auth = require('../../utils/auth')
const privacy = require('../../utils/privacy')

const PHONE_REG = /^1\d{10}$/

const countList = (res) => {
  const payload = api.normalizePayload(res)
  if (!payload) {
    return 0
  }

  if (Array.isArray(payload)) {
    return payload.length
  }

  if (Array.isArray(payload.list)) {
    return payload.list.length
  }

  if (typeof payload.total === 'number') {
    return payload.total
  }

  return 0
}

Page({
  data: {
    userInfo: {
      nickName: '微信用户',
      avatarUrl: ''
    },
    userPhone: '',
    backendStatus: {
      health: false,
      capabilities: {
        matchFind: true,
        parseStatus: true,
        medicalRecords: true
      },
      updatedAt: ''
    },
    stats: {
      records: 0,
      matches: 0,
      applications: 0
    }
  },

  async onShow() {
    await this.loadProfile()
  },

  async loadProfile() {
    try {
      const session = await auth.ensureLogin()
      const app = getApp()
      const userInfo = app.globalData.userInfo || session.userInfo || this.data.userInfo
      const phone = wx.getStorageSync('patientPhone') || session.phone || ''

      this.setData({
        userInfo,
        userPhone: privacy.maskPhone(phone)
      })

      const [recordsRes, matchesRes, applicationsRes] = await Promise.all([
        api.getMedicalRecords().catch(() => null),
        api.getMatches({ pageSize: 1 }).catch(() => null),
        api.getApplications().catch(() => null)
      ])

      this.setData({
        stats: {
          records: countList(recordsRes),
          matches: countList(matchesRes),
          applications: countList(applicationsRes)
        }
      })

      await this.loadBackendStatus()
    } catch (error) {
      console.error('加载个人中心失败:', privacy.sanitizeForLog({ message: error.message }))
      await this.loadBackendStatus()
    }
  },

  async loadBackendStatus() {
    try {
      const status = await api.getBackendStatus()
      this.setData({
        backendStatus: {
          ...status,
          updatedAt: new Date().toLocaleString()
        }
      })
    } catch (error) {
      this.setData({
        backendStatus: {
          health: false,
          capabilities: {
            matchFind: false,
            parseStatus: false,
            medicalRecords: false
          },
          updatedAt: new Date().toLocaleString()
        }
      })
    }
  },

  updatePhoneState(phone) {
    if (!phone) {
      return
    }
    wx.setStorageSync('patientPhone', phone)
    this.setData({ userPhone: privacy.maskPhone(phone) })
  },

  async bindPhoneByValue(phone) {
    const res = await api.bindPhone({
      phoneNumber: phone,
      phone
    })
    const payload = api.normalizePayload(res) || {}
    const normalizedPhone = payload.phone || payload.mobile || phone
    this.updatePhoneState(normalizedPhone)
    return normalizedPhone
  },

  async promptManualPhoneBind(defaultValue = '') {
    return new Promise((resolve) => {
      wx.showModal({
        title: '手动绑定手机号',
        content: defaultValue,
        editable: true,
        placeholderText: '请输入11位手机号',
        confirmText: '立即绑定',
        cancelText: '稍后再说',
        success: async (modalRes) => {
          if (!modalRes.confirm) {
            resolve(false)
            return
          }

          const phone = `${modalRes.content || ''}`.trim()
          if (!PHONE_REG.test(phone)) {
            wx.showToast({ title: '手机号格式不正确', icon: 'none' })
            resolve(await this.promptManualPhoneBind(phone))
            return
          }

          wx.showLoading({ title: '绑定中...' })
          try {
            await this.bindPhoneByValue(phone)
            wx.showToast({ title: '手机号绑定成功', icon: 'success' })
            resolve(true)
          } catch (error) {
            wx.showToast({ title: '手动绑定失败，请稍后重试', icon: 'none' })
            resolve(false)
          } finally {
            wx.hideLoading()
          }
        }
      })
    })
  },

  async onGetPhoneNumber(e) {
    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      const bound = await this.promptManualPhoneBind()
      if (!bound) {
        wx.showToast({ title: '可在报名页手动填写手机号', icon: 'none' })
      }
      return
    }

    wx.showLoading({ title: '绑定中...' })
    try {
      const res = await api.bindPhone({
        encryptedData: e.detail.encryptedData,
        iv: e.detail.iv
      })
      const payload = api.normalizePayload(res)
      const phone = payload.phone || payload.mobile || ''
      if (phone) {
        this.updatePhoneState(phone)
        wx.showToast({ title: '手机号绑定成功', icon: 'success' })
        return
      }

      wx.hideLoading()
      const bound = await this.promptManualPhoneBind()
      if (!bound) {
        wx.showToast({ title: '可在报名页手动填写手机号', icon: 'none' })
      }
    } catch (error) {
      wx.hideLoading()
      const bound = await this.promptManualPhoneBind()
      if (!bound) {
        wx.showToast({ title: '绑定失败，可继续使用核心功能', icon: 'none' })
      }
    } finally {
      wx.hideLoading()
    }
  },

  goToRecords() {
    wx.switchTab({ url: '/pages/records/records' })
  },

  goToMatches() {
    wx.switchTab({ url: '/pages/matches/matches' })
  },

  goToApplications() {
    wx.showModal({
      title: '报名记录',
      content: '可在匹配页面提交报名（姓名+疾病+手机号）。报名记录页面将在后续版本开放。',
      showCancel: false
    })
  },

  contactSupport() {
    wx.showModal({
      title: '联系客服',
      content: '客服电话：400-666-8899\n服务时间：9:00-18:00',
      showCancel: false
    })
  },

  aboutUs() {
    wx.showModal({
      title: '关于我们',
      content: '海马智合致力于帮助患者高效匹配临床试验。',
      showCancel: false
    })
  },

  showPrivacyPolicy() {
    wx.showModal({
      title: '隐私政策',
      content: '我们仅在您授权范围内使用病历数据用于临床试验匹配。',
      showCancel: false
    })
  }
})
