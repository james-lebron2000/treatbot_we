// 阿里健康 / 美团买药专业运营视角的关键洞察：
// 用户搜索的是「药品」，不是「研究项目」。
// 后端短期内可能仍只返回 trial.name（如 "EGFR T790M 阳性 NSCLC 三代靶向耐药后续治疗 II 期研究"），
// 这一层负责从 name / type / indication 中抽出药品名 + 代号 + 类别 + 药企，
// 让前端可以按「药品货架」的样式展示。
//
// 三种来源（优先级降序）：
//   1) 后端显式返回 drug 对象 —— 直接用
//   2) 名称里能正则匹配到已知药物（30+ 常见肿瘤药词典） —— 用词典
//   3) fallback：用 type + phase 拼出"靶向新药 / 免疫新药"等占位药名

// === 已知药物词典 ===
// 覆盖国内肿瘤新药主流品种 + 常见 ADC / 双抗 / 第三代靶向。
// 每条：[正则|关键词, 中文通用名, 代号, 类别, 商品名(可选), 药企(可选)]
const KNOWN_DRUGS = [
  // 第三代 EGFR-TKI
  { match: /奥希替尼|osimertinib|AZD9291|tagrisso/i, name: '奥希替尼', code: 'AZD9291', class: '第三代 EGFR-TKI', form: '口服片剂', brand: '泰瑞沙®', manufacturer: '阿斯利康' },
  { match: /伏美替尼|furmonertinib|AST2818|alflutinib/i, name: '伏美替尼', code: 'AST2818', class: '第三代 EGFR-TKI', form: '口服片剂', brand: '艾弗沙®', manufacturer: '艾力斯医药' },
  { match: /阿美替尼|aumolertinib|HS-?10296/i, name: '阿美替尼', code: 'HS-10296', class: '第三代 EGFR-TKI', form: '口服片剂', brand: '阿美乐®', manufacturer: '翰森制药' },
  { match: /贝福替尼|befotertinib|D-?0316/i, name: '贝福替尼', code: 'D-0316', class: '第三代 EGFR-TKI', form: '口服片剂', brand: '赛美纳®', manufacturer: '倍而达药业' },
  // 一二代 EGFR-TKI
  { match: /吉非替尼|gefitinib|iressa/i, name: '吉非替尼', code: 'ZD1839', class: '一代 EGFR-TKI', form: '口服片剂', brand: '易瑞沙®', manufacturer: '阿斯利康' },
  { match: /厄洛替尼|erlotinib|tarceva/i, name: '厄洛替尼', code: 'OSI-774', class: '一代 EGFR-TKI', form: '口服片剂', brand: '特罗凯®', manufacturer: '罗氏' },
  { match: /阿法替尼|afatinib|gilotrif/i, name: '阿法替尼', code: 'BIBW2992', class: '二代 EGFR-TKI', form: '口服片剂', brand: '吉泰瑞®', manufacturer: '勃林格殷格翰' },
  // ALK / ROS1 抑制剂
  { match: /克唑替尼|crizotinib|xalkori/i, name: '克唑替尼', code: 'PF-02341066', class: 'ALK/ROS1 抑制剂', form: '口服胶囊', brand: '赛可瑞®', manufacturer: '辉瑞' },
  { match: /阿来替尼|alectinib|alecensa/i, name: '阿来替尼', code: 'CH5424802', class: '二代 ALK 抑制剂', form: '口服胶囊', brand: '安圣莎®', manufacturer: '罗氏' },
  { match: /洛拉替尼|lorlatinib|lorbrena/i, name: '洛拉替尼', code: 'PF-06463922', class: '三代 ALK 抑制剂', form: '口服片剂', brand: '博瑞纳®', manufacturer: '辉瑞' },
  { match: /塞瑞替尼|ceritinib|zykadia/i, name: '塞瑞替尼', code: 'LDK378', class: '二代 ALK 抑制剂', form: '口服胶囊', brand: '赞可达®', manufacturer: '诺华' },
  { match: /恩沙替尼|ensartinib|X-?396/i, name: '恩沙替尼', code: 'X-396', class: '二代 ALK 抑制剂', form: '口服胶囊', brand: '贝美纳®', manufacturer: '贝达药业' },
  // PD-1 / PD-L1
  { match: /信迪利单抗|sintilimab|IBI-?308|tyvyt|达伯舒/i, name: '信迪利单抗', code: 'IBI-308', class: 'PD-1 单抗', form: '注射用粉针', brand: '达伯舒®', manufacturer: '信达生物' },
  { match: /替雷利珠单抗|tislelizumab|BGB-?A317|tevimbra/i, name: '替雷利珠单抗', code: 'BGB-A317', class: 'PD-1 单抗', form: '注射剂', brand: '百泽安®', manufacturer: '百济神州' },
  { match: /卡瑞利珠单抗|camrelizumab|SHR-?1210|艾瑞卡/i, name: '卡瑞利珠单抗', code: 'SHR-1210', class: 'PD-1 单抗', form: '注射剂', brand: '艾瑞卡®', manufacturer: '恒瑞医药' },
  { match: /特瑞普利单抗|toripalimab|JS-?001|tuoyi/i, name: '特瑞普利单抗', code: 'JS-001', class: 'PD-1 单抗', form: '注射剂', brand: '拓益®', manufacturer: '君实生物' },
  { match: /帕博利珠单抗|pembrolizumab|keytruda|MK-?3475|可瑞达/i, name: '帕博利珠单抗', code: 'MK-3475', class: 'PD-1 单抗', form: '注射剂', brand: '可瑞达®', manufacturer: '默沙东' },
  { match: /纳武利尤单抗|nivolumab|opdivo|BMS-?936558|欧狄沃/i, name: '纳武利尤单抗', code: 'BMS-936558', class: 'PD-1 单抗', form: '注射剂', brand: '欧狄沃®', manufacturer: '百时美施贵宝' },
  { match: /阿替利珠单抗|atezolizumab|tecentriq/i, name: '阿替利珠单抗', code: 'MPDL3280A', class: 'PD-L1 单抗', form: '注射剂', brand: '泰圣奇®', manufacturer: '罗氏' },
  { match: /度伐利尤单抗|durvalumab|imfinzi/i, name: '度伐利尤单抗', code: 'MEDI4736', class: 'PD-L1 单抗', form: '注射剂', brand: '英飞凡®', manufacturer: '阿斯利康' },
  // 抗血管 + 化疗辅助
  { match: /贝伐珠单抗|bevacizumab|avastin|安维汀/i, name: '贝伐珠单抗', code: 'rhuMAb-VEGF', class: 'VEGF 抗血管单抗', form: '注射剂', brand: '安维汀®', manufacturer: '罗氏' },
  { match: /安罗替尼|anlotinib|AL-?3818|福可维/i, name: '安罗替尼', code: 'AL-3818', class: '多靶点抗血管 TKI', form: '口服胶囊', brand: '福可维®', manufacturer: '正大天晴' },
  { match: /阿帕替尼|apatinib|YN968D1|艾坦/i, name: '阿帕替尼', code: 'YN968D1', class: 'VEGFR-2 TKI', form: '口服片剂', brand: '艾坦®', manufacturer: '恒瑞医药' },
  // ADC
  { match: /BL-?B01D1/i, name: 'BL-B01D1', code: 'BL-B01D1', class: 'EGFR×HER3 双抗 ADC', form: '注射剂', brand: '', manufacturer: '百利天恒' },
  { match: /trastuzumab[\s-]*deruxtecan|T-?DXd|enhertu|DS-?8201|德曲妥珠/i, name: '德曲妥珠单抗', code: 'DS-8201', class: 'HER2 ADC', form: '注射剂', brand: 'Enhertu®', manufacturer: '第一三共/阿斯利康' },
  { match: /sacituzumab|trodelvy|IMMU-?132|戈沙妥珠/i, name: '戈沙妥珠单抗', code: 'IMMU-132', class: 'TROP-2 ADC', form: '注射剂', brand: 'Trodelvy®', manufacturer: '吉利德' },
  { match: /维迪西妥单抗|RC-?48|disitamab/i, name: '维迪西妥单抗', code: 'RC-48', class: 'HER2 ADC', form: '注射剂', brand: '爱地希®', manufacturer: '荣昌生物' },
  // KRAS / BRAF
  { match: /sotorasib|AMG-?510|lumakras/i, name: 'Sotorasib', code: 'AMG-510', class: 'KRAS G12C 抑制剂', form: '口服片剂', brand: 'Lumakras®', manufacturer: '安进' },
  { match: /adagrasib|MRTX-?849/i, name: 'Adagrasib', code: 'MRTX-849', class: 'KRAS G12C 抑制剂', form: '口服片剂', brand: 'Krazati®', manufacturer: 'Mirati' },
  { match: /达拉非尼|dabrafenib|tafinlar/i, name: '达拉非尼', code: 'GSK2118436', class: 'BRAF 抑制剂', form: '口服胶囊', brand: '泰菲乐®', manufacturer: '诺华' },
  // 化疗辅助常见
  { match: /多西他赛|docetaxel|taxotere/i, name: '多西他赛', code: 'RP-56976', class: '紫杉类化疗', form: '注射剂', brand: '泰索帝®', manufacturer: '赛诺菲' },
  { match: /培美曲塞|pemetrexed|alimta/i, name: '培美曲塞', code: 'LY231514', class: '叶酸代谢抑制', form: '注射剂', brand: '力比泰®', manufacturer: '礼来' },
  // 双抗（举例）
  { match: /amivantamab|JNJ-?61186372|rybrevant/i, name: '埃万妥单抗', code: 'JNJ-61186372', class: 'EGFR×MET 双抗', form: '注射剂', brand: 'Rybrevant®', manufacturer: '强生' },
  { match: /AK-?112|ivonescimab|依沃西/i, name: '依沃西单抗', code: 'AK-112', class: 'PD-1×VEGF 双抗', form: '注射剂', brand: '', manufacturer: '康方生物' }
]

