#!/usr/bin/env node
/**
 * PRD-2026Q2 §2.2：把现存 COS 对象批量重写成带 SSE-S3 的版本。
 *
 * 用法：
 *   # dry-run（只列出未加密对象，不改动）
 *   node server/scripts/migrateCosEncryption.js --prefix=uploads/ --dry-run
 *
 *   # 实际执行（分批 500，每批之间 sleep 1s）
 *   node server/scripts/migrateCosEncryption.js --prefix=uploads/ --batch=500
 *
 * 注意：
 *  - cos.putObjectCopy 在"源=目标"时等价于 in-place rewrite，
 *    会生成新版本的 ETag；客户端已持有的预签名 URL 会失效。
 *    执行前在群里打 10min 公告。
 *  - 脚本记录 checkpoint 到 stdout，建议 tee 到日志文件。
 */

require('dotenv').config();
const COS = require('cos-nodejs-sdk-v5');
const logger = require('../utils/logger');

const args = process.argv.slice(2);
const getArg = (name, defaultValue = undefined) => {
  const prefixed = `--${name}=`;
  const found = args.find((a) => a.startsWith(prefixed));
  if (found) return found.slice(prefixed.length);
  return args.includes(`--${name}`) ? true : defaultValue;
};

const dryRun = Boolean(getArg('dry-run'));
const prefix = getArg('prefix', 'uploads/');
const batchSize = Number(getArg('batch', 500));
const betweenBatchMs = Number(getArg('delay-ms', 1000));

const bucket = process.env.COS_BUCKET;
const region = process.env.COS_REGION || 'ap-shanghai';

if (!bucket || !process.env.COS_SECRET_ID || !process.env.COS_SECRET_KEY) {
  logger.error('COS_BUCKET / COS_SECRET_ID / COS_SECRET_KEY 未配置');
  process.exit(1);
}

const cos = new COS({
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KEY
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const listPage = (marker) => new Promise((resolve, reject) => {
  cos.getBucket(
    {
      Bucket: bucket,
      Region: region,
      Prefix: prefix,
      Marker: marker,
      MaxKeys: 1000
    },
    (err, data) => (err ? reject(err) : resolve(data))
  );
});

const headObject = (key) => new Promise((resolve, reject) => {
  cos.headObject({ Bucket: bucket, Region: region, Key: key }, (err, data) => {
    if (err) return reject(err);
    resolve(data);
  });
});

const copyInPlaceWithSse = (key) => new Promise((resolve, reject) => {
  cos.putObjectCopy(
    {
      Bucket: bucket,
      Region: region,
      Key: key,
      CopySource: `${bucket}.cos.${region}.myqcloud.com/${encodeURI(key)}`,
      MetadataDirective: 'Copy',
      ServerSideEncryption: 'AES256'
    },
    (err, data) => (err ? reject(err) : resolve(data))
  );
});

const main = async () => {
  logger.info('migrateCosEncryption 开始', { bucket, region, prefix, dryRun, batchSize });

  let marker;
  let scanned = 0;
  let alreadyOk = 0;
  let rewritten = 0;
  let failed = 0;
  let batchCursor = 0;

  do {
    const page = await listPage(marker);
    const contents = page.Contents || [];
    marker = page.IsTruncated === 'true' ? page.NextMarker : undefined;

    for (const obj of contents) {
      scanned += 1;
      const key = obj.Key;
      let encrypted = false;
      try {
        const head = await headObject(key);
        const headers = head.headers || {};
        encrypted = Boolean(headers['x-cos-server-side-encryption']);
      } catch (e) {
        logger.warn('headObject 失败，跳过', { key, error: e.message });
        failed += 1;
        continue;
      }

      if (encrypted) {
        alreadyOk += 1;
        continue;
      }

      if (dryRun) {
        logger.info(`[dry-run] 将重写: ${key}`);
        rewritten += 1;
        continue;
      }

      try {
        await copyInPlaceWithSse(key);
        rewritten += 1;
        logger.info(`已重写: ${key}`);
      } catch (e) {
        failed += 1;
        logger.error('putObjectCopy 失败', { key, error: e.message });
      }

      batchCursor += 1;
      if (batchCursor >= batchSize) {
        logger.info(`批次已达 ${batchCursor}，休眠 ${betweenBatchMs}ms`);
        await sleep(betweenBatchMs);
        batchCursor = 0;
      }
    }
  } while (marker);

  logger.info('migrateCosEncryption 完成', {
    scanned,
    alreadyOk,
    rewritten,
    failed,
    dryRun
  });

  process.exit(failed > 0 ? 2 : 0);
};

main().catch((e) => {
  logger.error('脚本异常退出', { error: e.message, stack: e.stack });
  process.exit(1);
});
