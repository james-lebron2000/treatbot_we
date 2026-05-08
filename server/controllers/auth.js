const axios = require('axios');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const logger = require('../utils/logger');
const { success, error } = require('../utils/response');
const { BusinessError } = require('../middleware/errorHandler');
const { redisClient } = require('../middleware/rateLimit');
const smsService = require('../services/sms');
const captchaService = require('../services/captcha');
const { JWT_SECRET } = require('../utils/jwtSecret');

const JWT_EXPIRES_IN = parseInt(process.env.JWT_EXPIRES_IN) || 1800;  // 30 分钟
const JWT_REFRESH_EXPIRES_IN = parseInt(process.env.JWT_REFRESH_EXPIRES_IN) || 604800;  // 7 天

// PRD-2026Q4 T0-7 followup：WEAPP_APPID / WEAPP_SECRET 必须 per-call 重读。
// 老实现把这两条写成 module 顶层 const → 容器启动时 env 缺失会冻结成 undefined，
// 即便后续 secret rotate / 灰度切环境也救不回来（同 OCR_PROVIDER=kimi 残留事故）。
// 微信登录是核心入口，凭证错一次就是全量登录失败，影响面比 OCR 还大。
const getWeappAppId = () => process.env.WEAPP_APPID || '';
const getWeappSecret = () => process.env.WEAPP_SECRET || '';
const WEAPP_SESSION_KEY_PREFIX = 'weapp:session_key:';
const WEAPP_ACCESS_TOKEN_STORAGE_KEY = 'weapp:access_token';

const toPositiveInt = (value, fallback) => {
  const num = parseInt(value, 10);
  if (Number.isNaN(num) || num <= 0) {
    return fallback;
  }
  return num;
};

const WEAPP_SESSION_TTL_SECONDS = toPositiveInt(process.env.WEAPP_SESSION_TTL, 7200);
// H5_LOGIN_ENABLED / H5_LOGIN_FIXED_CODE 也走 per-call。
// 安全相关：H5_LOGIN_FIXED_CODE 是「万能验证码」，老实现冻结后即便运维把 env
// 改空也救不回来——这就是 inseq.top 生产环境暴露 000000 的根因之一。
// 同时把默认值从 '000000' 改成空串：未配置 == 不接受任何固定码（fail-closed），
// 老实现的默认接受 000000 是 inseq.top 后门事故的另一半成因。
const isH5LoginEnabled = () =>
  process.env.H5_LOGIN_ENABLED === 'true' || process.env.NODE_ENV !== 'production';
const getH5LoginFixedCode = () => process.env.H5_LOGIN_FIXED_CODE || '';
const localSessionKeyCache = new Map();
let localAccessTokenCache = { token: '', expiresAt: 0 };

const normalizePhone = (value) => {
  const onlyDigits = `${value || ''}`.replace(/\D/g, '');
  if (!onlyDigits) {
    return '';
  }
  if (onlyDigits.length === 11 && onlyDigits.startsWith('1')) {
    return onlyDigits;
  }
  return '';
};

// PRD-2026Q2 §3.4：refresh token 带 jti，登录/刷新时把 jti 写到 Redis
// （key = refresh:{userId}:{jti}，TTL = refresh 过期秒数）。刷新时必须命中白名单；
// 命中后立刻删除旧 jti，写入新 jti → 滚动式一次性使用，防止旧 refresh 被重放。
const REFRESH_TOKEN_PREFIX = 'refresh:';
const refreshTokenRedisKey = (userId, jti) => `${REFRESH_TOKEN_PREFIX}${userId}:${jti}`;

const generateJti = () => crypto.randomBytes(16).toString('hex');

const persistRefreshJti = async (userId, jti) => {
  try {
    await redisClient.setex(refreshTokenRedisKey(userId, jti), JWT_REFRESH_EXPIRES_IN, '1');
  } catch (err) {
    logger.warn('refresh jti 写入 Redis 失败，继续但失去滚动黑名单能力', {
      userId,
      error: err.message
    });
  }
};

const revokeRefreshJti = async (userId, jti) => {
  try {
    await redisClient.del(refreshTokenRedisKey(userId, jti));
  } catch (err) {
    logger.warn('refresh jti 撤销失败', { userId, error: err.message });
  }
};

const isRefreshJtiValid = async (userId, jti) => {
  try {
    const hit = await redisClient.get(refreshTokenRedisKey(userId, jti));
    return Boolean(hit);
  } catch (err) {
    // Redis 挂了不应该直接踢下线 —— 记录 warn 并放行（与当前 session_key 策略一致）
    logger.warn('refresh jti 校验失败，Redis 异常回退到放行', { userId, error: err.message });
    return true;
  }
};

