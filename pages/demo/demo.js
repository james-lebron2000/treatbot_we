// PRD-2026Q3 §U7（迭代）：「先看个例子」演示页 第 1 步——
// 全面仿真实际上传 + 提取流程，让 0 医学基础家属在不冒险的前提下
// 看明白「如果传一份病历，会发生什么」。
//
// 三阶段动效（与真实 pages/upload/upload.js 流水线 1:1 对齐）：
//   phase = 'uploading'  → 0–30%  仿真上传，文件缩略图 + 进度条
//   phase = 'parsing'    → 30–95% 4 个 step 卡顺序点亮（OCR / 找关键信息 /
//                                整理结构 / 匹配预取），并伴随「字段一条
//                                一条 reveal」的 mock 提取效果
//   phase = 'done'       → 100%   显示完整结构化病历卡片 + 「下一步」
//
// 第 2 步（匹配结果）放到 /pages/demo/matches/matches，wx.navigateTo 跳转。
// 数据完全 mock，不打 /api/matches。

const TIMING = {
  // 总时长 ~6 秒，刻意比真实接口快但不能瞬移；让用户能看清流程。
  uploadingMs: 1800,        // 0 → 30%
  parsingMs: 3600,          // 30 → 95%（4 个 step 各 ~900ms）
  doneSettleMs: 600,        // 95 → 100% 收尾
  fieldRevealStaggerMs: 280 // 字段逐条出现间隔
}

const PARSE_STEPS = [
  { key: 'ocr', title: '看清病历写了什么', desc: '识别图像 / PDF 里的所有文字' },
  { key: 'keyInfo', title: '找诊断、分期、基因这些关键信息', desc: '从识别结果中圈出医生说过的关键字段' },
  { key: 'struct', title: '整理成可读的病历卡片', desc: '把诊断 / 治疗 / 影像按时间线和分组排好' },
  { key: 'prefetch', title: '为您预取可能的临床试验', desc: '同步从公开试验库检索匹配项，下一页就能看' }
]

// 字段 reveal 顺序（按医生看病历的自然阅读顺序）。每条对应到 record 里的字段路径。
const FIELD_REVEAL_ORDER = [
  'patient.basic',      // 姓名 / 年龄 / 性别 / ECOG
  'diagnosis.primary',  // 原发病
  'diagnosis.stage',    // 分期
  'diagnosis.pathology',// 病理类型
  'genes',              // 基因检测（一组）
  'labs',               // 化验
  'treatments',         // 治疗时间线
  'imaging',            // 影像
  'summary'             // 摘要（最后一条点亮）
]

// 与第二页共享的 mock 病历快照（写到 storage 让 /pages/demo/matches 取）
const SAMPLE_RECORD = {
  patient: {
    nickName: '王女士（样例）',
    age: 65,
    sex: '女',
    weight: '52 kg',
    height: '160 cm'
  },
  diagnosis: {
    primary: '右肺腺癌',
    pathology: '腺癌（中分化）',
    stage: 'III B 期（cT4N2M0）',
    diagnosedAt: '2024-03'
  },
  genes: [
    { name: 'EGFR', detail: '19 外显子缺失（阳性）', highlight: true },
    { name: 'ALK', detail: '阴性' },
    { name: 'ROS1', detail: '阴性' },
    { name: 'PD-L1', detail: 'TPS 30%' }
  ],
  ecog: '1（能下床走动，做轻活）',
  labs: [
    { name: '血红蛋白', value: '118 g/L', range: '120-160', flag: 'low' },
    { name: '中性粒细胞', value: '3.2×10⁹/L', range: '2-7' },
    { name: '肝功能 ALT', value: '28 U/L', range: '<40' },
    { name: '肌酐', value: '64 μmol/L', range: '50-90' }
  ],
  treatments: [
    { date: '2024-04', name: '右肺上叶切除术 + 纵隔淋巴结清扫', kind: '手术' },
    { date: '2024-05', name: '培美曲塞 + 顺铂 4 个周期', kind: '辅助化疗' },
    { date: '2024-09', name: '奥希替尼 80mg 每日一次', kind: '靶向（一线）' },
    { date: '2026-02', name: '影像评估：肝新发病灶，疾病进展（PD）', kind: '复查' }
  ],
  imaging: {
    targetLesion: '右下肺结节 32mm（基线）',
    newLesion: '肝右叶 18mm 新发病灶（2026-02）',
    latestExam: '2026-02 胸腹增强 CT'
  },
  summary: '右肺腺癌 III B 期，EGFR 19 缺失阳性，奥希替尼治疗后进展，PD-L1 TPS 30%；体力良好（ECOG 1）。'
}

