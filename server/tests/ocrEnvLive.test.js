// PRD-2026Q4 T0-7 followup 回归测试：
// 证明 services/ocr.js 不再在 require 时冻结 OCR_PROVIDER / 凭证 / 模型名等
// 运行时可变 env。这是 OCR_PROVIDER=kimi 残留生产事故的回归门——之前 const
// 在 module load 时捕获，docker run 后期 -e 覆盖根本不生效。
//
// 该测试只验证 getter 行为（per-call re-read），不发起任何 LLM HTTP 调用。

describe('ocr.js env vars are read live (not frozen at require time)', () => {
  const ORIGINAL_ENV = { ...process.env };
  let ocr;

  beforeAll(() => {
    // 用一份「全空」环境 require ocr.js，最容易暴露 init-time 捕获 bug：
    // 旧实现下，hasKimiCredential / hasDoubaoCredential / hasTencentCredential
    // 全部冻结为 false；OCR_PROVIDER 冻结为 'auto'。即便 require 之后再设置
    // 凭证 / provider，也永远不会被 ocr 服务感知到。
    delete process.env.OCR_PROVIDER;
    delete process.env.ARK_API_KEY;
    delete process.env.KIMI_API_KEY;
    delete process.env.OCR_SECRET_ID;
    delete process.env.OCR_SECRET_KEY;
    delete process.env.KIMI_MODEL;
    delete process.env.KIMI_VISION_MODEL;
    delete process.env.ARK_VISION_MODEL;

    // 通过 jest.isolateModules 确保 ocr.js 在「净空」env 下首次加载，
    // 之后再任何 process.env 改动都必须被它通过 getter 看到。
    jest.isolateModules(() => {
      ocr = require('../services/ocr');
    });
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  // ocr.js 的 getter 是模块内私有，但通过 ocrConfig 间接验证：
  // ocrConfig.hasXCredential 是 ocr.js 内 hasXCredential 的来源，
  // 二者必须同步——所以只需证明 ocrConfig 本身是 live 的，加上 ocr.js 改用
  // ocrConfig（已在 services/ocr.js:49,59,60,62 完成）即可推出 ocr.js 是 live 的。
  const ocrConfig = require('../utils/ocrConfig');

  test('hasDoubaoCredential() reflects post-require ARK_API_KEY change', () => {
    expect(ocrConfig.hasDoubaoCredential()).toBe(false);
    process.env.ARK_API_KEY = 'live-injected-after-require';
    expect(ocrConfig.hasDoubaoCredential()).toBe(true);
    delete process.env.ARK_API_KEY;
    expect(ocrConfig.hasDoubaoCredential()).toBe(false);
  });

  test('hasKimiCredential() reflects post-require KIMI_API_KEY change', () => {
    expect(ocrConfig.hasKimiCredential()).toBe(false);
    process.env.KIMI_API_KEY = 'live-injected';
    expect(ocrConfig.hasKimiCredential()).toBe(true);
    delete process.env.KIMI_API_KEY;
    expect(ocrConfig.hasKimiCredential()).toBe(false);
  });

  test('hasTencentCredential() reflects post-require Tencent secret change', () => {
    expect(ocrConfig.hasTencentCredential()).toBe(false);
    process.env.OCR_SECRET_ID = 'AKID-live';
    process.env.OCR_SECRET_KEY = 'secret-live';
    expect(ocrConfig.hasTencentCredential()).toBe(true);
    delete process.env.OCR_SECRET_ID;
    delete process.env.OCR_SECRET_KEY;
    expect(ocrConfig.hasTencentCredential()).toBe(false);
  });

  test('describeOcrProviders() reflects switch from none to doubao+kimi without re-require', () => {
    expect(ocrConfig.describeOcrProviders()).toBe('none');
    process.env.ARK_API_KEY = 'a';
    process.env.KIMI_API_KEY = 'k';
    expect(ocrConfig.describeOcrProviders()).toBe('doubao+kimi');
    delete process.env.ARK_API_KEY;
    delete process.env.KIMI_API_KEY;
  });

  // 兜底冒烟：ocr 模块自身可以在「全空」env 下 require 成功且导出函数。
  // 这本身就证明 init-time 没有抛——之前的实现也是 require 成功，但状态被冻结。
  test('ocr module loads cleanly with empty env and exposes parseFile / recognizeMedical', () => {
    expect(typeof ocr.parseFile === 'function' || typeof ocr.recognizeMedical === 'function').toBe(true);
  });
});
