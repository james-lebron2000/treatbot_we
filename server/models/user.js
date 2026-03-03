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
  }
}, {
  tableName: 'users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = User;
