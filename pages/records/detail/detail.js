// PRD-2026Q3 §U7 / §3.5：病历详情页 —— 「上传完成 → 立刻看到自家病历的完整卡片视图」
// 也是「病历」tab 点进每条记录的目标页。
//
// 数据加载顺序（避免后端写入延迟导致空白）：
//   1) 优先读 storage 里的 structuredRecordDraft（刚上传完时由 upload.js 写入）；
//   2) 同时读 parseTask 缓存里的 parseResult:${id}（30 分钟 TTL，syncActiveParseTask 写）；
//   3) 异步去后端 /api/medical/records/:id 拿权威版本，并合并；
//   4) 同步把 matchCache:v2:${id} 里的匹配结果挂上来（preloadMatchesForRecord 写）；
//   5) 后端匹配缓存为空时，再调用 getMatches 兜底。
const api = require('../../../utils/api')
const auth = require('../../../utils/auth')
const schema = require('../../../utils/schema')
const parseTask = require('../../../utils/parse-task')
const { track } = require('../../../utils/track')
const { resolveDrug } = require('../../../utils/drug-extractor')

const STATUS_TEXT_MAP = {
  parsed: '已解析',
  completed: '已解析',
  parsing: '解析中',
  uploading: '上传中',
  failed: '解析失败',
  error: '解析失败'
}

const isPresent = (value) => value !== '' && value !== null && value !== undefined && `${value}`.trim() !== ''

// 把 schema 化的扁平 record（diagnosis / stage / geneMutation / ecog / ...）
// 重新整理成详情页用的「卡片块」视图模型：基本信息 / 诊断 / 基因 / 化验 / 治疗 / 影像 / 摘要
const buildView = (record) => {
  const normalized = schema.normalizeStructuredRecord(record)
  const sections = schema.buildRecordSections(normalized)
  const summary = schema.buildStructuredSummary(normalized)
  const missingFields = schema.getMissingFields(normalized)

  // 基本信息 K-V（与 demo 视觉一致）
  const basic = [
    { label: '年龄 / 性别', value: [normalized.age, normalized.gender].filter(isPresent).join(' / ') || '待补' },
    { label: '体力评分 ECOG', value: isPresent(normalized.ecog) ? `${normalized.ecog}` : '待补' },
    { label: '预计生存期', value: isPresent(normalized.lifeExpectancyMonths) ? `${normalized.lifeExpectancyMonths} 个月` : '—' },
    { label: '就诊城市', value: normalized.city || '—' },
    { label: '已签知情同意', value: normalized.consentSigned || '待补' }
  ]

  // 诊断卡
  const diagnosis = [
    { label: '原发病', value: normalized.diagnosis || '待补', highlight: true },
    { label: '病理类型', value: normalized.pathologyType || '待补' },
    { label: '分期', value: normalized.stage || '待补', highlight: true },
    { label: 'PD-L1 表达', value: normalized.pdL1 || '—' },
    { label: '可测量病灶', value: normalized.targetLesion || '—' },
    { label: '脑转移', value: normalized.brainMetastasis || '—' },
    { label: '肝转移', value: normalized.liverMetastasis || '—' },
    { label: '骨转移', value: normalized.boneMetastasis || '—' }
  ]

  // 基因（geneMutation 是单字段，先简单按 / 或 , 切一下；为空就给空数组让 wxml 隐藏）
  const geneRaw = `${normalized.geneMutation || ''}`.trim()
  const genes = geneRaw
    ? geneRaw.split(/[、,，;；/]/).map((s) => s.trim()).filter(Boolean)
    : []

  // 治疗（schema 里目前只有 previousTreatments 一段长文 + lineOfTherapy 数字 + 各种 yes/no）
  const treatmentChips = [
    normalized.surgeryHistory === '是' ? '手术' : null,
    normalized.chemotherapyHistory === '是' ? '化疗' : null,
    normalized.radiotherapyHistory === '是' ? '放疗' : null,
    normalized.targetedTherapyHistory === '是' ? '靶向治疗' : null,
    normalized.immunotherapyHistory === '是' ? '免疫治疗' : null
  ].filter(Boolean)

  const treatment = {
    line: isPresent(normalized.lineOfTherapy) ? `${normalized.lineOfTherapy} 线` : '—',
    description: normalized.previousTreatments || '—',
    chips: treatmentChips
  }

  // 化验（只展示有值的；schema 里这些都是数字字段）
  const labRows = [
    { name: '血红蛋白', value: normalized.hemoglobin, unit: 'g/L' },
    { name: '中性粒细胞', value: normalized.neutrophils, unit: '×10⁹/L' },
    { name: '血小板', value: normalized.platelets, unit: '×10⁹/L' },
    { name: 'ALT', value: normalized.alt, unit: 'U/L' },
    { name: 'AST', value: normalized.ast, unit: 'U/L' },
    { name: '总胆红素', value: normalized.bilirubin, unit: 'μmol/L' },
    { name: '肌酐', value: normalized.creatinine, unit: 'μmol/L' },
    { name: '肌酐清除率', value: normalized.creatinineClearance, unit: 'mL/min' }
  ].filter((row) => isPresent(row.value)).map((row) => ({ ...row, value: `${row.value}` }))

  // 风险（HBV/HCV/HIV/感染/自免/移植/妊娠）—— 任意一项有值就展示
  const riskRows = [
    { name: '乙肝（HBV）', value: normalized.hbvStatus },
    { name: '丙肝（HCV）', value: normalized.hcvStatus },
    { name: 'HIV', value: normalized.hivStatus },
    { name: '活动性感染', value: normalized.activeInfection },
    { name: '自身免疫', value: normalized.autoimmuneDisease },
    { name: '器官移植', value: normalized.organTransplant },
    { name: '妊娠/哺乳', value: normalized.pregnancyStatus }
  ].filter((row) => isPresent(row.value))

  return {
    normalized,
    sections,         // 兜底：保留原 schema 分组视图（手动补全场景仍可用）
    summary,
    missingFields,
    view: {
      basic,
      diagnosis,
      genes,
      treatment,
      labRows,
      riskRows
    }
  }
}

