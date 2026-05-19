const COS = require('cos-nodejs-sdk-v5');
const STS = require('qcloud-cos-sts');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const fsPromises = require('fs/promises');
const logger = require('../utils/logger');

// PRD-2026Q4 T0-7 followup：COS 凭证 / bucket / region 全部走 per-call getter。
// 老实现把 useLocalStorage / bucket / region 写在 module 顶层 const，进程启动
// 时如果 COS env 还没注入（容器 secret 时序问题），就永远走本地磁盘存储——
// 这是 OCR_PROVIDER=kimi 残留事故的同 class of bug，影响面更大（医疗影像走错存储）。
const localUploadRoot = path.join(__dirname, '..', 'uploads');
const NODE_ENV = process.env.NODE_ENV || 'development';
const isNonDevEnv = NODE_ENV !== 'development' && NODE_ENV !== 'test';

const getCosBucket = () => process.env.COS_BUCKET || '';
const getCosRegion = () => process.env.COS_REGION || 'ap-shanghai';
const getCosAppId = () => {
  const explicit = `${process.env.COS_APPID || ''}`.trim();
  if (explicit) {
    return explicit;
  }
  const match = `${getCosBucket()}`.match(/-(\d{5,})$/);
  return match ? match[1] : '';
};
const isLocalStorage = () =>
  !process.env.COS_SECRET_ID || !process.env.COS_SECRET_KEY || !getCosBucket();

// COS SDK 客户端：lazy singleton，凭证哈希做 cache-key，rotate 后自动重建。
let _cosClient = null;
let _cosClientCredentialKey = '';
let _localStorageBootstrapped = false;
const getCosClient = () => {
  const credKey = `${process.env.COS_SECRET_ID || ''}|${process.env.COS_SECRET_KEY || ''}`;
  if (_cosClient && _cosClientCredentialKey === credKey) {
    return _cosClient;
  }
  _cosClient = new COS({
    SecretId: process.env.COS_SECRET_ID,
    SecretKey: process.env.COS_SECRET_KEY
  });
  _cosClientCredentialKey = credKey;
  return _cosClient;
};

// 第一次进入本地存储分支时（不是 require 时）建目录并打 warn。多次调用幂等。
const ensureLocalStorageBootstrapped = () => {
  if (_localStorageBootstrapped) return;
  fs.mkdirSync(localUploadRoot, { recursive: true });
  logger.warn('COS 未配置，已启用本地文件存储模式');
  _localStorageBootstrapped = true;
};

const normalizeLocalKey = (key) => {
  return key.replace(/^\/+/, '').replace(/^uploads\//, '');
};

const normalizeBaseUrl = (value) => `${value || ''}`.trim().replace(/\/+$/, '');

const resolveRequestOrigin = (req) => {
  if (!req) {
    return '';
  }

  const forwardedProto = `${req.headers?.['x-forwarded-proto'] || ''}`.split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || (req.secure ? 'https' : 'http');
  const host = (typeof req.get === 'function' && req.get('host')) || req.headers?.host || '';
  if (!host) {
    return '';
  }
  return normalizeBaseUrl(`${protocol}://${host}`);
};

const getPublicBaseUrl = (req) => {
  const fromRequest = resolveRequestOrigin(req);
  if (fromRequest) {
    return fromRequest;
  }

  const configured = (process.env.PUBLIC_BASE_URL || '').trim();
  if (configured) {
    if (isNonDevEnv && !configured.startsWith('https://')) {
      logger.warn('PUBLIC_BASE_URL 未使用 HTTPS，建议仅用于联调环境', { nodeEnv: NODE_ENV, configured });
    }
    return normalizeBaseUrl(configured);
  }

  if (isNonDevEnv && isLocalStorage()) {
    logger.warn('本地存储模式下未配置 PUBLIC_BASE_URL，将回退到本机地址，仅适用于联调环境', {
      nodeEnv: NODE_ENV
    });
  }

  return `http://127.0.0.1:${process.env.PORT || 3000}`;
};

const getInternalBaseUrl = () => {
  if (isLocalStorage()) {
    return `http://127.0.0.1:${process.env.PORT || 3000}`;
  }
  return getPublicBaseUrl();
};

/**
 * 生成文件存储 Key
 */
const generateKey = (userId, originalName) => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 10);
  const ext = path.extname(originalName) || '.jpg';
  return `uploads/${userId}/${timestamp}_${random}${ext}`;
};

