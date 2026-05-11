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
// PRD-2026Q4 流式 OCR：消费 /api/medical/parse-stream（chunked SSE），
// 把进度从「线性模拟」换成「真实事件驱动」；onError/onNoredis 走原 polling 兜底。
const sseClient = require('../../utils/sseClient')
const { GROUPS, RENDERABLE_GROUPS } = require('../../shared/streaming/fieldGroups.js')
const { STAGE, isTerminalStage } = require('../../shared/streaming/events.js')

// SSE stage → step 卡片高亮（与 PROCESS_STEPS 对齐：0=ocr / 1=medical / 2=struct）
const STAGE_PARSE_STEP = {
  [STAGE.RECEIVED]: 0,
  [STAGE.PREPROCESS]: 0,
  [STAGE.OCR_TEXT]: 1,
  [STAGE.FIELD_GROUP]: 2,
  [STAGE.COMPLETED]: 2
}

// SSE stage → 顶部 processingStatus 文案（家属侧的同理心句式，非工程语）
const STAGE_STATUS_TEXT = {
  [STAGE.RECEIVED]: '收到啦，正在准备…',
  [STAGE.PREPROCESS]: '准备文件…',
  [STAGE.OCR_TEXT]: '看清病历写了什么…',
  [STAGE.FIELD_GROUP]: '整理诊断、治疗这些关键信息…',
  [STAGE.COMPLETED]: copy.status.completed
}

// 渲染时显示的"分组进度"：按 RENDERABLE_GROUPS 顺序，每组一个 chip。
// 与 web 端 StreamingRecordCard 的 4 块骨架对应。
const buildInitialStreamGroups = () =>
  RENDERABLE_GROUPS.map((key) => ({
    key,
    label: GROUPS[key].label,
    filled: false
  }))

// 8s 哨兵：SSE 连上但拿不到任何 state 事件时，假定 Redis/服务端有问题，回退到轮询。
// 与 web 端 parseStream 兜底语义一致。
const SSE_FALLBACK_SENTINEL_MS = 8000

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

// Track C-3（PRD-2026Q3）：进度条改为「基于预期时长的平滑爬升 + status 阈值」。
//   - minProgress：后端推到这个 status 时，UI 最少要爬到这个值（form a floor）
//   - completed 是唯一允许 UI 冲到 100% 的状态；其它状态最多顶到 92%
//   - text / step：保留原语义，驱动 processing-shell 的步骤卡片
//
// 阈值取值理由（与 server/services/queue.js 状态机对齐）：
//   uploading → 0-12%   ：刚发起，给一点初始动；
//   parsing   → 28%     ：multer 收完 + OCR provider 已开始；
//   analyzing → 58%     ：vision LLM 抽取阶段；
//   structuring → 82%   ：抽取完成，规整结构；
//   completed → 100%    ：终态，立刻冲。
const STATUS_TEXT_MAP = {
  uploading:   { minProgress: 12, step: 0, text: copy.status.pending },
  parsing:     { minProgress: 28, step: 1, text: copy.status.parsing },
  analyzing:   { minProgress: 58, step: 2, text: '找诊断、分期、基因这些关键信息…' },
  structuring: { minProgress: 82, step: 3, text: '整理成一份能看懂的摘要…' },
  completed:   { minProgress: 100, step: 3, text: copy.status.completed }
}

// Track C-3 v2 + Track D 融合：
//   - 曲线（worktree v2）：线性 elapsed/ETA → 1%-92%，进度数字与条宽 100% 同步
//   - ETA（main · Track D · 2026-05-03 生产实测）：image=90s, pdf=150s
//   - 长等待防御（main · Track D）：LONG_WAIT_THRESHOLDS 同理心文案 + 拉慢轮询，无客户端硬超时
// 设计目标：
//   1. 进度数字与进度条宽度永远 100% 同步（同一个 parseProgress 驱动）
//   2. 时间感知诚实：t=ETA/2 时 bar≈46%，t=ETA 时 bar≈92%；不再前段窜
//   3. ETA 走真实生产 P50（Doubao 视觉 580KB PNG → 88s；3 页 PDF → 130-150s）
//
// PROGRESS_CEIL_DURING_RUN —— 模拟阶段最高 92%，留 8% 给 completed 冲线
// PROGRESS_TICK_MS         —— 每 250ms 一次，肉眼平滑且不抢主线程
const PROGRESS_CEIL_DURING_RUN = 92
const PROGRESS_TICK_MS = 250

// 单文件耗时基线（秒）—— Track D（2026-05-03 生产实测重校）：
//   Doubao 视觉模型 580KB 中文病理 PNG → 88s（典型）
//   多页扫描 PDF（pdftoppm 拆 3 页 + 3× vision）→ 130-150s
//   留 5-10s 头给入队 / worker pickup / DB write
//   原值（image=11s / pdf=22s）严重低估，用户看到进度条 92% 卡 80 秒后弹"看不懂"，
//   三重虚假感（进度条假、系统假、结果假）。Track D 同时把客户端硬超时彻底删掉。
const ETA_PER_IMAGE_SECONDS = 90
const ETA_PER_PDF_SECONDS = 150
// 多文件并行加成：服务端 queue concurrency=2，多出来的份按 0.4× 累加
//   1 份 image：90s
//   2 份 image：90 + 0.4×90 = 126s
//   1 image + 1 pdf：150 + 0.4×90 = 186s（pdf 大，作 base）
const ETA_CONCURRENCY_FACTOR = 0.4

