const { User, MedicalRecord, TrialApplication, Trial } = require('../models');
const logger = require('../utils/logger');

// 种子数据
const seedData = {
  users: [
    {
      id: 'user_demo_001',
      openid: 'openid_demo_001',
      nickname: '演示用户',
      avatar_url: 'https://example.com/avatar1.jpg',
      phone: '13800138001'
    },
    {
      id: 'user_demo_002',
      openid: 'openid_demo_002',
      nickname: '测试患者',
      avatar_url: 'https://example.com/avatar2.jpg',
      phone: '13800138002'
    }
  ],

  medicalRecords: [
    {
      id: 'rec_demo_001',
      user_id: 'user_demo_001',
      type: '出院小结',
      file_key: 'uploads/user_demo_001/record1.jpg',
      file_hash: 'hash123456',
      file_size: 1024000,
      status: 'completed',
      diagnosis: '非小细胞肺癌',
      stage: 'IV期',
      gene_mutation: 'EGFR 19del',
      treatment: '化疗2周期',
      structured: {
        diagnosis: { value: '非小细胞肺癌', confidence: 0.95 },
        stage: { value: 'IV期', confidence: 0.92 },
        gene_mutation: { value: 'EGFR 19del', confidence: 0.88 }
      }
    },
    {
      id: 'rec_demo_002',
      user_id: 'user_demo_001',
      type: '基因检测',
      file_key: 'uploads/user_demo_001/gene_test.jpg',
      file_hash: 'hash789012',
      file_size: 2048000,
      status: 'completed',
      diagnosis: 'EGFR突变阳性',
      gene_mutation: 'EGFR L858R',
      structured: {
        diagnosis: { value: 'EGFR突变阳性', confidence: 0.98 },
        gene_mutation: { value: 'EGFR L858R', confidence: 0.95 }
      }
    }
  ],

  trials: [
    {
      id: 'trial_001',
      name: 'PD-1抑制剂治疗晚期非小细胞肺癌II期临床试验',
      phase: 'II期',
      type: '干预性研究',
      indication: '非小细胞肺癌（EGFR突变阳性）',
      institution: '复旦大学附属肿瘤医院',
      location: '上海市徐汇区',
      contact_phone: '021-12345678',
      description: '评估PD-1抑制剂在晚期非小细胞肺癌患者中的疗效和安全性',
      inclusion_criteria: ['年龄18-75岁', '确诊晚期NSCLC', 'EGFR突变阳性'],
      exclusion_criteria: ['脑转移', '严重肝肾功能不全'],
      status: 'recruiting',
      target_count: 100,
      enrolled_count: 12
    }
  ],

  applications: [
    {
      id: 'app_demo_001',
      user_id: 'user_demo_001',
      trial_id: 'trial_001',
      record_ids: JSON.stringify(['rec_demo_001']),
      status: 'pending',
      remark: '希望尽快入组'
    }
  ]
};

/**
 * 运行种子数据
 */
const runSeed = async () => {
  try {
    logger.info('开始导入种子数据...');

    // 导入用户
    for (const user of seedData.users) {
      await User.findOrCreate({
        where: { id: user.id },
        defaults: user
      });
    }
    logger.info(`导入 ${seedData.users.length} 个用户`);

    // 导入病历
    for (const record of seedData.medicalRecords) {
      await MedicalRecord.findOrCreate({
        where: { id: record.id },
        defaults: record
      });
    }
    logger.info(`导入 ${seedData.medicalRecords.length} 条病历`);

    // 导入试验
    for (const trial of seedData.trials) {
      await Trial.findOrCreate({
        where: { id: trial.id },
        defaults: trial
      });
    }
    logger.info(`导入 ${seedData.trials.length} 条试验`);

    // 导入报名
    for (const app of seedData.applications) {
      await TrialApplication.findOrCreate({
        where: { id: app.id },
        defaults: app
      });
    }
    logger.info(`导入 ${seedData.applications.length} 条报名`);

    logger.info('种子数据导入完成！');
  } catch (error) {
    logger.error('种子数据导入失败:', error);
    throw error;
  }
};

/**
 * 清理种子数据
 */
const cleanSeed = async () => {
  try {
    logger.info('开始清理种子数据...');

    await TrialApplication.destroy({ where: { id: seedData.applications.map(a => a.id) } });
    await MedicalRecord.destroy({ where: { id: seedData.medicalRecords.map(r => r.id) } });
    await Trial.destroy({ where: { id: seedData.trials.map(t => t.id) } });
    await User.destroy({ where: { id: seedData.users.map(u => u.id) } });

    logger.info('种子数据清理完成！');
  } catch (error) {
    logger.error('种子数据清理失败:', error);
    throw error;
  }
};

// 如果直接运行此脚本
if (require.main === module) {
  const action = process.argv[2] || 'run';
  
  if (action === 'run') {
    runSeed().then(() => process.exit(0)).catch(() => process.exit(1));
  } else if (action === 'clean') {
    cleanSeed().then(() => process.exit(0)).catch(() => process.exit(1));
  } else {
    console.log('用法: node seed.js [run|clean]');
    process.exit(1);
  }
}

module.exports = { runSeed, cleanSeed, seedData };
