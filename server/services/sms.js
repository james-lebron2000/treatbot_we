/**
 * 短信验证码服务
 * 当前模式：随机验证码 + Redis 缓存 + 日志输出
 * 后续可通过 SMS_PROVIDER=tencent 切换到腾讯云短信
 *
 * PRD-2026Q2 §3.6「SMS 反刷」：在已有 60s phone 锁上再叠三重量化上限
 *  - 单号单日上限：sms:phone:count:{phone}:{yyyyMMdd}  > 5
 *  - 单 IP 小时上限：sms:ip:{ip}:{yyyyMMddHH}         > 20
 *  - 同 IP 跨号上限：sms:ip-phones:{ip}:{yyyyMMdd}     > 10 个不同号
 * 任一命中即拒发，并返回 { success:false, code:'sms_abuse_*', retryAfter }，
 * 由控制层翻译成 429 + res.fail。
 */
const logger = require('../utils/logger');
const { redisClient } = require('../middleware/rateLimit');
const { _maskPhone: maskPhone } = require('../utils/piiScrubber');

// 模块内持有一个 redis 客户端引用；测试时通过 jest.mock('../middleware/rateLimit') 注入
const redis = redisClient;

const CODE_TTL = 300;       // 验证码有效期 5 分钟
const SEND_INTERVAL = 60;   // 发送间隔 60 秒

/**
 * 短信文案模板 —— 品牌调性守则（docs/brand-voice-guidelines.md）：
 * - 统一用「您」；温暖陪伴、不讲术语
 * - 验证码要附防诈提示（不会让任何人转账）
 * - 匹配更新/联系预告要有温度：「好消息」「请留意」而不是冷冰冰的「通知」
 */
const SMS_TEMPLATES = {
  loginCode: (code) =>
    `【数愈健康】您的验证码 ${code}，5 分钟内有效。我们不会因为任何理由让您转账，请警惕诈骗。`,
  matchesUpdate: ({ name, count, url = 'https://inseq.top' }) =>
    `【数愈健康】好消息 —— 为${name ? ` ${name} ` : '您家人'}找到 ${count} 个新的可能性，登录查看：${url}`,
  trialContactPreview: ({ trialId, prefix = '021/010' }) =>
    `【数愈健康】${trialId} 研究团队即将联系您，请留意 ${prefix} 开头来电，尽量接听。需要帮助请回复 HELP`,
  enrolledConfirm: ({ name }) =>
    `【数愈健康】太好了 —— ${name ? `${name} ` : ''}成功入组。接下来请听主治医生安排，我们会把您的资料安全归档，随时可以找回。`,
  accountDeletedConfirm: () =>
    `【数愈健康】您的账户和全部数据已彻底删除。谢谢信任我们 —— 如果将来需要，随时回来。`,
};

// PRD-2026Q2 §3.6：反刷配额
const LIMIT_PHONE_PER_DAY = 5;
const LIMIT_IP_PER_HOUR = 20;
const LIMIT_IP_DISTINCT_PHONES_PER_DAY = 10;

const codeKey = (phone) => `sms:code:${phone}`;
const lockKey = (phone) => `sms:lock:${phone}`;

