import { useState, type ReactElement } from 'react'
import { PlusIcon } from '@heroicons/react/16/solid'
import type { CollectionRowViewType, CollectionViewType } from '@biu/type-file-system/ui'
import type { FilterGroup, SortRule } from '../query-logic.ts'
import { LocalText } from './controls.tsx'
import type { ViewMode } from './fields.ts'
import { ModeGlyph, VIEW_MODES } from './fsdb-cells.tsx'
import {
  FilterQueryMenu,
  GroupAccordionSelect,
  GroupQueryMenu,
  SortQueryMenu,
  type GroupMenuBucket,
  type QueryField,
} from './query-menus.tsx'
import { PAGE_SIZES, type GroupConfig, type SavedView } from './saved-view.ts'
import type { TableSandboxItem } from '../shared/table-sandbox-model.ts'
import { SandboxKindIcon } from './sandbox-kind-icon.tsx'

export type ViewSettingsTab = 'view' | 'columns' | 'filter' | 'sort' | 'group'

const TABS: Array<{ id: ViewSettingsTab; label: string }> = [
  { id: 'view', label: '视图' },
  { id: 'columns', label: '属性' },
  { id: 'filter', label: '筛选' },
  { id: 'sort', label: '排序' },
  { id: 'group', label: '分组' },
]

