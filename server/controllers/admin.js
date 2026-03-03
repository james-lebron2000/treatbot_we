const { User, MedicalRecord, TrialApplication, Trial } = require('../models');
const { success, pagination } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * 获取仪表盘统计
 */
const getDashboardStats = async (req, res, next) => {
  try {
    // 获取各项统计数据
    const [
      totalUsers,
      totalRecords,
      totalApplications,
      todayUsers,
      todayRecords,
      todayApplications
    ] = await Promise.all([
      User.count(),
      MedicalRecord.count(),
      TrialApplication.count(),
      User.count({
        where: {
          created_at: {
            [require('sequelize').Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      }),
      MedicalRecord.count({
        where: {
          created_at: {
            [require('sequelize').Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      }),
      TrialApplication.count({
        where: {
          created_at: {
            [require('sequelize').Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      })
    ]);

    // 获取状态分布
    const recordStatusDistribution = await MedicalRecord.findAll({
      attributes: ['status', [require('sequelize').fn('COUNT', '*'), 'count']],
      group: ['status']
    });

    const applicationStatusDistribution = await TrialApplication.findAll({
      attributes: ['status', [require('sequelize').fn('COUNT', '*'), 'count']],
      group: ['status']
    });

    res.json(success({
      overview: {
        totalUsers,
        totalRecords,
        totalApplications,
        todayUsers,
        todayRecords,
        todayApplications
      },
      recordStatus: recordStatusDistribution.map(r => ({
        status: r.status,
        count: parseInt(r.get('count'))
      })),
      applicationStatus: applicationStatusDistribution.map(a => ({
        status: a.status,
        count: parseInt(a.get('count'))
      }))
    }));
    
  } catch (err) {
    next(err);
  }
};

/**
 * 获取用户列表
 */
const getUserList = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const { keyword, startDate, endDate } = req.query;

    const where = {};
    
    if (keyword) {
      where[require('sequelize').Op.or] = [
        { nickname: { [require('sequelize').Op.like]: `%${keyword}%` } },
        { phone: { [require('sequelize').Op.like]: `%${keyword}%` } }
      ];
    }
    
    if (startDate && endDate) {
      where.created_at = {
        [require('sequelize').Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    const { count, rows } = await User.findAndCountAll({
      where,
      attributes: ['id', 'nickname', 'avatar_url', 'phone', 'created_at'],
      order: [['created_at', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize
    });

    // 获取每个用户的统计
    const usersWithStats = await Promise.all(
      rows.map(async (user) => {
        const [recordCount, applicationCount] = await Promise.all([
          MedicalRecord.count({ where: { user_id: user.id } }),
          TrialApplication.count({ where: { user_id: user.id } })
        ]);

        return {
          id: user.id,
          nickname: user.nickname,
          avatarUrl: user.avatar_url,
          phone: user.phone,
          createdAt: user.created_at,
          stats: {
            records: recordCount,
            applications: applicationCount
          }
        };
      })
    );

    res.json(pagination(usersWithStats, {
      page,
      pageSize,
      total: count,
      hasMore: page * pageSize < count
    }));
    
  } catch (err) {
    next(err);
  }
};

/**
 * 获取报名列表
 */
const getApplicationList = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const { status, startDate, endDate } = req.query;

    const where = {};
    
    if (status) {
      where.status = status;
    }
    
    if (startDate && endDate) {
      where.created_at = {
        [require('sequelize').Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    const { count, rows } = await TrialApplication.findAndCountAll({
      where,
      include: [
        {
          model: User,
          attributes: ['id', 'nickname', 'phone']
        },
        {
          model: Trial,
          attributes: ['id', 'name', 'institution']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize
    });

    const applications = rows.map(app => ({
      id: app.id,
      userId: app.user_id,
      userName: app.User?.nickname || '未知用户',
      userPhone: app.User?.phone || '',
      trialId: app.trial_id,
      trialName: app.Trial?.name || '',
      institution: app.Trial?.institution || '',
      status: app.status,
      remark: app.remark,
      createdAt: app.created_at,
      updatedAt: app.updated_at
    }));

    res.json(pagination(applications, {
      page,
      pageSize,
      total: count,
      hasMore: page * pageSize < count
    }));
    
  } catch (err) {
    next(err);
  }
};

/**
 * 更新报名状态
 */
const updateApplicationStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, remark } = req.body;

    const application = await TrialApplication.findByPk(id);
    if (!application) {
      return res.status(404).json({
        code: 404,
        message: '报名记录不存在',
        data: null
      });
    }

    const oldStatus = application.status;
    await application.update({
      status,
      remark: remark || application.remark
    });

    logger.info('报名状态已更新:', {
      applicationId: id,
      oldStatus,
      newStatus: status,
      operator: req.userId
    });

    res.json(success({
      id: application.id,
      status: application.status,
      updatedAt: application.updated_at
    }, '状态更新成功'));
    
  } catch (err) {
    next(err);
  }
};

/**
 * 获取系统日志
 */
const getSystemLogs = async (req, res, next) => {
  try {
    const { level, startDate, endDate, limit = 100 } = req.query;

    // TODO: 从日志文件或日志服务查询
    // 这里返回模拟数据
    const mockLogs = [
      {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: '用户登录成功',
        userId: 'user_001',
        ip: '192.168.1.1'
      },
      {
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        level: 'warn',
        message: '数据库连接池使用率超过80%',
        service: 'database'
      }
    ];

    res.json(success(mockLogs));
    
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getDashboardStats,
  getUserList,
  getApplicationList,
  updateApplicationStatus,
  getSystemLogs
};
