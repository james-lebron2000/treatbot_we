/**
 * Plan §Phase 2.1：客户端直传 COS 的编排器（用户最痛的"上传慢/卡顿"主刀点）。
 *
 * 流程：
 *   1) GET /api/medical/upload-sts?count=N&originalNames=...&types=...
 *      → 服务端预生成 N 个 fileKey + 每份"已签名 PUT URL"（STS 1800s 有效）
 *   2) 对每份文件：
 *        wx.getFileSystemManager().readFile → ArrayBuffer
 *        md5(ArrayBuffer)                   → fileHash hex
 *        wx.request({method:'PUT', url:putUrl, data:ArrayBuffer})
 *      并发 3，单份失败重试 1 次（瞬时网络/5xx）
 *   3) POST /api/medical/upload-finalize  body={files:[...]}
 *      → 服务端 dedup + 入队 OCR；返回 records/fileIds
 *
 * 设计要点：
 *   - putUrl 由服务端用 STS 临时凭证签好；客户端零 crypto 依赖（除 md5.js）
 *   - 服务端 mode:'local' 时直接抛特殊 error，调用方回落到 legacy /medical/upload
 *   - 单份失败不阻塞整批；errors[] 与 records[] 分别返回，调用方决定如何展示
 *   - 文件大小 ≤ 9MB（与 upload page MAX_UPLOAD_BYTES 一致）；wx.request body 上限 10MB
 */

const md5 = require('./md5');

const SUPPORTED_DIRECT_MAX_BYTES = 10 * 1024 * 1024 - 256 * 1024; // 9.75MB 给 PUT header 留余量
const PUT_DEFAULT_TIMEOUT_MS = 60000;
const PUT_RETRY_DELAY_MS = 1500;
const FINALIZE_DEFAULT_TIMEOUT_MS = 30000;

const isLocalModeError = (e) => e && e.code === 'DIRECT_UPLOAD_LOCAL_MODE';

const buildLocalModeError = () => {
  const e = new Error('服务端为 local-storage 模式，未启用 COS 直传');
  e.code = 'DIRECT_UPLOAD_LOCAL_MODE';
  return e;
};

const safeName = (name) => {
  if (!name) return 'file.bin';
  // 不允许逗号（splited by ',' on server side）
  return String(name).replace(/[,\r\n]/g, '_').slice(0, 200);
};

const inferType = (file) => {
  const explicit = (file && file.fileType) || '';
  if (explicit === 'pdf') return 'application/pdf';
  if (explicit === 'image') {
    const lower = (file && (file.path || file.name) || '').toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.heic')) return 'image/heic';
    return 'image/jpeg';
  }
  return (file && file.mimeType) || 'application/octet-stream';
};

const inferOriginalName = (file, idx) => {
  const raw = (file && (file.name || file.fileName || file.path)) || '';
  const tail = raw.split(/[\\/]/).pop();
  return safeName(tail || `file_${idx + 1}.bin`);
};

const readFileAsArrayBuffer = (filePath) => new Promise((resolve, reject) => {
  try {
    wx.getFileSystemManager().readFile({
      filePath,
      success: (res) => {
        const ab = res && res.data;
        if (ab instanceof ArrayBuffer) {
          resolve(ab);
        } else if (ab && ab.buffer instanceof ArrayBuffer) {
          // 某些基础库返回 typed array
          resolve(ab.buffer);
        } else {
          reject(new Error('readFile 返回非 ArrayBuffer'));
        }
      },
      fail: (err) => reject(err)
    });
  } catch (e) {
    reject(e);
  }
});

const arrayBufferToUint8 = (ab) => new Uint8Array(ab);

// 服务端在 wx.request 失败 / 5xx 时给一次退避重试
const isTransientPutError = (statusCode) => {
  const sc = Number(statusCode || 0);
  return sc === 0 || sc >= 500;
};

const putToCos = (putUrl, arrayBuffer, mimeType, opts = {}) => new Promise((resolve, reject) => {
  const timeout = opts.timeout || PUT_DEFAULT_TIMEOUT_MS;
  let retried = false;

  const fire = () => {
    wx.request({
      url: putUrl,
      method: 'PUT',
      data: arrayBuffer,
      timeout,
      header: {
        'Content-Type': mimeType || 'application/octet-stream'
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, etag: (res.header && (res.header.etag || res.header.ETag)) || '' });
          return;
        }
        if (isTransientPutError(res.statusCode) && !retried) {
          retried = true;
          setTimeout(fire, PUT_RETRY_DELAY_MS);
          return;
        }
        const err = new Error(`COS PUT 失败 (HTTP ${res.statusCode})`);
        err.statusCode = res.statusCode;
        err.response = res.data;
        reject(err);
      },
      fail: (err) => {
        if (!retried) {
          retried = true;
          setTimeout(fire, PUT_RETRY_DELAY_MS);
          return;
        }
        const wrapped = new Error('COS PUT 网络失败');
        wrapped.statusCode = 0;
        wrapped.cause = err;
        reject(wrapped);
      }
    });
  };

  fire();
});

