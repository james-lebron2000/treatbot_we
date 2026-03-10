const api = require('../../utils/api')
const auth = require('../../utils/auth')
const schema = require('../../utils/schema')

const STATUS_TEXT_MAP = {
  uploading: { progress: 10, step: 0, text: '文件上传中...' },
  parsing: { progress: 45, step: 1, text: '正在识别文字...' },
  analyzing: { progress: 75, step: 2, text: '正在抽取医疗实体...' },
  structuring: { progress: 90, step: 3, text: '正在生成结构化病历...' },
  completed: { progress: 100, step: 3, text: '解析完成' }
}

const PDF_HINT_FIELDS = ['diagnosis', 'stage', 'geneMutation']

const pickPayload = (res) => {
  if (!res || typeof res !== 'object') {
    return {}
  }
  return api.normalizePayload(res) || {}
}

Page({
  data: {
    currentStep: 1,
    tempFiles: [],
    remark: '',
    uploading: false,
    processingStatus: '正在识别文字...',
    parseProgress: 0,
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

  onUnload() {
    this.clearPollTimer()
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

    if (target.fileType === 'pdf') {
      wx.openDocument({
        filePath: target.path,
        fileType: 'pdf',
        showMenu: true,
        fail: () => {
          wx.showToast({
            title: 'PDF打开失败',
            icon: 'none'
          })
        }
      })
      return
    }

    wx.showToast({
      title: '暂不支持预览该文件',
      icon: 'none'
    })
  },

  deleteImage(e) {
    const { index } = e.currentTarget.dataset
    const files = [...this.data.tempFiles]
    files.splice(index, 1)

    this.setData({
      tempFiles: files
    })
  },

  onRemarkInput(e) {
    this.setData({
      remark: e.detail.value
    })
  },

  isPresentValue(value) {
    return value !== undefined && value !== null && `${value}`.trim() !== ''
  },

  shouldShowPdfQualityHint(record, structuredSummary) {
    if (!this.data.hasPdfUpload || this.data.pdfQualityHintShown) {
      return false
    }

    const missingCore = PDF_HINT_FIELDS.filter((field) => !this.isPresentValue(record[field]))
    if (missingCore.length >= 2) {
      return true
    }

    return Number(structuredSummary.completeness || 0) < 40
  },

  notifyPdfQualityHint(record, structuredSummary) {
    if (!this.shouldShowPdfQualityHint(record, structuredSummary)) {
      return
    }

    this.setData({ pdfQualityHintShown: true })
    const missingCore = PDF_HINT_FIELDS
      .filter((field) => !this.isPresentValue(record[field]))
      .map((field) => {
        if (field === 'diagnosis') return '临床诊断'
        if (field === 'stage') return '分期'
        return '基因突变'
      })

    const suffix = missingCore.length > 0 ? `（缺少：${missingCore.join('、')}）` : ''
    wx.showModal({
      title: 'PDF识别结果待确认',
      content: `检测到扫描版PDF可能识别不完整${suffix}。建议补全关键字段，或改传清晰病历图片以提升匹配准确度。`,
      showCancel: false
    })
  },

  clearPollTimer() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  },

  async uploadFiles() {
    if (this.data.tempFiles.length === 0) {
      wx.showToast({
        title: '请先选择文件',
        icon: 'none'
      })
      return
    }

    this.setData({ uploading: true })

    try {
      await auth.ensureLogin()

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
          fileId = payload.fileId || payload.id || payload.recordId || ''
          recordId = payload.recordId || payload.id || ''
        }
      }

      if (!fileId) {
        throw new Error('上传成功但未获取文件ID')
      }

      this.setData({
        currentStep: 2,
        uploading: false,
        fileId,
        recordId,
        parseProgress: 10,
        parseStep: 0,
        processingStatus: '文件已上传，等待AI解析...',
        parseFallbackNotified: false,
        hasPdfUpload: this.data.tempFiles.some((file) => file.fileType === 'pdf'),
        pdfQualityHintShown: false
      })

      this.startPolling()
    } catch (error) {
      console.error('上传失败:', error)
      wx.showToast({
        title: error.message || '上传失败，请重试',
        icon: 'none'
      })
      this.setData({ uploading: false })
    }
  },

  startPolling() {
    this.clearPollTimer()

    this.checkParseStatus()
    this.pollTimer = setInterval(() => {
      this.checkParseStatus()
    }, 1500)
  },

  async checkParseStatus() {
    try {
      const res = await api.getParseStatus(this.data.fileId)
      if (res && res.fallback && !this.data.parseFallbackNotified) {
        this.setData({ parseFallbackNotified: true })
        wx.showToast({
          title: res.message || '解析接口暂不可用，已进入手动补全',
          icon: 'none'
        })
      }

      const payload = pickPayload(res)
      const status = payload.status || 'parsing'
      const statusConfig = STATUS_TEXT_MAP[status] || STATUS_TEXT_MAP.parsing
      const progress = Number(payload.progress || statusConfig.progress)

      this.setData({
        parseProgress: Math.min(progress, 100),
        parseProgressStyle: `width: ${Math.min(progress, 100)}%;`,
        parseStep: statusConfig.step,
        processingStatus: statusConfig.text
      })

      if (status === 'completed') {
        this.clearPollTimer()
        const result = payload.result || payload.record || payload
        this.handleParseCompleted(result)
      }

      if (status === 'error' || status === 'failed') {
        this.clearPollTimer()
        wx.showToast({ title: payload.errorMsg || payload.message || '解析失败，请重试', icon: 'none' })
      }
    } catch (error) {
      console.error('查询解析状态失败:', error)
    }
  },

  handleParseCompleted(rawResult) {
    const normalized = schema.normalizeStructuredRecord(rawResult)
    const rows = schema.buildRecordPreview(normalized)
    const parsedSections = schema.buildRecordSections(normalized)
    const structuredSummary = schema.buildStructuredSummary(normalized)
    const missingFields = schema.getMissingFields(normalized).map((field) => ({
      ...field,
      currentValue: ''
    }))

    this.setData({
      currentStep: 3,
      parseProgress: 100,
      parseStep: 3,
      parsedData: normalized,
      parsedRows: rows,
      parsedSections,
      structuredSummary,
      summaryProgressStyle: `width: ${structuredSummary.completeness}%;`,
      missingFields
    })

    wx.setStorageSync('currentRecordId', this.data.recordId || normalized.id || '')
    wx.setStorageSync('structuredRecordDraft', normalized)
    this.notifyPdfQualityHint(normalized, structuredSummary)
  },

  updateMissingFieldValue(key, value) {
    const updated = this.data.missingFields.map((field) => {
      if (field.key !== key) {
        return field
      }
      return {
        ...field,
        currentValue: value
      }
    })

    this.setData({ missingFields: updated }, () => {
      this.refreshStructuredPreviewFromFields(updated)
    })
  },

  onGapInput(e) {
    const { key } = e.currentTarget.dataset
    const value = e.detail.value
    this.updateMissingFieldValue(key, value)
  },

  selectGapOption(e) {
    const { key, value } = e.currentTarget.dataset
    this.updateMissingFieldValue(key, value)
  },

  buildSupplementPayloadFromFields(fields = this.data.missingFields) {
    return fields.reduce((acc, field) => {
      const rawValue = typeof field.currentValue === 'string' ? field.currentValue.trim() : field.currentValue
      if (rawValue !== '' && rawValue !== undefined && rawValue !== null) {
        if (field.type === 'number') {
          const parsed = Number(rawValue)
          if (!Number.isNaN(parsed)) {
            acc[field.key] = parsed
          }
        } else {
          acc[field.key] = rawValue
        }
      }
      return acc
    }, {})
  },

  buildSupplementPayload() {
    return this.buildSupplementPayloadFromFields(this.data.missingFields)
  },

  refreshStructuredPreviewFromFields(fields = this.data.missingFields) {
    const supplementPayload = this.buildSupplementPayloadFromFields(fields)
    const mergedRecord = schema.mergeSupplement(this.data.parsedData, supplementPayload)
    const structuredSummary = schema.buildStructuredSummary(mergedRecord)
    this.setData({
      parsedSections: schema.buildRecordSections(mergedRecord),
      structuredSummary,
      summaryProgressStyle: `width: ${structuredSummary.completeness}%;`
    })
  },

  editResult() {
    if (this.data.missingFields.length === 0) {
      wx.showToast({
        title: '关键字段已补全',
        icon: 'none'
      })
      return
    }

    wx.pageScrollTo({
      selector: '#gapSection',
      duration: 260
    })

    wx.showToast({
      title: '请补全下方关键字段',
      icon: 'none'
    })
  },

  async startMatching() {
    const supplementPayload = this.buildSupplementPayload()
    const mergedRecord = schema.mergeSupplement(this.data.parsedData, supplementPayload)

    if (!mergedRecord.diagnosis) {
      wx.showToast({
        title: '请至少填写诊断信息',
        icon: 'none'
      })
      return
    }

    const remainMissing = schema.getMissingFields(mergedRecord)
    if (remainMissing.length > 0) {
      wx.showToast({
        title: `仍有${remainMissing.length}项待补，已继续匹配`,
        icon: 'none'
      })
    }

    this.setData({ submittingGap: true })

    try {
      const recordId = this.data.recordId || this.data.parsedData.id || ''
      if (recordId && Object.keys(supplementPayload).length > 0) {
        await api.enrichMedicalRecord(recordId, supplementPayload).catch(() => null)
      }

      const structuredSummary = schema.buildStructuredSummary(mergedRecord)

      this.setData({
        parsedData: mergedRecord,
        parsedSections: schema.buildRecordSections(mergedRecord),
        structuredSummary,
        summaryProgressStyle: `width: ${structuredSummary.completeness}%;`
      })

      wx.setStorageSync('currentRecordId', recordId)
      wx.setStorageSync('structuredRecordDraft', mergedRecord)

      wx.switchTab({
        url: '/pages/matches/matches'
      })
    } catch (error) {
      wx.showToast({
        title: '补充信息提交失败',
        icon: 'none'
      })
    } finally {
      this.setData({ submittingGap: false })
    }
  }
})
