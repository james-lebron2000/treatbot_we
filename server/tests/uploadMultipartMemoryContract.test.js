// PRD-2026Q4 followup（legacy multipart 内存安全）回归测试。
//
// 历史：medical.js 的 multer 配 memoryStorage + 30MB/file × 9/batch = 270MB / 请求驻留
// 在 RSS。100 并发 = 27GB 峰值，OOM 一次拖垮整个 Node 进程，所有正在解析的会话全丢。
//
// 修法：multer → diskStorage，calculateMD5/uploadFile → calculateMD5Stream/uploadStream
// （oss.js 的 stream API 在 Plan §Phase 1.5 / #11 已落地）。Multer 临时文件落 /tmp 下
// 独立子目录，handleUpload / handleUploadBatch finally 显式 unlink。
//
// 这条测试是契约级（静态扫描）—— 任何把 medical.js 改回 buffer 路径的 PR 应该被挂掉。

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const MEDICAL_CTRL = path.join(REPO_ROOT, 'server', 'controllers', 'medical.js');

describe('legacy multipart 内存安全 — disk storage + stream upload', () => {
  let src;
  beforeAll(() => { src = fs.readFileSync(MEDICAL_CTRL, 'utf8'); });

  test('multer 用 diskStorage，不能再用 memoryStorage', () => {
    expect(src).toMatch(/multer\.diskStorage\(/);
    // memoryStorage() 不允许重新出现作为活动配置 —— 老 buffer 路径直接重新引入 OOM 风险
    // 注：注释里提"memoryStorage" 文字描述 OK，但调用 multer.memoryStorage() 必须没了
    expect(src).not.toMatch(/storage:\s*multer\.memoryStorage\s*\(\s*\)/);
  });

  test('落盘目录可由 MULTIPART_TMP_DIR env 覆盖', () => {
    // 默认落到 /app/uploads/tmp-multipart（生产挂载到宿主机磁盘），同时保留运维覆盖口。
    expect(src).toMatch(/MULTIPART_TMP_DIR/);
    expect(src).toMatch(/process\.env\.MULTIPART_TMP_DIR/);
    expect(src).toMatch(/uploads['"]\s*,\s*['"]tmp-multipart/);
    expect(src).not.toMatch(/os\.tmpdir\(\)/);
  });

  test('processSingleUpload 用 calculateMD5Stream(file.path)，不能再读 file.buffer', () => {
    // hash 必须流式 —— buffer 路径会把 30MB 整个读入 RAM
    expect(src).toMatch(/calculateMD5Stream\(\s*file\.path\s*\)/);
    // 反向 guard：active 调用不能再出现 ossService.calculateMD5(file.buffer)。
    // 检测时按行剥掉 // 行注释，避免我们自己解释历史时的 "曾经是 calculateMD5(file.buffer)"
    // 描述把测试挂掉。
    const codeOnly = src
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '')) // 去掉行注释
      .join('\n');
    const activeCalls = codeOnly.match(/ossService\.calculateMD5\(\s*file\.buffer\s*\)/g) || [];
    expect(activeCalls).toHaveLength(0);
    const activeBufferReads = codeOnly.match(/file\.buffer/g) || [];
    expect(activeBufferReads).toHaveLength(0);
  });

  test('上传走 uploadStream(file.path, ...)，不再 uploadFile(file.buffer, ...)', () => {
    expect(src).toMatch(/ossService\.uploadStream\(\s*file\.path\s*,/);
    expect(src).not.toMatch(/ossService\.uploadFile\(\s*file\.buffer/);
  });

  test('handleUpload + handleUploadBatch 都 finally 清盘', () => {
    // unlink 失败可以容忍，但必须有 finally —— 不清就是每个请求往 /tmp 灌 270MB
    expect(src).toMatch(/cleanupMultipartTmpFiles/);
    // handleUpload 单文件
    const handleUploadBlock = src.match(/const\s+handleUpload\s*=\s*async[\s\S]*?\n\};/);
    expect(handleUploadBlock).toBeTruthy();
    expect(handleUploadBlock[0]).toMatch(/finally\s*\{\s*[\s\S]*?await\s+cleanupMultipartTmpFiles\(\s*req\.file\s*\)/);
    // handleUploadBatch 批量
    const handleBatchBlock = src.match(/const\s+handleUploadBatch\s*=\s*async[\s\S]*?\n\};/);
    expect(handleBatchBlock).toBeTruthy();
    expect(handleBatchBlock[0]).toMatch(/finally\s*\{\s*[\s\S]*?await\s+cleanupMultipartTmpFiles\(\s*req\.files\s*\)/);
  });

  test('cleanupMultipartTmpFiles 容忍 ENOENT（重复清理不报错）', () => {
    // 防止有人改成同步 unlink 或漏掉 ENOENT 兜底 —— 部分文件已成功上传后删除是常态
    const start = src.indexOf('const cleanupMultipartTmpFiles');
    expect(start).toBeGreaterThanOrEqual(0);
    const cleanupFn = src.slice(start, start + 900);
    expect(cleanupFn).toMatch(/ENOENT/);
    expect(cleanupFn).toMatch(/fs\.promises\.unlink/);
  });
});
