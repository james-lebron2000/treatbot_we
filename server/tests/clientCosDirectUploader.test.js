/**
 * Plan §Phase 2.1：客户端 utils/cosDirectUploader.js + utils/md5.js 单测。
 *
 * 路径放在 server/tests/ 是因为 jest 配置在 server/，且这两个 util 是纯 CJS 模块、
 * 在 node 里能直接 require 跑（只要把 wx 全局桩好）。
 *
 * 覆盖：
 *   md5：
 *     1) 空串 hash = d41d8cd98f00b204e9800998ecf8427e
 *     2) "abc" hash = 900150983cd24fb0d6963f7d28e17f72
 *     3) "The quick brown fox jumps over the lazy dog" 经典向量
 *   cosDirectUploader：
 *     4) 正常 N=2：fetchSts → 2× wx.request PUT → finalize；fileIds 透传
 *     5) STS files 数量与请求不一致 → throw
 *     6) STS mode='local' → throw code='DIRECT_UPLOAD_LOCAL_MODE'
 *     7) tempFile.size 超过 9.75MB → throw code='DIRECT_UPLOAD_TOO_LARGE'
 *     8) 单份 PUT 失败：第二份成功 → finalize 只带成功的；putErrors 含失败
 *     9) 全部 PUT 失败 → throw code='DIRECT_UPLOAD_ALL_PUT_FAILED'
 *    10) inferType / inferOriginalName / safeName 行为
 */

const path = require('path');
const md5 = require(path.resolve(__dirname, '../../utils/md5'));

// 预备 wx 全局桩
const installWxStub = ({ readFileImpl, requestImpl } = {}) => {
  global.wx = {
    getFileSystemManager: () => ({
      readFile: ({ filePath, success, fail }) => {
        try {
          const result = readFileImpl ? readFileImpl(filePath) : new ArrayBuffer(8);
          setTimeout(() => success({ data: result }), 0);
        } catch (e) {
          setTimeout(() => fail(e), 0);
        }
      }
    }),
    request: ({ url, method, data, header, success, fail, timeout }) => {
      const handler = requestImpl || (() => ({ statusCode: 200, header: { etag: 'fake-etag' } }));
      try {
        const out = handler({ url, method, data, header, timeout });
        // 支持 sync 返回 + Promise 返回
        Promise.resolve(out).then(
          (res) => setTimeout(() => success(res), 0),
          (err) => setTimeout(() => fail(err), 0)
        );
      } catch (e) {
        setTimeout(() => fail(e), 0);
      }
    }
  };
};

const uninstallWxStub = () => {
  delete global.wx;
};

// ===== md5 =====
describe('utils/md5', () => {
  test('空串', () => {
    expect(md5.md5Bytes(new Uint8Array([]))).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });

  test('"abc"', () => {
    const u8 = new Uint8Array([97, 98, 99]);
    expect(md5.md5Bytes(u8)).toBe('900150983cd24fb0d6963f7d28e17f72');
  });

  test('经典 fox 向量', () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    const u8 = new Uint8Array(Buffer.from(text, 'utf8'));
    expect(md5.md5Bytes(u8)).toBe('9e107d9d372bb6826bd81d3542a419d6');
  });

  test('64+ 字节多 block 跨界', () => {
    // 1024 bytes 的 0x41
    const u8 = new Uint8Array(1024).fill(0x41);
    // 用 node crypto 算参考值
    const expected = require('crypto').createHash('md5').update(Buffer.from(u8)).digest('hex');
    expect(md5.md5Bytes(u8)).toBe(expected);
  });
});

