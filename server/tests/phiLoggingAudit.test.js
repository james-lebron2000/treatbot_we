// PRD-2026Q4 T0-7 followup（PHI logging）回归测试：
// 防止 logger.* 调用点把原始 phone / id_card / OTP 明文写进日志。
// docker logs / Sentry breadcrumb / 文件归档都会落盘，明文泄露是低概率高代价。
//
// 策略：
//  1) utils/piiScrubber.js 必须导出 scrubForLog / _maskPhone（行为单测）。
//  2) 静态扫源码 controllers/me.js + services/sms.js + 其他 hot path：
//     - logger.* 的 meta 里若出现 `phone:`、`idCard:`、`id_card:`，必须挂遮罩函数；
//     - logger.* 的模板字符串里禁止出现裸 `${phone}` / `${idCard}` / `${id_card}` /
//       `${user.phone}` 等（必须先经过 maskPhone / scrubForLog 等）。
//  3) services/sms.js 的"即将发送"行在生产分支必须不含 smsText（验证码明文）。

const fs = require('fs');
const path = require('path');

const SERVER_ROOT = path.join(__dirname, '..');

const readSrc = (relPath) => fs.readFileSync(path.join(SERVER_ROOT, relPath), 'utf8');

describe('utils/piiScrubber.scrubForLog — behavior', () => {
  const { scrubForLog, _maskPhone } = require('../utils/piiScrubber');

  test('maskPhone keeps last 4 digits, redacts the rest', () => {
    expect(_maskPhone('13800001234')).toBe('***1234');
    expect(_maskPhone('not-a-phone')).toBe('<PHONE>');
  });

  test('scrubForLog masks phone field by name (string + number)', () => {
    expect(scrubForLog({ userId: 'u1', phone: '13800001234' }))
      .toEqual({ userId: 'u1', phone: '***1234' });
  });

  test('scrubForLog masks phone numbers inside strings', () => {
    expect(scrubForLog('SMS sent to 13800001234 ok')).toBe('SMS sent to ***1234 ok');
  });

  test('scrubForLog redacts id_card / idCard fields', () => {
    expect(scrubForLog({ idCard: '110101199001011234' })).toEqual({ idCard: '<ID_REDACTED>' });
    expect(scrubForLog({ id_card: '110101199001011234' })).toEqual({ id_card: '<ID_REDACTED>' });
  });

  test('scrubForLog redacts id-card pattern inside strings', () => {
    expect(scrubForLog('user 110101199001011234 deleted')).toBe('user <ID_REDACTED> deleted');
  });

  test('scrubForLog redacts email pattern inside strings', () => {
    expect(scrubForLog('contact alice@example.com please')).toBe('contact <EMAIL_REDACTED> please');
  });

  test('scrubForLog passes through non-PII primitives', () => {
    expect(scrubForLog(42)).toBe(42);
    expect(scrubForLog(true)).toBe(true);
    expect(scrubForLog(null)).toBe(null);
    expect(scrubForLog(undefined)).toBe(undefined);
  });

  test('scrubForLog deep-walks nested objects + arrays', () => {
    const got = scrubForLog({
      list: [
        { phone: '13800001234' },
        { phone: '13900005678' }
      ],
      meta: { userPhone: '13800009999' }
    });
    expect(got.list[0].phone).toBe('***1234');
    expect(got.list[1].phone).toBe('***5678');
    expect(got.meta.userPhone).toBe('***9999');
  });
});

describe('hot-path source files — no raw PII in logger calls', () => {
  // 扫描的文件清单：每加一个 hot-path（auth, sms, me, admin reveal）就追一行。
  const FILES = [
    'controllers/me.js',
    'services/sms.js',
    'controllers/auth.js'
  ];

  // 匹配 logger.X(...) 整段调用（含跨行）。粗略但够用。
  const LOGGER_CALL_RE = /logger\.(info|warn|error|debug)\([\s\S]*?\)\s*;/g;

  // 黑名单（在 logger 调用文本里出现即视为明文泄露）：
  //   - `phone:` 后面紧跟一个不是 maskPhone/scrubForLog/scrubFor 的标识符或属性访问；
  //   - 模板字符串里裸 `${phone}` / `${user.phone}` / `${idCard}` / `${id_card}`。
  const BLACKLIST = [
    {
      name: 'meta `phone:` 字段直接绑定原值',
      // 命中 `phone: foo`、`phone: foo.bar`、`phone: req.body.phone` 等；
      // 不命中 `phone: maskPhone(...)`、`phone: scrubForLog(...)` 等。
      re: /\bphone\s*:\s*(?!maskPhone|scrubForLog|scrubFor|'[^']*'|"[^"]*"|`[^`]*`|null|undefined)[A-Za-z_$][\w$.[\]]*/
    },
    {
      name: '模板字符串里裸 ${phone}',
      re: /\$\{\s*phone\s*\}/
    },
    {
      name: '模板字符串里裸 ${user.phone}',
      re: /\$\{\s*[A-Za-z_$][\w$]*\.phone\s*\}/
    },
    {
      name: 'meta `idCard:` / `id_card:` 字段直接绑定原值',
      re: /\b(idCard|id_card)\s*:\s*(?!'<[^']+>'|"<[^"]+>"|scrubForLog|null|undefined)[A-Za-z_$][\w$.[\]]*/
    }
  ];

  for (const file of FILES) {
    test(`${file} — logger.* calls don't carry raw PII`, () => {
      const src = readSrc(file);
      const offenders = [];
      let m;
      LOGGER_CALL_RE.lastIndex = 0;
      while ((m = LOGGER_CALL_RE.exec(src)) !== null) {
        const callText = m[0];
        for (const rule of BLACKLIST) {
          if (rule.re.test(callText)) {
            offenders.push(`${rule.name}: ${callText.slice(0, 200)}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });
  }
});

describe('services/sms.js — production branch must not log OTP plaintext', () => {
  const src = readSrc('services/sms.js');

  test('sendCode has a NODE_ENV !== production gate around smsText log', () => {
    // 必须出现 NODE_ENV === 'production' 这种显式分支；
    // 这是"生产不打 OTP"的契约。
    expect(src).toMatch(/process\.env\.NODE_ENV\s*===\s*['"]production['"]/);
  });

  test('production-branch log uses code_len, not raw smsText / code', () => {
    // 生产分支那一行必须包含 code_len，且不能直接拼 ${smsText} 或 ${code}（不带 _len 后缀）。
    const prodBranch = src.match(/NODE_ENV\s*===\s*['"]production['"][\s\S]{0,200}?logger\.[a-z]+\([^)]+\)/);
    expect(prodBranch).not.toBeNull();
    expect(prodBranch[0]).toMatch(/code_len/);
    expect(prodBranch[0]).not.toMatch(/\$\{\s*smsText\s*\}/);
    // 允许 `${code.length}` 但不允许裸 `${code}`。
    expect(prodBranch[0]).not.toMatch(/\$\{\s*code\s*\}/);
  });
});
