/**
 * PRD-2026Q2 §2.3：PII 脱敏工具。
 *
 * - maskPhone('13812341234') → '138****1234'
 * - maskIdCard('110101199001011234') → '110***********1234'（头 3 尾 4，中间全 *）
 * - maskName('张三') → '张*'；maskName('张三丰') → '张**'；maskName('Alice') → 'A****'
 * - 空值 / 非字符串透传 ''，避免把 null 渲染到页面上。
 *
 * 不做「解密」相关逻辑，所有 reveal 动作走 controllers/admin.revealField 并写审计日志。
 */

const isEmpty = (value) => value === undefined || value === null || value === '';

const toStr = (value) => (typeof value === 'string' ? value : String(value));

const maskPhone = (phone) => {
  if (isEmpty(phone)) return '';
  const str = toStr(phone).trim();
  if (!str) return '';
  if (str.length <= 7) {
    // 不足 7 位的兜底：保留头尾各一位
    if (str.length <= 2) return str;
    return `${str[0]}${'*'.repeat(str.length - 2)}${str[str.length - 1]}`;
  }
  return `${str.slice(0, 3)}****${str.slice(-4)}`;
};

const maskIdCard = (id) => {
  if (isEmpty(id)) return '';
  const str = toStr(id).trim();
  if (!str) return '';
  if (str.length <= 7) {
    // 太短的 id 只露头尾
    return `${str.slice(0, Math.min(3, str.length - 1))}${'*'.repeat(Math.max(1, str.length - 3))}`;
  }
  const head = str.slice(0, 3);
  const tail = str.slice(-4);
  const stars = '*'.repeat(str.length - 7);
  return `${head}${stars}${tail}`;
};

const maskName = (name) => {
  if (isEmpty(name)) return '';
  const str = toStr(name).trim();
  if (!str) return '';
  const first = Array.from(str)[0];
  const restLen = Array.from(str).length - 1;
  if (restLen <= 0) return first;
  return `${first}${'*'.repeat(restLen)}`;
};

module.exports = { maskPhone, maskIdCard, maskName };
