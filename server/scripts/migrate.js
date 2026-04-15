const { sequelize, testConnection } = require('../config/database');
const { DataTypes } = require('sequelize');
const logger = require('../utils/logger');
require('../models');

const ensureTrialMatchingColumns = async () => {
  const queryInterface = sequelize.getQueryInterface();

  // Trial 表新增列
  const trialTable = await queryInterface.describeTable('trials');
  const ensureTrialCol = async (name, definition) => {
    if (trialTable[name]) return;
    await queryInterface.addColumn('trials', name, definition);
    logger.info(`新增字段: trials.${name}`);
  };

  await ensureTrialCol('disease_tags', { type: DataTypes.JSON, allowNull: true });
  await ensureTrialCol('treatment_lines', { type: DataTypes.JSON, allowNull: true });
  await ensureTrialCol('study_cities', { type: DataTypes.JSON, allowNull: true });
  await ensureTrialCol('treatment_approach', { type: DataTypes.STRING(128), allowNull: true });
  await ensureTrialCol('brief_inclusion', { type: DataTypes.TEXT, allowNull: true });
  await ensureTrialCol('structured_inclusion', { type: DataTypes.JSON, allowNull: true });
  await ensureTrialCol('gene_requirement', { type: DataTypes.STRING(256), allowNull: true });
  await ensureTrialCol('sponsor', { type: DataTypes.STRING(128), allowNull: true });
  await ensureTrialCol('hospitals', { type: DataTypes.JSON, allowNull: true });
  await ensureTrialCol('patient_subsidy', { type: DataTypes.TEXT, allowNull: true });
  await ensureTrialCol('required_documents', { type: DataTypes.TEXT, allowNull: true });

  // MedicalRecord 表新增列
  const mrTable = await queryInterface.describeTable('medical_records');
  const ensureMrCol = async (name, definition) => {
    if (mrTable[name]) return;
    await queryInterface.addColumn('medical_records', name, definition);
    logger.info(`新增字段: medical_records.${name}`);
  };

  await ensureMrCol('treatment_line', { type: DataTypes.INTEGER, allowNull: true });
  await ensureMrCol('pdl1', { type: DataTypes.STRING(64), allowNull: true });
};

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
  await ensureColumn('notes', {
    type: DataTypes.JSON,
    allowNull: true
  });
};

const ensureIndexes = async () => {
  const qi = sequelize.getQueryInterface();

  const safeAddIndex = async (table, fields, options = {}) => {
    try {
      await qi.addIndex(table, fields, options);
      logger.info(`索引已创建: ${table}(${fields.join(',')})`);
    } catch (e) {
      if (e.message && e.message.includes('Duplicate')) return;
      throw e;
    }
  };

  await safeAddIndex('medical_records', ['user_id']);
  await safeAddIndex('medical_records', ['status']);
  await safeAddIndex('medical_records', ['created_at']);
  await safeAddIndex('trial_applications', ['user_id']);
  await safeAddIndex('trial_applications', ['trial_id']);
  await safeAddIndex('trial_applications', ['status']);
  await safeAddIndex('trial_applications', ['created_at']);
  await safeAddIndex('trials', ['status']);
};

const ensureCroCompanyTable = async () => {
  const qi = sequelize.getQueryInterface();
  const tables = await qi.showAllTables();
  if (!tables.includes('cro_companies')) {
    await qi.createTable('cro_companies', {
      id: { type: DataTypes.STRING(64), primaryKey: true },
      name: { type: DataTypes.STRING(128), allowNull: false },
      contact_name: { type: DataTypes.STRING(64), allowNull: true },
      email: { type: DataTypes.STRING(128), allowNull: false, unique: true },
      password_hash: { type: DataTypes.STRING(256), allowNull: false },
      trial_ids: { type: DataTypes.JSON, allowNull: true },
      status: { type: DataTypes.ENUM('active', 'disabled'), defaultValue: 'active' },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    });
    logger.info('创建表: cro_companies');
  }
};

const runMigrations = async () => {
  try {
    // 测试连接
    await testConnection();
    
    // 同步模型（自动创建表）
    // 注意：生产环境建议使用真实的迁移工具（如 sequelize-cli）
    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    await ensureTrialMatchingColumns();
    await ensureTrialApplicationColumns();
    await ensureIndexes();
    await ensureCroCompanyTable();

    logger.info('数据库迁移完成');
    process.exit(0);
  } catch (error) {
    logger.error('数据库迁移失败:', error);
    process.exit(1);
  }
};

runMigrations();
