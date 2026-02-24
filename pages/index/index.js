// pages/index/index.js
const app = getApp()

Page({
  data: {
    recentMatches: [],
    loading: false
  },

  onLoad() {
    this.loadRecentMatches()
  },

  onShow() {
    // 每次显示页面时刷新数据
    this.loadRecentMatches()
  },

  // 加载最近匹配记录
  async loadRecentMatches() {
    this.setData({ loading: true })
    
    try {
      // 实际项目中调用API
      // const result = await app.request({
      //   url: '/api/matches/recent',
      //   method: 'GET'
      // })
      
      // 模拟数据
      const mockMatches = [
        {
          id: '1',
          trialName: 'PD-1抑制剂治疗晚期肺癌II期临床试验',
          matchScore: 92,
          phase: 'II期',
          location: '上海',
          indication: '非小细胞肺癌',
          institution: '复旦大学附属肿瘤医院'
        },
        {
          id: '2',
          trialName: '新型靶向药物治疗EGFR突变肺癌研究',
          matchScore: 85,
          phase: 'III期',
          location: '北京',
          indication: 'EGFR突变阳性肺癌',
          institution: '中国医学科学院肿瘤医院'
        }
      ]
      
      this.setData({
        recentMatches: mockMatches,
        loading: false
      })
    } catch (error) {
      console.error('加载匹配记录失败:', error)
      this.setData({ loading: false })
    }
  },

  // 跳转到上传页面
  goToUpload() {
    wx.navigateTo({
      url: '/pages/upload/upload'
    })
  },

  // 跳转到病历页面
  goToRecords() {
    wx.switchTab({
      url: '/pages/records/records'
    })
  },

  // 跳转到匹配页面
  goToMatches() {
    wx.switchTab({
      url: '/pages/matches/matches'
    })
  },

  // 查看匹配详情
  viewMatchDetail(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/matches/detail?id=${id}`
    })
  },

  // 下拉刷新
  async onPullDownRefresh() {
    await this.loadRecentMatches()
    wx.stopPullDownRefresh()
  }
})