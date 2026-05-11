const api = require('../../utils/api')
const auth = require('../../utils/auth')
const privacy = require('../../utils/privacy')

// Q3-红线 §A.2：用户合规自助—— 同意管理 / 数据导出 / 注销账号。
// 后端在 server/routes/index.js:49-53 已就绪；本页负责入口。

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

  // PRD-2026Q2 §P0-8：「正在联络的」菜单项暂时下线（wxml 已注释）。
  // 此函数保留：万一缓存版本仍能触发，给用户一个真实可拨的客服电话兜底。
  goToApplications() {
    wx.showModal({
      title: '我们正在帮您联络',
      content: '研究团队会在 1-3 个工作日内电话联系您。\n如需立即咨询，请拨打客服 400-666-8899。',
      confirmText: '拨打客服',
      cancelText: '稍后再说',
      success: (res) => {
        if (res.confirm) {
          wx.makePhoneCall({ phoneNumber: '400-666-8899' })
        }
      }
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

  // PRD-2026Q2 §P0-2：从模糊的一句 modal 改为跳转到独立的隐私承诺页
  // （5 张具体卡 + 客服可拨打）。
  showPrivacyPolicy() {
    wx.navigateTo({ url: '/pages/profile/privacy/privacy' })
  },

  // Q3-红线 §A.2：跳转「我的同意记录」页
  goToConsent() {
    wx.navigateTo({ url: '/pages/profile/consent/consent' })
  },

  // Q3-红线 §A.2：导出我的数据（小程序无文件系统写权限，落剪贴板）。
  async exportMyData() {
    const token = `${wx.getStorageSync('token') || ''}`.trim()
    if (!token) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    wx.showLoading({ title: '正在导出…', mask: true })
    try {
      const res = await api.exportMyData()
      const payload = api.normalizePayload(res)
      const text = JSON.stringify(payload || res || {}, null, 2)
      wx.hideLoading()
      wx.setClipboardData({
        data: text,
        success: () => {
          wx.showModal({
            title: '导出完成',
            content: '您的数据已复制到剪贴板，可粘贴到备忘录或邮件中保存。',
            showCancel: false
          })
        },
        fail: () => {
          wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' })
        }
      })
    } catch (error) {
      wx.hideLoading()
      console.error('导出失败:', privacy.sanitizeForLog({ message: error.message }))
      wx.showToast({ title: error.message || '导出失败', icon: 'none' })
    }
  },

  // Q3-红线 §A.2：注销账号（不可逆，二次确认；与 H5 SettingsView 注销流程同语义）。
  deleteMyAccount() {
    wx.showModal({
      title: '注销账号',
      content: '注销后您的病历、匹配记录和报名记录将被删除，且无法恢复。是否继续？',
      confirmText: '继续注销',
      confirmColor: '#d93025',
      success: (res) => {
        if (!res.confirm) return

        // 二次输入确认（最低强度交互；后续可换 wx.requireMfa）
        wx.showModal({
          title: '请再次确认',
          editable: true,
          placeholderText: '输入「确认注销」以继续',
          success: async (r2) => {
            if (!r2.confirm) return
            const text = `${r2.content || ''}`.trim()
            if (text !== '确认注销') {
              wx.showToast({ title: '输入不匹配，已取消', icon: 'none' })
              return
            }

            wx.showLoading({ title: '处理中…', mask: true })
            try {
              await api.deleteMyAccount('用户主动注销')
              wx.hideLoading()
              auth.logout()
              wx.showModal({
                title: '已注销',
                content: '您的账号已注销，感谢使用。',
                showCancel: false,
                success: () => {
                  wx.reLaunch({ url: '/pages/index/index' })
                }
              })
            } catch (error) {
              wx.hideLoading()
              wx.showToast({ title: error.message || '注销失败，请稍后重试', icon: 'none' })
            }
          }
        })
      }
    })
  }
})