const normalizeMatchItem = (raw) => {
  if (!raw || typeof raw !== 'object') return null
  const score = Number(raw.score || raw.matchScore || raw.matchRate || 0)
  const tone = score >= 85 ? 'high' : score >= 65 ? 'mid' : 'low'
  // 阿里健康 / 美团买药货架视角：从后端 raw（可能只有 trial.name）里抽出药品主体，
  // 让卡片可以以「药」为主标题展示（drugName / drugCode / drugClass / manufacturer）。
  const drug = resolveDrug(raw)
  return {
    id: raw.id || raw.trialId || raw.nctId || raw._id || `${Math.random()}`,
    name: raw.name || raw.title || raw.trialName || '未命名研究',
    nctId: raw.nctId || raw.nct || '',
    institution: raw.institution || raw.organization || raw.sponsor || '',
    phase: raw.phase || '',
    status: raw.status || raw.recruitingStatus || '',
    indication: raw.indication || raw.disease || '',
    score: Math.round(score) || 0,
    matchTone: tone,
    matchLevel: tone === 'high' ? '高度匹配' : tone === 'mid' ? '比较匹配' : '可以考虑',
    humanReason: raw.humanReason || raw.reason || raw.matchReason || '',
    drugName: drug.name,
    drugCode: drug.code,
    drugClass: drug.class,
    manufacturer: drug.manufacturer,
    freeAccess: drug.freeAccess
  }
}

