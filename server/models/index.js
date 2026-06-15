const { sequelize, testConnection } = require('../config/database');
const User = require('./user');
const Trial = require('./trial');
// Q3-红线 §B.2：漏斗埋点事件模型
const UserFunnelEvent = require('./userFunnelEvent');
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
  batch_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: true
  },
  case_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: true
  },
  status: {
    type: require('sequelize').DataTypes.ENUM('pending', 'running', 'completed', 'error'),
    defaultValue: 'pending'
  },
  // Plan §Phase 1.3：6 阶段细分（queued/analyzing/streaming/structuring）。
  // 不动 status ENUM，纯增量列；migration: 20260508_medical_record_status_phase.sql
  status_phase: {
    type: require('sequelize').DataTypes.STRING(24),
    allowNull: true,
    defaultValue: null
  },
  // Plan §Phase 3.1：用户取消时间戳。OCR worker 在阶段切换前查这个字段决定是否提前退出。
  // 软删用 deleted_at；cancelled_at 是"用户主动放弃"，可能保留 record 给客户端追溯。
  cancelled_at: {
    type: require('sequelize').DataTypes.DATE,
    allowNull: true,
    defaultValue: null
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
  }
}, {
  tableName: 'medical_records',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

// OCR 批次模型：一次用户上传对应一个 batch，可关联多份 medical_records。
const UploadBatch = sequelize.define('UploadBatch', {
  id: {
    type: require('sequelize').DataTypes.STRING(64),
    primaryKey: true,
    defaultValue: () => `batch_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  },
  user_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: false
  },
  record_ids: {
    type: require('sequelize').DataTypes.JSON,
    allowNull: false,
    defaultValue: []
  },
  total_count: {
    type: require('sequelize').DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  processed_count: {
    type: require('sequelize').DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  success_count: {
    type: require('sequelize').DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  failed_count: {
    type: require('sequelize').DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  status: {
    type: require('sequelize').DataTypes.STRING(24),
    allowNull: false,
    defaultValue: 'pending'
  },
  started_at: {
    type: require('sequelize').DataTypes.DATE,
    allowNull: false,
    defaultValue: require('sequelize').DataTypes.NOW
  },
  completed_at: {
    type: require('sequelize').DataTypes.DATE,
    allowNull: true
  },
  metadata: {
    type: require('sequelize').DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'upload_batches',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { name: 'idx_upload_batch_user_created', fields: ['user_id', 'created_at'] },
    { name: 'idx_upload_batch_status', fields: ['status', 'created_at'] }
  ]
});

const MedicalCase = sequelize.define('MedicalCase', {
  id: {
    type: require('sequelize').DataTypes.STRING(64),
    primaryKey: true,
    defaultValue: () => `case_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  },
  user_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: false
  },
  active_version_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: true
  },
  status: {
    type: require('sequelize').DataTypes.STRING(24),
    allowNull: false,
    defaultValue: 'active'
  },
  entities: {
    type: require('sequelize').DataTypes.JSON,
    allowNull: true
  },
  summary: {
    type: require('sequelize').DataTypes.JSON,
    allowNull: true
  },
  source_record_ids: {
    type: require('sequelize').DataTypes.JSON,
    allowNull: false,
    defaultValue: []
  },
  completeness: {
    type: require('sequelize').DataTypes.JSON,
    allowNull: true
  },
  validation_issues: {
    type: require('sequelize').DataTypes.JSON,
    allowNull: true
  },
  normalized_tags: {
    type: require('sequelize').DataTypes.JSON,
    allowNull: true
  },
  // 多病人：该病例对应的病人显示名/标签（同一账号下区分多位病人；保持最小 PII，可空）。
  patient_label: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: true,
    defaultValue: null
  }
}, {
  tableName: 'medical_cases',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { name: 'idx_medical_case_user_status', fields: ['user_id', 'status'] },
    { name: 'idx_medical_case_updated', fields: ['updated_at'] }
  ]
});

