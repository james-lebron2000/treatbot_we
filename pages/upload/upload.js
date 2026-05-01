const api = require('../../utils/api')
const auth = require('../../utils/auth')
const schema = require('../../utils/schema')
const parseTask = require('../../utils/parse-task')
// Q3-红线 §B.2：upload_start / upload_success 漏斗事件
const { track } = require('../../utils/track')
// PRD-2026Q2 §3.7：与 H5 共享的上传场景文案字典（仓库根 `shared/copy/upload.js`）。
// 注意：WeApp `require()` 不识 .json 后缀（同 .cjs 一样会丢 "module not defined"），
// 已迁移到 .js（CommonJS）；详见 shared/copy/upload.js 顶部说明。
const copy = require('../../shared/copy/upload.js')

// PRD-2026Q2 §3.7：错误分类三大类 + unknown 兜底，与 H5 UploadView.classifyError 对齐。
// 增量：DevTools 里 `wx.login` 自身会话过期 → utils/auth.js 抛 code='wx_login_session_expired'，
// 这里单独识别并回 'wx_login'，避免泛化到 unknown 让研发同学误以为是后端 bug。
const classifyUploadError = (error) => {
  if (!error) {
    return 'unknown'
  }
  if (error.code === 'wx_login_session_expired') {
    return 'wx_login'
  }
  const status = Number(error.statusCode || 0)
  if (status === 429) {
    return 'rate_limit'
  }
  if (status === 0 || /网络|network|timeout/i.test(String(error.message || ''))) {
    return 'network'
  }
  if (status >= 400 && status < 600) {
    return 'parse'
  }
  return 'unknown'
}

const ERROR_COPY_KEY_MAP = {
  rate_limit: 'rate_limit',
  parse: 'parse_failed',
  network: 'network',
  wx_login: 'wx_login_session_expired',
  unknown: 'unknown'
}

const resolveErrorCopy = (error) => {
  const kind = classifyUploadError(error)
  const key = ERROR_COPY_KEY_MAP[kind] || 'unknown'
  return copy.error[key] || copy.error.unknown
}

const STATUS_TEXT_MAP = {
  uploading: { progress: 10, uiTarget: 18, step: 0, text: copy.status.pending },
  parsing: { progress: 45, uiTarget: 58, step: 1, text: copy.status.parsing },
  analyzing: { progress: 75, uiTarget: 82, step: 2, text: '找诊断、分期、基因这些关键信息…' },
  structuring: { progress: 90, uiTarget: 96, step: 3, text: '整理成一份能看懂的摘要…' },
  completed: { progress: 100, uiTarget: 100, step: 3, text: copy.status.completed }
}