const buildTokenPayload = (user) => {
  const jti = generateJti();
  const payload = {
    token: jwt.sign(
      { userId: user.id, openid: user.openid },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    ),
    refreshToken: jwt.sign(
      { userId: user.id, openid: user.openid, type: 'refresh', jti },
      JWT_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRES_IN }
    ),
    expiresIn: JWT_EXPIRES_IN,
    _refreshJti: jti
  };
  return payload;
};

const issueLoginTokens = async (user) => {
  const payload = buildTokenPayload(user);
  await persistRefreshJti(user.id, payload._refreshJti);
  const { _refreshJti, ...clientPayload } = payload;
  return clientPayload;
};

const buildLoginResponse = async (user) => {
  const tokenPayload = await issueLoginTokens(user);
  return {
    ...tokenPayload,
    userInfo: {
      id: user.id,
      nickName: user.nickname,
      avatarUrl: user.avatar_url,
      phone: user.phone
    }
  };
};

const getSessionKeyStorageKey = (userId) => `${WEAPP_SESSION_KEY_PREFIX}${userId}`;

const cacheSessionKey = async (userId, sessionKey) => {
  if (!userId || !sessionKey) {
    return;
  }

  const expiresAt = Date.now() + WEAPP_SESSION_TTL_SECONDS * 1000;
  localSessionKeyCache.set(userId, { sessionKey, expiresAt });

  try {
    await redisClient.setex(getSessionKeyStorageKey(userId), WEAPP_SESSION_TTL_SECONDS, sessionKey);
  } catch (err) {
    logger.warn('缓存 session_key 到 Redis 失败，已回退内存缓存', { userId, error: err.message });
  }
};

const getCachedSessionKey = async (userId) => {
  if (!userId) {
    return '';
  }

  try {
    const fromRedis = await redisClient.get(getSessionKeyStorageKey(userId));
    if (fromRedis) {
      return fromRedis;
    }
  } catch (err) {
    logger.warn('从 Redis 读取 session_key 失败，尝试内存缓存', { userId, error: err.message });
  }

  const localCached = localSessionKeyCache.get(userId);
  if (!localCached) {
    return '';
  }
  if (Date.now() > localCached.expiresAt) {
    localSessionKeyCache.delete(userId);
    return '';
  }
  return localCached.sessionKey;
};

const cacheAccessToken = async (accessToken, expiresInSeconds) => {
  if (!accessToken) {
    return;
  }

  const ttl = Math.max(60, (parseInt(expiresInSeconds, 10) || 7200) - 120);
  localAccessTokenCache = {
    token: accessToken,
    expiresAt: Date.now() + ttl * 1000
  };

  try {
    await redisClient.setex(WEAPP_ACCESS_TOKEN_STORAGE_KEY, ttl, accessToken);
  } catch (err) {
    logger.warn('缓存 access_token 到 Redis 失败，已回退内存缓存', { error: err.message });
  }
};

const getCachedAccessToken = async () => {
  try {
    const fromRedis = await redisClient.get(WEAPP_ACCESS_TOKEN_STORAGE_KEY);
    if (fromRedis) {
      return fromRedis;
    }
  } catch (err) {
    logger.warn('从 Redis 读取 access_token 失败，尝试内存缓存', { error: err.message });
  }

  if (localAccessTokenCache.token && Date.now() < localAccessTokenCache.expiresAt) {
    return localAccessTokenCache.token;
  }

  return '';
};

const getWeappAccessToken = async () => {
  const cached = await getCachedAccessToken();
  if (cached) {
    return cached;
  }

  const tokenRes = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
    params: {
      grant_type: 'client_credential',
      appid: getWeappAppId(),
      secret: getWeappSecret()
    }
  });

  const { access_token: accessToken, expires_in: expiresIn, errcode, errmsg } = tokenRes.data || {};
  if (errcode || !accessToken) {
    throw new BusinessError(`获取微信 access_token 失败: ${errmsg || errcode || 'unknown error'}`, 502);
  }

  await cacheAccessToken(accessToken, expiresIn);
  return accessToken;
};

