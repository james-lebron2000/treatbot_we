/**
 * 将 structured_inclusion.json 的解析结果写入 Trial 表
 * 用法: node scripts/loadStructuredInclusion.js
 */
const path = require('path');
const fs = require('fs');
const dotenvPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(dotenvPath)) require('dotenv').config({ path: dotenvPath });

const { sequelize, testConnection } = require('../config/database');
const { Trial } = require('../models');
const logger = require('../utils/logger');

const DATA_PATH = path.join(__dirname, '..', 'data', 'structured_inclusion.json');

const run = async () => {
  await testConnection();

  if (!fs.existsSync(DATA_PATH)) {
    console.error(`文件不存在: ${DATA_PATH}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  const entries = Object.entries(data).filter(([, v]) => v && typeof v === 'object' && !v._error);
  console.log(`共 ${entries.length} 条有效解析结果`);

  let updated = 0;
  let notFound = 0;

  for (const [trialId, structured] of entries) {
    const [affectedRows] = await Trial.update(
      { structured_inclusion: structured },
      { where: { id: trialId } }
    );
    if (affectedRows > 0) {
      updated++;
    } else {
      notFound++;
    }
  }

  console.log(`完成: 更新 ${updated} 条, 未找到 ${notFound} 条`);
  process.exit(0);
};

run().catch((err) => {
  console.error('脚本异常:', err);
  process.exit(1);
});
