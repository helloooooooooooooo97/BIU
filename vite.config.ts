import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cordisPluginsVite, linkConfiguredPackages } from './packages/host-plugin-loader/src/host/index.ts'

const root = dirname(fileURLToPath(import.meta.url))
linkConfiguredPackages(root)
const isVitest = Boolean(process.env.VITEST)

// Vite 自己的 SIGTERM 会等浏览器把连接关完。页面开着时 make restart 就会卡在这里。
// 先拆掉现有连接，后面的关闭才能马上结束。
function releaseDevServerOnStop() {
  return {
    name: 'release-dev-server-on-stop',
    configureServer(server) {
      const release = () => {
        server.httpServer?.closeAllConnections()
      }
      process.prependListener('SIGTERM', release)
      process.prependListener('SIGINT', release)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), releaseDevServerOnStop(), cordisPluginsVite(root)],
  appType: 'spa',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@tiptap') || id.includes('node_modules/prosemirror')) return 'tiptap'
          if (id.includes('node_modules/katex')) return 'katex'
          if (id.includes('node_modules/lowlight') || id.includes('node_modules/highlight.js')) return 'highlight'
        },
      },
    },
  },
  esbuild: { jsxDev: false },
  define: isVitest ? {} : { 'process.env.NODE_ENV': JSON.stringify('production') },
  optimizeDeps: {
    esbuildOptions: {
      jsx: 'automatic',
      jsxDev: false,
      define: isVitest ? {} : { 'process.env.NODE_ENV': '"production"' },
      // Production React without minify leaves `throw new Error("^_^")` in checkDCE.
      // React DevTools then reports that dead code elimination was not applied.
      minify: true,
    },
  },
  resolve: {
    alias: {
      'react/jsx-dev-runtime': join(root, 'jsx-prod-dev-runtime.ts'),
    },
    // packages/** 下的 tsc 旁路 .js 是 gitignore 的产物，可能比 .ts 旧。
    // 无扩展名 import 先试 .ts/.tsx，避免测试/开发读到过期的编译结果。
    extensions: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.json'],
  },
  server: {
    port: Number(process.env.BIU_WEB_PORT || 5173),
    strictPort: true,
    host: true,
    watch: {
      // 商店插件写在仓库根 .plugin，不能触发 Vite 整页刷新
      ignored: ['**/.plugin/**', '**/.plugin-dev/**'],
    },
    proxy: {
      '/api': `http://127.0.0.1:${process.env.BIU_API_PORT || '3141'}`,
      '/ws': { target: `ws://127.0.0.1:${process.env.BIU_API_PORT || '3141'}`, ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'pack-host/**', 'release/**'],
    // 单测里显式写 './fields' 时也走 .ts，不受旧 .js 副产物影响
    resolve: { extensions: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.json'] },
    environmentMatchGlobs: [
      ['host/**', 'node'],
      ['packages/host-*/**', 'node'],
      ['packages/cap-*/src/host/**', 'node'],
      ['packages/core-*/src/host/**', 'node'],
      ['packages/type-*/**', 'node'],
      ['packages/public-*/**/*.test.ts', 'node'],
      ['packages/biu-ui/**/*.test.ts', 'node'],
      ['scripts/**', 'node'],
    ],
  },
})
