const { User, MedicalRecord, TrialApplication, Trial } = require('../models');
const { success } = require('../utils/response');
const { matchRecordsToTrials } = require('../services/matchEngine');

/**
 * 获取用户资料
 */
const getProfile = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.userId, {
      attributes: ['id', 'nickname', 'avatar_url', 'phone', 'created_at']
    });
    
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在', data: null });
    }
    
    res.json(success({
      id: user.id,
      nickName: user.nickname,
      avatarUrl: user.avatar_url,
      phone: user.phone,
      createdAt: user.created_at
    }));
  } catch (err) {
    next(err);
  }
};

/**
 * 获取用户统计
 */
const getStats = async (req, res, next) => {
  try {
    const [records, applications, completedRecords, recruitingTrials] = await Promise.all([
      MedicalRecord.count({ where: { user_id: req.userId } }),
      TrialApplication.count({ where: { user_id: req.userId } }),
      MedicalRecord.findAll({
        where: { user_id: req.userId, status: 'completed' },
        attributes: ['id', 'diagnosis', 'stage', 'gene_mutation', 'created_at'],
        order: [['created_at', 'DESC']]
      }),
      Trial.findAll({
        where: { status: 'recruiting' },
        attributes: ['id', 'name', 'phase', 'type', 'indication', 'institution', 'location', 'description', 'inclusion_criteria', 'exclusion_criteria', 'status'],
        limit: 300
      })
    ]);

    const matches = completedRecords.length && recruitingTrials.length
      ? matchRecordsToTrials(completedRecords, recruitingTrials).length
      : 0;

    res.json(success({
      records,
      matches,
      applications
    }));
  } catch (err) {
    next(err);
  }
};

/**
 * 更新用户资料
 */
const updateProfile = async (req, res, next) => {
  try {
    const { nickName, avatarUrl } = req.body;
    
    await User.update({
      nickname: nickName,
      avatar_url: avatarUrl
    }, {
      where: { id: req.userId }
    });
    
    res.json(success(null, '更新成功'));
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getProfile,
  getStats,
  updateProfile
};
