// PRD-2026Q3 §U4：Treatbot Web + 小程序双端共享的字段术语 / 匹配理由 / 错误文案字典（单一来源）。
//
// 历史：原文件是 glossary.json。WeApp `require()` 不识别 .json 后缀；同
// help.json / upload.json 一致迁移到 .js（CommonJS）。
//
// Treatbot Web (web/src/copy/glossary.ts) 改成 `import glossary from '../../../shared/copy/glossary.js'`。
//
// 文案规则（_meta.rule）：
//   每条 plain ≤ 60 字；不出现「分期」「评分」「突变」等术语之外的医学英文；
//   example 给生活化举例；whyAsk 说明为什么需要这个信息（建立信任）。

module.exports = {
  _meta: {
    version: 'v2026Q3-1',
    audience: '0 医学基础的中年病人 + 家属',
    rule: '每条 plain ≤ 60 字；不出现「分期」「评分」「突变」等术语之外的医学英文；example 给生活化举例；whyAsk 说明为什么需要这个信息（建立信任）',
    consumers: [
      'web/src/pages/UploadView.vue (字段右侧 ?  按钮)',
      'web/src/pages/MatchesView.vue (卡片人话理由)',
      'pages/manualEntry/manualEntry.wxml (字段说明)',
      'pages/matches/matches.wxml (理由展示)'
    ]
  },
  fields: {
    diagnosis: {
      label: '诊断',
      plain: '医生说是什么病。出院小结开头一般就有，比如「右肺腺癌」「胃癌」。',
      example: '肺癌 / 胃癌 / 肝癌 / 乳腺癌',
      whyAsk: '用来找专门为这个病做的研究。',
      iDontKnow: '可以先跳过，我们看到病历后会自动识别'
    },
    pathologyType: {
      label: '病理类型',
      plain: '化验切片得出的细分类型。报告里常见「腺癌」「鳞癌」「小细胞」等字眼。',
      example: '腺癌 / 鳞癌 / 小细胞 / 大细胞',
      whyAsk: '不同细分类型适合的研究项目不一样。',
      iDontKnow: '如果病理报告还没拿到，先填诊断就够'
    },
    stage: {
      label: '病情属于早期还是晚期',
      plain: '通俗说就是早期、中期、晚期。报告里写「I/II/III/IV 期」分别对应早→晚。',
      example: 'I 期=早期 / II 期=中期 / III-IV 期=晚期',
      whyAsk: '不同阶段适合的治疗方法和研究项目不一样。',
      iDontKnow: '可以选「不太清楚」，我们会按医生意见辅助判断'
    },
    ecog: {
      label: '目前的活动能力',
      plain: '您家人现在能不能下床走动、能不能自理生活。和数字大小不挂钩，只是医生用来快速描述的代号。',
      example: '0=完全正常 / 1=能走能做轻活 / 2=半天躺床 / 3=多数时间躺床 / 4=完全卧床',
      whyAsk: '研究项目对体力要求不一样，我们好帮您挑合适的。',
      iDontKnow: '选「我不太确定」，按多数时间是不是能起来活动来选最接近的'
    },
    geneMutation: {
      label: '基因检测结果',
      plain: '如果做过基因检测，报告上会写一些英文+数字组合，例如 EGFR、KRAS、ALK。',
      example: 'EGFR 19 缺失 / EGFR L858R / ALK 阳性 / 没做基因检测',
      whyAsk: '很多新药是冲着特定基因变化设计的，对上了机会大很多。',
      iDontKnow: '如果没做基因检测，直接选「没做」，我们会推适合所有人的研究'
    },
    age: {
      label: '病人的年龄',
      plain: '周岁就行。',
      example: '60',
      whyAsk: '有些研究项目对年龄有要求。',
      iDontKnow: '按身份证算，差几岁不影响匹配'
    },
    consentSigned: {
      label: '您是否同意我们用这些信息找匹配',
      plain: '我们只用这些信息帮您找研究项目，看完就好，不会卖给任何人。',
      example: '勾选=同意 / 不勾选=暂不参与',
      whyAsk: '法律要求我们必须征得您同意。',
      iDontKnow: '可以先看看我们的隐私承诺，再决定'
    },
    targetLesion: {
      label: '影像检查能不能看到病灶',
      plain: 'CT 或 MRI 能不能在片子上看见明确的肿瘤位置。',
      example: '看得到 / 看不到 / 不知道',
      whyAsk: '很多研究需要片子上能跟踪病灶变化。',
      iDontKnow: '选「不知道」就行，我们会从您的影像报告里找'
    },
    treatment: {
      label: '之前做过什么治疗',
      plain: '做过的手术、化疗、放疗、靶向、免疫等等，简单写下名字就行。',
      example: '做过手术 + 化疗 4 次 / 还没开始治',
      whyAsk: '有些研究只招还没治过的，有些只招用过别的药效果不好的。',
      iDontKnow: '想到几个写几个，没记清楚不要紧'
    }
  },
  matchReasons: {
    _meta: '把后端返回的英文/术语 reasons 翻译成一句话适合普通人读的「为什么这种新药适合您家人」。覆盖率 80% 即可，没命中的走 fallback「这种新药的招募条件和您家人比较接近」。',
    diagnosis_match: '诊断对得上，这种新药就是冲着这个病做的',
    stage_match: '病情阶段在用药招募范围里',
    ecog_match: '体力要求您家人能达到',
    gene_match: '基因结果完全吻合，这种新药就是冲着这个基因变化设计的',
    age_match: '年龄符合用药条件',
    treatment_line_match: '之前的治疗经历正好是这种新药要找的人群',
    biomarker_match: '化验指标在用药范围内',
    no_exclusion: '看了所有用药限制都没踩中',
    location_match: '提供这种新药的医院离您不远',
    fallback: '这种新药的招募条件和您家人比较接近'
  },
  errors: {
    rate_limit: '您今天上传得有点多了，先歇会儿，过 10 分钟再来。',
    parse_failed: '这张我们没能看清，请尝试拍清楚一点，或换一张再传。',
    network: '网有点卡，要不再试一次？您填的内容没丢。',
    unknown: '出了点小问题，麻烦再试一次。如果还不行，请点右下角找我们。'
  }
}
