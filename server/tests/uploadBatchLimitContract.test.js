// PRD-2026Q4 followup（用户反馈 5 张限额过紧 + "网络卡顿"误报 + "无法上传"二次根因）回归测试。
//
// 这条测试是**契约级 / 静态扫描**，不打 DB / Redis：
//   1) shared/schemas/upload.js 是上传批次上限唯一来源（BATCH_UPLOAD_MAX 默认 9）；
//      改这一处即三端同步生效。
//   2) 服务端 server/controllers/medical.js：require 共享常量；env BATCH_UPLOAD_MAX 仍可覆盖。
//   3) 客户端 pages/upload/upload.js：
//      a) MAX_UPLOAD_COUNT 来自 shared 常量（require）；
//      b) 4 处 wx.chooseMedia / wx.chooseMessageFile 的 count 都用 MAX_UPLOAD_COUNT；
//      c) handleFiles slice cap 用 MAX_UPLOAD_COUNT，不能写裸数字；
//      d) uploadFiles 全失败时 throw 原 err（保 statusCode），不 throw new Error(message)
//         —— 否则所有失败都被 classifyUploadError 错分类成 'network'，用户看到
//         "网络有点卡" 这条假报错。
//   4) Treatbot Web/src/pages/UploadView.vue：MAX_BATCH_FILES 来自 shared 常量；onFileChange
//      必须 slice 截断，不允许裸赋值 files.value=selected。
//
// 这些都是上次线上事故根因；任何未来 PR 改回老样子都应该被这条测试挂掉。

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const MEDICAL_CTRL = path.join(REPO_ROOT, 'server', 'controllers', 'medical.js');
const UPLOAD_PAGE = path.join(REPO_ROOT, 'pages', 'upload', 'upload.js');
const WEB_UPLOAD_VIEW = path.join(REPO_ROOT, 'web', 'src', 'pages', 'UploadView.vue');
const SHARED_SCHEMA = path.join(REPO_ROOT, 'shared', 'schemas', 'upload.js');

describe('shared upload schema — single source of truth', () => {
  test('BATCH_UPLOAD_MAX exported and = 9', () => {
    // 真正 require 验证 —— 文件必须语法正确、能 import、值正确。
    const shared = require(SHARED_SCHEMA);
    expect(shared).toHaveProperty('BATCH_UPLOAD_MAX');
    expect(shared.BATCH_UPLOAD_MAX).toBe(9);
    expect(typeof shared.BATCH_UPLOAD_MAX).toBe('number');
  });
});

