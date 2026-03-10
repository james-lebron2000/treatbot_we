module.exports = {
  apps: [{
    name: 'treatbot-api',
    script: './app.js',
    instances: 'max',  // 根据 CPU 核心数启动实例
    exec_mode: 'cluster',
    
    // 环境变量
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    
    // 日志配置
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // 进程管理
    min_uptime: '10s',
    max_restarts: 5,
    restart_delay: 3000,
    
    // 内存限制
    max_memory_restart: '500M',
    
    // 监控
    monitoring: true,
    
    // 自动重启
    autorestart: true,
    
    // 不重启的文件
    ignore_watch: ['node_modules', 'logs', '.git'],
    
    // 优雅关闭
    kill_timeout: 5000,
    listen_timeout: 10000,
    
    // 健康检查
    health_check_grace_period: 30000
  }]
};
