/**
 * PRD-2026Q4 T0-10：业务漏斗事件模型（funnel_event）。
 *
 * 对应迁移 scripts/migrations/20260512_funnel_event.sql。
 *
 * 写入路径仅一处：services/funnelTracker.js 的异步队列 worker。
 * 与 user_funnel_event（Q3-红线 §B.2，前端 /api/track 写入）刻意分表：
 *   - user_funnel_event：前端浏览/匿名行为埋点，user_id 允许 NULL（靠 anon_id 串联）
 *   - funnel_event（本表）：后端业务事件埋点（病历上传、申请、CRO 推进、入组/拒绝/退出），
 *     供 Grafana 漏斗仪表盘 + 增长团队复盘使用
 * dedupe_key 由 funnelTracker 按 (event_name, user_id, entity_id, 分钟级时间戳) 计算，
 * UNIQUE 约束兜底防止 Bull 重试 / 队列双投递造成重复入库。
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const FunnelEvent = sequelize.define('FunnelEvent', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  event_name: {
    type: DataTypes.STRING(64),
    allowNull: false,
    comment: '事件名，见 services/funnelTracker.EVENTS'
  },
  user_id: {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: '关联用户 id；系统/后台触发时可为 NULL'
  },
  entity_id: {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: '业务实体 id（recordId / applicationId / trialId 等），便于回放'
  },
  payload: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: '事件上下文，禁止存敏感 PII'
  },
  occurred_at: {
    type: DataTypes.DATE(6),
    allowNull: false,
    comment: '事件实际发生时间（业务侧，非入库时间）'
  },
  dedupe_key: {
    type: DataTypes.STRING(128),
    allowNull: false,
    comment: '${event_name}:${user_id}:${entity_id}:${minute_truncated}'
  }
}, {
  tableName: 'funnel_event',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { name: 'uk_dedupe', unique: true, fields: ['dedupe_key'] },
    { name: 'idx_event_occurred', fields: ['event_name', 'occurred_at'] },
    { name: 'idx_user_event', fields: ['user_id', 'event_name'] }
  ]
});

module.exports = FunnelEvent;
