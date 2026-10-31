import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { filterPageOutline, parsePageOutline } from './page-outline.ts'
import { defaultPageViews, emptyPageViewState, readPageViewState, writePageViewState } from './page-views.ts'

const toolbar = readFileSync(resolve(import.meta.dirname, './page-toolbar.tsx'), 'utf8')
const detail = readFileSync(resolve(import.meta.dirname, './record-detail.tsx'), 'utf8')
const browser = readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8')
const style = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')

test('page toolbar mirrors tasks-toolbar and lives on page records', () => {
  assert.match(toolbar, /className="tasks-toolbar page-content-toolbar"/)
  assert.match(toolbar, /data-testid="page-content-toolbar"/)
  assert.match(toolbar, /data-testid="page-view-tab"/)
  assert.match(toolbar, /data-testid="page-toolbar-search"/)
  assert.match(toolbar, /data-testid="page-toolbar-config"/)
  assert.match(toolbar, /<LayoutPrefsMenu/)
  assert.match(toolbar, /{share}/)
  assert.match(detail, /collectionPath === '\/pages'/)
  assert.match(detail, /PageContentToolbar/)
  assert.match(browser, /collectionPath === '\/pages' && detailId/)
  assert.match(browser, /buttonClassName="tasks-sort-btn"/)
  assert.match(style, /\.page-outline-title/)
})

test('page outline parses headings and can filter or sort them', () => {
  const items = parsePageOutline('# 甲\n一段\n## 乙\n\n### 丙\n尾')
  assert.equal(items.length, 3)
  assert.equal(items[0]?.level, 1)
  assert.equal(items[0]?.text, '甲')
  assert.equal(items[0]?.body, '一段')
  assert.deepEqual(
    filterPageOutline(items, '丙', [1, 2, 3], 'doc').map((item) => item.text),
    ['丙'],
  )
  assert.deepEqual(
    filterPageOutline(items, '', [2], 'title').map((item) => item.text),
    ['乙'],
  )
})

test('page views persist per path', () => {
  const memory = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value)
      },
      removeItem: (key: string) => {
        memory.delete(key)
      },
    },
  })
  const path = '/pages/demo'
  assert.equal(readPageViewState(path).views.length, defaultPageViews().length)
  writePageViewState(path, {
    ...emptyPageViewState(),
    activeId: 'page-view-outline',
  })
  assert.equal(readPageViewState(path).activeId, 'page-view-outline')
})
