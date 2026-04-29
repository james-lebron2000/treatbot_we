const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.STRING(64),
    primaryKey: true,
    defaultValue: () => `user_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  },
  openid: {
    type: DataTypes.STRING(128),
    allowNull: false,
    unique: true,
    comment: '微信 OpenID'
  },
  unionid: {
    type: DataTypes.STRING(128),
    allowNull: true,
    comment: '微信 UnionID'
  },
  nickname: {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: '昵称'
  },
  avatar_url: {
    type: DataTypes.STRING(512),
    allowNull: true,
    comment: '头像 URL'
  },
  phone: {
    type: DataTypes.STRING(16),
    allowNull: true,
    comment: '手机号'
  },
  // Q3-红线 §A.2.4：可选的密码登录通道（与 SMS / 微信并存）。
  // 默认 NULL = 用户没设置过密码 —— 此时 change-password 必须 401。
  password_hash: {
    type: DataTypes.STRING(256),
    allowNull: true,
    comment: 'bcrypt 密码 hash，NULL 表示未设置'
  },
  // Q3-红线 §A.2：注销账号（被遗忘权）—— 软标记 + 匿名化
  // 物理保留 user 行的目的：保住外键 / 审计可追溯；row 内的 PII 已被擦掉。
  real_name: {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: '真实姓名（注销时清空）'
  },
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
    comment: '账号注销时间，NULL=活跃账号'
  },
  deleted_reason: {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: '注销原因，如 user_requested / admin_revoked'
  }
}, {
  tableName: 'users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = User;
