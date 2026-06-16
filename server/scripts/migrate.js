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
  // PRD-2026Q3 T1-3：多病历 active 切换 —— 列存在但可能未回填；回填由 SQL migration 完成。
  await ensureMrCol('is_active', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });

  // PRD-2026Q3 T1-3：is_active 一次性回填（对应 20260520_medical_records_active.sql）。
  // 触发条件：表里有 completed 记录，但没有任何 is_active=1 → 说明这是从老 schema
  // 升级上来的实例，需要把每个 user 最新一条 completed 记录置为 active。
  // 一旦回填完成（哪怕只有 1 条变 active），下次 migrate 就不再触发。
  // 应用层 controllers/medical.js 的 activateRecord 仍是切换 active 的唯一路径。
  try {
    const [activeRows] = await sequelize.query(
      "SELECT COUNT(*) AS c FROM medical_records WHERE is_active = 1"
    );
    const hasAnyActive = activeRows && activeRows[0] && Number(activeRows[0].c) > 0;
    if (!hasAnyActive) {
      const [eligibleRows] = await sequelize.query(
        "SELECT COUNT(*) AS c FROM medical_records WHERE deleted_at IS NULL AND status = 'completed'"
      );
      const eligible = eligibleRows && eligibleRows[0] && Number(eligibleRows[0].c) > 0;
      if (eligible) {
        await sequelize.query(`
          UPDATE medical_records mr
          JOIN (
            SELECT user_id, MAX(created_at) AS max_created
              FROM medical_records
             WHERE deleted_at IS NULL AND status = 'completed'
             GROUP BY user_id
          ) latest
            ON latest.user_id = mr.user_id
           AND latest.max_created = mr.created_at
             SET mr.is_active = 1
           WHERE mr.deleted_at IS NULL AND mr.status = 'completed'
        `);
        logger.info('medical_records.is_active 回填完成');
      }
    }
  } catch (e) {
    // 回填失败不阻塞 migrate；用户首次切换 active 时由 activateRecord 兜底
    logger.warn('medical_records.is_active 回填跳过：' + (e && e.message ? e.message : e));
  }
};

// PRD-2026Q4 T0-7：用户重复候选表（对应 20260513_user_dedup_candidates.sql）。
// scripts/oneoff/scan-duplicate-users.js 直接 INSERT IGNORE 进这张表，不创建表本身；
// 没有这一步，新实例上跑 dedup 扫描就会 "Table doesn't exist"。
// 表只在运营手工跑去重时写入，没有 Sequelize model 是合理的。
const ensureUserDedupCandidates = async () => {
  const qi = sequelize.getQueryInterface();
  const tables = await qi.showAllTables();
  if (tables.includes('user_dedup_candidates')) return;
  await qi.createTable('user_dedup_candidates', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    user_a_id: { type: DataTypes.STRING(64), allowNull: false },
    user_b_id: { type: DataTypes.STRING(64), allowNull: false },
    matched_field: { type: DataTypes.ENUM('phone', 'id_card'), allowNull: false },
    normalized_value: { type: DataTypes.STRING(64), allowNull: false },
    similarity_score: { type: DataTypes.DECIMAL(3, 2), allowNull: true, defaultValue: 1.00 },
    status: { type: DataTypes.ENUM('pending', 'merged', 'rejected'), allowNull: false, defaultValue: 'pending' },
    reviewed_by: { type: DataTypes.STRING(64), allowNull: true },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  });
  // UNIQUE(user_a_id, user_b_id, matched_field)：避免重复扫描时写入重复行
  try {
    await qi.addIndex('user_dedup_candidates',
      ['user_a_id', 'user_b_id', 'matched_field'],
      { unique: true, name: 'uk_pair' });
  } catch (_) { /* 已存在则忽略 */ }
  try {
    await qi.addIndex('user_dedup_candidates',
      ['status', 'created_at'],
      { name: 'idx_status' });
  } catch (_) { /* 已存在则忽略 */ }
  logger.info('创建表: user_dedup_candidates');
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
  // 匹配热路径：getUserCompletedRecords 的 WHERE user_id=? AND deleted_at IS NULL AND status='completed'
  // —— 第三列加 status 做覆盖，避免回表过滤状态（每次匹配请求都命中这条查询）。
  await safeAddIndex('medical_records', ['user_id', 'deleted_at', 'status'], { name: 'idx_record_user_deleted_status' });
  // PRD-2026Q3 T1-3：matches 默认基线选择主路径
  await safeAddIndex('medical_records', ['user_id', 'is_active'], { name: 'idx_user_active' });
  // Admin H5 后台：按用户 / 状态 / 日期筛选上传数据的主路径索引
  await safeAddIndex('medical_records', ['user_id', 'deleted_at', 'created_at'], { name: 'idx_record_user_deleted_created' });
  await safeAddIndex('medical_records', ['status', 'deleted_at', 'created_at'], { name: 'idx_record_status_deleted_created' });
  await safeAddIndex('trial_applications', ['user_id']);
  await safeAddIndex('trial_applications', ['trial_id']);
  await safeAddIndex('trial_applications', ['status']);
  await safeAddIndex('trial_applications', ['created_at']);
  await safeAddIndex('trials', ['status']);
  // PRD-2026Q2 §2.4：试验新鲜度 —— 每日巡检 "招募中 + 过期" 查询主路径
  await safeAddIndex('trials', ['status', 'last_verified_at'], { name: 'idx_trials_status_verified' });
  // PRD-2026Q3 T0-1：CRO 跨试验导出主路径 —— trial_id IN (...) AND status IN (...) AND created_at 范围
  await safeAddIndex('trial_applications', ['trial_id', 'status', 'created_at'], { name: 'idx_trial_status_created' });
};

