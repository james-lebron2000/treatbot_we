const axios = require('axios');
const { performance } = require('perf_hooks');

// 配置
const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const CONCURRENT_USERS = parseInt(process.env.CONCURRENT_USERS) || 10;
const REQUESTS_PER_USER = parseInt(process.env.REQUESTS_PER_USER) || 100;
const TEST_DURATION = parseInt(process.env.TEST_DURATION) || 60; // 秒

// 统计
const stats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  totalLatency: 0,
  minLatency: Infinity,
  maxLatency: 0,
  statusCodes: {},
  errors: []
};

/**
 * 发送请求
 */
async function sendRequest(endpoint, method = 'GET', data = null) {
  const start = performance.now();
  
  try {
    const response = await axios({
      method,
      url: `${BASE_URL}${endpoint}`,
      data,
      timeout: 30000,
      validateStatus: () => true // 不抛出 HTTP 错误
    });
    
    const latency = performance.now() - start;
    
    stats.totalRequests++;
    stats.totalLatency += latency;
    stats.minLatency = Math.min(stats.minLatency, latency);
    stats.maxLatency = Math.max(stats.maxLatency, latency);
    
    const statusCode = response.status;
    stats.statusCodes[statusCode] = (stats.statusCodes[statusCode] || 0) + 1;
    
    if (statusCode >= 200 && statusCode < 300) {
      stats.successfulRequests++;
    } else {
      stats.failedRequests++;
    }
    
    return { success: true, latency, statusCode };
  } catch (error) {
    stats.totalRequests++;
    stats.failedRequests++;
    stats.errors.push(error.message);
    
    return { success: false, error: error.message };
  }
}

/**
 * 模拟用户
 */
async function simulateUser(userId) {
  console.log(`用户 ${userId} 开始测试...`);
  
  for (let i = 0; i < REQUESTS_PER_USER; i++) {
    // 测试健康检查端点
    await sendRequest('/health');
    
    // 测试 API 端点（需要认证）
    // await sendRequest('/api/matches', 'GET');
    
    // 随机延迟，模拟真实用户
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
  }
  
  console.log(`用户 ${userId} 完成测试`);
}

/**
 * 运行负载测试
 */
async function runLoadTest() {
  console.log('======================================');
  console.log('Treatbot API 负载测试');
  console.log('======================================');
  console.log(`目标: ${BASE_URL}`);
  console.log(`并发用户: ${CONCURRENT_USERS}`);
  console.log(`每用户请求数: ${REQUESTS_PER_USER}`);
  console.log(`总请求数: ${CONCURRENT_USERS * REQUESTS_PER_USER}`);
  console.log('======================================\n');
  
  const startTime = Date.now();
  
  // 创建并发用户
  const users = [];
  for (let i = 0; i < CONCURRENT_USERS; i++) {
    users.push(simulateUser(i + 1));
  }
  
  // 等待所有用户完成
  await Promise.all(users);
  
  const duration = (Date.now() - startTime) / 1000;
  
  // 输出结果
  console.log('\n======================================');
  console.log('测试结果');
  console.log('======================================');
  console.log(`测试时长: ${duration.toFixed(2)} 秒`);
  console.log(`总请求数: ${stats.totalRequests}`);
  console.log(`成功请求: ${stats.successfulRequests} (${((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2)}%)`);
  console.log(`失败请求: ${stats.failedRequests} (${((stats.failedRequests / stats.totalRequests) * 100).toFixed(2)}%)`);
  console.log(`平均响应时间: ${(stats.totalLatency / stats.totalRequests).toFixed(2)} ms`);
  console.log(`最小响应时间: ${stats.minLatency.toFixed(2)} ms`);
  console.log(`最大响应时间: ${stats.maxLatency.toFixed(2)} ms`);
  console.log(`吞吐量: ${(stats.totalRequests / duration).toFixed(2)} req/s`);
  console.log('\n状态码分布:');
  Object.entries(stats.statusCodes).forEach(([code, count]) => {
    console.log(`  ${code}: ${count}`);
  });
  
  if (stats.errors.length > 0) {
    console.log('\n错误统计:');
    const errorCounts = {};
    stats.errors.forEach(err => {
      errorCounts[err] = (errorCounts[err] || 0) + 1;
    });
    Object.entries(errorCounts).forEach(([err, count]) => {
      console.log(`  ${err}: ${count}`);
    });
  }
  
  console.log('======================================');
}

// 运行测试
runLoadTest().catch(console.error);
