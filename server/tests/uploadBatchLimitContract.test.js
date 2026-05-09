// PRD-2026Q4 followup（用户反馈 5 张限额过紧 + "网络卡顿"误报）回归测试。
//
// 这条测试是**契约级 / 静态扫描**，不打 DB / Redis：
//   1) 服务端 BATCH_UPLOAD_MAX 默认值是 9（与客户端 wxml 历史 `<9` 判断 + 微信
//      朋友圈 9 张图心智模型对齐）；改回 5 必须显式改 ENV。
//   2) 客户端 pages/upload/upload.js：
//      a) MAX_UPLOAD_COUNT 常量存在且 = 9；
//      b) 4 处 wx.chooseMedia / wx.chooseMessageFile 的 count 都用 MAX_UPLOAD_COUNT
//         而非硬编码 5；
//      c) uploadFiles 全失败时 throw 原 err（保 statusCode），而不是 throw new Error(message)
//         —— 否则所有失败都被 classifyUploadError 错分类成 'network'，用户看到
//         "网络有点卡" 这条假报错。
//
// 这三条是上次线上事故根因；任何未来 PR 改回老样子都应该被这条测试挂掉。

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const MEDICAL_CTRL = path.join(REPO_ROOT, 'server', 'controllers', 'medical.js');
const UPLOAD_PAGE = path.join(REPO_ROOT, 'pages', 'upload', 'upload.js');

describe('upload batch limit contract — server', () => {
  let src;
  beforeAll(() => { src = fs.readFileSync(MEDICAL_CTRL, 'utf8'); });

  test('BATCH_UPLOAD_MAX default = 9 (not 5)', () => {
    // 接受 process.env.BATCH_UPLOAD_MAX 覆盖，但默认数字必须是 '9'
    expect(src).toMatch(/BATCH_UPLOAD_MAX\s*\|\|\s*['"]9['"]/);
    expect(src).not.toMatch(/BATCH_UPLOAD_MAX\s*\|\|\s*['"]5['"]/);
  });

  test('multer array() cap uses same default 9', () => {
    expect(src).toMatch(/upload\.array\(['"]files['"][^)]*BATCH_UPLOAD_MAX[^)]*['"]9['"]/);
  });
});

describe('upload page contract — mini-program', () => {
  let src;
  beforeAll(() => { src = fs.readFileSync(UPLOAD_PAGE, 'utf8'); });

  test('MAX_UPLOAD_COUNT constant defined = 9', () => {
    expect(src).toMatch(/const\s+MAX_UPLOAD_COUNT\s*=\s*9\b/);
  });

  test('no remaining hardcoded `count: 5 - this.data.tempFiles.length` (4 sites)', () => {
    // 历史 bug：4 处硬编码 5，与服务端 + wxml 不一致。
    expect(src).not.toMatch(/count:\s*5\s*-\s*this\.data\.tempFiles\.length/);
    // 必须改为常量引用（出现 ≥ 4 次：takePhoto / selectFromAlbum / selectPdfFile / selectFromMessage）
    const hits = src.match(/count:\s*MAX_UPLOAD_COUNT\s*-\s*this\.data\.tempFiles\.length/g) || [];
    expect(hits.length).toBeGreaterThanOrEqual(4);
  });

  test('uploadFiles re-throws original error to preserve statusCode (fix "网络卡顿" 误报)', () => {
    // 老 bug：throw new Error(last.message) → statusCode 丢失 → classifyUploadError
    // 看到 statusCode === 0 → 一律归类 'network' → "网络有点卡" 文案。
    // 修复：uploadErrors push 时保留 .error 字段，throw 时优先 throw last.error。
    expect(src).toMatch(/uploadErrors\.push\(\s*\{\s*[\s\S]*?error:\s*err[\s\S]*?\}\s*\)/);
    expect(src).toMatch(/if\s*\(\s*last\.error\s*\)\s*\{\s*throw\s+last\.error\s*;?\s*\}/);
  });

  test('classifyUploadError still maps statusCode 429 → rate_limit and 4xx → parse', () => {
    // 这条是反向 sanity check：确保我们的修复没有顺手把 classify 函数也碰坏。
    expect(src).toMatch(/status\s*===\s*429[\s\S]{0,80}return\s+['"]rate_limit['"]/);
    expect(src).toMatch(/status\s*>=\s*400\s*&&\s*status\s*<\s*600[\s\S]{0,40}return\s+['"]parse['"]/);
  });
});