// PRD-2026Q3 T1-6：admin_audit_log 加 role 列 + 索引
const ensureAdminAuditLogRole = async () => {
  const qi = sequelize.getQueryInterface();
  const tables = await qi.showAllTables();
  if (!tables.includes('admin_audit_log')) {
    // 表本身由 sync() 创建，这里 noop。
    return;
  }
  const desc = await qi.describeTable('admin_audit_log');
  if (!desc.role) {
    await qi.addColumn('admin_audit_log', 'role', {
      type: DataTypes.STRING(32),
      allowNull: true,
      comment: '操作时的角色：super / ops / cro_liaison'
    });
    logger.info('新增列: admin_audit_log.role');
  }
  try {
    await qi.addIndex('admin_audit_log', ['role', 'created_at'], { name: 'idx_role_created' });
    logger.info('索引已创建: admin_audit_log(role,created_at)');
  } catch (e) {
    if (!String(e.message || '').toLowerCase().includes('duplicate')) {
      logger.warn('admin_audit_log idx_role_created 创建跳过:', { error: e.message });
    }
  }
};

// PRD-2026Q3 T0-2：申请状态机事件表 + trial_applications.status 枚举扩展
const ensureApplicationStatusEvent = async () => {
  const qi = sequelize.getQueryInterface();
  const tables = await qi.showAllTables();
  if (!tables.includes('application_status_event')) {
    await qi.createTable('application_status_event', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      application_id: { type: DataTypes.STRING(64), allowNull: false },
      from_status: { type: DataTypes.STRING(32), allowNull: false },
      to_status: { type: DataTypes.STRING(32), allowNull: false },
      actor_type: { type: DataTypes.ENUM('user', 'cro', 'admin', 'system'), allowNull: false },
      actor_id: { type: DataTypes.STRING(64), allowNull: true },
      reason: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    });
    await qi.addIndex('application_status_event', ['application_id', 'created_at'], { name: 'idx_app_created' });
    await qi.addIndex('application_status_event', ['to_status', 'created_at'], { name: 'idx_to_status_created' });
    await qi.addIndex('application_status_event', ['actor_type', 'actor_id'], { name: 'idx_actor' });
    logger.info('创建表: application_status_event');
  }

  // 扩 trial_applications.status enum：加 screened / withdrawn。
  // sequelize.changeColumn 会下发 MODIFY COLUMN，幂等。
  try {
    await qi.changeColumn('trial_applications', 'status', {
      type: DataTypes.ENUM('pending', 'contacted', 'screened', 'enrolled', 'rejected', 'cancelled', 'withdrawn'),
      defaultValue: 'pending'
    });
    logger.info('对齐枚举: trial_applications.status (+screened, +withdrawn)');
  } catch (e) {
    // 已对齐时 MySQL 不报错；其它错误仍要抛
    if (!String(e.message || '').toLowerCase().includes('already')) {
      logger.warn('trial_applications.status 枚举对齐跳过:', { error: e.message });
    }
  }
};