const estimateEtaSeconds = (files) => {
  if (!Array.isArray(files) || !files.length) {
    return ETA_PER_IMAGE_SECONDS
  }
  const perFile = files.map((f) =>
    f && f.fileType === 'pdf' ? ETA_PER_PDF_SECONDS : ETA_PER_IMAGE_SECONDS
  )
  // 由大到小排序：最慢的那份决定底线，其它按并发因子加权累计
  const sorted = [...perFile].sort((a, b) => b - a)
  let total = sorted[0]
  for (let i = 1; i < sorted.length; i += 1) {
    total += sorted[i] * ETA_CONCURRENCY_FACTOR
  }
  return Math.max(8, Math.round(total))
}

const formatEtaText = (secondsRemaining, isOverdue) => {
  if (isOverdue) {
    return '即将完成…'
  }
  const s = Math.max(0, Math.ceil(secondsRemaining))
  if (s <= 0) {
    return '即将完成…'
  }
  if (s <= 5) {
    return '马上就好…'
  }
  return `预计还需 ~${s} 秒`
}

// PRD-2026Q3 §U5（增量修复 errCode 80051）：
//   wx.uploadFile 生产硬上限 10MB；WeChat DevTools 默认 2MB（详情→本地设置可调高）。
//   服务端 multer fileSize=30MB（server/controllers/medical.js:14）—— 瓶颈始终在客户端这一层。
//
// 策略：图片 > 1.5MB 一律先 wx.compressImage 重采样到长边 2400px、jpg 质量 70 ——
//   多数手机原图 5-15MB，压完通常 0.4-1.2MB，OCR 文字仍清晰。
//   压缩后或 PDF 仍 > 9MB 的（留 1MB headroom 给 multipart 表单字段）直接拒掉这一份，
//   走 shared/copy/upload.js 的 file_too_large 友好提示，不阻塞其它文件继续上传。
const MAX_UPLOAD_BYTES = 9 * 1024 * 1024
const IMAGE_COMPRESS_THRESHOLD = 1.5 * 1024 * 1024
const IMAGE_COMPRESS_LONG_EDGE = 2400

const compressImageAsync = (src) =>
  new Promise((resolve) => {
    wx.compressImage({
      src,
      quality: 70,
      // 只设 compressedHeight：让 WeChat 按比例自动计算另一边，避免强制双向 dim 把图片压扁。
      // 对竖向拍的病历这是长边；横向稍微吃亏但 quality 70 仍能压缩。
      compressedHeight: IMAGE_COMPRESS_LONG_EDGE,
      success: (res) => resolve((res && res.tempFilePath) || src),
      fail: () => resolve(src)
    })
  })

