const { sequelize, testConnection } = require('../config/database');
const User = require('./user');
const Trial = require('./trial');
// Q3-红线 §B.2：漏斗埋点事件模型
const UserFunnelEvent = require('./userFunnelEvent');
// PRD-2026Q4 T0-1：trialCrawler null 守门复核队列
const TrialFieldChangeReview = require('./trialFieldChangeReview');
// PRD-2026Q4 T0-10：业务漏斗事件（与 userFunnelEvent 不同：8-event 异步队列模式）
const FunnelEvent = require('./funnelEvent');

// 病历模型
const MedicalRecord = sequelize.define('MedicalRecord', {
  id: {
    type: require('sequelize').DataTypes.STRING(64),
    primaryKey: true,
    defaultValue: () => `rec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  },
  user_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: false
  },
  type: {
    type: require('sequelize').DataTypes.STRING(32),
    allowNull: false
  },
  file_key: {
    type: require('sequelize').DataTypes.STRING(256),
    allowNull: false
  },
  file_hash: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: false
  },
  file_size: {
    type: require('sequelize').DataTypes.INTEGER.UNSIGNED
  },
  status: {
    type: require('sequelize').DataTypes.ENUM('pending', 'running', 'completed', 'error'),
    defaultValue: 'pending'
  },
  diagnosis: {
    type: require('sequelize').DataTypes.STRING(256)
  },
  stage: {
    type: require('sequelize').DataTypes.STRING(32)
  },
  gene_mutation: {
    type: require('sequelize').DataTypes.STRING(256)
  },
  treatment: {
    type: require('sequelize').DataTypes.TEXT
  },
  treatment_line: {
    type: require('sequelize').DataTypes.INTEGER,
    allowNull: true
  },
  pdl1: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: true
  },
  structured: {
    type: require('sequelize').DataTypes.JSON
  },
  remark: {
    type: require('sequelize').DataTypes.TEXT
  },
  // PRD-2026Q2 §3.5：多病历管理页 —— 软删除时间戳，NULL 代表有效。
  // 所有面向用户的 list / find 都需要加 `where: { deleted_at: null }`。
  deleted_at: {
    type: require('sequelize').DataTypes.DATE,
    allowNull: true,
    defaultValue: null
  },
  // PRD-2026Q3 T1-3：多病历 active 切换
  // 同一 user 全局唯一为 1（应用层在 activateRecord 事务里保证；MySQL 部分唯一索引
  // 不直接支持，靠 transaction 串行化）。/api/matches 默认按 is_active=1 选基线。
  is_active: {
    type: require('sequelize').DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  tableName: 'medical_records',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

// 报名模型
const TrialApplication = sequelize.define('TrialApplication', {
  id: {
    type: require('sequelize').DataTypes.STRING(64),
    primaryKey: true,
    defaultValue: () => `app_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  },
  user_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: false
  },
  trial_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: false
  },
  record_ids: {
    type: require('sequelize').DataTypes.JSON,
    allowNull: false
  },
  // PRD-2026Q3 T0-2：扩 'screened' (CRO 通过初筛) 与 'withdrawn' (患者撤回)。
  // 'cancelled' 保留兼容存量数据，语义等同 'withdrawn'。
  status: {
    type: require('sequelize').DataTypes.ENUM('pending', 'contacted', 'screened', 'enrolled', 'rejected', 'cancelled', 'withdrawn'),
    defaultValue: 'pending'
  },
  remark: {
    type: require('sequelize').DataTypes.TEXT
  },
  contact_name: {
    type: require('sequelize').DataTypes.STRING(64)
  },
  contact_phone: {
    type: require('sequelize').DataTypes.STRING(32)
  },
  disease_snapshot: {
    type: require('sequelize').DataTypes.STRING(256)
  },
  client_source: {
    type: require('sequelize').DataTypes.STRING(32)
  },
  idempotency_key: {
    type: require('sequelize').DataTypes.STRING(64),
    unique: true
  },
  notes: {
    type: require('sequelize').DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: '沟通记录 [{content, operator, createdAt}]'
  }
}, {
  tableName: 'trial_applications',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

// CRO 公司账号
const CroCompany = sequelize.define('CroCompany', {
  id: {
    type: require('sequelize').DataTypes.STRING(64),
    primaryKey: true,
    defaultValue: () => `cro_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  },
  name: {
    type: require('sequelize').DataTypes.STRING(128),
    allowNull: false,
    comment: '公司名称'
  },
  contact_name: {
    type: require('sequelize').DataTypes.STRING(64),
    comment: '联系人姓名'
  },
  email: {
    type: require('sequelize').DataTypes.STRING(128),
    allowNull: false,
    unique: true,
    comment: '登录邮箱'
  },
  password_hash: {
    type: require('sequelize').DataTypes.STRING(256),
    allowNull: false,
    comment: 'bcrypt 密码哈希'
  },
  trial_ids: {
    type: require('sequelize').DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: '负责的试验 ID 列表'
  },
  status: {
    type: require('sequelize').DataTypes.ENUM('active', 'disabled'),
    defaultValue: 'active'
  },
  // PRD-2026Q3 T1-4：CPA 计费单价（单位：元 / 合格线索）
  cpa_price: {
    type: require('sequelize').DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    comment: '每条合格线索单价（元）'
  },
  // 哪个 status 算"合格"：通常 screened（CRO 已沟通确认）或 enrolled（已入组）
  cpa_qualified_status: {
    type: require('sequelize').DataTypes.ENUM('screened', 'enrolled'),
    allowNull: false,
    defaultValue: 'screened',
    comment: 'CPA 计费触发的合格状态'
  }
}, {
  tableName: 'cro_companies',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

// PRD-2026Q2 §2.3：Admin 审计日志模型
// 对应迁移 scripts/migrations/20260420_admin_audit_log.sql，
// 配合 middleware/auditLog.js 在每次 admin 请求 finish 后写一条记录。
const AdminAuditLog = sequelize.define('AdminAuditLog', {
  id: {
    type: require('sequelize').DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true
  },
  admin_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: false,
    comment: '执行操作的管理员 user id'
  },
  // PRD-2026Q3 T1-6：写入时的角色快照，便于离职后 username 复用 / RBAC 变更后的回溯审计
  role: {
    type: require('sequelize').DataTypes.STRING(32),
    allowNull: true,
    comment: '操作时的角色：super / ops / cro_liaison'
  },
  action: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: false,
    comment: '操作类型，如 view_users / reveal_field_phone'
  },
  target_type: {
    type: require('sequelize').DataTypes.STRING(32),
    allowNull: true,
    comment: '目标资源类型：user / record / application'
  },
  target_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: true,
    comment: '目标资源 id'
  },
  query_summary: {
    type: require('sequelize').DataTypes.TEXT,
    allowNull: true,
    comment: '查询摘要，JSON.stringify({query, params, bodyKeys}) 截 1000 字'
  },
  ip: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: true
  },
  user_agent: {
    type: require('sequelize').DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'admin_audit_log',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { name: 'idx_admin_created', fields: ['admin_id', 'created_at'] },
    { name: 'idx_target', fields: ['target_type', 'target_id'] }
  ]
});

// PRD-2026Q2 §3.2：OCR 任务 DLQ 模型，字段对齐 20260422_ocr_job_failures.sql
// 仅在 attempts 耗尽后由 ocrQueue.on('failed') 写入；手动重试由
// services/queue.retryFailure 读行 → ocrQueue.add → retried += 1。
const OcrJobFailure = sequelize.define('OcrJobFailure', {
  id: {
    type: require('sequelize').DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  job_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: false
  },
  record_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: false
  },
  error_type: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: true
  },
  error_message: {
    type: require('sequelize').DataTypes.TEXT,
    allowNull: true
  },
  payload: {
    type: require('sequelize').DataTypes.JSON,
    allowNull: true
  },
  retried: {
    type: require('sequelize').DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  last_retried_at: {
    type: require('sequelize').DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'ocr_job_failures',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { name: 'idx_record', fields: ['record_id'] },
    { name: 'idx_created', fields: ['created_at'] }
  ]
});

// Q3-红线 §A.2.1：用户同意记录表（user_consent）
// 对应迁移 scripts/migrations/20260501_user_consent.sql。
// 同 (user_id, policy_version, scope) 在应用层去重 —— 控制器先 findOne 命中则 noop。
const UserConsent = sequelize.define('UserConsent', {
  id: {
    type: require('sequelize').DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  user_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: false
  },
  policy_version: {
    type: require('sequelize').DataTypes.STRING(32),
    allowNull: false,
    comment: '隐私政策版本号，如 v2026Q3-1'
  },
  scope: {
    type: require('sequelize').DataTypes.ENUM('upload', 'match', 'share_with_cro'),
    allowNull: false
  },
  agreed_at: {
    type: require('sequelize').DataTypes.DATE,
    allowNull: false
  },
  ip: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: true
  },
  user_agent: {
    type: require('sequelize').DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'user_consent',
  timestamps: false,
  indexes: [
    { name: 'idx_user_scope', fields: ['user_id', 'scope'] },
    { name: 'idx_user_version', fields: ['user_id', 'policy_version'] }
  ]
});

// PRD-2026Q3 T0-2：申请状态变更事件流
// 每次状态机 transition() 写一行；T1-4 CPA 计费按 (cro_id, trial_id, to_status, month) 聚合。
// 与 trial_applications.status 字段并存：status 是当前态，本表是历史变更轨迹。
const ApplicationStatusEvent = sequelize.define('ApplicationStatusEvent', {
  id: {
    type: require('sequelize').DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  application_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: false
  },
  from_status: {
    type: require('sequelize').DataTypes.STRING(32),
    allowNull: false
  },
  to_status: {
    type: require('sequelize').DataTypes.STRING(32),
    allowNull: false
  },
  actor_type: {
    type: require('sequelize').DataTypes.ENUM('user', 'cro', 'admin', 'system'),
    allowNull: false
  },
  actor_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: true
  },
  reason: {
    type: require('sequelize').DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'application_status_event',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { name: 'idx_app_created', fields: ['application_id', 'created_at'] },
    { name: 'idx_to_status_created', fields: ['to_status', 'created_at'] },
    { name: 'idx_actor', fields: ['actor_type', 'actor_id'] }
  ]
});

// PRD-2026Q3 T0-1：CRO 导出审计日志
// 与 admin_audit_log 互补 —— admin_audit_log 写 admin 维度的 unmask 留痕，
// 本表写 cro 维度的"哪家 CRO 哪天导了哪些试验、是否含 phone_full"。
// 商务对账 + 法务尽调 + CPA 计费证据三合一。
const CroExportLog = sequelize.define('CroExportLog', {
  id: {
    type: require('sequelize').DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  cro_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: false
  },
  trial_ids: {
    type: require('sequelize').DataTypes.JSON,
    allowNull: false
  },
  fields: {
    type: require('sequelize').DataTypes.JSON,
    allowNull: false,
    comment: '本次导出包含的字段集 + phone_full 标记'
  },
  format: {
    type: require('sequelize').DataTypes.STRING(8),
    allowNull: false,
    defaultValue: 'csv'
  },
  row_count: {
    type: require('sequelize').DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    defaultValue: 0
  },
  unmask: {
    type: require('sequelize').DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  ip: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: true
  },
  user_agent: {
    type: require('sequelize').DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'cro_export_log',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { name: 'idx_cro_created', fields: ['cro_id', 'created_at'] }
  ]
});

// PRD-2026Q3 T1-1：试验抓取变更日志 + DLQ
const TrialChangeLog = sequelize.define('TrialChangeLog', {
  id: { type: require('sequelize').DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  trial_id: { type: require('sequelize').DataTypes.STRING(64), allowNull: false },
  nct_id: { type: require('sequelize').DataTypes.STRING(32), allowNull: true },
  field: { type: require('sequelize').DataTypes.STRING(64), allowNull: false },
  old_value: { type: require('sequelize').DataTypes.STRING(1024), allowNull: true },
  new_value: { type: require('sequelize').DataTypes.STRING(1024), allowNull: true },
  source: { type: require('sequelize').DataTypes.STRING(32), allowNull: false, defaultValue: 'clinicaltrials_v2' }
}, {
  tableName: 'trial_change_log',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { name: 'idx_trial_created', fields: ['trial_id', 'created_at'] },
    { name: 'idx_created', fields: ['created_at'] }
  ]
});

const TrialCrawlFailure = sequelize.define('TrialCrawlFailure', {
  id: { type: require('sequelize').DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  trial_id: { type: require('sequelize').DataTypes.STRING(64), allowNull: true },
  nct_id: { type: require('sequelize').DataTypes.STRING(32), allowNull: true },
  reason: { type: require('sequelize').DataTypes.STRING(256), allowNull: false },
  payload: { type: require('sequelize').DataTypes.JSON, allowNull: true },
  attempt_count: { type: require('sequelize').DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
  last_attempt_at: { type: require('sequelize').DataTypes.DATE, allowNull: false, defaultValue: require('sequelize').DataTypes.NOW },
  resolved_at: { type: require('sequelize').DataTypes.DATE, allowNull: true }
}, {
  tableName: 'trial_crawl_failures',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { name: 'idx_resolved', fields: ['resolved_at'] },
    { name: 'idx_nct', fields: ['nct_id'] }
  ]
});

// Q3-红线 §A.2.3：用户操作审计日志（user_action_log）
// 与 admin_audit_log 分表 —— 不污染 admin 视图，便于按 user 维度做"我对自己账号
// 做过什么"的回顾。action 取值与文档保持一致（export_my_data /
// delete_account_request / delete_account_executed / change_password）。
const UserActionLog = sequelize.define('UserActionLog', {
  id: {
    type: require('sequelize').DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  user_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: false
  },
  action: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: false
  },
  metadata: {
    type: require('sequelize').DataTypes.JSON,
    allowNull: true
  },
  ip: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: true
  }
}, {
  tableName: 'user_action_log',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { name: 'idx_user_action', fields: ['user_id', 'action'] },
    { name: 'idx_action_created', fields: ['action', 'created_at'] }
  ]
});

// 建立关联
User.hasMany(MedicalRecord, { foreignKey: 'user_id' });
MedicalRecord.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(TrialApplication, { foreignKey: 'user_id' });
TrialApplication.belongsTo(User, { foreignKey: 'user_id' });
Trial.hasMany(TrialApplication, { foreignKey: 'trial_id' });
TrialApplication.belongsTo(Trial, { foreignKey: 'trial_id' });

module.exports = {
  sequelize,
  testConnection,
  User,
  Trial,
  MedicalRecord,
  TrialApplication,
  CroCompany,
  CroExportLog,
  AdminAuditLog,
  OcrJobFailure,
  UserConsent,
  UserActionLog,
  ApplicationStatusEvent,
  // PRD-2026Q3 T1-1：试验抓取相关
  TrialChangeLog,
  TrialCrawlFailure,
  // PRD-2026Q4 T0-1：trialCrawler null 守门复核队列
  TrialFieldChangeReview,
  // Q3-红线 §B.2：漏斗埋点事件
  UserFunnelEvent,
  // PRD-2026Q4 T0-10：8-event 异步漏斗
  FunnelEvent
};
