/**
 * PRD-2026Q4 T0-11：每个 PR + commit 独立的 test schema 名生成器。
 *
 * 输入（环境变量，CI 注入）：
 *   PR_NUM       — pull request 序号（手动 dispatch 时可省略）
 *   GITHUB_SHA   — commit SHA（CI 默认提供）
 *
 * 输出：
 *   stdout: schema 名字符串（不带 newline），方便：
 *     SCHEMA=$(node scripts/test/setup-isolated-schema.js)
 *   process.env.TEST_SCHEMA_NAME 也会同步设置（jest globalSetup 引入时可读）
 *
 * 命名规则：
 *   treatbot_test_${PR_NUM}_${SHA8}        ← PR 上下文
 *   treatbot_test_local_${SHA8}            ← 主分支 / 手动 dispatch
 *   treatbot_test_local_${RAND8}           ← 完全无 SHA 的本地兜底
 *
 * 长度限制：MySQL identifier 上限 64 字符；上面三种格式最长 28 字符，安全。
 */

const crypto = require('crypto');

const sanitize = (s) => String(s || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12).toLowerCase();

const buildSchemaName = ({ prNum, sha } = {}) => {
  const pr = sanitize(prNum || process.env.PR_NUM);
  const shaShort = sanitize(sha || process.env.GITHUB_SHA).slice(0, 8);
  if (pr && shaShort) return `treatbot_test_${pr}_${shaShort}`;
  if (shaShort) return `treatbot_test_local_${shaShort}`;
  // 完全本地：随机 8 位 hex
  const rand = crypto.randomBytes(4).toString('hex');
  return `treatbot_test_local_${rand}`;
};

if (require.main === module) {
  const name = buildSchemaName();
  // 写到 stdout 给 shell 捕获
  process.stdout.write(name);
}

module.exports = { buildSchemaName };
