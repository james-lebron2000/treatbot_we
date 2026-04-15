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
  },
  disease_tags: {
    type: DataTypes.JSON,
    allowNull: true
  },
  treatment_lines: {
    type: DataTypes.JSON,
    allowNull: true
  },
  study_cities: {
    type: DataTypes.JSON,
    allowNull: true
  },
  treatment_approach: {
    type: DataTypes.STRING(128),
    allowNull: true
  },
  brief_inclusion: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  structured_inclusion: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'LLM解析的结构化入组条件: {age_min, age_max, ecog_max, survival_months, required_genes, ...}'
  },
  gene_requirement: {
    type: DataTypes.STRING(256),
    allowNull: true,
    comment: '基因要求（来自源数据）'
  },
  sponsor: {
    type: DataTypes.STRING(128),
    allowNull: true,
    comment: '申办方简称'
  },
  hospitals: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: '所有研究医院列表'
  },
  patient_subsidy: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '患者补助说明'
  },
  required_documents: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '报名所需资料'
  }
}, {
  tableName: 'trials',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Trial;
