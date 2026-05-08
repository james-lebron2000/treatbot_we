/**
 * Q3-红线 §A.2：用户合规自助接口（注销 / 数据导出 / 同意 / 改密码）
 *
 * 路由前缀 /api/me/*，全部 authMiddleware 保护。
 * 设计要点：
 *   - 同意（consent）：幂等写入；同 (user, version, scope) 已存在则 noop
 *   - 导出（export）：限速一日一次（Redis 计数）+ Content-Disposition attachment
 *   - 注销（delete-account）：两步 SMS 确认 + 单事务清算 DB + 异步清 COS
 *   - 改密码（change-password）：旧 hash 比对 + SCAN 撤销所有 refresh jti
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const {
  sequelize,
  User,
  MedicalRecord,
  TrialApplication,
  UserConsent,
  UserActionLog,
  OcrJobFailure
} = require('../models');
const ossService = require('../services/oss');
const { redisClient } = require('../middleware/rateLimit');
const { JWT_SECRET } = require('../utils/jwtSecret');
const logger = require('../utils/logger');
const { _maskPhone: maskPhone } = require('../utils/piiScrubber');

const JWT_EXPIRES_IN = parseInt(process.env.JWT_EXPIRES_IN, 10) || 1800;
const JWT_REFRESH_EXPIRES_IN = parseInt(process.env.JWT_REFRESH_EXPIRES_IN, 10) || 604800;

const REFRESH_TOKEN_PREFIX = 'refresh:';
const VALID_SCOPES = ['upload', 'match', 'share_with_cro'];

const clientIp = (req) => {
  const raw = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
  return raw.slice(0, 64);
};

const todayKey = (d = new Date()) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
};

const writeActionLog = async (userId, action, metadata, ip) => {
  try {
    await UserActionLog.create({
      user_id: userId,
      action,
      metadata: metadata || null,
      ip: ip || null
    });
  } catch (err) {
    logger.warn('[me] user_action_log 写入失败，不阻断主流程', {
      userId, action, error: err.message
    });
  }
};

// ------- A2.1 Consent -------

/**
 * POST /api/me/consent
 * body: { policyVersion, scope }
 * 幂等：同 (user, version, scope) 已存在直接 noop。
 */
const recordConsent = async (req, res, next) => {
  try {
    const { policyVersion, scope } = req.body || {};
    if (!policyVersion || !scope) {
      return res.fail('policyVersion 与 scope 必填', 400);
    }
    if (!VALID_SCOPES.includes(scope)) {
      return res.fail('scope 不合法', 400);
    }

    const existing = await UserConsent.findOne({
      where: { user_id: req.userId, policy_version: policyVersion, scope }
    });
    if (existing) {
      return res.ok({
        id: existing.id,
        scope: existing.scope,
        policyVersion: existing.policy_version,
        agreedAt: existing.agreed_at,
        duplicate: true
      });
    }

    const created = await UserConsent.create({
      user_id: req.userId,
      policy_version: policyVersion,
      scope,
      agreed_at: new Date(),
      ip: clientIp(req),
      user_agent: (req.headers['user-agent'] || '').toString().slice(0, 255)
    });

    return res.ok({
      id: created.id,
      scope: created.scope,
      policyVersion: created.policy_version,
      agreedAt: created.agreed_at,
      duplicate: false
    });
  } catch (err) {
    next(err);
  }
};

/** GET /api/me/consent */
const listConsent = async (req, res, next) => {
  try {
    const rows = await UserConsent.findAll({
      where: { user_id: req.userId },
      order: [['agreed_at', 'DESC']]
    });
    return res.ok({
      list: rows.map((r) => ({
        id: r.id,
        scope: r.scope,
        policyVersion: r.policy_version,
        agreedAt: r.agreed_at
      }))
    });
  } catch (err) {
    next(err);
  }
};

// ------- A2.2 Export -------

/**
 * GET /api/me/export
 * 一日限一次（Redis 计数 ttl 86400）。返回 application/json 附件下载。
 * 聚合：profile + medical_records（含已软删）+ structured + applications + consents + 自身审计日志。
 */
