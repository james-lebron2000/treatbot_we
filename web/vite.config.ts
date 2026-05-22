import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

// 路由懒加载后，把 Vue 运行时 + axios + pinia 切进稳定的 vendor chunk，
// 业务代码更新不会让第三方依赖 cache miss。对应 PRD-2026Q2 §2.7。
// PRD-2026Q2 §3.7：通过 `@shared` alias 让 Treatbot Web 与小程序共享仓库根 `shared/` 下的文案字典；
// Vite 默认的 server.fs.allow 只包含 project root，需要显式把仓库根加进来。
const repoRoot = path.resolve(__dirname, '..')
const sharedRoot = path.resolve(repoRoot, 'shared')

const sharedCommonjsInterop = () => ({
  name: 'treatbot-shared-commonjs-interop',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    const filename = id.split('?')[0]
    if (!filename.startsWith(sharedRoot) || !filename.endsWith('.js') || !code.includes('module.exports')) {
      return null
    }
    const exportNames = new Set<string>()
    const declaredNames = new Set<string>()
    const declarationPattern = /^\s*(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm
    let match: RegExpExecArray | null
    while ((match = declarationPattern.exec(code))) {
      declaredNames.add(match[1])
    }
    const keyPattern = /^\s*([A-Za-z_$][\w$]*)\s*:/gm
    while ((match = keyPattern.exec(code))) {
      exportNames.add(match[1])
    }
    const shorthandPattern = /^\s*([A-Za-z_$][\w$]*)\s*,?\s*$/gm
    while ((match = shorthandPattern.exec(code))) {
      exportNames.add(match[1])
    }
    const namedExports = Array.from(exportNames)
      .filter((name) => !['module', 'exports', 'default'].includes(name))
      .map((name) => declaredNames.has(name)
        ? `export { ${name} }`
        : `export const ${name} = __cjsExports.${name}`)
      .join('\n')
    return {
      code: [
        'const module = { exports: {} }',
        'const exports = module.exports',
        code,
        'const __cjsExports = module.exports',
        'export default __cjsExports',
        namedExports
      ].filter(Boolean).join('\n'),
      map: null
    }
  }
})

export default defineConfig({
  plugins: [sharedCommonjsInterop(), vue()],
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
