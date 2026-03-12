const api = require('../../utils/api')
const auth = require('../../utils/auth')
const schema = require('../../utils/schema')
const parseTask = require('../../utils/parse-task')

const STATUS_TEXT_MAP = {
  uploading: { progress: 10, uiTarget: 18, step: 0, text: '文件上传中...' },
  parsing: { progress: 45, uiTarget: 58, step: 1, text: '正在识别文字...' },
  analyzing: { progress: 75, uiTarget: 82, step: 2, text: '正在抽取医疗实体...' },
  structuring: { progress: 90, uiTarget: 96, step: 3, text: '正在生成结构化病历...' },
  completed: { progress: 100, uiTarget: 100, step: 3, text: '解析完成' }
}

const PDF_HINT_FIELDS = ['diagnosis', 'stage', 'geneMutation']
const TRANSIENT_STORAGE_KEYS = ['currentRecordId', 'structuredRecordDraft', 'selectedMatchDetail', 'selectedApplyTrial']
const PROCESS_STEPS = [
  {
    key: 'ocr',
    title: 'OCR文字识别',
    desc: '抽取病历正文、检查结论和报告内容'
  },
  {
    key: 'medical',
    title: '医疗信息抽取',
    desc: '识别诊断、分期、治疗和关键检查值'
  },
  {
    key: 'struct',
    title: '结构化病历',
    desc: '整理成可匹配的患者画像并准备试验筛选'
  }
]

const pickPayload = (res) => {
  if (!res || typeof res !== 'object') {
    return {}
  }
  return api.normalizePayload(res) || {}
}

