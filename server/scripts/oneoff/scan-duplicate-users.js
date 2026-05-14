/**
 * PRD-2026Q4 T0-7：历史用户重复扫描脚本（一次性，运维手动跑）。
 *
 * 用法：
 *   node server/scripts/oneoff/scan-duplicate-users.js          # 实跑：写 user_dedup_candidates + CSV
 *   node server/scripts/oneoff/scan-duplicate-users.js --dry-run # 只输出 CSV，不 INSERT
 *
 * 实现要点：
 *  - 全表分批 LIMIT 1000 OFFSET，避免 OOM。
 *  - 内存里按 normalize 后的 phone / id_card 分桶，桶大小 ≥2 → 候选对。
 *  - 对每个候选对走 INSERT IGNORE（依赖 uk_pair UNIQUE 唯一约束防重）。
 *  - CSV 落到 cwd: user_dedup_candidates.csv
 *  - 进度日志到 stdout，不依赖 winston 以便单独运行。
 */

const fs = require('fs');
const path = require('path');
const { sequelize } = require('../../config/database');
const { normalizePhone, normalizeIdCard, ValidationError } = require('../../utils/normalize');

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 1000;

const log = (msg) => process.stdout.write(`[scan-duplicate-users] ${msg}\n`);

const safeNormalize = (fn, value) => {
  try { return fn(value); } catch (e) {
    if (e instanceof ValidationError) return null;
    throw e;
  }
};

(async () => {
  const t0 = Date.now();
  log(`启动 dry_run=${DRY_RUN}`);

  // 内存索引：normalized_value → [user_id, ...]
  const phoneMap = new Map();
  const idCardMap = new Map();

  let offset = 0;
  let scanned = 0;
  while (true) {
    // user_id 字段名兼容：models/user.js 主键是 id
    const [rows] = await sequelize.query(
      `SELECT id, phone, id_card FROM users ORDER BY id LIMIT ${BATCH_SIZE} OFFSET ${offset}`
    );
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      if (row.phone) {
        const np = safeNormalize(normalizePhone, row.phone);
        if (np) {
          if (!phoneMap.has(np)) phoneMap.set(np, []);
          phoneMap.get(np).push(row.id);
        }
      }
      if (row.id_card) {
        const ni = safeNormalize(normalizeIdCard, row.id_card);
        if (ni) {
          if (!idCardMap.has(ni)) idCardMap.set(ni, []);
          idCardMap.get(ni).push(row.id);
        }
      }
    }

    scanned += rows.length;
    log(`已扫描 ${scanned} 条；当前分桶 phone=${phoneMap.size} id_card=${idCardMap.size}`);
    if (rows.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  // 候选对生成
  const csvLines = ['user_a_id,user_b_id,matched_field,normalized_value'];
  let candidatePairs = 0;
  let inserted = 0;

  const emitPairs = async (map, field) => {
    for (const [value, userIds] of map.entries()) {
      if (userIds.length < 2) continue;
      // 排序后两两组合，并保证 a < b（避免 (a,b)/(b,a) 重复）
      const sorted = [...new Set(userIds)].sort();
      if (sorted.length < 2) continue;
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const a = sorted[i];
          const b = sorted[j];
          candidatePairs++;
          csvLines.push(`${a},${b},${field},${value}`);
          if (!DRY_RUN) {
            try {
              await sequelize.query(
                `INSERT IGNORE INTO user_dedup_candidates
                 (user_a_id, user_b_id, matched_field, normalized_value, similarity_score, status)
                 VALUES (?, ?, ?, ?, 1.00, 'pending')`,
                { replacements: [a, b, field, value] }
              );
              inserted++;
            } catch (e) {
              log(`INSERT 失败 ${a}/${b}/${field}: ${e.message}`);
            }
          }
        }
      }
    }
  };

  await emitPairs(phoneMap, 'phone');
  await emitPairs(idCardMap, 'id_card');

  const csvPath = path.resolve(process.cwd(), 'user_dedup_candidates.csv');
  fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf8');
  log(`候选对 ${candidatePairs} 条；DB 写入 ${inserted} 条；CSV → ${csvPath}`);
  log(`耗时 ${Math.round((Date.now() - t0) / 1000)}s`);

  await sequelize.close();
  process.exit(0);
})().catch((e) => {
  log(`fatal: ${e.stack || e.message}`);
  process.exit(1);
});
