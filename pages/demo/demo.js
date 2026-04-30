// PRD-2026Q3 §U7：「先看个例子」——
// 给 0 医学基础家属一个无门槛预览入口，看一份完整的样例病历 + 匹配结果，
// 帮他熟悉「上传后能拿到什么」，再决定要不要把家人的病历交给我们。
//
// 数据全部 mock，刻意做得真实但有「样例」明确标识。
// - 样例病人：王女士，65 岁，右肺腺癌 III 期，EGFR 19 缺失阳性
// - 治疗史：手术 → 化疗 → 一线靶向（奥希替尼） → 进展
// - 影像：靶病灶 32mm，新发肝转移
// - 匹配 4 个临床试验：1 高度匹配 / 2 中等 / 1 待补
//
// 真实数据走 utils/api.js → server/controllers/matches.js；这里完全离线，
// 不打 /api/matches，避免没登录的访客访问被 401。

Page({
  data: {
    // 顶部样例标识
    sampleBanner: {
      title: '这是一份样例数据',
      subtitle: '帮您熟悉上传后能拿到什么 —— 不是真实的匹配结果。'
    },

    // 样例结构化病历卡（与 records/detail 字段对齐）
    record: {
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
      // 体力评分 + 关键化验
      ecog: '1（能下床走动，做轻活）',
      labs: [
        { name: '血红蛋白', value: '118 g/L', range: '120-160', flag: 'low' },
        { name: '中性粒细胞', value: '3.2×10⁹/L', range: '2-7' },
        { name: '肝功能 ALT', value: '28 U/L', range: '<40' },
        { name: '肌酐', value: '64 μmol/L', range: '50-90' }
      ],
      // 治疗时间线
      treatments: [
        { date: '2024-04', name: '右肺上叶切除术 + 纵隔淋巴结清扫', kind: '手术' },
        { date: '2024-05', name: '培美曲塞 + 顺铂 4 个周期', kind: '辅助化疗' },
        { date: '2024-09', name: '奥希替尼 80mg 每日一次', kind: '靶向（一线）' },
        { date: '2026-02', name: '影像评估：肝新发病灶，疾病进展（PD）', kind: '复查' }
      ],
      // 影像 / 病灶
      imaging: {
        targetLesion: '右下肺结节 32mm（基线）',
        newLesion: '肝右叶 18mm 新发病灶（2026-02）',
        latestExam: '2026-02 胸腹增强 CT'
      },
      summary: '右肺腺癌 III B 期，EGFR 19 缺失阳性，奥希替尼治疗后进展，PD-L1 TPS 30%；体力良好（ECOG 1）。'
    },

    // 4 条样例匹配结果（与 matches.wxml 字段对齐）
    matches: [
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
        score: 92,
        matchLevel: '高度匹配',
        matchTone: 'high',
        humanReason: '基因结果完全吻合，正好是这个研究招募的人群；奥希替尼耐药后继续治疗的方案，您家人的情况非常对得上',
        decisionTone: 'positive',
        decisionHint: '强烈建议优先看这个 —— 入组条件几乎全中，您家人就是这个研究的目标人群。',
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
        expanded: false
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
        score: 78,
        matchLevel: '比较匹配',
        matchTone: 'mid',
        humanReason: '诊断、分期、基因都对得上；PD-L1 TPS 30% 也在这个研究的入组范围内',
        decisionTone: 'positive',
        decisionHint: '适合看 —— 您家人 PD-L1 表达水平在该研究的获益人群范围里。',
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
        score: 64,
        matchLevel: '比较匹配',
        matchTone: 'mid',
        humanReason: '诊断和分期对得上；研究覆盖多瘤种，对基因要求不严，您家人能进',
        decisionTone: 'neutral',
        decisionHint: '可以作为备选 —— 这是一个新型药物的早期研究，安全性数据还在积累，副作用情况需要您和医生再权衡。',
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
        score: 52,
        matchLevel: '可以考虑',
        matchTone: 'low',
        humanReason: '诊断和基因对得上；分中心目前只有北京，看您家人是否方便',
        decisionTone: 'caution',
        decisionHint: '看就医地点 —— 这个研究目前只有北京中心招募，需要您评估异地就诊的实际情况。',
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

  // 「上传我的病历」—— 看完样例后的主转化路径
  goToUpload() {
    wx.navigateTo({
      url: '/pages/upload/upload'
    })
  },

  // 二级出口：返回首页
  goBack() {
    wx.navigateBack({ delta: 1 })
  }
})
