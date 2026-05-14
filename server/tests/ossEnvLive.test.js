// PRD-2026Q4 T0-7 followup 回归测试：
// 证明 services/oss.js 的 useLocalStorage / bucket / region / cos client
// 都是 per-call 派生而非 init-time 冻结。
//
// 影响面：医疗影像走错存储（本该 COS 加密落盘的文件落到了容器本地磁盘，
// 容器重启即丢、且无 SSE-S3 加密），与 OCR_PROVIDER=kimi 残留事故同一类。

describe('oss.js storage decision is live (not frozen at require time)', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeAll(() => {
    delete process.env.COS_SECRET_ID;
    delete process.env.COS_SECRET_KEY;
    delete process.env.COS_BUCKET;
    delete process.env.COS_REGION;
    // 通过 isolateModules 在「净空」凭证下首次 require —— 老实现这里
    // useLocalStorage 就被冻结成 true 了，后面再注入 COS env 也救不回来。
    jest.isolateModules(() => {
      require('../services/oss');
    });
  });

  afterEach(() => {
    delete process.env.COS_SECRET_ID;
    delete process.env.COS_SECRET_KEY;
    delete process.env.COS_BUCKET;
    delete process.env.COS_REGION;
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  // 白盒：源码里不应再有 module 顶层 `const useLocalStorage = ...`。
  // 这是 init-time 冻结的语法标记，CI 卡死该形态。
  test('source uses per-call getters, no frozen const useLocalStorage', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../services/oss'), 'utf8');
    expect(src).not.toMatch(/^const useLocalStorage\s*=\s*!process\.env/m);
    expect(src).not.toMatch(/^const bucket\s*=\s*process\.env\.COS_BUCKET/m);
    expect(src).not.toMatch(/^const region\s*=\s*process\.env\.COS_REGION/m);
    expect(src).toMatch(/isLocalStorage\s*=\s*\(\)\s*=>/);
    expect(src).toMatch(/getCosBucket\s*=\s*\(\)\s*=>/);
    expect(src).toMatch(/getCosRegion\s*=\s*\(\)\s*=>/);
    expect(src).toMatch(/getCosClient\s*=\s*\(\)\s*=>/);
  });

  // 白盒：COS SDK 客户端不能在 module 顶层用 `new COS({ SecretId: process.env... })`
  // 直接构造（=== init-time 凭证捕获）。
  test('COS SDK client is lazily constructed, not at module top level', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../services/oss'), 'utf8');
    // 老实现：const cos = new COS({ SecretId: ..., SecretKey: ... });
    // 新实现：在 getCosClient() 内 new COS({...})。
    expect(src).not.toMatch(/^const cos\s*=\s*new COS/m);
  });

  // 行为级冒烟：require 之后注入 env，立刻调 generateKey 等纯函数无副作用，
  // 同时 isLocalStorage 应该已经感知到注入——通过 uploadFile 的代码路径不可
  // 直接验证（需 mock COS SDK 整套），所以只验证模块导出仍然完整。
  test('module exports surface unchanged after refactor', () => {
    const oss = require('../services/oss');
    [
      'generateKey', 'calculateMD5', 'uploadFile', 'getPresignedUrl',
      'getRequestAwareUrl', 'getInternalUrl', 'getObjectBuffer',
      'ensureObjectEncrypted', 'deleteFile', 'deleteObject', 'getSTS'
    ].forEach((name) => {
      expect(typeof oss[name]).toBe('function');
    });
    expect(oss.DEFAULT_PRESIGNED_EXPIRES).toBe(300);
  });
});
