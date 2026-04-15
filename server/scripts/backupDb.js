#!/usr/bin/env node

/**
 * 数据库每日备份脚本
 *
 * 功能：mysqldump → gzip → 上传到 COS（可选） → 清理旧备份
 *
 * 用法：
 *   # 直接运行（Docker 容器外，连接宿主机 MySQL）
 *   node scripts/backupDb.js
 *
 *   # Docker 环境（通过 docker exec 调用容器内 mysqldump）
 *   DOCKER_MYSQL_CONTAINER=treatbot-mysql node scripts/backupDb.js
 *
 *   # 定时任务示例（每天凌晨 2:00）
 *   0 2 * * * cd /opt/treatbot/server && node scripts/backupDb.js >> /var/log/treatbot-backup.log 2>&1
 *
 * 环境变量：
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME  — MySQL 连接
 *   DOCKER_MYSQL_CONTAINER  — 设置后使用 docker exec 执行 mysqldump
 *   COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET, COS_REGION  — COS 上传（可选）
 *   BACKUP_DIR  — 本地备份目录（默认 /opt/backups/treatbot）
 *   BACKUP_KEEP_DAYS  — 保留天数（默认 30）
 */

'use strict';

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// 尝试加载 .env（开发环境）
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) { /* dotenv 可选 */ }

// ── 配置 ──────────────────────────────────────────

const config = {
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || '3306',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'treatbot',
  },
  dockerContainer: process.env.DOCKER_MYSQL_CONTAINER || '',
  backupDir: process.env.BACKUP_DIR || '/opt/backups/treatbot',
  keepDays: parseInt(process.env.BACKUP_KEEP_DAYS, 10) || 30,
  cos: {
    secretId: process.env.COS_SECRET_ID || '',
    secretKey: process.env.COS_SECRET_KEY || '',
    bucket: process.env.COS_BUCKET || '',
    region: process.env.COS_REGION || 'ap-shanghai',
  },
};

const useCOS = !!(config.cos.secretId && config.cos.secretKey && config.cos.bucket);

// ── 工具函数 ──────────────────────────────────────

function log(msg) {
  const ts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(`[${ts}] ${msg}`);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ── 步骤 1: mysqldump ──────────────────────────────

function runMysqldump() {
  log('步骤 1/4: 导出数据库...');

  const { host, port, user, password, name } = config.db;
  const dumpArgs = [
    '-h', host,
    '-P', port,
    '-u', user,
    `--password=${password}`,
    '--single-transaction',
    '--routines',
    '--triggers',
    '--set-gtid-purged=OFF',
    name,
  ];

  let sqlBuffer;

  if (config.dockerContainer) {
    // Docker exec 模式：在容器内执行 mysqldump
    const args = ['exec', config.dockerContainer, 'mysqldump', ...dumpArgs];
    log(`  → docker exec ${config.dockerContainer} mysqldump ...`);
    sqlBuffer = execFileSync('docker', args, {
      maxBuffer: 500 * 1024 * 1024, // 500MB
      timeout: 300_000, // 5 分钟
    });
  } else {
    // 直连模式：宿主机上执行 mysqldump
    log('  → mysqldump 直连模式');
    sqlBuffer = execFileSync('mysqldump', dumpArgs, {
      maxBuffer: 500 * 1024 * 1024,
      timeout: 300_000,
    });
  }

  log(`  ✓ 导出成功 (${formatBytes(sqlBuffer.length)})`);
  return sqlBuffer;
}

// ── 步骤 2: gzip 压缩 ──────────────────────────────

function compressBackup(sqlBuffer) {
  log('步骤 2/4: 压缩备份...');
  const compressed = zlib.gzipSync(sqlBuffer, { level: 6 });
  const ratio = ((1 - compressed.length / sqlBuffer.length) * 100).toFixed(1);
  log(`  ✓ 压缩完成 ${formatBytes(sqlBuffer.length)} → ${formatBytes(compressed.length)} (压缩率 ${ratio}%)`);
  return compressed;
}

// ── 步骤 3: 保存本地 + 上传 COS ────────────────────

function saveLocal(gzBuffer, filename) {
  fs.mkdirSync(config.backupDir, { recursive: true });
  const filepath = path.join(config.backupDir, filename);
  fs.writeFileSync(filepath, gzBuffer);
  log(`  ✓ 本地保存: ${filepath}`);
  return filepath;
}

async function uploadToCOS(gzBuffer, filename) {
  if (!useCOS) {
    log('步骤 3/4: 跳过 COS 上传（未配置）');
    return;
  }

  log('步骤 3/4: 上传到 COS...');

  const COS = require('cos-nodejs-sdk-v5');
  const cos = new COS({
    SecretId: config.cos.secretId,
    SecretKey: config.cos.secretKey,
  });

  const key = `backups/database/${filename}`;

  return new Promise((resolve, reject) => {
    cos.putObject({
      Bucket: config.cos.bucket,
      Region: config.cos.region,
      Key: key,
      Body: gzBuffer,
      ContentType: 'application/gzip',
    }, (err, data) => {
      if (err) {
        log(`  ✗ COS 上传失败: ${err.message}`);
        reject(err);
      } else {
        log(`  ✓ COS 上传成功: cos://${config.cos.bucket}/${key}`);
        resolve(data);
      }
    });
  });
}

// ── 步骤 4: 清理旧备份 ─────────────────────────────

function cleanOldBackups() {
  log(`步骤 4/4: 清理 ${config.keepDays} 天前的旧备份...`);

  if (!fs.existsSync(config.backupDir)) {
    log('  跳过（备份目录不存在）');
    return 0;
  }

  const cutoff = Date.now() - config.keepDays * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(config.backupDir).filter(f => f.startsWith('treatbot_') && f.endsWith('.sql.gz'));
  let removed = 0;

  for (const f of files) {
    const filepath = path.join(config.backupDir, f);
    const stat = fs.statSync(filepath);
    if (stat.mtimeMs < cutoff) {
      fs.unlinkSync(filepath);
      removed++;
    }
  }

  log(`  ✓ 清理完成 (删除 ${removed} 个旧文件，保留 ${files.length - removed} 个)`);
  return removed;
}

// ── 主流程 ──────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  const dateStr = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const filename = `treatbot_${dateStr}.sql.gz`;

  log('══════════════════════════════════════');
  log('Treatbot 数据库备份');
  log('══════════════════════════════════════');

  try {
    // 1. mysqldump
    const sqlBuffer = runMysqldump();

    // 2. 压缩
    const gzBuffer = compressBackup(sqlBuffer);

    // 3. 保存 + 上传
    saveLocal(gzBuffer, filename);
    await uploadToCOS(gzBuffer, filename);

    // 4. 清理
    cleanOldBackups();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log('══════════════════════════════════════');
    log(`✓ 备份完成！耗时 ${elapsed}s，文件大小 ${formatBytes(gzBuffer.length)}`);
    log('══════════════════════════════════════');
  } catch (err) {
    log(`✗ 备份失败: ${err.message}`);
    process.exit(1);
  }
}

main();
