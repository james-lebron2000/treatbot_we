const CP1252_REVERSE_MAP = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f
}

const countMatches = (text, pattern) => {
  const hit = text.match(pattern)
  return hit ? hit.length : 0
}

const MOJIBAKE_CHAR_PATTERN = /[ÃÂâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿŒœŠšŽžƒ]/g
const MOJIBAKE_SIGNATURES = [
  /ã€/,
  /â‰/,
  /â€”/,
  /å…/,
  /æœ/,
  /çš/,
  /å¤/,
  /é˜/,
  /ç™/,
  /å±/,
  /åˆ/,
  /çº/,
  /ç»/,
  /èƒ/,
  /ï¼/,
  /ï¼ˆ/,
  /ï¼‰/,
  /ä¸/,
  /å­/,
  /åŒ»/,
  /åŽŸ/,
  /é€‚/,
  /ç—‡/,
  /Î¼/,
  /Î±/,
  /Î²/
]

const isLikelyMojibake = (text) => {
  if (!text) {
    return false
  }
  const weirdCount = countMatches(text, MOJIBAKE_CHAR_PATTERN)
  const replacementCount = countMatches(text, /�/g)
  const cjkCount = countMatches(text, /[\u4e00-\u9fff]/g)
  const hasSignature = MOJIBAKE_SIGNATURES.some((pattern) => pattern.test(text))
  return weirdCount + replacementCount >= 2 || hasSignature || (weirdCount >= 1 && cjkCount === 0)
}

const toCp1252Bytes = (text) => {
  const bytes = []
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code <= 0xff) {
      bytes.push(code)
    } else if (CP1252_REVERSE_MAP[code] !== undefined) {
      bytes.push(CP1252_REVERSE_MAP[code])
    } else {
      bytes.push(0x3f)
    }
  }
  return Uint8Array.from(bytes)
}

const toLatin1Bytes = (text) => {
  const bytes = []
  for (let i = 0; i < text.length; i += 1) {
    bytes.push(text.charCodeAt(i) & 0xff)
  }
  return Uint8Array.from(bytes)
}

const readabilityScore = (text) => {
  const cjkCount = countMatches(text, /[\u4e00-\u9fff]/g)
  const weirdCount = countMatches(text, MOJIBAKE_CHAR_PATTERN)
  const replacementCount = countMatches(text, /�/g)
  const controlCount = countMatches(text, /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g)
  const punctuationBonus = countMatches(text, /[（）《》、：；，。]/g)
  return cjkCount * 3 + punctuationBonus - weirdCount * 2 - replacementCount * 4 - controlCount * 3
}

const decodeUtf8 = (bytes) => {
  if (typeof TextDecoder === 'undefined') {
    return ''
  }

  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch (error) {
    return ''
  }
}

const trimControlChars = (text) => `${text || ''}`.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim()

const collectDecodeCandidates = (text) => {
  const queue = [text]
  const visited = new Set()
  const results = []

  while (queue.length > 0 && results.length < 8) {
    const current = queue.shift()
    const normalizedCurrent = trimControlChars(current)
    if (!normalizedCurrent || visited.has(normalizedCurrent)) {
      continue
    }

    visited.add(normalizedCurrent)
    results.push(normalizedCurrent)

    const decodedCandidates = [
      decodeUtf8(toLatin1Bytes(normalizedCurrent)),
      decodeUtf8(toCp1252Bytes(normalizedCurrent))
    ]

    decodedCandidates.forEach((candidate) => {
      const trimmed = trimControlChars(candidate)
      if (trimmed && !visited.has(trimmed)) {
        queue.push(trimmed)
      }
    })
  }

  return results
}

const tryFixMojibake = (text) => {
  const normalized = trimControlChars(text)
  if (!isLikelyMojibake(normalized)) {
    return normalized
  }

  const candidates = collectDecodeCandidates(normalized)
  let best = normalized
  let bestScore = readabilityScore(normalized)

  candidates.forEach((candidate) => {
    const score = readabilityScore(candidate)
    if (score > bestScore + 1) {
      best = candidate
      bestScore = score
    }
  })

  return best
}

const safeText = (value) => {
  const raw = trimControlChars(`${value || ''}`)
  return tryFixMojibake(raw)
}

const isPresent = (value) => {
  return safeText(value) !== '' && safeText(value) !== '待补'
}

const ensureArray = (value) => {
  if (Array.isArray(value)) {
    return value
      .filter((item) => isPresent(item))
      .map((item) => safeText(item))
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n；;。]/)
      .map((item) => safeText(item))
      .filter(Boolean)
  }
  return []
}