const pad2 = (n) => String(n).padStart(2, '0');
const yyyyMMdd = (d = new Date()) =>
  `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
const yyyyMMddHH = (d = new Date()) =>
  `${yyyyMMdd(d)}${pad2(d.getHours())}`;

// 计算离「明天 00:00」的秒数（单号/单 IP-跨号配额 TTL）
const secondsUntilNextDay = (d = new Date()) => {
  const next = new Date(d);
  next.setDate(d.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return Math.max(1, Math.ceil((next.getTime() - d.getTime()) / 1000));
};
// 计算离「下个小时」的秒数（IP-小时配额 TTL）
const secondsUntilNextHour = (d = new Date()) => {
  const next = new Date(d);
  next.setMinutes(0, 0, 0);
  next.setHours(d.getHours() + 1);
  return Math.max(1, Math.ceil((next.getTime() - d.getTime()) / 1000));
};

const generateCode = () => String(Math.floor(1000 + Math.random() * 9000));

// PRD-2026Q2 §3.6：三重风控检查；命中返回 { code, message, retryAfter }
const checkAbuseLimits = async (phone, ip) => {
  const now = new Date();
  const day = yyyyMMdd(now);
  const hour = yyyyMMddHH(now);

  // 1) 单号单日上限
  const phoneKey = `sms:phone:count:${phone}:${day}`;
  const phoneCount = await redis.incr(phoneKey);
  if (phoneCount === 1) {
    await redis.expire(phoneKey, secondsUntilNextDay(now));
  }
  if (phoneCount > LIMIT_PHONE_PER_DAY) {
    return {
      code: 'sms_abuse_phone_day',
      message: '今天验证码发得有点多了，明天再试好吗？',
      retryAfter: secondsUntilNextDay(now)
    };
  }

  // 2) 同 IP 小时上限（无 ip 时跳过 ip 维度，例如 CLI 压测）
  if (ip) {
    const ipKey = `sms:ip:${ip}:${hour}`;
    const ipCount = await redis.incr(ipKey);
    if (ipCount === 1) {
      await redis.expire(ipKey, secondsUntilNextHour(now));
    }
    if (ipCount > LIMIT_IP_PER_HOUR) {
      return {
        code: 'sms_abuse_ip_hour',
        message: '您操作得挺快，稍等一会我们就能继续',
        retryAfter: secondsUntilNextHour(now)
      };
    }

    // 3) 同 IP 跨号上限：用 Set 统计今日曾发过的不同号码
    const ipPhonesKey = `sms:ip-phones:${ip}:${day}`;
    const alreadyCounted = await redis.sismember(ipPhonesKey, phone);
    if (!alreadyCounted) {
      await redis.sadd(ipPhonesKey, phone);
      await redis.expire(ipPhonesKey, secondsUntilNextDay(now));
    }
    const distinctPhones = await redis.scard(ipPhonesKey);
    if (distinctPhones > LIMIT_IP_DISTINCT_PHONES_PER_DAY) {
      return {
        code: 'sms_abuse_ip_phones',
        message: '这个网络下今天发得有点多了，明天再试好吗？',
        retryAfter: secondsUntilNextDay(now)
      };
    }
  }

  return null;
};

/**
 * 发送验证码
 * @param {string} phone
 * @param {string} [ip] PRD-2026Q2 §3.6：调用方（controller）需把 req.ip 传过来
 * @returns {{ success: boolean, message: string, code?: string, retryAfter?: number }}
 */
const sendCode = async (phone, ip) => {
  // 检查发送间隔（原有 60s 锁）
  const locked = await redis.get(lockKey(phone));
  if (locked) {
    return { success: false, message: '刚刚发过了 —— 稍等 60 秒再试', retryAfter: SEND_INTERVAL };
  }

  // PRD-2026Q2 §3.6：风控三重量化
  const abuse = await checkAbuseLimits(phone, ip);
  if (abuse) {
    // PRD-2026Q4 T0-7 followup（PHI logging）：phone 走 maskPhone(末 4)，IP 不算 PHI 保留。
    logger.warn('[SMS] 反刷命中', { phone: maskPhone(phone), ip, code: abuse.code });
    return {
      success: false,
      code: abuse.code,
      message: abuse.message,
      retryAfter: abuse.retryAfter
    };
  }

  const code = generateCode();

  // 存入 Redis
  await redis.setex(codeKey(phone), CODE_TTL, code);
  await redis.setex(lockKey(phone), SEND_INTERVAL, '1');

  // 当前模式：日志输出（生产环境查 docker logs 获取）
  const provider = process.env.SMS_PROVIDER || 'log';

  // 给用户发送的真实短信文本（接入腾讯云时传入模板）
  const smsText = SMS_TEMPLATES.loginCode(code);

  // PRD-2026Q4 T0-7 followup（PHI logging）：
  //   - phone 全部走 maskPhone(末 4)；
  //   - smsText 含明文验证码，仅在 NODE_ENV !== 'production' 时打印 code_len 而非内容。
  //     生产 docker logs / Sentry / 文件备份都不会落明文 OTP。
  const phoneMasked = maskPhone(phone);
  if (provider === 'tencent') {
    // TODO: 接入腾讯云短信，传入 smsText 或对应模板 ID
    logger.info(`[SMS] 腾讯云短信暂未配置，验证码已存储: phone=${phoneMasked}`);
  } else if (process.env.NODE_ENV === 'production') {
    logger.info(`[SMS] 即将发送（模板）: phone=${phoneMasked} code_len=${code.length}`);
  } else {
    // 仅 dev / 联调环境打印明文短信，方便人工 debug。
    logger.info(`[SMS] 即将发送（dev）: phone=${phoneMasked} | ${smsText}`);
  }

  return { success: true, message: '验证码已发送给您' };
};

/**
 * 验证验证码（一次性，验证后删除）
 * @returns {{ valid: boolean, message: string }}
 */
const verifyCode = async (phone, code) => {
  if (!code) {
    return { valid: false, message: '先填一下验证码？' };
  }

  const stored = await redis.get(codeKey(phone));
  if (!stored) {
    return { valid: false, message: '验证码过期啦 —— 让我们重发一次？' };
  }

  if (`${code}` !== `${stored}`) {
    return { valid: false, message: '验证码对不上呢，再核对一下？' };
  }

  // 验证成功，删除验证码（一次性使用）
  await redis.del(codeKey(phone));

  return { valid: true, message: 'ok' };
};

module.exports = { sendCode, verifyCode, SMS_TEMPLATES };
