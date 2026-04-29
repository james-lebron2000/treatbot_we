/**
 * Q3-红线 §B.2：用户漏斗事件模型（user_funnel_event）。
 * 对应迁移 scripts/migrations/20260503_user_funnel_event.sql。
 *
 * 写入路径仅一处：POST /api/track（controllers/funnel.js）。
 * 与 admin_audit_log / user_action_log 区别：
 *   - 这张表允许匿名写入（user_id 可 NULL，靠 anon_id 串联），
 *     用于"未登录首屏 → 登录 → 上传"完整漏斗回放。
 *   - 不存敏感 PII，仅事件名 + 上下文（路径 / trialId 等可聚合字段）。
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserFunnelEvent = sequelize.define('UserFunnelEvent', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: '已登录用户 id；匿名为 NULL'
  },
  anon_id: {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: '浏览器 localStorage uuid，登录前用于串联会话'
  },
  event: {
    type: DataTypes.STRING(32),
    allowNull: false,
    comment: '白名单事件名，见 controllers/funnel.js'
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  },
  ip: {
    type: DataTypes.STRING(64),
    allowNull: true
  },
  user_agent: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'user_funnel_event',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { name: 'idx_event_created', fields: ['event', 'created_at'] },
    { name: 'idx_user', fields: ['user_id', 'created_at'] }
  ]
});

module.exports = UserFunnelEvent;
