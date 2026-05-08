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

  // PRD-2026Q4 T0-7 followup（Sentry scrub gaps）—— 老 scrubPii 漏扫的字段。
  describe('scrub additional event fields', () => {
    test('exception.values[].value 中的手机号 / 身份证被替换', () => {
      const event = {
        exception: {
          values: [
            { type: 'Error', value: 'cannot find user 13800001234 with id 110101199001011234' }
          ]
        }
      };
      const out = sentry.scrubPii(event);
      const v = out.exception.values[0].value;
      expect(v).not.toContain('13800001234');
      expect(v).not.toContain('110101199001011234');
      expect(v).toContain('[redacted]');
    });

    test('breadcrumbs[].message 和 .data 中的手机号被替换', () => {
      const event = {
        breadcrumbs: [
          { type: 'http', message: 'GET /users/13800001234/profile', data: { url: '/users/13800001234/profile', status_code: 200 } },
          { type: 'log', message: 'sent SMS to user@example.com', data: { extra: { email: 'user@example.com' } } }
        ]
      };
      const out = sentry.scrubPii(event);
      expect(out.breadcrumbs[0].message).not.toContain('13800001234');
      expect(out.breadcrumbs[0].data.url).not.toContain('13800001234');
      expect(out.breadcrumbs[1].message).not.toContain('user@example.com');
      expect(out.breadcrumbs[1].data.extra.email).not.toContain('user@example.com');
    });

    test('request.headers 中 Authorization / Cookie 被整段 redacted', () => {
      const event = {
        request: {
          headers: {
            Authorization: 'Bearer eyJ.realtoken.signature',
            Cookie: 'sid=abcdef; phone=13800001234',
            'X-Admin-Token': 'admin-secret-key',
            'User-Agent': 'Mozilla/5.0'
          }
        }
      };
      const out = sentry.scrubPii(event);
      expect(out.request.headers.Authorization).toBe('[redacted]');
      expect(out.request.headers.Cookie).toBe('[redacted]');
      expect(out.request.headers['X-Admin-Token']).toBe('[redacted]');
      // 非敏感 header 保留（但仍走 redactString 兜底）
      expect(out.request.headers['User-Agent']).toBe('Mozilla/5.0');
    });

    test('request.url 含手机号路径段被替换', () => {
      const event = {
        request: { url: 'https://api.example.com/admin/users/13800001234/reveal' }
      };
      const out = sentry.scrubPii(event);
      expect(out.request.url).not.toContain('13800001234');
      expect(out.request.url).toContain('[redacted]');
    });

    test('request.query_string 含邮箱被替换', () => {
      const event = {
        request: { query_string: 'q=hello&email=leak@example.com' }
      };
      const out = sentry.scrubPii(event);
      expect(out.request.query_string).not.toContain('leak@example.com');
    });

    test('contexts 中的手机号 / 邮箱被替换', () => {
      const event = {
        contexts: {
          patient: { phone: '13800001234', email: 'p@example.com' },
          device: { name: 'iPhone' }
        }
      };
      const out = sentry.scrubPii(event);
      expect(out.contexts.patient.phone).toBe('[redacted]');
      expect(out.contexts.patient.email).toBe('[redacted]');
      expect(out.contexts.device.name).toBe('iPhone');
    });

    test('tags 中的手机号被替换', () => {
      const event = {
        tags: { 'patient.phone': '13800001234', env: 'production' }
      };
      const out = sentry.scrubPii(event);
      expect(out.tags['patient.phone']).toBe('[redacted]');
      expect(out.tags.env).toBe('production');
    });

    test('cookies 顶层字段被整段 redacted', () => {
      const event = { request: { cookies: { sid: 'abcdef', csrf: 'xyz' } } };
      const out = sentry.scrubPii(event);
      expect(out.request.cookies).toBe('[redacted]');
    });

    test('breadcrumbs 数组为空 / 缺失不抛错', () => {
      expect(() => sentry.scrubPii({ breadcrumbs: [] })).not.toThrow();
      expect(() => sentry.scrubPii({ breadcrumbs: null })).not.toThrow();
      expect(() => sentry.scrubPii({})).not.toThrow();
    });

    test('exception.values 缺失 / 不为数组不抛错', () => {
      expect(() => sentry.scrubPii({ exception: {} })).not.toThrow();
      expect(() => sentry.scrubPii({ exception: { values: null } })).not.toThrow();
    });
  });
});