Page({
  data: {
    recordId: '',
    fromUpload: false,
    loading: true,
    record: null,
    summary: null,
    view: null,
    sections: [],
    missingFields: [],
    matches: [],
    matchCount: 0,
    matchesLoading: false,
    statusText: '',
    statusKey: '',
    errorMessage: ''
  },

  onLoad(options) {
    if (!options || !options.id) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      this.setData({ loading: false, errorMessage: '未携带病历 id' })
      return
    }
    const recordId = `${options.id}`
    this.setData({
      recordId,
      fromUpload: options.fromUpload === '1' || options.fromUpload === 1
    })

    // 第一阶段：先用 storage / 缓存里的「最近一次解析结果」秒开（避免空白闪屏）
    this.hydrateFromCache(recordId)

    // 第二阶段：异步去后端取权威版本 + 匹配结果
    this.loadFromRemote(recordId)

    // PRD-2026Q3 §B.2：进入详情视为一次 match_view —— 用户终于看到了为家人整理出的视图
    try { track('match_view', { recordId }) } catch (e) { /* ignore */ }
  },

  onShow() {
    // 用户从匹配页返回 → 重新拉一次缓存（matches 可能更新了）
    if (this.data.recordId) {
      this.hydrateFromCache(this.data.recordId)
    }
  },

  onUnload() {
    // 详情页存在期间用户可能还在看 records/detail；离开时不需要清缓存。
  },

  // 从 storage / parseTask 缓存填充首屏数据
  hydrateFromCache(recordId) {
    let candidate = null

    // 来源 1：upload.js 刚写入的 structuredRecordDraft（即时性最强）
    const draft = wx.getStorageSync('structuredRecordDraft')
    if (draft && (this.data.fromUpload || `${draft.id || ''}` === recordId || !draft.id)) {
      candidate = draft
    }

    // 来源 2：parseTask 写的 parseResult:${id} 缓存
    if (!candidate) {
      const cachedParse = parseTask.getCachedParseResult(recordId)
      if (cachedParse) {
        candidate = cachedParse
      }
    }

    if (candidate) {
      const built = buildView({ ...candidate, id: candidate.id || recordId })
      this.setData({
        record: built.normalized,
        summary: built.summary,
        view: built.view,
        sections: built.sections,
        missingFields: built.missingFields,
        statusText: '已解析',
        statusKey: 'parsed'
      })
    }

    // 匹配结果缓存
    const cachedMatch = parseTask.getCachedMatches(recordId)
    if (cachedMatch && Array.isArray(cachedMatch.list) && cachedMatch.list.length > 0) {
      const matches = cachedMatch.list.map(normalizeMatchItem).filter(Boolean)
      this.setData({ matches, matchCount: matches.length })
    }
  },

  async loadFromRemote(recordId) {
    this.setData({ loading: true, errorMessage: '' })
    try {
      // 没登录就不强制去拉远端 —— hydrate 步骤已经能给出本地缓存视图
      const token = `${wx.getStorageSync('token') || ''}`.trim()
      if (token) {
        await auth.ensureLogin().catch(() => null)
        try {
          const res = await api.getMedicalRecordDetail(recordId)
          const remote = api.normalizePayload(res) || {}
          if (remote && Object.keys(remote).length > 0) {
            const built = buildView({ ...remote, id: remote.id || recordId })
            this.setData({
              record: built.normalized,
              summary: built.summary,
              view: built.view,
              sections: built.sections,
              missingFields: built.missingFields,
              statusText: STATUS_TEXT_MAP[remote.status] || this.data.statusText || '已解析',
              statusKey: remote.status || this.data.statusKey || 'parsed'
            })
            // 同步刷一次本地 storage，让首页/记录列表 / 后续打开都用上最新值
            wx.setStorageSync('structuredRecordDraft', built.normalized)
            parseTask.setCachedParseResult(recordId, built.normalized)
          }
        } catch (error) {
          // 详情接口拿不到 → 用 hydrate 的本地缓存视图即可，不打断用户
          console.warn('[detail] 后端拉取失败，沿用本地缓存:', error && error.message)
        }
      }

      // 匹配结果异步加载（即使详情失败，也尝试拉匹配）
      this.loadMatches(recordId)
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadMatches(recordId) {
    if (!recordId) return
    // 已经从缓存填充则只在缓存为空时才走网络
    if (this.data.matches && this.data.matches.length > 0) return

    this.setData({ matchesLoading: true })
    try {
      const token = `${wx.getStorageSync('token') || ''}`.trim()
      if (!token) return
      const res = await api.getMatches({ recordId })
      const payload = api.normalizePayload(res) || {}
      const list = Array.isArray(payload)
        ? payload
        : payload.list || payload.items || payload.matches || payload.trials || []
      const matches = list.map(normalizeMatchItem).filter(Boolean)
      // 写入缓存供下次秒开
      parseTask.setCachedMatches(recordId, { list: matches })
      this.setData({ matches, matchCount: matches.length })
    } catch (error) {
      console.warn('[detail] 匹配结果加载失败:', error && error.message)
    } finally {
      this.setData({ matchesLoading: false })
    }
  },

  // 「看为家人找到的可能性」CTA → 切到匹配 tab，并把当前 recordId 带过去
  goToMatches() {
    if (this.data.recordId) {
      wx.setStorageSync('currentRecordId', this.data.recordId)
    }
    wx.switchTab({ url: '/pages/matches/matches' })
  },

  goToCompletion() {
    // 仍有缺失字段 → 跳回手动补全页
    wx.navigateTo({ url: '/pages/manualEntry/manualEntry' })
  },

  goBackToRecords() {
    wx.switchTab({ url: '/pages/records/records' })
  }
})
