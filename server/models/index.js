const { sequelize, testConnection } = require('../config/database');
const User = require('./user');
const Trial = require('./trial');

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
  CroCompany
};