Page({
  data: {
    currentStep: 1,
    processSteps: PROCESS_STEPS,
    tempFiles: [],
    remark: '',
    uploading: false,
    processingStatus: '正在识别文字...',
    parseProgress: 0,
    progressTarget: 0,
    parseProgressStyle: 'width: 0%;',
    parseStep: 0,
    fileId: '',
    recordId: '',
    parsedData: {},
    parsedRows: [],
    parsedSections: [],
    structuredSummary: {
      requiredTotal: 0,
      missingRequired: 0,
      completedRequired: 0,
      completeness: 0
    },
    summaryProgressStyle: 'width: 0%;',
    missingFields: [],
    submittingGap: false,
    parseFallbackNotified: false,
    hasPdfUpload: false,
    pdfQualityHintShown: false
  },

  onLoad() {
    this.restoreProcessingSession()
    auth.ensureBaseLogin().catch(() => null)
  },

  onShow() {
    this.restoreProcessingSession()
  },

  onHide() {
    this.clearPollTimer()
    this.clearProgressTimer()
  },

  onUnload() {
    this.clearPollTimer()
    this.clearProgressTimer()
  },

  chooseImage() {
    wx.showActionSheet({
      itemList: ['拍照', '从相册选择图片', '上传PDF文件', '从聊天记录选择文件'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.takePhoto()
        } else if (res.tapIndex === 1) {
          this.selectFromAlbum()
        } else if (res.tapIndex === 2) {
          this.selectPdfFile()
        } else if (res.tapIndex === 3) {
          this.selectFromMessage()
        }
      }
    })
  },

  takePhoto() {
    wx.chooseMedia({
      count: 9 - this.data.tempFiles.length,
      mediaType: ['image'],
      sourceType: ['camera'],
      success: (res) => {
        this.handleFiles(res.tempFiles)
      }
    })
  },

  selectFromAlbum() {
    wx.chooseMedia({
      count: 9 - this.data.tempFiles.length,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        this.handleFiles(res.tempFiles)
      }
    })
  },

  selectPdfFile() {
    wx.chooseMessageFile({
      count: 9 - this.data.tempFiles.length,
      type: 'file',
      extension: ['pdf'],
      success: (res) => {
        this.handleFiles(res.tempFiles || [])
      }
    })
  },

  selectFromMessage() {
    wx.chooseMessageFile({
      count: 9 - this.data.tempFiles.length,
      type: 'all',
      success: (res) => {
        this.handleFiles(res.tempFiles || [])
      }
    })
  },

  detectFileType(file) {
    const path = file.tempFilePath || file.path || ''
    const name = file.name || (path ? path.split('/').pop() : '') || ''
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : ''
    const mime = `${file.type || ''}`.toLowerCase()
    const weappType = `${file.fileType || ''}`.toLowerCase()

    const isImage =
      weappType === 'image' ||
      mime.startsWith('image/') ||
      ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'webp', 'heic'].includes(ext)
    const isPdf = ext === 'pdf' || mime === 'application/pdf' || weappType === 'pdf'

    if (isImage) {
      return 'image'
    }
    if (isPdf) {
      return 'pdf'
    }
    return 'other'
  },

  handleFiles(files) {
    const currentFiles = this.data.tempFiles
    const normalized = files
      .map((file) => {
        const path = file.tempFilePath || file.path
        if (!path) {
          return null
        }

        const fileType = this.detectFileType(file)
        const name = file.name || path.split('/').pop() || `file_${Date.now()}`

        return {
          path,
          size: file.size || 0,
          fileType,
          name
        }
      })
      .filter(Boolean)

    const supported = normalized.filter((file) => file.fileType !== 'other')
    if (supported.length < normalized.length) {
      wx.showToast({
        title: '仅支持图片和PDF文件',
        icon: 'none'
      })
    }

    this.setData({
      tempFiles: [...currentFiles, ...supported].slice(0, 9)
    })
  },

  previewFile(e) {
    const { index } = e.currentTarget.dataset
    const target = this.data.tempFiles[index]
    if (!target) {
      return
    }

    if (target.fileType === 'image') {
      const urls = this.data.tempFiles
        .filter((file) => file.fileType === 'image')
        .map((file) => file.path)

      wx.previewImage({
        current: target.path,
        urls
      })
      return
    }

    wx.openDocument({
      filePath: target.path,
      showMenu: true,
      fail: () => {
        wx.showToast({ title: '暂不支持预览该文件', icon: 'none' })
      }
    })
  },

  deleteImage(e) {
    const { index } = e.currentTarget.dataset
    const tempFiles = [...this.data.tempFiles]
    tempFiles.splice(index, 1)
    this.setData({ tempFiles })
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value })
  },

  clearPollTimer() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  },

  clearProgressTimer() {
    if (this.progressTimer) {
      clearInterval(this.progressTimer)
      this.progressTimer = null
    }
  },

  updateProgressBar(progress) {
    const next = Math.max(0, Math.min(100, Math.round(progress)))
    this.setData({
      parseProgress: next,
      parseProgressStyle: `width: ${next}%;`
    })
  },

  animateProgressTo(target) {
    const finalTarget = Math.max(0, Math.min(100, Math.round(target)))
    this.clearProgressTimer()

    this.progressTimer = setInterval(() => {
      const current = Number(this.data.parseProgress || 0)
      if (current >= finalTarget) {
        this.clearProgressTimer()
        return
      }

      const delta = finalTarget - current
      const step = delta > 16 ? 3 : delta > 8 ? 2 : 1
      this.updateProgressBar(Math.min(finalTarget, current + step))
    }, 120)
  },

  setProgressTarget(status, minTarget = 0) {
    const config = STATUS_TEXT_MAP[status] || STATUS_TEXT_MAP.parsing
    this.setData({
      processingStatus: config.text,
      parseStep: config.step,
      progressTarget: Math.max(minTarget, config.uiTarget)
    })
    this.animateProgressTo(Math.max(minTarget, config.uiTarget))
  },

  resetUploadSessionState() {
    TRANSIENT_STORAGE_KEYS.forEach((key) => wx.removeStorageSync(key))
    parseTask.clearCachedMatches()
    parseTask.clearActiveParseTask()
    this.clearPollTimer()
    this.clearProgressTimer()
    this.setData({
      fileId: '',
      recordId: '',
      parsedData: {},
      parsedRows: [],
      parsedSections: [],
      structuredSummary: schema.buildStructuredSummary({}),
      summaryProgressStyle: 'width: 0%;',
      missingFields: [],
      parseProgress: 0,
      progressTarget: 0,
      parseProgressStyle: 'width: 0%;',
      parseStep: 0,
      processingStatus: '文件上传中...',
      parseFallbackNotified: false,
      pdfQualityHintShown: false
    })
    this.pendingCompletedResult = null
    this.completionHandled = false
  },

  async uploadFiles() {
    if (this.data.tempFiles.length === 0) {
      wx.showToast({
        title: '请先选择文件',
        icon: 'none'
      })
      return
    }

    this.resetUploadSessionState()
    this.setData({
      uploading: true,
      currentStep: 2,
      processingStatus: '正在上传病历文件...',
      parseStep: 0
    })
    this.updateProgressBar(0)
    this.setProgressTarget('uploading', 2)

    try {
      await auth.ensureBaseLogin()

      let fileId = ''
      let recordId = ''

      for (let i = 0; i < this.data.tempFiles.length; i += 1) {
        const res = await api.uploadMedicalRecord({
          filePath: this.data.tempFiles[i].path,
          type: 'auto',
          remark: this.data.remark
        })

        const payload = pickPayload(res)
        if (!fileId) {
          fileId = payload.fileId || payload.recordId || payload.id || ''
          recordId = payload.recordId || payload.fileId || payload.id || ''
        }
      }

      if (!fileId) {
        throw new Error('上传成功但未获取文件ID')
      }

      this.setData({
        uploading: false,
        fileId,
        recordId,
        parseStep: 0,
        processingStatus: '文件已上传，等待AI解析...',
        parseFallbackNotified: false,
        hasPdfUpload: this.data.tempFiles.some((file) => file.fileType === 'pdf'),
        pdfQualityHintShown: false
      })

      parseTask.setActiveParseTask({
        fileId,
        recordId,
        status: 'parsing',
        progress: Math.max(8, Number(this.data.parseProgress || 0)),
        startedAt: Date.now(),
        hasPdfUpload: this.data.tempFiles.some((file) => file.fileType === 'pdf')
      })
      this.setProgressTarget('parsing', Math.max(12, Number(this.data.parseProgress || 0)))
      this.startPolling()
    } catch (error) {
      console.error('上传失败:', error)
      wx.showToast({
        title: error.message || '上传失败，请重试',
        icon: 'none'
      })
      this.setData({ uploading: false })
      this.clearProgressTimer()
      this.setData({ currentStep: 1 })
    }
  },

  startPolling() {
    this.clearPollTimer()
    this.clearProgressTimer()

    this.checkParseStatus()
    this.pollTimer = setInterval(() => {
      this.checkParseStatus()
    }, 1500)
  },

  async checkParseStatus() {
    try {
      const syncResult = await parseTask.syncActiveParseTask()
      if (!syncResult) {
        return
      }

      const res = syncResult.response
      if (res && res.fallback && !this.data.parseFallbackNotified) {
        this.setData({ parseFallbackNotified: true })
        wx.showToast({
          title: res.message || '解析接口暂不可用，已进入手动补全',
          icon: 'none'
        })
      }

      const payload = syncResult.payload || {}
      const taskInfo = syncResult.task || {}
      const status = taskInfo.status || payload.status || 'parsing'
      const progress = Number(taskInfo.progress || payload.progress || 0)

      this.setData({
        fileId: taskInfo.fileId || this.data.fileId,
        recordId: taskInfo.recordId || this.data.recordId
      })
      this.setProgressTarget(status, progress)

      if (status === 'completed' && payload.result) {
        this.pendingCompletedResult = payload.result
        if (!this.completionHandled) {
          this.handleCompletedResult(payload.result)
        }
        return
      }

      if (status === 'error') {
        this.clearPollTimer()
        this.clearProgressTimer()
        this.setData({
          uploading: false,
          currentStep: 1
        })
        wx.showToast({
          title: payload.errorMsg || '解析失败，请重试',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('轮询解析状态失败:', error)
    }
  },

  buildParsedPresentation(parsedData) {
    const normalized = schema.normalizeStructuredRecord(parsedData)
    const parsedRows = schema.buildStructuredRows(normalized)
    const parsedSections = schema.buildStructuredSections(normalized)
    const structuredSummary = schema.buildStructuredSummary(normalized)
    const missingFields = schema.getMissingFields(normalized)

    return {
      normalized,
      parsedRows,
      parsedSections,
      structuredSummary,
      missingFields
    }
  },

  applyParsedPresentation(parsedData) {
    const presentation = this.buildParsedPresentation(parsedData)
    this.setData({
      parsedData: presentation.normalized,
      parsedRows: presentation.parsedRows,
      parsedSections: presentation.parsedSections,
      structuredSummary: presentation.structuredSummary,
      summaryProgressStyle: `width: ${presentation.structuredSummary.completeness}%;`,
      missingFields: presentation.missingFields
    })
    return presentation
  },

  handleCompletedResult(result) {
    this.completionHandled = true
    this.clearPollTimer()
    this.setProgressTarget('completed', 100)

    const parsedData = {
      diagnosis: result.diagnosis || '',
      stage: result.stage || '',
      geneMutation: result.geneMutation || '',
      treatment: result.treatment || ''
    }

    const { normalized, missingFields } = this.applyParsedPresentation(parsedData)
    wx.setStorageSync('structuredRecordDraft', normalized)

    this.setData({
      currentStep: 3,
      uploading: false
    })

    if (this.data.hasPdfUpload && !this.data.pdfQualityHintShown) {
      const missingImportant = PDF_HINT_FIELDS.filter((key) => !`${normalized[key] || ''}`.trim())
      if (missingImportant.length >= 2) {
        this.setData({ pdfQualityHintShown: true })
        wx.showModal({
          title: 'PDF识别提示',
          content: '当前 PDF 可能是扫描件，文本较少。若关键信息缺失，建议补充拍照版病历或基因报告。',
          showCancel: false
        })
      }
    }

    if (missingFields.length > 0) {
      setTimeout(() => {
        wx.pageScrollTo({
          selector: '#gapSection',
          duration: 280
        })
      }, 260)
    }
  },

  selectGapOption(e) {
    const { key, value } = e.currentTarget.dataset
    if (!key) {
      return
    }

    const parsedData = {
      ...this.data.parsedData,
      [key]: value
    }
    const { normalized } = this.applyParsedPresentation(parsedData)
    wx.setStorageSync('structuredRecordDraft', normalized)
  },

  onGapInput(e) {
    const key = e.currentTarget.dataset.key
    if (!key) {
      return
    }

    const parsedData = {
      ...this.data.parsedData,
      [key]: e.detail.value
    }
    const { normalized } = this.applyParsedPresentation(parsedData)
    wx.setStorageSync('structuredRecordDraft', normalized)
  },

  editResult() {
    const { missingFields, structuredSummary } = this.data
    if (missingFields.length > 0) {
      wx.showToast({
        title: `仍有${missingFields.length}项待补充`,
        icon: 'none'
      })
      return
    }

    wx.showToast({
      title: structuredSummary.missingRequired > 0 ? '已保存，可继续补充' : '信息已确认',
      icon: 'success'
    })
  },

  async startMatching() {
    if (this.data.submittingGap) {
      return
    }

    const { missingFields, fileId, parsedData, recordId } = this.data

    this.setData({ submittingGap: true })
    wx.showLoading({ title: '正在进入匹配...' })

    try {
      if (missingFields.length > 0 && fileId) {
        await api.enrichMedicalRecord(fileId, parsedData)
        wx.showToast({ title: '补全信息已保存', icon: 'success' })
      }

      const currentRecordId = recordId || fileId || ''
      if (currentRecordId) {
        wx.setStorageSync('currentRecordId', currentRecordId)
      }
      wx.setStorageSync('structuredRecordDraft', parsedData)

      wx.switchTab({ url: '/pages/matches/matches' })
    } catch (error) {
      wx.showToast({
        title: error.message || '进入匹配失败，请重试',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
      this.setData({ submittingGap: false })
    }
  },

  goToRecords() {
    wx.switchTab({ url: '/pages/records/records' })
  },

  goToMatchesPage() {
    wx.switchTab({ url: '/pages/matches/matches' })
  },

  restoreProcessingSession() {
    const activeTask = parseTask.getActiveParseTask()
    if (!activeTask || !activeTask.fileId) {
      return
    }

    this.setData({
      currentStep: 2,
      fileId: activeTask.fileId,
      recordId: activeTask.recordId || '',
      hasPdfUpload: !!activeTask.hasPdfUpload
    })
    this.startPolling()
  }
})