// PRD-2026Q3 T1-1：试验抓取变更日志 + DLQ + trials.nct_id
const ensureTrialCrawlerTables = async () => {
  const qi = sequelize.getQueryInterface();
  const tables = await qi.showAllTables();

  if (!tables.includes('trial_change_log')) {
    await qi.createTable('trial_change_log', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      trial_id: { type: DataTypes.STRING(64), allowNull: false },
      nct_id: { type: DataTypes.STRING(32), allowNull: true },
      field: { type: DataTypes.STRING(64), allowNull: false },
      old_value: { type: DataTypes.STRING(1024), allowNull: true },
      new_value: { type: DataTypes.STRING(1024), allowNull: true },
      source: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'clinicaltrials_v2' },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    });
    await qi.addIndex('trial_change_log', ['trial_id', 'created_at'], { name: 'idx_trial_created' });
    await qi.addIndex('trial_change_log', ['created_at'], { name: 'idx_created' });
    logger.info('创建表: trial_change_log');
  }

  if (!tables.includes('trial_crawl_failures')) {
    await qi.createTable('trial_crawl_failures', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      trial_id: { type: DataTypes.STRING(64), allowNull: true },
      nct_id: { type: DataTypes.STRING(32), allowNull: true },
      reason: { type: DataTypes.STRING(256), allowNull: false },
      payload: { type: DataTypes.JSON, allowNull: true },
      attempt_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      last_attempt_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      resolved_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    });
    await qi.addIndex('trial_crawl_failures', ['resolved_at'], { name: 'idx_resolved' });
    await qi.addIndex('trial_crawl_failures', ['nct_id'], { name: 'idx_nct' });
    logger.info('创建表: trial_crawl_failures');
  }

  // trials.nct_id 补列（idempotent）
  try {
    const cols = await qi.describeTable('trials');
    if (!cols.nct_id) {
      await qi.addColumn('trials', 'nct_id', {
        type: DataTypes.STRING(32), allowNull: true
      });
      try { await qi.addIndex('trials', ['nct_id'], { name: 'idx_nct_id' }); } catch (_) {}
      logger.info('trials.nct_id 已新增');
    }
  } catch (e) {
    logger.warn('trials.nct_id 检查失败', { err: e.message });
  }
};

// PRD-2026Q4 T0-1：试验字段变更人工复核队列
// 上游 ClinicalTrials.gov 字段 null 不再静默覆盖，由本表挂起等运营复核。
const ensureTrialFieldChangeReview = async () => {
  const qi = sequelize.getQueryInterface();
  const tables = await qi.showAllTables();
  if (tables.includes('trial_field_change_review')) return;
  await qi.createTable('trial_field_change_review', {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    trial_id: { type: DataTypes.STRING(64), allowNull: false },
    nct_id: { type: DataTypes.STRING(32), allowNull: true },
    field: { type: DataTypes.STRING(64), allowNull: false },
    old_value: { type: DataTypes.JSON, allowNull: true },
    new_value: { type: DataTypes.JSON, allowNull: true },
    null_source: { type: DataTypes.ENUM('explicit', 'missing'), allowNull: true },
    change_kind: { type: DataTypes.STRING(64), allowNull: false },
    status: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), allowNull: false, defaultValue: 'pending' },
    reviewer_id: { type: DataTypes.STRING(64), allowNull: true },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
    reviewer_note: { type: DataTypes.STRING(512), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  });
  await qi.addIndex('trial_field_change_review', ['status', 'created_at'], { name: 'idx_status_created' });
  await qi.addIndex('trial_field_change_review', ['trial_id', 'field'], { name: 'idx_trial_field' });
  logger.info('创建表: trial_field_change_review');
};

