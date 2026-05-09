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
const H5_UPLOAD_VIEW = path.join(REPO_ROOT, 'web', 'src', 'pages', 'UploadView.vue');

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

  test('handleFiles slice cap uses MAX_UPLOAD_COUNT, not hardcoded 5', () => {
    // PRD-2026Q4 followup（用户反馈"无法上传"二次根因）：
    //   chooseMedia 把 count 改成 MAX_UPLOAD_COUNT 之后，handleFiles 里 reducer 仍然
    //   `.slice(0, 5)` 静默把超出 5 张的文件全砍掉 —— UI 看起来就是"上传不上去"。
    //   这是一个测试盲区（只查了 chooseMedia 那 4 处），所以补一条专门盯 slice cap。
    expect(src).not.toMatch(/\.slice\(\s*0\s*,\s*5\s*\)/);
    // 必须显式引用同一个常量（任何其它数字都不接受，避免日后又写一个 6/8/10）
    expect(src).toMatch(/\.slice\(\s*0\s*,\s*MAX_UPLOAD_COUNT\s*\)/);
  });

  test('wxml `+` button gating uses same 9 ceiling', () => {
    // 反向 sanity：wxml `tempFiles.length < 9` 与 MAX_UPLOAD_COUNT=9 必须同号。
    // 任何把 wxml 改回 < 5 / < 6 的 PR 都会让 + 按钮在 5 张时消失，又把限额事实上回退。
    const wxml = fs.readFileSync(
      path.join(REPO_ROOT, 'pages', 'upload', 'upload.wxml'),
      'utf8'
    );
    expect(wxml).toMatch(/tempFiles\.length\s*<\s*9/);
    expect(wxml).not.toMatch(/tempFiles\.length\s*<\s*5/);
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

// 三端数值一致性：服务端 BATCH_UPLOAD_MAX、WeApp MAX_UPLOAD_COUNT、H5 MAX_BATCH_FILES
// 必须严格相等。任何一边改了，另外两端必须同步改 —— 不然客户端放过去的文件会被
// 服务端 400 拒掉，或客户端选不到、服务端却能接的怪状态。
//
// 之前的契约只校验了 "= 9" 字面量，但 future PR 可能把三处都改 (e.g.) 12，并漏其中一处。
// 这条测试直接抽出三个数字做 === 比较，零盲区。
describe('upload limit numeric parity — server / WeApp / H5', () => {
  const extractNum = (src, pattern) => {
    const m = src.match(pattern);
    if (!m) {
      throw new Error(`Pattern not matched: ${pattern}`);
    }
    return Number(m[1]);
  };

  test('server BATCH_UPLOAD_MAX === WeApp MAX_UPLOAD_COUNT === H5 MAX_BATCH_FILES', () => {
    const serverSrc = fs.readFileSync(MEDICAL_CTRL, 'utf8');
    const weappSrc = fs.readFileSync(UPLOAD_PAGE, 'utf8');
    const h5Src = fs.readFileSync(H5_UPLOAD_VIEW, 'utf8');

    const serverNum = extractNum(serverSrc, /BATCH_UPLOAD_MAX\s*\|\|\s*['"](\d+)['"]/);
    const weappNum = extractNum(weappSrc, /const\s+MAX_UPLOAD_COUNT\s*=\s*(\d+)\b/);
    const h5Num = extractNum(h5Src, /const\s+MAX_BATCH_FILES\s*=\s*(\d+)\b/);

    expect(serverNum).toBe(weappNum);
    expect(weappNum).toBe(h5Num);
  });
});

// PRD-2026Q4 followup：H5 必须有客户端 count cap，与小程序 / 服务端同号。
// 历史 H5 直接 `files.value = Array.from(target.files || [])` 不做任何 cap —— 用户选 12 份
// 整批上传完才被 server 400 拒掉，浪费带宽 + 看到「请分批上传」误以为是网络问题。
describe('upload H5 contract — Vue UploadView.vue', () => {
  let src;
  beforeAll(() => { src = fs.readFileSync(H5_UPLOAD_VIEW, 'utf8'); });

  test('MAX_BATCH_FILES constant defined = 9', () => {
    expect(src).toMatch(/const\s+MAX_BATCH_FILES\s*=\s*9\b/);
  });

  test('onFileChange enforces MAX_BATCH_FILES (no naked assignment of selected)', () => {
    // 必须出现 slice + MAX_BATCH_FILES 引用；否则等价于没限额。
    expect(src).toMatch(/\.slice\(\s*0\s*,\s*MAX_BATCH_FILES\s*\)/);
    // 反向 guard：不允许"裸赋值 files.value = selected"再次回归。
    // 旧代码：`files.value = selected` —— 没经过 cap。新代码用 `accepted` 中间变量。
    expect(src).not.toMatch(/files\.value\s*=\s*selected\b/);
  });
});
