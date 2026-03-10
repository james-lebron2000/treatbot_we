#!/usr/bin/env node

/**
 * Treatbot 项目统计脚本
 * 生成项目统计报告
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 统计结果
const stats = {
  files: {
    total: 0,
    code: 0,
    docs: 0,
    config: 0,
    test: 0
  },
  lines: {
    code: 0,
    docs: 0,
    comments: 0,
    blank: 0
  },
  types: {}
};

// 文件类型分类
const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.json'];
const docExtensions = ['.md', '.txt'];
const configExtensions = ['.yml', '.yaml', '.conf', '.config'];
const testExtensions = ['.test.js', '.spec.js'];

// 忽略的文件和目录
const ignoreDirs = ['.git', 'node_modules', '.nyc_output', 'coverage', 'dist', 'build'];

// 递归统计文件
function scanDirectory(dir) {
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      if (!ignoreDirs.includes(item)) {
        scanDirectory(fullPath);
      }
    } else {
      processFile(fullPath);
    }
  }
}

// 处理单个文件
function processFile(filePath) {
  const ext = path.extname(filePath);
  const fileName = path.basename(filePath);
  
  // 更新类型统计
  stats.types[ext] = (stats.types[ext] || 0) + 1;
  
  // 统计行数
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const lineCount = lines.length;
    
    // 分类统计
    if (codeExtensions.includes(ext) || testExtensions.some(t => fileName.endsWith(t))) {
      stats.files.code++;
      stats.lines.code += lineCount;
      
      // 统计注释和空行（仅 JS 文件）
      if (ext === '.js') {
        lines.forEach(line => {
          const trimmed = line.trim();
          if (trimmed === '') {
            stats.lines.blank++;
          } else if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
            stats.lines.comments++;
          }
        });
      }
    } else if (docExtensions.includes(ext)) {
      stats.files.docs++;
      stats.lines.docs += lineCount;
    } else if (configExtensions.includes(ext) || ['Dockerfile', 'Makefile'].includes(fileName)) {
      stats.files.config++;
    }
    
    stats.files.total++;
  } catch (err) {
    // 忽略无法读取的文件
  }
}

// 获取 Git 统计
function getGitStats() {
  try {
    const commits = execSync('git rev-list --count HEAD', { encoding: 'utf-8' }).trim();
    const contributors = execSync('git log --format=%an | sort -u | wc -l', { encoding: 'utf-8' }).trim();
    const lastCommit = execSync('git log -1 --format=%cd', { encoding: 'utf-8' }).trim();
    
    return { commits, contributors, lastCommit };
  } catch (err) {
    return { commits: 'N/A', contributors: 'N/A', lastCommit: 'N/A' };
  }
}

// 主函数
function main() {
  console.log('🔍 正在统计项目...\n');
  
  scanDirectory('.');
  
  const gitStats = getGitStats();
  
  // 输出报告
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                    Treatbot 项目统计                     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  
  console.log('📁 文件统计：');
  console.log(`  总文件数: ${stats.files.total}`);
  console.log(`  代码文件: ${stats.files.code}`);
  console.log(`  文档文件: ${stats.files.docs}`);
  console.log(`  配置文件: ${stats.files.config}`);
  console.log('');
  
  console.log('📝 代码统计：');
  console.log(`  代码行数: ${stats.lines.code.toLocaleString()}`);
  console.log(`  注释行数: ${stats.lines.comments.toLocaleString()}`);
  console.log(`  空行数: ${stats.lines.blank.toLocaleString()}`);
  console.log(`  文档行数: ${stats.lines.docs.toLocaleString()}`);
  console.log('');
  
  console.log('📊 文件类型分布：');
  const sortedTypes = Object.entries(stats.types)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  sortedTypes.forEach(([ext, count]) => {
    const bar = '█'.repeat(Math.min(count, 20));
    console.log(`  ${ext.padEnd(8)} ${bar} ${count}`);
  });
  console.log('');
  
  console.log('🔧 Git 统计：');
  console.log(`  提交次数: ${gitStats.commits}`);
  console.log(`  贡献者: ${gitStats.contributors}`);
  console.log(`  最后提交: ${gitStats.lastCommit}`);
  console.log('');
  
  console.log('✅ 统计完成！');
}

main();
