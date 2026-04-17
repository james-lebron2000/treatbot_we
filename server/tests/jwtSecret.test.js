/**
 * jwtSecret.test.js — JWT 秘钥启动校验
 *
 * 覆盖：
 *   - 生产环境未设置 → 抛错
 *   - 生产环境弱值 → 抛错
 *   - 生产环境长度不足 → 抛错
 *   - 非生产环境未设置 → 生成临时秘钥并警告
 *   - 非生产环境弱值 → 仍然抛错（堵死 'your-secret-key'）
 *   - 合法长秘钥 → 正常返回
 */

/**
 * 用 jest.isolateModules 确保每个用例重新执行 jwtSecret 顶层代码，
 * 以便触发启动校验。
 */
const loadFresh = () => {
  let mod;
  jest.isolateModules(() => {
    mod = require('../utils/jwtSecret');
  });
  return mod;
};

const expectThrowOnLoad = (matcher) => {
  expect(() => {
    jest.isolateModules(() => {
      require('../utils/jwtSecret');
    });
  }).toThrow(matcher);
};

describe('jwtSecret —— 启动校验', () => {
  let originalEnv;
  let originalSecret;
  let warnSpy;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    originalSecret = process.env.JWT_SECRET;
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
    warnSpy.mockRestore();
  });

  test('生产环境未设置 JWT_SECRET → 抛错', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    expectThrowOnLoad(/JWT_SECRET 未设置/);
  });

  test('生产环境命中弱值黑名单（your-secret-key） → 抛错', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'your-secret-key';
    expectThrowOnLoad(/弱值黑名单/);
  });

  test('生产环境命中弱值黑名单（大小写/空白不敏感） → 抛错', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = '  YOUR-SECRET-KEY  ';
    expectThrowOnLoad(/弱值黑名单/);
  });

  test('生产环境秘钥过短 → 抛错', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'short-but-not-in-blacklist'; // 26 字符
    expectThrowOnLoad(/长度/);
  });

  test('生产环境合法长秘钥 → 正常加载', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'X9a2b3c4d5e6f7g8h9i0jK1L2m3N4o5P6q7R8s9T0uV1w2X3';
    const mod = loadFresh();
    expect(mod.JWT_SECRET).toBe(process.env.JWT_SECRET);
    expect(mod.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
  });

  test('开发环境未设置 → 生成临时秘钥并 console.warn', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;
    const mod = loadFresh();
    expect(typeof mod.JWT_SECRET).toBe('string');
    expect(mod.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(warnSpy).toHaveBeenCalled();
    const warnMsg = warnSpy.mock.calls.map((c) => c.join(' ')).join(' ');
    expect(warnMsg).toMatch(/临时秘钥/);
  });

  test('开发环境命中弱值 → 依然抛错（堵死 your-secret-key）', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'your-secret-key';
    expectThrowOnLoad(/弱值黑名单/);
  });

  test('isWeak 识别全相同字符', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'X9a2b3c4d5e6f7g8h9i0jK1L2m3N4o5P6q7R8s9T0uV1w2X3';
    const mod = loadFresh();
    expect(mod._internal.isWeak('aaaa')).toBe(true);
    expect(mod._internal.isWeak('')).toBe(true);
    expect(mod._internal.isWeak(null)).toBe(true);
    expect(mod._internal.isWeak('X9a2b3c4d5e6f7g8h9i0jK1L2m3N4o5P6q7R8s9T0uV1w2X3')).toBe(false);
  });
});
