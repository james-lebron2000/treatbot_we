import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

// 路由懒加载后，把 Vue 运行时 + axios + pinia 切进稳定的 vendor chunk，
// 业务代码更新不会让第三方依赖 cache miss。对应 PRD-2026Q2 §2.7。
// PRD-2026Q2 §3.7：通过 `@shared` alias 让 Treatbot Web 与小程序共享仓库根 `shared/` 下的文案字典；
// Vite 默认的 server.fs.allow 只包含 project root，需要显式把仓库根加进来。
const repoRoot = path.resolve(__dirname, '..')

export default defineConfig({
  plugins: [vue()],
  base: '/treatbot/',
  resolve: {
    alias: {
      '@shared': path.resolve(repoRoot, 'shared')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    fs: {
      allow: [repoRoot]
    }
  },
  build: {
    // shared/copy/*.js 是 CommonJS 模块（必须保留 .js 扩展，因为 WeApp `require()`
    // 不识 .json / .cjs）。但 web/package.json 是 `"type": "module"`，Vite 默认
    // 只会把 node_modules 下的 CJS 走 @rollup/plugin-commonjs 转 ESM；仓库内的
    // shared/**/*.js 不在 include 范围，Rollup 会按 ESM 解析它们，于是
    // `import help from '../../../shared/copy/help.js'` 报
    // `"default" is not exported by "../shared/copy/help.js"`。
    // 显式把 shared 目录加进 commonjsOptions.include 即可让 Rollup 走 CJS 互操作，
    // 自动从 `module.exports = {...}` 合成 default 导出。WeApp 端走自己的
    // require() 解析，与本配置无关。
    commonjsOptions: {
      include: [/node_modules/, /shared\/.*\.js$/]
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-vue': ['vue', 'vue-router', 'pinia'],
          'vendor-axios': ['axios']
        }
      }
    }
  }
})