// ===== cosDirectUploader =====
describe('utils/cosDirectUploader.directUploadFiles', () => {
  let uploader;

  beforeAll(() => {
    // 重新 require，让 wx 桩到位再加载
    installWxStub();
    uploader = require(path.resolve(__dirname, '../../utils/cosDirectUploader'));
  });

  afterEach(() => {
    uninstallWxStub();
    installWxStub(); // 默认重置
  });

  afterAll(() => {
    uninstallWxStub();
  });

  test('N=2 正常路径', async () => {
    installWxStub({
      readFileImpl: (filePath) => {
        // 用文件路径的 hash 区分文件内容
        const buf = Buffer.from(`content-of-${filePath}`);
        const ab = new ArrayBuffer(buf.length);
        new Uint8Array(ab).set(buf);
        return ab;
      },
      requestImpl: ({ url, method }) => {
        if (method === 'PUT') return { statusCode: 200, header: { etag: 'mock' } };
        throw new Error('unexpected non-PUT call');
      }
    });

    const fetchSts = jest.fn().mockResolvedValue({
      data: {
        mode: 'cos',
        files: [
          { fileKey: 'uploads/1/a.jpg', putUrl: 'https://cos/a?sig=1', host: 'cos', originalName: 'a.jpg', mimeType: 'image/jpeg' },
          { fileKey: 'uploads/1/b.jpg', putUrl: 'https://cos/b?sig=2', host: 'cos', originalName: 'b.jpg', mimeType: 'image/jpeg' }
        ]
      }
    });
    const finalize = jest.fn().mockResolvedValue({
      data: {
        fileIds: [101, 102],
        records: [
          { fileId: 101, recordId: 101, status: 'pending', message: 'ok', originalName: 'a.jpg' },
          { fileId: 102, recordId: 102, status: 'pending', message: 'ok', originalName: 'b.jpg' }
        ],
        successCount: 2,
        total: 2
      }
    });

    const result = await uploader.directUploadFiles(
      {
        tempFiles: [
          { path: '/tmp/a.jpg', size: 1024, fileType: 'image' },
          { path: '/tmp/b.jpg', size: 2048, fileType: 'image' }
        ]
      },
      { fetchSts, finalize }
    );

    expect(fetchSts).toHaveBeenCalledTimes(1);
    expect(fetchSts).toHaveBeenCalledWith({
      count: 2,
      originalNames: 'a.jpg,b.jpg',
      types: 'image/jpeg,image/jpeg'
    });

    expect(finalize).toHaveBeenCalledTimes(1);
    const finArg = finalize.mock.calls[0][0];
    expect(finArg.files).toHaveLength(2);
    expect(finArg.files[0].fileKey).toBe('uploads/1/a.jpg');
    expect(finArg.files[0].fileHash).toMatch(/^[0-9a-f]{32}$/);
    expect(finArg.files[1].fileKey).toBe('uploads/1/b.jpg');

    expect(result.fileIds).toEqual([101, 102]);
    expect(result.mode).toBe('cos');
    expect(result.putErrors).toEqual([]);
  });

  test('STS files 数量不匹配', async () => {
    const fetchSts = jest.fn().mockResolvedValue({ data: { mode: 'cos', files: [{ fileKey: 'x', putUrl: 'y' }] } });
    const finalize = jest.fn();
    await expect(
      uploader.directUploadFiles({ tempFiles: [{ path: '/a', size: 100 }, { path: '/b', size: 100 }] }, { fetchSts, finalize })
    ).rejects.toThrow(/files 数量与请求不一致/);
    expect(finalize).not.toHaveBeenCalled();
  });

  test('mode=local → DIRECT_UPLOAD_LOCAL_MODE', async () => {
    const fetchSts = jest.fn().mockResolvedValue({ data: { mode: 'local', files: [{ fileKey: 'x', putUrl: null, originalName: 'a.jpg' }] } });
    const finalize = jest.fn();
    await expect(
      uploader.directUploadFiles({ tempFiles: [{ path: '/a', size: 100 }] }, { fetchSts, finalize })
    ).rejects.toMatchObject({ code: 'DIRECT_UPLOAD_LOCAL_MODE' });
    expect(finalize).not.toHaveBeenCalled();
  });

  test('文件超大 → DIRECT_UPLOAD_TOO_LARGE', async () => {
    const fetchSts = jest.fn();
    const finalize = jest.fn();
    await expect(
      uploader.directUploadFiles({ tempFiles: [{ path: '/big', size: 11 * 1024 * 1024 }] }, { fetchSts, finalize })
    ).rejects.toMatchObject({ code: 'DIRECT_UPLOAD_TOO_LARGE' });
    expect(fetchSts).not.toHaveBeenCalled();
  });

  test('单份 PUT 失败：另一份成功 → finalize 只带成功 + putErrors 报告失败', async () => {
    let putCalls = 0;
    installWxStub({
      readFileImpl: () => new ArrayBuffer(16),
      requestImpl: () => {
        putCalls += 1;
        // 第 1 次失败 + retry 仍失败（5xx 走重试一次仍不行），第 2 / 3 次成功
        if (putCalls <= 2) return { statusCode: 503 };
        return { statusCode: 200, header: { etag: 'ok' } };
      }
    });

    const fetchSts = jest.fn().mockResolvedValue({
      data: {
        mode: 'cos',
        files: [
          { fileKey: 'uploads/1/x.jpg', putUrl: 'https://cos/x?sig', host: 'cos', originalName: 'x.jpg', mimeType: 'image/jpeg' },
          { fileKey: 'uploads/1/y.jpg', putUrl: 'https://cos/y?sig', host: 'cos', originalName: 'y.jpg', mimeType: 'image/jpeg' }
        ]
      }
    });
    const finalize = jest.fn().mockResolvedValue({
      data: { fileIds: [201], records: [{ fileId: 201, recordId: 201, status: 'pending', originalName: 'y.jpg' }], successCount: 1, total: 1 }
    });

    const result = await uploader.directUploadFiles(
      {
        tempFiles: [
          { path: '/tmp/x.jpg', size: 100, fileType: 'image' },
          { path: '/tmp/y.jpg', size: 100, fileType: 'image' }
        ],
        // 串行化让 putCalls 序号稳定
        concurrency: 1
      },
      { fetchSts, finalize }
    );

    expect(result.fileIds).toEqual([201]);
    expect(result.putErrors).toHaveLength(1);
    expect(result.putErrors[0].originalName).toBe('x.jpg');
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(finalize.mock.calls[0][0].files).toHaveLength(1);
    expect(finalize.mock.calls[0][0].files[0].fileKey).toBe('uploads/1/y.jpg');
  });

  test('全部 PUT 失败 → DIRECT_UPLOAD_ALL_PUT_FAILED', async () => {
    installWxStub({
      readFileImpl: () => new ArrayBuffer(16),
      requestImpl: () => ({ statusCode: 502 }) // 持续 5xx
    });
    const fetchSts = jest.fn().mockResolvedValue({
      data: {
        mode: 'cos',
        files: [{ fileKey: 'uploads/1/x.jpg', putUrl: 'https://cos/x?sig', host: 'cos', originalName: 'x.jpg', mimeType: 'image/jpeg' }]
      }
    });
    const finalize = jest.fn();
    await expect(
      uploader.directUploadFiles({ tempFiles: [{ path: '/x', size: 100, fileType: 'image' }] }, { fetchSts, finalize })
    ).rejects.toMatchObject({ code: 'DIRECT_UPLOAD_ALL_PUT_FAILED' });
    expect(finalize).not.toHaveBeenCalled();
  });

  test('_internals.inferType / inferOriginalName / safeName', () => {
    const i = uploader._internals;
    expect(i.inferType({ fileType: 'pdf' })).toBe('application/pdf');
    expect(i.inferType({ fileType: 'image', path: '/tmp/foo.PNG' })).toBe('image/png');
    expect(i.inferType({ fileType: 'image', path: '/tmp/foo.jpeg' })).toBe('image/jpeg');
    expect(i.inferType({})).toBe('application/octet-stream');

    expect(i.inferOriginalName({ name: 'report.jpg' }, 0)).toBe('report.jpg');
    expect(i.inferOriginalName({ path: '/tmp/wx/abcd.png' }, 0)).toBe('abcd.png');
    expect(i.inferOriginalName({}, 3)).toBe('file_4.bin');

    expect(i.safeName('a,b\nc.jpg')).toBe('a_b_c.jpg');
    expect(i.safeName('x'.repeat(500)).length).toBe(200);
  });
});
