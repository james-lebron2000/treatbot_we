const { sequelize, testConnection } = require('../config/database');
const { DataTypes } = require('sequelize');
const logger = require('../utils/logger');
require('../models');

const ensureTrialApplicationColumns = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const table = await queryInterface.describeTable('trial_applications');

  const ensureColumn = async (name, definition) => {
    if (table[name]) {
      return;
    }
    await queryInterface.addColumn('trial_applications', name, definition);
    logger.info(`新增字段: trial_applications.${name}`);
  };

  await ensureColumn('contact_name', {
    type: DataTypes.STRING(64),
    allowNull: true
  });
  await ensureColumn('contact_phone', {
    type: DataTypes.STRING(32),
    allowNull: true
  });
  await ensureColumn('disease_snapshot', {
    type: DataTypes.STRING(256),
    allowNull: true
  });
  await ensureColumn('client_source', {
    type: DataTypes.STRING(32),
    allowNull: true
  });
};

const runMigrations = async () => {
  try {
    // 测试连接
    await testConnection();
    
    // 同步模型（自动创建表）
    // 注意：生产环境建议使用真实的迁移工具（如 sequelize-cli）
    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    await ensureTrialApplicationColumns();
    
    logger.info('数据库迁移完成');
    process.exit(0);
  } catch (error) {
    logger.error('数据库迁移失败:', error);
    process.exit(1);
  }
};

runMigrations();
