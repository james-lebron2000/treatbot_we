/**
 * PRD-2026Q4 T0-7：用户写入路径强制归一化（phone / id_card / NCT ID）。
 *
 * 该文件是"指标失真根因"修复的入口工具：在所有写入路径上统一对
 *   - 手机号（去全角/半角空格、连字符、括号、点；剥离 +86/0086/86 前缀）
 *   - 身份证（GB 11643-1999 校验位）
 *   - NCT ID（^NCT\d{8}$）
 * 进行归一化与强校验，避免同一真实用户因输入差异在系统里被识别成 N 个人。
 *
 * 校验失败抛 ValidationError（statusCode=422，含业务 code），由上层 middleware
 * 转译为 422 响应；errorHandler 不需要识别。
 *
 * metrics（懒加载，避免测试环境 require 顺序问题）：
 *   - pii_normalize_fix_total{field}    归一化前后 string 不等
 *   - nct_id_invalid_total{source}      NCT 校验失败
 */

class ValidationError extends Error {
  constructor(code, msg) {
    super(msg);
    this.code = code;
    this.isBusinessError = true;
    this.statusCode = 422;
  }
}

// 懒加载 metrics：utils 是底层依赖，不能在 require 时反向依赖 middleware/metrics
let _metrics = null;
const getMetrics = () => {
  if (_metrics === null) {
    try {
      _metrics = require('../middleware/metrics');
    } catch (e) {
      _metrics = false;
    }
  }
  return _metrics || null;
};

const incFixCounter = (field) => {
  const m = getMetrics();
  if (m && m.piiNormalizeFixTotal) {
    try { m.piiNormalizeFixTotal.labels(field).inc(); } catch (e) { /* 静默 */ }
  }
};

const incNctInvalidCounter = (source) => {
  const m = getMetrics();
  if (m && m.nctIdInvalidTotal) {
    try { m.nctIdInvalidTotal.labels(source || 'unknown').inc(); } catch (e) { /* 静默 */ }
  }
};

/**
 * 归一化手机号 → 11 位国内号码。
 * - 去：全角空格(U+3000) / 半角空格 / 连字符 / 括号 / 点
 * - 剥前缀：+86 / 0086 / 86（仅当后续是合法 11 位手机号时才剥离）
 * - 结果必须匹配 /^1[3-9]\d{9}$/，否则抛 ValidationError(PHONE_INVALID)
 */
function normalizePhone(s) {
  if (s === null || s === undefined) return null;
  if (typeof s !== 'string') {
    throw new ValidationError('PHONE_INVALID', '手机号格式不正确，请重新输入');
  }
  const original = s;
  // 去全角空格 / 半角空格 / 连字符 / 括号 / 点
  let cleaned = s.replace(/[\s\u3000\-\(\)\.]/g, '');
  // 去 +86 / 0086 / 86 前缀（仅当后续是 11 位手机号时）
  cleaned = cleaned.replace(/^(\+?86|0086)(?=1[3-9]\d{9}$)/, '');

  if (!/^1[3-9]\d{9}$/.test(cleaned)) {
    throw new ValidationError('PHONE_INVALID', '手机号格式不正确，请重新输入');
  }
  if (cleaned !== original) {
    incFixCounter('phone');
  }
  return cleaned;
}

/**
 * 归一化身份证 → 大写 18 位。
 * - 去空格、转大写
 * - 必须匹配 ^\d{17}[\dX]$，否则抛 ID_CARD_FORMAT_INVALID
 * - 校验位用 GB 11643-1999 算法，错则 ID_CARD_CHECKSUM_INVALID
 */
function normalizeIdCard(s) {
  if (s === null || s === undefined) return null;
  if (typeof s !== 'string') {
    throw new ValidationError('ID_CARD_FORMAT_INVALID', '身份证格式不正确');
  }
  const original = s;
  const cleaned = s.replace(/\s/g, '').toUpperCase();

  if (!/^\d{17}[\dX]$/.test(cleaned)) {
    throw new ValidationError('ID_CARD_FORMAT_INVALID', '身份证格式不正确');
  }

  // GB 11643-1999 校验位算法
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checkChars = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += parseInt(cleaned[i], 10) * weights[i];
  }
  const expected = checkChars[sum % 11];
  if (cleaned[17] !== expected) {
    throw new ValidationError('ID_CARD_CHECKSUM_INVALID', '身份证校验位错误');
  }
  if (cleaned !== original) {
    incFixCounter('id_card');
  }
  return cleaned;
}

/**
 * 归一化 NCT ID → 大写 NCT + 8 位数字。
 * - 去掉 ASCII 空白（\s 含 \n \t 等）但保留：上层调用方可在传入前 trim
 *   注意：测试预期 'NCT00000001\n' 在 normalize 这一层会被去除空白通过；
 *   严格不去换行的语义请由调用方控制（见 trial 模型 validate）。
 * - 必须匹配 ^NCT\d{8}$，否则抛 NCT_FORMAT_INVALID
 *
 * @param {string} s
 * @param {object} [opts] - { source?: string } 用于 metrics 标签
 */
function normalizeNctId(s, opts = {}) {
  if (s === null || s === undefined) return null;
  if (typeof s !== 'string') {
    incNctInvalidCounter(opts.source);
    throw new ValidationError('NCT_FORMAT_INVALID', `NCT ID 格式不正确：${s}`);
  }
  const original = s;
  const cleaned = s.replace(/\s/g, '').toUpperCase();

  if (!/^NCT\d{8}$/.test(cleaned)) {
    incNctInvalidCounter(opts.source);
    throw new ValidationError('NCT_FORMAT_INVALID', `NCT ID 格式不正确：${s}`);
  }
  if (cleaned !== original) {
    incFixCounter('nct_id');
  }
  return cleaned;
}

module.exports = {
  normalizePhone,
  normalizeIdCard,
  normalizeNctId,
  ValidationError
};
