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

export type AccessRuleSubjectType = 'account' | 'workspace' | 'group'
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

type GroupOption = {
  id: string
  name: string
  kind?: 'static' | 'dynamic'
  memberCount?: number
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
  wantPublicLink: boolean
  grants: AccessRuleGrantItem[]
}

export function AccessRulesButton({
  collectionPath,
  activeView,
  schema,
  filterFields = [],
  filterValueOptions,
  localOnly = false,
  buttonClassName = 'chat-view-header-expand',
}: {
  collectionPath: string
  activeView?: SavedView
  schema?: CollectionSchema
  filterFields?: QueryField[]
  filterValueOptions?: (field: QueryField) => Array<{ value: string; label: string }>
  localOnly?: boolean
  buttonClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [rules, setRules] = useState<AccessRuleItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [members, setMembers] = useState<MemberOption[]>([])
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [draft, setDraft] = useState<RuleDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [quickLinkBusy, setQuickLinkBusy] = useState(false)
  const [preview, setPreview] = useState<{ matchCount: number; sampleRecords: Array<{ id: string; title: string }> } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [filterEditorOpen, setFilterEditorOpen] = useState(false)
  const [memberPickerOpen, setMemberPickerOpen] = useState(false)
  const [publicLink, setPublicLink] = useState<{ token: string; url: string } | null>(null)
  const [copiedKey, setCopiedKey] = useState('')
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const drawerRef = useRef<HTMLDivElement | null>(null)

  const HIDDEN_SCHEMA_KEYS = new Set([
    'id',
    'parentId',
    'dependsOn',
    'emoji',
    'banner',
    'actions',
    'contentViews',
    'propViews',
    'globalViews',
    'views',
    'layouts',
    'shareScope',
    'shareRole',
  ])

  const schemaFields = useMemo(() => {
    if (!schema?.fields) return []
    return Object.entries(schema.fields)
      .filter(([key, spec]) => {
        if (key.startsWith('$') || HIDDEN_SCHEMA_KEYS.has(key)) return false
        const t = String((spec as { type?: unknown }).type ?? '')
        if (t === 'action' || t === 'views' || t === 'internal') return false
        return true
      })
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
    try {
      const res = await apiFetch('/api/account/groups')
      if (res.ok) {
        const data = (await res.json()) as { groups?: GroupOption[] }
        setGroups(Array.isArray(data.groups) ? data.groups : [])
      } else {
        setGroups([])
      }
    } catch {
      setGroups([])
    }
  }, [localOnly])

  useEffect(() => {
    if (localOnly) return
    void loadRules()
    const onChange = () => void loadRules()
    window.addEventListener(FSDB_SHARES_CHANGE_EVENT, onChange)
    return () => window.removeEventListener(FSDB_SHARES_CHANGE_EVENT, onChange)
  }, [localOnly, loadRules])

  useEffect(() => {
    if (!open) return
    void loadRules()
    void loadMembers()
  }, [open, loadRules, loadMembers])

  const openEditorForRule = useCallback(
    (rule: AccessRuleItem) => {
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
        wantPublicLink: false,
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
          if (data.share) {
            setDraft((prev) => (prev && prev.id === rule.id ? { ...prev, wantPublicLink: true } : prev))
          }
        })
        .catch(() => {})
    },
    [collectionPath],
  )

  const startNewDraft = useCallback((fromView?: SavedView | null, wantPublicLink = false) => {
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
      wantPublicLink,
      grants: [],
    })
    setFilterEditorOpen(false)
    setMemberPickerOpen(false)
    setPublicLink(null)
  }, [])

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

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey((prev) => (prev === key ? '' : prev)), 1600)
    } catch {
      /* ignore */
    }
  }

  // 一键按当前视图生成公开/局域网只读链接并直接进入规则编辑态展示链接
  const quickCreatePublicLinkFromView = async () => {
    setQuickLinkBusy(true)
    setError('')
    try {
      const snap = snapshotFromView(activeView)
      const createRes = await apiFetch('/api/account/access-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection: collectionPath,
          name: snap.name || '局域网只读链接',
          filterTree: snap.filterTree,
          columns: snap.columns,
          displaySnapshot: snap.displaySnapshot,
          enabled: true,
          grants: [],
        }),
      })
      if (!createRes.ok) {
        const errBody = (await createRes.json().catch(() => ({}))) as { error?: string }
        throw new Error(errBody.error || '创建规则失败')
      }
      const { rule } = (await createRes.json()) as { rule: AccessRuleItem }
      const shareRes = await apiFetch('/api/db/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'rule',
          collection: collectionPath,
          ruleId: rule.id,
          enabled: true,
        }),
      })
      const shareData = shareRes.ok
        ? ((await shareRes.json()) as { share?: { token: string; url: string } | null })
        : { share: null }
      await loadRules()
      emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
      openEditorForRule(rule)
      if (shareData.share) {
        setPublicLink(shareData.share)
        void copyText('editor-url', shareData.share.url)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成链接失败')
    } finally {
      setQuickLinkBusy(false)
    }
  }

  const copyOrCreateRuleLink = async (rule: AccessRuleItem) => {
    try {
      const res = await apiFetch('/api/db/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'rule',
          collection: collectionPath,
          ruleId: rule.id,
          enabled: true,
        }),
      })
      if (!res.ok) return
      const data = (await res.json()) as { share?: { token: string; url: string } | null }
      if (data.share?.url) {
        await copyText(`rule:${rule.id}`, data.share.url)
        emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
      }
    } catch {
      /* ignore */
    }
  }

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
      const savedData = (await res.json()) as { rule?: AccessRuleItem }
      const savedRule = savedData.rule
      if (savedRule && draft.wantPublicLink && !publicLink) {
        const shareRes = await apiFetch('/api/db/shares', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'rule',
            collection: collectionPath,
            ruleId: savedRule.id,
            enabled: true,
          }),
        })
        if (shareRes.ok) {
          const shareData = (await shareRes.json()) as { share?: { token: string; url: string } | null }
          if (shareData.share) {
            await loadRules()
            emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
            openEditorForRule(savedRule)
            setPublicLink(shareData.share)
            return
          }
        }
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
    if (!draft) return
    if (!draft.id) {
      setDraft({ ...draft, wantPublicLink: !draft.wantPublicLink })
      return
    }
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
      setDraft({ ...draft, wantPublicLink: Boolean(data.share) })
      emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
    } catch {
      /* ignore */
    }
  }

  if (localOnly) return null

  const hasActiveRules = rules.some((r) => r.enabled)
  const hasWorkspaceGrant = draft?.grants.some((g) => g.subjectType === 'workspace') ?? false

  const primaryBtnStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    padding: '6px 12px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    background: 'var(--biu-color-emphasis)',
    color: 'var(--biu-color-on-emphasis)',
    border: 'none',
    cursor: 'pointer',
  } as const

  const secondaryBtnStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    padding: '6px 10px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 500,
    background: 'var(--biu-color-bg-input)',
    color: 'var(--biu-color-text)',
    border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
    cursor: 'pointer',
  } as const

  const pillBtnStyle = (active: boolean) =>
    ({
      padding: '4px 10px',
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 500,
      border: active ? 'var(--biu-stroke-width) solid var(--biu-color-emphasis)' : 'var(--biu-stroke-width) solid var(--biu-color-border)',
      background: active ? 'var(--biu-color-emphasis)' : 'var(--biu-color-bg-input)',
      color: active ? 'var(--biu-color-on-emphasis)' : 'var(--biu-color-text)',
      cursor: 'pointer',
    }) as const

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${buttonClassName}${open || hasActiveRules ? ' is-active' : ''}`}
        style={hasActiveRules ? { color: 'var(--biu-color-emphasis)' } : undefined}
        title={hasActiveRules ? '已启用分享规则' : '分享数据与规则'}
        aria-label="分享数据与规则"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="access-rules-trigger"
        onClick={() => setOpen((prev) => !prev)}
      >
        <ShieldCheckIcon aria-hidden className="size-4" />
      </button>

      {open
        ? createPortal(
            <HeadlessDismiss
              onDismiss={() => setOpen(false)}
              inside={(node) =>
                node instanceof Node &&
                (Boolean(triggerRef.current?.contains(node)) ||
                  Boolean(drawerRef.current?.contains(node)) ||
                  (node instanceof Element &&
                    Boolean(
                      node.closest(
                        '.db-search-menu, .fsdb-cellselect-menu, .fsdb-query-drag-overlay, [data-fsdb-sort-overlay]',
                      ),
                    )))
              }
            >
              <div
                ref={drawerRef}
                className="fsdb-page"
                data-testid="access-rules-drawer"
                style={{
                  position: 'fixed',
                  top: 48,
                  right: 14,
                  bottom: 68,
                  width: 520,
                  maxWidth: 'calc(100vw - 28px)',
                  zIndex: overlayZ(OVERLAY_Z.popover),
                  background: 'var(--biu-color-bg-popover)',
                  color: 'var(--biu-color-text)',
                  border: 'var(--biu-stroke-width) solid var(--biu-color-border-popover)',
                  borderRadius: 'var(--biu-radius-popover, 12px)',
                  boxShadow: 'var(--biu-shadow-popover)',
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
                    borderBottom: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 14, color: 'var(--biu-color-text)' }}>
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
                    lineHeight: 1.45,
                    color: 'var(--biu-color-text-muted)',
                    background: 'var(--biu-color-bg-hover)',
                    borderBottom: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                  }}
                >
                  作用域：仅对你创建的，或你拥有「管理」权限的数据生效；与视图展示完全独立。
                </div>

                {error ? (
                  <div style={{ padding: '8px 14px', fontSize: 12, color: 'var(--biu-color-danger)' }}>{error}</div>
                ) : null}

                <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {!draft ? (
                    <>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          data-testid="access-rules-new"
                          onClick={() => startNewDraft(null)}
                          style={primaryBtnStyle}
                        >
                          <PlusIcon aria-hidden className="size-3.5" />
                          <span>新建分享规则</span>
                        </button>
                        {activeView ? (
                          <button
                            type="button"
                            data-testid="access-rules-from-view"
                            onClick={() => startNewDraft(activeView)}
                            style={secondaryBtnStyle}
                          >
                            <span>按当前视图新建</span>
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={quickLinkBusy}
                          data-testid="access-rules-quick-link"
                          onClick={() => void quickCreatePublicLinkFromView()}
                          style={secondaryBtnStyle}
                        >
                          <LinkIcon aria-hidden className="size-3.5" />
                          <span>{quickLinkBusy ? '生成中…' : '一键生成只读链接'}</span>
                        </button>
                      </div>

                      {loading ? (
                        <div style={{ fontSize: 12, color: 'var(--biu-color-text-muted)' }}>加载中…</div>
                      ) : rules.length === 0 ? (
                        <div
                          style={{
                            padding: '24px 12px',
                            textAlign: 'center',
                            fontSize: 12,
                            lineHeight: 1.5,
                            color: 'var(--biu-color-text-subtle)',
                          }}
                        >
                          暂无分享规则。你可以按条件批量分享给成员，或点击上方「一键生成只读链接」发到局域网/外部。
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {rules.map((rule) => {
                            const rowRulesCount = countFilterRules(normalizeFilterTree(rule.filterTree))
                            const linkCopied = copiedKey === `rule:${rule.id}`
                            return (
                              <div
                                key={rule.id}
                                data-testid={`access-rule-card-${rule.id}`}
                                style={{
                                  padding: '10px 12px',
                                  borderRadius: 10,
                                  background: 'var(--biu-color-bg-input)',
                                  border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                                  opacity: rule.enabled ? 1 : 0.58,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 6,
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--biu-color-text)' }}>{rule.name}</span>
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
                                      title={linkCopied ? '已复制只读链接' : '生成并复制只读链接'}
                                      onClick={() => void copyOrCreateRuleLink(rule)}
                                    >
                                      {linkCopied ? <CheckIcon aria-hidden className="size-3.5" /> : <LinkIcon aria-hidden className="size-3.5" />}
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
                                <div style={{ fontSize: 11.5, color: 'var(--biu-color-text-muted)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12 }}>
                        <span style={{ fontWeight: 600, color: 'var(--biu-color-text)' }}>规则名称</span>
                        <input
                          type="text"
                          value={draft.name}
                          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                          placeholder="例如：Q3 客户交付资料"
                          style={{
                            padding: '7px 10px',
                            borderRadius: 8,
                            border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                            background: 'var(--biu-color-bg-input)',
                            color: 'var(--biu-color-text)',
                            fontSize: 13,
                            outline: 'none',
                          }}
                        />
                      </label>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--biu-color-text)' }}>记录范围（行条件）</span>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => setDraft({ ...draft, restrictRows: false, filterTree: emptyFilterGroup() })}
                            style={pillBtnStyle(!draft.restrictRows)}
                          >
                            全部我可管理的记录
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDraft({ ...draft, restrictRows: true })
                              setFilterEditorOpen(true)
                            }}
                            style={pillBtnStyle(draft.restrictRows)}
                          >
                            满足筛选条件（{countFilterRules(draft.filterTree)}）
                          </button>
                        </div>
                        {draft.restrictRows && filterEditorOpen && filterFields.length > 0 && filterValueOptions ? (
                          <div
                            className="fsdb-vset-body"
                            style={{
                              border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                              background: 'var(--biu-color-bg-input)',
                              borderRadius: 8,
                              padding: '8px 10px',
                              overflow: 'visible',
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
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--biu-color-text)' }}>字段范围（列白名单）</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => setDraft({ ...draft, restrictColumns: false, columns: null })}
                            style={pillBtnStyle(!draft.restrictColumns)}
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
                            style={pillBtnStyle(draft.restrictColumns)}
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
                                  style={pillBtnStyle(checked)}
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
                          background: 'var(--biu-color-bg-hover)',
                          border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                          fontSize: 12,
                          color: 'var(--biu-color-text)',
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
                          <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--biu-color-text-muted)' }}>
                            示例：{preview.sampleRecords.map((r) => r.title).join('、')}
                            {preview.matchCount > preview.sampleRecords.length ? ' 等' : ''}
                          </div>
                        ) : null}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--biu-color-text)' }}>分享给谁</span>
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
                                style={{ ...secondaryBtnStyle, padding: '3px 8px', fontSize: 11.5 }}
                              >
                                + 空间全员
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setMemberPickerOpen((v) => !v)}
                              style={{ ...secondaryBtnStyle, padding: '3px 8px', fontSize: 11.5 }}
                            >
                              + 添加成员
                            </button>
                          </div>
                        </div>

                        {memberPickerOpen ? (
                          <div
                            style={{
                              maxHeight: 130,
                              overflowY: 'auto',
                              border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                              background: 'var(--biu-color-bg-input)',
                              borderRadius: 8,
                              padding: 4,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 2,
                            }}
                          >
                            {groups
                              .filter((grp) => !draft.grants.some((g) => g.subjectType === 'group' && g.subjectId === grp.id))
                              .map((grp) => (
                                <button
                                  key={`group:${grp.id}`}
                                  type="button"
                                  onClick={() => {
                                    setDraft({
                                      ...draft,
                                      grants: [
                                        ...draft.grants,
                                        { subjectType: 'group', subjectId: grp.id, role: 'viewer', subjectName: grp.name },
                                      ],
                                    })
                                    setMemberPickerOpen(false)
                                  }}
                                  style={{
                                    textAlign: 'left',
                                    padding: '5px 8px',
                                    borderRadius: 6,
                                    fontSize: 12,
                                    color: 'var(--biu-color-text)',
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {grp.name} · {grp.kind === 'dynamic' ? '动态成员组' : '成员组'}
                                </button>
                              ))}
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
                                    color: 'var(--biu-color-text)',
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
                                background: 'var(--biu-color-bg-input)',
                                border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                                fontSize: 12,
                                color: 'var(--biu-color-text)',
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
                                      ...pillBtnStyle(grant.role === r),
                                      padding: '2px 7px',
                                      fontSize: 11,
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

                      <div
                        style={{
                          padding: '10px 12px',
                          borderRadius: 8,
                          background: 'var(--biu-color-bg-input)',
                          border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--biu-color-text)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <LinkIcon aria-hidden className="size-3.5" />
                            <span>公开 / 局域网只读链接</span>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={Boolean(publicLink || draft.wantPublicLink)}
                            className={`fsdb-share-toggle${publicLink || draft.wantPublicLink ? ' is-on' : ''}`}
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
                                fontSize: 11.5,
                                padding: '5px 8px',
                                borderRadius: 6,
                                border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                                background: 'var(--biu-color-bg-popover)',
                                color: 'var(--biu-color-text)',
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => void copyText('editor-url', publicLink.url)}
                              style={{ ...secondaryBtnStyle, padding: '5px 10px', fontSize: 11.5 }}
                            >
                              {copiedKey === 'editor-url' ? <CheckIcon aria-hidden className="size-3.5" /> : null}
                              <span>{copiedKey === 'editor-url' ? '已复制' : '复制'}</span>
                            </button>
                          </div>
                        ) : draft.wantPublicLink ? (
                          <div style={{ fontSize: 11.5, color: 'var(--biu-color-text-muted)' }}>
                            保存规则后将自动生成可复制的公开/局域网只读链接。
                          </div>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>

                {draft ? (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderTop: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: 8,
                    }}
                  >
                    <button type="button" onClick={() => setDraft(null)} style={secondaryBtnStyle}>
                      取消
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      data-testid="access-rule-save"
                      onClick={() => void saveDraft()}
                      style={primaryBtnStyle}
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
