// PRD-2026Q3 §U7：演示页 第 2 步——为家人找到的新药。
// 数据完全 mock，与 /pages/demo/demo 第 1 步的样例病历对应。
// 4 条新药覆盖 高(92%) / 中(78%) / 中(64%) / 低(52%) 四档，
// 字段与正式 /pages/matches/matches 完全对齐，让用户能直观理解
// 上传后真实拿到的视图就是这样。
//
// 货架视角设计：每条都把"在研新药"作为主商品，包含药品通用名 / 代号 / 类别 /
// 剂型 / 商品名 / 药企，匹配阿里健康/美团买药的购物心智。

const SAMPLE_MATCHES = [
  {
    id: 'demo-trial-001',
    name: 'EGFR T790M 阳性 NSCLC 三代靶向耐药后续治疗 II 期研究',
    nctId: 'NCT05XXXXXX1',
    institution: '中国医学科学院肿瘤医院',
    subCenters: ['北京', '上海', '广州'],
    phase: 'II 期',
    type: '靶向 + 化疗',
    indication: '奥希替尼治疗后进展的非小细胞肺癌',
    status: '招募中',
    drug: {
      name: '伏美替尼',
      code: 'AST2818',
      class: '第三代 EGFR-TKI',
      form: '口服片剂',
      brand: '艾弗沙®',
      manufacturer: '艾力斯医药',
      freeAccess: true
    },
    score: 92,
    matchLevel: '高度匹配',
    matchTone: 'high',
    humanReason: '基因结果完全吻合，正好是这种新药招募的人群；奥希替尼耐药后继续用药的方案，您家人的情况非常对得上',
    decisionTone: 'positive',
    decisionHint: '强烈建议优先申请这种新药 —— 用药条件几乎全中，您家人就是这种新药的目标人群。',
    inclusion: [
      'EGFR 19 外显子缺失或 L858R 突变阳性',
      '一代/三代 EGFR-TKI 治疗后疾病进展',
      'ECOG 0-1，预期生存 ≥ 3 个月',
      '至少一处可测量病灶（RECIST 1.1）'
    ],
    exclusion: [
      '存在不可控的脑转移',
      '入组前 4 周内接受过其他抗肿瘤治疗',
      '严重心肝肾功能不全'
    ],
    expanded: true // 第一条默认展开，让首屏就能看到完整结构
  },
  {
    id: 'demo-trial-002',
    name: 'EGFR 突变 NSCLC 联合 PD-1 抑制剂耐药后 III 期注册研究',
    nctId: 'NCT05XXXXXX2',
    institution: '上海市肺科医院',
    subCenters: ['上海', '杭州', '南京'],
    phase: 'III 期',
    type: '免疫 + 化疗',
    indication: 'EGFR 突变型晚期非小细胞肺癌',
    status: '招募中',
    drug: {
      name: '信迪利单抗',
      code: 'IBI-308',
      class: 'PD-1 单抗',
      form: '注射剂',
      brand: '达伯舒®',
      manufacturer: '信达生物',
      freeAccess: true
    },
    score: 78,
    matchLevel: '比较匹配',
    matchTone: 'mid',
    humanReason: '诊断、分期、基因都对得上；PD-L1 TPS 30% 也在这种新药的用药范围内',
    decisionTone: 'positive',
    decisionHint: '适合申请 —— 您家人 PD-L1 表达水平在这种新药的获益人群范围里。',
    inclusion: [
      'EGFR 敏感突变阳性 + 一代/三代 TKI 治疗后进展',
      'PD-L1 TPS ≥ 1%',
      '年龄 18-75 岁',
      '可测量病灶 + 充足脏器功能'
    ],
    exclusion: [
      '既往使用过 PD-1/PD-L1 抑制剂',
      '活动性自身免疫性疾病',
      '间质性肺疾病史'
    ],
    expanded: false
  },
  {
    id: 'demo-trial-003',
    name: '晚期实体瘤新型 ADC 药物 I/II 期剂量递增研究',
    nctId: 'NCT05XXXXXX3',
    institution: '复旦大学附属肿瘤医院',
    subCenters: ['上海'],
    phase: 'I/II 期',
    type: 'ADC 药物',
    indication: '多种实体瘤（含非小细胞肺癌）',
    status: '招募中',
    drug: {
      name: 'BL-B01D1',
      code: 'BL-B01D1',
      class: 'EGFR×HER3 双抗 ADC',
      form: '注射剂',
      brand: '',
      manufacturer: '百利天恒',
      freeAccess: true
    },
    score: 64,
    matchLevel: '比较匹配',
    matchTone: 'mid',
    humanReason: '诊断和分期对得上；这种新药覆盖多瘤种，对基因要求不严，您家人能进',
    decisionTone: 'neutral',
    decisionHint: '可以作为备选 —— 这是一种新型 ADC 的早期研究，安全性数据还在积累，副作用情况需要您和医生再权衡。',
    inclusion: [
      '组织学确诊的晚期/转移性实体瘤',
      '至少经过一线标准治疗失败',
      'ECOG 0-1',
      '可测量病灶'
    ],
    exclusion: [
      '入组前 2 周接受过其他抗肿瘤治疗',
      '未控制的中枢神经系统转移',
      '严重周围神经病变（≥ 2 级）'
    ],
    expanded: false
  },
  {
    id: 'demo-trial-004',
    name: '晚期 NSCLC 抗血管生成联合化疗 II 期临床研究',
    nctId: 'NCT05XXXXXX4',
    institution: '北京协和医院',
    subCenters: ['北京'],
    phase: 'II 期',
    type: '抗血管 + 化疗',
    indication: '驱动基因阳性 NSCLC 后线治疗',
    status: '招募中',
    drug: {
      name: '安罗替尼',
      code: 'AL-3818',
      class: '多靶点抗血管 TKI',
      form: '口服胶囊',
      brand: '福可维®',
      manufacturer: '正大天晴',
      freeAccess: true
    },
    score: 52,
    matchLevel: '可以考虑',
    matchTone: 'low',
    humanReason: '诊断和基因对得上；这种新药目前只有北京医院在提供，看您家人是否方便',
    decisionTone: 'caution',
    decisionHint: '看就医地点 —— 这种新药目前只有北京中心招募，需要您评估异地就诊的实际情况。',
    inclusion: [
      'EGFR 突变阳性 + TKI 进展后',
      '年龄 18-70 岁',
      '足够的骨髓 / 肝肾功能'
    ],
    exclusion: [
      '近 6 个月内有动脉血栓事件',
      '活动性出血',
      '高血压控制不佳'
    ],
    expanded: false
  }
]

