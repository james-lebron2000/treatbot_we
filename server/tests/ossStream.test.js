/**
 * Plan §Phase 1.5：oss.calculateMD5Stream / oss.uploadStream 单测。
 *
 * 覆盖：
 *   1) calculateMD5Stream 与 calculateMD5 对同一文件给出一致 hex
 *   2) calculateMD5Stream 错误路径（不存在文件）应 reject
 *   3) uploadStream local storage 模式：文件被复制到 localUploadRoot 并返回正确 url
 *   4) uploadStream 缺 filePath 校验
 *
 * 不打 COS：测试只跑 useLocalStorage = true 分支。oss.js 内部硬编码
 * localUploadRoot = server/uploads，所以测试用唯一前缀 key 写入 + 结束清理，
 * 避免污染开发环境的真实文件。
 */

const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// 必须在 require oss.js 之前清理 COS 凭证 → 强制走 useLocalStorage 分支。
const SAVED_ENV = {
  COS_SECRET_ID: process.env.COS_SECRET_ID,
  COS_SECRET_KEY: process.env.COS_SECRET_KEY,
  COS_BUCKET: process.env.COS_BUCKET
};

let testTmpDir;
let testKeyPrefix;
let localUploadRoot;
let oss;

beforeAll(() => {
  delete process.env.COS_SECRET_ID;
  delete process.env.COS_SECRET_KEY;
  delete process.env.COS_BUCKET;
  jest.resetModules();
  oss = require('../services/oss');

  testTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'treatbot-oss-test-'));
  // 唯一前缀让结尾删除时不误删别人；避免与生产 uploads/ 冲突
  testKeyPrefix = `__test_phase15__${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  localUploadRoot = path.join(__dirname, '..', 'uploads');
});

afterAll(async () => {
  // 清理本测试写入的所有目录（按前缀匹配）
  if (localUploadRoot) {
    try {
      const dir = await fsPromises.readdir(localUploadRoot);
      for (const entry of dir) {
        if (entry.startsWith(testKeyPrefix)) {
          await fsPromises.rm(path.join(localUploadRoot, entry), { recursive: true, force: true });
        }
      }
    } catch (_e) { /* ignore */ }
  }
  if (testTmpDir) {
    try { await fsPromises.rm(testTmpDir, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
  }
  if (SAVED_ENV.COS_SECRET_ID !== undefined) process.env.COS_SECRET_ID = SAVED_ENV.COS_SECRET_ID;
  if (SAVED_ENV.COS_SECRET_KEY !== undefined) process.env.COS_SECRET_KEY = SAVED_ENV.COS_SECRET_KEY;
  if (SAVED_ENV.COS_BUCKET !== undefined) process.env.COS_BUCKET = SAVED_ENV.COS_BUCKET;
});

describe('calculateMD5Stream', () => {
  test('与 calculateMD5 对同一内容返回一致 hex', async () => {
    const content = Buffer.from('hello world treatbot ' + 'x'.repeat(2048));
    const fp = path.join(testTmpDir, 'md5-equal.bin');
    await fsPromises.writeFile(fp, content);

    const fromBuf = oss.calculateMD5(content);
    const fromStream = await oss.calculateMD5Stream(fp);
    expect(fromStream).toEqual(fromBuf);

    // sanity: 与 node crypto 直算一致
    const direct = crypto.createHash('md5').update(content).digest('hex');
    expect(fromStream).toEqual(direct);
  });

  test('大文件（>1MB）也能流式算出 md5', async () => {
    const big = Buffer.alloc(1024 * 1024 + 17, 0x42); // ~1MB + 17B，强制不止一个 chunk
    const fp = path.join(testTmpDir, 'md5-big.bin');
    await fsPromises.writeFile(fp, big);

    const expected = crypto.createHash('md5').update(big).digest('hex');
    const got = await oss.calculateMD5Stream(fp);
    expect(got).toEqual(expected);
  });

  test('文件不存在 → reject', async () => {
    await expect(oss.calculateMD5Stream(path.join(testTmpDir, 'no-such-file.bin')))
      .rejects.toBeDefined();
  });
});

describe('uploadStream (useLocalStorage)', () => {
  test('文件被复制到 localUploadRoot，且返回正确 url + key + etagOverride', async () => {
    const content = Buffer.from('phase 1.5 stream upload payload');
    const src = path.join(testTmpDir, 'src-upload.bin');
    await fsPromises.writeFile(src, content);

    const key = `${testKeyPrefix}/abc123.bin`;
    const result = await oss.uploadStream(src, key, {
      contentType: 'application/octet-stream',
      metadata: { userId: 'test-user' },
      etagOverride: 'deadbeef'
    });

    expect(result.success).toBe(true);
    expect(result.key).toEqual(key);
    expect(result.url).toMatch(new RegExp(`uploads/${testKeyPrefix}/abc123\\.bin$`));
    expect(result.etag).toEqual('deadbeef');

    // 验证目标文件实际写入
    const written = await fsPromises.readFile(path.join(localUploadRoot, key));
    expect(written.equals(content)).toBe(true);
  });

  test('源文件可与目标 key 路径不同；多级目录自动 mkdir', async () => {
    const content = Buffer.from('nested dir test');
    const src = path.join(testTmpDir, 'src2.bin');
    await fsPromises.writeFile(src, content);

    const key = `${testKeyPrefix}/u-1/2025/05/08/file.bin`;
    const result = await oss.uploadStream(src, key);
    expect(result.success).toBe(true);
    const written = await fsPromises.readFile(path.join(localUploadRoot, key));
    expect(written.equals(content)).toBe(true);
  });

  test('缺 filePath → reject', async () => {
    await expect(oss.uploadStream(null, 'any-key')).rejects.toThrow(/filePath/);
    await expect(oss.uploadStream('', 'any-key')).rejects.toThrow(/filePath/);
  });

  test('带前导 / 的 key —— normalizeLocalKey 不会跑到 root 之外', async () => {
    const src = path.join(testTmpDir, 'src3.bin');
    await fsPromises.writeFile(src, Buffer.from('x'));
    // 调用方传带 / 前缀的 key
    const key = `/${testKeyPrefix}/lead-slash/foo.bin`;
    const result = await oss.uploadStream(src, key);
    expect(result.success).toBe(true);
    // 实际写入应在 localUploadRoot 之内（normalizeLocalKey 清理前导斜杠）
    const expectedPath = path.join(localUploadRoot, testKeyPrefix, 'lead-slash', 'foo.bin');
    const exists = await fsPromises.stat(expectedPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });
});