const includesEither = (a, b) => {
  const left = safeText(a)
  const right = safeText(b)
  if (!left || !right) {
    return false
  }
  return left.indexOf(right) > -1 || right.indexOf(left) > -1
}

const uniqueList = (list) => [...new Set((list || []).filter((item) => isPresent(item)))]

const deriveSummary = (textOrList) => {
  const list = ensureArray(textOrList)
  if (list.length === 0) {
    return ''
  }
  return list[0]
}

const normalizeRecruitStatus = (statusText) => {
  const raw = safeText(statusText).toLowerCase()
  if (!raw) {
    return ''
  }
  if (raw === 'recruiting' || raw === 'active') {
    return '招募中'
  }
  if (raw === 'completed') {
    return '已完成'
  }
  if (raw === 'terminated') {
    return '已终止'
  }
  if (raw === 'not yet recruiting') {
    return '未开始招募'
  }
  return safeText(statusText)
}

const resolveMatchLevel = (score, levelText) => {
  if (isPresent(levelText)) {
    return safeText(levelText)
  }
  if (score >= 80) {
    return '高度匹配'
  }
  if (score >= 60) {
    return '中度匹配'
  }
  if (score >= 40) {
    return '低度匹配'
  }
  if (score > 0) {
    return '不匹配'
  }
  return '待评估'
}

const normalizeMatchItem = (item = {}, index = 0) => {
  const trial = item.trial || {}
  const reasons = ensureArray(item.reasons || item.matchReasons || item.match_reasons || trial.matchReasons || [])
  const inclusion = ensureArray(
    item.inclusion ||
      item.inclusionCriteria ||
      item.inclusion_criteria ||
      trial.inclusion ||
      trial.inclusionCriteria ||
      trial.inclusion_criteria
  )
  const exclusion = ensureArray(
    item.exclusion ||
      item.exclusionCriteria ||
      item.exclusion_criteria ||
      trial.exclusion ||
      trial.exclusionCriteria ||
      trial.exclusion_criteria
  )
  const inclusionSummary = safeText(
    item.inclusionSummary || item.inclusion_summary || trial.inclusionSummary || deriveSummary(inclusion)
  )
  const exclusionSummary = safeText(
    item.exclusionSummary || item.exclusion_summary || trial.exclusionSummary || deriveSummary(exclusion)
  )

  const id =
    item.id ||
    item.trialId ||
    item.trial_id ||
    trial.id ||
    trial.trialId ||
    trial.nct_id ||
    trial.nctId ||
    `trial_${index + 1}`

  return {
    id: `${id}`,
    name: safeText(item.name || item.title || item.trialName || trial.title || trial.name || '未命名临床试验'),
    score: Number(item.score || item.matchScore || item.match_score || 0),
    matchLevel: resolveMatchLevel(
      Number(item.score || item.matchScore || item.match_score || 0),
      item.matchLevel || item.match_level
    ),
    phase: safeText(item.phase || item.trialPhase || trial.phase || '待补'),
    location: safeText(item.location || item.city || trial.location || trial.city || '待补'),
    type: safeText(item.type || item.studyType || item.study_type || trial.studyType || trial.study_type || '临床研究'),
    indication: safeText(item.indication || item.cancerType || trial.indication || '待补'),
    institution: safeText(item.institution || item.hospital || trial.institution || trial.hospital || '待补'),
    nctId: safeText(item.nct_id || item.nctId || trial.nct_id || trial.nctId || ''),
    status: normalizeRecruitStatus(item.status || trial.status || ''),
    sponsor: safeText(item.sponsor || trial.sponsor || '待补'),
    description: safeText(item.description || trial.description || '暂无描述'),
    reasons,
    inclusion,
    exclusion,
    inclusionSummary,
    exclusionSummary,
    contact: {
      name: safeText(
        (item.contact && item.contact.name) || item.contact_name || (trial.contact && trial.contact.name) || trial.contact_name || '--'
      ),
      phone:
        safeText((item.contact && item.contact.phone) || item.contact_phone || (trial.contact && trial.contact.phone) || trial.contact_phone || ''),
      email:
        safeText((item.contact && item.contact.email) || item.contact_email || (trial.contact && trial.contact.email) || trial.contact_email || '--')
    },
    updatedAt: safeText(item.updatedAt || item.updateTime || item.createdAt || trial.updatedAt || '')
  }
}

