/**
 * PRD-2026Q2 §3.4：refresh token 滚动 jti + 一次性使用。
 *  - 登录写入 Redis 白名单
 *  - refresh 命中白名单 → 旧 jti 立即撤销 + 写入新 jti
 *  - 重放旧 refresh → 401
 */

const jwt = require('jsonwebtoken');

const redisStore = new Map();
const mockRedis = {
  get: jest.fn((key) => Promise.resolve(redisStore.get(key) || null)),
  setex: jest.fn((key, _ttl, value) => {
    redisStore.set(key, value);
    return Promise.resolve('OK');
  }),
  del: jest.fn((key) => {
    redisStore.delete(key);
    return Promise.resolve(1);
  })
};

jest.mock('../middleware/rateLimit', () => ({
  redisClient: mockRedis,
  strictLimiter: (_req, _res, next) => next(),
  uploadLimiter: (_req, _res, next) => next()
}));

jest.mock('../services/sms', () => ({
  sendCode: jest.fn(),
  verifyCode: jest.fn()
}));

jest.mock('../models', () => {
  const users = new Map();
  return {
    User: {
      findByPk: (id) => Promise.resolve(users.get(id) || null),
      __set: (id, user) => users.set(id, user)
    }
  };
});

jest.mock('../utils/jwtSecret', () => ({ JWT_SECRET: 'test-secret-§3.4' }));

const { User } = require('../models');
const authController = require('../controllers/auth');

const buildRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

beforeEach(() => {
  redisStore.clear();
  mockRedis.get.mockClear();
  mockRedis.setex.mockClear();
  mockRedis.del.mockClear();
  User.__set('user_42', { id: 'user_42', openid: 'wx42', nickname: 'u', avatar_url: '', phone: '13800000042' });
});

describe('auth.refreshToken §3.4', () => {
  const buildRefresh = (payload) => jwt.sign(payload, 'test-secret-§3.4', { expiresIn: 604800 });

  test('未登录 / 未写白名单的 jti 被拒', async () => {
    const req = {
      body: {
        refreshToken: buildRefresh({ userId: 'user_42', type: 'refresh', jti: 'never-stored' })
      }
    };
    const res = buildRes();
    await authController.refreshToken(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    const payload = res.json.mock.calls[0][0];
    expect(payload.message).toMatch(/刷新令牌已失效/);
  });

  test('合法 jti → 返回新 token，旧 jti 被撤销', async () => {
    const originalJti = 'jti-1';
    redisStore.set(`refresh:user_42:${originalJti}`, '1');

    const req = {
      body: {
        refreshToken: buildRefresh({ userId: 'user_42', type: 'refresh', jti: originalJti })
      }
    };
    const res = buildRes();
    await authController.refreshToken(req, res, jest.fn());

    expect(res.status).not.toHaveBeenCalledWith(401);
    const payload = res.json.mock.calls[0][0];
    expect(payload.code).toBe(0);
    expect(payload.data.token).toBeTruthy();
    expect(payload.data.refreshToken).toBeTruthy();

    // 旧 jti 已被删除
    expect(redisStore.has(`refresh:user_42:${originalJti}`)).toBe(false);
    // 新 jti 被写入
    const keys = Array.from(redisStore.keys());
    expect(keys.find((k) => k.startsWith('refresh:user_42:') && !k.endsWith(originalJti))).toBeTruthy();

    // 客户端 payload 不应泄漏 _refreshJti
    expect(payload.data._refreshJti).toBeUndefined();
  });

  test('旧 refresh 被重放 → 401', async () => {
    const originalJti = 'jti-replay';
    redisStore.set(`refresh:user_42:${originalJti}`, '1');
    const oldRefresh = buildRefresh({ userId: 'user_42', type: 'refresh', jti: originalJti });

    // 第一次消耗
    await authController.refreshToken({ body: { refreshToken: oldRefresh } }, buildRes(), jest.fn());

    // 第二次（重放）
    const res2 = buildRes();
    await authController.refreshToken({ body: { refreshToken: oldRefresh } }, res2, jest.fn());
    expect(res2.status).toHaveBeenCalledWith(401);
  });

  test('type != refresh 被拒', async () => {
    const req = {
      body: {
        refreshToken: jwt.sign({ userId: 'user_42' }, 'test-secret-§3.4', { expiresIn: 60 })
      }
    };
    const res = buildRes();
    await authController.refreshToken(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('缺 refreshToken → 400', async () => {
    const req = { body: {} };
    const res = buildRes();
    await authController.refreshToken(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
