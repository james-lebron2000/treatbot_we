/**
 * Plan §Phase 2.4：CDN 加速 LLM 拉图 —— wrapPresignedWithCdn 行为测试。
 *
 * 设计意图：
 *   - COS_CDN_DOMAIN 未配置 → 原样返回（无侵入）
 *   - 配置后 host 被改写，scheme 强制 https，签名查询串保留
 *   - 输入畸形 → 原样返回（fallback 到 COS，避免破坏 OCR 主路径）
 */

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const ORIGINAL_ENV = process.env.COS_CDN_DOMAIN;

beforeEach(() => {
  jest.resetModules();
  process.env.COS_CDN_DOMAIN = '';
});

afterAll(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.COS_CDN_DOMAIN;
  else process.env.COS_CDN_DOMAIN = ORIGINAL_ENV;
});

const loadOss = () => require('../services/oss');

describe('wrapPresignedWithCdn', () => {
  test('未配置 CDN 域名 → 原样返回', () => {
    const { wrapPresignedWithCdn } = loadOss();
    const url = 'https://my-bucket.cos.ap-shanghai.myqcloud.com/uploads/1/x.jpg?q-sign=...';
    expect(wrapPresignedWithCdn(url)).toBe(url);
  });

  test('配置 CDN 域名 → host 被改写，签名串保留', () => {
    process.env.COS_CDN_DOMAIN = 'ocr-cdn.example.com';
    const { wrapPresignedWithCdn } = loadOss();
    const url = 'https://my-bucket.cos.ap-shanghai.myqcloud.com/uploads/1/x.jpg?q-sign=AAA&q-sign-time=BBB';
    const out = wrapPresignedWithCdn(url);
    expect(out).toMatch(/^https:\/\/ocr-cdn\.example\.com\/uploads\/1\/x\.jpg\?/);
    expect(out).toMatch(/q-sign=AAA/);
    expect(out).toMatch(/q-sign-time=BBB/);
  });

  test('http URL → 强制 https', () => {
    process.env.COS_CDN_DOMAIN = 'cdn.example.com';
    const { wrapPresignedWithCdn } = loadOss();
    const out = wrapPresignedWithCdn('http://my-bucket.cos.ap-shanghai.myqcloud.com/k.jpg?s=1');
    expect(out.startsWith('https://cdn.example.com/')).toBe(true);
  });

  test('畸形输入 → 原样返回（fallback safety）', () => {
    process.env.COS_CDN_DOMAIN = 'cdn.example.com';
    const { wrapPresignedWithCdn } = loadOss();
    expect(wrapPresignedWithCdn('not-a-url')).toBe('not-a-url');
    expect(wrapPresignedWithCdn(null)).toBe(null);
    expect(wrapPresignedWithCdn('')).toBe('');
    expect(wrapPresignedWithCdn(undefined)).toBe(undefined);
  });

  test('CDN 域名前后空格 → trim', () => {
    process.env.COS_CDN_DOMAIN = '  cdn.example.com  ';
    const { wrapPresignedWithCdn } = loadOss();
    const out = wrapPresignedWithCdn('https://my-bucket.cos.ap-shanghai.myqcloud.com/k.jpg');
    expect(out.startsWith('https://cdn.example.com/')).toBe(true);
  });

  test('原 URL 带端口 → 端口被清掉（CDN 走默认 443）', () => {
    process.env.COS_CDN_DOMAIN = 'cdn.example.com';
    const { wrapPresignedWithCdn } = loadOss();
    const out = wrapPresignedWithCdn('https://x.cos.ap-shanghai.myqcloud.com:8443/k.jpg?s=1');
    expect(out).not.toContain(':8443');
    expect(out.startsWith('https://cdn.example.com/')).toBe(true);
  });
});
