/**
 * PRD-2026Q2 §3.6「SMS 反刷」：
 *   - 单号单日 5 次
 *   - 单 IP 单小时 20 次
 *   - 同 IP 单日 10 个不同号
 *   - 现有 60s 锁不能退化
 *   - Captcha 未配置时放行
 */

// ---------- 内存 Redis（支持 string / set / incr / expire / sadd / sismember / scard）----------
const redisStore = new Map(); // key -> { type:'string'|'set', value }
const mockRedis = {
  get: jest.fn((key) => {
    const entry = redisStore.get(key);
    if (!entry) return Promise.resolve(null);
    if (entry.type !== 'string') return Promise.resolve(null);
    return Promise.resolve(entry.value);
  }),
  setex: jest.fn((key, _ttl, value) => {
    redisStore.set(key, { type: 'string', value });
    return Promise.resolve('OK');
  }),
  del: jest.fn((key) => {
    const had = redisStore.has(key);
    redisStore.delete(key);
    return Promise.resolve(had ? 1 : 0);
  }),
  incr: jest.fn((key) => {
    const entry = redisStore.get(key);
    const current = entry && entry.type === 'string' ? parseInt(entry.value, 10) || 0 : 0;
    const next = current + 1;
    redisStore.set(key, { type: 'string', value: String(next) });
    return Promise.resolve(next);
  }),
  expire: jest.fn(() => Promise.resolve(1)),
  sadd: jest.fn((key, member) => {
    let entry = redisStore.get(key);
    if (!entry || entry.type !== 'set') {
      entry = { type: 'set', value: new Set() };
      redisStore.set(key, entry);
    }
    const before = entry.value.size;
    entry.value.add(member);
    return Promise.resolve(entry.value.size - before);
  }),
  sismember: jest.fn((key, member) => {
    const entry = redisStore.get(key);
    if (!entry || entry.type !== 'set') return Promise.resolve(0);
    return Promise.resolve(entry.value.has(member) ? 1 : 0);
  }),
  scard: jest.fn((key) => {
    const entry = redisStore.get(key);
    if (!entry || entry.type !== 'set') return Promise.resolve(0);
    return Promise.resolve(entry.value.size);
  })
};

jest.mock('../middleware/rateLimit', () => ({
  redisClient: mockRedis,
  strictLimiter: (_req, _res, next) => next(),
  uploadLimiter: (_req, _res, next) => next()
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

beforeEach(() => {
  redisStore.clear();
  Object.values(mockRedis).forEach((fn) => fn.mockClear && fn.mockClear());
  jest.resetModules();
  delete process.env.TENCENT_CAPTCHA_APP_ID;
  delete process.env.TENCENT_CAPTCHA_SECRET_KEY;
});

describe('sms.sendCode §3.6 反刷', () => {
  test('单号单日 5 次通过，第 6 次被拒（sms_abuse_phone_day）', async () => {
    const smsService = require('../services/sms');
    const phone = '13800001111';

    for (let i = 0; i < 5; i += 1) {
      const r = await smsService.sendCode(phone, `10.0.0.${i + 1}`);
      expect(r.success).toBe(true);
      // 清掉 60s 锁，避免 phone lock 遮蔽 phone-day 配额
      redisStore.delete(`sms:lock:${phone}`);
    }

    const r6 = await smsService.sendCode(phone, '10.0.0.99');
    expect(r6.success).toBe(false);
    expect(r6.code).toBe('sms_abuse_phone_day');
    expect(r6.retryAfter).toBeGreaterThan(0);
  });

  test('单 IP 小时内 20 次通过，第 21 次被拒（sms_abuse_ip_hour）', async () => {
    const smsService = require('../services/sms');
    const ip = '203.0.113.7';

    for (let i = 0; i < 20; i += 1) {
      // 每次换不同手机号，避开 phone-day(5) 和 ip-phones(10)
      // 这里我们只想测 ip-hour —— 把 ip-phones set 提前撑满前清一下不行，
      // 直接用 10 个号绕开: 用 1..10 轮换，保证 ip-phones 固定 10（刚好等于阈值）；
      // phone-day 每号各 2 次也 ≤ 5 OK
      const phone = `138000020${String((i % 10) + 1).padStart(2, '0')}`;
      const r = await smsService.sendCode(phone, ip);
      expect(r.success).toBe(true);
      redisStore.delete(`sms:lock:${phone}`);
    }

    const r21 = await smsService.sendCode('13800002099', ip);
    expect(r21.success).toBe(false);
    // 可能先命中 ip_phones 或 ip_hour —— 我们通过上面的设计保证 ip-phones=10（≤10 阈值内），
    // 所以第 21 次会因为 IP 小时超 20 被拒
    expect(r21.code).toBe('sms_abuse_ip_hour');
  });

  test('同 IP 单日超过 10 个不同号 → 第 11 个号被拒（sms_abuse_ip_phones）', async () => {
    const smsService = require('../services/sms');
    const ip = '198.51.100.3';

    for (let i = 0; i < 10; i += 1) {
      const phone = `139000000${String(i).padStart(2, '0')}`;
      const r = await smsService.sendCode(phone, ip);
      expect(r.success).toBe(true);
      redisStore.delete(`sms:lock:${phone}`);
    }

    const r11 = await smsService.sendCode('13900000099', ip);
    expect(r11.success).toBe(false);
    expect(r11.code).toBe('sms_abuse_ip_phones');
  });

  test('60s lock 仍然生效（第二次连发，同号 < 60s）', async () => {
    const smsService = require('../services/sms');
    const phone = '13700000001';
    const first = await smsService.sendCode(phone, '10.0.0.1');
    expect(first.success).toBe(true);

    const second = await smsService.sendCode(phone, '10.0.0.1');
    expect(second.success).toBe(false);
    expect(second.message).toMatch(/60\s*秒/);
    // 明确：这不是被反刷误伤，而是原有 lock
    expect(second.code).toBeUndefined();
  });

  test('没有 ip 传入时不触发 ip 维度（向下兼容）', async () => {
    const smsService = require('../services/sms');
    const phone = '13600000002';
    const r = await smsService.sendCode(phone);
    expect(r.success).toBe(true);
    // 不应该创建任何 ip:* key
    const keys = Array.from(redisStore.keys());
    expect(keys.find((k) => k.startsWith('sms:ip:'))).toBeUndefined();
    expect(keys.find((k) => k.startsWith('sms:ip-phones:'))).toBeUndefined();
  });
});

describe('captcha §3.6 软集成', () => {
  test('TENCENT_CAPTCHA_APP_ID 为空时 verify 放行', async () => {
    const captcha = require('../services/captcha');
    expect(captcha.isEnabled()).toBe(false);
    const r = await captcha.verify({ ticket: '', randstr: '', userIp: '1.1.1.1' });
    expect(r.valid).toBe(true);
  });

  test('配置了 appId 但缺 ticket → 拒绝', async () => {
    process.env.TENCENT_CAPTCHA_APP_ID = 'fake-app-id';
    process.env.TENCENT_CAPTCHA_SECRET_KEY = 'fake-secret';
    const captcha = require('../services/captcha');
    expect(captcha.isEnabled()).toBe(true);
    const r = await captcha.verify({ ticket: '', randstr: '', userIp: '1.1.1.1' });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('missing_ticket');
  });
});
