import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

test('share page loads a record body only after that row is opened', () => {
  const src = readFileSync(resolve(import.meta.dirname, './share-page.tsx'), 'utf8')
  const host = readFileSync(resolve(import.meta.dirname, '../host/index.ts'), 'utf8')
  assert.match(src, /\/content\/\$\{encodeURIComponent\(recordId\)\}/)
  assert.match(src, /contents: 'all'/)
  assert.match(host, /GET', '\/api\/share\/:token\/content\/:recordId'/)
  assert.match(host, /shareSnapshotOpts/)
})

test('share page uses matching side padding on small screens', () => {
  const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
  const src = readFileSync(resolve(import.meta.dirname, './share-page.tsx'), 'utf8')
  assert.match(src, /fsdb-share-list/)
  assert.match(src, /collapseToLeaf/)
  assert.match(src, /fsdb-share-record-nav/)
  assert.match(src, /collectionPath=\{snapshot\.collection\}/)
  assert.match(src, /^\s*readOnly$/m)
  assert.match(css, /@media \(max-width:720px\)\{/)
  assert.match(css, /--fsdb-share-pad:24px/)
  assert.match(css, /\.fsdb-share-page \.fsdb-detail-main > :not\(\.fsdb-page-banner\)\{padding-left:var\(--fsdb-share-pad\);padding-right:var\(--fsdb-share-pad\)\}/)
  assert.match(css, /\.fsdb-share-list\{padding:var\(--fsdb-share-pad\) 0\}/)
  assert.match(css, /\.fsdb-crumbs\.is-leaf-only \.fsdb-crumb:not\(:last-child\)\{display:none\}/)
  assert.match(css, /\.fsdb-share-record-nav\{display:none/)
  assert.match(css, /\.fsdb-share-page \.fsdb-detail-float-nav\{display:none\}/)
  assert.match(css, /\.fsdb-crumbs \.fsdb-record-mark\.is-sm,\.fsdb-crumb-option \.fsdb-record-mark\.is-sm\{width:16px;height:16px\}/)
  assert.match(css, /\.fsdb-crumbs \.fsdb-record-mark\.is-sm>svg,\.fsdb-crumb-option \.fsdb-record-mark\.is-sm>svg\{width:16px;height:16px/)
  assert.match(css, /\.fsdb-crumb-btn \.chat-view-project-name,\.fsdb-crumb-option \.chat-view-project-name\{[^}]*min-width:0/)
  assert.match(css, /\.fsdb-crumb-btn>svg,\.fsdb-crumb-btn>\.fsdb-record-mark,\.fsdb-crumb-btn>\.fsdb-record-emoji[^}]*\{flex:none\}/)
  assert.match(css, /\.heading-outline-host\.is-sheet/)
  assert.match(css, /\.fsdb-share-loading\{/)
  assert.match(css, /\.fsdb-share-spinner\{/)
  assert.doesNotMatch(src, /正在打开/)
})

test('share layout prefs follow host outline expand and nav pin', () => {
  const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
  const src = readFileSync(resolve(import.meta.dirname, './share-page.tsx'), 'utf8')
  const prefs = readFileSync(resolve(import.meta.dirname, './page-width.ts'), 'utf8')
  assert.match(src, /LayoutPrefsMenu/)
  assert.match(src, /SHARE_PAGE_PREFS/)
  assert.match(src, /onChange=\{changeSharePrefs\}/)
  assert.doesNotMatch(src, /persistPagePrefs/)
  assert.match(prefs, /export const SHARE_PAGE_PREFS[\s\S]*wide: true[\s\S]*outlinePin: true[\s\S]*navPin: true/)
  assert.match(src, /chat-view-project/)
  assert.match(css, /\.fsdb-share-page\{[^}]*color:var\(--biu-color-text\)/)
  assert.doesNotMatch(css, /\.fsdb-share-page\{[^}]*color:var\(--biu-color-text,#2c2c2b\)/)
  assert.doesNotMatch(css, /html\.share \.heading-outline-host:not\(\.is-sheet\) \.chat-outline\{opacity:1\}/)
  assert.match(css, /html\[data-nav-pin="1"\] \.fsdb-detail-float-nav\{[^}]*opacity:1/)
})

test('share header crumbs use collectionLabel not the path id', () => {
  const src = readFileSync(resolve(import.meta.dirname, './share-page.tsx'), 'utf8')
  assert.match(src, /snapshot\.collectionLabel/)
  assert.doesNotMatch(src, /snapshot\.collection\.replace/)
})

test('share header has no 只读 badge', () => {
  const src = readFileSync(resolve(import.meta.dirname, './share-page.tsx'), 'utf8')
  assert.doesNotMatch(src, /只读/)
  assert.doesNotMatch(src, /fsdb-share-badge/)
  assert.match(src, /chromeFor\?\.\(snapshot\.collection\)/)
})

test('share header has a theme toggle for this session', () => {
  const src = readFileSync(resolve(import.meta.dirname, './share-page.tsx'), 'utf8')
  assert.match(src, /data-testid="fsdb-share-theme"/)
  assert.match(src, /persistShareTheme/)
  assert.doesNotMatch(src, /localStorage/)
  assert.match(src, /MoonIcon/)
  assert.match(src, /SunIcon/)
  assert.match(src, /夜间模式/)
  assert.match(src, /日间模式/)
  assert.match(src, /ShareOwnerCorner/)
})

test('share header merges resources into one download picker', () => {
  const src = readFileSync(resolve(import.meta.dirname, './share-page.tsx'), 'utf8')
  const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
  assert.match(src, /data-testid="fsdb-share-download"/)
  assert.match(src, /data-testid="fsdb-share-download-pop"/)
  assert.match(src, /页面 Markdown/)
  assert.match(src, /全部页面（zip）/)
  assert.match(src, /downloadPluginZip/)
  assert.doesNotMatch(src, /关联资源/)
  assert.doesNotMatch(src, /CubeTransparentIcon/)
  assert.doesNotMatch(src, /data-testid="fsdb-share-resources"/)
  assert.match(css, /\.fsdb-share-dl-item\{/)
})

test('share page record links open another shared record', () => {
  const src = readFileSync(resolve(import.meta.dirname, './share-page.tsx'), 'utf8')
  const cell = readFileSync(resolve(import.meta.dirname, './record-link-cell.tsx'), 'utf8')
  assert.match(src, /function openShareRecord\(id: string\)/)
  assert.match(src, /onOpenLink=\{openShareRecord\}/)
  assert.match(cell, /if \(onOpen\) \{\s*onOpen\(id\)/)
})

test('share corner uses the owner photo when set, else the brand icon', () => {
  const src = readFileSync(resolve(import.meta.dirname, './share-owner-corner.tsx'), 'utf8')
  const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
  assert.match(src, /owner\?\.avatar/)
  assert.match(src, /fsdb-share-owner-face/)
  assert.match(src, /BrandMascot/)
  assert.match(src, /data-testid="fsdb-share-owner-toggle"/)
  assert.match(src, /data-dock-tip/)
  assert.match(src, /data-share-owner-extras/)
  assert.match(src, /registerShareOwnerExtra/)
  assert.match(css, /\.fsdb-share-owner-face\{/)
})
