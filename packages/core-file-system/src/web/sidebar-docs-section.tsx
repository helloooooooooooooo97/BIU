import { memo, useCallback, useEffect, useMemo, useState, useSyncExternalStore, type MouseEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronRightIcon,
  PlusIcon,
  StarIcon,
  UserGroupIcon,
  UserIcon,
  UsersIcon,
  ViewColumnsIcon,
} from '@heroicons/react/16/solid'
import { onAppEvents } from '@biu/biu-ui/app-events'
import { ChatCount } from '@biu/biu-ui/chat-count'
import { SidebarFold } from '@biu/biu-ui/sidebar-fold'
import { FSDB_CHANGE_EVENT, parseFsdbChange, type DbRecord } from '@biu/type-file-system'
import { useSidebarCollapseStore } from '@biu/web-session-view'
import { SidebarRow, SidebarRowMain, type SidebarRowMenuItem } from '@biu/web-session-view/sidebar-row'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import { PAGES_COLLECTION_PATH } from '../paths.ts'
import { databaseRecordPath } from './database-path.ts'
import { invalidateListReads, listCollection, readJson } from './db-client.ts'
import { treeChildren } from './fields.ts'
import { showRecordInInspector } from './inspector-db-route.ts'
import { RecordMark } from './record-mark.tsx'
import { recordPreviewEmoji, recordPreviewLabel } from './sidebar-preview.ts'
import {
  getStarredRecords,
  getStarredRecordsVersion,
  isRecordStarred,
  persistStarredRecords,
  rememberRecords,
  subscribeStarredRecords,
  toggleStarredRecord,
} from './view-storage.ts'

export type DocScopeKey = 'personal' | 'shared' | 'workspace'

const DOC_SCOPES: ReadonlyArray<{
  key: DocScopeKey
  label: string
  creatable: boolean
  Icon: typeof UserIcon
}> = [
  { key: 'personal', label: '个人', creatable: true, Icon: UserIcon },
  { key: 'shared', label: '共享', creatable: false, Icon: UsersIcon },
  { key: 'workspace', label: '空间', creatable: true, Icon: UserGroupIcon },
]

const SECTION_COLLAPSE_KEY = 'chat.section.docs'
const SCOPE_COLLAPSE_PREFIX = 'chat.docs.scope.'
const DOC_COLUMNS = ['title', 'emoji', 'parentId', 'shareScope', 'updatedAt']

export function docScopeOf(row: DbRecord): DocScopeKey {
  const raw = typeof row.shareScope === 'string' ? row.shareScope.trim() : ''
  if (raw === '空间' || raw === 'workspace') return 'workspace'
  if (raw === '共享' || raw === 'shared') return 'shared'
  return 'personal'
}

export function groupDocsByScope(rows: DbRecord[]): Record<DocScopeKey, DbRecord[]> {
  const grouped: Record<DocScopeKey, DbRecord[]> = {
    personal: [],
    shared: [],
    workspace: [],
  }
  for (const row of rows) {
    if (!row?.id) continue
    grouped[docScopeOf(row)].push(row)
  }
  return grouped
}

