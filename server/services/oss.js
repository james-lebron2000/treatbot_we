const COS = require('cos-nodejs-sdk-v5');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const fsPromises = require('fs/promises');
const logger = require('../utils/logger');

// 初始化 COS 客户端
const cos = new COS({
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KEY
});

const bucket = process.env.COS_BUCKET;
const region = process.env.COS_REGION || 'ap-shanghai';
const useLocalStorage = !process.env.COS_SECRET_ID || !process.env.COS_SECRET_KEY || !bucket;
const localUploadRoot = path.join(__dirname, '..', 'uploads');
const NODE_ENV = process.env.NODE_ENV || 'development';
const isNonDevEnv = NODE_ENV !== 'development' && NODE_ENV !== 'test';

if (useLocalStorage) {
  fs.mkdirSync(localUploadRoot, { recursive: true });
  logger.warn('COS 未配置，已启用本地文件存储模式');
}

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

  if (isNonDevEnv && useLocalStorage) {
    logger.warn('本地存储模式下未配置 PUBLIC_BASE_URL，将回退到本机地址，仅适用于联调环境', {
      nodeEnv: NODE_ENV
    });
  }

  return `http://127.0.0.1:${process.env.PORT || 3000}`;
};

const getInternalBaseUrl = () => {
  if (useLocalStorage) {
    return `http://127.0.0.1:${process.env.PORT || 3000}`;
  }
  return getPublicBaseUrl();
};

if (useLocalStorage) {
  getPublicBaseUrl();
}

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
  if (useLocalStorage) {
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
    const result = await cos.putObject({
      Bucket: bucket,
      Region: region,
      Key: key,
      Body: buffer,
      ContentLength: buffer.length,
      ContentType: options.contentType || 'application/octet-stream',
      Metadata: options.metadata || {},
      ServerSideEncryption: 'AES256'
    });

    logger.info('文件上传成功:', { key, etag: result.ETag, sse: 'AES256' });
    
    return {
      success: true,
      key: key,
      etag: result.ETag,
      url: `https://${bucket}.cos.${region}.myqcloud.com/${key}`
    };
  } catch (error) {
    logger.error('文件上传失败:', error);
    throw error;
  }
};

/**
 * 获取临时下载链接
 *
 * PRD-2026Q2 §2.2：默认 TTL 从 3600s 收紧至 300s。调用方如果需要更长 TTL
 * （如 Admin 导出给运营侧用），显式传 expires。
 */
const DEFAULT_PRESIGNED_EXPIRES = 300;

const getPresignedUrl = async (key, expires = DEFAULT_PRESIGNED_EXPIRES) => {
  if (useLocalStorage) {
    const normalizedKey = normalizeLocalKey(key);
    return `${getPublicBaseUrl()}/uploads/${normalizedKey}`;
  }

  try {
    const result = await cos.getObjectUrl({
      Bucket: bucket,
      Region: region,
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
  if (useLocalStorage) {
    const normalizedKey = normalizeLocalKey(key);
    return `${getInternalBaseUrl()}/uploads/${normalizedKey}`;
  }
  return getPresignedUrl(key, 3600);
};

/**
 * 从 COS 拉回对象为 Buffer（用于后端代理下载 / 脱离浏览器直连）。
 *
 * PRD-2026Q2 §2.2：敏感路径的下载应走本函数，前端经 /api/medical/records/:id/file
 * 拿到内容而不是直接访问 *.myqcloud.com。
 */
const getObjectBuffer = async (key) => {
  if (useLocalStorage) {
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

  const result = await cos.getObject({
    Bucket: bucket,
    Region: region,
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
  if (useLocalStorage) {
    return { key, encrypted: false, skipped: true, reason: 'local_storage' };
  }

  const head = await cos.headObject({ Bucket: bucket, Region: region, Key: key });
  const headHeaders = (head && head.headers) || {};
  if (headHeaders['x-cos-server-side-encryption']) {
    return { key, encrypted: true, skipped: true, reason: 'already_encrypted' };
  }

  await cos.putObjectCopy({
    Bucket: bucket,
    Region: region,
    Key: key,
    CopySource: `${bucket}.cos.${region}.myqcloud.com/${encodeURI(key)}`,
    MetadataDirective: 'Copy',
    ServerSideEncryption: 'AES256'
  });

  return { key, encrypted: true, skipped: false };
};

const getRequestAwareUrl = async (key, req, expires = DEFAULT_PRESIGNED_EXPIRES) => {
  if (useLocalStorage) {
    const normalizedKey = normalizeLocalKey(key);
    return `${getPublicBaseUrl(req)}/uploads/${normalizedKey}`;
  }
  return getPresignedUrl(key, expires);
};

/**
 * 删除文件
 */
const deleteFile = async (key) => {
  if (useLocalStorage) {
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
    await cos.deleteObject({
      Bucket: bucket,
      Region: region,
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
  if (useLocalStorage) {
    return {
      credentials: null,
      expiredTime: Date.now() + 1800 * 1000,
      mode: 'local'
    };
  }

  try {
    const result = await cos.getCredential({
      secretId: process.env.COS_SECRET_ID,
      secretKey: process.env.COS_SECRET_KEY,
      durationSeconds: 1800,
      policy: {
        version: '2.0',
        statement: [
          {
            action: [
              'name/cos:PutObject',
              'name/cos:InitiateMultipartUpload',
              'name/cos:UploadPart',
              'name/cos:CompleteMultipartUpload'
            ],
            effect: 'allow',
            resource: [
              `qcs::cos:${region}:uid/${process.env.COS_APPID || ''}:${bucket}/uploads/${userId}/*`
            ]
          }
        ]
      }
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

module.exports = {
  generateKey,
  calculateMD5,
  uploadFile,
  getPresignedUrl,
  getRequestAwareUrl,
  getInternalUrl,
  getObjectBuffer,
  ensureObjectEncrypted,
  deleteFile,
  deleteObject,
  getSTS,
  DEFAULT_PRESIGNED_EXPIRES
};
