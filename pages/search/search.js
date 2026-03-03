const api = require('../../utils/api')

Page({
  data: {
    keyword: '',
    filters: {
      phase: '', // 试验阶段
      location: '', // 地区
      status: '' // 招募状态
    },
    filterOptions: {
      phases: ['全部', 'I期', 'II期', 'III期', 'IV期'],
      locations: ['全部', '北京', '上海', '广州', '深圳', '杭州', '其他'],
      statuses: ['全部', '招募中', '未开始', '已结束']
    },
    results: [],
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    showFilter: false,
    history: []
  },

  onLoad() {
    // 加载搜索历史
    const history = wx.getStorageSync('search_history') || []
    this.setData({ history })
    
    // 加载初始数据
    this.loadResults()
  },

  // 输入关键词
  onSearchInput(e) {
    this.setData({
      keyword: e.detail.value
    })
  },

  // 确认搜索
  onSearchConfirm(e) {
    const keyword = e.detail.value
    if (!keyword.trim()) return
    
    this.addToHistory(keyword)
    this.setData({
      keyword,
      page: 1,
      results: [],
      hasMore: true
    }, () => {
      this.loadResults()
    })
  },

  // 添加到历史
  addToHistory(keyword) {
    let history = this.data.history.filter(item => item !== keyword)
    history.unshift(keyword)
    history = history.slice(0, 10) // 保留最近10条
    
    this.setData({ history })
    wx.setStorageSync('search_history', history)
  },

  // 清空历史
  clearHistory() {
    wx.showModal({
      title: '提示',
      content: '确定清空搜索历史吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({ history: [] })
          wx.removeStorageSync('search_history')
        }
      }
    })
  },

  // 点击历史
  onHistoryTap(e) {
    const { keyword } = e.currentTarget.dataset
    this.setData({
      keyword,
      page: 1,
      results: [],
      hasMore: true
    }, () => {
      this.loadResults()
    })
  },

  // 清除关键词
  clearKeyword() {
    this.setData({
      keyword: '',
      page: 1,
      results: [],
      hasMore: true
    }, () => {
      this.loadResults()
    })
  },

  // 显示/隐藏筛选
  toggleFilter() {
    this.setData({
      showFilter: !this.data.showFilter
    })
  },

  // 选择筛选条件
  onFilterSelect(e) {
    const { type, value } = e.currentTarget.dataset
    const filters = this.data.filters
    
    // "全部" 等同于空值
    filters[type] = value === '全部' ? '' : value
    
    this.setData({
      filters,
      page: 1,
      results: [],
      hasMore: true
    }, () => {
      this.loadResults()
    })
  },

  // 重置筛选
  resetFilters() {
    this.setData({
      filters: {
        phase: '',
        location: '',
        status: ''
      },
      page: 1,
      results: [],
      hasMore: true
    }, () => {
      this.loadResults()
    })
  },

  // 加载搜索结果
  async loadResults() {
    if (this.data.loading || !this.data.hasMore) return
    
    this.setData({ loading: true })
    
    try {
      const { keyword, filters, page, pageSize } = this.data
      
      const params = {
        page,
        pageSize,
        keyword: keyword || undefined,
        phase: filters.phase || undefined,
        location: filters.location || undefined,
        status: filters.status || undefined
      }
      
      // 调用搜索 API
      const result = await api.request({
        url: '/api/trials/search',
        data: params
      })
      
      const { list, pagination } = result.data
      
      this.setData({
        results: page === 1 ? list : [...this.data.results, ...list],
        hasMore: pagination.hasMore,
        page: page + 1
      })
    } catch (error) {
      console.error('搜索失败:', error)
      wx.showToast({
        title: '搜索失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  // 加载更多
  onLoadMore() {
    this.loadResults()
  },

  // 查看详情
  viewDetail(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/matches/detail/detail?id=${id}`
    })
  },

  // 下拉刷新
  async onPullDownRefresh() {
    this.setData({
      page: 1,
      results: [],
      hasMore: true
    }, async () => {
      await this.loadResults()
      wx.stopPullDownRefresh()
    })
  },

  // 返回上一页
  goBack() {
    wx.navigateBack()
  }
})