const MedicalCaseVersion = sequelize.define('MedicalCaseVersion', {
  id: {
    type: require('sequelize').DataTypes.STRING(64),
    primaryKey: true,
    defaultValue: () => `casev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  },
  case_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: false
  },
  user_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: false
  },
  version_no: {
    type: require('sequelize').DataTypes.INTEGER,
    allowNull: false
  },
  entities: {
    type: require('sequelize').DataTypes.JSON,
    allowNull: false,
    defaultValue: {}
  },
  summary: {
    type: require('sequelize').DataTypes.JSON,
    allowNull: true
  },
  source_record_ids: {
    type: require('sequelize').DataTypes.JSON,
    allowNull: false,
    defaultValue: []
  },
  completeness: {
    type: require('sequelize').DataTypes.JSON,
    allowNull: true
  },
  validation_issues: {
    type: require('sequelize').DataTypes.JSON,
    allowNull: true
  },
  normalized_tags: {
    type: require('sequelize').DataTypes.JSON,
    allowNull: true
  },
  metadata: {
    type: require('sequelize').DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'medical_case_versions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { name: 'uniq_case_version_case_no', unique: true, fields: ['case_id', 'version_no'] },
    { name: 'idx_case_version_user_created', fields: ['user_id', 'created_at'] }
  ]
});

const MedicalCaseRevision = sequelize.define('MedicalCaseRevision', {
  id: {
    type: require('sequelize').DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  case_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: false
  },
  user_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: false
  },
  field_key: {
    type: require('sequelize').DataTypes.STRING(96),
    allowNull: false
  },
  old_value: {
    type: require('sequelize').DataTypes.JSON,
    allowNull: true
  },
  new_value: {
    type: require('sequelize').DataTypes.JSON,
    allowNull: true
  },
  reason: {
    type: require('sequelize').DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'medical_case_revisions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { name: 'idx_case_revision_case_field', fields: ['case_id', 'field_key'] },
    { name: 'idx_case_revision_user_created', fields: ['user_id', 'created_at'] }
  ]
});

const MedicalFieldEvidence = sequelize.define('MedicalFieldEvidence', {
  id: {
    type: require('sequelize').DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  case_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: false
  },
  user_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: false
  },
  field_key: {
    type: require('sequelize').DataTypes.STRING(96),
    allowNull: false
  },
  value: {
    type: require('sequelize').DataTypes.JSON,
    allowNull: true
  },
  source_record_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: false
  },
  confidence: {
    type: require('sequelize').DataTypes.FLOAT,
    allowNull: true
  },
  snippet: {
    type: require('sequelize').DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'medical_field_evidence',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { name: 'idx_field_evidence_case_field', fields: ['case_id', 'field_key'] },
    { name: 'idx_field_evidence_record', fields: ['source_record_id'] }
  ]
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
  status: {
    type: require('sequelize').DataTypes.ENUM('pending', 'contacted', 'enrolled', 'rejected', 'cancelled'),
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

// Plan §Phase 3.5（deferred）：微信订阅消息预埋
// 模板未审批前不写入；schema 先建好，等模板下发后只需补 controller + queue
// consumer + 客户端弹窗即可（详见 docs/notification-subscribe.md）。
// 对应迁移 scripts/migrations/20260508_subscribe_intents.sql。
const SubscribeIntent = sequelize.define('SubscribeIntent', {
  id: {
    type: require('sequelize').DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  user_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: false
  },
  record_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: false
  },
  tmpl_id: {
    type: require('sequelize').DataTypes.STRING(64),
    allowNull: false,
    comment: '微信订阅消息模板 ID（审批后下发）'
  },
  granted_at: {
    type: require('sequelize').DataTypes.DATE,
    allowNull: false,
    comment: '用户在客户端点击"允许"的时间'
  },
  sent_at: {
    type: require('sequelize').DataTypes.DATE,
    allowNull: true,
    comment: '实际发送成功时间；NULL 代表未发送'
  },
  send_error: {
    type: require('sequelize').DataTypes.STRING(255),
    allowNull: true,
    comment: '发送失败时记录最近一次错误'
  }
}, {
  tableName: 'subscribe_intents',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { name: 'idx_record_pending', fields: ['record_id', 'sent_at'] },
    { name: 'idx_user_granted', fields: ['user_id', 'granted_at'] }
  ]
});

// 建立关联
User.hasMany(MedicalRecord, { foreignKey: 'user_id' });
MedicalRecord.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(UploadBatch, { foreignKey: 'user_id' });
UploadBatch.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(MedicalCase, { foreignKey: 'user_id' });
MedicalCase.belongsTo(User, { foreignKey: 'user_id' });
MedicalCase.hasMany(MedicalCaseVersion, { foreignKey: 'case_id' });
MedicalCaseVersion.belongsTo(MedicalCase, { foreignKey: 'case_id' });
MedicalCase.hasMany(MedicalCaseRevision, { foreignKey: 'case_id' });
MedicalCaseRevision.belongsTo(MedicalCase, { foreignKey: 'case_id' });
MedicalCase.hasMany(MedicalFieldEvidence, { foreignKey: 'case_id' });
MedicalFieldEvidence.belongsTo(MedicalCase, { foreignKey: 'case_id' });

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
  UploadBatch,
  MedicalCase,
  MedicalCaseVersion,
  MedicalCaseRevision,
  MedicalFieldEvidence,
  TrialApplication,
  CroCompany,
  AdminAuditLog,
  OcrJobFailure,
  UserConsent,
  UserActionLog,
  // Q3-红线 §B.2：漏斗埋点事件
  UserFunnelEvent,
  FunnelEvent,
  // Plan §Phase 3.5（deferred）：微信订阅消息预埋
  SubscribeIntent
};
