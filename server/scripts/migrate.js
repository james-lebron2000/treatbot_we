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
  // PRD-2026Q2 §2.4：试验新鲜度
  await ensureTrialCol('last_verified_at', { type: DataTypes.DATE, allowNull: true });
  await ensureTrialCol('freshness_score', { type: DataTypes.INTEGER, allowNull: true, defaultValue: 100 });

  // MedicalRecord 表新增列
  const mrTable = await queryInterface.describeTable('medical_records');
  const ensureMrCol = async (name, definition) => {
    if (mrTable[name]) return;
    await queryInterface.addColumn('medical_records', name, definition);
    logger.info(`新增字段: medical_records.${name}`);
  };

  await ensureMrCol('treatment_line', { type: DataTypes.INTEGER, allowNull: true });
  await ensureMrCol('pdl1', { type: DataTypes.STRING(64), allowNull: true });
  // PRD-2026Q2 §3.5：多病历管理页软删除字段（对应 20260423_medical_record_soft_delete.sql）
  await ensureMrCol('deleted_at', { type: DataTypes.DATE, allowNull: true, defaultValue: null });
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

// Q3-红线 §A.2：用户合规相关表/列幂等补齐（user_consent / user_action_log / users.deleted_*）
// 为什么单写一段而不是依赖 sequelize.sync({alter:true})：
//   - 生产环境 NODE_ENV=production，alter=false，模型即使加列也不会动 DB；
//   - 显式 ensureCol 让 W4 / W5 灰度发布时可单点排查。
const ensureUserComplianceColumns = async () => {
  const queryInterface = sequelize.getQueryInterface();

  // users 表：注销标记 + 真名清空
  const userTable = await queryInterface.describeTable('users');
  const ensureUserCol = async (name, definition) => {
    if (userTable[name]) return;
    await queryInterface.addColumn('users', name, definition);
    logger.info(`新增字段: users.${name}`);
  };
  await ensureUserCol('real_name', { type: DataTypes.STRING(64), allowNull: true });
  await ensureUserCol('password_hash', { type: DataTypes.STRING(256), allowNull: true });
  await ensureUserCol('deleted_at', { type: DataTypes.DATE, allowNull: true, defaultValue: null });
  await ensureUserCol('deleted_reason', { type: DataTypes.STRING(64), allowNull: true });

  // user_consent / user_action_log 表的存在性 —— sequelize.sync 会建表，
  // 但若 MIGRATE_SKIP_SYNC=true 时仍保险地用 createTable 做兜底。
  const tables = await queryInterface.showAllTables();
  if (!tables.includes('user_consent')) {
    await queryInterface.createTable('user_consent', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      user_id: { type: DataTypes.STRING(64), allowNull: false },
      policy_version: { type: DataTypes.STRING(32), allowNull: false },
      scope: { type: DataTypes.ENUM('upload', 'match', 'share_with_cro'), allowNull: false },
      agreed_at: { type: DataTypes.DATE, allowNull: false },
      ip: { type: DataTypes.STRING(64), allowNull: true },
      user_agent: { type: DataTypes.STRING(255), allowNull: true }
    });
    logger.info('创建表: user_consent');
  }
  if (!tables.includes('user_action_log')) {
    await queryInterface.createTable('user_action_log', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      user_id: { type: DataTypes.STRING(64), allowNull: false },
      action: { type: DataTypes.STRING(64), allowNull: false },
      metadata: { type: DataTypes.JSON, allowNull: true },
      ip: { type: DataTypes.STRING(64), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    });
    logger.info('创建表: user_action_log');
  }
};

// Q3-红线 §B.2：user_funnel_event 表的幂等补齐
// 与 user_action_log 类似，sequelize.sync 会建表，但 MIGRATE_SKIP_SYNC=true 时
// 走这里兜底；同时索引由模型 indexes 配置在 sync 时创建。
const ensureFunnelEventTable = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const tables = await queryInterface.showAllTables();
  if (!tables.includes('user_funnel_event')) {
    await queryInterface.createTable('user_funnel_event', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      user_id: { type: DataTypes.STRING(64), allowNull: true },
      anon_id: { type: DataTypes.STRING(64), allowNull: true },
      event: { type: DataTypes.STRING(32), allowNull: false },
      metadata: { type: DataTypes.JSON, allowNull: true },
      ip: { type: DataTypes.STRING(64), allowNull: true },
      user_agent: { type: DataTypes.STRING(255), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    });
    logger.info('创建表: user_funnel_event');
  }
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
  // PRD-2026Q2 §3.5：多病历管理页 —— "某用户未删除病历"主路径索引
  await safeAddIndex('medical_records', ['user_id', 'deleted_at'], { name: 'idx_user_deleted' });
  await safeAddIndex('trial_applications', ['user_id']);
  await safeAddIndex('trial_applications', ['trial_id']);
  await safeAddIndex('trial_applications', ['status']);
  await safeAddIndex('trial_applications', ['created_at']);
  await safeAddIndex('trials', ['status']);
  // PRD-2026Q2 §2.4：试验新鲜度 —— 每日巡检 "招募中 + 过期" 查询主路径
  await safeAddIndex('trials', ['status', 'last_verified_at'], { name: 'idx_trials_status_verified' });
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

    // sync 策略：
    //   - dev（NODE_ENV=development）：sync({alter:true}) 自动对齐 model 到 DB schema，便于本地迭代。
    //   - 其它环境：sync() 仅创建缺失的表，不会修改或删除任何已有列（idempotent）。
    //   - 若需要完全由 SQL 迁移掌控，设置 MIGRATE_SKIP_SYNC=true（CI / 灰度环境用）。
    // 所有实际的 schema 变更必须通过下方 ensureX 函数或 server/scripts/migrations/*.sql 完成。
    const skipSync = String(process.env.MIGRATE_SKIP_SYNC || '').toLowerCase() === 'true';
    if (skipSync) {
      logger.info('migrate: MIGRATE_SKIP_SYNC=true，跳过 sequelize.sync，仅执行显式 ensureX 步骤');
    } else {
      const alter = process.env.NODE_ENV === 'development';
      logger.info(`migrate: sequelize.sync({alter: ${alter}}) NODE_ENV=${process.env.NODE_ENV || 'undefined'}`);
      await sequelize.sync({ alter });
    }

    await ensureTrialMatchingColumns();
    await ensureTrialApplicationColumns();
    await ensureUserComplianceColumns();
    await ensureFunnelEventTable();
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
