import { useEffect, useState, type ReactElement } from 'react'
import { PlusIcon } from '@heroicons/react/16/solid'
import { apiFetch } from '@biu/biu-ui/api-client'
import type { CollectionRowViewType, CollectionViewType } from '@biu/type-file-system/ui'
import { isBuiltinAllViewId } from '../catalog-views.ts'
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
import { canEditSavedView, PAGE_SIZES, type GroupConfig, type SavedView } from './saved-view.ts'
import type { TableSandboxItem } from '../shared/table-sandbox-model.ts'
import { SandboxKindIcon } from './sandbox-kind-icon.tsx'
import { registerWorkspaceCache } from './workspace-client-store.ts'

export type ViewSettingsTab = 'view' | 'columns' | 'filter' | 'sort' | 'group'

const TABS: Array<{ id: ViewSettingsTab; label: string }> = [
  { id: 'view', label: '视图' },
  { id: 'columns', label: '属性' },
  { id: 'filter', label: '筛选' },
  { id: 'sort', label: '排序' },
  { id: 'group', label: '分组' },
]

type ViewerIdentity = { accountId: string; isAdmin: boolean }

let cachedViewerIdentity: ViewerIdentity | null = null
let viewerIdentityPromise: Promise<ViewerIdentity> | null = null

registerWorkspaceCache('view-settings-viewer', () => {
  cachedViewerIdentity = null
  viewerIdentityPromise = null
})

async function loadViewerIdentity(): Promise<ViewerIdentity> {
  if (cachedViewerIdentity) return cachedViewerIdentity
  if (viewerIdentityPromise) return viewerIdentityPromise
  viewerIdentityPromise = apiFetch('/api/account/me')
    .then(async (res) => {
      if (!res.ok) return { accountId: '', isAdmin: false }
      const data = (await res.json()) as {
        id?: string
        account?: { id?: string } | null
        workspace?: { role?: string } | null
      }
      const role = String(data.workspace?.role ?? '')
      const next = {
        accountId: String(data.id ?? data.account?.id ?? '').trim(),
        isAdmin: role === 'owner' || role === 'admin',
      }
      cachedViewerIdentity = next
      return next
    })
    .catch(() => ({ accountId: '', isAdmin: false }))
    .finally(() => {
      viewerIdentityPromise = null
    })
  return viewerIdentityPromise
}

export function ViewSettingsMenu({
  tab,
  onTabChange,
  sheet,
  collectionPath,
  title,
  activeView,
  commitViewName,
  onSaveAsPersonal,
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
  onSaveAsPersonal?: () => void
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
  const [openAcc, setOpenAcc] = useState<'mode' | 'scope' | 'pageSize' | null>(null)
  const [viewer, setViewer] = useState<ViewerIdentity>(() => cachedViewerIdentity ?? { accountId: '', isAdmin: false })

  useEffect(() => {
    if (!activeView?.createdBy || cachedViewerIdentity) return
    let alive = true
    void loadViewerIdentity().then((next) => {
      if (alive) setViewer(next)
    })
    return () => {
      alive = false
    }
  }, [activeView?.createdBy])

  const foreignViewReadOnly = Boolean(
    !sheet &&
      activeView &&
      !activeView.builtin &&
      (activeView.viewRole
        ? !canEditSavedView(activeView)
        : activeView.createdBy &&
          viewer.accountId &&
          activeView.createdBy !== viewer.accountId &&
          !viewer.isAdmin),
  )

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
        {foreignViewReadOnly ? (
          <div className="fsdb-vset-readonly-banner" data-testid="fsdb-vset-readonly-banner" style={{ padding: '8px 10px', marginBottom: 8, borderRadius: 8, background: 'var(--bg-subtle, rgba(255,255,255,0.04))', fontSize: 12, lineHeight: 1.5, color: 'var(--text-muted, #9aa0a6)' }}>
            <div>当前视图为只读（仅查看），筛选、排序、分组与排版仅在本地临时生效，不会修改原视图。</div>
            {onSaveAsPersonal ? (
              <button
                type="button"
                className="fsdb-vset-mode-add"
                style={{ marginTop: 6 }}
                onClick={() => {
                  setOpenAcc(null)
                  onSaveAsPersonal()
                  onClose()
                }}
              >
                <PlusIcon aria-hidden className="size-[14px]" />
                <span>另存为私人视图</span>
              </button>
            ) : null}
          </div>
        ) : null}

        {tab === 'view' ? (
          <>
            {!sheet && activeView && !foreignViewReadOnly ? (
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

            {!foreignViewReadOnly && !sheet && activeView && (!activeView.builtin || isBuiltinAllViewId(activeView.id)) ? (
              activeView.ownerTable === 'all' || isBuiltinAllViewId(activeView.id) ? (
                <div
                  className="fsdb-group-panel-row"
                  data-testid="fsdb-vset-all-table-note"
                  style={{ fontSize: 12, color: 'var(--text-muted, #9aa0a6)' }}
                >
                  <span className="fsdb-group-panel-label">保护视图</span>
                  <span>个人视图（数据聚合视角仅自己可见）</span>
                </div>
              ) : (
                <GroupAccordionSelect
                  testId="fsdb-vset-protection-row"
                  label="保护视图"
                  value={activeView.protection ?? (activeView.scope === 'personal' ? 'personal' : 'public')}
                  options={[
                    { value: 'public', label: '公共视图（成员可改）' },
                    ...(!(activeView.ownerTable?.startsWith('account:') && viewer.accountId && activeView.ownerTable !== `account:${viewer.accountId}`)
                      ? [{ value: 'locked', label: '锁定视图（仅管理者可改）' }]
                      : []),
                    { value: 'personal', label: '个人视图（仅自己可见）' },
                  ]}
                  open={openAcc === 'scope'}
                  onToggle={() => setOpenAcc((prev) => (prev === 'scope' ? null : 'scope'))}
                  onSelect={(next) => {
                    setOpenAcc(null)
                    const protection = next as 'public' | 'locked' | 'personal'
                    const nextScope = protection === 'personal' ? 'personal' : 'workspace'
                    patchActiveView({ protection, scope: nextScope })
                  }}
                />
              )
            ) : null}

            {!foreignViewReadOnly ? (
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
            ) : null}

            {!foreignViewReadOnly && openAcc === 'mode' && onCreateSandboxView && !sheet ? (
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