const getPatientProfile = () => {
  const draft =
    typeof wx !== 'undefined' && wx && typeof wx.getStorageSync === 'function'
      ? wx.getStorageSync('structuredRecordDraft') || {}
      : {}
  return {
    diagnosis: draft.diagnosis || draft.disease || '',
    stage: draft.stage || '',
    city: draft.city || draft.location || '',
    pathologyType: draft.pathologyType || '',
    ecog: draft.ecog,
    targetLesion: draft.targetLesion || '',
    geneMutation: draft.geneMutation || draft.gene_mutation || '',
    pdL1: draft.pdL1 || draft.pdl1 || '',
    activeInfection: draft.activeInfection || '',
    hivStatus: draft.hivStatus || '',
    hbvStatus: draft.hbvStatus || '',
    pregnancyStatus: draft.pregnancyStatus || '',
    autoimmuneDisease: draft.autoimmuneDisease || '',
    organTransplant: draft.organTransplant || '',
    brainMetastasis: draft.brainMetastasis || '',
    hemoglobin: draft.hemoglobin,
    neutrophils: draft.neutrophils,
    platelets: draft.platelets,
    alt: draft.alt,
    ast: draft.ast,
    bilirubin: draft.bilirubin,
    creatinine: draft.creatinine
  }
}

const buildInclusionHits = (match, profile) => {
  const hits = []
  const fullText = `${match.name} ${match.inclusionSummary} ${match.reasons.join(' ')} ${match.inclusion.join(' ')}`

  hits.push(...match.reasons)

  if (isPresent(profile.diagnosis) && isPresent(match.indication) && includesEither(profile.diagnosis, match.indication)) {
    hits.push(`疾病方向匹配：${profile.diagnosis}`)
  }

  if (isPresent(profile.stage) && includesEither(fullText, profile.stage)) {
    hits.push(`分期条件命中：${profile.stage}`)
  }

  if (isPresent(profile.geneMutation) && includesEither(fullText, profile.geneMutation)) {
    hits.push(`基因特征命中：${profile.geneMutation}`)
  }

  if (isPresent(profile.pdL1) && includesEither(fullText, 'PD-L1')) {
    hits.push(`PD-L1 信息可用于筛选：${profile.pdL1}`)
  }

  if (safeText(profile.targetLesion) === '是' || safeText(profile.targetLesion) === '有') {
    hits.push('已提供可测量病灶信息（RECIST）')
  }

  if (isPresent(profile.city) && isPresent(match.location) && includesEither(profile.city, match.location)) {
    hits.push(`地理位置匹配：${profile.city}`)
  }

  return uniqueList(hits).slice(0, 4)
}

const buildExclusionRisks = (match, profile) => {
  const risks = []
  const exclusionText = `${match.exclusionSummary} ${match.exclusion.join(' ')} ${match.name}`

  if (safeText(profile.activeInfection) === '是') {
    risks.push('存在活动性感染，很多试验会排除')
  }

  if (safeText(profile.pregnancyStatus) === '妊娠' || safeText(profile.pregnancyStatus) === '哺乳') {
    risks.push('妊娠/哺乳状态通常属于排除项')
  }

  if (safeText(profile.autoimmuneDisease) === '是') {
    risks.push('活动性自身免疫疾病需重点核查')
  }

  if (safeText(profile.organTransplant) === '是') {
    risks.push('器官移植史可能触发排除条件')
  }

  if (isPresent(profile.hivStatus) && safeText(profile.hivStatus).indexOf('阳性') > -1) {
    risks.push('HIV 阳性需核对具体方案要求')
  }

  if (isPresent(profile.hbvStatus) && safeText(profile.hbvStatus).indexOf('阳性-活动') > -1) {
    risks.push('HBV 活动状态常见为排除风险')
  }

  if (safeText(profile.brainMetastasis) === '是' && /脑转移|中枢神经|CNS/i.test(exclusionText)) {
    risks.push('试验文本含脑转移限制，需人工复核')
  }

  if (isPresent(profile.city) && isPresent(match.location) && !includesEither(profile.city, match.location)) {
    risks.push(`研究中心在 ${match.location}，与当前就诊城市 ${profile.city} 不一致`)
  }

  return uniqueList(risks).slice(0, 4)
}

