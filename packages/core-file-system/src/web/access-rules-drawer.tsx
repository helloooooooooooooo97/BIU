import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CheckIcon,
  ChevronDownIcon,
  LinkIcon,
  LockClosedIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid'
import { apiFetch } from '@biu/biu-ui/api-client'
import { HeadlessDismiss } from '@biu/biu-ui/headless-dismiss'
import { OVERLAY_Z, overlayPortalRoot, overlayZ } from '@biu/biu-ui/overlay-portal'
import type { CollectionSchema } from '@biu/type-file-system'
import { countFilterRules, emptyFilterGroup, type FilterGroup } from '../query-logic.ts'
import { viewDomainOf } from '../catalog-views.ts'
import { tableModeFor } from '../paths.ts'
import { VIEWS_COLLECTION_PATH, WORKSPACE_MEMBERS_COLLECTION_PATH } from './database-path.ts'
import { listCollection } from './db-client.ts'
import { FSDB_SHARES_CHANGE_EVENT, OPEN_ACCESS_RULES_EVENT, emitFsdbEvent } from './fsdb-events.ts'
import { FilterQueryMenu, type QueryField } from './query-menus.tsx'
import type { SavedView } from './saved-view.ts'
import { savedViewFromRecord } from './view-storage.ts'

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
  createdByName?: string
  ownerTable?: string
  scope?: 'workspace' | 'personal'
  canManage?: boolean
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
  scope: 'workspace' | 'personal'
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
  viewerAccountId = '',
  schema,
  filterFields = [],
  filterValueOptions,
  localOnly = false,
  buttonClassName = 'chat-view-header-expand',
}: {
  collectionPath: string
  activeView?: SavedView
  viewerAccountId?: string
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
  const [dataViews, setDataViews] = useState<SavedView[]>([])
  const [memberViews, setMemberViews] = useState<SavedView[]>([])
  const [selectedDataViewId, setSelectedDataViewId] = useState<string>('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [memberQuery, setMemberQuery] = useState('')
  const [memberViewBusyId, setMemberViewBusyId] = useState('')
  const [draft, setDraft] = useState<RuleDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [quickLinkBusy, setQuickLinkBusy] = useState(false)
  const [preview, setPreview] = useState<{ matchCount: number; sampleRecords: Array<{ id: string; title: string }> } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
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
    try {
      const [dataViewRows, memberViewRows] = await Promise.all([
        listCollection({ path: VIEWS_COLLECTION_PATH, limit: 100, filters: { tablePath: collectionPath } }),
        listCollection({ path: VIEWS_COLLECTION_PATH, limit: 100, filters: { tablePath: WORKSPACE_MEMBERS_COLLECTION_PATH } }),
      ])
      const parsedData = (dataViewRows.items ?? [])
        .map((row) => savedViewFromRecord(row))
        .filter((v): v is SavedView => Boolean(v))
      setDataViews(parsedData)
      const parsedMembers = (memberViewRows.items ?? [])
        .map((row) => savedViewFromRecord(row))
        .filter((v): v is SavedView => Boolean(v))
      setMemberViews(parsedMembers)
    } catch {
      setDataViews([])
      setMemberViews([])
    }
  }, [collectionPath, localOnly])

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
        scope: rule.scope === 'workspace' || rule.ownerTable === 'workspace' ? 'workspace' : 'personal',
        filterTree: normalizedTree,
        restrictRows: countFilterRules(normalizedTree) > 0,
        columns: rule.columns ? [...rule.columns] : null,
        restrictColumns: Boolean(rule.columns && rule.columns.length > 0),
        displaySnapshot: rule.displaySnapshot,
        enabled: rule.enabled,
        wantPublicLink: false,
        grants: rule.grants.map((g) => ({ ...g })),
      })
      setSelectedDataViewId('')
      setAdvancedOpen(false)
      setMemberQuery('')
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

  const activeDomain = activeView ? viewDomainOf(activeView) : 'all'
  const isForeignPersonalTable = Boolean(
    activeView?.ownerTable?.startsWith('account:') &&
      viewerAccountId &&
      activeView.ownerTable !== `account:${viewerAccountId}`,
  )
  const lockedScope: 'workspace' | 'personal' | null =
    isForeignPersonalTable
      ? null
      : activeDomain === 'workspace'
        ? 'workspace'
        : activeDomain === 'personal'
          ? 'personal'
          : null
  const visibleRules = useMemo(() => {
    if (lockedScope === 'workspace') {
      return rules.filter((r) => r.scope === 'workspace' || r.ownerTable === 'workspace')
    }
    if (lockedScope === 'personal') {
      return rules.filter((r) => r.scope !== 'workspace' && r.ownerTable !== 'workspace')
    }
    return rules
  }, [lockedScope, rules])

  const startNewDraft = useCallback(
    (fromView?: SavedView | null, wantPublicLink = false) => {
      const sourceView = fromView === undefined ? (activeView ?? null) : fromView
      const snap = snapshotFromView(sourceView)
      setDraft({
        id: null,
        name: snap.name || '新建分享规则',
        scope: lockedScope ?? 'personal',
        filterTree: snap.filterTree,
        restrictRows: countFilterRules(snap.filterTree) > 0,
        columns: snap.columns,
        restrictColumns: Boolean(snap.columns && snap.columns.length > 0),
        displaySnapshot: snap.displaySnapshot,
        enabled: true,
        wantPublicLink,
        grants: [],
      })
      setSelectedDataViewId(sourceView?.id ?? '__all__')
      setAdvancedOpen(false)
      setMemberQuery('')
      setPublicLink(null)
    },
    [activeView, lockedScope],
  )

  const applyDataViewToDraft = (view: SavedView | null) => {
    if (!draft) return
    const snap = snapshotFromView(view)
    setSelectedDataViewId(view?.id ?? '__all__')
    setDraft({
      ...draft,
      name: draft.id ? draft.name : (view?.name ? `${view.name} 分享` : '全部数据 分享'),
      filterTree: snap.filterTree,
      restrictRows: countFilterRules(snap.filterTree) > 0,
      columns: snap.columns,
      restrictColumns: Boolean(snap.columns && snap.columns.length > 0),
      displaySnapshot: snap.displaySnapshot,
    })
  }

  const applyMemberViewToDraft = async (view: SavedView) => {
    if (!draft) return
    const isAllMembers = view.id === 'builtin-member:member' || view.id.startsWith('builtin-all:')
    if (isAllMembers) {
      if (!draft.grants.some((g) => g.subjectType === 'workspace')) {
        setDraft({
          ...draft,
          grants: [...draft.grants, { subjectType: 'workspace', subjectId: 'workspace', role: 'viewer', subjectName: '空间全员' }],
        })
      }
      return
    }
    setMemberViewBusyId(view.id)
    try {
      const listed = await listCollection({
        path: WORKSPACE_MEMBERS_COLLECTION_PATH,
        limit: 200,
        ...(view.filters && Object.keys(view.filters).length > 0 ? { filters: view.filters } : {}),
        ...(view.filterTree && countFilterRules(view.filterTree) > 0 ? { filterTree: view.filterTree } : {}),
      })
      const existing = new Set(draft.grants.filter((g) => g.subjectType === 'account').map((g) => g.subjectId))
      const added: AccessRuleGrantItem[] = []
      for (const row of listed.items ?? []) {
        const accountId = String(row.accountId ?? row.id ?? '').trim()
        const name = String(row.name ?? row.title ?? row.email ?? '').trim()
        if (!accountId || !name || existing.has(accountId)) continue
        existing.add(accountId)
        added.push({ subjectType: 'account', subjectId: accountId, role: 'viewer', subjectName: name })
      }
      if (added.length > 0) {
        setDraft((prev) => (prev ? { ...prev, grants: [...prev.grants, ...added] } : prev))
      } else {
        setError(`成员视图「${view.name}」当前没有可添加的新成员`)
      }
    } catch {
      setError(`读取成员视图「${view.name}」失败`)
    } finally {
      setMemberViewBusyId('')
    }
  }

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
            scope: draft.scope,
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
          scope: lockedScope ?? 'personal',
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
        scope: draft.scope,
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

  // 聚合表（每人私有、不可分享）、共享域与他人的个人表不展示分享规则盾牌
  if (
    localOnly ||
    activeDomain === 'shared' ||
    isForeignPersonalTable ||
    (activeDomain === 'all' && tableModeFor(collectionPath) === 'k-plus-1')
  ) {
    return null
  }

  const ruleCount = visibleRules.length
  const hasActiveRules = visibleRules.some((r) => r.enabled)
  const drawerTitle =
    lockedScope === 'workspace'
      ? '空间数据分享规则'
      : lockedScope === 'personal'
        ? '个人数据分享规则'
        : '我的分享规则'
  const hasWorkspaceGrant = draft?.grants.some((g) => g.subjectType === 'workspace') ?? false

  const primaryBtnStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 28,
    padding: '0 10px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    background: 'var(--biu-color-emphasis)',
    color: 'var(--biu-color-on-emphasis)',
    border: 'none',
    cursor: 'pointer',
  } as const

  const secondaryBtnStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 28,
    padding: '0 10px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    background: 'transparent',
    color: 'var(--biu-color-text-muted)',
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
        style={{
          position: 'relative',
          ...(hasActiveRules ? { color: 'var(--biu-color-emphasis)' } : {}),
        }}
        title={ruleCount > 0 ? `${drawerTitle}（${ruleCount} 条）` : drawerTitle}
        aria-label={drawerTitle}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="access-rules-trigger"
        onClick={() => setOpen((prev) => !prev)}
      >
        <LockClosedIcon aria-hidden className="size-4" />
        {ruleCount > 0 ? (
          <span
            data-testid="access-rules-count"
            style={{
              position: 'absolute',
              top: 1,
              right: 1,
              minWidth: 14,
              height: 14,
              padding: '0 3px',
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 600,
              lineHeight: '14px',
              textAlign: 'center',
              background: 'var(--biu-color-emphasis)',
              color: 'var(--biu-color-on-emphasis)',
              pointerEvents: 'none',
            }}
          >
            {ruleCount > 99 ? '99+' : ruleCount}
          </span>
        ) : null}
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
                  width: draft ? 440 : 400,
                  maxWidth: 'calc(100vw - 28px)',
                  maxHeight: 'calc(100vh - 116px)',
                  zIndex: overlayZ(OVERLAY_Z.popover),
                  background: 'var(--biu-color-bg-popover)',
                  color: 'var(--biu-color-text)',
                  border: 'var(--biu-stroke-width) solid var(--biu-color-border-popover)',
                  borderRadius: 'var(--biu-radius-popover, 10px)',
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
                    padding: '10px 12px 10px 14px',
                    borderBottom: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13, color: 'var(--biu-color-text)' }}>
                    <LockClosedIcon aria-hidden className="size-3.5" style={{ color: 'var(--biu-color-text-muted)' }} />
                    <span>{draft ? (draft.id ? '编辑分享规则' : '新建分享规则') : drawerTitle}</span>
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

                {error ? (
                  <div style={{ padding: '8px 14px 0', fontSize: 12, color: 'var(--biu-color-danger)' }}>{error}</div>
                ) : null}

                <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {!draft ? (
                    <>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          data-testid="access-rules-new"
                          onClick={() => startNewDraft()}
                          style={primaryBtnStyle}
                        >
                          <PlusIcon aria-hidden className="size-3.5" />
                          <span>新建规则</span>
                        </button>
                        <button
                          type="button"
                          disabled={quickLinkBusy}
                          data-testid="access-rules-quick-link"
                          onClick={() => void quickCreatePublicLinkFromView()}
                          style={secondaryBtnStyle}
                        >
                          <LinkIcon aria-hidden className="size-3.5" />
                          <span>{quickLinkBusy ? '生成中…' : '只读链接'}</span>
                        </button>
                      </div>

                      {loading ? (
                        <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 12, color: 'var(--biu-color-text-subtle)' }}>加载中…</div>
                      ) : visibleRules.length === 0 ? (
                        <div
                          style={{
                            padding: '20px 0',
                            textAlign: 'center',
                            fontSize: 12,
                            color: 'var(--biu-color-text-subtle)',
                          }}
                        >
                          暂无分享规则
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {visibleRules.map((rule) => {
                            const rowRulesCount = countFilterRules(normalizeFilterTree(rule.filterTree))
                            const linkCopied = copiedKey === `rule:${rule.id}`
                            const isWorkspaceRule = rule.scope === 'workspace' || rule.ownerTable === 'workspace'
                            const editable = rule.canManage !== false
                            return (
                              <div
                                key={rule.id}
                                data-testid={`access-rule-card-${rule.id}`}
                                style={{
                                  padding: '9px 11px',
                                  borderRadius: 8,
                                  background: 'var(--biu-color-bg-input)',
                                  border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                                  opacity: rule.enabled ? 1 : 0.56,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 5,
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                    {!lockedScope ? (
                                      <span
                                        style={{
                                          fontSize: 10.5,
                                          padding: '1px 6px',
                                          borderRadius: 999,
                                          background: isWorkspaceRule ? 'var(--biu-color-accent-soft, rgba(59,130,246,0.14))' : 'var(--biu-color-bg-hover)',
                                          color: isWorkspaceRule ? 'var(--biu-color-accent, #3b82f6)' : 'var(--biu-color-text-muted)',
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        {isWorkspaceRule ? '空间规则' : '我的规则'}
                                      </span>
                                    ) : null}
                                    <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--biu-color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rule.name}</span>
                                  </div>
                                  {editable ? (
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
                                  ) : (
                                    <span style={{ fontSize: 11, color: 'var(--biu-color-text-subtle)', whiteSpace: 'nowrap' }}>只读</span>
                                  )}
                                </div>
                                <div style={{ fontSize: 11.5, color: 'var(--biu-color-text-muted)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  <span>{rowRulesCount > 0 ? `${rowRulesCount} 条行条件` : (isWorkspaceRule ? '全部空间数据' : '全部个人数据')}</span>
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
                  ) : (() => {
                    const availableDataViews = (() => {
                      const list: SavedView[] = []
                      const seen = new Set<string>()
                      if (activeView) {
                        seen.add(activeView.id)
                        list.push(activeView)
                      }
                      for (const v of dataViews) {
                        if (seen.has(v.id)) continue
                        seen.add(v.id)
                        list.push(v)
                      }
                      return list
                    })()
                    const rowFilterCount = draft.restrictRows ? countFilterRules(draft.filterTree) : 0
                    const colCount = draft.restrictColumns && draft.columns?.length ? draft.columns.length : 0
                    const normalizedQ = memberQuery.trim().toLowerCase()
                    const filteredMembers = members
                      .filter((m) => !draft.grants.some((g) => g.subjectType === 'account' && g.subjectId === m.id))
                      .filter((m) => !normalizedQ || `${m.name} ${m.email ?? ''}`.toLowerCase().includes(normalizedQ))
                      .slice(0, 6)
                    const chipStyle = (active: boolean) => ({
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      height: 26,
                      padding: '0 9px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: active ? 500 : 400,
                      border: active
                        ? 'var(--biu-stroke-width) solid var(--biu-color-emphasis)'
                        : 'var(--biu-stroke-width) solid var(--biu-color-border)',
                      background: active ? 'color-mix(in srgb, var(--biu-color-emphasis) 12%, transparent)' : 'transparent',
                      color: active ? 'var(--biu-color-emphasis)' : 'var(--biu-color-text-muted)',
                      cursor: 'pointer',
                    }) as const
                    return (
                      <>
                        {/* ① 选数据视图（自动拷贝筛选与列） */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--biu-color-text)' }}>数据视图</span>
                            {!lockedScope ? (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button type="button" onClick={() => setDraft({ ...draft, scope: 'workspace' })} style={chipStyle(draft.scope === 'workspace')}>
                                  空间数据
                                </button>
                                <button type="button" onClick={() => setDraft({ ...draft, scope: 'personal' })} style={chipStyle(draft.scope === 'personal')}>
                                  个人数据
                                </button>
                              </div>
                            ) : null}
                          </div>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => applyDataViewToDraft(null)}
                              style={chipStyle(selectedDataViewId === '__all__')}
                            >
                              全部数据
                            </button>
                            {availableDataViews.map((v) => (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => applyDataViewToDraft(v)}
                                style={chipStyle(selectedDataViewId === v.id)}
                              >
                                {v.name}
                              </button>
                            ))}
                          </div>
                          <div
                            data-testid="access-rule-preview"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: 11.5,
                              color: 'var(--biu-color-text-subtle)',
                              paddingTop: 2,
                            }}
                          >
                            <span>
                              {previewLoading ? '计算中…' : preview ? `命中 ${preview.matchCount} 条` : ''}
                              {rowFilterCount > 0 ? ` · ${rowFilterCount} 条条件` : ''}
                              {colCount > 0 ? ` · ${colCount} 列` : ' · 全部列'}
                            </span>
                            <button
                              type="button"
                              onClick={() => setAdvancedOpen((v) => !v)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 2,
                                background: 'transparent',
                                border: 'none',
                                padding: 0,
                                fontSize: 11.5,
                                color: 'var(--biu-color-text-muted)',
                                cursor: 'pointer',
                              }}
                            >
                              <span>微调条件/列</span>
                              <ChevronDownIcon
                                aria-hidden
                                className="size-3.5"
                                style={{ transform: advancedOpen ? 'rotate(180deg)' : undefined, transition: 'transform 120ms ease' }}
                              />
                            </button>
                          </div>

                          {advancedOpen ? (
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 10,
                                padding: 10,
                                borderRadius: 8,
                                border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                                background: 'var(--biu-color-bg-input)',
                              }}
                            >
                              {filterFields.length > 0 && filterValueOptions ? (
                                <div className="fsdb-vset-body" style={{ overflow: 'visible' }}>
                                  <FilterQueryMenu
                                    tree={draft.filterTree}
                                    fields={filterFields}
                                    valueOptions={filterValueOptions}
                                    onChange={(next) => {
                                      setSelectedDataViewId('')
                                      setDraft({ ...draft, restrictRows: countFilterRules(next) > 0, filterTree: next })
                                    }}
                                  />
                                </div>
                              ) : null}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--biu-color-text-muted)' }}>
                                  <span>可见列</span>
                                  <button
                                    type="button"
                                    onClick={() => setDraft({ ...draft, restrictColumns: false, columns: null })}
                                    style={{ background: 'transparent', border: 'none', padding: 0, fontSize: 11.5, color: 'var(--biu-color-emphasis)', cursor: 'pointer' }}
                                  >
                                    {draft.restrictColumns ? '恢复全部列' : '当前全部列'}
                                  </button>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                  {schemaFields.map((field) => {
                                    const checked = !draft.restrictColumns || Boolean(draft.columns?.includes(field.key))
                                    return (
                                      <button
                                        key={field.key}
                                        type="button"
                                        onClick={() => {
                                          const base = draft.restrictColumns
                                            ? new Set(draft.columns ?? [])
                                            : new Set(schemaFields.map((f) => f.key))
                                          if (base.has(field.key)) base.delete(field.key)
                                          else base.add(field.key)
                                          const nextCols = [...base]
                                          const isAll = nextCols.length === schemaFields.length
                                          setSelectedDataViewId('')
                                          setDraft({
                                            ...draft,
                                            restrictColumns: !isAll,
                                            columns: isAll ? null : nextCols,
                                          })
                                        }}
                                        style={chipStyle(checked)}
                                      >
                                        {field.label}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>

                        {/* ② 选成员视图 / 成员组 / 成员 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--biu-color-text)' }}>分享给（成员视图 / 成员）</span>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => {
                                if (hasWorkspaceGrant) {
                                  setDraft({ ...draft, grants: draft.grants.filter((g) => g.subjectType !== 'workspace') })
                                } else {
                                  setDraft({
                                    ...draft,
                                    grants: [...draft.grants, { subjectType: 'workspace', subjectId: 'workspace', role: 'viewer', subjectName: '空间全员' }],
                                  })
                                }
                              }}
                              style={chipStyle(hasWorkspaceGrant)}
                            >
                              <UsersIcon aria-hidden className="size-3" />
                              <span>空间全员</span>
                            </button>
                            {groups.map((grp) => {
                              const on = draft.grants.some((g) => g.subjectType === 'group' && g.subjectId === grp.id)
                              return (
                                <button
                                  key={`group:${grp.id}`}
                                  type="button"
                                  onClick={() => {
                                    if (on) {
                                      setDraft({ ...draft, grants: draft.grants.filter((g) => !(g.subjectType === 'group' && g.subjectId === grp.id)) })
                                    } else {
                                      setDraft({
                                        ...draft,
                                        grants: [...draft.grants, { subjectType: 'group', subjectId: grp.id, role: 'viewer', subjectName: grp.name }],
                                      })
                                    }
                                  }}
                                  style={chipStyle(on)}
                                >
                                  <span>{grp.name}</span>
                                </button>
                              )
                            })}
                            {memberViews
                              .filter((mv) => !mv.id.startsWith('builtin-all:') && mv.id !== 'builtin-member:member')
                              .map((mv) => (
                                <button
                                  key={`mv:${mv.id}`}
                                  type="button"
                                  disabled={memberViewBusyId === mv.id}
                                  onClick={() => void applyMemberViewToDraft(mv)}
                                  style={chipStyle(false)}
                                  title={`套用成员视图「${mv.name}」的筛选结果`}
                                >
                                  <span>{memberViewBusyId === mv.id ? '匹配中…' : `+ ${mv.name}`}</span>
                                </button>
                              ))}
                          </div>

                          <input
                            type="search"
                            value={memberQuery}
                            onChange={(e) => setMemberQuery(e.target.value)}
                            placeholder="搜索并添加单个成员…"
                            style={{
                              height: 30,
                              padding: '0 9px',
                              borderRadius: 6,
                              border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                              background: 'var(--biu-color-bg-input)',
                              color: 'var(--biu-color-text)',
                              fontSize: 12,
                              outline: 'none',
                            }}
                          />
                          {normalizedQ && filteredMembers.length > 0 ? (
                            <div
                              style={{
                                border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                                background: 'var(--biu-color-bg-input)',
                                borderRadius: 6,
                                padding: 3,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 1,
                              }}
                            >
                              {filteredMembers.map((member) => (
                                <button
                                  key={member.id}
                                  type="button"
                                  onClick={() => {
                                    setDraft({
                                      ...draft,
                                      grants: [...draft.grants, { subjectType: 'account', subjectId: member.id, role: 'viewer', subjectName: member.name }],
                                    })
                                    setMemberQuery('')
                                  }}
                                  style={{
                                    textAlign: 'left',
                                    padding: '5px 8px',
                                    borderRadius: 5,
                                    fontSize: 12,
                                    color: 'var(--biu-color-text)',
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {member.name}
                                  {member.email ? <span style={{ marginLeft: 6, color: 'var(--biu-color-text-subtle)', fontSize: 11 }}>{member.email}</span> : null}
                                </button>
                              ))}
                            </div>
                          ) : null}

                          {draft.grants.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {draft.grants.map((grant, idx) => (
                                <div
                                  key={`${grant.subjectType}:${grant.subjectId}`}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 8,
                                    padding: '5px 8px',
                                    borderRadius: 6,
                                    background: 'var(--biu-color-bg-input)',
                                    fontSize: 12,
                                    color: 'var(--biu-color-text)',
                                  }}
                                >
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {grant.subjectType === 'workspace' ? '空间全员' : grant.subjectName || grant.subjectId}
                                  </span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                    <select
                                      aria-label="权限"
                                      value={grant.role}
                                      onChange={(e) => {
                                        const next = [...draft.grants]
                                        next[idx] = { ...grant, role: e.target.value as AccessRuleRole }
                                        setDraft({ ...draft, grants: next })
                                      }}
                                      style={{
                                        height: 24,
                                        padding: '0 6px',
                                        borderRadius: 5,
                                        border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                                        background: 'var(--biu-color-bg-popover)',
                                        color: 'var(--biu-color-text)',
                                        fontSize: 11.5,
                                        cursor: 'pointer',
                                      }}
                                    >
                                      {ROLE_CHOICES.map((r) => (
                                        <option key={r} value={r}>
                                          {ROLE_LABELS[r]}
                                        </option>
                                      ))}
                                    </select>
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
                          ) : null}
                        </div>

                        {/* ③ 规则名称 + 公开链接（轻量收口） */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, borderTop: 'var(--biu-stroke-width) solid var(--biu-color-border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, color: 'var(--biu-color-text-muted)', flexShrink: 0 }}>名称</span>
                            <input
                              type="text"
                              value={draft.name}
                              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                              placeholder="分享规则名称"
                              style={{
                                flex: 1,
                                height: 28,
                                padding: '0 8px',
                                borderRadius: 6,
                                border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                                background: 'var(--biu-color-bg-input)',
                                color: 'var(--biu-color-text)',
                                fontSize: 12,
                                outline: 'none',
                              }}
                            />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--biu-color-text-muted)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <LinkIcon aria-hidden className="size-3.5" />
                              <span>公开只读链接</span>
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
                                  height: 28,
                                  fontSize: 11.5,
                                  padding: '0 8px',
                                  borderRadius: 6,
                                  border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                                  background: 'var(--biu-color-bg-input)',
                                  color: 'var(--biu-color-text)',
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => void copyText('editor-url', publicLink.url)}
                                style={secondaryBtnStyle}
                              >
                                {copiedKey === 'editor-url' ? <CheckIcon aria-hidden className="size-3.5" /> : null}
                                <span>{copiedKey === 'editor-url' ? '已复制' : '复制'}</span>
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </>
                    )
                  })()}
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
