const api = require('../../utils/api')
const auth = require('../../utils/auth')
const privacy = require('../../utils/privacy')

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
    const token = `${wx.getStorageSync('token') || ''}`.trim()
    if (!token) {
      this.setData({
        userInfo: {
          nickName: '微信用户',
          avatarUrl: ''
        },
        stats: {
          records: 0,
          matches: 0,
          applications: 0
        }
      })
      return
    }

    try {
      const session = await auth.ensureLogin()
      const app = getApp()
      const userInfo = app.globalData.userInfo || session.userInfo || this.data.userInfo

      this.setData({
        userInfo
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
    } catch (error) {
      console.error('加载个人中心失败:', privacy.sanitizeForLog({ message: error.message }))
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
      content: '可在匹配页面提交报名（姓名、疾病和可选手机号）。报名记录页面将在后续版本开放。',
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