/**
 * 计算文件 MD5
 */
const calculateMD5 = (buffer) => {
  return crypto.createHash('md5').update(buffer).digest('hex');
};

/**
 * 上传文件到 COS
 */
const uploadFile = async (buffer, key, options = {}) => {
  if (isLocalStorage()) {
    ensureLocalStorageBootstrapped();
    const normalizedKey = normalizeLocalKey(key);
    const fullPath = path.join(localUploadRoot, normalizedKey);
    await fsPromises.mkdir(path.dirname(fullPath), { recursive: true });
    await fsPromises.writeFile(fullPath, buffer);
    const url = `${getPublicBaseUrl()}/uploads/${normalizedKey}`;
    logger.info('文件本地存储成功:', { key: normalizedKey });
    return {
      success: true,
      key,
      etag: calculateMD5(buffer),
      url
    };
  }

  try {
    // PRD-2026Q2 §2.2：COS 侧服务端加密（SSE-S3 / AES256）强制开启，配合存储桶策略
    // "拒绝未加密上传" 做兜底。未来若启用 SSE-COS 托管 KMS，可改 ServerSideEncryption: 'cos/kms'。
    const result = await getCosClient().putObject({
      Bucket: getCosBucket(),
      Region: getCosRegion(),
      Key: key,
      Body: buffer,
      ContentLength: buffer.length,
      ContentType: options.contentType || 'application/octet-stream',
      // Plan §Phase 2.4：显式声明源站不可缓存。CDN 边缘节点配合"遵循源站 Cache-Control"
      // 开关，确保病历图绝不落到边缘节点缓存（PII 合规）。
      CacheControl: 'private, max-age=0, no-store',
      Metadata: options.metadata || {},
      ServerSideEncryption: 'AES256'
    });

    logger.info('文件上传成功:', { key, etag: result.ETag, sse: 'AES256' });
    
    return {
      success: true,
      key: key,
      etag: result.ETag,
      url: `https://${getCosBucket()}.cos.${getCosRegion()}.myqcloud.com/${key}`
    };
  } catch (error) {
    logger.error('文件上传失败:', error);
    throw error;
  }
};

/**
 * Plan §Phase 1.5：流式 MD5 计算 —— 不把整个 buffer 载进 RAM。
 * 与 calculateMD5(buffer) 行为一致（同 hex），但消耗常量内存。
 */
const calculateMD5Stream = (filePath) => new Promise((resolve, reject) => {
  if (!filePath) return reject(new Error('calculateMD5Stream: filePath 必传'));
  const hash = crypto.createHash('md5');
  const stream = fs.createReadStream(filePath);
  stream.on('error', reject);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('end', () => resolve(hash.digest('hex')));
});

/**
 * Plan §Phase 1.5：流式上传 —— 替代 uploadFile(buffer) 的 RAM 双倍占用。
 *
 * 与 uploadFile 共享语义（相同的 key / contentType / metadata），但读盘流式 →
 * 5 × 30MB 批量时进程 RSS 不再翻倍。
 *
 * COS 路径走 sliceUploadFile（自动分片），本地存储走 fs.copyFile。
 * etagOverride：流式上传场景下调用方往往已经在外面用 calculateMD5Stream 算好 hash，
 *               把它当 etag 透出来供日志/去重，避免再读一次。
 */
