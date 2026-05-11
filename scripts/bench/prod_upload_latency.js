#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Production upload + OCR end-to-end latency benchmark.
 *
 * 用途：在 https://inseq.top 上跑 N 次「上传一份 PDF → 等到解析完成」的全链路计时，
 * 拿到 baseline 数字（当前生产**没有**Phase 1.x OCR 优化合并），用于和将来 push 上线
 * 后的同样指标做对比。
 *
 * Usage:
 *   PROD_JWT='Bearer xxx...' node scripts/bench/prod_upload_latency.js \
 *       --pdf <path> [--iters 5] [--base https://inseq.top]
 *
 * Env:
 *   PROD_JWT          必填。生产用户 JWT（含或不含 "Bearer " 前缀均可）
 *   PROD_UPLOAD_FILE  可选。测试 PDF 路径；也可用 --pdf 传入
 *   PROD_BASE         可选。默认 https://inseq.top
 *
 * 输出：每次迭代的分阶段耗时 + 末尾 P50/P95/min/max 汇总。
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const args = process.argv.slice(2);
const argv = (k, def) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : def;
};

const PDF_PATH = process.env.PROD_UPLOAD_FILE || argv('pdf', '');
const ITERS = parseInt(argv('iters', '3'), 10);
const BASE = (process.env.PROD_BASE || argv('base', 'https://inseq.top')).replace(/\/$/, '');
const JWT_RAW = process.env.PROD_JWT || '';
const POLL_INTERVAL_MS = parseInt(argv('poll', '500'), 10);
const HARD_TIMEOUT_MS = parseInt(argv('timeout', '180000'), 10); // 3 分钟

if (!JWT_RAW) {
  console.error('ERROR: 必须设置 PROD_JWT 环境变量');
  process.exit(1);
}
if (!PDF_PATH) {
  console.error('ERROR: 必须通过 --pdf 或 PROD_UPLOAD_FILE 指定测试 PDF');
  process.exit(1);
}
if (!fs.existsSync(PDF_PATH)) {
  console.error(`ERROR: PDF 不存在: ${PDF_PATH}`);
  process.exit(1);
}

const AUTH = JWT_RAW.startsWith('Bearer ') ? JWT_RAW : `Bearer ${JWT_RAW}`;
const PDF_BUF = fs.readFileSync(PDF_PATH);
const PDF_NAME = path.basename(PDF_PATH);
const PDF_SIZE = PDF_BUF.length;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const doRequest = (method, urlStr, headers, body) => new Promise((resolve, reject) => {
  const u = new URL(urlStr);
  const lib = u.protocol === 'https:' ? https : http;
  const req = lib.request({
    method,
    hostname: u.hostname,
    port: u.port || (u.protocol === 'https:' ? 443 : 80),
    path: u.pathname + (u.search || ''),
    headers
  }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      resolve({ status: res.statusCode, headers: res.headers, body: text });
    });
  });
  req.on('error', reject);
  if (body) req.write(body);
  req.end();
});

const buildMultipart = ({ filename, buffer, fields = {} }) => {
  const boundary = `----prodbench${Date.now()}${Math.random().toString(36).slice(2)}`;
  const eol = '\r\n';
  const parts = [];

  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}${eol}` +
      `Content-Disposition: form-data; name="${k}"${eol}${eol}` +
      `${v}${eol}`
    ));
  }
  parts.push(Buffer.from(
    `--${boundary}${eol}` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"${eol}` +
    `Content-Type: application/pdf${eol}${eol}`
  ));
  parts.push(buffer);
  parts.push(Buffer.from(`${eol}--${boundary}--${eol}`));

  return { body: Buffer.concat(parts), boundary };
};

const upload = async () => {
  // forceReparse=true 防止 OCR 缓存（即便生产已经缓存我们的样本，也能测真实首跑路径）
  const { body, boundary } = buildMultipart({
    filename: PDF_NAME,
    buffer: PDF_BUF,
    fields: { type: 'medical', remark: 'prod-bench', forceReparse: 'true' }
  });
  const t0 = Date.now();
  const res = await doRequest('POST', `${BASE}/api/medical/upload`, {
    'Authorization': AUTH,
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': body.length,
    'X-Bench': 'prod-upload-latency-1'
  }, body);
  const tUploadDone = Date.now();

  if (res.status !== 200) {
    throw new Error(`upload failed: HTTP ${res.status} body=${res.body.slice(0, 300)}`);
  }
  let parsed;
  try { parsed = JSON.parse(res.body); }
  catch (e) { throw new Error(`upload JSON parse failed: ${e.message} body=${res.body.slice(0, 300)}`); }

  const data = parsed.data || parsed;
  const fileId = data.fileId || data.recordId;
  if (!fileId) throw new Error(`upload OK but no fileId: ${JSON.stringify(parsed).slice(0, 300)}`);

  return { fileId, tUploadStart: t0, tUploadDone };
};

