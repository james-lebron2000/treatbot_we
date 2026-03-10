const axios = require('axios');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const logger = require('../utils/logger');
const { success, error } = require('../utils/response');
const { BusinessError } = require('../middleware/errorHandler');
const { redisClient } = require('../middleware/rateLimit');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = parseInt(process.env.JWT_EXPIRES_IN) || 1800;  // 30 分钟
const JWT_REFRESH_EXPIRES_IN = parseInt(process.env.JWT_REFRESH_EXPIRES_IN) || 604800;  // 7 天

const WEAPP_APPID = process.env.WEAPP_APPID;
const WEAPP_SECRET = process.env.WEAPP_SECRET;
const WEAPP_SESSION_KEY_PREFIX = 'weapp:session_key:';

const toPositiveInt = (value, fallback) => {
  const num = parseInt(value, 10);
  if (Number.isNaN(num) || num <= 0) {
    return fallback;
  }
  return num;
};

const WEAPP_SESSION_TTL_SECONDS = toPositiveInt(process.env.WEAPP_SESSION_TTL, 7200);
const H5_LOGIN_ENABLED = process.env.H5_LOGIN_ENABLED === 'true' || process.env.NODE_ENV !== 'production';
const H5_LOGIN_FIXED_CODE = process.env.H5_LOGIN_FIXED_CODE || '000000';
const localSessionKeyCache = new Map();

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

const buildTokenPayload = (user) => ({
  token: jwt.sign(
    { userId: user.id, openid: user.openid },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  ),
  refreshToken: jwt.sign(
    { userId: user.id, openid: user.openid, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN }
  ),
  expiresIn: JWT_EXPIRES_IN
});

const buildLoginResponse = (user) => {
  const tokenPayload = buildTokenPayload(user);
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
    if (watermarkAppId && WEAPP_APPID && watermarkAppId !== WEAPP_APPID) {
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
        appid: WEAPP_APPID,
        secret: WEAPP_SECRET,
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

    res.json(success(buildLoginResponse(user)));
    
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
    
    const user = await User.findByPk(decoded.userId);
    
    if (!user) {
      return res.status(404).json(error('用户不存在', 404));
    }
    
    const tokenPayload = buildTokenPayload(user);
    res.json(success(tokenPayload));
    
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json(error('刷新令牌已过期', 401));
    }
    next(err);
  }
};

/**
 * H5 登录（默认仅开发/联调开启）
 */
const h5Login = async (req, res, next) => {
  try {
    if (!H5_LOGIN_ENABLED) {
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
    if (H5_LOGIN_FIXED_CODE && `${code}` !== `${H5_LOGIN_FIXED_CODE}`) {
      return res.status(400).json(error('验证码错误', 400));
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

    res.json(success(buildLoginResponse(user)));
  } catch (err) {
    next(err);
  }
};

/**
 * 绑定手机号（优先走微信 encryptedData/iv 解密）
 */
const bindPhone = async (req, res, next) => {
  try {
    const { encryptedData, iv, phoneNumber, phone, mobile } = req.body || {};
    let normalizedPhone = normalizePhone(phoneNumber || phone || mobile);

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

module.exports = {
  weappLogin,
  h5Login,
  refreshToken,
  bindPhone
};
