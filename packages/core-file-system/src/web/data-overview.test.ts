import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('data overview title is writable and writes through the source record', () => {
  const data = readFileSync(resolve(import.meta.dirname, '../host/data-collection.ts'), 'utf8')
  assert.match(data, /title: \{ type: 'string', label: '标题', writable: true \}/)
  assert.match(data, /records: \{ update: true \}/)
  assert.match(data, /spec\.update\(stamp\.recordId, patch\)/)
  const host =
    readFileSync(resolve(import.meta.dirname, '../host/index.ts'), 'utf8') +
    readFileSync(resolve(import.meta.dirname, '../host/access-policy.ts'), 'utf8') +
    readFileSync(resolve(import.meta.dirname, '../host/http-routes.ts'), 'utf8')
  assert.match(host, /collection === TRASH_COLLECTION_PATH \|\| collection === DATA_COLLECTION_PATH/)
  assert.match(host, /parts\[0\] === 'data'/)
  assert.match(host, /overviewRecord\(source, written\.value/)
})

test('data overview reuses CollectionBrowser and opens source records', () => {
  const overview = readFileSync(resolve(import.meta.dirname, './data-overview.tsx'), 'utf8')
  const page = readFileSync(resolve(import.meta.dirname, './index.tsx'), 'utf8')
  assert.match(overview, /data-testid="fsdb-data-overview"/)
  assert.match(overview, /className="fsdb-data-overview"/)
  const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
  assert.match(css, /\.fsdb-data-overview\{display:flex;min-width:0;min-height:0;flex:1/)
  assert.match(overview, /<CollectionBrowser/)
  assert.match(overview, /DATA_COLLECTION_PATH/)
  assert.match(overview, /dataChrome/)
  assert.match(overview, /SourceActions/)
  assert.match(overview, /record\.actionIds/)
  assert.doesNotMatch(overview, /action.id === 'open'/)
  const chrome = readFileSync(resolve(import.meta.dirname, './data-chrome.ts'), 'utf8')
  const catalog = readFileSync(resolve(import.meta.dirname, '../catalog-views.ts'), 'utf8')
  assert.match(catalog, /\['title', 'actions', 'table'\]/)
  assert.match(overview, /SourceTableCell/)
  assert.match(overview, /cells: \{/)
  const sourceCell = readFileSync(resolve(import.meta.dirname, './source-table-cell.tsx'), 'utf8')
  assert.match(sourceCell, /className="fsdb-record-mark is-sm"/)
  assert.match(sourceCell, /idleTableIconKind\(/)
  assert.match(sourceCell, /className="fsdb-title-text"/)
  assert.match(sourceCell, /collectionNoun/)
  assert.match(sourceCell, /onOpenTable\(path, viewId\)/)
  assert.match(sourceCell, /defaultViewId\(path\)/)
  const browser =
    readFileSync(resolve(import.meta.dirname, './browser-row-title.tsx'), 'utf8') +
    '\n' +
    readFileSync(resolve(import.meta.dirname, './browser-cell-renderer.tsx'), 'utf8') +
    '\n' +
    readFileSync(resolve(import.meta.dirname, './browser-toolbar.tsx'), 'utf8') +
    '\n' +
    readFileSync(resolve(import.meta.dirname, './use-browser-mutations.ts'), 'utf8') +
    '\n' +
    readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8')
  const host =
    readFileSync(resolve(import.meta.dirname, '../host/index.ts'), 'utf8') +
    readFileSync(resolve(import.meta.dirname, '../host/access-policy.ts'), 'utf8') +
    readFileSync(resolve(import.meta.dirname, '../host/http-routes.ts'), 'utf8')
  assert.match(browser, /key === 'table'/)
  assert.match(browser, /<SourceTableCell record=\{row\} tables=\{tables\} onOpenTable=\{onOpenTable\} \/>/)
  assert.match(browser, /row\.tableIcon/)
  assert.match(overview, /onOpenView/)
  assert.match(page, /collectionFromRoute === DATA_COLLECTION_PATH/)
  assert.match(page, /onOpenView=\{\(viewId\) => go\(\{ collection: DATA_COLLECTION_PATH, viewId \}\)\}/)
  assert.match(page, /stampRowOpenTarget/)
  assert.match(page, /setViaDataCrumbs/)
  assert.match(page, /crumbFromData=\{viaDataCrumbs\}/)
  assert.match(overview, /stampRowOpenTarget/)
  assert.match(overview, /stamp\?\.recordId \?\? recordId/)
  assert.match(page, /dataHome \? defaultViewId\(DATA_COLLECTION_PATH\) : viewFromRoute/)
  assert.match(
    page,
    /go\(\{ collection: DATA_COLLECTION_PATH, viewId: defaultViewId\(DATA_COLLECTION_PATH\) \}/,
  )
  assert.match(chrome, /stampRowOpenTarget/)
  assert.match(browser, /crumbFromData/)
  assert.match(browser, /viaDataViewId/)
  assert.match(browser, /originNav/)
  assert.match(browser, /canStepPrev/)
  assert.match(browser, /canStepNext/)
  assert.doesNotMatch(overview, /DataSidebarShell/)
  assert.doesNotMatch(overview, /tasks-table is-cols-fixed/)
  assert.match(page, /<DataOverview/)
  assert.match(page, /decorate\(DATA_COLLECTION_PATH, dataChrome\)/)
  assert.match(browser, /isDataOverview \? overviewCreateTables.length > 0/)
  assert.match(browser, /aria-label="新建类型"/)
  assert.match(overview, /embed=\{embed\}/)
  assert.match(browser, /useState\(PAGES_COLLECTION_PATH\)/)
  assert.match(browser, /path: targetPath/)
  assert.match(browser, /tablePath: targetTable.path/)
  assert.doesNotMatch(browser, /from '\.\.\/host\/data-collection/)
  assert.match(browser, /showRecordInInspector\(targetPath, sourceId/)
  assert.match(browser, /const target = sourceDeleteTarget\(row\)/)
  assert.match(browser, /path: target.path, ids: \[target.id\]/)
  assert.match(browser, /sourceDeleteTarget\(row \?\? \{ id \}\)/)
  assert.match(host, /if \(spec.path === DATA_COLLECTION_PATH\) \{/)
  assert.match(host, /await this.remove\(stamp.collection, \{ ids: \[stamp.recordId\], purge: query.purge \}\)/)
  assert.match(host, /private rewriteOverviewRecordPath\(path: string\)/)
  assert.match(host, /if \(rewritten\) return this.action\(rewritten, actionId, args\)/)
  assert.match(host, /if \(rewritten\) return this.content\(rewritten\)/)
  assert.match(host, /if \(rewritten\) return this.writeContentNow\(rewritten, value, expectedVersion\)/)
  assert.match(browser, /const actionPath = sourceRecordPath\(row, row.id\)/)
})