const exportMyData = async (req, res, next) => {
  try {
    const userId = req.userId;
    const limitKey = `export:${userId}:${todayKey()}`;

    // SET NX EX 86400 —— 原子限速：成功 set 才允许导出
    let acquired = null;
    try {
      acquired = await redisClient.set(limitKey, '1', 'EX', 86400, 'NX');
    } catch (err) {
      // Redis 异常不应 hard-block —— 走告警 + 放行（与 jti 校验同策略）
      logger.warn('[me.export] Redis 限速 set 失败，放行此次导出', { userId, error: err.message });
      acquired = 'OK';
    }

    if (acquired !== 'OK') {
      res.setHeader('Retry-After', '86400');
      return res.fail('一天只能导出一次哦，明天再来', 429, { retryAfter: 86400 });
    }

    const [user, records, applications, consents, actionLogs] = await Promise.all([
      User.findByPk(userId, {
        attributes: ['id', 'nickname', 'phone', 'real_name', 'avatar_url', 'created_at']
      }),
      MedicalRecord.findAll({ where: { user_id: userId }, order: [['created_at', 'DESC']] }),
      TrialApplication.findAll({ where: { user_id: userId }, order: [['created_at', 'DESC']] }),
      UserConsent.findAll({ where: { user_id: userId }, order: [['agreed_at', 'DESC']] }),
      UserActionLog.findAll({ where: { user_id: userId }, order: [['created_at', 'DESC']], limit: 500 })
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      user: user ? {
        id: user.id,
        nickname: user.nickname,
        phone: user.phone,
        realName: user.real_name,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at
      } : null,
      medicalRecords: records.map((r) => ({
        id: r.id,
        type: r.type,
        fileKey: r.file_key,
        fileHash: r.file_hash,
        status: r.status,
        diagnosis: r.diagnosis,
        stage: r.stage,
        geneMutation: r.gene_mutation,
        treatment: r.treatment,
        treatmentLine: r.treatment_line,
        pdl1: r.pdl1,
        structured: r.structured || null,
        remark: r.remark,
        deletedAt: r.deleted_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      })),
      applications: applications.map((a) => ({
        id: a.id,
        trialId: a.trial_id,
        recordIds: a.record_ids,
        status: a.status,
        remark: a.remark,
        contactName: a.contact_name,
        contactPhone: a.contact_phone,
        diseaseSnapshot: a.disease_snapshot,
        clientSource: a.client_source,
        notes: a.notes,
        createdAt: a.created_at,
        updatedAt: a.updated_at
      })),
      consents: consents.map((c) => ({
        id: c.id,
        scope: c.scope,
        policyVersion: c.policy_version,
        agreedAt: c.agreed_at
      })),
      actionLogs: actionLogs.map((l) => ({
        id: l.id,
        action: l.action,
        metadata: l.metadata,
        createdAt: l.created_at
      }))
    };

    await writeActionLog(userId, 'export_my_data', {
      recordCount: records.length,
      applicationCount: applications.length
    }, clientIp(req));

    const filename = `myData_${userId}_${todayKey()}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    next(err);
  }
};

// ------- A2.3 Delete account -------

const DELETE_PENDING_PREFIX = 'delete_pending:';
const generateSmsCode = () => String(Math.floor(100000 + Math.random() * 900000));

/**
 * SCAN refresh:{userId}:* 并删除。
 * 用 SCAN 而不是 KEYS —— 生产 Redis 上 KEYS 会卡 IO 线程，SCAN 是 cursor 流式。
 */
const purgeRefreshTokens = async (userId) => {
  const pattern = `${REFRESH_TOKEN_PREFIX}${userId}:*`;
  let cursor = '0';
  let removed = 0;
  do {
    /* eslint-disable no-await-in-loop */
    const reply = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = reply[0];
    const keys = reply[1] || [];
    if (keys.length) {
      await redisClient.del(...keys);
      removed += keys.length;
    }
    /* eslint-enable no-await-in-loop */
  } while (cursor !== '0');
  return removed;
};

/**
 * POST /api/me/delete-account
 *  - 第一次（无 smsCode）：发短信 + Redis 写 delete_pending:{userId} ttl 600s + 写 request 日志
 *  - 第二次（带 smsCode）：校验码 → 事务清算 → 撤销 token
 */
const deleteAccount = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { smsCode } = req.body || {};
    const pendingKey = `${DELETE_PENDING_PREFIX}${userId}`;

    if (!smsCode) {
      // 第一步：发短信
      const user = await User.findByPk(userId);
      if (!user) {
        return res.fail('用户不存在', 404);
      }
      if (user.deleted_at) {
        return res.fail('账号已注销', 410);
      }
      if (!user.phone) {
        return res.fail('未绑定手机号无法注销，请先联系客服', 400);
      }

      const code = generateSmsCode();
      try {
        await redisClient.setex(pendingKey, 600, code);
      } catch (err) {
        logger.warn('[me.delete] Redis 写 pending 失败', { userId, error: err.message });
        return res.fail('系统繁忙，请稍后再试', 503);
      }

      // PRD-2026Q4 T0-7 followup（PHI logging）：
      //   - logger meta 走 maskPhone（docker logs / Sentry 不落明文）；
      //   - writeActionLog 是 DB 持久化的合规审计，按 PRD-2026Q3 仍落原值（注销链路必需取证）。
      logger.info('[me.delete] 注销验证码已生成', { userId, phone: maskPhone(user.phone) });
      await writeActionLog(userId, 'delete_account_request', { phone: user.phone }, clientIp(req));

      return res.status(202).json({
        code: 0,
        message: '请输入手机验证码以确认注销',
        data: { requiresSms: true }
      });
    }

    // 第二步：校验码 + 执行
    const stored = await redisClient.get(pendingKey);
    if (!stored || `${stored}` !== `${smsCode}`) {
      return res.fail('验证码无效或已过期，请重新发起注销', 400);
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.fail('用户不存在', 404);
    }

    let recordCount = 0;
    let applicationCount = 0;
    const fileKeys = [];

    await sequelize.transaction(async (t) => {
      const records = await MedicalRecord.findAll({
        where: { user_id: userId },
        transaction: t
      });
      records.forEach((r) => {
        if (r.file_key) fileKeys.push(r.file_key);
      });
      recordCount = records.length;

      // 物理删 medical_records / trial_applications / user_consent / OCR DLQ
      await MedicalRecord.destroy({ where: { user_id: userId }, force: true, transaction: t });

      const apps = await TrialApplication.destroy({
        where: { user_id: userId }, force: true, transaction: t
      });
      applicationCount = apps;

      await UserConsent.destroy({ where: { user_id: userId }, transaction: t });

      // OCR 失败队列只按 record_id 关联，记录已 destroy 后才清理 —— 这里按 record_id IN
      const recordIds = records.map((r) => r.id);
      if (recordIds.length) {
        await OcrJobFailure.destroy({ where: { record_id: recordIds }, transaction: t });
      }

      // 用户 row：保留 id 用作外键 / 审计追溯，PII 字段擦除
      const phoneHash = user.phone
        ? `DELETED_${crypto.createHash('sha1').update(user.phone).digest('hex').slice(0, 8)}`
        : `DELETED_${userId.slice(-8)}`;
      await user.update({
        phone: phoneHash,
        real_name: null,
        nickname: '已注销用户',
        avatar_url: '',
        password_hash: null,
        deleted_at: new Date(),
        deleted_reason: 'user_requested'
      }, { transaction: t });
    });

    // 事务成功后清 Redis（refresh / pending / sms-lock / export 限速）
    try {
      await purgeRefreshTokens(userId);
      await redisClient.del(pendingKey);
      if (user.phone) {
        await redisClient.del(`sms:lock:${user.phone}`);
        await redisClient.del(`sms:code:${user.phone}`);
      }
      await redisClient.del(`export:${userId}:${todayKey()}`);
    } catch (err) {
      logger.warn('[me.delete] Redis 清理失败但事务已提交', { userId, error: err.message });
    }

    // COS 清理：失败只 warn，不阻断（事务已经物理删了 DB）
    let cosDeleted = 0;
    for (const key of fileKeys) {
      try {
        /* eslint-disable no-await-in-loop */
        await ossService.deleteObject(key);
        cosDeleted += 1;
        /* eslint-enable no-await-in-loop */
      } catch (err) {
        logger.warn('[me.delete] COS deleteObject 失败', { userId, key, error: err.message });
      }
    }

    await writeActionLog(userId, 'delete_account_executed', {
      recordCount,
      applicationCount,
      cosDeleted
    }, clientIp(req));

    return res.ok({ deleted: true, recordCount, applicationCount });
  } catch (err) {
    next(err);
  }
};

// ------- A2.4 Change password -------

/**
 * POST /api/me/change-password
 *  - 旧 hash 不存在 / 不匹配 → 401
 *  - 成功 → 撤销所有 refresh jti，重新签 access+refresh
 */
const changePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body || {};
    if (!oldPassword || !newPassword) {
      return res.fail('oldPassword 与 newPassword 必填', 400);
    }
    if (`${newPassword}`.length < 8) {
      return res.fail('新密码至少 8 位', 400);
    }

    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.fail('用户不存在', 404);
    }
    if (!user.password_hash) {
      return res.fail('当前账号未设置密码', 401);
    }

    const matched = await bcrypt.compare(oldPassword, user.password_hash);
    if (!matched) {
      return res.fail('原密码不正确', 401);
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await user.update({ password_hash: newHash });

    // 撤销所有旧 refresh jti
    await purgeRefreshTokens(req.userId);

    // 重发新的 token pair（用户不掉线）
    const jti = crypto.randomBytes(16).toString('hex');
    const token = jwt.sign(
      { userId: user.id, openid: user.openid },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    const refreshToken = jwt.sign(
      { userId: user.id, openid: user.openid, type: 'refresh', jti },
      JWT_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRES_IN }
    );
    try {
      await redisClient.setex(`${REFRESH_TOKEN_PREFIX}${user.id}:${jti}`, JWT_REFRESH_EXPIRES_IN, '1');
    } catch (err) {
      logger.warn('[me.changePassword] 新 jti 写入 Redis 失败', { userId: user.id, error: err.message });
    }

    await writeActionLog(req.userId, 'change_password', null, clientIp(req));

    return res.ok({ token, refreshToken, expiresIn: JWT_EXPIRES_IN });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  recordConsent,
  listConsent,
  exportMyData,
  deleteAccount,
  changePassword,
  // 内部工具暴露给测试
  _purgeRefreshTokens: purgeRefreshTokens
};
