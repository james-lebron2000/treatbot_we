/**
 * ocrSsrf.test.js — 防止 fetchImageAsDataUrl 被用来发起内网 / 任意 host 请求
 * 对应 PRD §2.6。
 */

const { __testables } = require('../services/ocr');
const { assertSafeImageUrl, isPrivateOrIpUrl } = __testables;

describe('assertSafeImageUrl (SSRF guard)', () => {
  const originalAllowlist = process.env.OCR_IMAGE_HOST_ALLOWLIST;

  afterEach(() => {
    if (originalAllowlist === undefined) {
      delete process.env.OCR_IMAGE_HOST_ALLOWLIST;
    } else {
      process.env.OCR_IMAGE_HOST_ALLOWLIST = originalAllowlist;
    }
  });

  test('拒绝非 http(s) 协议', () => {
    expect(() => assertSafeImageUrl('file:///etc/passwd')).toThrow('protocol_not_allowed');
    expect(() => assertSafeImageUrl('gopher://example.com/')).toThrow('protocol_not_allowed');
  });

  test('拒绝格式非法的 URL', () => {
    expect(() => assertSafeImageUrl('not a url')).toThrow('invalid_url');
  });

  test('拒绝云元数据/本机地址', () => {
    expect(() => assertSafeImageUrl('http://169.254.169.254/latest/meta-data'))
      .toThrow('blocked_private_host');
    expect(() => assertSafeImageUrl('http://127.0.0.1:3000/uploads/x'))
      .toThrow('blocked_private_host');
    expect(() => assertSafeImageUrl('http://localhost/x')).toThrow('blocked_private_host');
  });

  test('拒绝不在白名单内的公网 host', () => {
    expect(() => assertSafeImageUrl('https://evil.example.com/x.jpg'))
      .toThrow('host_not_allowed');
  });

  test('默认白名单放行腾讯云 COS 任意 region', () => {
    expect(() => assertSafeImageUrl(
      'https://treatbot-1300000000.cos.ap-shanghai.myqcloud.com/uploads/1.jpg?sig=abc'
    )).not.toThrow();
    expect(() => assertSafeImageUrl(
      'https://bucket.cos.ap-beijing.myqcloud.com/file.pdf'
    )).not.toThrow();
  });

  test('OCR_IMAGE_HOST_ALLOWLIST 可显式扩展', () => {
    process.env.OCR_IMAGE_HOST_ALLOWLIST = '.trusted-cdn.example,.myqcloud.com';
    expect(() => assertSafeImageUrl('https://a.trusted-cdn.example/x.jpg')).not.toThrow();
    expect(() => assertSafeImageUrl('https://bucket.cos.ap-beijing.myqcloud.com/x')).not.toThrow();
    expect(() => assertSafeImageUrl('https://evil.example.com/x')).toThrow('host_not_allowed');
  });
});

describe('isPrivateOrIpUrl', () => {
  test('原有公网/内网判定不回归', () => {
    expect(isPrivateOrIpUrl('http://localhost/x')).toBe(true);
    expect(isPrivateOrIpUrl('http://127.0.0.1/x')).toBe(true);
    expect(isPrivateOrIpUrl('http://10.0.0.1/x')).toBe(true);
    expect(isPrivateOrIpUrl('https://bucket.cos.ap-beijing.myqcloud.com/x')).toBe(false);
  });
});
