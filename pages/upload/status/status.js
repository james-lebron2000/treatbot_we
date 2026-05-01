// pages/upload/status/status.js
const api = require('../../../utils/api')

Page({
  data: {
    fileId: '',
    status: 'uploading',
    statusText: '正在上传',
    statusDesc: '请稍候...',
    progress: 0,
    steps: [
      { name: '正在上传', completed: false, active: true },
      { name: '识别文字', completed: false, active: false },
      { name: '找关键信息', completed: false, active: false },
      { name: '整理成病历卡片', completed: false, active: false }
    ],
    parsedResult: [],
    errorMsg: ''
  },

  onLoad(options) {
    if (options.fileId) {
      this.setData({ fileId: options.fileId })
      this.startPolling()
    }
  },

  // 开始轮询解析状态
  startPolling() {
    this.pollTimer = setInterval(() => {
      this.checkStatus()
    }, 1000)
  },

  // 检查解析状态
  async checkStatus() {
    try {
      const res = await api.getParseStatus(this.data.fileId)
      const payload = api.normalizePayload(res) || {}
      const { status, progress, result } = payload
      
      // 更新步骤状态
      const steps = this.data.steps.map((step, index) => {
        const stepProgress = (index + 1) * 25
        return {
          ...step,
          completed: progress >= stepProgress,
          active: progress >= stepProgress - 25 && progress < stepProgress
        }
      })

      // 状态文本映射
      const statusMap = {
        uploading: { text: '正在上传', desc: '马上好…' },
        parsing: { text: '识别文字中', desc: '在看清病历上写的什么…' },
        analyzing: { text: '找关键信息', desc: '找诊断、分期、基因等重点…' },
        structuring: { text: '整理成病历卡片', desc: '马上给您一份能看懂的摘要…' },
        completed: { text: '好了', desc: '' },
        error: { text: '遇到小问题', desc: '' }
      }
      const currentStatus = statusMap[status] || { text: '处理中', desc: '' }

      this.setData({
        status,
        statusText: currentStatus.text,
        statusDesc: currentStatus.desc,
        progress,
        steps
      })

      // 解析完成
      if (status === 'completed' && result) {
        clearInterval(this.pollTimer)
        this.formatResult(result)
      }

      // 解析错误
      if (status === 'error') {
        clearInterval(this.pollTimer)
        this.setData({ errorMsg: payload.errorMsg || payload.message || '解析失败，请重试' })
      }
    } catch (error) {
      console.error('检查状态失败:', error)
    }
  },

  // 格式化解析结果
  formatResult(result) {
    const formatted = [
      { label: '诊断', value: result.diagnosis || '未识别' },
      { label: '分期', value: result.stage || '未识别' },
      { label: '基因突变', value: result.geneMutation || '未识别' },
      { label: '既往治疗', value: result.treatment || '未识别' },
      { label: 'ECOG评分', value: result.ecog !== undefined ? result.ecog + '分' : '未识别' }
    ]
    this.setData({ parsedResult: formatted })
  },

  // 手动修正
  editResult() {
    wx.showToast({ title: '进入编辑模式', icon: 'none' })
  },

  // 查看找到的新药
  goToMatches() {
    wx.switchTab({ url: '/pages/matches/matches' })
  },

  // 重试
  retry() {
    wx.navigateBack()
  },

  onUnload() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
    }
  }
})