const uploadStream = async (filePath, key, options = {}) => {
  if (!filePath) {
    throw new Error('uploadStream: filePath 必传');
  }

  if (isLocalStorage()) {
    const normalizedKey = normalizeLocalKey(key);
    const fullPath = path.join(localUploadRoot, normalizedKey);
    await fsPromises.mkdir(path.dirname(fullPath), { recursive: true });
    await fsPromises.copyFile(filePath, fullPath);
    const url = `${getPublicBaseUrl()}/uploads/${normalizedKey}`;
    logger.info('文件本地存储成功（stream）:', { key: normalizedKey });
    return {
      success: true,
      key,
      etag: options.etagOverride || null,
      url
    };
  }

  return new Promise((resolve, reject) => {
    getCosClient().sliceUploadFile({
      Bucket: getCosBucket(),
      Region: getCosRegion(),
      Key: key,
      FilePath: filePath,
      ContentType: options.contentType || 'application/octet-stream',
      // Plan §Phase 2.4：与 putObject 保持一致 —— CDN 不能缓存病历图。
      CacheControl: 'private, max-age=0, no-store',
      Metadata: options.metadata || {},
      ServerSideEncryption: 'AES256'
    }, (err, data) => {
      if (err) {
        logger.error('文件流式上传失败:', err);
        return reject(err);
      }
      logger.info('文件流式上传成功:', { key, etag: data && data.ETag, sse: 'AES256' });
      resolve({
        success: true,
        key,
        etag: options.etagOverride || (data && data.ETag) || null,
        url: `https://${getCosBucket()}.cos.${getCosRegion()}.myqcloud.com/${key}`
      });
    });
  });
};

/**
 * 获取临时下载链接
 *
 * PRD-2026Q2 §2.2：默认 TTL 从 3600s 收紧至 300s。调用方如果需要更长 TTL
 * （如 Admin 导出给运营侧用），显式传 expires。
 */
const DEFAULT_PRESIGNED_EXPIRES = 300;

const getPresignedUrl = async (key, expires = DEFAULT_PRESIGNED_EXPIRES) => {
  if (isLocalStorage()) {
    const normalizedKey = normalizeLocalKey(key);
    return `${getPublicBaseUrl()}/uploads/${normalizedKey}`;
  }

  try {
    const result = await getCosClient().getObjectUrl({
      Bucket: getCosBucket(),
      Region: getCosRegion(),
      Key: key,
      Sign: true,
      Expires: expires
    });

    // cos-nodejs-sdk-v5 getObjectUrl can return either string URL or an object.
    if (typeof result === 'string' && result.trim()) {
      return result;
    }
    if (result && typeof result.Url === 'string' && result.Url.trim()) {
      return result.Url;
    }
    if (result && typeof result.url === 'string' && result.url.trim()) {
      return result.url;
    }

    throw new Error('COS 预签名URL返回格式异常');
  } catch (error) {
    logger.error('获取预签名URL失败:', error);
    throw error;
  }
};

const getInternalUrl = async (key) => {
  if (isLocalStorage()) {
    const normalizedKey = normalizeLocalKey(key);
    return `${getInternalBaseUrl()}/uploads/${normalizedKey}`;
  }
  return getPresignedUrl(key, 3600);
};

/**
 * Plan §Phase 2.4：把 *.cos.{region}.myqcloud.com 的预签名 URL host 改写为 CDN 域，
 * 让 LLM provider 通过腾讯云 CDN 边缘节点回源 COS（TLS 复用 + 边缘连接复用）。
 *
 * 关键缓存策略说明：CDN 缓存策略必须设为 `Cache-Control: private, max-age=0`
 * （在 CDN 控制台配置，不在这里），我们要的是连接复用而非缓存 —— 病历图缓存到
 * CDN 边缘有合规风险。
 *
 * 行为契约：
 *  - COS_CDN_DOMAIN 未配置 → 原样返回（无侵入）
 *  - 配置后，仅当 host 形如 *.cos.<region>.myqcloud.com 时改写；其他 host 不动，
 *    避免误改 PUT 直传 URL 或本地存储 URL
 *  - scheme 强制 https
 *  - URL 上的端口（如 :8443）会被清掉，CDN 走默认 443
 *  - 签名查询串完整保留
 *  - 任何畸形输入都原样返回，绝不破坏 OCR 主路径
 */
