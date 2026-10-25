import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { join } from 'node:path'

const repo = '/workspace'

export default defineConfig({
  root: '/tmp/plugin-gallery',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@biu/biu-ui': join(repo, 'packages/biu-ui/src/index.ts'),
      '@biu/reui': join(repo, 'packages/reui/src/index.tsx'),
      react: join(repo, 'node_modules/react'),
      'react-dom': join(repo, 'node_modules/react-dom'),
      'react/jsx-runtime': join(repo, 'node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime': join(repo, 'node_modules/react/jsx-dev-runtime.js'),
      '@codemirror/state': join(repo, 'node_modules/@codemirror/state'),
      '@codemirror/view': join(repo, 'node_modules/@codemirror/view'),
      '@codemirror/language': join(repo, 'node_modules/@codemirror/language'),
      '@codemirror/commands': join(repo, 'node_modules/@codemirror/commands'),
      '@lezer/highlight': join(repo, 'node_modules/@lezer/highlight'),
      '@lezer/common': join(repo, 'node_modules/@lezer/common'),
    },
    extensions: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.json'],
  },
  server: {
    host: '127.0.0.1',
    port: 4177,
    strictPort: true,
    fs: { allow: ['/workspace', '/tmp/plugin-gallery'] },
  },
})
