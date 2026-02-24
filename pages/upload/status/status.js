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
      { name: '上传文件', completed: false, active: true },
      { name: 'OCR识别', completed: false, active: false },
      { name: '信息抽取', completed: false, active: false },
      { name: '结构化处理', completed: false, active: false }
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
      const { status, progress, result } = res.data
      
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
        uploading: { text: '正在上传', desc: '文件传输中...' },
        parsing: { text: 'OCR识别中', desc: '正在识别文字内容...' },
        analyzing: { text: '信息抽取中', desc: '正在提取医疗实体...' },
        structuring: { text: '结构化处理', desc: '正在生成病历卡片...' },
        completed: { text: '解析完成', desc: '' },
        error: { text: '解析失败', desc: '' }
      }

      this.setData({
        status,
        statusText: statusMap[status]?.text || '处理中',
        statusDesc: statusMap[status]?.desc || '',
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
        this.setData({ errorMsg: res.data.message || '解析失败，请重试' })
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

  // 查看匹配试验
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