const buildMissingEvidence = (match, profile) => {
  const missing = []
  const fullText = `${match.inclusionSummary} ${match.exclusionSummary} ${match.inclusion.join(' ')} ${match.exclusion.join(' ')}`
  const requiredEvidence = [
    { key: 'pathologyType', label: '病理/组织学类型' },
    { key: 'ecog', label: 'ECOG 评分' },
    { key: 'targetLesion', label: '可测量病灶（RECIST）' },
    { key: 'hemoglobin', label: '血红蛋白' },
    { key: 'neutrophils', label: '中性粒细胞' },
    { key: 'platelets', label: '血小板' },
    { key: 'alt', label: 'ALT' },
    { key: 'ast', label: 'AST' },
    { key: 'bilirubin', label: '总胆红素' },
    { key: 'creatinine', label: '肌酐' }
  ]

  if (!isPresent(profile.diagnosis)) {
    missing.push('临床诊断缺失，无法确认适应症匹配')
  }
  if (!isPresent(profile.stage)) {
    missing.push('分期信息缺失，影响入组判断')
  }
  if (!isPresent(profile.city)) {
    missing.push('就诊城市缺失，无法判断中心可及性')
  }

  requiredEvidence.forEach((item) => {
    if (!isPresent(profile[item.key])) {
      missing.push(`缺少${item.label}，建议补全最新检查值`)
    }
  })

  if (/ECOG/i.test(fullText) && !isPresent(profile.ecog)) {
    missing.push('试验要求 ECOG，当前病历未提供')
  }
  if (/RECIST|可测量病灶/i.test(fullText) && !isPresent(profile.targetLesion)) {
    missing.push('试验可能要求可测量病灶，当前未标注')
  }
  if (/EGFR|ALK|ROS1|KRAS|BRAF|HER2|MET|RET|NTRK|PD-L1/i.test(fullText) && !isPresent(profile.geneMutation)) {
    missing.push('试验涉及分子分型，缺少基因/PD-L1 结果')
  }

  return uniqueList(missing).slice(0, 5)
}

const buildDecisionHint = (score, risks, missingEvidence) => {
  if (risks.length >= 2) {
    return { tone: 'risk', text: '排除风险较高，建议先医生预审' }
  }
  if (missingEvidence.length >= 3) {
    return { tone: 'warn', text: '证据不足，建议先补齐病历' }
  }
  if (score >= 80 && risks.length === 0) {
    return { tone: 'good', text: '优先推荐，可尽快联系中心' }
  }
  return { tone: 'normal', text: '建议进一步预筛核对' }
}

const splitEvidenceLines = (text) => {
  if (!isPresent(text)) {
    return []
  }
  return safeText(text)
    .split(/\n+/)
    .map((line) => line.replace(/^\s*\d+[、.)．]?\s*/g, '').trim())
    .filter(Boolean)
}

const extractEvidenceLines = (text, keywords, limit = 3) => {
  const lines = splitEvidenceLines(text)
  const matched = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const found = keywords.some((keyword) => line.indexOf(keyword) > -1)
    if (found) {
      matched.push(line.length > 54 ? `${line.slice(0, 54)}...` : line)
    }
    if (matched.length >= limit) {
      break
    }
  }
  return uniqueList(matched)
}

const buildEvidenceSources = (match, profile) => {
  const inclusionText = `${match.inclusionSummary}\n${match.inclusion.join('\n')}`
  const exclusionText = `${match.exclusionSummary}\n${match.exclusion.join('\n')}`

  const hitKeywords = uniqueList([
    profile.diagnosis,
    profile.stage,
    profile.geneMutation,
    'ECOG',
    'RECIST',
    'PD-L1',
    '可测量病灶'
  ]).filter(Boolean)

  const riskKeywords = ['排除', '感染', '妊娠', '哺乳', 'HIV', 'HBV', '脑转移', '自身免疫', '器官移植']
  const missingKeywords = ['ECOG', 'RECIST', 'ALT', 'AST', '血小板', '中性粒', '血红蛋白', '肌酐', '总胆红素']

  return {
    hitSources: extractEvidenceLines(inclusionText, hitKeywords, 3),
    riskSources: extractEvidenceLines(exclusionText, riskKeywords, 3),
    missingSources: extractEvidenceLines(`${inclusionText}\n${exclusionText}`, missingKeywords, 3)
  }
}

const enrichMatchExplanation = (match, profile) => {
  const inclusionHits = buildInclusionHits(match, profile)
  const exclusionRisks = buildExclusionRisks(match, profile)
  const missingEvidence = buildMissingEvidence(match, profile)
  const decision = buildDecisionHint(match.score, exclusionRisks, missingEvidence)
  const evidence = buildEvidenceSources(match, profile)

  return {
    ...match,
    inclusionHits,
    exclusionRisks,
    missingEvidence,
    ...evidence,
    decisionTone: decision.tone,
    decisionHint: decision.text
  }
}

const sortMatchesByScoreAndTime = (list) => {
  return [...list].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score
    }
    return `${b.updatedAt}`.localeCompare(`${a.updatedAt}`)
  })
}

module.exports = {
  safeText,
  isPresent,
  ensureArray,
  includesEither,
  resolveMatchLevel,
  normalizeMatchItem,
  getPatientProfile,
  enrichMatchExplanation,
  sortMatchesByScoreAndTime
}
