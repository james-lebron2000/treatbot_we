// PRD-2026Q4 followup（"补全字段不保存" + tap 冒泡 / 满额 guard）回归测试。
//
// 这条测试和 uploadBatchLimitContract.test.js 并列，但语义不同：
//   batchLimit  — 三端 BATCH_UPLOAD_MAX 数值一致性（5→9 漂移防护）
//   interaction — wxml 触摸事件的冒泡/捕获语义 + JS 入口 guard + 补全保存条件
//
// 三组事故的根因都是「UI 看着对，但状态机错」：
//   A) startMatching 只在 missingFields.length > 0 时 PATCH —— 用户填齐就再不保存，
//      服务端旧数据 → 病历列表/详情/匹配评分都基于过期值。
//   B) .upload-area 整块 bindtap="chooseImage" —— 点缩略图 (image bindtap=previewFile)
//      时 tap 冒泡到外层，又开一次选择器；满 9 张时还能进 chooseMedia({count:0}) 触发
//      不同基础库版本下不一致的行为。
//   C) chooseImage 没有满额 hard-guard，全靠 wxml 里的 `tempFiles.length < 9` 隐藏 +
//      按钮 —— 一旦再次发生 (B) 那种冒泡或外层绑定回归，就会撞回 count:0 这条死路。
//
// 这条测试是契约级（静态扫描，不需要 DB / wx runtime），CI 跑 ~50ms。

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const UPLOAD_JS = path.join(REPO_ROOT, 'pages', 'upload', 'upload.js');
const UPLOAD_WXML = path.join(REPO_ROOT, 'pages', 'upload', 'upload.wxml');