Page({
  data: {
    matches: SAMPLE_MATCHES,
    highMatches: 1,
    readyMatches: 3,
    sampleBanner: {
      title: '这是样例新药匹配',
      subtitle: '基于上一步的样例病历，从公开新药库找出的 4 种在研新药 —— 真实场景里的视图就是这样。'
    },
    // 用上一步存在 storage 里的样例病历做一句话回顾，避免用户跳页后忘了上下文
    recordRecap: ''
  },

  onLoad() {
    const sample = wx.getStorageSync('demoSampleRecord')
    const recap = sample && sample.summary
      ? `基于：${sample.summary}`
      : '基于：右肺腺癌 III B 期，EGFR 19 缺失阳性，奥希替尼耐药。'
    this.setData({ recordRecap: recap })
  },

  toggleMatch(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return
    const matches = this.data.matches.map((item) => {
      if (`${item.id}` !== `${id}`) return item
      return { ...item, expanded: !item.expanded }
    })
    this.setData({ matches })
  },

  // 看完样例后的主转化路径
  goToUpload() {
    wx.navigateTo({ url: '/pages/upload/upload' })
  },

  goBack() {
    wx.navigateBack({ delta: 1 })
  },

  // 回到第 1 步重看
  goBackToStep1() {
    wx.navigateBack({ delta: 1 })
  }
})
