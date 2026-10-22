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
  // GitHub Pages 的项目站点挂在 /biu/ 下，构建时用 SITE_BASE=/biu/ 指定；绑定自定义域名后改回根路径。
  base: process.env.SITE_BASE || '/',
  appType: 'spa',
  build: {
    outDir: resolve(root, 'dist-site'),
    emptyOutDir: true,
    rollupOptions: { input: resolve(root, 'site.html') },
  },
  server: { port: 5180, strictPort: true, host: true },
})
