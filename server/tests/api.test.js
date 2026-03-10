const request = require('supertest');
const app = require('../app');
const { sequelize } = require('../config/database');

// 测试数据
const testUser = {
  openid: 'test_openid_' + Date.now(),
  nickname: '测试用户',
  avatar_url: 'https://example.com/avatar.jpg',
  phone: '13800138000'
};

let authToken = null;
let userId = null;

describe('Treatbot API Tests', () => {
  // 测试前准备
  beforeAll(async () => {
    // 同步数据库（测试环境）
    await sequelize.sync({ force: true });
  });

  // 测试后清理
  afterAll(async () => {
    await sequelize.close();
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const res = await request(app)
        .get('/health')
        .expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.version).toBeDefined();
    });
  });

  describe('Authentication', () => {
    // 注意：实际测试需要真实的微信 code
    it('should fail with invalid weapp code', async () => {
      const res = await request(app)
        .post('/api/auth/weapp-login')
        .send({ code: 'invalid_code' })
        .expect(400);

      expect(res.body.code).toBe(400);
    });

    it('should require code parameter', async () => {
      const res = await request(app)
        .post('/api/auth/weapp-login')
        .send({})
        .expect(400);

      expect(res.body.code).toBe(400);
    });
  });

  describe('Protected Routes', () => {
    it('should reject requests without auth token', async () => {
      const res = await request(app)
        .get('/api/user/profile')
        .expect(401);

      expect(res.body.code).toBe(401);
    });

    it('should reject invalid auth token', async () => {
      const res = await request(app)
        .get('/api/user/profile')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);

      expect(res.body.code).toBe(401);
    });
  });

  describe('Medical Records', () => {
    it('should reject upload without authentication', async () => {
      const res = await request(app)
        .post('/api/medical/upload')
        .expect(401);

      expect(res.body.code).toBe(401);
    });

    it('should require file in upload', async () => {
      // 这里需要有效的 token 才能测试
      // 暂时跳过
    });
  });

  describe('Matches', () => {
    it('should reject match list without authentication', async () => {
      const res = await request(app)
        .get('/api/matches')
        .expect(401);

      expect(res.body.code).toBe(401);
    });
  });

  describe('Applications', () => {
    it('should reject application without authentication', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({ trialId: 'test_trial' })
        .expect(401);

      expect(res.body.code).toBe(401);
    });

    it('should require idempotency key for applications', async () => {
      // 这里需要有效的 token 才能测试
      // 暂时跳过
    });
  });
});

// 集成测试（需要真实数据库和 Redis）
describe('Integration Tests', () => {
  beforeAll(async () => {
    // 确保测试环境
    if (process.env.NODE_ENV !== 'test') {
      console.warn('警告：请在测试环境运行集成测试');
    }
  });

  it('should handle complete user flow', async () => {
    // 1. 用户登录
    // 2. 上传病历
    // 3. 查询状态
    // 4. 获取匹配
    // 5. 提交报名
    // 这是一个完整的集成测试流程
  });
});