// type 字段（"靶向 + 化疗" / "ADC 药物" / "免疫 + 化疗" 等）映射到通用占位
const TYPE_TO_GENERIC_DRUG = {
  '靶向': { name: '在研靶向新药', class: '靶向药物' },
  '免疫': { name: '在研免疫新药', class: '免疫检查点抑制剂' },
  'ADC': { name: '在研 ADC 新药', class: '抗体偶联药物' },
  '抗血管': { name: '在研抗血管新药', class: '抗血管生成药' },
  '化疗': { name: '在研化疗新药', class: '化疗药物' },
  '细胞': { name: '在研细胞治疗', class: 'CAR-T / 细胞治疗' },
  '双抗': { name: '在研双抗新药', class: '双特异性抗体' }
}

// 从一段文字里抽出第一个匹配到的已知药
const extractFromText = (text) => {
  if (!text) return null
  for (const d of KNOWN_DRUGS) {
    if (d.match.test(text)) {
      return {
        name: d.name,
        code: d.code,
        class: d.class,
        form: d.form,
        brand: d.brand,
        manufacturer: d.manufacturer,
        freeAccess: true,
        source: 'dictionary'
      }
    }
  }
  return null
}

// 根据 type / phase 拼一个占位
const fallbackFromType = (type, phase) => {
  if (!type) {
    return {
      name: '在研新药',
      code: '',
      class: '临床研究阶段',
      form: '',
      brand: '',
      manufacturer: '',
      freeAccess: true,
      source: 'fallback'
    }
  }
  for (const key of Object.keys(TYPE_TO_GENERIC_DRUG)) {
    if (type.indexOf(key) > -1) {
      const tpl = TYPE_TO_GENERIC_DRUG[key]
      return {
        name: tpl.name,
        code: '',
        class: tpl.class + (phase ? `（${phase}）` : ''),
        form: '',
        brand: '',
        manufacturer: '',
        freeAccess: true,
        source: 'fallback-type'
      }
    }
  }
  return {
    name: '在研新药',
    code: '',
    class: type || '临床研究阶段',
    form: '',
    brand: '',
    manufacturer: '',
    freeAccess: true,
    source: 'fallback-other'
  }
}