const getFileSizeAsync = (filePath) =>
  new Promise((resolve) => {
    try {
      const fsm = wx.getFileSystemManager && wx.getFileSystemManager()
      if (fsm && typeof fsm.getFileInfo === 'function') {
        fsm.getFileInfo({
          filePath,
          success: (res) => resolve(Number((res && res.size) || 0)),
          fail: () => resolve(0)
        })
        return
      }
      // 老版基础库兜底：直接用全局 wx.getFileInfo
      if (typeof wx.getFileInfo === 'function') {
        wx.getFileInfo({
          filePath,
          success: (res) => resolve(Number((res && res.size) || 0)),
          fail: () => resolve(0)
        })
        return
      }
      resolve(0)
    } catch (e) {
      resolve(0)
    }
  })

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
    // Track C-3：ETA 显示数据
    estimatedTotalSeconds: 0,
    etaSecondsRemaining: 0,
    etaText: '',
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
    // PRD-2026Q2 §P1-7：step 3 主 CTA 文案随 missingFields 数量动态切换
    // 在 applyParsedPresentation 内同步刷新，无 wxs computed 依赖。
    primaryCtaText: '看看为家人找到的新药',
    // PRD-2026Q2 §T2-5：multi-line placeholder（绑定到 data 而非 WXML 字面量，
    // 防止微信 WXML 解析器把 &#10; 当成普通字符串而不解码）。
    remarkPlaceholder: '例如：\n· 上周刚做完第 3 周期化疗，医生说效果不太好\n· 一直在吃奥希替尼，但 CT 显示又长大了\n· 想找口服的、不用打针的方案',
    // Track C-2（PRD-2026Q3）：分组式 gap UI 的状态
    //   gapSections    — schema.buildGapSections 输出，按 GROUP_META 顺序分组
    //   collapsedGroups— { [groupKey]: boolean }，true 表示该组当前折叠
    //   gapSummary     — { totalMissing, filledNow, percent }，头部进度条数据
    gapSections: [],
    collapsedGroups: {},
    gapSummary: { totalMissing: 0, filledNow: 0, percent: 0 },
    submittingGap: false,
    parseFallbackNotified: false,
    hasPdfUpload: false,
    pdfQualityHintShown: false,
    // PRD-2026Q4 流式 OCR：在 currentStep===2 期间实时显示「正在识别什么」。
    //   streamGroups   — 4 个分组的填充态（basic/diagnosis/treatment/timeline）
    //   streamRawText  — OCR 抽出的原文文本，给用户一个折叠区核对
    //   showRawText    — 折叠区开关
    //   currentStage   — 当前 SSE 阶段（received/preprocess/ocr_text/field_group/completed）
    streamGroups: buildInitialStreamGroups(),
    streamRawText: '',
    showRawText: false,
    currentStage: ''
  },

  onLoad() {
    // 关键：onLoad 之后微信会**立即同步**触发 onShow——两个都调 restoreProcessingSession
    // 会在毫秒内连开两条 SSE。这里只做登录初始化，restoreProcessingSession 交给 onShow。
    auth.ensureBaseLogin().catch(() => null)
  },

  onShow() {
    this.restoreProcessingSession()
  },

  onHide() {
    this.clearPollTimer()
    this.clearProgressTimer()
    this.clearStream()
    this.clearAutoRedirectTimer()
  },

  onUnload() {
    this.clearPollTimer()
    this.clearProgressTimer()
    this.clearStream()
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

  async handleFiles(files) {
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

    // PRD-2026Q3 §U5（修复 errCode 80051）：
    //   1) 图片 > 1.5MB 先 wx.compressImage 重采样到长边 2400px / jpg 质量 70；
    //   2) 压缩后或 PDF 仍 > 9MB 的，直接 reject 这一份（不阻塞其它），用 file_too_large 提示。
    //   compressImage 失败时 resolve 原始 path —— 让步骤 2 的 size 校验来兜底，避免一次压缩
    //   失败拖垮整个会话。
    const needsCompression = supported.some(
      (file) => file.fileType === 'image' && file.size > IMAGE_COMPRESS_THRESHOLD
    )
    if (needsCompression || supported.length > 1) {
      // 多文件 / 大图都给个 loading，避免用户以为操作没生效（压缩在后台跑 1-3s）
      wx.showLoading({ title: '准备文件…', mask: true })
    }

    const processed = []
    let oversizeCount = 0
    try {
      for (const file of supported) {
        let { path, size } = file
        if (file.fileType === 'image' && size > IMAGE_COMPRESS_THRESHOLD) {
          const compressedPath = await compressImageAsync(path)
          if (compressedPath && compressedPath !== path) {
            const compressedSize = await getFileSizeAsync(compressedPath)
            // 仅在压缩 *真的* 减小了体积才采用；偶发情况下 compressImage 输出更大
            // （比如已是高压缩 jpg 又转一次），这种就保留原 path。
            if (compressedSize > 0 && compressedSize < size) {
              path = compressedPath
              size = compressedSize
            }
          }
        }
        if (size > MAX_UPLOAD_BYTES) {
          oversizeCount += 1
          continue
        }
        processed.push({ ...file, path, size })
      }
    } finally {
      if (needsCompression || supported.length > 1) {
        wx.hideLoading()
      }
    }

    if (oversizeCount > 0) {
      wx.showToast({
        // shared/copy/upload.js: '这份文件有点大 —— 压缩一下或分几次传都可以，您的数据不会丢。'
        title: copy.error.file_too_large,
        icon: 'none',
        duration: 2400
      })
    }

    // Phase E.6 / Review #5：与 server BATCH_UPLOAD_MAX 同口径（默认 5）。
    this.setData({
      tempFiles: [...currentFiles, ...processed].slice(0, 5)
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
    // 修复方案 Track 3.7：把 pollingActive 也清掉，让 scheduleNextPoll 自然 short-circuit。
    // 兼容 setInterval（旧固定 1500ms）+ setTimeout（新自适应链）两种 timer 句柄。
    this.pollingActive = false
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      clearTimeout(this.pollTimer)
      this.pollTimer = null
    }
  },

  // PRD-2026Q4：旧版的 simulationTick 线性进度模拟已删除。进度现在由 SSE
  // (utils/sseClient.js → openParseStream) 真实事件驱动；polling fallback 路径
  // 仍可调 setProgressTarget 抬 floor，progressTimer 仅在那条路径上分时使用。
  clearProgressTimer() {
    if (this.progressTimer) {
      clearInterval(this.progressTimer)
      this.progressTimer = null
    }
  },

  // 关掉正在跑的 SSE 连接 + 哨兵 timer。
  // 与 clearPollTimer / clearProgressTimer 互不耦合，方便单独清理。
  clearStream() {
    if (typeof this.streamCloser === 'function') {
      try { this.streamCloser() } catch (_e) { /* ignore */ }
    }
    this.streamCloser = null
    if (this.streamFallbackTimer) {
      clearTimeout(this.streamFallbackTimer)
      this.streamFallbackTimer = null
    }
    this.streamingActive = false
    this.streamReceivedAnyState = false
  },

  updateProgressBar(progress) {
    const next = Math.max(0, Math.min(100, Math.round(progress)))
    // 永不倒退：SSE 的 received(5%) 不能把 upload phase 的 30% 拉下来
    const cur = Number(this.data.parseProgress || 0)
    if (next <= cur) return
    this.setData({
      parseProgress: next,
      parseProgressStyle: `width: ${next}%;`
    })
  },

  /**
   * polling fallback 路径用：把后端 legacy status (uploading/parsing/analyzing/structuring/completed)
   * 转成 progressTarget + 文案 + 步骤卡片。SSE 路径不会调这个，走 applyStreamStage。
   */
  setProgressTarget(status, minFloor = 0) {
    const config = STATUS_TEXT_MAP[status] || STATUS_TEXT_MAP.parsing
    const floor = Math.max(minFloor || 0, config.minProgress || 0)

    this.setData({
      processingStatus: config.text,
      parseStep: config.step,
      progressTarget: floor
    })

    // 实进度：直接更新到 floor（updateProgressBar 内部做永不倒退判断）
    this.updateProgressBar(floor)
  },

  /**
   * PRD-2026Q4 流式 OCR：把单个 SSE stage 映射到 UI 状态。
   * 与 setProgressTarget 平行的"流式版"。
   */
  applyStreamStage(stage, progress) {
    const parseStep = STAGE_PARSE_STEP[stage]
    const statusText = STAGE_STATUS_TEXT[stage]
    const patch = { currentStage: stage }
    if (typeof parseStep === 'number') patch.parseStep = parseStep
    if (statusText && !this.completionHandled) patch.processingStatus = statusText
    this.setData(patch)
    if (typeof progress === 'number' && progress > 0) {
      this.updateProgressBar(progress)
    }
  },

  resetUploadSessionState() {
    TRANSIENT_STORAGE_KEYS.forEach((key) => wx.removeStorageSync(key))
    parseTask.clearCachedMatches()
    parseTask.clearActiveParseTask()
    parseTask.clearActiveParseBatch()
    this.clearPollTimer()
    this.clearProgressTimer()
    this.clearStream()
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
      // Track C-2：清掉上次 session 的 gap 状态，避免新一份病历进来时还看到旧分组
      gapSections: [],
      collapsedGroups: {},
      gapSummary: { totalMissing: 0, filledNow: 0, percent: 0 },
      parseProgress: 0,
      progressTarget: 0,
      parseProgressStyle: 'width: 0%;',
      parseStep: 0,
      // Track C-3：清掉 ETA 显示
      estimatedTotalSeconds: 0,
      etaSecondsRemaining: 0,
      etaText: '',
      processingStatus: copy.status.pending,
      parseFallbackNotified: false,
      pdfQualityHintShown: false,
      // PRD-2026Q4 流式 OCR：清掉上一次会话的分组填充态 / 原文文本
      streamGroups: buildInitialStreamGroups(),
      streamRawText: '',
      showRawText: false,
      currentStage: ''
    })
    // 旧 simulationTick 的状态已删除；保留 completionHandled 等业务标志
    this._initialGapTotal = 0
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
      parseStep: 0,
      // 给一个 1% 的初始动，避免用户盯着 0% 一拍空（不再走线性 simulator）
      parseProgress: 1,
      parseProgressStyle: 'width: 1%;'
    })
    // ETA 文字仅作"参考预期"——不再用它驱动条宽，SSE 真实进度驱动。
    const estimatedSeconds = estimateEtaSeconds(this.data.tempFiles)
    this.setData({
      estimatedTotalSeconds: estimatedSeconds,
      etaSecondsRemaining: estimatedSeconds,
      etaText: formatEtaText(estimatedSeconds, false)
    })
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

      // Track C-1b（PRD-2026Q3）：除了 utils/api.js uploadFile 已经做的「一次 transient
      // 重试」（针对 wx.uploadFile fail / 5xx），这里再加一层「页面级重试 1 次」作为兜底：
      //   - 防止两份图同时压缩 / 上传时，第一份还没完全释放网络栈，第二份立刻撞 socket
      //     reset，被 utils/api.js 当成单次 fail 走完一次重试后仍失败的极端情况
      //   - 保持串行：单份失败时同步重试一次，不会让整批上传卡更久（最多 +1.5s × N）
      const PAGE_LEVEL_RETRY_DELAY_MS = 800
      for (let i = 0; i < this.data.tempFiles.length; i += 1) {
        const file = this.data.tempFiles[i]
        // 上传过程中给用户一点进度提示（10% → 30% 平均分摊）
        const stepProgress = 10 + Math.floor((i / this.data.tempFiles.length) * 20)
        this.setProgressTarget('uploading', stepProgress)

        // 防御层：handleFiles 已经在选择阶段拦下 > 9MB 的文件，但一旦恢复旧 session 或
        // 用户绕过常规入口，仍可能携带超大 tempFile —— 不放行，标错并继续下一份，
        // 避免整批 upload 因为 errCode 80051 被中断。
        if (Number(file.size || 0) > MAX_UPLOAD_BYTES) {
          uploadErrors.push({ name: file.name, message: copy.error.file_too_large })
          continue
        }

        let attempt = 0
        let lastErr = null
        let succeeded = false
        while (attempt < 2 && !succeeded) {
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
              succeeded = true
              break
            }
            // 服务端 200 但没回 fileId：不重试（业务异常，重试也是同样结果）
            uploadErrors.push({ name: file.name, message: '服务端未返回 fileId' })
            break
          } catch (err) {
            lastErr = err
            const sc = Number(err && err.statusCode)
            // 仅对网络/5xx 在页面层再补一次重试；4xx（含 429）不在这里重试
            const isTransient = sc === 0 || sc >= 500
            if (attempt === 0 && isTransient) {
              console.warn(`[upload] file #${i + 1} attempt 1 failed (status ${sc}), page-level retry after ${PAGE_LEVEL_RETRY_DELAY_MS}ms`)
              await new Promise((r) => setTimeout(r, PAGE_LEVEL_RETRY_DELAY_MS))
              attempt += 1
              continue
            }
            console.error(`第 ${i + 1} 份文件上传失败:`, err)
            uploadErrors.push({ name: file.name, message: err && err.message ? err.message : '上传失败' })
            break
          }
        }
        if (!succeeded && !lastErr) {
          // theoretically unreachable，但兜底确保循环安全
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
      // PRD-2026Q4：优先尝试 SSE 流式；onError / onNoredis-with-no-state → fallback 到 polling
      this.startStreamOrFallback()
    } catch (error) {
      console.error('上传失败:', error)
      // PRD-2026Q2 §3.7：按三类错误（rate_limit / parse / network）+ unknown 映射到 shared copy
      wx.showToast({
        title: resolveErrorCopy(error),
        icon: 'none'
      })
      this.setData({ uploading: false })
      this.clearProgressTimer()
      this.clearStream()
      this.setData({ currentStep: 1 })
    }
  },

  /**
   * PRD-2026Q4 流式 OCR：开 SSE 连接，事件驱动 UI；失败 → 走 polling 兜底。
   *
   * 关键策略：
   *   - onError      → 直接 fallback polling（连不通 / HTTP 4xx-5xx）
   *   - onNoredis    → 8s 哨兵：8s 内若拿不到任何 state 事件，认为 Redis 不可用 → polling
   *                    （单进程开发环境 localBus 还能投递事件，所以不立即放弃）
   *   - onState      → 真实驱动进度 + 增量渲染分组
   *   - onDone       → terminal，关连接；具体完成处理由 onState(stage=completed) 触发
   */
  startStreamOrFallback() {
    const ids = (this.data.fileIds || []).filter(Boolean)
    if (!ids.length) {
      this.startPolling()
      return
    }

    // 幂等保护：onLoad/onShow/uploadFiles/restoreProcessingSession 都会进这条路径，
    // 任何并发或重复调用必须先关掉前一条流，不然两条 SSE 同时往同一 handler 灌事件，
    // completionHandled / handleParseFailure 会被触发两次，且老 task 还在偷消耗带宽。
    this.clearStream()

    this.streamReceivedAnyState = false
    this.streamingActive = true

    const fallbackToPolling = (reason) => {
      if (!this.streamingActive && !this.streamCloser) return
      console.warn('[upload] SSE fallback →', reason)
      this.clearStream()
      // polling 兜底之前若还未启动过，立刻补一次
      if (!this.pollingActive) {
        this.startPolling()
      }
    }

    const handlers = {
      onHello: (info) => {
        // info: { hasRedis, recordIds }；当前不强依赖
        if (info && info.hasRedis === false) {
          // 单进程模式 localBus 仍能送 → 不立即 fallback，等 SSE_FALLBACK_SENTINEL_MS
          this.armSseFallbackSentinel(() => fallbackToPolling('hello.hasRedis=false 且 8s 无事件'))
        }
      },
      onNoredis: (info) => {
        // 服务端显式告诉我们：Redis 不可用。
        // 仍给 8s 哨兵 —— 单进程 localBus 还能投递；超时再切轮询。
        this.armSseFallbackSentinel(() => fallbackToPolling((info && info.reason) || 'noredis 8s 无 state'))
      },
      onState: (evt) => {
        if (!evt) return
        this.streamReceivedAnyState = true
        this.disarmSseFallbackSentinel()
        this.handleStreamEvent(evt)
      },
      onDone: () => {
        // terminal：completed/error 已在 onState 触发过 handleCompletedResult / handleParseFailure
        this.clearStream()
      },
      onError: (err) => {
        // 网络/HTTP 错误（含基础库不支持 enableChunked 之后的 task.onChunkReceived 缺失）
        fallbackToPolling((err && err.message) || 'stream onError')
      }
    }

    this.streamCloser = sseClient.openParseStream(ids, handlers)
  },

  armSseFallbackSentinel(onTimeout) {
    if (this.streamFallbackTimer) return  // 已经武装过，不重置
    this.streamFallbackTimer = setTimeout(() => {
      this.streamFallbackTimer = null
      if (!this.streamReceivedAnyState) {
        try { onTimeout && onTimeout() } catch (_e) { /* ignore */ }
      }
    }, SSE_FALLBACK_SENTINEL_MS)
  },

  disarmSseFallbackSentinel() {
    if (this.streamFallbackTimer) {
      clearTimeout(this.streamFallbackTimer)
      this.streamFallbackTimer = null
    }
  },

  /**
   * PRD-2026Q4：把一个 SSE state 事件分发到 UI 状态。
   *   stage='ocr_text'     → streamRawText
   *   stage='field_group'  → 增量合并字段 + 标记分组 filled
   *   stage='completed'    → handleCompletedResult（保持与 polling 路径同收尾）
   *   stage='error'        → handleParseFailure
   *   其它（received/preprocess/heartbeat）→ 只更新进度与 step 卡片
   */
  handleStreamEvent(evt) {
    const stage = evt.stage
    const progress = typeof evt.progress === 'number' ? evt.progress : null
    this.applyStreamStage(stage, progress)

    if (stage === STAGE.OCR_TEXT && typeof evt.rawText === 'string') {
      // OCR 原文：默认折叠，仅在用户点开折叠区时展示
      this.setData({ streamRawText: evt.rawText })
      return
    }

    if (stage === STAGE.FIELD_GROUP && evt.fieldGroup && evt.fields) {
      this.mergeFieldGroup(evt.fieldGroup, evt.fields)
      return
    }

    if (stage === STAGE.COMPLETED && evt.result) {
      // result: { entities, text, provider, confidence }（与 ocrPipeline 输出一致）
      const entities = evt.result.entities || evt.result || {}
      this.pendingCompletedResult = entities
      // 终态：关 SSE 哨兵，关连接（onDone 也会再调一次，幂等）
      this.disarmSseFallbackSentinel()
      // 把 4 个 group 都标 filled，避免数据齐了但骨架卡死
      this.fillAllStreamGroups()
      if (!this.completionHandled) {
        this.handleCompletedResult(entities)
      }
      return
    }

    if (stage === STAGE.ERROR) {
      this.handleParseFailure({ errorMsg: evt.errorMsg || '解析失败' })
    }
  },

  /**
   * field_group 事件 → 把新字段叠到 parsedData，调一次 applyParsedPresentation（增量幂等）。
   * 同时把对应 group 标记成 filled，让 step 2 的"分组指示"骨架变实体。
   */
  mergeFieldGroup(groupKey, fields) {
    if (!groupKey || !fields) return

    // 字段叠加：仅在原值"空"时覆盖（保护用户已经 selectGapOption 改过的值）。
    // 关键：空数组/空对象也算"空"——partial-json 早期可能把 treatmentHistory:[] 先发出来，
    // 后续完整数组要能替换它，否则用户永远看不到治疗记录。
    const isEmpty = (x) => {
      if (x === undefined || x === null || x === '') return true
      if (Array.isArray(x) && x.length === 0) return true
      if (typeof x === 'object' && x !== null && Object.keys(x).length === 0) return true
      return false
    }
    const next = { ...this.data.parsedData }
    Object.keys(fields).forEach((k) => {
      if (isEmpty(next[k])) {
        next[k] = fields[k]
      }
    })
    this.applyParsedPresentation(next)

    // 分组填充态：把对应 group 改成 filled
    const groups = this.data.streamGroups.map((g) =>
      g.key === groupKey ? { ...g, filled: true } : g
    )
    this.setData({ streamGroups: groups })
  },

  /**
   * completed 事件到来时把 4 个 group 全部标 filled。
   * 适用场景：snapshot-at-open 直接给 completed、或 streamChatJson 一次性出齐、或非流式 fallback。
   * 没有这一步，UI 会一直显示 4 块骨架（数据其实已在 parsedData 里）。
   */
  fillAllStreamGroups() {
    const groups = (this.data.streamGroups || []).map((g) => ({ ...g, filled: true }))
    this.setData({ streamGroups: groups })
  },

  /**
   * 用户点折叠区头标 → 展开/收起 OCR 原文
   */
  toggleRawText() {
    this.setData({ showRawText: !this.data.showRawText })
  },

  startPolling() {
    this.clearPollTimer()
    this.clearProgressTimer()

    // 修复方案 Track 3.7：原 1500ms × 100 req/15min（默认限流，server/middleware/rateLimit.js:14-49）
    // 会让连续轮询 ~2.5 分钟撞 429（用户实测：rec_1777726380278_2a9xos32）。
    // 改为 setTimeout 自适应链：
    //   - 默认 3000ms（≈20 req/min，限额够撑 5 分钟+ 稳定轮询）
    //   - 命中 429 后退避到 10000ms，让限流窗口（15min）自然冷却
    //   - 终态分支调 clearPollTimer → pollingActive=false → 自动停链
    this.pollIntervalMs = 3000
    this.pollMaxIntervalMs = 10000
    this.pollingActive = true

    this.checkParseStatus()
    this.scheduleNextPoll()
  },

  scheduleNextPoll() {
    // pollingActive=false 等价于"已经走到终态/卸载"，不再排下一次。
    if (!this.pollingActive) {
      return
    }
    if (this.pollTimer) {
      clearTimeout(this.pollTimer)
    }
    this.pollTimer = setTimeout(() => {
      this.checkParseStatus()
    }, this.pollIntervalMs)
  },

  // Track D：根据已等待时间，给用户切换"还在工作"的同理心文案 + 拉慢轮询节奏。
  //   - 30/min 默认限流（rateLimit.js）下，长等待时把轮询拉到 5-10s 防 429。
  //   - 文案仅当还没进入完成态时覆盖 processingStatus；
  //     已完成（completionHandled=true 或 currentStep=3）则不抢占进度条收尾文案。
  LONG_WAIT_THRESHOLDS: [
    { afterSec: 0,   text: null,                                                 intervalMs: 3000 },
    { afterSec: 90,  text: '服务有点忙，正在仔细识别…（已 {s}s）',                  intervalMs: 5000 },
    { afterSec: 180, text: '复杂病历需要更多时间，我们正在为您整理…（已 {s}s）',     intervalMs: 8000 },
    { afterSec: 300, text: '这份内容比较长，请耐心稍候…（已 {s}s）',                intervalMs: 10000 }
  ],

  adjustPollIntervalForElapsed(elapsedSec) {
    const tiers = this.LONG_WAIT_THRESHOLDS
    let active = tiers[0]
    for (let i = tiers.length - 1; i >= 0; i -= 1) {
      if (elapsedSec >= tiers[i].afterSec) {
        active = tiers[i]
        break
      }
    }
    // 节奏：单调拉慢，永不变快（429 退避后保持 10000 不被压低）
    const next = Math.max(this.pollIntervalMs || 3000, active.intervalMs)
    if (next !== this.pollIntervalMs) {
      this.pollIntervalMs = next
    }
    // 文案：仅当尚未完成时覆盖；completionHandled / currentStep===3 / parseProgress===100 都视为完成态
    const isFinished = this.completionHandled
      || this.data.currentStep === 3
      || Number(this.data.parseProgress || 0) >= 100
    if (active.text && !isFinished) {
      const txt = active.text.replace('{s}', `${elapsedSec}`)
      if (this.data.processingStatus !== txt) {
        this.setData({ processingStatus: txt })
      }
    }
  },

  async checkParseStatus() {
    try {
      // Track D（2026-05-03）：彻底移除客户端硬超时。
      //   原 90s 客户端 timeout vs 服务端实测 88s 仅 2s 余量 —— 任何抖动都让客户端先于服务端宣告失败。
      //   新契约：服务端是终态唯一来源，仅在 status='error' 时才弹失败模态框；
      //          客户端永不主动放弃，只随 elapsed 切文案 + 拉慢轮询节奏，给用户"系统还在工作"的同理心。
      //   兜底：服务端 Bull `timeout: 480000`（queue.js）8 分钟 zombie protection 会发 'failed' 事件 → status='error'。
      const activeBatch = parseTask.getActiveParseBatch()
      const activeTask = parseTask.getActiveParseTask()
      const startedAt = (activeBatch && activeBatch.startedAt) || (activeTask && activeTask.startedAt)
      const elapsedSec = startedAt ? Math.floor((Date.now() - Number(startedAt)) / 1000) : 0
      this.adjustPollIntervalForElapsed(elapsedSec)

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
          // 只覆盖文案；进度条由 simulator 推动 —— 直接 setData parseProgress 会让数字
          // 与 parseProgressStyle（条宽）短暂错位（用户感知为"条快、数字慢"）。
          this.setData({
            processingStatus: `已处理 ${completedCount + erroredCount} / ${total} 份…`
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
      // 修复方案 Track 3.7：撞 429 时把 interval 拉到 10s 上限，
      // 让服务端 15min/100 req 默认限额自然消化掉冷却窗口。
      // buildHttpError (utils/api.js:231-237) 把 statusCode 挂在 error 上。
      if (error && Number(error.statusCode) === 429) {
        this.pollIntervalMs = this.pollMaxIntervalMs
        console.warn('解析状态轮询撞限流，降速到', this.pollIntervalMs, 'ms')
      }
    } finally {
      // 兜底：不管这次结果（早 return / 失败 / 异常）都排下一次。
      // 终态/卸载分支已经在 clearPollTimer 里把 pollingActive 清成 false，
      // scheduleNextPoll 自己会 short-circuit，不会泄漏 timer。
      this.scheduleNextPoll()
    }
  },

  // 修复方案 Track 3.2：解析失败统一处理 —— 模态框 + 真实错误信息 + 手填路径。
  handleParseFailure(payload) {
    this.clearPollTimer()
    this.clearProgressTimer()
    this.clearStream()
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
    // Track C-2：分组式 gap UI 用的 sections（可能为空数组）
    const gapSections = schema.buildGapSections(normalized)

    return {
      normalized,
      parsedSections,
      structuredSummary,
      missingFields,
      gapSections
    }
  },

  /**
   * Track C-2（PRD-2026Q3）：把 gapSections 映射成默认折叠状态。
   *   - 第一组（gapSections[0]，通常是 basic 基本入组）默认展开 —— 用户先填最关键的
   *   - 其余组默认折叠 —— 让 gap-section 整体高度可控，主按钮 sticky 不被推出屏
   *   - 如果用户已经手动 toggle 过某组，保留用户的选择（按 key 合并）
   */
  buildCollapsedGroupsState(gapSections, prevCollapsed) {
    const next = {}
    gapSections.forEach((section, idx) => {
      // 用户曾经手动改过这一组：保留原值
      if (prevCollapsed && Object.prototype.hasOwnProperty.call(prevCollapsed, section.key)) {
        next[section.key] = !!prevCollapsed[section.key]
        return
      }
      // 默认：第一组展开（false=不折叠），其它折叠（true=折叠）
      next[section.key] = idx > 0
    })
    return next
  },

  applyParsedPresentation(parsedData) {
    const presentation = this.buildParsedPresentation(parsedData)
    // Track C-2：缓存初始 missing 数 + 计算「已补几项」进度
    //   _initialGapTotal 在 handleCompletedResult 第一次进入时设定（看下文）。
    //   这里只用差值算 filledNow，避免每次 setData 都重算 —— 大数据集（41 字段）
    //   下不至于慢，但语义清晰：filledNow 始终基于解析完成那一刻的初始 missing。
    const initialTotal = Number(this._initialGapTotal || presentation.missingFields.length)
    const filledNow = Math.max(0, initialTotal - presentation.missingFields.length)
    const percent = initialTotal > 0
      ? Math.min(100, Math.round((filledNow / initialTotal) * 100))
      : 100
    const collapsedGroups = this.buildCollapsedGroupsState(
      presentation.gapSections,
      this.data.collapsedGroups
    )

    // PRD-2026Q2 §P1-7：动态主 CTA 文案
    const missingCount = presentation.missingFields.length
    const primaryCtaText = missingCount > 0
      ? `再补 ${missingCount} 项更准 · 直接看新药`
      : '信息已齐 · 看找到的新药'

    this.setData({
      parsedData: presentation.normalized,
      parsedSections: presentation.parsedSections,
      structuredSummary: presentation.structuredSummary,
      summaryProgressStyle: `width: ${presentation.structuredSummary.completeness}%;`,
      missingFields: presentation.missingFields,
      gapSections: presentation.gapSections,
      collapsedGroups,
      gapSummary: {
        totalMissing: initialTotal,
        filledNow,
        percent
      },
      primaryCtaText
    })
    return presentation
  },

  /**
   * Track C-2（PRD-2026Q3）：折叠/展开 gap-section 中的某一组。
   * wxml 通过 `bindtap="toggleGapGroup" data-key="{groupKey}"` 触发。
   */
  toggleGapGroup(e) {
    const key = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key
    if (!key) {
      return
    }
    const next = { ...(this.data.collapsedGroups || {}) }
    next[key] = !next[key]
    this.setData({ collapsedGroups: next })
  },

  handleCompletedResult(result) {
    this.completionHandled = true
    this.clearPollTimer()
    this.clearStream()
    this.setProgressTarget('completed', 100)
    // PRD-2026Q4：completed 时把 4 个分组都标 filled，让 step 2 -> step 3 之前的瞬间
    // 没有任何"还在骨架"的视觉残留
    const allFilled = this.data.streamGroups.map((g) => ({ ...g, filled: true }))
    this.setData({ streamGroups: allFilled, currentStage: STAGE.COMPLETED, etaText: '' })

    // Q3-红线 §B.2：解析完成 = 漏斗 upload_success
    try {
      track('upload_success', {
        recordId: this.data.recordId || this.data.fileId || ''
      })
    } catch (e) { /* ignore */ }

    // PRD-2026Q4：完成时把全部 entities 都喂给 normalize（不再只投影 4 个字段），
    // 让流式累积的 age/ecog/pdl1/treatmentLine/... 不会被收尾覆盖丢失。
    // 同时叠加 this.data.parsedData（流式期间已累积的字段）—— result 是服务端
    // 最终结果，里面有值会覆盖；result 没填的字段 streaming 期间填过的会保留。
    // 浅 merge 足够：所有候选字段都是 primitive / string / array，没有需要深合并的嵌套对象。
    const parsedData = {
      ...(this.data.parsedData || {}),
      ...(result || {})
    }

    // Track C-2：先清掉上次 session 的初始 gap 总数（resetUploadSessionState 已经清，
    // 这里再保险一道，确保「同一份数据二次解析」不会用旧 baseline）。
    // 实际 baseline 在下面 applyParsedPresentation 后用本次 missingFields 长度填入。
    this._initialGapTotal = 0
    // 用户在新一份病历上的折叠选择从默认重来，避免上一份的「已展开」记忆带过来。
    this.setData({ collapsedGroups: {} })
    const presentation = this.applyParsedPresentation(parsedData)
    const { normalized, missingFields } = presentation
    // 现在 missingFields 是「解析完成那一刻」的初始 missing 数，固化到 baseline。
    this._initialGapTotal = missingFields.length
    // 立刻再 setData 一次让 gapSummary.totalMissing 用真实 baseline，避免首屏显示 0/0
    if (missingFields.length > 0) {
      this.setData({
        gapSummary: {
          totalMissing: missingFields.length,
          filledNow: 0,
          percent: 0
        }
      })
    }
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

    // PRD-2026Q2 §P0-3：取消「1.2s 后自动跳转到病历详情页」。
    // 旧行为：上传 + 解析 100% 完成后强行 redirectTo /pages/records/detail
    //         —— 老人/家属还没看清「找到的新药」就被踢走，找不回来。
    // 新行为：停留在 step 3 完成态，弹一个轻量 toast 确认数据已存，
    //         由用户主动点 sticky CTA「看看为家人找到的新药」决定下一步。
    if (missingFields.length === 0 && !this.data.pdfQualityHintShown && resolvedRecordId) {
      wx.showToast({
        title: '信息已保存',
        icon: 'success',
        duration: 1500
      })
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

  // PRD-2026Q2 §3.7：手动录入入口（与 H5 /matches?manualEntry=1 对等）
  goToManualEntry() {
    wx.navigateTo({ url: '/pages/manualEntry/manualEntry' })
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
      // PRD-2026Q4：恢复会话时优先 SSE（snapshot 回放能让用户立刻看到当前阶段）
      this.startStreamOrFallback()
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
      fileIds: [activeTask.fileId],
      isBatchParse: false,
      hasPdfUpload: !!activeTask.hasPdfUpload
    })
    this.startStreamOrFallback()
  }
})
