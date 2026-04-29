/**
 * Q3-红线 §B.1：版本化 Prompt Registry。
 *
 * 把散落在 ocr.js / matchEngine.js 的硬编码 system + user prompt 抽到
 * server/prompts/<version>/<name>.md，统一从 frontmatter + body 解析后注入变量返回。
 *
 * 设计要点：
 *  - 不引入 yaml / gray-matter 依赖：手写极简 frontmatter parser（key: value，list 用 "- " 子行）。
 *  - 同一 prompt 多版本并存：getPrompt('ocr-pdf', 'v2', vars) → server/prompts/v2/ocr-pdf.md。
 *  - body 用 `## system` 和 `## user` 二级标题分段；缺失视作空字符串。
 *  - 变量插值用 `{{varName}}`；未提供的变量保留占位符并在日志中告警，不抛错（避免破坏 LLM 调用主流程）。
 *  - 文件读取做了内存缓存（require.cache 不适用 .md），key = `${name}@${version}`。
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const PROMPTS_ROOT = path.join(__dirname, '..', 'prompts');

// 内存缓存：避免每次 LLM 调用都 fs.readFile
const _cache = new Map();

/**
 * 极简 YAML-ish frontmatter 解析。
 * 仅支持：
 *   key: value          → string
 *   key:                 (随后跟 "  - item" 行)  → string[]
 * 以 "---" 起止。
 */
const parseFrontmatter = (raw) => {
  const lines = raw.split(/\r?\n/);
  if (lines[0].trim() !== '---') {
    return { meta: {}, bodyStart: 0 };
  }
  const meta = {};
  let i = 1;
  let currentListKey = null;
  while (i < lines.length && lines[i].trim() !== '---') {
    const line = lines[i];
    if (/^\s+-\s+/.test(line) && currentListKey) {
      const item = line.replace(/^\s+-\s+/, '').replace(/\s*#.*$/, '').trim();
      if (item) meta[currentListKey].push(item);
    } else {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
      if (m) {
        const key = m[1];
        const val = m[2].trim();
        if (val === '') {
          // 后续可能跟 list 子行
          meta[key] = [];
          currentListKey = key;
        } else {
          meta[key] = val;
          currentListKey = null;
        }
      }
    }
    i += 1;
  }
  return { meta, bodyStart: i + 1 };
};

/**
 * 把 body 切成 { system, user }；缺失段用空字符串占位。
 * 段头识别：以 "## system" / "## user" 开头（大小写不敏感）。
 */
const splitSections = (bodyLines) => {
  const sections = { system: [], user: [] };
  let cur = null;
  for (const line of bodyLines) {
    const m = line.match(/^##\s+(\w+)\s*$/);
    if (m) {
      const key = m[1].toLowerCase();
      if (key === 'system' || key === 'user') {
        cur = key;
        continue;
      }
    }
    if (cur) sections[cur].push(line);
  }
  return {
    system: sections.system.join('\n').trim(),
    user: sections.user.join('\n').trim()
  };
};

const interpolate = (template, vars, ctx) => {
  if (!template) return '';
  return template.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (_match, key) => {
    if (vars && Object.prototype.hasOwnProperty.call(vars, key)) {
      const v = vars[key];
      if (v == null) return '';
      return typeof v === 'string' ? v : String(v);
    }
    logger.warn('promptRegistry 变量缺失', { ctx, missingVar: key });
    return `{{${key}}}`;
  });
};

const loadRaw = (name, version) => {
  const cacheKey = `${name}@${version}`;
  if (_cache.has(cacheKey)) return _cache.get(cacheKey);
  const file = path.join(PROMPTS_ROOT, version, `${name}.md`);
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new Error(`promptRegistry: 找不到 prompt 文件 ${version}/${name}.md (${err.code || err.message})`);
  }
  const { meta, bodyStart } = parseFrontmatter(raw);
  const bodyLines = raw.split(/\r?\n/).slice(bodyStart);
  const sections = splitSections(bodyLines);
  const entry = { meta, sections, file };
  _cache.set(cacheKey, entry);
  return entry;
};

/**
 * @param {string} name      prompt 名称（对应 md 文件名，无后缀）
 * @param {string} [version] 版本目录，默认 'v1'
 * @param {object} [vars]    变量 map（{{var}} 占位符）
 * @returns {{ system: string, user: string, meta: object }}
 */
const getPrompt = (name, version = 'v1', vars = {}) => {
  const ctx = `${name}@${version}`;
  const { meta, sections } = loadRaw(name, version);
  return {
    system: interpolate(sections.system, vars, ctx),
    user: interpolate(sections.user, vars, ctx),
    meta
  };
};

/** 仅测试用：清掉缓存以便用例切换 prompt 文件后立即生效 */
const _resetCache = () => { _cache.clear(); };

module.exports = {
  getPrompt,
  __internals: {
    parseFrontmatter,
    splitSections,
    interpolate,
    _resetCache
  }
};
