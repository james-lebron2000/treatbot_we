#!/usr/bin/env node

/**
 * Treatbot 启动欢迎信息
 */

const os = require('os');
const fs = require('fs');
const path = require('path');

const packageJson = require('./package.json');

// 颜色代码
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  red: '\x1b[31m'
};

// 获取本机 IP
function getIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return 'localhost';
}

// 检查 .env 文件是否存在
function checkEnvFile() {
  const envPath = path.join(__dirname, '.env');
  return fs.existsSync(envPath);
}

// 打印欢迎信息
function printWelcome() {
  console.log('');
  console.log(`${colors.cyan}${colors.bright}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}║                                                            ║${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}║   🏥  Treatbot 临床试验匹配平台                           ║${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}║                                                            ║${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}╚════════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log('');
  
  console.log(`${colors.bright}版本信息：${colors.reset}`);
  console.log(`  版本: ${packageJson.version}`);
  console.log(`  环境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  端口: ${process.env.PORT || 3000}`);
  console.log('');
  
  const ip = getIPAddress();
  const port = process.env.PORT || 3000;
  
  console.log(`${colors.bright}访问地址：${colors.reset}`);
  console.log(`  ${colors.green}本地:${colors.reset}    http://localhost:${port}`);
  console.log(`  ${colors.green}局域网:${colors.reset}  http://${ip}:${port}`);
  console.log('');
  
  console.log(`${colors.bright}API 端点：${colors.reset}`);
  console.log(`  ${colors.yellow}健康检查:${colors.reset}    GET http://localhost:${port}/health`);
  console.log(`  ${colors.yellow}详细健康:${colors.reset}    GET http://localhost:${port}/health/detailed`);
  console.log(`  ${colors.yellow}管理后台:${colors.reset}    http://localhost:${port}/admin`);
  console.log(`  ${colors.yellow}API 文档:${colors.reset}    POST http://localhost:${port}/api/auth/weapp-login`);
  console.log('');
  
  // 检查环境配置
  if (!checkEnvFile()) {
    console.log(`${colors.red}⚠️  警告: .env 文件不存在${colors.reset}`);
    console.log(`    请运行: ${colors.cyan}make generate-env${colors.reset} 或 ${colors.cyan}cp .env.example .env${colors.reset}`);
    console.log('');
  }
  
  console.log(`${colors.bright}常用命令：${colors.reset}`);
  console.log(`  ${colors.cyan}make status${colors.reset}    查看服务状态`);
  console.log(`  ${colors.cyan}make logs${colors.reset}      查看日志`);
  console.log(`  ${colors.cyan}make backup${colors.reset}    备份数据库`);
  console.log('');
  
  console.log(`${colors.magenta}🚀 服务已启动，按 Ctrl+C 停止${colors.reset}`);
  console.log('');
}

// 如果直接运行此文件
if (require.main === module) {
  printWelcome();
} else {
  module.exports = { printWelcome };
}