Page({
  data: {
    phase: 'uploading',          // 'uploading' | 'parsing' | 'done'
    progress: 0,                 // 0-100
    progressStyle: 'width: 0%;',
    parseSteps: PARSE_STEPS,
    parseStepIndex: -1,          // -1=未开始；0~3 对应 PARSE_STEPS
    revealedFields: {},          // { 'patient.basic': true, ... }
    record: SAMPLE_RECORD,
    sampleFile: {
      name: '出院小结-王女士-2026.pdf',
      kind: 'PDF',
      pages: 6
    },
    sampleBanner: {
      title: '这是一份样例数据',
      subtitle: '我们仿真演示「上传 → 看懂 → 匹配」全流程，您看完再决定是否上传家人的真实病历。'
    }
  },

  onLoad() {
    // 进入页面立刻自动开始仿真。如果将来要让用户手动「点开始」可以拆出来。
    // 这里把 mock 病历也写到 storage，让第二页能读到（保持与「上传完保存到本地」对齐的语义）。
    wx.setStorageSync('demoSampleRecord', SAMPLE_RECORD)
    this.startSimulation()
  },

  onUnload() {
    this.cleanupTimers()
  },

  cleanupTimers() {
    this.timers && this.timers.forEach((t) => clearTimeout(t))
    this.intervals && this.intervals.forEach((t) => clearInterval(t))
    this.timers = []
    this.intervals = []
  },

  // 进度推进的统一封装：在 [from, to] 之间用 ~durationMs 平滑递增，
  // 期间每 80ms 触发一次 setData，避免 15+ fps 不流畅。
  rampProgress(from, to, durationMs, onDone) {
    const startedAt = Date.now()
    const tick = () => {
      const elapsed = Date.now() - startedAt
      const t = Math.min(1, elapsed / durationMs)
      // ease-out cubic：开头快收尾慢，更像真实进度条
      const eased = 1 - Math.pow(1 - t, 3)
      const value = Math.round(from + (to - from) * eased)
      this.setData({
        progress: value,
        progressStyle: `width: ${value}%;`
      })
      if (t >= 1) {
        clearInterval(handle)
        onDone && onDone()
      }
    }
    const handle = setInterval(tick, 80)
    this.intervals.push(handle)
    tick()
  },

  startSimulation() {
    this.timers = []
    this.intervals = []

    // ===== Phase A: 上传 0 → 30% =====
    this.setData({ phase: 'uploading' })
    this.rampProgress(0, 30, TIMING.uploadingMs, () => {
      // ===== Phase B: 解析 30 → 95%，4 个 step 顺序点亮 =====
      this.setData({ phase: 'parsing', parseStepIndex: 0 })
      this.runParsingPhase()
    })
  },

  runParsingPhase() {
    const stepCount = PARSE_STEPS.length
    const stepDuration = TIMING.parsingMs / stepCount
    const baseProgress = 30
    const span = 95 - 30

    // 字段 reveal 与解析进度并行：用一个独立 interval 在解析阶段把 9 个字段
    // 平摊到 ~3.6s 内逐条点亮（即 fieldRevealStaggerMs ≈ 400ms 一条）。
    const totalReveals = FIELD_REVEAL_ORDER.length
    const stagger = Math.max(200, Math.floor(TIMING.parsingMs / totalReveals))
    let revealIdx = 0
    const revealHandle = setInterval(() => {
      if (revealIdx >= totalReveals) {
        clearInterval(revealHandle)
        return
      }
      const key = FIELD_REVEAL_ORDER[revealIdx]
      this.setData({
        [`revealedFields.${key}`]: true
      })
      revealIdx++
    }, stagger)
    this.intervals.push(revealHandle)

    // step 顺序推进
    const advanceStep = (i) => {
      const stepStart = baseProgress + (span / stepCount) * i
      const stepEnd = baseProgress + (span / stepCount) * (i + 1)
      this.setData({ parseStepIndex: i })
      this.rampProgress(Math.round(stepStart), Math.round(stepEnd), stepDuration, () => {
        if (i + 1 < stepCount) {
          advanceStep(i + 1)
        } else {
          // ===== Phase C: 收尾 95 → 100% =====
          this.rampProgress(95, 100, TIMING.doneSettleMs, () => {
            // 等所有字段都 reveal 完再切到 done 视图
            const remaining = totalReveals - revealIdx
            const wait = Math.max(0, remaining * stagger + 200)
            const t = setTimeout(() => {
              // 确保所有字段都 reveal（防止 stagger 余数）
              const allRevealed = {}
              FIELD_REVEAL_ORDER.forEach((k) => { allRevealed[k] = true })
              this.setData({
                phase: 'done',
                parseStepIndex: stepCount, // 所有 step 完成
                revealedFields: allRevealed
              })
            }, wait)
            this.timers.push(t)
          })
        }
      })
    }
    advanceStep(0)
  },

  // 跳过仿真，直接看结果（给已经看过流程的用户）
  skipSimulation() {
    this.cleanupTimers()
    const allRevealed = {}
    FIELD_REVEAL_ORDER.forEach((k) => { allRevealed[k] = true })
    this.setData({
      phase: 'done',
      progress: 100,
      progressStyle: 'width: 100%;',
      parseStepIndex: PARSE_STEPS.length,
      revealedFields: allRevealed
    })
  },

  // 重新看一遍仿真
  replaySimulation() {
    this.cleanupTimers()
    this.setData({
      phase: 'uploading',
      progress: 0,
      progressStyle: 'width: 0%;',
      parseStepIndex: -1,
      revealedFields: {}
    })
    this.startSimulation()
  },

  // 下一步：去样例匹配结果页
  goToDemoMatches() {
    wx.navigateTo({
      url: '/pages/demo/matches/matches'
    })
  },

  goToUpload() {
    wx.navigateTo({ url: '/pages/upload/upload' })
  },

  goBack() {
    wx.navigateBack({ delta: 1 })
  }
})