const PDF_HINT_FIELDS = ['diagnosis', 'stage', 'geneMutation']
const TRANSIENT_STORAGE_KEYS = ['currentRecordId', 'structuredRecordDraft', 'selectedMatchDetail', 'selectedApplyTrial']
const PROCESS_STEPS = [
  {
    key: 'ocr',
    title: '看清病历写了什么',
    desc: '读取病历正文、检查结论和报告内容'
  },
  {
    key: 'medical',
    title: '找到关键信息',
    desc: '认出诊断、分期、治疗方案和重要检查值'
  },
  {
    key: 'struct',
    title: '整理成病历卡片',
    desc: '为您画一份清晰的概况，可以直接拿给医生看'
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
    // PRD-2026Q2 §3.7：把共享文案挂到 data 上，wxml 直接 {{copy.cta.upload}} 等读取。
    copy,
    tempFiles: [],
    remark: '',
    uploading: false,
    processingStatus: copy.status.parsing,
    parseProgress: 0,
    progressTarget: 0,
    parseProgressStyle: 'width: 0%;',
    parseStep: 0,
    fileId: '',
    recordId: '',
    fileIds: [],
    isBatchParse: false,
    parsedData: {},
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
    this.clearAutoRedirectTimer()
  },

  onUnload() {
    this.clearPollTimer()
    this.clearProgressTimer()
    this.clearAutoRedirectTimer()
  },

  clearAutoRedirectTimer() {
    if (this.autoRedirectTimer) {
      clearTimeout(this.autoRedirectTimer)
      this.autoRedirectTimer = null
    }
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
      count: 5 - this.data.tempFiles.length,
      mediaType: ['image'],
      sourceType: ['camera'],
      success: (res) => {
        this.handleFiles(res.tempFiles)
      }
    })
  },

  selectFromAlbum() {
    wx.chooseMedia({
      count: 5 - this.data.tempFiles.length,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        this.handleFiles(res.tempFiles)
      }
    })
  },

  selectPdfFile() {
    wx.chooseMessageFile({
      count: 5 - this.data.tempFiles.length,
      type: 'file',
      extension: ['pdf'],
      success: (res) => {
        this.handleFiles(res.tempFiles || [])
      }
    })
  },

  selectFromMessage() {
    wx.chooseMessageFile({
      count: 5 - this.data.tempFiles.length,
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
        // PRD-2026Q2 §3.7：统一格式不支持提示走 shared copy.error.unsupported_format
        title: copy.error.unsupported_format,
        icon: 'none'
      })
    }

    // Phase E.6 / Review #5：与 server BATCH_UPLOAD_MAX 同口径（默认 5）。
    this.setData({
      tempFiles: [...currentFiles, ...supported].slice(0, 5)
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
    parseTask.clearActiveParseBatch()
    this.clearPollTimer()
    this.clearProgressTimer()
    this.setData({
      fileId: '',
      recordId: '',
      fileIds: [],
      isBatchParse: false,
      parsedData: {},
      parsedSections: [],
      structuredSummary: schema.buildStructuredSummary({}),
      summaryProgressStyle: 'width: 0%;',
      missingFields: [],
      parseProgress: 0,
      progressTarget: 0,
      parseProgressStyle: 'width: 0%;',
      parseStep: 0,
      processingStatus: copy.status.pending,
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
      // PRD-2026Q2 §3.7：上传起步态沿用 shared status.pending
      processingStatus: copy.status.pending,
      parseStep: 0
    })
    this.updateProgressBar(0)
    this.setProgressTarget('uploading', 2)

    // Q3-红线 §B.2：用户点击「开始上传」即视为漏斗 upload_start
    try {
      track('upload_start', {
        fileCount: this.data.tempFiles.length,
        hasPdf: this.data.tempFiles.some((f) => f.fileType === 'pdf')
      })
    } catch (e) { /* ignore */ }

    try {
      await auth.ensureBaseLogin()

      // Phase E.2：批量上传 —— 为每个文件单独 wx.uploadFile（小程序限制），
      // 收齐 fileIds 后通过 /api/medical/parse-status-batch 一次性轮询全部状态。
      const fileIds = []
      const uploadErrors = []

      for (let i = 0; i < this.data.tempFiles.length; i += 1) {
        const file = this.data.tempFiles[i]
        // 上传过程中给用户一点进度提示（10% → 30% 平均分摊）
        const stepProgress = 10 + Math.floor((i / this.data.tempFiles.length) * 20)
        this.setProgressTarget('uploading', stepProgress)

        try {
          const res = await api.uploadMedicalRecord({
            filePath: file.path,
            type: 'auto',
            remark: this.data.remark
          })
          const payload = pickPayload(res)
          const fid = payload.fileId || payload.recordId || payload.id || ''
          if (fid) {
            fileIds.push(fid)
          } else {
            uploadErrors.push({ name: file.name, message: '服务端未返回 fileId' })
          }
        } catch (err) {
          console.error(`第 ${i + 1} 份文件上传失败:`, err)
          uploadErrors.push({ name: file.name, message: err && err.message ? err.message : '上传失败' })
        }
      }

      if (!fileIds.length) {
        // 全部失败 → 抛出最后一个错误（保留 statusCode 以便 classifyUploadError 分流）
        const last = uploadErrors[uploadErrors.length - 1] || { message: '上传成功但未获取文件ID' }
        throw new Error(last.message)
      }

      // 部分失败：toast 提示但不阻塞（已上传的会继续解析）
      if (uploadErrors.length) {
        wx.showToast({
          title: `${uploadErrors.length} 份上传失败，其余 ${fileIds.length} 份继续解析`,
          icon: 'none',
          duration: 2400
        })
      }

      // 单文件 / 多文件分流：单文件保持老 path（兼容老 storage / 老页面），多文件走 batch
      const isBatch = fileIds.length > 1
      const primaryFileId = fileIds[0]

      this.setData({
        uploading: false,
        fileId: primaryFileId,
        recordId: primaryFileId,
        fileIds,
        isBatchParse: isBatch,
        parseStep: 0,
        processingStatus: isBatch
          ? `${fileIds.length} 份病历已上传，AI 正在并行解析…`
          : '文件已上传，等待AI解析...',
        parseFallbackNotified: false,
        hasPdfUpload: this.data.tempFiles.some((file) => file.fileType === 'pdf'),
        pdfQualityHintShown: false
      })

      const taskMeta = {
        startedAt: Date.now(),
        hasPdfUpload: this.data.tempFiles.some((file) => file.fileType === 'pdf')
      }

      if (isBatch) {
        parseTask.setActiveParseBatch({
          fileIds,
          status: 'parsing',
          progress: Math.max(8, Number(this.data.parseProgress || 0)),
          ...taskMeta
        })
        // 同时 set 单任务（让旧的 restoreProcessingSession 路径仍能定位主文件）
        parseTask.setActiveParseTask({
          fileId: primaryFileId,
          recordId: primaryFileId,
          status: 'parsing',
          progress: Math.max(8, Number(this.data.parseProgress || 0)),
          ...taskMeta
        })
      } else {
        parseTask.setActiveParseTask({
          fileId: primaryFileId,
          recordId: primaryFileId,
          status: 'parsing',
          progress: Math.max(8, Number(this.data.parseProgress || 0)),
          ...taskMeta
        })
      }
      this.setProgressTarget('parsing', Math.max(12, Number(this.data.parseProgress || 0)))
      this.startPolling()
    } catch (error) {
      console.error('上传失败:', error)
      // PRD-2026Q2 §3.7：按三类错误（rate_limit / parse / network）+ unknown 映射到 shared copy
      wx.showToast({
        title: resolveErrorCopy(error),
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
      // 修复方案 Track 3.1：90 秒硬超时（批量场景下按总数缩放，最多 180s）。
      const activeBatch = parseTask.getActiveParseBatch()
      const activeTask = parseTask.getActiveParseTask()
      const startedAt = (activeBatch && activeBatch.startedAt) || (activeTask && activeTask.startedAt)
      if (startedAt) {
        const elapsed = Date.now() - Number(startedAt || 0)
        // 单文件 90s；批量 90s + 每多 1 份 +20s，封顶 180s
        const fileCount = activeBatch ? activeBatch.fileIds.length : 1
        const timeoutMs = Math.min(180 * 1000, 90 * 1000 + Math.max(0, fileCount - 1) * 20 * 1000)

        const stuck = activeBatch
          ? (!activeBatch.done && (activeBatch.completedCount || 0) + (activeBatch.erroredCount || 0) < fileCount)
          : (activeTask && (activeTask.status === 'parsing' || activeTask.status === 'analyzing' || activeTask.status === 'uploading'))

        if (elapsed > timeoutMs && stuck) {
          parseTask.clearActiveParseBatch()
          parseTask.clearActiveParseTask()
          this.handleParseFailure({
            errorMsg: `解析超过 ${Math.round(timeoutMs / 1000)} 秒还没完成，可能服务暂时繁忙。我们直接帮您手填关键信息？`
          })
          return
        }
      }

      // 批量分支：用 /api/medical/parse-status-batch 一次拿全部状态
      if (this.data.isBatchParse && activeBatch) {
        const batchResult = await parseTask.syncActiveParseBatch()
        if (!batchResult) {
          return
        }

        const res = batchResult.response
        if (res && res.fallback && !this.data.parseFallbackNotified) {
          this.setData({ parseFallbackNotified: true })
          wx.showToast({
            title: res.message || '解析接口暂不可用，已进入手动补全',
            icon: 'none'
          })
        }

        const total = batchResult.total || 1
        const completedCount = batchResult.completedCount || 0
        const erroredCount = batchResult.erroredCount || 0
        // 整体进度 = (完成 + 失败) / 总数 * 100
        const overallProgress = Math.floor(((completedCount + erroredCount) / total) * 100)
        // 状态文案：还没全部完成时显示 analyzing；全部完成或部分完成时根据成功数显示
        if (!batchResult.done) {
          this.setProgressTarget('analyzing', Math.max(20, overallProgress))
          this.setData({
            processingStatus: `已处理 ${completedCount + erroredCount} / ${total} 份…`,
            parseProgress: Math.max(20, overallProgress)
          })
          return
        }

        // 全部终态：如果至少一份完成 → 用合并结果走完成路径；否则走失败路径
        if (completedCount > 0 && batchResult.mergedEntities) {
          // 把合并字段塞回 result 形态（与单文件 path 兼容）
          const mergedResult = {
            id: batchResult.completedRecordIds[0] || this.data.fileId,
            recordId: batchResult.completedRecordIds[0] || this.data.fileId,
            diagnosis: batchResult.mergedEntities.diagnosis || '',
            stage: batchResult.mergedEntities.stage || '',
            geneMutation: batchResult.mergedEntities.geneMutation || '',
            treatment: batchResult.mergedEntities.treatment || '',
            confidence: batchResult.mergedEntities.confidence || 0,
            sourceRecordIds: batchResult.mergedEntities.sourceRecordIds || []
          }
          this.pendingCompletedResult = mergedResult
          if (!this.completionHandled) {
            this.handleCompletedResult(mergedResult)
          }

          // 全部失败的子任务给个轻提示（不阻塞）
          if (erroredCount > 0) {
            setTimeout(() => {
              wx.showToast({
                title: `${erroredCount} 份解析失败，已显示其余结果`,
                icon: 'none',
                duration: 2400
              })
            }, 1600)
          }
          return
        }

        // 全部失败 → 取第一条失败的 errorMsg
        const firstErr = (batchResult.entries || []).find((e) => e.errorMsg) || {}
        this.handleParseFailure({
          errorMsg: firstErr.errorMsg || '所有文件解析均失败'
        })
        return
      }

      // 单文件分支（保持老逻辑）
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

      // 修复方案 Track 3.4：放宽到 utils/parse-task.js 暴露的同一组 completed 状态值。
      if (syncResult.result || (status === 'completed' && payload.result)) {
        const result = syncResult.result || payload.result
        this.pendingCompletedResult = result
        if (!this.completionHandled) {
          this.handleCompletedResult(result)
        }
        return
      }

      // 修复方案 Track 3.2 / 3.3：失败不再 currentStep:1 把用户踢回去
      if (status === 'error' || syncResult.failed) {
        this.handleParseFailure(payload)
      }
    } catch (error) {
      console.error('轮询解析状态失败:', error)
    }
  },

  // 修复方案 Track 3.2：解析失败统一处理 —— 模态框 + 真实错误信息 + 手填路径。
  handleParseFailure(payload) {
    this.clearPollTimer()
    this.clearProgressTimer()
    this.setData({ uploading: false })

    const realErrMsg = (payload && (payload.errorMsg || payload.message)) || ''
    const detail = realErrMsg ? `\n（原因：${realErrMsg}）` : ''
    const fileId = this.data.fileId || ''

    wx.showModal({
      title: '我们没能自动看懂这份病历',
      content: `不要紧，您直接告诉我们关键信息，一样能帮家人找到能用的新药。${detail}`,
      confirmText: '去手填',
      cancelText: '换一份',
      success: (res) => {
        if (res.confirm) {
          // 修复方案 Track 3.6：把 fileId 透到 manualEntry，让手填值能挂回同一条 record_id。
          const url = fileId
            ? `/pages/manualEntry/manualEntry?fileId=${encodeURIComponent(fileId)}`
            : '/pages/manualEntry/manualEntry'
          wx.navigateTo({ url })
        } else {
          // 用户选择换一份 → 回到选文件页（清掉旧文件让用户重新选）
          this.setData({
            currentStep: 1,
            tempFiles: []
          })
        }
      }
    })
  },

  buildParsedPresentation(parsedData) {
    const normalized = schema.normalizeStructuredRecord(parsedData)
    // utils/schema.js 现在统一暴露 buildRecordSections（取代历史名 buildStructuredSections /
    // buildStructuredRows）。wxml 只读 parsedSections，所以 rows 不再产出。
    const parsedSections = schema.buildRecordSections(normalized)
    const structuredSummary = schema.buildStructuredSummary(normalized)
    const missingFields = schema.getMissingFields(normalized)

    return {
      normalized,
      parsedSections,
      structuredSummary,
      missingFields
    }
  },

  applyParsedPresentation(parsedData) {
    const presentation = this.buildParsedPresentation(parsedData)
    this.setData({
      parsedData: presentation.normalized,
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

    // Q3-红线 §B.2：解析完成 = 漏斗 upload_success
    try {
      track('upload_success', {
        recordId: this.data.recordId || this.data.fileId || ''
      })
    } catch (e) { /* ignore */ }

    const parsedData = {
      diagnosis: result.diagnosis || '',
      stage: result.stage || '',
      geneMutation: result.geneMutation || '',
      treatment: result.treatment || ''
    }

    const { normalized, missingFields } = this.applyParsedPresentation(parsedData)
    // 同时把当前 recordId 也落到 storage —— records/detail 页打开时优先读 storage
    // 里的结构化数据，避免后端写入有延迟时详情页空白。
    const resolvedRecordId = this.data.recordId || this.data.fileId || normalized.id || ''
    if (resolvedRecordId) {
      wx.setStorageSync('currentRecordId', resolvedRecordId)
    }
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

    // PRD-2026Q3 §U7：上传 + 解析 100% 完成后，停留 ~1.2s 让用户看到完成态
    // 再自动跳到结构化病历浏览页（pages/records/detail）。这样用户的认知是
    //   「上传 → 看到完成 → 看到自家病历的完整卡片视图」一气呵成。
    // 关键缺信息（PDF 模态、缺失字段）会先打断跳转：
    //   - PDF 模态期间不跳；
    //   - 仍有 missingFields 时不跳，让用户在当前页用 gapSection 完成补全后再走 startMatching。
    const shouldAutoRedirect =
      missingFields.length === 0 &&
      !this.data.pdfQualityHintShown &&
      resolvedRecordId
    if (shouldAutoRedirect) {
      this.autoRedirectTimer = setTimeout(() => {
        wx.redirectTo({
          url: `/pages/records/detail/detail?id=${encodeURIComponent(resolvedRecordId)}&fromUpload=1`,
          fail: () => {
            // redirectTo 失败（如目标页未注册）时，至少让用户能手动跳过去
            wx.showToast({ title: '已为您整理好病历，可在「病历」中查看', icon: 'none' })
          }
        })
      }, 1200)
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
        // PRD-2026Q2 §3.7：进入匹配失败归为 network/unknown，走 shared copy.
        title: resolveErrorCopy(error),
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

  // PRD-2026Q2 §3.7：手动录入入口（与 H5 /matches?manualEntry=1 对等）
  goToManualEntry() {
    wx.navigateTo({ url: '/pages/manualEntry/manualEntry' })
  },

  goToMatchesPage() {
    wx.switchTab({ url: '/pages/matches/matches' })
  },

  restoreProcessingSession() {
    // 优先复活 batch（多文件）会话；fallback 到单文件
    const activeBatch = parseTask.getActiveParseBatch()
    if (activeBatch && activeBatch.fileIds && activeBatch.fileIds.length) {
      this.setData({
        currentStep: 2,
        fileIds: activeBatch.fileIds,
        fileId: activeBatch.fileIds[0],
        recordId: activeBatch.fileIds[0],
        isBatchParse: activeBatch.fileIds.length > 1,
        hasPdfUpload: !!activeBatch.hasPdfUpload
      })
      this.startPolling()
      return
    }

    const activeTask = parseTask.getActiveParseTask()
    if (!activeTask || !activeTask.fileId) {
      return
    }

    this.setData({
      currentStep: 2,
      fileId: activeTask.fileId,
      recordId: activeTask.recordId || '',
      isBatchParse: false,
      hasPdfUpload: !!activeTask.hasPdfUpload
    })
    this.startPolling()
  }
})
