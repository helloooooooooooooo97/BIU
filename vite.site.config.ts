import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { renameSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

/** 官网是独立的静态站点，入口 site.html 要落成 dist-site/index.html 才能被托管平台当首页。 */
function siteHtmlAsIndex(): Plugin {
  return {
    name: 'site-html-as-index',
    apply: 'build',
    closeBundle() {
      const outDir = resolve(root, 'dist-site')
      renameSync(resolve(outDir, 'site.html'), resolve(outDir, 'index.html'))
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), siteHtmlAsIndex()],
  // GitHub Pages 项目站点挂在 /<仓库名>/ 下（区分大小写）。CI 用 configure-pages 的 base_path 作为 SITE_BASE；绑定自定义域名后不设 SITE_BASE，走根路径。
  base: process.env.SITE_BASE || '/',
  appType: 'spa',
  build: {
    outDir: resolve(root, 'dist-site'),
    emptyOutDir: true,
    rollupOptions: { input: resolve(root, 'site.html') },
  },
  server: { port: 5180, strictPort: true, host: true },
})
