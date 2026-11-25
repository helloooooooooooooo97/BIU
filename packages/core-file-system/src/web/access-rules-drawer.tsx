import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CheckIcon,
  LinkIcon,
  PencilSquareIcon,
  PlusIcon,
  ShieldCheckIcon,
  TrashIcon,
  UsersIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid'
import { apiFetch } from '@biu/biu-ui/api-client'
import { HeadlessDismiss } from '@biu/biu-ui/headless-dismiss'
import { OVERLAY_Z, overlayPortalRoot, overlayZ } from '@biu/biu-ui/overlay-portal'
import type { CollectionSchema } from '@biu/type-file-system'
import { countFilterRules, emptyFilterGroup, type FilterGroup } from '../query-logic.ts'
import { WORKSPACE_MEMBERS_COLLECTION_PATH } from './database-path.ts'
import { listCollection } from './db-client.ts'
import { FSDB_SHARES_CHANGE_EVENT, OPEN_ACCESS_RULES_EVENT, emitFsdbEvent } from './fsdb-events.ts'
import { FilterQueryMenu, type QueryField } from './query-menus.tsx'
import type { SavedView } from './saved-view.ts'

export type AccessRuleSubjectType = 'account' | 'workspace' | 'member_view'
export type AccessRuleRole = 'viewer' | 'editor' | 'manager'

export type AccessRuleGrantItem = {
  id?: string
  subjectType: AccessRuleSubjectType
  subjectId: string
  role: AccessRuleRole
  subjectName?: string
}

export type AccessRuleDisplaySnapshot = {
  mode?: string
  sorts?: unknown[]
  groupBy?: string
  groupConfig?: Record<string, unknown>
}

export type AccessRuleItem = {
  id: string
  workspaceId: string
  collection: string
  name: string
  createdBy: string
  filterTree: FilterGroup
  columns: string[] | null
  displaySnapshot: AccessRuleDisplaySnapshot | null
  enabled: boolean
  createdAt: number
  updatedAt: number
  grants: AccessRuleGrantItem[]
}

export type OpenAccessRulesDetail = {
  collection: string
  fromView?: SavedView | null
  editRuleId?: string
}

export function openAccessRulesDrawer(detail: OpenAccessRulesDetail) {
  window.dispatchEvent(new CustomEvent<OpenAccessRulesDetail>(OPEN_ACCESS_RULES_EVENT, { detail }))
}

const ROLE_LABELS: Record<AccessRuleRole, string> = {
  viewer: '可查看',
  editor: '可编辑',
  manager: '可管理',
}

const ROLE_CHOICES: AccessRuleRole[] = ['viewer', 'editor', 'manager']

function normalizeFilterTree(raw: unknown): FilterGroup {
  if (raw && typeof raw === 'object' && 'children' in raw && Array.isArray((raw as FilterGroup).children)) {
    return raw as FilterGroup
  }
  return emptyFilterGroup()
}

function snapshotFromView(view: SavedView | null | undefined): {
  name: string
  filterTree: FilterGroup
  columns: string[] | null
  displaySnapshot: AccessRuleDisplaySnapshot | null
} {
  if (!view) {
    return { name: '', filterTree: emptyFilterGroup(), columns: null, displaySnapshot: null }
  }
  const snap: AccessRuleDisplaySnapshot = {}
  if (view.mode) snap.mode = view.mode
  if (Array.isArray(view.sorts) && view.sorts.length > 0) snap.sorts = view.sorts
  if (view.groupBy) snap.groupBy = view.groupBy
  if (view.groupConfig && typeof view.groupConfig === 'object') {
    snap.groupConfig = view.groupConfig as Record<string, unknown>
  }
  return {
    name: view.name ? `${view.name} 分享规则` : '新建分享规则',
    filterTree: normalizeFilterTree(view.filterTree),
    columns: Array.isArray(view.columns) && view.columns.length > 0 ? [...view.columns] : null,
    displaySnapshot: Object.keys(snap).length > 0 ? snap : null,
  }
}

type MemberOption = {
  id: string
  name: string
  email?: string
}

