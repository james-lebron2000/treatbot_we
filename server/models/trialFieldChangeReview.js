// PRD-2026Q4 T0-1：试验字段变更人工复核队列模型
// 与 trial_change_log 互补：
//   - trial_change_log：所有"已应用"的字段变更（不可变历史轨迹）
//   - trial_field_change_review：被守门拦截的"待应用"变更（可被 reject）
//
// 写入时机：jobs/trialCrawler.diffAndApply 检出
//   "上游字段 null 且库内非 null" 时入队，不覆盖 trials 表。
// 处理出口：admin /api/admin/trials/field-review/:id/resolve 决断 approve / reject。

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const TrialFieldChangeReview = sequelize.define('TrialFieldChangeReview', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  trial_id: {
    type: DataTypes.STRING(64),
    allowNull: false
  },
  nct_id: {
    type: DataTypes.STRING(32),
    allowNull: true
  },
  field: {
    type: DataTypes.STRING(64),
    allowNull: false,
    comment: '待复核字段名：status / phase / enrolled_count / locations'
  },
  old_value: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: '复核前库内值'
  },
  new_value: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: '上游想覆盖的新值（通常为 null）'
  },
  null_source: {
    type: DataTypes.ENUM('explicit', 'missing'),
    allowNull: true,
    comment: 'explicit=上游 JSON 显式 null；missing=字段不存在'
  },
  change_kind: {
    type: DataTypes.STRING(64),
    allowNull: false,
    comment: '当前固定 suspect_null_from_upstream，未来可拓展'
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    allowNull: false,
    defaultValue: 'pending'
  },
  reviewer_id: {
    type: DataTypes.STRING(64),
    allowNull: true
  },
  reviewed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  reviewer_note: {
    type: DataTypes.STRING(512),
    allowNull: true
  }
}, {
  tableName: 'trial_field_change_review',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { name: 'idx_status_created', fields: ['status', 'created_at'] },
    { name: 'idx_trial_field', fields: ['trial_id', 'field'] }
  ]
});

module.exports = TrialFieldChangeReview;