const getWechatPhoneByCode = async (code) => {
  if (!code) {
    return '';
  }

  const accessToken = await getWeappAccessToken();
  const phoneRes = await axios.post(
    `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`,
    { code },
    {
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );

  const { errcode, errmsg, phone_info: phoneInfo, phoneInfo: camelPhoneInfo } = phoneRes.data || {};
  if (errcode) {
    throw new BusinessError(`获取微信手机号失败: ${errmsg || errcode}`, 400);
  }

  return normalizePhone(
    (phoneInfo && (phoneInfo.phoneNumber || phoneInfo.purePhoneNumber))
      || (camelPhoneInfo && (camelPhoneInfo.phoneNumber || camelPhoneInfo.purePhoneNumber))
  );
};

const decodeWechatPhone = ({ sessionKey, encryptedData, iv }) => {
  try {
    const decipher = crypto.createDecipheriv(
      'aes-128-cbc',
      Buffer.from(sessionKey, 'base64'),
      Buffer.from(iv, 'base64')
    );
    decipher.setAutoPadding(true);

    let decoded = decipher.update(encryptedData, 'base64', 'utf8');
    decoded += decipher.final('utf8');
    const payload = JSON.parse(decoded);

    const watermarkAppId = payload && payload.watermark && payload.watermark.appid;
    if (watermarkAppId && getWeappAppId() && watermarkAppId !== getWeappAppId()) {
      throw new Error('watermark appid 不匹配');
    }

    return normalizePhone(payload.phoneNumber || payload.purePhoneNumber || payload.phone_info?.phoneNumber);
  } catch (err) {
    logger.warn('微信手机号解密失败', { userId: 'unknown', error: err.message });
    return '';
  }
};

/**
 * 微信小程序登录
 */
const weappLogin = async (req, res, next) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json(error('缺少微信登录 code', 400));
    }
    
    // 调用微信接口获取 openid 和 session_key
    const wxResponse = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
      params: {
        appid: getWeappAppId(),
        secret: getWeappSecret(),
        js_code: code,
        grant_type: 'authorization_code'
      }
    });
    
    const { openid, session_key, unionid, errcode, errmsg } = wxResponse.data;
    
    if (errcode) {
      logger.error('微信登录失败:', { errcode, errmsg });
      return res.status(400).json(error('微信登录失败: ' + errmsg, 400));
    }
    
    // 查找或创建用户
    let user = await User.findOne({ where: { openid } });
    
    if (!user) {
      user = await User.create({
        openid,
        unionid,
        nickname: '微信用户',
        avatar_url: ''
      });
      logger.info('新用户注册:', { userId: user.id, openid });
    }

    if (session_key) {
      await cacheSessionKey(user.id, session_key);
    } else {
      logger.warn('微信登录未返回 session_key，后续手机号解密可能失败', { userId: user.id });
    }

    res.json(success(await buildLoginResponse(user)));

  } catch (err) {
    next(err);
  }
};

/**
 * 刷新 Token
 */
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json(error('缺少刷新令牌', 400));
    }

    const decoded = jwt.verify(refreshToken, JWT_SECRET);

    if (decoded.type !== 'refresh') {
      return res.status(401).json(error('无效的刷新令牌', 401));
    }

    // PRD-2026Q2 §3.4：jti 必须在 Redis 白名单里。老 token（登录时未分配 jti）
    // 走兼容路径，但会建议客户端下一次必须用新 refresh。
    if (decoded.jti) {
      const valid = await isRefreshJtiValid(decoded.userId, decoded.jti);
      if (!valid) {
        return res.status(401).json(error('刷新令牌已失效，请重新登录', 401));
      }
    }

    const user = await User.findByPk(decoded.userId);

    if (!user) {
      return res.status(404).json(error('用户不存在', 404));
    }

    // 旧 jti 一次性消耗 → 立即撤销，写入新 jti。
    if (decoded.jti) {
      await revokeRefreshJti(decoded.userId, decoded.jti);
    }
    const fresh = buildTokenPayload(user);
    await persistRefreshJti(user.id, fresh._refreshJti);

    const { _refreshJti, ...clientPayload } = fresh;
    res.json(success(clientPayload));

  } catch (err) {
    // 区分两类错误：
    //   - jwt.verify 失败（malformed / 签名错 / 过期）→ 用户态错误，401
    //   - 其余（DB 断 / Redis 断）→ 真正的服务端故障，让全局 errorHandler 出 500
    // 之前仅 catch TokenExpiredError，导致前端发个乱码 refreshToken 被打成 500，
    // 监控会误报"服务端故障"。
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json(error('刷新令牌已过期', 401));
    }
    if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') {
      return res.status(401).json(error('无效的刷新令牌', 401));
    }
    next(err);
  }
};

/**
 * H5 登录（默认仅开发/联调开启）
 */