describe('startMatching 保存条件 — fileId+(missing>0||gapDirty) 才 PATCH，并清匹配缓存', () => {
  let src;
  beforeAll(() => { src = fs.readFileSync(UPLOAD_JS, 'utf8'); });

  test('data 初始声明 gapDirty:false', () => {
    // 没声明就 setData 一个新 key 在 WeApp 里也行，但 wxml 取到 undefined 难以排查。
    // 显式声明 = 主动文档化 = lint-friendly。
    expect(src).toMatch(/gapDirty:\s*false/);
  });

  test('onGapInput 在用户改字段时翻 dirty', () => {
    // 必要条件：字段编辑入口必须设 dirty —— 否则 startMatching 仍然走老条件。
    // 我们看 onGapInput 函数体里有 setData({ gapDirty: true })。
    const onGapInputBlock = src.match(/onGapInput\s*\(\s*e\s*\)\s*\{[\s\S]*?\n\s\s\}/);
    expect(onGapInputBlock).toBeTruthy();
    expect(onGapInputBlock[0]).toMatch(/setData\(\s*\{\s*gapDirty:\s*true\s*\}/);
  });

  test('startMatching 用 (missing>0 || gapDirty) && fileId 决定是否 PATCH', () => {
    // 旧条件 `missingFields.length > 0 && fileId` 漏掉"用户填齐"路径 —— 这条断言专挡这次回归。
    // 不强求字面量顺序，只要求三个标识同时出现在保存条件附近。
    const startMatchingBlock = src.match(/async\s+startMatching\s*\(\s*\)\s*\{[\s\S]*?\n\s\s\},/);
    expect(startMatchingBlock).toBeTruthy();
    const block = startMatchingBlock[0];
    expect(block).toMatch(/gapDirty/);
    expect(block).toMatch(/missingFields\.length\s*>\s*0/);
    expect(block).toMatch(/fileId/);
    // 反向 guard：旧条件不能再独占 —— 必须有 || gapDirty 或等价的 OR 分支
    expect(block).toMatch(/missingFields\.length\s*>\s*0\s*\|\|\s*gapDirty/);
  });

  test('保存成功后清这条 recordId 的匹配缓存', () => {
    // 用户改了字段，旧匹配结果一定过时 —— matches 页必须重新拉。
    const startMatchingBlock = src.match(/async\s+startMatching\s*\(\s*\)\s*\{[\s\S]*?\n\s\s\},/);
    expect(startMatchingBlock).toBeTruthy();
    expect(startMatchingBlock[0]).toMatch(/parseTask\.clearCachedMatches\(/);
  });

  test('保存成功后翻 gapDirty 回 false（防止用户回退再点重复 PATCH）', () => {
    const startMatchingBlock = src.match(/async\s+startMatching\s*\(\s*\)\s*\{[\s\S]*?\n\s\s\},/);
    expect(startMatchingBlock).toBeTruthy();
    expect(startMatchingBlock[0]).toMatch(/setData\(\s*\{\s*gapDirty:\s*false\s*\}/);
  });
});

describe('chooseImage 满额 hard-guard', () => {
  let src;
  beforeAll(() => { src = fs.readFileSync(UPLOAD_JS, 'utf8'); });

  test('chooseImage 入口检查 tempFiles.length >= MAX_UPLOAD_COUNT', () => {
    // wxml 已隐藏 + 按钮，但 JS 这层是双保险 —— 若未来谁把 wxml 的 wx:if 改错或外层重新绑 tap，
    // 这条 guard 还能挡住 count:0 这条死路。
    const chooseImageBlock = src.match(/chooseImage\s*\(\s*\)\s*\{[\s\S]*?\n\s\s\},/);
    expect(chooseImageBlock).toBeTruthy();
    expect(chooseImageBlock[0]).toMatch(/this\.data\.tempFiles\.length\s*>=\s*MAX_UPLOAD_COUNT/);
  });
});

describe('upload.wxml 触摸事件冒泡防护', () => {
  let wxml;
  beforeAll(() => { wxml = fs.readFileSync(UPLOAD_WXML, 'utf8'); });

  test('outer .upload-area 不再 bindtap="chooseImage"（避免与子元素 tap 冒泡相互触发）', () => {
    // 把 .upload-area 那一行抓出来检查 ——
    // 其他容器（例如 .image-preview-list）只要不绑 chooseImage 就行。
    expect(wxml).toMatch(/<view class="upload-area"\s*>/); // 无 bindtap
    // 反向 guard：禁止外层重新出现 bindtap="chooseImage"
    expect(wxml).not.toMatch(/<view class="upload-area"[^>]*bindtap="chooseImage"/);
  });

  test('图片缩略图用 catchtap="previewFile"（不让 tap 冒泡到外层）', () => {
    // bindtap 会让事件继续冒泡 —— 在 .upload-area 还可能误绑的版本里就会双触发。
    // catchtap 同时兼容当前 .upload-area 已无 bindtap 的版本（额外一份保险）。
    expect(wxml).toMatch(/<image[^>]*catchtap="previewFile"/);
    expect(wxml).not.toMatch(/<image[^>]*bindtap="previewFile"/);
  });

  test('PDF/file 预览也用 catchtap="previewFile"', () => {
    expect(wxml).toMatch(/file-preview[\s\S]{0,200}catchtap="previewFile"/);
  });

  test('"添加" 按钮用 catchtap="chooseImage"（与外层无 bindtap 冗余保险）', () => {
    expect(wxml).toMatch(/class="add-more"[^>]*catchtap="chooseImage"/);
  });

  test('+ 按钮容量门用 maxUploadCount（不再写裸 9）', () => {
    // 让 wxml 与 shared/schemas/upload.js 的 BATCH_UPLOAD_MAX 同号；改默认就只改一处。
    expect(wxml).toMatch(/wx:if="\{\{\s*tempFiles\.length\s*<\s*maxUploadCount\s*\}\}"/);
    expect(wxml).not.toMatch(/tempFiles\.length\s*<\s*9/);
  });

  test('删除按钮保持 catchtap（旧规约不变，写在这条防回归）', () => {
    expect(wxml).toMatch(/class="delete-btn"\s+catchtap="deleteImage"/);
  });
});