const concurrentMap = async (items, limit, fn) => {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    for (;;) {
      const idx = cursor;
      cursor += 1;
      if (idx >= items.length) return;
      try {
        results[idx] = { ok: true, value: await fn(items[idx], idx) };
      } catch (err) {
        results[idx] = { ok: false, error: err };
      }
    }
  });
  await Promise.all(workers);
  return results;
};

/**
 * @param {object} deps  注入 fetchSts/finalize 便于测试
 *   deps.fetchSts(query) → Promise<server response>
 *   deps.finalize(payload) → Promise<server response>
 */
const directUploadFiles = async ({ tempFiles, type, remark, onProgress, concurrency = 3 }, deps = {}) => {
  if (!Array.isArray(tempFiles) || !tempFiles.length) {
    throw new Error('tempFiles 不能为空');
  }
  for (let i = 0; i < tempFiles.length; i += 1) {
    const f = tempFiles[i];
    if (Number(f.size || 0) > SUPPORTED_DIRECT_MAX_BYTES) {
      const err = new Error(`第 ${i + 1} 份文件超过直传上限（${(SUPPORTED_DIRECT_MAX_BYTES / 1024 / 1024).toFixed(1)}MB）`);
      err.code = 'DIRECT_UPLOAD_TOO_LARGE';
      throw err;
    }
  }

  const originalNames = tempFiles.map((f, i) => inferOriginalName(f, i));
  const types = tempFiles.map(inferType);

  const stsRes = await deps.fetchSts({
    count: tempFiles.length,
    originalNames: originalNames.join(','),
    types: types.join(',')
  });

  const stsData = (stsRes && stsRes.data) || stsRes;
  if (!stsData || !Array.isArray(stsData.files) || stsData.files.length !== tempFiles.length) {
    throw new Error('STS 返回数据异常：files 数量与请求不一致');
  }
  if (stsData.mode === 'local') {
    // 服务端未配 COS（或本地联调）→ 上层走 legacy 路径
    throw buildLocalModeError();
  }

  // Step 2：并发 PUT 每份
  if (typeof onProgress === 'function') onProgress({ phase: 'uploading', done: 0, total: tempFiles.length });
  let putDone = 0;
  const putResults = await concurrentMap(tempFiles, Math.max(1, Math.min(concurrency, tempFiles.length)), async (file, idx) => {
    const stsFile = stsData.files[idx];
    if (!stsFile || !stsFile.putUrl || !stsFile.fileKey) {
      throw new Error(`第 ${idx + 1} 份缺少 putUrl/fileKey`);
    }
    const ab = await readFileAsArrayBuffer(file.path);
    const u8 = arrayBufferToUint8(ab);
    const fileHash = md5.md5Bytes(u8);
    const mimeType = types[idx];
    await putToCos(stsFile.putUrl, ab, mimeType);
    putDone += 1;
    if (typeof onProgress === 'function') onProgress({ phase: 'uploading', done: putDone, total: tempFiles.length });
    return {
      fileKey: stsFile.fileKey,
      fileHash,
      size: ab.byteLength,
      mimeType,
      originalName: stsFile.originalName || originalNames[idx]
    };
  });

  // 汇总成功 / 失败
  const finalizePayload = [];
  const putErrors = [];
  putResults.forEach((r, idx) => {
    if (r.ok) {
      finalizePayload.push({ ...r.value, type: type || 'auto', remark: remark || '' });
    } else {
      putErrors.push({
        index: idx,
        originalName: originalNames[idx],
        message: (r.error && r.error.message) || 'PUT 失败'
      });
    }
  });

  if (!finalizePayload.length) {
    const err = new Error('全部文件 PUT 失败');
    err.code = 'DIRECT_UPLOAD_ALL_PUT_FAILED';
    err.putErrors = putErrors;
    throw err;
  }

  // Step 3：finalize
  if (typeof onProgress === 'function') onProgress({ phase: 'finalizing', done: putDone, total: tempFiles.length });
  const finRes = await deps.finalize({
    files: finalizePayload,
    totalCount: tempFiles.length,
    uploadErrors: putErrors
  });
  const finData = (finRes && finRes.data) || finRes;
  const records = (finData && Array.isArray(finData.records)) ? finData.records : [];
  const fileIds = (finData && Array.isArray(finData.fileIds)) ? finData.fileIds : records.map((r) => r.fileId).filter(Boolean);

  return {
    batchId: (finData && finData.batchId) || '',
    fileIds,
    records,
    total: tempFiles.length,
    successCount: finData && finData.successCount !== undefined ? finData.successCount : fileIds.length,
    failedCount: finData && finData.failedCount !== undefined ? finData.failedCount : putErrors.length,
    putErrors,
    mode: stsData.mode || 'cos',
    // Plan §Phase 3.4：finalize 响应里的队列深度（{waiting, active, total}），上层用来渲染"前面还有 N 份"
    queueDepth: (finData && typeof finData.queueDepth === 'object') ? finData.queueDepth : null
  };
};

module.exports = {
  directUploadFiles,
  isLocalModeError,
  // 暴露给单测
  _internals: {
    SUPPORTED_DIRECT_MAX_BYTES,
    isTransientPutError,
    inferType,
    inferOriginalName,
    safeName,
    concurrentMap,
    buildLocalModeError
  }
};