const pollUntilDone = async (fileId, tUploadDone) => {
  const tStartPoll = Date.now();
  let firstAnalyzingAt = null;
  let lastStatus = null;
  let polls = 0;

  while (true) {
    polls += 1;
    const elapsed = Date.now() - tStartPoll;
    if (elapsed > HARD_TIMEOUT_MS) {
      return { status: 'timeout', polls, firstAnalyzingAt, tDone: null, lastStatus };
    }

    const res = await doRequest('GET', `${BASE}/api/medical/parse-status?fileId=${encodeURIComponent(fileId)}`, {
      'Authorization': AUTH
    });
    if (res.status !== 200) {
      // 404 可能因为 record 还没落库（race）；继续轮询直到超时
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    let parsed;
    try { parsed = JSON.parse(res.body); }
    catch { await sleep(POLL_INTERVAL_MS); continue; }
    const data = parsed.data || parsed;
    const status = data.status;
    lastStatus = status;

    if (status === 'analyzing' && !firstAnalyzingAt) {
      firstAnalyzingAt = Date.now();
    }
    if (status === 'completed') {
      return { status: 'completed', polls, firstAnalyzingAt, tDone: Date.now(), lastStatus, result: data.result };
    }
    if (status === 'error') {
      return { status: 'error', polls, firstAnalyzingAt, tDone: Date.now(), lastStatus, errorMsg: data.errorMsg || '(no message)' };
    }
    await sleep(POLL_INTERVAL_MS);
  }
};

const fmt = (ms) => `${(ms / 1000).toFixed(2)}s`;
const percentile = (arr, p) => {
  if (!arr.length) return NaN;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
};

(async () => {
  console.log('=== prod upload + OCR latency bench ===');
  console.log(`base=${BASE}`);
  console.log(`pdf=${PDF_PATH} (${(PDF_SIZE / 1024).toFixed(1)} KB)`);
  console.log(`iters=${ITERS} pollInterval=${POLL_INTERVAL_MS}ms hardTimeout=${HARD_TIMEOUT_MS}ms`);
  console.log('');

  const results = [];
  for (let i = 1; i <= ITERS; i++) {
    process.stdout.write(`[${i}/${ITERS}] uploading… `);
    let up;
    try {
      up = await upload();
    } catch (e) {
      console.log(`FAIL upload: ${e.message}`);
      results.push({ ok: false, stage: 'upload', err: e.message });
      continue;
    }
    process.stdout.write(`uploaded fileId=${up.fileId} (${fmt(up.tUploadDone - up.tUploadStart)})  polling… `);

    const poll = await pollUntilDone(up.fileId, up.tUploadDone);
    if (poll.status === 'completed') {
      const totalMs = poll.tDone - up.tUploadStart;
      const uploadMs = up.tUploadDone - up.tUploadStart;
      const ttAnalyzingMs = poll.firstAnalyzingAt ? poll.firstAnalyzingAt - up.tUploadDone : null;
      const ocrMs = poll.tDone - up.tUploadDone;
      console.log(`OK total=${fmt(totalMs)} upload=${fmt(uploadMs)} ttAnalyzing=${ttAnalyzingMs !== null ? fmt(ttAnalyzingMs) : 'n/a'} ocr=${fmt(ocrMs)} polls=${poll.polls}`);
      results.push({
        ok: true, totalMs, uploadMs, ttAnalyzingMs, ocrMs, polls: poll.polls,
        fileId: up.fileId,
        diagnosis: poll.result && poll.result.diagnosis
      });
    } else if (poll.status === 'timeout') {
      console.log(`TIMEOUT lastStatus=${poll.lastStatus} polls=${poll.polls}`);
      results.push({ ok: false, stage: 'poll-timeout', lastStatus: poll.lastStatus, polls: poll.polls });
    } else {
      console.log(`ERROR ocr-failed: ${poll.errorMsg}`);
      results.push({ ok: false, stage: 'ocr-error', errorMsg: poll.errorMsg, polls: poll.polls });
    }
  }

  console.log('');
  console.log('=== summary ===');
  const ok = results.filter((r) => r.ok);
  console.log(`success: ${ok.length}/${results.length}`);
  if (!ok.length) {
    console.log('no successful runs; failures:');
    for (const r of results) console.log(`  - ${JSON.stringify(r)}`);
    process.exit(2);
  }

  const cols = [
    { name: 'total', vals: ok.map((r) => r.totalMs) },
    { name: 'upload', vals: ok.map((r) => r.uploadMs) },
    { name: 'tt-analyzing', vals: ok.map((r) => r.ttAnalyzingMs).filter((v) => v != null) },
    { name: 'ocr-only', vals: ok.map((r) => r.ocrMs) }
  ];
  console.log('phase           min      P50      P95      max');
  for (const c of cols) {
    if (!c.vals.length) {
      console.log(`${c.name.padEnd(15)} (n/a — never observed)`);
      continue;
    }
    console.log(
      `${c.name.padEnd(15)} ${fmt(Math.min(...c.vals)).padStart(7)}  ${fmt(percentile(c.vals, 50)).padStart(7)}  ${fmt(percentile(c.vals, 95)).padStart(7)}  ${fmt(Math.max(...c.vals)).padStart(7)}`
    );
  }
  console.log('');
  console.log('per-iteration:');
  for (const r of ok) {
    console.log(`  fileId=${r.fileId} total=${fmt(r.totalMs)} upload=${fmt(r.uploadMs)} ocr=${fmt(r.ocrMs)} diagnosis="${(r.diagnosis || '').slice(0, 40)}"`);
  }
})().catch((err) => {
  console.error('FATAL:', err.stack || err.message);
  process.exit(3);
});
