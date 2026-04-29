/**
 * Q3-红线 §A.1.1：病历原文进 LLM 前的 PII 脱敏管道。
 *
 * 设计原则：
 *  - 仅在内存中维护 placeholder ↔ 原值 mapping，从不写日志、不持久化、不发出业务响应；
 *    mapping 的生命周期严格限制在「scrubForLlm → LLM 调用 → restoreFromLlm 回填」之内。
 *  - 同次调用里同一原值复用同一占位符，使 LLM 在结构化输出中可以安全引用。
 *  - 占位符使用 `<TYPE_N>` 的稳定形式（N 为 1-based 自增整数），便于正则定位回填。
 *
 * 覆盖 PII 类型：手机号 / 身份证 / 姓名（启发式抓取）/ 银行卡 / 邮箱 / 详细住址。
 */

const PHONE_RE = /(?<!\d)1[3-9]\d{9}(?!\d)/g;
// 身份证：18 位（17 位数字 + 末尾数字或 X）。先于银行卡匹配。
const ID_CARD_RE = /(?<!\d)\d{17}[0-9Xx](?!\d)/g;
// 银行卡：16-19 位连续数字（已剔除身份证后剩余的纯数字段）。
const BANK_CARD_RE = /(?<!\d)\d{16,19}(?!\d)/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// 姓名启发式：仅捕获「姓名:xxx」「患者:xxx」紧跟 2-4 个汉字 / 字母。
const NAME_LABEL_RE = /(姓名|患者)[\s ]*[：:]\s*([一-龥A-Za-z·]{2,4})/g;
// 详细地址：含「省/市/区」+「路/街/号/弄/巷」结构的连续片段（非贪婪 80 字符上限避免吞段落）。
const ADDRESS_RE = /[一-龥]{2,8}(?:省|自治区|特别行政区|市)[一-龥A-Za-z0-9]{0,40}?(?:区|县|市)[一-龥A-Za-z0-9]{0,40}?(?:路|街|道|巷|弄|号院?)\s*\d{0,6}号?(?:[一-龥A-Za-z0-9]{0,20}?(?:号楼|单元|室|层))?/g;

/**
 * 创建一次性的占位符工厂：同 type+value 复用同 placeholder。
 */
const createPlaceholderFactory = () => {
  const counters = Object.create(null);
  const valueIndex = Object.create(null); // `${type}::${value}` → placeholder
  const mapping = Object.create(null); // placeholder → originalValue

  const next = (type, value) => {
    const key = `${type}::${value}`;
    if (valueIndex[key]) {
      return valueIndex[key];
    }
    counters[type] = (counters[type] || 0) + 1;
    const placeholder = `<${type}_${counters[type]}>`;
    valueIndex[key] = placeholder;
    mapping[placeholder] = value;
    return placeholder;
  };

  return { next, mapping };
};

/**
 * 对原始文本做脱敏，返回 { scrubbed, mapping }。
 * 调用方必须保证 mapping 不会跨调用复用、不会进入日志。
 *
 * @param {string} rawText 原始病历文本
 * @returns {{ scrubbed: string, mapping: Record<string, string> }}
 */
const scrubForLlm = (rawText) => {
  if (rawText == null || rawText === '') {
    return { scrubbed: '', mapping: {} };
  }
  if (typeof rawText !== 'string') {
    rawText = String(rawText);
  }

  const { next, mapping } = createPlaceholderFactory();
  let text = rawText;

  // 顺序很重要：身份证 → 银行卡（避免 18 位身份证被当成 18 位银行卡命中）。
  text = text.replace(ID_CARD_RE, (match) => next('ID', match));
  text = text.replace(PHONE_RE, (match) => next('PHONE', match));
  text = text.replace(BANK_CARD_RE, (match) => next('BANKCARD', match));
  text = text.replace(EMAIL_RE, (match) => next('EMAIL', match));
  text = text.replace(NAME_LABEL_RE, (_match, label, name) => {
    const placeholder = next('NAME', name);
    return `${label}：${placeholder}`;
  });
  text = text.replace(ADDRESS_RE, (match) => next('ADDR', match));

  return { scrubbed: text, mapping };
};

/**
 * 在 LLM 输出（已 schema 校验过）的 JSON 上，把残留占位符按 mapping 回填。
 * 仅对人类可读的姓名 / 手机字段做回填；诊断、原文（rawText）等可能保留占位符的字段不还原，
 * 这样既能在前端展示原姓名，又能避免诊断里被原文 PII 污染。
 *
 * 调用方按需选择是否对每个字段做还原；本函数对传入对象做深拷贝并替换 string 值。
 *
 * @param {any} scrubbedJson LLM 返回的对象（任意结构）
 * @param {Record<string, string>} mapping placeholder → 原值
 * @returns {any} 还原后的对象
 */
const restoreFromLlm = (scrubbedJson, mapping) => {
  if (!mapping || typeof scrubbedJson === 'undefined' || scrubbedJson === null) {
    return scrubbedJson;
  }

  const placeholderRe = /<(PHONE|ID|NAME|BANKCARD|EMAIL|ADDR)_\d+>/g;
  const restoreString = (str) => str.replace(placeholderRe, (m) => (mapping[m] != null ? mapping[m] : m));

  const walk = (val) => {
    if (typeof val === 'string') {
      return restoreString(val);
    }
    if (Array.isArray(val)) {
      return val.map(walk);
    }
    if (val && typeof val === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(val)) {
        out[k] = walk(v);
      }
      return out;
    }
    return val;
  };

  return walk(scrubbedJson);
};

module.exports = {
  scrubForLlm,
  restoreFromLlm
};
