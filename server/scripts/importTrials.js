const path = require('path');
const fs = require('fs');
const { testConnection } = require('../config/database');
const { Trial } = require('../models');
const logger = require('../utils/logger');

const DATA_PATH = path.join(__dirname, '..', 'data', 'trials_data.json');

const splitTrimFilter = (value, sep = ',') => {
  if (!value) return [];
  return `${value}`.split(sep).map((s) => s.trim()).filter(Boolean);
};

const cleanDiseaseTag = (tag) => tag.replace(/（[^）]*）/g, '').trim();

const parseDiseaseTagsFromSource = (raw) => {
  return splitTrimFilter(raw).map(cleanDiseaseTag).filter(Boolean);
};

const parseTreatmentLines = (raw) => {
  if (raw == null || raw === '') return null;
  const nums = splitTrimFilter(`${raw}`).map((s) => parseInt(s, 10)).filter(Number.isFinite);
  return nums.length > 0 ? [...new Set(nums)].sort() : null;
};

const parseCities = (raw) => {
  return [...new Set(splitTrimFilter(raw))];
};

const parsePhase = (raw) => {
  if (raw == null) return null;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return `${raw}`;
  const map = { 1: 'I期', 2: 'II期', 3: 'III期', 4: 'IV期' };
  return map[Math.floor(n)] || `Phase ${raw}`;
};

const parseStatus = (raw) => {
  const s = `${raw || ''}`.trim();
  if (s.includes('招募')) return 'recruiting';
  if (s.includes('关闭') || s.includes('暂停')) return 'closed';
  if (s.includes('结束') || s.includes('完成')) return 'completed';
  return 'recruiting';
};

const splitCriteria = (raw) => {
  if (!raw) return [];
  return `${raw}`.split(/\n/).map((s) => s.trim()).filter((s) => s.length > 2);
};

const mapTrial = (src) => {
  const cities = parseCities(src['研究中心所在城市']);
  const hospitals = splitTrimFilter(src['研究医院']);
  const provinces = splitTrimFilter(src['研究中心所在省份']);

  return {
    id: src['项目编码'] || `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: src['项目名称'] || '',
    phase: parsePhase(src['分期试验阶段']),
    type: src['试验组治疗方案'] || null,
    indication: src['适应症'] || null,
    institution: hospitals.slice(0, 3).join('、') || null,
    location: provinces.slice(0, 3).join('、') || null,
    contact_phone: null,
    description: src['用药介绍'] || src['简要入组条件'] || null,
    inclusion_criteria: splitCriteria(src['入组条件']),
    exclusion_criteria: splitCriteria(src['排除条件']),
    status: parseStatus(src['项目状态']),
    target_count: null,
    enrolled_count: 0,
    disease_tags: parseDiseaseTagsFromSource(src['疾病三级标签']),
    treatment_lines: parseTreatmentLines(src['治疗线数']),
    study_cities: cities,
    treatment_approach: src['试验组治疗方案'] || null,
    brief_inclusion: src['简要入组条件'] || null,
    gene_requirement: (src['基因要求'] && `${src['基因要求']}` !== 'null') ? `${src['基因要求']}` : null,
    sponsor: src['申办方简称'] || null,
    hospitals: hospitals.length > 0 ? hospitals : null,
    patient_subsidy: (src['患者补助'] && `${src['患者补助']}` !== 'null') ? `${src['患者补助']}` : null,
    required_documents: (src['报名资料'] && `${src['报名资料']}` !== 'null') ? `${src['报名资料']}` : null
  };
};

const run = async () => {
  try {
    await testConnection();
    logger.info('开始导入试验数据...');

    if (!fs.existsSync(DATA_PATH)) {
      logger.error(`数据文件不存在: ${DATA_PATH}`);
      process.exit(1);
    }

    const fileContent = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
    const raw = Array.isArray(fileContent) ? fileContent : (fileContent['1.招募中项目'] || []);
    logger.info(`读取到 ${raw.length} 条试验数据`);

    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const src of raw) {
      try {
        const data = mapTrial(src);
        const [, isNew] = await Trial.upsert(data);
        if (isNew) created += 1;
        else updated += 1;
      } catch (err) {
        errors += 1;
        logger.warn(`导入失败: ${src['项目编码']} - ${err.message}`);
      }
    }

    logger.info(`导入完成: 新增 ${created}, 更新 ${updated}, 失败 ${errors}`);
    process.exit(0);
  } catch (err) {
    logger.error('导入脚本异常:', err);
    process.exit(1);
  }
};

if (require.main === module) {
  run();
}

module.exports = { mapTrial, parseDiseaseTagsFromSource, parseTreatmentLines, parseCities };
