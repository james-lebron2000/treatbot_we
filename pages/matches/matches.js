// pages/matches/matches.js
Page({
  data: {
    matches: [
      {
        id: '1',
        name: 'PD-1抑制剂联合化疗治疗晚期非小细胞肺癌II期临床试验',
        score: 92,
        phase: 'II期',
        location: '上海',
        type: '干预性研究',
        indication: '非小细胞肺癌（EGFR突变阳性）',
        institution: '复旦大学附属肿瘤医院',
        reasons: [
          '诊断为非小细胞肺癌，符合入组条件',
          'EGFR 19del突变阳性，符合分子标志物要求',
          '既往化疗2周期，符合治疗线数要求'
        ]
      },
      {
        id: '2',
        name: '第三代EGFR-TKI治疗耐药后肺癌III期临床试验',
        score: 85,
        phase: 'III期',
        location: '北京',
        type: '干预性研究',
        indication: 'EGFR T790M突变阳性肺癌',
        institution: '中国医学科学院肿瘤医院',
        reasons: [
          'EGFR突变阳性，符合分子标志物要求',
          '无脑转移，符合入组标准',
          'ECOG评分预计0-1分'
        ]
      },
      {
        id: '3',
        name: '抗血管生成药物联合免疫治疗肺癌Ib期临床试验',
        score: 78,
        phase: 'Ib期',
        location: '广州',
        type: '干预性研究',
        indication: '晚期非小细胞肺癌',
        institution: '中山大学肿瘤防治中心',
        reasons: [
          '诊断为晚期非小细胞肺癌',
          '年龄符合18-75岁要求',
          '需补充：肝肾功能检查结果'
        ]
      }
    ],
    highMatches: 2
  },

  viewDetail(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/matches/detail?id=${id}` })
  },

  applyTrial(e) {
    const { id } = e.currentTarget.dataset
    wx.showModal({
      title: '确认报名',
      content: '报名后研究机构将在3个工作日内与您联系，确认是否继续？',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({ title: '报名成功', icon: 'success' })
        }
      }
    })
  }
})