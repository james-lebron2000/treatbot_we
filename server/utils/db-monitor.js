const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

/**
 * 数据库连接池监控
 */
class DatabaseMonitor {
  constructor() {
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      waitingRequests: 0,
      maxConnections: 0
    };
    
    this.startMonitoring();
  }

  /**
   * 开始监控
   */
  startMonitoring() {
    // 每 30 秒收集一次指标
    setInterval(() => {
      this.collectMetrics();
    }, 30000);
  }

  /**
   * 收集连接池指标
   */
  collectMetrics() {
    try {
      // 获取连接池状态
      const pool = sequelize.connectionManager.pool;
      
      if (pool) {
        this.metrics = {
          totalConnections: pool.size,
          activeConnections: pool.available,
          idleConnections: pool.using,
          waitingRequests: pool.waiting,
          maxConnections: pool.maxSize
        };

        // 检查连接池使用率
        const usageRate = (this.metrics.activeConnections / this.metrics.maxConnections) * 100;
        
        if (usageRate > 80) {
          logger.warn('数据库连接池使用率过高', {
            usageRate: `${usageRate.toFixed(2)}%`,
            activeConnections: this.metrics.activeConnections,
            maxConnections: this.metrics.maxConnections
          });
        }

        // 检查等待请求
        if (this.metrics.waitingRequests > 10) {
          logger.warn('数据库连接池等待请求过多', {
            waitingRequests: this.metrics.waitingRequests
          });
        }
      }
    } catch (error) {
      logger.error('收集数据库连接池指标失败:', error);
    }
  }

  /**
   * 获取当前指标
   */
  getMetrics() {
    return {
      ...this.metrics,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 获取连接池健康状态
   */
  getHealth() {
    const usageRate = (this.metrics.activeConnections / this.metrics.maxConnections) * 100;
    
    let status = 'healthy';
    if (usageRate > 90 || this.metrics.waitingRequests > 20) {
      status = 'critical';
    } else if (usageRate > 70 || this.metrics.waitingRequests > 10) {
      status = 'warning';
    }

    return {
      status,
      usageRate: `${usageRate.toFixed(2)}%`,
      metrics: this.metrics
    };
  }
}

// 单例模式
let monitor = null;

const getMonitor = () => {
  if (!monitor) {
    monitor = new DatabaseMonitor();
  }
  return monitor;
};

module.exports = {
  DatabaseMonitor,
  getMonitor
};
