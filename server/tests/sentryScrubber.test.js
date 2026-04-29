/**
 * Q3-红线 §A.3.1 测试：Sentry beforeSend 钩子的 PII 脱敏。
 *
 * 不需要真实 SDK 启用：sentry.js 即使在 SENTRY_DSN 未配置时也会导出 scrubPii。
 * 这里直接测脱敏副作用，覆盖手机号 / 邮箱两个最敏感字段。
 */

const sentry = require('../observability/sentry');

describe('sentryScrubber §A.3.1', () => {
  test('event.request.data 中手机号被替换为 [redacted]', () => {
    const event = {
      request: {
        data: {
          phone: '13800001234',
          message: '我的电话是 13912345678'
        }
      }
    };
    const out = sentry.scrubPii(event);
    expect(out).not.toBeNull();
    expect(out.request.data.phone).toBe('[redacted]');
    // 嵌入文本中的手机号也被脱敏
    expect(out.request.data.message).not.toContain('13912345678');
    expect(out.request.data.message).toContain('[redacted]');
  });

  test('event.extra 中邮箱被替换为 [redacted]', () => {
    const event = {
      extra: {
        body: 'contact me at user@example.com please'
      }
    };
    const out = sentry.scrubPii(event);
    expect(out.extra.body).not.toContain('user@example.com');
    expect(out.extra.body).toContain('[redacted]');
  });

  test('event.user 仅保留 id，丢弃 email/username', () => {
    const event = {
      user: { id: 'u_123', email: 'leak@example.com', username: 'leaky' }
    };
    const out = sentry.scrubPii(event);
    expect(out.user).toEqual({ id: 'u_123' });
  });

  test('captureException 在 DSN 未配置时退化为 noop（不抛错）', () => {
    expect(() => sentry.captureException(new Error('boom'), { tags: { x: 1 } })).not.toThrow();
  });
});