/**
 * 解析一个 match item 的药品信息
 * @param {Object} item - 来自后端或 mock 的 match 对象
 * @returns {Object} drug 对象 { name, code, class, form, brand, manufacturer, freeAccess, source }
 */
const resolveDrug = (item = {}) => {
  // 1) 后端显式返回 drug
  if (item.drug && item.drug.name) {
    return {
      name: `${item.drug.name}`,
      code: `${item.drug.code || ''}`,
      class: `${item.drug.class || item.drug.category || ''}`,
      form: `${item.drug.form || ''}`,
      brand: `${item.drug.brand || ''}`,
      manufacturer: `${item.drug.manufacturer || item.drug.sponsor || ''}`,
      freeAccess: item.drug.freeAccess !== false,
      source: 'backend'
    }
  }
  // 2) 词典抽取（试 name → indication → type）
  const candidates = [
    item.name,
    item.title,
    item.trialName,
    item.indication,
    item.description,
    item.type
  ].filter(Boolean)
  for (const text of candidates) {
    const hit = extractFromText(text)
    if (hit) return hit
  }
  // 3) fallback
  return fallbackFromType(item.type, item.phase)
}

module.exports = {
  resolveDrug,
  KNOWN_DRUGS,
  TYPE_TO_GENERIC_DRUG
}