function activePageRecordId(pathname: string): string | null {
  const match = pathname.match(/^\/database\/pages(?:\/view\/[^/]+)?\/record\/([^/?#]+)/)
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

function onDocRowClick(event: MouseEvent<HTMLElement>) {
  const hit = event.target
  if (event.defaultPrevented || !(hit instanceof Element) || !event.currentTarget.contains(hit)) return
  if (hit.closest('button, a, input, textarea, select, [contenteditable], [role="button"], [role="menuitem"]')) return
  event.currentTarget.querySelector<HTMLButtonElement>('button[data-doc-open]')?.click()
}

export type SidebarDocsSectionProps = {
  iconRail?: boolean
  popoverClose?: () => void
}

/** 会话左侧边栏「文档」区块：按 个人 / 共享 / 空间 三级分组，并以 parentId 树形层级展示页面文档。 */
export const SidebarDocsSection = memo(function SidebarDocsSection({
  iconRail = false,
  popoverClose,
}: SidebarDocsSectionProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const collapsedMap = useSidebarCollapseStore((s) => s.collapsed)
  const toggleCollapse = useSidebarCollapseStore((s) => s.toggle)

  const [docs, setDocs] = useState<DbRecord[]>([])
  const [openKids, setOpenKids] = useState<Record<string, boolean>>({})

  useSyncExternalStore(subscribeStarredRecords, getStarredRecordsVersion, () => 0)
  const starredRecords = getStarredRecords()
  const activeRecordId = activePageRecordId(location.pathname)

  const refreshDocs = useCallback((fresh = false) => {
    void listCollection({
      path: PAGES_COLLECTION_PATH,
      limit: 500,
      sortField: 'updatedAt',
      sortDir: 'desc',
      columns: DOC_COLUMNS,
      fresh,
    })
      .then((page) => {
        setDocs(page.items)
      })
      .catch(() => {
        /* 保持当前列表，静默容错 */
      })
  }, [])

  useEffect(() => {
    if (iconRail) return
    refreshDocs(false)
    let timer = 0
    const scheduleRefresh = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => refreshDocs(true), 40)
    }
    const onFsdbChange = (event: Event) => {
      const detail = parseFsdbChange(event)
      if (detail.scope === 'tags' || detail.scope === 'views') return
      if (!detail.path || detail.path === PAGES_COLLECTION_PATH || detail.path === '/') {
        scheduleRefresh()
      }
    }
    window.addEventListener(FSDB_CHANGE_EVENT, onFsdbChange)
    const offAccount = onAppEvents(['biu:account-token', 'biu:workspace-profile'], scheduleRefresh)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener(FSDB_CHANGE_EVENT, onFsdbChange)
      offAccount()
    }
  }, [iconRail, refreshDocs])

  const grouped = useMemo(() => groupDocsByScope(docs), [docs])

  const openDoc = useCallback(
    (row: DbRecord) => {
      rememberRecords(PAGES_COLLECTION_PATH, [
        { id: row.id, label: recordPreviewLabel(row), emoji: recordPreviewEmoji(row) },
      ])
      popoverClose?.()
      navigate(databaseRecordPath(PAGES_COLLECTION_PATH, row.id))
    },
    [navigate, popoverClose],
  )

  const createDoc = useCallback(
    async (scope: DocScopeKey, parentId?: string) => {
      try {
        const recordPayload: Record<string, unknown> = parentId ? { parentId } : {}
        const data = await readJson<{ items?: Array<{ value?: DbRecord }> }>('/api/db/create', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            path: PAGES_COLLECTION_PATH,
            scope: scope === 'workspace' ? 'workspace' : 'personal',
            records: [recordPayload],
          }),
        })
        const created = data.items?.[0]?.value
        invalidateListReads()
        if (parentId) {
          setOpenKids((prev) => ({ ...prev, [parentId]: true }))
        }
        if (created?.id) {
          setDocs((prev) => (prev.some((item) => item.id === created.id) ? prev : [created, ...prev]))
        }
        window.dispatchEvent(new Event(FSDB_CHANGE_EVENT))
        if (created?.id) {
          openDoc(created)
        }
      } catch {
        /* 忽略创建失败，交由用户重试 */
      }
    },
    [openDoc],
  )

  const deleteDoc = useCallback(async (row: DbRecord) => {
    try {
      await readJson('/api/db/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: PAGES_COLLECTION_PATH, ids: [row.id] }),
      })
      invalidateListReads()
      setDocs((prev) => prev.filter((item) => item.id !== row.id))
      window.dispatchEvent(new Event(FSDB_CHANGE_EVENT))
    } catch {
      /* 忽略删除失败 */
    }
  }, [])

  const toggleDocStar = useCallback((row: DbRecord) => {
    const label = recordPreviewLabel(row)
    const emoji = recordPreviewEmoji(row)
    rememberRecords(PAGES_COLLECTION_PATH, [{ id: row.id, label, emoji }])
    persistStarredRecords(
      toggleStarredRecord(getStarredRecords(), PAGES_COLLECTION_PATH, row.id, { label, emoji }),
    )
  }, [])

  if (iconRail) return null

  const sectionCollapsed = Boolean(collapsedMap[SECTION_COLLAPSE_KEY])

  const renderTree = (
    scopeDocs: DbRecord[],
    scopeKey: DocScopeKey,
    parentId = '',
    trail: ReadonlySet<string> = new Set(),
  ) => {
    const rows = treeChildren(scopeDocs, 'parentId', parentId)
    return rows.map((row) => {
      if (trail.has(row.id)) return null
      const nextTrail = new Set(trail)
      nextTrail.add(row.id)
      const label = recordPreviewLabel(row)
      const emoji = recordPreviewEmoji(row)
      const kids = treeChildren(scopeDocs, 'parentId', row.id)
      const hasKids = kids.length > 0
      const expanded = Boolean(openKids[row.id])
      const starred = isRecordStarred(starredRecords, PAGES_COLLECTION_PATH, row.id)
      const face = emoji ? (
        <span className="fsdb-record-emoji">{emoji}</span>
      ) : (
        <RecordMark record={row} tableIcon="document" />
      )
      const menuItems: SidebarRowMenuItem[] = [
        {
          id: 'open-inspector',
          label: '在右侧栏打开',
          icon: <ViewColumnsIcon className="size-4 shrink-0" />,
          onSelect: () => {
            popoverClose?.()
            showRecordInInspector(PAGES_COLLECTION_PATH, row.id)
          },
        },
      ]

      return (
        <div key={row.id} className="min-w-0" data-testid={`sidebar-doc-node-${row.id}`}>
          <SidebarRow
            active={activeRecordId === row.id}
            pinned={starred}
            onClick={onDocRowClick}
            main={
              <SidebarRowMain>
                {hasKids ? (
                  <button
                    type="button"
                    className="relative grid size-6 shrink-0 cursor-pointer place-items-center border-0 bg-transparent p-0 text-inherit"
                    title={expanded ? `收起 ${label} 的子文档` : `展开 ${label} 的子文档`}
                    aria-label={expanded ? `收起 ${label} 的子文档` : `展开 ${label} 的子文档`}
                    aria-expanded={expanded}
                    data-testid={`sidebar-doc-toggle-${row.id}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      setOpenKids((prev) => ({ ...prev, [row.id]: !prev[row.id] }))
                    }}
                  >
                    <span className="sidebar-rail-icon sidebar-group-fold">
                      <span className="sidebar-group-fold-face">{face}</span>
                      <span className="sidebar-group-fold-chevron">
                        <ChevronRightIcon
                          className={`size-4 shrink-0 opacity-80 sidebar-chevron${expanded ? ' is-open' : ''}`}
                        />
                      </span>
                    </span>
                  </button>
                ) : (
                  <span className="relative grid size-6 shrink-0 place-items-center" aria-hidden>
                    <span className="sidebar-rail-icon">{face}</span>
                  </span>
                )}
                <button
                  type="button"
                  data-doc-open=""
                  data-testid={`sidebar-doc-open-${row.id}`}
                  className="min-w-0 flex-1 cursor-pointer truncate border-0 bg-transparent p-0 text-left font-medium text-inherit"
                  title={label}
                  onClick={(event) => {
                    event.stopPropagation()
                    openDoc(row)
                  }}
                >
                  {label}
                </button>
              </SidebarRowMain>
            }
            trail={
              <>
                {hasKids ? <ChatCount count={kids.length} title={`${kids.length} 篇子文档`} /> : null}
                {scopeKey !== 'shared' ? (
                  <button
                    type="button"
                    className="sidebar-add"
                    title={`在 ${label} 下添加子文档`}
                    aria-label={`在 ${label} 下添加子文档`}
                    data-testid={`sidebar-doc-add-child-${row.id}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      void createDoc(scopeKey, row.id)
                    }}
                  >
                    <PlusIcon className="size-4 shrink-0" />
                  </button>
                ) : null}
              </>
            }
            onStar={() => toggleDocStar(row)}
            starOn={starred}
            starLabel={starred ? `取消收藏 ${label}` : `收藏 ${label}`}
            starIcon={<StarIcon className="size-4 shrink-0" />}
            menuItems={menuItems}
            onDelete={() => void deleteDoc(row)}
            deleteLabel={`删除 ${label}`}
            deleteIcon={<TrashGlyph />}
          />
          {hasKids ? (
            <SidebarFold open={expanded}>
              <div className="fsdb-record-kids" data-testid={`sidebar-doc-kids-${row.id}`}>
                {renderTree(scopeDocs, scopeKey, row.id, nextTrail)}
              </div>
            </SidebarFold>
          ) : null}
        </div>
      )
    })
  }

  return (
    <section className="min-w-0" data-testid="sidebar-docs-section">
      <div className="sidebar-section-head min-w-0">
        <button
          type="button"
          className="flex h-full min-h-8 min-w-0 flex-1 items-center gap-2 text-left text-[12px] font-bold tracking-wider"
          aria-expanded={!sectionCollapsed}
          onClick={() => toggleCollapse(SECTION_COLLAPSE_KEY)}
        >
          <span className="min-w-0 flex-1 truncate tracking-normal">文档</span>
        </button>
        <ChatCount count={docs.length} />
        <button
          type="button"
          className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md border-0 bg-transparent p-0 text-(--biu-color-text-muted) hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text)"
          title="新建文档"
          aria-label="新建文档"
          data-testid="sidebar-create-doc"
          onClick={(event) => {
            event.stopPropagation()
            void createDoc('personal')
          }}
        >
          <PlusIcon className="size-4 shrink-0" />
        </button>
      </div>

      <SidebarFold open={!sectionCollapsed}>
        <div className="sidebar-section-rows flex min-w-0 flex-col pt-0.5">
          {DOC_SCOPES.map(({ key, label, creatable, Icon }) => {
            const scopeDocs = grouped[key]
            const collapseKey = `${SCOPE_COLLAPSE_PREFIX}${key}`
            const collapsed = Boolean(collapsedMap[collapseKey])
            return (
              <div key={key} className="min-w-0" data-testid={`sidebar-docs-scope-${key}`}>
                <div className="sidebar-group-head">
                  <div
                    role="button"
                    tabIndex={0}
                    className="flex min-h-8 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md text-left text-[14px] font-medium tracking-normal text-inherit outline-none hover:text-(--biu-color-text) focus-visible:ring-1 focus-visible:ring-(--biu-color-border)"
                    title={label}
                    aria-expanded={!collapsed}
                    data-testid={`sidebar-docs-scope-toggle-${key}`}
                    onClick={() => toggleCollapse(collapseKey)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      toggleCollapse(collapseKey)
                    }}
                  >
                    <span className="grid size-6 shrink-0 place-items-center" aria-hidden>
                      <span className="sidebar-rail-icon sidebar-group-fold">
                        <span className="sidebar-group-fold-face">
                          <Icon className="size-4 shrink-0" />
                        </span>
                        <span className="sidebar-group-fold-chevron">
                          <ChevronRightIcon
                            className={`size-4 shrink-0 opacity-80 sidebar-chevron${collapsed ? '' : ' is-open'}`}
                          />
                        </span>
                      </span>
                    </span>
                    <span className="sidebar-label min-w-0 flex-1 truncate">{label}</span>
                  </div>
                  <ChatCount count={scopeDocs.length} />
                  {creatable ? (
                    <button
                      type="button"
                      className="sidebar-add"
                      title={`在${label}下新建文档`}
                      aria-label={`在${label}下新建文档`}
                      data-testid={`sidebar-docs-create-${key}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        void createDoc(key)
                      }}
                    >
                      <PlusIcon className="size-4 shrink-0" />
                    </button>
                  ) : null}
                </div>
                {scopeDocs.length > 0 ? (
                  <SidebarFold open={!collapsed} className="sidebar-session-list min-w-0">
                    {renderTree(scopeDocs, key)}
                  </SidebarFold>
                ) : null}
              </div>
            )
          })}
        </div>
      </SidebarFold>
    </section>
  )
})
