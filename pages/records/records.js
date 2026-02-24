// pages/records/records.js
Page({
  data: {
    records: [
      {
        id: '1',
        type: '出院小结',
        diagnosis: '非小细胞肺癌 IV期',
        status: 'parsed',
        statusText: '已解析',
        uploadTime: '2024-02-24',
        matchCount: 3
      },
      {
        id: '2',
        type: '基因检测',
        diagnosis: 'EGFR 19del 突变',
        status: 'parsed',
        statusText: '已解析',
        uploadTime: '2024-02-20',
        matchCount: 5
      }
    ]
  },

  goToUpload() {
    wx.navigateTo({ url: '/pages/upload/upload' })
  },

  viewRecord(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/records/detail?id=${id}` })
  }
})