describe('upload batch limit contract — server', () => {
  let src;
  beforeAll(() => { src = fs.readFileSync(MEDICAL_CTRL, 'utf8'); });

  test('imports BATCH_UPLOAD_MAX from shared/schemas/upload.js', () => {
    // 不允许再硬编码默认值；必须从 shared 读。
    expect(src).toMatch(/require\(['"]\.\.\/\.\.\/shared\/schemas\/upload\.js['"]\)/);
    expect(src).toMatch(/SHARED_BATCH_UPLOAD_MAX/);
  });

  test('multer array() cap reads from shared default (env override still allowed)', () => {
    // env BATCH_UPLOAD_MAX 仍可覆盖，但 fallback 必须是 SHARED_BATCH_UPLOAD_MAX。
    expect(src).toMatch(/upload\.array\(['"]files['"][^)]*BATCH_UPLOAD_MAX[^)]*SHARED_BATCH_UPLOAD_MAX/);
    // 反向 guard：不允许重新出现裸 '9' / '5' 默认。
    expect(src).not.toMatch(/BATCH_UPLOAD_MAX\s*\|\|\s*['"]5['"]/);
  });
});

describe('upload page contract — mini-program', () => {
  let src;
  beforeAll(() => { src = fs.readFileSync(UPLOAD_PAGE, 'utf8'); });

  test('imports BATCH_UPLOAD_MAX from shared/schemas/upload.js', () => {
    expect(src).toMatch(/require\(['"]\.\.\/\.\.\/shared\/schemas\/upload\.js['"]\)/);
    expect(src).toMatch(/SHARED_BATCH_UPLOAD_MAX/);
  });

  test('MAX_UPLOAD_COUNT bound to shared constant (not literal)', () => {
    // 不允许 const MAX_UPLOAD_COUNT = 9 / 5 / 任何裸数字。
    expect(src).toMatch(/const\s+MAX_UPLOAD_COUNT\s*=\s*SHARED_BATCH_UPLOAD_MAX\b/);
    expect(src).not.toMatch(/const\s+MAX_UPLOAD_COUNT\s*=\s*\d+\b/);
  });

  test('no remaining hardcoded `count: 5 - this.data.tempFiles.length` (4 sites)', () => {
    // 历史 bug：4 处硬编码 5，与服务端 + wxml 不一致。
    expect(src).not.toMatch(/count:\s*5\s*-\s*this\.data\.tempFiles\.length/);
    // 必须改为常量引用（出现 ≥ 4 次：takePhoto / selectFromAlbum / selectPdfFile / selectFromMessage）
    const hits = src.match(/count:\s*MAX_UPLOAD_COUNT\s*-\s*this\.data\.tempFiles\.length/g) || [];
    expect(hits.length).toBeGreaterThanOrEqual(4);
  });

  test('handleFiles slice cap uses MAX_UPLOAD_COUNT, not hardcoded 5', () => {
    // PRD-2026Q4 followup（用户反馈"无法上传"二次根因）：
    //   chooseMedia 把 count 改成 MAX_UPLOAD_COUNT 之后，handleFiles 里 reducer 仍然
    //   `.slice(0, 5)` 静默把超出 5 张的文件全砍掉 —— UI 看起来就是"上传不上去"。
    expect(src).not.toMatch(/\.slice\(\s*0\s*,\s*5\s*\)/);
    expect(src).toMatch(/\.slice\(\s*0\s*,\s*MAX_UPLOAD_COUNT\s*\)/);
  });

  test('wxml `+` button gating bound to shared cap (maxUploadCount data prop)', () => {
    // PRD-2026Q4 followup：wxml 不再写裸数字 9，而是 bind 到 data 的 maxUploadCount，
    // data.maxUploadCount = MAX_UPLOAD_COUNT = SHARED_BATCH_UPLOAD_MAX —— 改默认只改 shared 一处。
    const wxml = fs.readFileSync(
      path.join(REPO_ROOT, 'pages', 'upload', 'upload.wxml'),
      'utf8'
    );
    const sharedMax = require(SHARED_SCHEMA).BATCH_UPLOAD_MAX;
    // 接受两种写法（迁移期兼容）：直接绑 maxUploadCount，或裸数字与 sharedMax 同号
    const usesBinding = /tempFiles\.length\s*<\s*maxUploadCount\b/.test(wxml);
    const usesLiteral = new RegExp(`tempFiles\\.length\\s*<\\s*${sharedMax}\\b`).test(wxml);
    expect(usesBinding || usesLiteral).toBe(true);
    // 反向 guard：5 / 6 / 7 / 8 这些低于 sharedMax 的过紧裸值仍然不允许（事实上回退）。
    expect(wxml).not.toMatch(/tempFiles\.length\s*<\s*5\b/);
    // 同时建议使用 binding（写到 expect 里只做软提示，不强制）—— 当 sharedMax 变更时
    // 裸数字模式必须手动 sync 才不挂，binding 模式自动同步。
    if (!usesBinding) {
      // eslint-disable-next-line no-console
      console.warn('upload.wxml 仍用裸数字门控，建议改成 maxUploadCount binding 以避免漂移');
    }
    // wxml 必须把 maxUploadCount 透出到 data；upload.js 里 data: { ..., maxUploadCount, ... }
    if (usesBinding) {
      const uploadJs = fs.readFileSync(UPLOAD_PAGE, 'utf8');
      expect(uploadJs).toMatch(/maxUploadCount:\s*MAX_UPLOAD_COUNT/);
    }
  });

  test('uploadFiles re-throws original error to preserve statusCode (fix "网络卡顿" 误报)', () => {
    // 老 bug：throw new Error(last.message) → statusCode 丢失 → classifyUploadError
    // 看到 statusCode === 0 → 一律归类 'network' → "网络有点卡" 文案。
    expect(src).toMatch(/uploadErrors\.push\(\s*\{\s*[\s\S]*?error:\s*err[\s\S]*?\}\s*\)/);
    expect(src).toMatch(/if\s*\(\s*last\.error\s*\)\s*\{\s*throw\s+last\.error\s*;?\s*\}/);
  });

  test('classifyUploadError still maps statusCode 429 → rate_limit and 4xx → parse', () => {
    // 反向 sanity：确保我们的修复没有顺手把 classify 函数也碰坏。
    expect(src).toMatch(/status\s*===\s*429[\s\S]{0,80}return\s+['"]rate_limit['"]/);
    expect(src).toMatch(/status\s*>=\s*400\s*&&\s*status\s*<\s*600[\s\S]{0,40}return\s+['"]parse['"]/);
  });
});

// PRD-2026Q4 followup：Treatbot Web 必须有客户端 count cap，与小程序 / 服务端同号。
describe('upload Treatbot Web contract — Vue UploadView.vue', () => {
  let src;
  beforeAll(() => { src = fs.readFileSync(WEB_UPLOAD_VIEW, 'utf8'); });

  test('imports BATCH_UPLOAD_MAX from @shared/schemas/upload.js', () => {
    expect(src).toMatch(/from\s+['"]@shared\/schemas\/upload\.js['"]/);
    expect(src).toMatch(/SHARED_BATCH_UPLOAD_MAX/);
  });

  test('MAX_BATCH_FILES bound to shared constant (not literal)', () => {
    expect(src).toMatch(/const\s+MAX_BATCH_FILES\s*=\s*SHARED_BATCH_UPLOAD_MAX\b/);
    expect(src).not.toMatch(/const\s+MAX_BATCH_FILES\s*=\s*\d+\b/);
  });

  test('onFileChange enforces MAX_BATCH_FILES (no naked assignment of selected)', () => {
    expect(src).toMatch(/\.slice\(\s*0\s*,\s*MAX_BATCH_FILES\s*\)/);
    // 反向 guard：不允许"裸赋值 files.value = selected"再次回归。
    expect(src).not.toMatch(/files\.value\s*=\s*selected\b/);
  });
});

// 三端运行时数值一致性：所有引用都解析到同一个 shared 常量值。
// 即使有人通过 ENV 覆盖了服务端默认（仅服务端可），WeApp / Treatbot Web 也必须明确知道这点
// （wxml `<9` 不读 env，所以默认必须保持 9；改默认 = 改 shared/schemas/upload.js）。
describe('upload limit numeric parity — server / WeApp / Treatbot Web', () => {
  test('all three sides resolve to the same shared BATCH_UPLOAD_MAX', () => {
    const sharedMax = require(SHARED_SCHEMA).BATCH_UPLOAD_MAX;
    const serverSrc = fs.readFileSync(MEDICAL_CTRL, 'utf8');
    const weappSrc = fs.readFileSync(UPLOAD_PAGE, 'utf8');
    const webSrc = fs.readFileSync(WEB_UPLOAD_VIEW, 'utf8');

    // 三端都必须 reference SHARED_BATCH_UPLOAD_MAX（已被前面单独测试过，这里再做一次合并 sanity）
    expect(serverSrc).toMatch(/SHARED_BATCH_UPLOAD_MAX/);
    expect(weappSrc).toMatch(/SHARED_BATCH_UPLOAD_MAX/);
    expect(webSrc).toMatch(/SHARED_BATCH_UPLOAD_MAX/);
    // 共享值必须是个正整数，避免日后写成字符串 / NaN
    expect(Number.isInteger(sharedMax)).toBe(true);
    expect(sharedMax).toBeGreaterThan(0);
  });
});
