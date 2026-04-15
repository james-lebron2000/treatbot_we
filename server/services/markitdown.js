/**
 * markitdown 服务 — 使用 Microsoft markitdown 将 PDF/PNG/JPG 等文件转为 Markdown
 * https://github.com/microsoft/markitdown
 *
 * 工作原理：通过 child_process.execFile 调用 markitdown CLI，
 * 将文件路径作为参数传入，捕获 stdout 中的 Markdown 文本。
 */
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const crypto = require('crypto');
const axios = require('axios');
const logger = require('../utils/logger');

const MARKITDOWN_TIMEOUT_MS = parseInt(process.env.MARKITDOWN_TIMEOUT_MS || '30000', 10);
const LOCAL_UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');

/**
 * 检测 markitdown 是否可用（首次调用时缓存结果）
 */
let _available = null;
const isAvailable = () => {
  if (_available !== null) {
    return Promise.resolve(_available);
  }
  return new Promise((resolve) => {
    execFile('markitdown', ['--help'], { timeout: 5000 }, (err) => {
      _available = !err;
      if (!_available) {
        logger.info('markitdown CLI 不可用，将跳过 markitdown 预处理', {
          error: err?.message || 'unknown'
        });
      } else {
        logger.info('markitdown CLI 可用');
      }
      resolve(_available);
    });
  });
};

/**
 * 将本地文件转换为 Markdown
 * @param {string} filePath - 文件的绝对路径
 * @returns {Promise<{markdown: string, success: boolean, error?: string}>}
 */
const convertToMarkdown = (filePath) => {
  return new Promise((resolve) => {
    execFile(
      'markitdown',
      [filePath],
      {
        timeout: MARKITDOWN_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        encoding: 'utf-8'
      },
      (error, stdout, stderr) => {
        if (error) {
          logger.warn('markitdown 转换失败', {
            filePath: path.basename(filePath),
            error: error.message,
            stderr: (stderr || '').substring(0, 500)
          });
          return resolve({ markdown: '', success: false, error: error.message });
        }
        const markdown = (stdout || '').trim();
        logger.info('markitdown 转换成功', {
          filePath: path.basename(filePath),
          markdownLength: markdown.length
        });
        resolve({ markdown, success: true });
      }
    );
  });
};

/**
 * 将 fileKey 解析为本地绝对路径
 */
const resolveLocalPath = (fileKey) => {
  const normalized = `${fileKey || ''}`.replace(/^\/+/, '').replace(/^uploads\//, '');
  if (!normalized) {
    return '';
  }
  return path.join(LOCAL_UPLOAD_ROOT, normalized);
};

/**
 * 通过 fileKey 转换本地文件为 Markdown
 * @param {string} fileKey - 文件存储 key
 * @returns {Promise<string>} Markdown 文本，失败返回空字符串
 */
const convertFileToMarkdown = async (fileKey) => {
  if (!(await isAvailable())) {
    return '';
  }

  const localPath = resolveLocalPath(fileKey);
  if (!localPath) {
    logger.warn('markitdown: fileKey 为空');
    return '';
  }

  try {
    await fs.access(localPath);
  } catch {
    logger.warn('markitdown: 本地文件不存在', { fileKey, localPath });
    return '';
  }

  const result = await convertToMarkdown(localPath);
  return result.markdown;
};

/**
 * 下载远程文件到临时目录，转换后清理
 * @param {string} url - 远程文件 URL
 * @param {string} ext - 文件扩展名（如 .pdf, .png）
 * @returns {Promise<string>} Markdown 文本
 */
const convertUrlToMarkdown = async (url, ext = '.pdf') => {
  if (!(await isAvailable())) {
    return '';
  }

  const tmpFilename = `markitdown_${crypto.randomBytes(8).toString('hex')}${ext}`;
  const tmpPath = path.join(os.tmpdir(), tmpFilename);

  try {
    const resp = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000
    });
    await fs.writeFile(tmpPath, Buffer.from(resp.data));
    const result = await convertToMarkdown(tmpPath);
    return result.markdown;
  } catch (err) {
    logger.warn('markitdown URL 转换失败', {
      url: url.substring(0, 100),
      error: err.message
    });
    return '';
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
};

module.exports = {
  isAvailable,
  convertToMarkdown,
  convertFileToMarkdown,
  convertUrlToMarkdown
};