export function ViewSettingsMenu({
  tab,
  onTabChange,
  sheet,
  collectionPath,
  title,
  activeView,
  commitViewName,
  mode,
  setMode,
  extraViews,
  extraRows,
  sandboxViews = [],
  onCreateSandboxView,
  patchActiveView,
  wrapCells,
  setWrap,
  truncateCells,
  setTruncate,
  showRowNumbers,
  setRowNumbers,
  parentKey,
  showTree,
  setTree,
  pageSize,
  changePageSize,
  renderVisibleColumnsFlyout,
  filterActive,
  filterTree,
  filterFields,
  filterValueOptions,
  applyFilterTree,
  sortCustom,
  sorts,
  sortFields,
  applySorts,
  grouping,
  groupBy,
  groupConfig,
  panelGroups,
  groupFields,
  setGroupKey,
  setGroupSettings,
  onClose,
}: {
  tab: ViewSettingsTab
  onTabChange: (next: ViewSettingsTab) => void
  sheet: boolean
  collectionPath: string
  title: string
  activeView?: SavedView
  commitViewName: (viewId: string, raw: string) => void
  mode: ViewMode
  setMode: (next: ViewMode) => void
  extraViews: CollectionViewType[]
  extraRows: CollectionRowViewType[]
  sandboxViews?: TableSandboxItem[]
  onCreateSandboxView?: () => void
  patchActiveView: (patch: Partial<SavedView>) => void
  wrapCells: boolean
  setWrap: (next: boolean) => void
  truncateCells: boolean
  setTruncate: (next: boolean) => void
  showRowNumbers: boolean
  setRowNumbers: (next: boolean) => void
  parentKey?: string | null
  showTree: boolean
  setTree: (next: boolean) => void
  pageSize: number
  changePageSize: (next: number) => void
  renderVisibleColumnsFlyout: () => ReactElement
  filterActive: boolean
  filterTree: FilterGroup
  filterFields: QueryField[]
  filterValueOptions: (field: QueryField) => Array<{ value: string; label: string }>
  applyFilterTree: (next: FilterGroup) => void
  sortCustom: boolean
  sorts: SortRule[]
  sortFields: QueryField[]
  applySorts: (next: SortRule[]) => void
  grouping: boolean
  groupBy: string
  groupConfig?: GroupConfig
  panelGroups: GroupMenuBucket[]
  groupFields: QueryField[]
  setGroupKey: (next: string) => void
  setGroupSettings: (next: GroupConfig | undefined) => void
  onClose: () => void
}) {
  const [openAcc, setOpenAcc] = useState<'mode' | 'pageSize' | null>(null)

  const modeOptions = [
    ...VIEW_MODES.map((opt) => ({
      value: opt.id,
      label: opt.label,
      icon: <ModeGlyph id={opt.id} extra={extraViews} rows={extraRows} />,
    })),
    ...sandboxViews.map((opt) => ({
      value: opt.id,
      label: opt.name,
      icon: <SandboxKindIcon />,
    })),
    ...extraViews.map((opt) => ({
      value: opt.id,
      label: opt.label,
      icon: <ModeGlyph id={opt.id} extra={extraViews} rows={extraRows} />,
    })),
    ...extraRows.map((opt) => ({
      value: opt.id,
      label: opt.label,
      icon: <ModeGlyph id={opt.id} extra={extraViews} rows={extraRows} />,
    })),
  ]

  const pageSizeOptions = PAGE_SIZES.map((size) => ({
    value: String(size),
    label: `${size}条`,
  }))

  const hasDot = (id: ViewSettingsTab) =>
    (id === 'filter' && filterActive) ||
    (id === 'sort' && sortCustom) ||
    (id === 'group' && grouping)

  return (
    <div className="fsdb-vset" role="dialog" aria-label="视图设置" data-testid="fsdb-view-settings">
      <div className="fsdb-vset-tabs" role="tablist">
        {TABS.map((item) => {
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`fsdb-vset-tab${active ? ' is-active' : ''}`}
              data-testid={`fsdb-vset-tab-${item.id}`}
              onClick={() => {
                setOpenAcc(null)
                onTabChange(item.id)
              }}
            >
              <span>{item.label}</span>
              {hasDot(item.id) ? <span className="fsdb-vset-tab-dot" aria-hidden /> : null}
            </button>
          )
        })}
      </div>

      <div className="fsdb-vset-body">
        {tab === 'view' ? (
          <>
            {!sheet && activeView ? (
              <LocalText
                className="fsdb-vset-name-input"
                value={activeView.name}
                aria-label="视图名称"
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  event.currentTarget.blur()
                }}
                onCommit={(raw) => commitViewName(activeView.id, raw)}
              />
            ) : null}

            <GroupAccordionSelect
              testId="fsdb-vset-mode-row"
              label="视图类型"
              value={mode}
              options={modeOptions}
              open={openAcc === 'mode'}
              onToggle={() => setOpenAcc((prev) => (prev === 'mode' ? null : 'mode'))}
              onSelect={(next) => {
                setOpenAcc(null)
                setMode(next as ViewMode)
                patchActiveView({ mode: next as ViewMode })
              }}
            />

            {openAcc === 'mode' && onCreateSandboxView && !sheet ? (
              <button
                type="button"
                className="fsdb-vset-mode-add"
                data-testid="fsdb-sandbox-view-create"
                onClick={() => {
                  setOpenAcc(null)
                  onCreateSandboxView()
                  onClose()
                }}
              >
                <PlusIcon aria-hidden className="size-[14px]" />
                <span>新建沙箱视图</span>
              </button>
            ) : null}

            {mode === 'table' ? (
              <>
                <div className="fsdb-group-panel-row">
                  <span className="fsdb-group-panel-label">单元格换行</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={wrapCells}
                    aria-label="单元格换行"
                    className={`fsdb-group-switch${wrapCells ? ' is-on' : ''}`}
                    onClick={() => setWrap(!wrapCells)}
                  >
                    <span className="fsdb-group-switch-thumb" />
                  </button>
                </div>

                <div className="fsdb-group-panel-row">
                  <span className="fsdb-group-panel-label">显示序号</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showRowNumbers}
                    aria-label="显示序号"
                    className={`fsdb-group-switch${showRowNumbers ? ' is-on' : ''}`}
                    onClick={() => setRowNumbers(!showRowNumbers)}
                  >
                    <span className="fsdb-group-switch-thumb" />
                  </button>
                </div>

                <div className="fsdb-group-panel-row">
                  <span className="fsdb-group-panel-label">文本缩略</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={truncateCells}
                    aria-label="文本缩略"
                    className={`fsdb-group-switch${truncateCells ? ' is-on' : ''}`}
                    onClick={() => setTruncate(!truncateCells)}
                  >
                    <span className="fsdb-group-switch-thumb" />
                  </button>
                </div>

                {parentKey ? (
                  <div className="fsdb-group-panel-row">
                    <span className="fsdb-group-panel-label">树形展示</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={showTree}
                      aria-label="树形展示"
                      className={`fsdb-group-switch${showTree ? ' is-on' : ''}`}
                      onClick={() => setTree(!showTree)}
                    >
                      <span className="fsdb-group-switch-thumb" />
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}

            <GroupAccordionSelect
              testId="fsdb-vset-pagesize-row"
              label="每页大小"
              value={String(pageSize)}
              options={pageSizeOptions}
              open={openAcc === 'pageSize'}
              onToggle={() => setOpenAcc((prev) => (prev === 'pageSize' ? null : 'pageSize'))}
              onSelect={(next) => {
                setOpenAcc(null)
                const parsed = Number(next)
                if (Number.isFinite(parsed) && parsed > 0) changePageSize(parsed)
              }}
            />
          </>
        ) : null}

        {tab === 'columns' ? renderVisibleColumnsFlyout() : null}

        {tab === 'filter' ? (
          <FilterQueryMenu
            tree={filterTree}
            fields={filterFields}
            valueOptions={filterValueOptions}
            onChange={applyFilterTree}
          />
        ) : null}

        {tab === 'sort' ? (
          <SortQueryMenu sorts={sorts} fields={sortFields} onChange={applySorts} />
        ) : null}

        {tab === 'group' ? (
          <GroupQueryMenu
            groupBy={groupBy}
            groupConfig={groupConfig}
            groups={panelGroups}
            fields={groupFields}
            onChange={setGroupKey}
            onChangeConfig={setGroupSettings}
            onClose={onClose}
          />
        ) : null}
      </div>
    </div>
  )
}