type RuleDraft = {
  id: string | null
  name: string
  filterTree: FilterGroup
  restrictRows: boolean
  columns: string[] | null
  restrictColumns: boolean
  displaySnapshot: AccessRuleDisplaySnapshot | null
  enabled: boolean
  grants: AccessRuleGrantItem[]
}

export function AccessRulesButton({
  collectionPath,
  activeView,
  schema,
  filterFields = [],
  filterValueOptions,
  localOnly = false,
}: {
  collectionPath: string
  activeView?: SavedView
  schema?: CollectionSchema
  filterFields?: QueryField[]
  filterValueOptions?: (field: QueryField) => Array<{ value: string; label: string }>
  localOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [rules, setRules] = useState<AccessRuleItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [members, setMembers] = useState<MemberOption[]>([])
  const [draft, setDraft] = useState<RuleDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<{ matchCount: number; sampleRecords: Array<{ id: string; title: string }> } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [filterEditorOpen, setFilterEditorOpen] = useState(false)
  const [memberPickerOpen, setMemberPickerOpen] = useState(false)
  const [publicLink, setPublicLink] = useState<{ token: string; url: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const drawerRef = useRef<HTMLDivElement | null>(null)

  const schemaFields = useMemo(() => {
    if (!schema?.fields) return []
    return Object.entries(schema.fields)
      .filter(([key]) => !key.startsWith('$') && key !== 'shareScope' && key !== 'shareRole')
      .map(([key, spec]) => ({ key, label: String(spec.label || key) }))
  }, [schema])

  const loadRules = useCallback(async () => {
    if (localOnly) return
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch(`/api/account/access-rules?collection=${encodeURIComponent(collectionPath)}`)
      if (!res.ok) throw new Error('加载分享规则失败')
      const data = (await res.json()) as { rules?: AccessRuleItem[] }
      setRules(Array.isArray(data.rules) ? data.rules : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [collectionPath, localOnly])

  const loadMembers = useCallback(async () => {
    if (localOnly) return
    try {
      const listed = await listCollection({ path: WORKSPACE_MEMBERS_COLLECTION_PATH, limit: 200 })
      const items = (listed.items ?? [])
        .map((row) => ({
          id: String(row.accountId ?? row.id ?? '').trim(),
          name: String(row.name ?? row.title ?? row.email ?? '').trim(),
          email: typeof row.email === 'string' ? row.email : undefined,
        }))
        .filter((item) => item.id && item.name)
      setMembers(items)
    } catch {
      setMembers([])
    }
  }, [localOnly])

  useEffect(() => {
    if (!open) return
    void loadRules()
    void loadMembers()
  }, [open, loadRules, loadMembers])

  const openEditorForRule = useCallback((rule: AccessRuleItem) => {
    const normalizedTree = normalizeFilterTree(rule.filterTree)
    setDraft({
      id: rule.id,
      name: rule.name,
      filterTree: normalizedTree,
      restrictRows: countFilterRules(normalizedTree) > 0,
      columns: rule.columns ? [...rule.columns] : null,
      restrictColumns: Boolean(rule.columns && rule.columns.length > 0),
      displaySnapshot: rule.displaySnapshot,
      enabled: rule.enabled,
      grants: rule.grants.map((g) => ({ ...g })),
    })
    setFilterEditorOpen(false)
    setMemberPickerOpen(false)
    setPublicLink(null)
    void apiFetch(
      `/api/db/shares?kind=rule&collection=${encodeURIComponent(collectionPath)}&ruleId=${encodeURIComponent(rule.id)}`,
    )
      .then(async (res) => {
        if (!res.ok) return
        const data = (await res.json()) as { share?: { token: string; url: string } | null }
        setPublicLink(data.share ?? null)
      })
      .catch(() => {})
  }, [collectionPath])

  const startNewDraft = useCallback((fromView?: SavedView | null) => {
    const snap = snapshotFromView(fromView)
    setDraft({
      id: null,
      name: snap.name || '新建分享规则',
      filterTree: snap.filterTree,
      restrictRows: countFilterRules(snap.filterTree) > 0,
      columns: snap.columns,
      restrictColumns: Boolean(snap.columns && snap.columns.length > 0),
      displaySnapshot: snap.displaySnapshot,
      enabled: true,
      grants: [],
    })
    setFilterEditorOpen(false)
    setMemberPickerOpen(false)
    setPublicLink(null)
  }, [])

  // 监听来自 ViewSettingsMenu（「按此视图条件分享数据…」）或 SharePopover（「管理规则」）的打开事件
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<OpenAccessRulesDetail>).detail
      if (!detail || detail.collection !== collectionPath) return
      setOpen(true)
      if (detail.fromView) {
        startNewDraft(detail.fromView)
      } else if (detail.editRuleId) {
        const hit = rules.find((r) => r.id === detail.editRuleId)
        if (hit) openEditorForRule(hit)
      }
    }
    window.addEventListener(OPEN_ACCESS_RULES_EVENT, handler)
    return () => window.removeEventListener(OPEN_ACCESS_RULES_EVENT, handler)
  }, [collectionPath, rules, startNewDraft, openEditorForRule])

  // 实时命中预览（严格只算当前用户可管理的记录）
  useEffect(() => {
    if (!open || !draft) {
      setPreview(null)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setPreviewLoading(true)
      try {
        const res = await apiFetch('/api/db/access-rules/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            collection: collectionPath,
            filterTree: draft.restrictRows ? draft.filterTree : emptyFilterGroup(),
            limit: 5,
          }),
        })
        if (!res.ok || cancelled) return
        const data = (await res.json()) as { matchCount?: number; sampleRecords?: Array<{ id: string; title: string }> }
        if (!cancelled) {
          setPreview({
            matchCount: Number(data.matchCount ?? 0),
            sampleRecords: Array.isArray(data.sampleRecords) ? data.sampleRecords : [],
          })
        }
      } catch {
        if (!cancelled) setPreview(null)
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    }, 180)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, draft, collectionPath])

  const saveDraft = async () => {
    if (!draft) return
    const trimmedName = draft.name.trim()
    if (!trimmedName) {
      setError('请填写规则名称')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        collection: collectionPath,
        name: trimmedName,
        filterTree: draft.restrictRows ? draft.filterTree : emptyFilterGroup(),
        columns: draft.restrictColumns && draft.columns?.length ? draft.columns : null,
        displaySnapshot: draft.displaySnapshot,
        enabled: draft.enabled,
        grants: draft.grants.map((g) => ({
          subjectType: g.subjectType,
          subjectId: g.subjectId,
          role: g.role,
        })),
      }
      const res = await apiFetch(
        draft.id ? `/api/account/access-rules/${encodeURIComponent(draft.id)}` : '/api/account/access-rules',
        {
          method: draft.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(errBody.error || '保存失败')
      }
      await loadRules()
      emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
      setDraft(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const toggleRuleEnabled = async (rule: AccessRuleItem) => {
    try {
      const res = await apiFetch(`/api/account/access-rules/${encodeURIComponent(rule.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !rule.enabled }),
      })
      if (res.ok) {
        await loadRules()
        emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
      }
    } catch {
      /* ignore */
    }
  }

  const deleteRule = async (rule: AccessRuleItem) => {
    try {
      await apiFetch('/api/db/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'rule', collection: collectionPath, ruleId: rule.id, enabled: false }),
      }).catch(() => {})
      const res = await apiFetch(`/api/account/access-rules/${encodeURIComponent(rule.id)}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        if (draft?.id === rule.id) setDraft(null)
        await loadRules()
        emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
      }
    } catch {
      /* ignore */
    }
  }

  const togglePublicLink = async () => {
    if (!draft?.id) return
    const enable = !publicLink
    try {
      const res = await apiFetch('/api/db/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'rule',
          collection: collectionPath,
          ruleId: draft.id,
          enabled: enable,
        }),
      })
      if (!res.ok) return
      const data = (await res.json()) as { share?: { token: string; url: string } | null }
      setPublicLink(data.share ?? null)
      emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
    } catch {
      /* ignore */
    }
  }

  const copyPublicUrl = async () => {
    if (!publicLink?.url) return
    try {
      await navigator.clipboard.writeText(publicLink.url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  if (localOnly) return null

  const activeCount = rules.filter((r) => r.enabled).length
  const hasWorkspaceGrant = draft?.grants.some((g) => g.subjectType === 'workspace') ?? false

  return (
    <>
      <button
        type="button"
        className={`chat-view-header-expand${open ? ' is-active' : ''}`}
        title="分享规则（仅作用于我可管理的数据）"
        aria-label="分享规则"
        data-testid="access-rules-trigger"
        onClick={() => setOpen((prev) => !prev)}
      >
        <ShieldCheckIcon aria-hidden className="size-4" />
        {activeCount > 0 ? <span className="ml-0.5 text-[11px] font-medium">{activeCount}</span> : null}
      </button>

      {open
        ? createPortal(
            <HeadlessDismiss onDismiss={() => setOpen(false)} insideRef={drawerRef}>
              <div
                ref={drawerRef}
                data-testid="access-rules-drawer"
                style={{
                  position: 'fixed',
                  top: 48,
                  right: 12,
                  bottom: 12,
                  width: 420,
                  maxWidth: 'calc(100vw - 24px)',
                  zIndex: overlayZ(OVERLAY_Z.popover),
                  background: 'var(--bg-elevated, var(--bg, #fff))',
                  border: '1px solid var(--border, rgba(0,0,0,0.1))',
                  borderRadius: 12,
                  boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderBottom: '1px solid var(--border, rgba(0,0,0,0.08))',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 14 }}>
                    <ShieldCheckIcon aria-hidden className="size-4" />
                    <span>{draft ? (draft.id ? '编辑分享规则' : '新建分享规则') : '我的分享规则'}</span>
                  </div>
                  <button
                    type="button"
                    className="chat-view-header-expand"
                    aria-label="关闭"
                    onClick={() => (draft ? setDraft(null) : setOpen(false))}
                  >
                    <XMarkIcon aria-hidden className="size-4" />
                  </button>
                </div>

                <div
                  style={{
                    padding: '8px 14px',
                    fontSize: 12,
                    color: 'var(--text-muted, #666)',
                    background: 'var(--bg-subtle, rgba(0,0,0,0.03))',
                    borderBottom: '1px solid var(--border, rgba(0,0,0,0.06))',
                  }}
                >
                  作用域：仅对你创建的，或你拥有「管理」权限的数据生效；与视图展示完全独立。
                </div>

                {error ? (
                  <div style={{ padding: '8px 14px', fontSize: 12, color: '#dc2626' }}>{error}</div>
                ) : null}

                <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {!draft ? (
                    <>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          data-testid="access-rules-new"
                          onClick={() => startNewDraft(null)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '6px 10px',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 500,
                            background: 'var(--accent, #111)',
                            color: 'var(--accent-fg, #fff)',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <PlusIcon aria-hidden className="size-3.5" />
                          <span>新建分享规则</span>
                        </button>
                        {activeView ? (
                          <button
                            type="button"
                            data-testid="access-rules-from-view"
                            onClick={() => startNewDraft(activeView)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '6px 10px',
                              borderRadius: 8,
                              fontSize: 12,
                              background: 'transparent',
                              color: 'var(--text, inherit)',
                              border: '1px solid var(--border, rgba(0,0,0,0.14))',
                              cursor: 'pointer',
                            }}
                          >
                            <span>按当前视图条件新建</span>
                          </button>
                        ) : null}
                      </div>

                      {loading ? (
                        <div style={{ fontSize: 12, color: 'var(--text-muted, #666)' }}>加载中…</div>
                      ) : rules.length === 0 ? (
                        <div
                          style={{
                            padding: '24px 12px',
                            textAlign: 'center',
                            fontSize: 12,
                            color: 'var(--text-muted, #666)',
                          }}
                        >
                          暂无分享规则。你可以按条件批量分享自己可管理的数据，修改视图不会影响已生效的规则。
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {rules.map((rule) => {
                            const rowRulesCount = countFilterRules(normalizeFilterTree(rule.filterTree))
                            return (
                              <div
                                key={rule.id}
                                data-testid={`access-rule-card-${rule.id}`}
                                style={{
                                  padding: '10px 12px',
                                  borderRadius: 10,
                                  border: '1px solid var(--border, rgba(0,0,0,0.1))',
                                  opacity: rule.enabled ? 1 : 0.6,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 6,
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                  <span style={{ fontWeight: 600, fontSize: 13 }}>{rule.name}</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <button
                                      type="button"
                                      role="switch"
                                      aria-checked={rule.enabled}
                                      aria-label={rule.enabled ? '停用规则' : '启用规则'}
                                      className={`fsdb-share-toggle${rule.enabled ? ' is-on' : ''}`}
                                      onClick={() => void toggleRuleEnabled(rule)}
                                    >
                                      <span />
                                    </button>
                                    <button
                                      type="button"
                                      className="chat-view-header-expand"
                                      title="编辑规则"
                                      onClick={() => openEditorForRule(rule)}
                                    >
                                      <PencilSquareIcon aria-hidden className="size-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      className="chat-view-header-expand"
                                      title="删除规则"
                                      onClick={() => void deleteRule(rule)}
                                    >
                                      <TrashIcon aria-hidden className="size-3.5" />
                                    </button>
                                  </div>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted, #666)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  <span>{rowRulesCount > 0 ? `${rowRulesCount} 条行条件` : '全部我可管理的数据'}</span>
                                  <span>·</span>
                                  <span>{rule.columns?.length ? `仅 ${rule.columns.length} 个字段` : '全部字段'}</span>
                                  <span>·</span>
                                  <span>{rule.grants.length > 0 ? `${rule.grants.length} 个受众` : '仅外链/未指定成员'}</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                        <span style={{ fontWeight: 500 }}>规则名称</span>
                        <input
                          type="text"
                          value={draft.name}
                          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                          placeholder="例如：Q3 客户交付资料"
                          style={{
                            padding: '6px 10px',
                            borderRadius: 8,
                            border: '1px solid var(--border, rgba(0,0,0,0.14))',
                            background: 'transparent',
                            fontSize: 13,
                          }}
                        />
                      </label>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 500 }}>记录范围（行条件）</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => setDraft({ ...draft, restrictRows: false, filterTree: emptyFilterGroup() })}
                            style={{
                              padding: '4px 10px',
                              borderRadius: 999,
                              fontSize: 12,
                              border: '1px solid var(--border, rgba(0,0,0,0.14))',
                              background: !draft.restrictRows ? 'var(--accent, #111)' : 'transparent',
                              color: !draft.restrictRows ? 'var(--accent-fg, #fff)' : 'inherit',
                              cursor: 'pointer',
                            }}
                          >
                            全部我可管理的记录
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDraft({ ...draft, restrictRows: true })
                              setFilterEditorOpen(true)
                            }}
                            style={{
                              padding: '4px 10px',
                              borderRadius: 999,
                              fontSize: 12,
                              border: '1px solid var(--border, rgba(0,0,0,0.14))',
                              background: draft.restrictRows ? 'var(--accent, #111)' : 'transparent',
                              color: draft.restrictRows ? 'var(--accent-fg, #fff)' : 'inherit',
                              cursor: 'pointer',
                            }}
                          >
                            满足筛选条件（{countFilterRules(draft.filterTree)}）
                          </button>
                        </div>
                        {draft.restrictRows && filterEditorOpen && filterFields.length > 0 && filterValueOptions ? (
                          <div
                            style={{
                              border: '1px solid var(--border, rgba(0,0,0,0.1))',
                              borderRadius: 8,
                              padding: 8,
                            }}
                          >
                            <FilterQueryMenu
                              tree={draft.filterTree}
                              fields={filterFields}
                              valueOptions={filterValueOptions}
                              onChange={(next) => setDraft({ ...draft, filterTree: next })}
                            />
                          </div>
                        ) : null}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 500 }}>字段范围（列白名单）</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => setDraft({ ...draft, restrictColumns: false, columns: null })}
                            style={{
                              padding: '4px 10px',
                              borderRadius: 999,
                              fontSize: 12,
                              border: '1px solid var(--border, rgba(0,0,0,0.14))',
                              background: !draft.restrictColumns ? 'var(--accent, #111)' : 'transparent',
                              color: !draft.restrictColumns ? 'var(--accent-fg, #fff)' : 'inherit',
                              cursor: 'pointer',
                            }}
                          >
                            全部字段
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDraft({
                                ...draft,
                                restrictColumns: true,
                                columns: draft.columns?.length ? draft.columns : schemaFields.slice(0, 4).map((f) => f.key),
                              })
                            }
                            style={{
                              padding: '4px 10px',
                              borderRadius: 999,
                              fontSize: 12,
                              border: '1px solid var(--border, rgba(0,0,0,0.14))',
                              background: draft.restrictColumns ? 'var(--accent, #111)' : 'transparent',
                              color: draft.restrictColumns ? 'var(--accent-fg, #fff)' : 'inherit',
                              cursor: 'pointer',
                            }}
                          >
                            仅勾选字段
                          </button>
                        </div>
                        {draft.restrictColumns ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {schemaFields.map((field) => {
                              const checked = Boolean(draft.columns?.includes(field.key))
                              return (
                                <button
                                  key={field.key}
                                  type="button"
                                  onClick={() => {
                                    const current = new Set(draft.columns ?? [])
                                    if (current.has(field.key)) current.delete(field.key)
                                    else current.add(field.key)
                                    setDraft({ ...draft, columns: [...current] })
                                  }}
                                  style={{
                                    padding: '3px 8px',
                                    borderRadius: 6,
                                    fontSize: 11,
                                    border: '1px solid var(--border, rgba(0,0,0,0.14))',
                                    background: checked ? 'var(--accent, #111)' : 'transparent',
                                    color: checked ? 'var(--accent-fg, #fff)' : 'inherit',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {field.label}
                                </button>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>

                      <div
                        data-testid="access-rule-preview"
                        style={{
                          padding: '8px 10px',
                          borderRadius: 8,
                          background: 'var(--bg-subtle, rgba(0,0,0,0.03))',
                          fontSize: 12,
                        }}
                      >
                        <div style={{ fontWeight: 500 }}>
                          {previewLoading
                            ? '正在计算命中范围…'
                            : preview
                              ? `当前命中 ${preview.matchCount} 条我可管理的记录`
                              : '命中预览不可用'}
                        </div>
                        {preview && preview.sampleRecords.length > 0 ? (
                          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted, #666)' }}>
                            示例：{preview.sampleRecords.map((r) => r.title).join('、')}
                            {preview.matchCount > preview.sampleRecords.length ? ' 等' : ''}
                          </div>
                        ) : null}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 12, fontWeight: 500 }}>分享给谁</span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {!hasWorkspaceGrant ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setDraft({
                                    ...draft,
                                    grants: [
                                      ...draft.grants,
                                      { subjectType: 'workspace', subjectId: 'workspace', role: 'viewer', subjectName: '空间全员' },
                                    ],
                                  })
                                }
                                style={{
                                  fontSize: 11,
                                  padding: '3px 8px',
                                  borderRadius: 6,
                                  border: '1px solid var(--border, rgba(0,0,0,0.14))',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                }}
                              >
                                + 空间全员
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setMemberPickerOpen((v) => !v)}
                              style={{
                                fontSize: 11,
                                padding: '3px 8px',
                                borderRadius: 6,
                                border: '1px solid var(--border, rgba(0,0,0,0.14))',
                                background: 'transparent',
                                cursor: 'pointer',
                              }}
                            >
                              + 添加成员
                            </button>
                          </div>
                        </div>

                        {memberPickerOpen ? (
                          <div
                            style={{
                              maxHeight: 120,
                              overflowY: 'auto',
                              border: '1px solid var(--border, rgba(0,0,0,0.12))',
                              borderRadius: 8,
                              padding: 4,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 2,
                            }}
                          >
                            {members
                              .filter((m) => !draft.grants.some((g) => g.subjectType === 'account' && g.subjectId === m.id))
                              .map((member) => (
                                <button
                                  key={member.id}
                                  type="button"
                                  onClick={() => {
                                    setDraft({
                                      ...draft,
                                      grants: [
                                        ...draft.grants,
                                        { subjectType: 'account', subjectId: member.id, role: 'viewer', subjectName: member.name },
                                      ],
                                    })
                                    setMemberPickerOpen(false)
                                  }}
                                  style={{
                                    textAlign: 'left',
                                    padding: '5px 8px',
                                    borderRadius: 6,
                                    fontSize: 12,
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {member.name}
                                </button>
                              ))}
                          </div>
                        ) : null}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {draft.grants.map((grant, idx) => (
                            <div
                              key={`${grant.subjectType}:${grant.subjectId}`}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 8,
                                padding: '6px 8px',
                                borderRadius: 8,
                                border: '1px solid var(--border, rgba(0,0,0,0.08))',
                                fontSize: 12,
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <UsersIcon aria-hidden className="size-3.5" />
                                <span>{grant.subjectType === 'workspace' ? '空间全员' : grant.subjectName || grant.subjectId}</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                {ROLE_CHOICES.map((r) => (
                                  <button
                                    key={r}
                                    type="button"
                                    onClick={() => {
                                      const next = [...draft.grants]
                                      next[idx] = { ...grant, role: r }
                                      setDraft({ ...draft, grants: next })
                                    }}
                                    style={{
                                      padding: '2px 6px',
                                      borderRadius: 6,
                                      fontSize: 11,
                                      border: '1px solid var(--border, rgba(0,0,0,0.12))',
                                      background: grant.role === r ? 'var(--accent, #111)' : 'transparent',
                                      color: grant.role === r ? 'var(--accent-fg, #fff)' : 'inherit',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    {ROLE_LABELS[r]}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  aria-label="移除受众"
                                  className="chat-view-header-expand"
                                  onClick={() => setDraft({ ...draft, grants: draft.grants.filter((_, i) => i !== idx) })}
                                >
                                  <XMarkIcon aria-hidden className="size-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {draft.id ? (
                        <div
                          style={{
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: '1px solid var(--border, rgba(0,0,0,0.1))',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <LinkIcon aria-hidden className="size-3.5" />
                              <span>公开只读外链（按本规则行/列过滤）</span>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={Boolean(publicLink)}
                              className={`fsdb-share-toggle${publicLink ? ' is-on' : ''}`}
                              onClick={() => void togglePublicLink()}
                            >
                              <span />
                            </button>
                          </div>
                          {publicLink ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <input
                                readOnly
                                value={publicLink.url}
                                style={{
                                  flex: 1,
                                  fontSize: 11,
                                  padding: '4px 8px',
                                  borderRadius: 6,
                                  border: '1px solid var(--border, rgba(0,0,0,0.12))',
                                  background: 'transparent',
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => void copyPublicUrl()}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '4px 8px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  border: '1px solid var(--border, rgba(0,0,0,0.14))',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                }}
                              >
                                {copied ? <CheckIcon aria-hidden className="size-3.5" /> : null}
                                <span>{copied ? '已复制' : '复制'}</span>
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>

                {draft ? (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderTop: '1px solid var(--border, rgba(0,0,0,0.08))',
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: 8,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setDraft(null)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        fontSize: 12,
                        border: '1px solid var(--border, rgba(0,0,0,0.14))',
                        background: 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      data-testid="access-rule-save"
                      onClick={() => void saveDraft()}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 500,
                        background: 'var(--accent, #111)',
                        color: 'var(--accent-fg, #fff)',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {saving ? '保存中…' : '保存规则'}
                    </button>
                  </div>
                ) : null}
              </div>
            </HeadlessDismiss>,
            overlayPortalRoot() ?? document.body,
          )
        : null}
    </>
  )
}