const wrapPresignedWithCdn = (url) => {
  const domain = `${process.env.COS_CDN_DOMAIN || ''}`.trim();
  if (!domain) return url;
  if (typeof url !== 'string' || !url) return url;
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_e) {
    return url;
  }
  if (!/\.cos\.[^.]+\.myqcloud\.com$/i.test(parsed.hostname)) {
    return url;
  }
  parsed.protocol = 'https:';
  parsed.host = domain;
  parsed.port = '';
  return parsed.toString();
};

/**
 * 从 COS 拉回对象为 Buffer（用于后端代理下载 / 脱离浏览器直连）。
 *
 * PRD-2026Q2 §2.2：敏感路径的下载应走本函数，前端经 /api/medical/records/:id/file
 * 拿到内容而不是直接访问 *.myqcloud.com。
 */
const getObjectBuffer = async (key) => {
  if (isLocalStorage()) {
    const normalizedKey = normalizeLocalKey(key);
    const fullPath = path.join(localUploadRoot, normalizedKey);
    const buffer = await fsPromises.readFile(fullPath);
    return {
      buffer,
      contentType: 'application/octet-stream',
      etag: calculateMD5(buffer),
      encrypted: false
    };
  }

  const result = await getCosClient().getObject({
    Bucket: getCosBucket(),
    Region: getCosRegion(),
    Key: key
  });

  const headers = (result && result.headers) || {};
  return {
    buffer: result.Body,
    contentType: result.ContentType || headers['content-type'] || 'application/octet-stream',
    etag: result.ETag || headers.etag,
    encrypted: Boolean(headers['x-cos-server-side-encryption'])
  };
};

/**
 * 用 COS 的 CopyObject 自拷贝一次，把未加密对象重写成带 SSE 的版本。
 * 与 §2.2 migrateCosEncryption.js 配套。
 */
const ensureObjectEncrypted = async (key) => {
  if (isLocalStorage()) {
    return { key, encrypted: false, skipped: true, reason: 'local_storage' };
  }

  const head = await getCosClient().headObject({ Bucket: getCosBucket(), Region: getCosRegion(), Key: key });
  const headHeaders = (head && head.headers) || {};
  if (headHeaders['x-cos-server-side-encryption']) {
    return { key, encrypted: true, skipped: true, reason: 'already_encrypted' };
  }

  await getCosClient().putObjectCopy({
    Bucket: getCosBucket(),
    Region: getCosRegion(),
    Key: key,
    CopySource: `${getCosBucket()}.cos.${getCosRegion()}.myqcloud.com/${encodeURI(key)}`,
    MetadataDirective: 'Copy',
    ServerSideEncryption: 'AES256'
  });

  return { key, encrypted: true, skipped: false };
};

const getRequestAwareUrl = async (key, req, expires = DEFAULT_PRESIGNED_EXPIRES) => {
  if (isLocalStorage()) {
    const normalizedKey = normalizeLocalKey(key);
    return `${getPublicBaseUrl(req)}/uploads/${normalizedKey}`;
  }
  return getPresignedUrl(key, expires);
};

/**
 * 删除文件
 */
