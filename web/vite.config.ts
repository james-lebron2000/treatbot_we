import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

// 路由懒加载后，把 Vue 运行时 + axios + pinia 切进稳定的 vendor chunk，
// 业务代码更新不会让第三方依赖 cache miss。对应 PRD-2026Q2 §2.7。
// PRD-2026Q2 §3.7：通过 `@shared` alias 让 H5 与小程序共享仓库根 `shared/` 下的文案字典；
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
