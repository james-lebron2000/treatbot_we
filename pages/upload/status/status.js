// pages/upload/status/status.js
const api = require('../../../utils/api')

const POLL_INTERVAL = 1500
const MAX_POLL_DURATION = 5 * 60 * 1000
const MAX_CONSECUTIVE_FAILURES = 3

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
    if (!options.fileId) {
      this.setData({
        status: 'error',
        errorMsg: '缺少 fileId，无法查询解析状态'
      })
      return
    }
    this.setData({ fileId: options.fileId })
    this.startPolling()
  },

  onHide() {
    this.stopPolling()
  },

  onShow() {
    if (this.data.fileId && this.data.status !== 'completed' && this.data.status !== 'error') {
      this.startPolling()
    }
  },

  // 开始轮询解析状态
  startPolling() {
    if (!this.data.fileId) {
      return
    }
    this.stopPolling()
    this.isPolling = true
    this.isChecking = false
    this.pollStartAt = Date.now()
    this.consecutiveFailures = 0
    this.scheduleNextPoll()
  },

  scheduleNextPoll() {
    if (!this.isPolling) {
      return
    }

    this.pollTimer = setTimeout(async () => {
      if (Date.now() - this.pollStartAt > MAX_POLL_DURATION) {
        this.stopPolling()
        this.setData({
          status: 'error',
          errorMsg: '解析超时，请稍后在病历列表查看结果'
        })
        return
      }
      await this.checkStatus()
      this.scheduleNextPoll()
    }, POLL_INTERVAL)
  },

  stopPolling() {
    this.isPolling = false
    if (this.pollTimer) {
      clearTimeout(this.pollTimer)
      this.pollTimer = null
    }
  },

  // 检查解析状态
  async checkStatus() {
    if (this.isChecking || !this.data.fileId) {
      return
    }
    this.isChecking = true
    try {
      const res = await api.getParseStatus(this.data.fileId)
      const { status, progress, result } = res.data
      this.consecutiveFailures = 0
      
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
        this.stopPolling()
        this.formatResult(result)
      }

      // 解析错误
      if (status === 'error') {
        this.stopPolling()
        this.setData({ errorMsg: res.data.message || '解析失败，请重试' })
      }
    } catch (error) {
      console.error('检查状态失败:', error)
      this.consecutiveFailures += 1
      if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        this.stopPolling()
        this.setData({ errorMsg: '网络异常，请稍后重试', status: 'error' })
      }
    } finally {
      this.isChecking = false
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
    this.stopPolling()
  }
})