// PRD-2026Q3 T0-1：CRO 导出审计日志表（cro_export_log）
const ensureCroExportLog = async () => {
  const qi = sequelize.getQueryInterface();
  const tables = await qi.showAllTables();
  if (tables.includes('cro_export_log')) return;
  await qi.createTable('cro_export_log', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    cro_id: { type: DataTypes.STRING(64), allowNull: false },
    trial_ids: { type: DataTypes.JSON, allowNull: false },
    fields: { type: DataTypes.JSON, allowNull: false },
    format: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'csv' },
    row_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    unmask: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    ip: { type: DataTypes.STRING(64), allowNull: true },
    user_agent: { type: DataTypes.STRING(255), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  });
  await qi.addIndex('cro_export_log', ['cro_id', 'created_at'], { name: 'idx_cro_created' });
  logger.info('创建表: cro_export_log');
};

// PRD-2026Q4 T0-7：NCT ID 数据库 CHECK 约束（双层防御之 DB 层）
// 对应 scripts/migrations/20260513_nct_id_check.sql。
// MySQL 8.0.16+ 才会强制 CHECK，旧版本不会报错也不会强制（功能降级，不影响业务）。
// 幂等做法：
//   1. 先查 INFORMATION_SCHEMA.CHECK_CONSTRAINTS 看 chk_nct_format 是否存在
//   2. 不存在再 ALTER TABLE … ADD CONSTRAINT
// 任何错误都吞成 warning：app 层 models/trial.js 的 isNctFormat validator 是主防线，
// 这里仅作 belt-and-suspenders；migrate 不能因为 DB 层兜底失败而中止整个流程。
const ensureNctIdConstraint = async () => {
  try {
    const [rows] = await sequelize.query(
      `SELECT 1
         FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND CONSTRAINT_NAME = 'chk_nct_format'
        LIMIT 1`
    );
    if (Array.isArray(rows) && rows.length > 0) return;
    await sequelize.query(
      "ALTER TABLE trials ADD CONSTRAINT chk_nct_format CHECK (nct_id IS NULL OR nct_id REGEXP '^NCT[0-9]{8}$')"
    );
    logger.info('已添加 trials.nct_id CHECK 约束 chk_nct_format');
  } catch (e) {
    // MySQL <8.0.16 / MariaDB 不支持 / 已存在但表名重复等情况都吞掉
    logger.warn('ensureNctIdConstraint 跳过：' + (e && e.message ? e.message : e));
  }
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
      // PRD-2026Q3 T1-4：CPA 计费配置
      cpa_price: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      cpa_qualified_status: { type: DataTypes.ENUM('screened', 'enrolled'), allowNull: false, defaultValue: 'screened' },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    });
    logger.info('创建表: cro_companies');
  } else {
    // PRD-2026Q3 T1-4：补列（idempotent）
    const cols = await qi.describeTable('cro_companies');
    if (!cols.cpa_price) {
      await qi.addColumn('cro_companies', 'cpa_price', {
        type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0
      });
      logger.info('cro_companies.cpa_price 已新增');
    }
    if (!cols.cpa_qualified_status) {
      await qi.addColumn('cro_companies', 'cpa_qualified_status', {
        type: DataTypes.ENUM('screened', 'enrolled'), allowNull: false, defaultValue: 'screened'
      });
      logger.info('cro_companies.cpa_qualified_status 已新增');
    }
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
    // PRD-2026Q3 T0-1：CRO 导出审计日志
    await ensureCroExportLog();
    // PRD-2026Q3 T0-2：申请状态机事件表 + status enum 扩展（screened / withdrawn）
    await ensureApplicationStatusEvent();
    // PRD-2026Q3 T1-6：admin_audit_log.role
    await ensureAdminAuditLogRole();
    // PRD-2026Q3 T1-1：试验抓取相关表
    await ensureTrialCrawlerTables();
    // PRD-2026Q4 T0-1：trialCrawler null 守门复核队列
    await ensureTrialFieldChangeReview();
    // PRD-2026Q4 T0-7：NCT ID DB 层 CHECK 约束（兜底，主防线在 models/trial.js）
    await ensureNctIdConstraint();
    // PRD-2026Q4 T0-7：scan-duplicate-users 落地表
    await ensureUserDedupCandidates();

    logger.info('数据库迁移完成');
    process.exit(0);
  } catch (error) {
    logger.error('数据库迁移失败:', error);
    process.exit(1);
  }
};

runMigrations();
