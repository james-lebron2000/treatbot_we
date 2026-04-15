/**
 * 短信验证码服务
 * 当前模式：随机验证码 + Redis 缓存 + 日志输出
 * 后续可通过 SMS_PROVIDER=tencent 切换到腾讯云短信
 */
const Redis = require('ioredis');
const logger = require('../utils/logger');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: 0
});

const CODE_TTL = 300;       // 验证码有效期 5 分钟
const SEND_INTERVAL = 60;   // 发送间隔 60 秒

const codeKey = (phone) => `sms:code:${phone}`;
const lockKey = (phone) => `sms:lock:${phone}`;

const generateCode = () => String(Math.floor(1000 + Math.random() * 9000));

/**
 * 发送验证码
 * @returns {{ success: boolean, message: string }}
 */
const sendCode = async (phone) => {
  // 检查发送间隔
  const locked = await redis.get(lockKey(phone));
  if (locked) {
    return { success: false, message: '发送过于频繁，请60秒后重试' };
  }

  const code = generateCode();

  // 存入 Redis
  await redis.setex(codeKey(phone), CODE_TTL, code);
  await redis.setex(lockKey(phone), SEND_INTERVAL, '1');

  // 当前模式：日志输出（生产环境查 docker logs 获取）
  const provider = process.env.SMS_PROVIDER || 'log';

  if (provider === 'tencent') {
    // TODO: 接入腾讯云短信
    // const tencentcloud = require('tencentcloud-sdk-nodejs');
    // const SmsClient = tencentcloud.sms.v20210111.Client;
    // ...
    logger.info(`[SMS] 腾讯云短信暂未配置，验证码已存储: phone=${phone}`);
  } else {
    logger.info(`[SMS] 验证码: phone=${phone}, code=${code}`);
  }

  return { success: true, message: '验证码已发送' };
};

/**
 * 验证验证码（一次性，验证后删除）
 * @returns {{ valid: boolean, message: string }}
 */
const verifyCode = async (phone, code) => {
  if (!code) {
    return { valid: false, message: '请输入验证码' };
  }

  const stored = await redis.get(codeKey(phone));
  if (!stored) {
    return { valid: false, message: '验证码已过期，请重新发送' };
  }

  if (`${code}` !== `${stored}`) {
    return { valid: false, message: '验证码错误' };
  }

  // 验证成功，删除验证码（一次性使用）
  await redis.del(codeKey(phone));

  return { valid: true, message: 'ok' };
};

module.exports = { sendCode, verifyCode };
