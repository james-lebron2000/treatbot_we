const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Trial = sequelize.define('Trial', {
  id: {
    type: DataTypes.STRING(64),
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(256),
    allowNull: false
  },
  phase: {
    type: DataTypes.STRING(32),
    allowNull: true
  },
  type: {
    type: DataTypes.STRING(64),
    allowNull: true
  },
  indication: {
    type: DataTypes.STRING(256),
    allowNull: true
  },
  institution: {
    type: DataTypes.STRING(256),
    allowNull: true
  },
  location: {
    type: DataTypes.STRING(256),
    allowNull: true
  },
  contact_phone: {
    type: DataTypes.STRING(32),
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  inclusion_criteria: {
    type: DataTypes.JSON,
    allowNull: true
  },
  exclusion_criteria: {
    type: DataTypes.JSON,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('recruiting', 'closed', 'completed'),
    defaultValue: 'recruiting'
  },
  target_count: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true
  },
  enrolled_count: {
    type: DataTypes.INTEGER.UNSIGNED,
    defaultValue: 0
  }
}, {
  tableName: 'trials',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Trial;
