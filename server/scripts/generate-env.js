#!/usr/bin/env node

/**
 * 环境配置文件生成器
 * 交互式生成 .env 文件
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

// 生成随机密钥
const generateSecret = (length = 32) => {
  return crypto.randomBytes(length).toString('base64');
};

// 配置项定义
const configItems = [
  {
    key: 'NODE_ENV',
    defaultValue: 'production',
    prompt: '运行环境 (development/production)',
    required: true
  },
  {
    key: 'PORT',
    defaultValue: '3000',
    prompt: '服务端口',
    required: true
  },
  {
    key: 'DB_HOST',
    prompt: '数据库主机地址',
    example: 'your-mysql.mysql.tencentcdb.com',
    required: true
  },
  {
    key: 'DB_PORT',
    defaultValue: '3306',
    prompt: '数据库端口',
    required: true
  },
  {
    key: 'DB_USER',
    defaultValue: 'treatbot',
    prompt: '数据库用户名',
    required: true
  },
  {
    key: 'DB_PASSWORD',
    prompt: '数据库密码',
    required: true,
    secret: true
  },
  {
    key: 'DB_NAME',
    defaultValue: 'treatbot',
    prompt: '数据库名称',
    required: true
  },
  {
    key: 'REDIS_HOST',
    prompt: 'Redis 主机地址',
    example: 'your-redis.redis.tencentcdb.com',
    required: true
  },
  {
    key: 'REDIS_PORT',
    defaultValue: '6379',
    prompt: 'Redis 端口',
    required: true
  },
  {
    key: 'REDIS_PASSWORD',
    prompt: 'Redis 密码（没有则留空）',
    required: false
  },
  {
    key: 'JWT_SECRET',
    defaultValue: () => generateSecret(),
    prompt: 'JWT 密钥（已自动生成）',
    required: true
  },
  {
    key: 'WEAPP_APPID',
    prompt: '微信小程序 AppID',
    example: 'wx1234567890abcdef',
    required: true
  },
  {
    key: 'WEAPP_SECRET',
    prompt: '微信小程序 AppSecret',
    required: true,
    secret: true
  },
  {
    key: 'COS_SECRET_ID',
    prompt: '腾讯云 COS SecretId',
    required: true,
    secret: true
  },
  {
    key: 'COS_SECRET_KEY',
    prompt: '腾讯云 COS SecretKey',
    required: true,
    secret: true
  },
  {
    key: 'COS_BUCKET',
    prompt: 'COS 存储桶名称',
    example: 'treatbot-files',
    required: true
  },
  {
    key: 'COS_REGION',
    defaultValue: 'ap-shanghai',
    prompt: 'COS 地域',
    required: true
  },
  {
    key: 'OCR_SECRET_ID',
    prompt: '腾讯云 OCR SecretId（可与 COS 相同）',
    required: true,
    secret: true
  },
  {
    key: 'OCR_SECRET_KEY',
    prompt: '腾讯云 OCR SecretKey（可与 COS 相同）',
    required: true,
    secret: true
  }
];

async function main() {
  console.log('======================================');
  console.log('Treatbot 环境配置生成器');
  console.log('======================================\n');

  const config = {};

  for (const item of configItems) {
    let defaultValue = item.defaultValue;
    if (typeof defaultValue === 'function') {
      defaultValue = defaultValue();
    }

    let prompt = item.prompt;
    if (defaultValue) {
      prompt += ` [${item.secret ? '******' : defaultValue}]`;
    }
    if (item.example) {
      prompt += `\n  示例: ${item.example}`;
    }
    prompt += '\n> ';

    const answer = await question(prompt);

    if (answer.trim()) {
      config[item.key] = answer.trim();
    } else if (defaultValue) {
      config[item.key] = defaultValue;
    } else if (item.required) {
      console.error(`错误: ${item.key} 是必填项`);
      process.exit(1);
    }
  }

  // 生成 .env 文件内容
  const envContent = Object.entries(config)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  // 写入文件
  const envPath = path.join(__dirname, '..', '.env');
  
  // 检查是否已存在
  if (fs.existsSync(envPath)) {
    const backupPath = `${envPath}.backup.${Date.now()}`;
    fs.copyFileSync(envPath, backupPath);
    console.log(`\n已备份原配置: ${backupPath}`);
  }

  fs.writeFileSync(envPath, envContent + '\n');

  console.log('\n======================================');
  console.log('配置已生成！');
  console.log(`文件路径: ${envPath}`);
  console.log('======================================');
  console.log('\n请检查配置是否正确，然后运行:');
  console.log('  make dev    # 开发环境');
  console.log('  make deploy # 生产环境');

  rl.close();
}

main().catch(err => {
  console.error('错误:', err.message);
  process.exit(1);
});
