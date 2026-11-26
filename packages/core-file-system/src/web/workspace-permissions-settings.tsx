import { useCallback, useEffect, useMemo, useState } from 'react'
import { UserIcon, UsersIcon } from '@heroicons/react/16/solid'
import { apiFetch } from '@biu/biu-ui/api-client'
import type { CollectionInfo, CollectionSchema, CollectionSchemaPack } from '@biu/type-file-system'
import { DATA_COLLECTION_PATH, tableModeFor } from '../paths.ts'
import { AccessRulesPanel, consumePendingAccessRulesOpen, type OpenAccessRulesDetail } from './access-rules-drawer.tsx'
import { PAGES_COLLECTION_PATH, sortDataCollections } from './database-path.ts'
import { readJson } from './db-client.ts'
import { contentFieldKey, fieldEntries, filterFieldValueOptions, flattenTagColumns, resolveFieldType, tagColumnTitle } from './fields.ts'
import { FSDB_SHARES_CHANGE_EVENT, OPEN_ACCESS_RULES_EVENT } from './fsdb-events.ts'
import { TableGlyph } from './nav-glyphs.tsx'
import type { QueryField } from './query-menus.tsx'
import { loadTags } from './tag-catalog.ts'

export function WorkspacePermissionsSettings() {
  const [tables, setTables] = useState<CollectionInfo[]>([])
  const [selectedCollection, setSelectedCollection] = useState<string>(PAGES_COLLECTION_PATH)
  const [scope, setScope] = useState<'workspace' | 'personal'>('workspace')
  const [viewerAccountId, setViewerAccountId] = useState('')
  const [isExternal, setIsExternal] = useState(false)
  const [wsRole, setWsRole] = useState('')
  const [schema, setSchema] = useState<CollectionSchema | undefined>(undefined)
  const [tagCatalog, setTagCatalog] = useState<CollectionSchemaPack[]>([])
  const [ruleCounts, setRuleCounts] = useState<Record<string, { workspace: number; personal: number }>>({})
  const [initialEditRuleId, setInitialEditRuleId] = useState<string | undefined>(undefined)

  useEffect(() => {
    let alive = true
    void Promise.all([
      apiFetch('/api/account/workspace-profile').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      apiFetch('/api/account/me').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      apiFetch('/api/account/active').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      apiFetch('/api/account/workspaces').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([wp, me, active, listed]) => {
      if (!alive) return
      const wpObj = wp as { accountId?: string } | null
      const meObj = me as { id?: string; account?: { id?: string } } | null
      const id = String(wpObj?.accountId ?? meObj?.id ?? meObj?.account?.id ?? '').trim()
      if (id) setViewerAccountId(id)
      const activeId = String((active as { workspaceId?: string } | null)?.workspaceId ?? '').trim()
      const workspaces = Array.isArray((listed as { workspaces?: unknown[] } | null)?.workspaces)
        ? ((listed as { workspaces: Array<{ id?: string; role?: string; memberKind?: string }> }).workspaces)
        : []
      const current = workspaces.find((w) => w.id === activeId)
      const ext = current?.memberKind === 'external' || current?.memberKind === 'guest'
      setIsExternal(ext)
      const role = String(current?.role ?? '').trim()
      setWsRole(role)
      if (ext) setScope('personal')
      else if (role && role !== 'owner' && role !== 'admin') setScope('personal')
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    void readJson<{ items?: CollectionInfo[] }>('/api/db/list?path=%2F')
      .then((res) => {
        if (!alive) return
        const raw = Array.isArray(res?.items) ? res.items : []
        const kPlus1 = raw.filter(
          (t) =>
            t.path &&
            t.path !== DATA_COLLECTION_PATH &&
            t.view?.sidebar !== false &&
            tableModeFor(t.path) === 'k-plus-1',
        )
        const { user, index, system } = sortDataCollections(kPlus1)
        const ordered = [...user, ...index, ...system]
        setTables(ordered)
        const pending = consumePendingAccessRulesOpen()
        if (pending?.collection && ordered.some((t) => t.path === pending.collection)) {
          setSelectedCollection(pending.collection)
          setInitialEditRuleId(pending.editRuleId)
        } else if (ordered.length && !ordered.some((t) => t.path === selectedCollection)) {
          setSelectedCollection(ordered[0].path)
        }
      })
      .catch(() => {})
    setTagCatalog(loadTags())
    return () => {
      alive = false
    }
  }, [])

  const refreshCounts = useCallback(async (list: CollectionInfo[]) => {
    if (!list.length) return
    const entries = await Promise.all(
      list.map(async (table) => {
        try {
          const res = await apiFetch(`/api/account/access-rules?collection=${encodeURIComponent(table.path)}`)
          if (!res.ok) return [table.path, { workspace: 0, personal: 0 }] as const
          const data = (await res.json()) as { rules?: Array<{ scope?: string; ownerTable?: string }> }
          const rows = Array.isArray(data.rules) ? data.rules : []
          let workspace = 0
          let personal = 0
          for (const r of rows) {
            if (r.scope === 'workspace' || r.ownerTable === 'workspace') workspace += 1
            else personal += 1
          }
          return [table.path, { workspace, personal }] as const
        } catch {
          return [table.path, { workspace: 0, personal: 0 }] as const
        }
      }),
    )
    setRuleCounts(Object.fromEntries(entries))
  }, [])

  useEffect(() => {
    if (!tables.length) return
    void refreshCounts(tables)
    const onChange = () => void refreshCounts(tables)
    window.addEventListener(FSDB_SHARES_CHANGE_EVENT, onChange)
    return () => window.removeEventListener(FSDB_SHARES_CHANGE_EVENT, onChange)
  }, [tables, refreshCounts])

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<OpenAccessRulesDetail>).detail
      if (!detail?.collection) return
      setSelectedCollection(detail.collection)
      setInitialEditRuleId(detail.editRuleId)
    }
    window.addEventListener(OPEN_ACCESS_RULES_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_ACCESS_RULES_EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (!selectedCollection) return
    let alive = true
    void readJson<{ schema?: CollectionSchema }>(`/api/db/stat?path=${encodeURIComponent(selectedCollection)}`)
      .then((res) => {
        if (!alive) return
        setSchema(res?.schema)
      })
      .catch(() => {
        if (alive) setSchema(undefined)
      })
    return () => {
      alive = false
    }
  }, [selectedCollection])

  const bodyKey = contentFieldKey(schema)
  const entries = useMemo(() => fieldEntries(schema), [schema])
  const filterFields = useMemo<QueryField[]>(
    () =>
      [
        ...entries,
        ...flattenTagColumns(tagCatalog).map((item) => ({
          key: item.key,
          kind: item.kind,
          field: { ...item.field, label: tagColumnTitle(item) },
        })),
      ].filter(
        (item) =>
          item.key !== bodyKey &&
          resolveFieldType(item.field) !== 'file' &&
          item.key !== 'shareScope' &&
          item.key !== 'shareRole' &&
          item.key !== 'ownerTable',
      ),
    [bodyKey, entries, tagCatalog],
  )

  const filterValueOptions = useCallback(
    (field: QueryField) => filterFieldValueOptions([], field.key, field.field, tagCatalog),
    [tagCatalog],
  )

  const isWorkspaceAdmin = !wsRole || wsRole === 'owner' || wsRole === 'admin'
  const effectiveScope: 'workspace' | 'personal' = isExternal ? 'personal' : scope

  return (
    <section className="settings-perm-section" data-testid="settings-permissions-panel">
      <div className="settings-perm-header">
        <div className="settings-perm-title-row">
          <div>
            <h2 className="settings-pane-title">数据权限</h2>
            <p className="settings-pane-lead settings-hint">
              按数据归属与数据类型，统一配置协作权限规则与公开只读链接。
            </p>
          </div>
          {!isExternal ? (
            <div className="settings-perm-scope" role="tablist" aria-label="数据归属">
              <button
                type="button"
                role="tab"
                aria-selected={effectiveScope === 'workspace'}
                className={`settings-perm-scope-btn${effectiveScope === 'workspace' ? ' is-on' : ''}`}
                data-testid="settings-perm-scope-workspace"
                onClick={() => {
                  setScope('workspace')
                  setInitialEditRuleId(undefined)
                }}
              >
                <UsersIcon aria-hidden className="size-3.5" />
                <span>空间数据</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={effectiveScope === 'personal'}
                className={`settings-perm-scope-btn${effectiveScope === 'personal' ? ' is-on' : ''}`}
                data-testid="settings-perm-scope-personal"
                onClick={() => {
                  setScope('personal')
                  setInitialEditRuleId(undefined)
                }}
              >
                <UserIcon aria-hidden className="size-3.5" />
                <span>个人数据</span>
              </button>
            </div>
          ) : null}
        </div>

        <div className="settings-perm-types" role="tablist" aria-label="数据类型">
          {tables.map((table) => {
            const label = table.view?.title ?? table.label
            const active = table.path === selectedCollection
            const count = ruleCounts[table.path]?.[effectiveScope] ?? 0
            return (
              <button
                key={table.path}
                type="button"
                role="tab"
                aria-selected={active}
                className={`settings-perm-type-pill${active ? ' is-on' : ''}`}
                data-testid={`settings-perm-type-${table.path}`}
                onClick={() => {
                  setSelectedCollection(table.path)
                  setInitialEditRuleId(undefined)
                }}
              >
                <span className="settings-perm-type-icon" aria-hidden>
                  <TableGlyph icon={table.view?.icon} />
                </span>
                <span>{label}</span>
                {count > 0 ? <span className="settings-perm-type-count">{count}</span> : null}
              </button>
            )
          })}
        </div>

        {effectiveScope === 'workspace' && !isWorkspaceAdmin ? (
          <div className="settings-perm-readonly-note">
            当前为只读预览：仅空间所有者或管理员可新建和修改「空间数据」权限规则；切换到「个人数据」可自由管理你自己的分享规则。
          </div>
        ) : null}
      </div>

      <div className="settings-perm-body">
        {selectedCollection ? (
          <AccessRulesPanel
            collectionPath={selectedCollection}
            scope={effectiveScope}
            viewerAccountId={viewerAccountId}
            schema={schema}
            filterFields={filterFields}
            filterValueOptions={filterValueOptions}
            initialEditRuleId={initialEditRuleId}
          />
        ) : null}
      </div>
    </section>
  )
}
