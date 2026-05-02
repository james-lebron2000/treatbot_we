// PRD-2026Q2 §3.7 / 修复方案 Track 2.4：
// 集中导出 OCR 凭证可用性 boolean，避免 ocr.js / queue.js / app.js 各自从 env 读、
// 出现互相漂移。所有 OCR 相关代码引用同一份。
//
// 设计上**每次调用**都重新读 process.env，这样：
//   - 测试可以临时改 env 再 isOcrEnabled() 判断
//   - 线上 hot-reload .env（pm2 reload）也能立刻生效，不需要重启 Node 进程
//
// 生产 OCR 主路径：Doubao/ARK -> Kimi -> Tencent -> rule。
const hasDoubaoCredential = () => {
  return Boolean(`${process.env.ARK_API_KEY || ''}`.trim());
};

const hasKimiCredential = () => {
  return Boolean(`${process.env.KIMI_API_KEY || ''}`.trim());
};

const hasTencentCredential = () => {
  return Boolean(
    `${process.env.OCR_SECRET_ID || ''}`.trim() &&
    `${process.env.OCR_SECRET_KEY || ''}`.trim()
  );
};

const isOcrEnabled = () => {
  return hasDoubaoCredential() || hasKimiCredential() || hasTencentCredential();
};

// 给日志/错误信息用的 provider 摘要：'doubao' / 'kimi' / 'tencent' / 'doubao+kimi' / 'none' 等
const describeOcrProviders = () => {
  const providers = [];
  if (hasDoubaoCredential()) providers.push('doubao');
  if (hasKimiCredential()) providers.push('kimi');
  if (hasTencentCredential()) providers.push('tencent');
  return providers.length ? providers.join('+') : 'none';
};

module.exports = {
  hasDoubaoCredential,
  hasKimiCredential,
  hasTencentCredential,
  isOcrEnabled,
  describeOcrProviders
};
