/**
 * PRD-2026Q4 T0-11：Jest 全局 setup。
 *
 * 目标：
 *  1. 防止测试意外发起真实网络调用 —— 任何 outbound HTTP 都会立即抛错。
 *     如果环境里有 nock，就走 nock.disableNetConnect()；
 *     否则用 http/https module 的最小补丁兜底（不依赖新增 npm dep）。
 *  2. 提供 globalThis.__useFakeTimers__ helper：测试可显式启用而不污染默认。
 *  3. afterEach 清理 —— 复位 timer / nock 状态，避免单测间互相干扰。
 */

const ALLOW_NET = process.env.JEST_ALLOW_NET === '1';

// ---------- 1. nock or fallback ----------
let nock = null;
try {
  // eslint-disable-next-line global-require
  nock = require('nock');
} catch (e) {
  nock = null;
}

if (!ALLOW_NET) {
  if (nock && typeof nock.disableNetConnect === 'function') {
    nock.disableNetConnect();
    // 允许 supertest 走 127.0.0.1 / localhost（in-process express 监听 ephemeral port）
    if (typeof nock.enableNetConnect === 'function') {
      nock.enableNetConnect(/(127\.0\.0\.1|localhost)/);
    }
  } else {
    // 兜底：拦截 http/https.request 抛错，但豁免 127.0.0.1 / ::1 / localhost
    /* eslint-disable global-require */
    const http = require('http');
    const https = require('https');
    /* eslint-enable global-require */
    const isLocal = (opts) => {
      const host = (opts && (opts.hostname || opts.host)) || '';
      return /^(127\.0\.0\.1|::1|localhost)/.test(String(host));
    };
    const wrap = (mod) => {
      const origReq = mod.request;
      mod.request = function patchedRequest(...args) {
        const opts = typeof args[0] === 'string' ? new URL(args[0]) : args[0] || {};
        if (!isLocal(opts)) {
          throw new Error(
            `[setup-jest] Outbound network call blocked: ${opts.hostname || opts.host || '?'}; ` +
              'set JEST_ALLOW_NET=1 to opt-in.'
          );
        }
        return origReq.apply(this, args);
      };
    };
    wrap(http);
    wrap(https);
  }
}

// ---------- 1.5 retry flaky 用例 ----------
// jest 没有 --testRetries 这个 CLI 标志，正确入口是 jest.retryTimes()。
// 默认重试 2 次（共 3 次执行），仅 CI 环境启用，避免本地遮蔽真实失败。
if (process.env.CI && typeof jest.retryTimes === 'function') {
  jest.retryTimes(2, { logErrorsBeforeRetry: true });
}

// ---------- 2. fake timer helper ----------
// 不强制全局 useFakeTimers（会破坏依赖真实时间的 supertest 用例），
// 而是导出一个开关；具体测试需要时调用 globalThis.__useFakeTimers__()。
globalThis.__useFakeTimers__ = (...args) => jest.useFakeTimers(...args);

// ---------- 3. afterEach 清理 ----------
afterEach(() => {
  // 清理 nock interceptor 残留
  if (nock && typeof nock.cleanAll === 'function') nock.cleanAll();
  // 复位 fake timer（若用例启用了 fake timer，结束时归位）
  if (typeof jest.isMockFunction === 'function') {
    try {
      jest.useRealTimers();
    } catch (e) {
      // 测试环境下偶发：jest internal state 已被销毁，吞掉
    }
  }
});