const deleteFile = async (key) => {
  if (isLocalStorage()) {
    const normalizedKey = normalizeLocalKey(key);
    const fullPath = path.join(localUploadRoot, normalizedKey);
    try {
      await fsPromises.unlink(fullPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    logger.info('本地文件删除成功:', { key: normalizedKey });
    return { success: true };
  }

  try {
    await getCosClient().deleteObject({
      Bucket: getCosBucket(),
      Region: getCosRegion(),
      Key: key
    });
    
    logger.info('文件删除成功:', { key });
    return { success: true };
  } catch (error) {
    logger.error('文件删除失败:', error);
    throw error;
  }
};

/**
 * 获取 STS 临时凭证（用于客户端直传）
 */
const getSTS = async (userId) => {
  if (isLocalStorage()) {
    return {
      credentials: null,
      expiredTime: Date.now() + 1800 * 1000,
      mode: 'local'
    };
  }

  try {
    const appId = getCosAppId();
    if (!appId) {
      throw new Error('COS_APPID 未配置，且无法从 COS_BUCKET 推导 appId');
    }

    const stsOptions = {
      secretId: process.env.COS_SECRET_ID,
      secretKey: process.env.COS_SECRET_KEY,
      durationSeconds: 1800,
      policy: {
        version: '2.0',
        statement: [
          {
            principal: { qcs: ['*'] },
            action: [
              'name/cos:PutObject',
              'name/cos:InitiateMultipartUpload',
              'name/cos:UploadPart',
              'name/cos:CompleteMultipartUpload'
            ],
            effect: 'allow',
            resource: [
              `qcs::cos:${getCosRegion()}:uid/${appId}:${getCosBucket()}/uploads/${userId}/*`
            ]
          }
        ]
      }
    };
    if (process.env.COS_STS_ENDPOINT) {
      stsOptions.endpoint = process.env.COS_STS_ENDPOINT;
    }

    const result = await new Promise((resolve, reject) => {
      STS.getCredential(stsOptions, (err, data) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(data);
      });
    });
    
    return result;
  } catch (error) {
    logger.error('获取STS失败:', error);
    throw error;
  }
};

// Q3-红线 §A.2.3：注销账号事务里调 deleteObject(key) 删 COS 文件。
// 与 deleteFile 同实现 —— 命名上给"按 key 物理删对象"一个语义清晰的别名，
// 方便注销/数据清理路径上的 grep。失败由调用方决定吞掉或重抛。
const deleteObject = (key) => deleteFile(key);

/**
 * Plan §Phase 2.1：客户端直传所需的 head 检查。
 *
 * 用途：handleFinalize 在写 record 前，调本函数确认 COS 上对象确实存在 + size 一致，
 *      防止前端伪造 finalize 请求（例如丢一个 fileKey 但根本没传上来）。
 *
 * 返回 { exists, size } —— 不存在时不抛错，调用方按业务返回 404。
 */
const headObject = async (key) => {
  if (isLocalStorage()) {
    const normalizedKey = normalizeLocalKey(key);
    const fullPath = path.join(localUploadRoot, normalizedKey);
    try {
      const stat = await fsPromises.stat(fullPath);
      return { exists: true, size: stat.size };
    } catch (e) {
      if (e && e.code === 'ENOENT') return { exists: false };
      throw e;
    }
  }
  try {
    const head = await getCosClient().headObject({ Bucket: getCosBucket(), Region: getCosRegion(), Key: key });
    const headers = (head && head.headers) || {};
    const size = Number(headers['content-length'] || head.ContentLength || 0);
    return { exists: true, size };
  } catch (e) {
    const code = e && (e.statusCode || e.code);
    const msg = `${(e && e.message) || ''}`;
    if (code === 404 || code === 'NoSuchKey' || /NoSuchKey|404/.test(msg)) {
      return { exists: false };
    }
    logger.warn('[oss.headObject] 异常', { key, error: msg });
    throw e;
  }
};

/**
 * Plan §Phase 2.1 ★：一次性发放客户端直传所需的全部信息。
 *
 * 心脏路径 —— 客户端直传 COS 替代「服务端代理上传」是用户最痛点的解药。
 *
 * 入参：(userId, fileSpecs[])，fileSpecs 形如 [{ originalName, mimeType }]。
 * 返回：{
 *   mode: 'cos' | 'local',
 *   credentials: { tmpSecretId, tmpSecretKey, sessionToken } | null,
 *   region, bucket, appId, hostname, expiredAt, startTime,
 *   files: [{ fileKey, putUrl, host, originalName, mimeType }]
 * }
 *
 * 资源域：fileKey 一律 `uploads/${userId}/...`，与 getSTS policy 资源前缀严格一致；
 *        即便客户端拿到凭证也只能 PUT 自己目录下的对象。
 */
const getDirectUploadInfo = async (userId, fileSpecs = []) => {
  const safeSpecs = Array.isArray(fileSpecs) && fileSpecs.length > 0 ? fileSpecs : [{ originalName: 'file.bin', mimeType: null }];

  if (isLocalStorage()) {
    const baseUrl = getPublicBaseUrl();
    const files = safeSpecs.map((spec) => {
      const originalName = spec.originalName || 'file.bin';
      const fileKey = generateKey(userId, originalName);
      return {
        fileKey,
        putUrl: `${baseUrl}/uploads/${normalizeLocalKey(fileKey)}`,
        host: '',
        originalName,
        mimeType: spec.mimeType || null
      };
    });
    return {
      mode: 'local',
      credentials: null,
      region: '',
      bucket: '',
      appId: '',
      hostname: '',
      expiredAt: Date.now() + 1800 * 1000,
      startTime: Math.floor(Date.now() / 1000),
      files
    };
  }

  const sts = await getSTS(userId);
  const appId = getCosAppId();
  const hostname = `${getCosBucket()}.cos.${getCosRegion()}.myqcloud.com`;
  // sts.expiredTime 是秒还是毫秒看 SDK 版本 —— 大于 1e12 视作毫秒，否则当秒
  const rawExpired = (sts && sts.expiredTime) || 0;
  const expiredAt = rawExpired > 1e12 ? rawExpired : (rawExpired || (Math.floor(Date.now() / 1000) + 1800)) * 1000;
  const startTime = (sts && sts.startTime) || Math.floor(Date.now() / 1000);
  const credentials = (sts && sts.credentials) || {};
  if (!credentials.tmpSecretId || !credentials.tmpSecretKey || !credentials.sessionToken) {
    throw new Error('STS 返回缺少临时密钥字段');
  }
  const putUrlExpires = Math.max(60, Math.min(1800, Math.floor((expiredAt - Date.now()) / 1000) || 1800));
  const uploadSignClient = new COS({
    SecretId: credentials.tmpSecretId,
    SecretKey: credentials.tmpSecretKey,
    SecurityToken: credentials.sessionToken
  });

  const files = safeSpecs.map((spec) => {
    const originalName = spec.originalName || 'file.bin';
    const fileKey = generateKey(userId, originalName);
    const signedPutUrl = uploadSignClient.getObjectUrl({
      Bucket: getCosBucket(),
      Region: getCosRegion(),
      Key: fileKey,
      Method: 'PUT',
      Sign: true,
      Expires: putUrlExpires,
      Protocol: 'https:'
    });
    const putUrl = typeof signedPutUrl === 'string' ? signedPutUrl : signedPutUrl?.Url;
    if (!putUrl) {
      throw new Error('COS PUT 签名 URL 生成失败');
    }
    return {
      fileKey,
      putUrl,
      host: hostname,
      originalName,
      mimeType: spec.mimeType || null
    };
  });

  return {
    mode: 'cos',
    credentials,
    region: getCosRegion(),
    bucket: getCosBucket(),
    appId,
    hostname,
    expiredAt,
    startTime,
    files
  };
};

module.exports = {
  generateKey,
  calculateMD5,
  // Plan §Phase 1.5：流式 hash + 流式上传
  calculateMD5Stream,
  uploadStream,
  uploadFile,
  getPresignedUrl,
  getRequestAwareUrl,
  getInternalUrl,
  // Plan §Phase 2.4：CDN host 改写（LLM 拉图加速）
  wrapPresignedWithCdn,
  getObjectBuffer,
  ensureObjectEncrypted,
  deleteFile,
  deleteObject,
  getSTS,
  // Plan §Phase 2.1：客户端直传 + finalize 双 helper
  headObject,
  getDirectUploadInfo,
  DEFAULT_PRESIGNED_EXPIRES
};
