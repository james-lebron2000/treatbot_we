// Q3-红线 §B.3：Playwright e2e 配置
//
// 目标：在不依赖真实后端 (MySQL/Redis/COS/LLM) 的前提下，把 H5 三条 happy path
// 跑成可重放的回归。所有 /api/** 请求都用 page.route() 在 spec 内 mock。
//
// 运行环境约束：
//   - webServer 起 vite preview（需要先 build），strictPort=true 防止串口
//   - 仅启用 chromium：CI 装包成本低、本地执行快；要扩 webkit 再加 project
//   - 两个 project 覆盖桌面和 iPhone 13 mobile 视口（H5 主战场是手机）

import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.PW_PORT || 4173)

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // 单 webServer，避免端口竞争
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}/treatbot/`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      // Q3-红线 §B.3：移动端用 Pixel 5 emulation（chromium 内核），
      // 避免再下载 webkit。viewport / userAgent 与真实手机近似，足够 H5 回归。
      name: 'mobile-pixel5',
      use: { ...devices['Pixel 5'] }
    }
  ],
  webServer: {
    // build 已经在 dev 工作流里跑过；e2e 起一个 vite preview 服务
    // VITE_API_BASE_URL 留空 → axios baseURL 走默认 'https://inseq.top'
    // page.route('**/api/**') 不限 origin，可以拦截 cross-origin，故无需改 baseURL。
    command: 'npm run build && npx vite preview --port ' + PORT + ' --strictPort',
    url: `http://localhost:${PORT}/treatbot/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe'
  }
})
