/** @vitest-environment jsdom */
import assert from 'node:assert/strict'
import { createRef, useState } from 'react'
import { afterEach, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BrowserListChrome, type BrowserListChromeProps } from './browser-toolbar.tsx'
import { normalizeSavedView, type SavedView } from './saved-view.ts'

afterEach(() => {
  cleanup()
})

function noop() {}

function makeProps(
  activeView: SavedView,
  overrides: Partial<BrowserListChromeProps> = {},
): BrowserListChromeProps {
  return {
    sheet: true,
    collectionPath: '/pages',
    title: '页面',
    activeViewId: activeView.id,
    activeView,
    views: [activeView],
    viewBanner: null,
    setViewBanner: noop,
    commitViewName: noop,
    bindToolbar: noop,
    viewRef: createRef<HTMLDivElement>(),
    viewMenuOpen: false,
    setViewMenuOpen: noop,
    toggleMenu: noop,
    selectView: noop,
    copyView: noop,
    deleteView: noop,
    persistViewOrder: noop,
    addEmptyView: noop,
    pickedIds: [],
    setPickedIds: noop,
    sendPickedRowsToChat: noop,
    canBulkDelete: false,
    inTrash: false,
    items: [],
    setDlg: noop,
    bulkRef: createRef<HTMLDivElement>(),
    bulkMenuRef: createRef<HTMLDivElement>(),
    bulkMenuOpen: false,
    setBulkMenuOpen: noop,
    bulkMenuBox: { top: 0, left: 0 },
    canTag: false,
    setBulkTagIds: noop,
    exportPicked: noop,
    toolbarRightRef: createRef<HTMLDivElement>(),
    searchExpanded: false,
    viewsSaveError: '',
    setViewsSaveError: noop,
    query: '',
    setQuery: noop,
    setSearchOpen: noop,
    searchRef: createRef<HTMLDivElement>(),
    searchInputRef: createRef<HTMLInputElement>(),
    modeRef: createRef<HTMLDivElement>(),
    modeMenuOpen: false,
    setModeMenuOpen: noop,
    mode: 'table',
    setMode: noop,
    extraViews: [],
    extraRows: [],
    patchActiveView: noop,
    sortRef: createRef<HTMLDivElement>(),
    sortMenuOpen: false,
    setSortMenuOpen: noop,
    sortCustom: false,
    sorts: [],
    sortFields: [],
    applySorts: noop,
    filterRef: createRef<HTMLDivElement>(),
    filterOpen: false,
    setFilterOpen: noop,
    filterActive: false,
    filterTree: { kind: 'group', id: 'root', combinator: 'and', children: [] },
    filterFields: [],
    filterValueOptions: () => [],
    applyFilterTree: noop,
    groupRef: createRef<HTMLDivElement>(),
    groupOpen: false,
    setGroupOpen: noop,
    grouping: false,
    groupBy: '',
    panelGroups: [],
    groupFields: [],
    setGroupKey: noop,
    setGroupSettings: noop,
    columnRef: createRef<HTMLDivElement>(),
    columnMenuOpen: false,
    setColumnMenuOpen: noop,
    renderVisibleColumnsFlyout: () => <div />,
    configRef: createRef<HTMLDivElement>(),
    configOpen: false,
    setConfigOpen: noop,
    wrapCells: false,
    setWrap: noop,
    truncateCells: true,
    setTruncate: noop,
    showRowNumbers: false,
    setRowNumbers: noop,
    freezeTitle: false,
    setFreezeTitleCol: noop,
    showTree: false,
    setTree: noop,
    pageSize: 20,
    changePageSize: noop,
    refreshing: false,
    refreshNow: noop,
    notice: '',
    canCreate: true,
    canAskNewPlugin: false,
    createRecord: noop,
    isDataOverview: false,
    createTypeOpen: false,
    setCreateTypeOpen: noop,
    createTypePath: '/pages',
    setCreateTypePath: noop,
    overviewCreateTables: [],
    createScopeOpen: false,
    setCreateScopeOpen: noop,
    createScope: 'workspace',
    setCreateScope: noop,
    localData: false,
    ...overrides,
  }
}

for (const domain of ['workspace', 'personal', 'all'] as const) {
  test(`clicking create-scope icon switches scope instead of creating a record in ${domain} view`, () => {
    let created = 0
    const initialScope = domain === 'personal' ? 'personal' : 'workspace'
    const view = normalizeSavedView({
      id: `v-${domain}`,
      name: '全部页面',
      mode: 'table',
      filters: domain === 'all' ? {} : { $scope: domain },
      columns: [],
    })

    function Harness() {
      const [scopeOpen, setScopeOpen] = useState(false)
      const [scope, setScope] = useState<'personal' | 'workspace' | 'shared' | 'local'>(initialScope)
      return (
        <BrowserListChrome
          {...makeProps(view, {
            createRecord: () => {
              created += 1
            },
            createScopeOpen: scopeOpen,
            setCreateScopeOpen: setScopeOpen,
            createScope: scope,
            setCreateScope: setScope,
          })}
        />
      )
    }

    render(<Harness />)

    const getScopeBtn = () => screen.getByRole('button', { name: '新建归属' })
    assert.equal(screen.queryByTestId('fsdb-create-scope-badge'), null)

    fireEvent.click(getScopeBtn())
    assert.equal(created, 0)
    assert.equal(getScopeBtn().getAttribute('aria-expanded'), 'true')

    const nextOption = initialScope === 'workspace' ? '私人' : '空间'
    fireEvent.click(screen.getByRole('menuitem', { name: nextOption }))
    assert.equal(created, 0)
    assert.equal(getScopeBtn().getAttribute('aria-expanded'), 'false')
    assert.equal(
      getScopeBtn().querySelector('.fsdb-ui-glyph')?.getAttribute('data-icon'),
      initialScope === 'workspace' ? 'user' : 'user-group',
    )

    fireEvent.click(screen.getByRole('button', { name: '新建记录' }))
    assert.equal(created, 1)
  })
}
