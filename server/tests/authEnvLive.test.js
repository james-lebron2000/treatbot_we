// PRD-2026Q4 T0-7 followup 回归测试：
// 证明 controllers/auth.js 的 WEAPP_APPID / WEAPP_SECRET / TREATBOT_LOGIN_ENABLED /
// TREATBOT_LOGIN_FIXED_CODE 都是 per-call 派生而非 init-time 冻结。
//
// 其中 TREATBOT_LOGIN_FIXED_CODE 还有一个安全行为变更：默认值从 '000000' 改成空串，
// 即「未显式配置 → 不接受任何固定码」（fail-closed）。这是 inseq.top 后门事故
// 的双重防御之一。

describe('auth.js critical envs are live (not frozen at require time)', () => {
  test('source uses per-call getters, no frozen const for WEAPP / Treatbot login', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/auth'), 'utf8');
    expect(src).not.toMatch(/^const WEAPP_APPID\s*=\s*process\.env/m);
    expect(src).not.toMatch(/^const WEAPP_SECRET\s*=\s*process\.env/m);
    expect(src).not.toMatch(/^const TREATBOT_LOGIN_ENABLED\s*=/m);
    expect(src).not.toMatch(/^const TREATBOT_LOGIN_FIXED_CODE\s*=/m);
    expect(src).toMatch(/getWeappAppId\s*=\s*\(\)\s*=>/);
    expect(src).toMatch(/getWeappSecret\s*=\s*\(\)\s*=>/);
    expect(src).toMatch(/isTreatbotLoginEnabled\s*=\s*\(\)\s*=>/);
    expect(src).toMatch(/getTreatbotLoginFixedCode\s*=\s*\(\)\s*=>/);
  });

  test('TREATBOT_LOGIN_FIXED_CODE default is fail-closed (empty string, not 000000)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../controllers/auth'), 'utf8');
    // 必须不能再出现 `|| '000000'` 形态。
    expect(src).not.toMatch(/TREATBOT_LOGIN_FIXED_CODE.*\|\|\s*['"]000000['"]/);
    // getTreatbotLoginFixedCode 默认值是空串。
    expect(src).toMatch(/getTreatbotLoginFixedCode\s*=\s*\(\)\s*=>/);
    expect(src).toMatch(/process\.env\.TREATBOT_LOGIN_FIXED_CODE\s*\|\|/);
  });
});