const h5Login = async (req, res, next) => {
  try {
    if (!isH5LoginEnabled()) {
      return res.status(501).json(error('当前环境未开启 H5 登录，请使用小程序登录', 501));
    }

    const { phone, code } = req.body || {};
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json(error('请输入有效手机号', 400));
    }
    if (!code) {
      return res.status(400).json(error('缺少验证码', 400));
    }
    // 优先检查固定验证码（开发/演示），其次检查 Redis 动态验证码
    const fixedMatch = getH5LoginFixedCode() && `${code}` === `${getH5LoginFixedCode()}`;
    if (!fixedMatch) {
      const verify = await smsService.verifyCode(normalizedPhone, code);
      if (!verify.valid) {
        return res.status(400).json(error(verify.message, 400));
      }
    }

    let user = await User.findOne({ where: { phone: normalizedPhone } });
    if (!user) {
      const openid = `h5_${normalizedPhone}`;
      const [createdUser] = await User.findOrCreate({
        where: { openid },
        defaults: {
          openid,
          nickname: `用户${normalizedPhone.slice(-4)}`,
          avatar_url: '',
          phone: normalizedPhone
        }
      });
      user = createdUser;
    } else if (!user.phone) {
      await user.update({ phone: normalizedPhone });
    }

    res.json(success(await buildLoginResponse(user)));
  } catch (err) {
    next(err);
  }
};

/**
 * 绑定手机号（优先走微信 code 换取手机号，兼容 encryptedData/iv）
 */
const bindPhone = async (req, res, next) => {
  try {
    const { code, encryptedData, iv, phoneNumber, phone, mobile } = req.body || {};
    let normalizedPhone = normalizePhone(phoneNumber || phone || mobile);

    if (!normalizedPhone && code) {
      normalizedPhone = await getWechatPhoneByCode(code);
    }

    if (!normalizedPhone && encryptedData && iv) {
      const sessionKey = await getCachedSessionKey(req.userId);
      if (!sessionKey) {
        return res.status(401).json(error('登录态已失效，请先重新登录后再绑定手机号', 401));
      }
      normalizedPhone = decodeWechatPhone({ sessionKey, encryptedData, iv });
    }

    if (!normalizedPhone) {
      throw new BusinessError('手机号解析失败，请重试微信授权或手动输入手机号', 400);
    }

    const [affected] = await User.update(
      { phone: normalizedPhone },
      { where: { id: req.userId } }
    );

    if (!affected) {
      throw new BusinessError('用户不存在', 404);
    }

    logger.info('手机号绑定成功', { userId: req.userId });
    res.json(success({ phone: normalizedPhone }, '绑定成功'));
  } catch (err) {
    next(err);
  }
};

/**
 * 发送短信验证码
 * PRD-2026Q2 §3.6：
 *  - 可选 captcha（ticket/randstr）前置校验，未配置腾讯 captcha 时自动放行
 *  - 三重风控由 smsService 落地，命中返回 429 + res.fail('sms_abuse_*', 429, { retryAfter })
 */
const sendVerificationCode = async (req, res, next) => {
  try {
    const { phone, ticket, randstr, captchaAppId } = req.body || {};
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      if (typeof res.fail === 'function') {
        return res.fail('请输入有效手机号', 400);
      }
      return res.status(400).json(error('请输入有效手机号', 400));
    }

    // PRD-2026Q2 §3.6：captcha 软集成——未配置则 verify 恒真
    const captchaResult = await captchaService.verify({
      ticket,
      randstr,
      userIp: req.ip,
      captchaAppId
    });
    if (!captchaResult.valid) {
      if (typeof res.fail === 'function') {
        return res.fail('captcha_invalid', 400, { reason: captchaResult.reason });
      }
      return res.status(400).json(error('captcha_invalid', 400, { reason: captchaResult.reason }));
    }

    const result = await smsService.sendCode(normalizedPhone, req.ip);
    if (!result.success) {
      // 风控命中：code 形如 sms_abuse_*；否则是老的 60s lock 文案
      const abuseCode = result.code || 'sms_abuse_locked';
      const retryAfter = result.retryAfter || 60;
      if (typeof res.fail === 'function') {
        return res.fail(abuseCode, 429, { retryAfter, message: result.message });
      }
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json(error(result.message, 429, { retryAfter }));
    }

    if (typeof res.ok === 'function') {
      return res.ok({ message: result.message });
    }
    res.json(success({ message: result.message }));
  } catch (err) {
    next(err);
  }
};

module.exports = {
  weappLogin,
  h5Login,
  refreshToken,
  bindPhone,
  sendVerificationCode
};
