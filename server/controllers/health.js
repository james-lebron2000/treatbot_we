const os = require('os');
const { sequelize } = require('../config/database');
const { redisClient } = require('../middleware/rateLimit');
const logger = require('../utils/logger');

/**
 * 基础健康检查
 */
const basicHealth = (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
};

/**
 * 详细健康检查
 */
const detailedHealth = async (req, res) => {
  const checks = {
    database: { status: 'unknown', latency: null },
    redis: { status: 'unknown', latency: null },
    memory: { status: 'unknown', usage: null },
    disk: { status: 'unknown', usage: null }
  };

  // 检查数据库
  try {
    const dbStart = Date.now();
    await sequelize.authenticate();
    checks.database = {
      status: 'ok',
      latency: Date.now() - dbStart
    };
  } catch (error) {
    checks.database = {
      status: 'error',
      message: error.message
    };
    logger.error('健康检查 - 数据库连接失败:', error);
  }

  // 检查 Redis
  try {
    const redisStart = Date.now();
    await redisClient.ping();
    checks.redis = {
      status: 'ok',
      latency: Date.now() - redisStart
    };
  } catch (error) {
    checks.redis = {
      status: 'error',
      message: error.message
    };
    logger.error('健康检查 - Redis 连接失败:', error);
  }

  // 检查内存
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory * 100).toFixed(2);
  
  checks.memory = {
    status: memoryUsage > 90 ? 'warning' : 'ok',
    usage: `${memoryUsage}%`,
    total: `${(totalMemory / 1024 / 1024 / 1024).toFixed(2)}GB`,
    free: `${(freeMemory / 1024 / 1024 / 1024).toFixed(2)}GB`
  };

  // 检查系统负载
  const loadAvg = os.loadavg();
  checks.load = {
    status: 'ok',
    '1m': loadAvg[0].toFixed(2),
    '5m': loadAvg[1].toFixed(2),
    '15m': loadAvg[2].toFixed(2)
  };

  // 检查运行时间
  checks.uptime = {
    system: `${(os.uptime() / 3600).toFixed(2)} hours`,
    process: `${(process.uptime() / 3600).toFixed(2)} hours`
  };

  // 确定整体状态
  const hasError = Object.values(checks).some(
    check => check && check.status === 'error'
  );
  const hasWarning = Object.values(checks).some(
    check => check && check.status === 'warning'
  );

  const overallStatus = hasError ? 'error' : hasWarning ? 'warning' : 'ok';

  res.status(hasError ? 503 : 200).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    checks
  });
};

/**
 * 就绪检查（用于 Kubernetes 等）
 */
const readinessCheck = async (req, res) => {
  try {
    // 检查数据库
    await sequelize.authenticate();
    
    // 检查 Redis
    await redisClient.ping();
    
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * 存活检查（用于 Kubernetes 等）
 */
const livenessCheck = (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    pid: process.pid
  });
};

module.exports = {
  basicHealth,
  detailedHealth,
  readinessCheck,
  livenessCheck
};
