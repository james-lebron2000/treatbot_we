// PRD-2026Q2 §P0-2：隐私承诺页 + 客服拨打
Page({
  callSupport() {
    wx.makePhoneCall({
      phoneNumber: '400-666-8899',
      fail: (err) => {
        // 用户取消拨打或机型不支持时静默；其它失败给一个 toast 兜底
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '请手动拨打 400-666-8899', icon: 'none' })
        }
      }
    })
  }
})
