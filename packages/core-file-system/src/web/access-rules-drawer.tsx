import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CheckIcon,
  ChevronDownIcon,
  GlobeAltIcon,
  LinkIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
  UserGroupIcon,
  UsersIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid'
import { AiAvatar } from '@biu/biu-ui/ai-avatar'
import { AnchorMenu } from '@biu/biu-ui/anchor-menu'
import { apiFetch } from '@biu/biu-ui/api-client'
import { OVERLAY_Z, overlayPortalRoot, overlayZ } from '@biu/biu-ui/overlay-portal'
import type { CollectionSchema } from '@biu/type-file-system'
import { countFilterRules, emptyFilterGroup, emptyFilterRule, type FilterGroup } from '../query-logic.ts'
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

let pendingAccessRulesOpen: OpenAccessRulesDetail | null = null

export function consumePendingAccessRulesOpen(): OpenAccessRulesDetail | null {
  const detail = pendingAccessRulesOpen
  pendingAccessRulesOpen = null
  return detail
}

export function openAccessRulesDrawer(detail: OpenAccessRulesDetail) {
  pendingAccessRulesOpen = detail
  window.dispatchEvent(new CustomEvent<OpenAccessRulesDetail>(OPEN_ACCESS_RULES_EVENT, { detail }))
}

const ROLE_LABELS: Record<AccessRuleRole, string> = {
  viewer: '可查看',
  editor: '可编辑',
  manager: '可管理',
}

const ROLE_CHOICES: AccessRuleRole[] = ['viewer', 'editor', 'manager']

const ROLE_DESCRIPTIONS: Record<AccessRuleRole, string> = {
  viewer: '仅可查看命中范围的数据',
  editor: '可查看并编辑命中范围的数据',
  manager: '可管理并删除命中范围的数据',
}

function AccessRoleSelect({
  value,
  ariaLabel,
  className = '',
  disabled = false,
  onChange,
}: {
  value: AccessRuleRole
  ariaLabel: string
  className?: string
  disabled?: boolean
  onChange: (next: AccessRuleRole) => void
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        className={`rules-role-select${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev)
        }}
      >
        <span>{ROLE_LABELS[value]}</span>
        <ChevronDownIcon aria-hidden className="rules-role-chevron size-3.5" />
      </button>
      {open ? (
        <AnchorMenu
          anchor={triggerRef.current}
          onClose={() => setOpen(false)}
          minWidth={196}
          zIndex={420}
          role="listbox"
          aria-label={ariaLabel}
          className="settings-select-menu"
        >
          {ROLE_CHOICES.map((role) => {
            const active = role === value
            return (
              <button
                key={role}
                type="button"
                role="option"
                aria-selected={active}
                className={`settings-select-option${active ? ' is-active' : ''}`}
                onClick={() => {
                  onChange(role)
                  setOpen(false)
                }}
              >
                <span className="settings-select-option-copy">
                  <strong>{ROLE_LABELS[role]}</strong>
                  <small>{ROLE_DESCRIPTIONS[role]}</small>
                </span>
                {active ? <CheckIcon aria-hidden className="size-3.5 shrink-0" /> : null}
              </button>
            )
          })}
        </AnchorMenu>
      ) : null}
    </>
  )
}

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
    name: view.name ? `${view.name} 权限` : '新建权限规则',
    filterTree: normalizeFilterTree(view.filterTree),
    columns: Array.isArray(view.columns) && view.columns.length > 0 ? [...view.columns] : null,
    displaySnapshot: Object.keys(snap).length > 0 ? snap : null,
  }
}

type MemberOption = {
  id: string
  name: string
  email?: string
  avatar?: string
}

type GroupOption = {
  id: string
  name: string
  kind?: 'static' | 'dynamic'
  memberCount?: number
}

type PublicShareLink = { token: string; url: string }

type RuleDraft = {
  id: string | null
  name: string
  nameTouched: boolean
  scope: 'workspace' | 'personal'
  filterTree: FilterGroup
  restrictRows: boolean
  columns: string[] | null
  restrictColumns: boolean
  displaySnapshot: AccessRuleDisplaySnapshot | null
  enabled: boolean
  canManage: boolean
  grants: AccessRuleGrantItem[]
}

function autoRuleName(grants: AccessRuleGrantItem[], fallback: string): string {
  if (grants.length === 0) return fallback || '新建权限规则'
  const first = grants[0]
  const label = first.subjectType === 'workspace' ? '空间全员' : (first.subjectName || first.subjectId)
  if (grants.length === 1) return `${label} · ${ROLE_LABELS[first.role]}`
  return `${label} 等 ${grants.length} 个对象`
}

function ruleSummaryText(rule: AccessRuleItem): string {
  const parts: string[] = []
  if (rule.grants.length > 0) {
    const first = rule.grants[0]
    const who = first.subjectType === 'workspace' ? '空间全员' : (first.subjectName || '成员')
    parts.push(rule.grants.length === 1 ? `${who}·${ROLE_LABELS[first.role]}` : `${who}等${rule.grants.length}个`)
  } else {
    parts.push('仅外链')
  }
  const rowCount = countFilterRules(normalizeFilterTree(rule.filterTree))
  parts.push(rowCount > 0 ? `${rowCount}条条件` : '全部记录')
  if (rule.columns?.length) parts.push(`${rule.columns.length}列`)
  return parts.join(' · ')
}

function draftFromRule(rule: AccessRuleItem): RuleDraft {
  const normalizedTree = normalizeFilterTree(rule.filterTree)
  return {
    id: rule.id,
    name: rule.name,
    nameTouched: true,
    scope: rule.scope === 'workspace' || rule.ownerTable === 'workspace' ? 'workspace' : 'personal',
    filterTree: normalizedTree,
    restrictRows: countFilterRules(normalizedTree) > 0,
    columns: rule.columns ? [...rule.columns] : null,
    restrictColumns: Boolean(rule.columns && rule.columns.length > 0),
    displaySnapshot: rule.displaySnapshot,
    enabled: rule.enabled,
    canManage: rule.canManage !== false,
    grants: rule.grants.map((g) => ({ ...g })),
  }
}

function ruleDraftSignature(d: RuleDraft): string {
  return JSON.stringify({
    name: d.name.trim(),
    scope: d.scope,
    restrictRows: d.restrictRows,
    filterTree: d.restrictRows ? d.filterTree : null,
    restrictColumns: d.restrictColumns,
    columns: d.restrictColumns ? d.columns : null,
    enabled: d.enabled,
    grants: d.grants.map((g) => [g.subjectType, g.subjectId, g.role]),
  })
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
  embedded = false,
  forcedScope,
  initialEditRuleId,
}: {
  collectionPath: string
  activeView?: SavedView
  viewerAccountId?: string
  schema?: CollectionSchema
  filterFields?: QueryField[]
  filterValueOptions?: (field: QueryField) => Array<{ value: string; label: string }>
  localOnly?: boolean
  buttonClassName?: string
  embedded?: boolean
  forcedScope?: 'workspace' | 'personal'
  initialEditRuleId?: string
}) {
  const [open, setOpen] = useState(false)
  const isOpen = embedded || open
  const [activeTab, setActiveTab] = useState<'rules' | 'public'>('rules')
  const [rules, setRules] = useState<AccessRuleItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [savedNotice, setSavedNotice] = useState('')
  const [members, setMembers] = useState<MemberOption[]>([])
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [dataViews, setDataViews] = useState<SavedView[]>([])
  const [memberViews, setMemberViews] = useState<SavedView[]>([])
  const [memberQuery, setMemberQuery] = useState('')
  const [defaultRole, setDefaultRole] = useState<AccessRuleRole>('viewer')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [viewImportOpen, setViewImportOpen] = useState(false)
  const [memberViewBusyId, setMemberViewBusyId] = useState('')
  const [draft, setDraft] = useState<RuleDraft | null>(null)
  const [baselineSig, setBaselineSig] = useState('')
  const [saving, setSaving] = useState(false)
  const [quickLinkBusy, setQuickLinkBusy] = useState(false)
  const [publicLinkBusyId, setPublicLinkBusyId] = useState('')
  const [publicLinks, setPublicLinks] = useState<Record<string, PublicShareLink | null>>({})
  const [preview, setPreview] = useState<{ matchCount: number; sampleRecords: Array<{ id: string; title: string }> } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [copiedKey, setCopiedKey] = useState('')
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const pickerRef = useRef<HTMLDivElement | null>(null)
  const viewImportRef = useRef<HTMLDivElement | null>(null)
  const pendingEventRef = useRef<boolean>(false)

  const HIDDEN_SCHEMA_KEYS = useMemo(
    () =>
      new Set([
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
      ]),
    [],
  )

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
  }, [schema, HIDDEN_SCHEMA_KEYS])

  const membersById = useMemo(() => {
    const map = new Map<string, MemberOption>()
    for (const m of members) map.set(m.id, m)
    return map
  }, [members])

  const loadRules = useCallback(async () => {
    if (localOnly) return [] as AccessRuleItem[]
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch(`/api/account/access-rules?collection=${encodeURIComponent(collectionPath)}`)
      if (!res.ok) throw new Error('加载权限规则失败')
      const data = (await res.json()) as { rules?: AccessRuleItem[] }
      const list = Array.isArray(data.rules) ? data.rules : []
      setRules(list)
      return list
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
      return [] as AccessRuleItem[]
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
          name: String(row.title ?? '').trim() || String(row.name ?? '').trim() || String(row.email ?? '').trim(),
          email: typeof row.email === 'string' ? row.email : undefined,
          avatar: typeof row.avatar === 'string' ? row.avatar.trim() : undefined,
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
      setDataViews((dataViewRows.items ?? []).map((row) => savedViewFromRecord(row)).filter((v): v is SavedView => Boolean(v)))
      setMemberViews((memberViewRows.items ?? []).map((row) => savedViewFromRecord(row)).filter((v): v is SavedView => Boolean(v)))
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

  const activeDomain = forcedScope ?? (activeView ? viewDomainOf(activeView) : 'all')
  const isForeignPersonalTable = !forcedScope && Boolean(
    activeView?.ownerTable?.startsWith('account:') &&
      viewerAccountId &&
      activeView.ownerTable !== `account:${viewerAccountId}`,
  )
  const lockedScope: 'workspace' | 'personal' | null =
    forcedScope
      ? forcedScope
      : isForeignPersonalTable
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

  const selectRuleForEdit = useCallback((rule: AccessRuleItem) => {
    const next = draftFromRule(rule)
    setDraft(next)
    setBaselineSig(ruleDraftSignature(next))
    setMemberQuery('')
    setPickerOpen(false)
    setViewImportOpen(false)
    setError('')
    setSavedNotice('')
  }, [])

  const startNewDraft = useCallback(
    (fromView?: SavedView | null) => {
      const sourceView = fromView === undefined ? null : fromView
      const snap = snapshotFromView(sourceView)
      const next: RuleDraft = {
        id: null,
        name: snap.name || '新建权限规则',
        nameTouched: Boolean(sourceView?.name),
        scope: lockedScope ?? 'personal',
        filterTree: snap.filterTree,
        restrictRows: countFilterRules(snap.filterTree) > 0,
        columns: snap.columns,
        restrictColumns: Boolean(snap.columns && snap.columns.length > 0),
        displaySnapshot: snap.displaySnapshot,
        enabled: true,
        canManage: true,
        grants: [],
      }
      setDraft(next)
      setBaselineSig('')
      setActiveTab('rules')
      setMemberQuery('')
      setPickerOpen(false)
      setViewImportOpen(false)
      setError('')
      setSavedNotice('')
    },
    [lockedScope],
  )

  const refreshPublicLinks = useCallback(
    async (list: AccessRuleItem[]) => {
      if (localOnly || list.length === 0) {
        setPublicLinks({})
        return
      }
      const entries = await Promise.all(
        list.map(async (rule) => {
          try {
            const res = await apiFetch(
              `/api/db/shares?kind=rule&collection=${encodeURIComponent(collectionPath)}&ruleId=${encodeURIComponent(rule.id)}`,
            )
            if (!res.ok) return [rule.id, null] as const
            const data = (await res.json()) as { share?: PublicShareLink | null }
            return [rule.id, data.share ?? null] as const
          } catch {
            return [rule.id, null] as const
          }
        }),
      )
      setPublicLinks(Object.fromEntries(entries))
    },
    [collectionPath, localOnly],
  )

  useEffect(() => {
    if (!embedded) return
    setDraft(null)
    setBaselineSig('')
    setMemberQuery('')
    setPickerOpen(false)
    setViewImportOpen(false)
    setError('')
    setSavedNotice('')
  }, [embedded, collectionPath, forcedScope])

  useEffect(() => {
    if (!isOpen) return
    void loadMembers()
    void loadRules().then((list) => {
      const scoped =
        lockedScope === 'workspace'
          ? list.filter((r) => r.scope === 'workspace' || r.ownerTable === 'workspace')
          : lockedScope === 'personal'
            ? list.filter((r) => r.scope !== 'workspace' && r.ownerTable !== 'workspace')
            : list
      void refreshPublicLinks(scoped)
      if (!pendingEventRef.current) {
        const targetHit = initialEditRuleId ? scoped.find((r) => r.id === initialEditRuleId) : undefined
        setDraft((prev) => {
          if (targetHit) {
            const next = draftFromRule(targetHit)
            setBaselineSig(ruleDraftSignature(next))
            return next
          }
          if (prev && (prev.id === null || scoped.some((r) => r.id === prev.id))) return prev
          if (scoped.length > 0) {
            const first = draftFromRule(scoped[0])
            setBaselineSig(ruleDraftSignature(first))
            return first
          }
          return null
        })
      }
      pendingEventRef.current = false
    })
  }, [isOpen, loadMembers, loadRules, lockedScope, refreshPublicLinks, initialEditRuleId])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<OpenAccessRulesDetail>).detail
      if (!detail || detail.collection !== collectionPath) return
      pendingEventRef.current = true
      setActiveTab('rules')
      setOpen(true)
      if (detail.fromView) {
        startNewDraft(detail.fromView)
      } else if (detail.editRuleId) {
        const hit = rules.find((r) => r.id === detail.editRuleId)
        if (hit) selectRuleForEdit(hit)
      }
    }
    window.addEventListener(OPEN_ACCESS_RULES_EVENT, handler)
    return () => window.removeEventListener(OPEN_ACCESS_RULES_EVENT, handler)
  }, [collectionPath, rules, startNewDraft, selectRuleForEdit])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (pickerOpen) {
        event.preventDefault()
        setPickerOpen(false)
        return
      }
      if (viewImportOpen) {
        event.preventDefault()
        setViewImportOpen(false)
        return
      }
      event.preventDefault()
      setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, pickerOpen, viewImportOpen])

  useEffect(() => {
    if (!pickerOpen && !viewImportOpen) return
    const onDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (pickerOpen && pickerRef.current && !pickerRef.current.contains(target)) {
        setPickerOpen(false)
      }
      if (viewImportOpen && viewImportRef.current && !viewImportRef.current.contains(target)) {
        setViewImportOpen(false)
      }
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [pickerOpen, viewImportOpen])

  useEffect(() => {
    if (!open || !draft || activeTab !== 'rules') {
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
  }, [open, draft, activeTab, collectionPath])

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey((prev) => (prev === key ? '' : prev)), 1600)
    } catch {
      /* ignore */
    }
  }

  const patchDraft = (updater: (prev: RuleDraft) => RuleDraft) => {
    setSavedNotice('')
    setError('')
    setDraft((prev) => (prev ? updater(prev) : prev))
  }

  const addGrantsToDraft = (added: AccessRuleGrantItem[]) => {
    if (!added.length) return
    patchDraft((prev) => {
      const grants = [...prev.grants, ...added]
      return {
        ...prev,
        grants,
        name: prev.nameTouched ? prev.name : autoRuleName(grants, prev.name),
      }
    })
  }

  const applyViewImport = (view: SavedView) => {
    const snap = snapshotFromView(view)
    patchDraft((prev) => ({
      ...prev,
      name: prev.nameTouched ? prev.name : (view.name ? `${view.name} 权限` : prev.name),
      filterTree: snap.filterTree,
      restrictRows: countFilterRules(snap.filterTree) > 0,
      columns: snap.columns,
      restrictColumns: Boolean(snap.columns && snap.columns.length > 0),
      displaySnapshot: snap.displaySnapshot,
    }))
    setViewImportOpen(false)
  }

  const applyMemberViewToDraft = async (view: SavedView) => {
    if (!draft) return
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
        const name = String(row.title ?? '').trim() || String(row.name ?? '').trim() || String(row.email ?? '').trim()
        if (!accountId || !name || existing.has(accountId)) continue
        existing.add(accountId)
        added.push({ subjectType: 'account', subjectId: accountId, role: defaultRole, subjectName: name })
      }
      if (added.length > 0) {
        addGrantsToDraft(added)
        setPickerOpen(false)
      } else {
        setError(`「${view.name}」当前没有可添加的新成员`)
      }
    } catch {
      setError(`读取「${view.name}」成员失败`)
    } finally {
      setMemberViewBusyId('')
    }
  }

  const saveDraft = async () => {
    if (!draft || !draft.canManage) return
    const trimmedName = (draft.name.trim() || autoRuleName(draft.grants, '权限规则')).trim()
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
      const list = await loadRules()
      emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
      if (savedRule) {
        const refreshed = list.find((r) => r.id === savedRule.id) ?? savedRule
        selectRuleForEdit(refreshed)
        setSavedNotice('已保存')
        window.setTimeout(() => setSavedNotice((prev) => (prev === '已保存' ? '' : prev)), 1800)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const deleteRule = async (ruleId: string) => {
    setError('')
    try {
      await apiFetch('/api/db/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'rule', collection: collectionPath, ruleId, enabled: false }),
      }).catch(() => {})
      const res = await apiFetch(`/api/account/access-rules/${encodeURIComponent(ruleId)}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        const list = await loadRules()
        emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
        const scoped =
          lockedScope === 'workspace'
            ? list.filter((r) => r.scope === 'workspace' || r.ownerTable === 'workspace')
            : lockedScope === 'personal'
              ? list.filter((r) => r.scope !== 'workspace' && r.ownerTable !== 'workspace')
              : list
        void refreshPublicLinks(scoped)
        if (draft?.id === ruleId) {
          if (scoped.length > 0) selectRuleForEdit(scoped[0])
          else setDraft(null)
        }
      }
    } catch {
      setError('删除规则失败')
    }
  }

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
          name: activeView?.name ? `${activeView.name} 公开链接` : '公开只读链接',
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
        throw new Error(errBody.error || '创建公开链接失败')
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
        ? ((await shareRes.json()) as { share?: PublicShareLink | null })
        : { share: null }
      const list = await loadRules()
      emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
      const scoped =
        lockedScope === 'workspace'
          ? list.filter((r) => r.scope === 'workspace' || r.ownerTable === 'workspace')
          : lockedScope === 'personal'
            ? list.filter((r) => r.scope !== 'workspace' && r.ownerTable !== 'workspace')
            : list
      void refreshPublicLinks(scoped)
      if (shareData.share) {
        setPublicLinks((prev) => ({ ...prev, [rule.id]: shareData.share ?? null }))
        void copyText(`public:${rule.id}`, shareData.share.url)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成链接失败')
    } finally {
      setQuickLinkBusy(false)
    }
  }

  const toggleRulePublicLink = async (rule: AccessRuleItem) => {
    const current = publicLinks[rule.id]
    const enable = !current
    setPublicLinkBusyId(rule.id)
    setError('')
    try {
      const res = await apiFetch('/api/db/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'rule',
          collection: collectionPath,
          ruleId: rule.id,
          enabled: enable,
        }),
      })
      if (!res.ok) throw new Error('更新公开链接失败')
      const data = (await res.json()) as { share?: PublicShareLink | null }
      setPublicLinks((prev) => ({ ...prev, [rule.id]: data.share ?? null }))
      emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新公开链接失败')
    } finally {
      setPublicLinkBusyId('')
    }
  }

  // 聚合表（每人私有、不可分享）、共享域与他人的个人表不展示权限入口
  if (
    localOnly ||
    (!embedded &&
      (activeDomain === 'shared' ||
        isForeignPersonalTable ||
        (activeDomain === 'all' && tableModeFor(collectionPath) === 'k-plus-1')))
  ) {
    return null
  }

  const ruleCount = visibleRules.length
  const hasActiveRules = visibleRules.some((r) => r.enabled)
  const activePublicCount = Object.values(publicLinks).filter(Boolean).length
  const modalTitle =
    lockedScope === 'workspace'
      ? '空间表权限'
      : lockedScope === 'personal'
        ? '个人表权限'
        : '权限与分享'

  const targetOwnerTable = draft
    ? draft.scope === 'workspace'
      ? 'workspace'
      : viewerAccountId
        ? `account:${viewerAccountId}`
        : (activeView?.ownerTable?.startsWith('account:') ? activeView.ownerTable : '')
    : ''

  const importableViews = (() => {
    if (!draft) return [] as Array<{ view: SavedView; meta: string }>
    const isAccessible = (v: SavedView): boolean => {
      if (!v?.id || v.builtin || v.ownerTable === 'all') return false
      const ot = v.ownerTable?.trim() || ''
      if (draft.scope === 'workspace') {
        if (ot ? ot !== 'workspace' : viewDomainOf(v) !== 'workspace') return false
      } else {
        if (!targetOwnerTable || ot !== targetOwnerTable) return false
      }
      const protection = v.protection ?? (v.scope === 'personal' ? 'personal' : 'public')
      if (protection === 'personal') {
        const creator = v.createdBy?.trim() || ''
        if (viewerAccountId && creator && creator !== viewerAccountId) return false
      }
      return true
    }
    const candidates: SavedView[] = []
    const seenIds = new Set<string>()
    if (activeView && isAccessible(activeView)) {
      seenIds.add(activeView.id)
      candidates.push(activeView)
    }
    for (const v of dataViews) {
      if (seenIds.has(v.id) || !isAccessible(v)) continue
      seenIds.add(v.id)
      candidates.push(v)
    }
    // 去掉完全同名且条件/列都为空的冗余视图，避免下拉里出现一堆重复「私人页面」
    const seenShapes = new Set<string>()
    const out: Array<{ view: SavedView; meta: string }> = []
    for (const v of candidates) {
      const fCount = countFilterRules(normalizeFilterTree(v.filterTree))
      const cCount = Array.isArray(v.columns) ? v.columns.length : 0
      const shapeKey = `${v.name}\0${fCount}\0${cCount}\0${JSON.stringify(v.filterTree ?? null)}`
      if (seenShapes.has(shapeKey)) continue
      seenShapes.add(shapeKey)
      const metaParts: string[] = []
      metaParts.push(fCount > 0 ? `${fCount} 条条件` : '全部记录')
      metaParts.push(cCount > 0 ? `${cCount} 列` : '全部列')
      out.push({ view: v, meta: metaParts.join(' · ') })
    }
    return out
  })()

  const isDirty = Boolean(draft && (draft.id === null || ruleDraftSignature(draft) !== baselineSig))
  const hasWorkspaceGrant = draft?.grants.some((g) => g.subjectType === 'workspace') ?? false
  const normalizedQ = memberQuery.trim().toLowerCase()
  const filteredGroups = groups.filter(
    (grp) =>
      !draft?.grants.some((g) => g.subjectType === 'group' && g.subjectId === grp.id) &&
      (!normalizedQ || grp.name.toLowerCase().includes(normalizedQ)),
  )
  const filteredMembers = members
    .filter((m) => !draft?.grants.some((g) => g.subjectType === 'account' && g.subjectId === m.id))
    .filter((m) => !normalizedQ || `${m.name} ${m.email ?? ''}`.toLowerCase().includes(normalizedQ))
    .slice(0, 8)
  const customMemberViews = memberViews.filter(
    (mv) =>
      !mv.id.startsWith('builtin-all:') &&
      mv.id !== 'builtin-member:member' &&
      (!normalizedQ || mv.name.toLowerCase().includes(normalizedQ)),
  )
  const showWorkspaceOption = !hasWorkspaceGrant && (!normalizedQ || '空间全员'.includes(normalizedQ))
  const hasPickerItems =
    showWorkspaceOption || filteredGroups.length > 0 || filteredMembers.length > 0 || customMemberViews.length > 0

  const rowFilterCount = draft?.restrictRows ? countFilterRules(draft.filterTree) : 0
  const selectedColsSet = new Set(draft?.restrictColumns ? (draft.columns ?? []) : schemaFields.map((f) => f.key))

  const handleOverlayMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    setOpen(false)
  }

  const panelContent = (
    <>
      <header className={`rules-head${embedded ? ' is-embedded' : ''}`}>
        {!embedded ? (
          <div className="rules-head-title">
            <LockClosedIcon aria-hidden className="size-4 rules-head-icon" />
            <span>{modalTitle}</span>
          </div>
        ) : null}
        <div className="rules-tabs" role="tablist" aria-label="权限配置分区">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'rules'}
            className={`rules-tab${activeTab === 'rules' ? ' is-on' : ''}`}
            data-testid="access-rules-tab-rules"
            onClick={() => setActiveTab('rules')}
          >
            <UsersIcon aria-hidden className="size-3.5" />
            <span>协作权限</span>
            {ruleCount > 0 ? <span className="rules-tab-count">{ruleCount}</span> : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'public'}
            className={`rules-tab${activeTab === 'public' ? ' is-on' : ''}`}
            data-testid="access-rules-tab-public"
            onClick={() => setActiveTab('public')}
          >
            <GlobeAltIcon aria-hidden className="size-3.5" />
            <span>公开链接</span>
            {activePublicCount > 0 ? <span className="rules-tab-dot" aria-hidden /> : null}
          </button>
        </div>
        {!embedded ? (
          <button
            type="button"
            className="biu-float-close"
            aria-label="关闭"
            title="关闭"
            onClick={() => setOpen(false)}
          >
            <XMarkIcon aria-hidden className="size-4" />
          </button>
        ) : null}
      </header>

                {error ? (
                  <div className="rules-error" role="alert">
                    <span>{error}</span>
                    <button type="button" className="rules-error-dismiss" aria-label="关闭提示" onClick={() => setError('')}>
                      <XMarkIcon aria-hidden className="size-3.5" />
                    </button>
                  </div>
                ) : null}

                {activeTab === 'rules' ? (
                  <div className="rules-split">
                    {/* 左栏：权限规则列表 */}
                    <aside className="rules-rail" aria-label="权限规则列表">
                      <button
                        type="button"
                        className="rules-rail-add"
                        data-testid="access-rules-new"
                        onClick={() => startNewDraft(null)}
                      >
                        <PlusIcon aria-hidden className="size-3.5" />
                        <span>新建权限规则</span>
                      </button>

                      <div className="rules-rail-list">
                        {draft && draft.id === null ? (
                          <button type="button" className="rules-rail-item is-on is-draft">
                            <span className="rules-rail-item-top">
                              <span className="rules-status-dot is-draft" aria-hidden />
                              <span className="rules-rail-item-name">{draft.name.trim() || '新建权限规则'}</span>
                            </span>
                            <span className="rules-rail-item-meta">未保存草稿</span>
                          </button>
                        ) : null}

                        {loading && visibleRules.length === 0 ? (
                          <div className="rules-rail-empty">加载中…</div>
                        ) : visibleRules.length === 0 && !draft ? (
                          <div className="rules-rail-empty">暂无规则</div>
                        ) : (
                          visibleRules.map((rule) => {
                            const selected = draft?.id === rule.id
                            return (
                              <button
                                key={rule.id}
                                type="button"
                                data-testid={`access-rule-card-${rule.id}`}
                                className={`rules-rail-item${selected ? ' is-on' : ''}${rule.enabled ? '' : ' is-off'}`}
                                onClick={() => selectRuleForEdit(rule)}
                              >
                                <span className="rules-rail-item-top">
                                  <span className={`rules-status-dot${rule.enabled ? ' is-on' : ''}`} aria-hidden />
                                  <span className="rules-rail-item-name">{rule.name}</span>
                                </span>
                                <span className="rules-rail-item-meta">{ruleSummaryText(rule)}</span>
                              </button>
                            )
                          })
                        )}
                      </div>
                    </aside>

                    {/* 右栏：规则详情与配置 */}
                    <div className="rules-main">
                      {!draft ? (
                        <div className="rules-empty-stage">
                          <div className="rules-empty-icon">
                            <LockClosedIcon aria-hidden className="size-5" />
                          </div>
                          <h3>还没有协作权限规则</h3>
                          <p>按成员或分组分配查看、编辑权限，并可精确限制可见的行与列。</p>
                          <button type="button" className="rules-btn-primary" onClick={() => startNewDraft(null)}>
                            <PlusIcon aria-hidden className="size-3.5" />
                            <span>新建第一条权限规则</span>
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="rules-editor-scroll">
                            {/* 头部：内联标题 + 启用开关 + 删除 */}
                            <div className="rules-editor-head">
                              <input
                                type="text"
                                className="rules-title-input"
                                value={draft.name}
                                disabled={!draft.canManage}
                                aria-label="规则名称"
                                placeholder="权限规则名称（留空自动生成）"
                                onChange={(e) =>
                                  patchDraft((prev) => ({ ...prev, name: e.target.value, nameTouched: true }))
                                }
                              />
                              <div className="rules-editor-head-actions">
                                {!lockedScope && draft.canManage ? (
                                  <div className="rules-seg is-compact" role="group" aria-label="目标数据表">
                                    <button
                                      type="button"
                                      className={`rules-seg-btn${draft.scope === 'workspace' ? ' is-on' : ''}`}
                                      onClick={() => patchDraft((prev) => ({ ...prev, scope: 'workspace' }))}
                                    >
                                      空间表
                                    </button>
                                    <button
                                      type="button"
                                      className={`rules-seg-btn${draft.scope === 'personal' ? ' is-on' : ''}`}
                                      onClick={() => patchDraft((prev) => ({ ...prev, scope: 'personal' }))}
                                    >
                                      个人表
                                    </button>
                                  </div>
                                ) : null}
                                {draft.canManage ? (
                                  <label className="rules-enable-switch">
                                    <span>{draft.enabled ? '已启用' : '已停用'}</span>
                                    <button
                                      type="button"
                                      role="switch"
                                      aria-checked={draft.enabled}
                                      aria-label={draft.enabled ? '停用规则' : '启用规则'}
                                      className={`fsdb-share-toggle${draft.enabled ? ' is-on' : ''}`}
                                      onClick={() => patchDraft((prev) => ({ ...prev, enabled: !prev.enabled }))}
                                    >
                                      <span />
                                    </button>
                                  </label>
                                ) : (
                                  <span className="rules-readonly-pill">只读</span>
                                )}
                                {draft.id && draft.canManage ? (
                                  <button
                                    type="button"
                                    className="rules-icon-danger"
                                    title="删除此规则"
                                    aria-label="删除此规则"
                                    onClick={() => void deleteRule(draft.id!)}
                                  >
                                    <TrashIcon aria-hidden className="size-4" />
                                  </button>
                                ) : null}
                              </div>
                            </div>

                            {/* 区块 1：授予对象与权限（先选人 + 权，符合人类心智） */}
                            <section className="rules-section">
                              <div className="rules-section-head">
                                <h4>授予对象与权限</h4>
                                <span className="rules-section-hint">
                                  {draft.grants.length > 0 ? `已选 ${draft.grants.length} 个` : '未指定成员'}
                                </span>
                              </div>

                              {draft.canManage ? (
                                <div className="rules-grant-bar" ref={pickerRef}>
                                  <div className="rules-grant-search">
                                    <MagnifyingGlassIcon aria-hidden className="size-3.5 rules-grant-search-icon" />
                                    <input
                                      type="search"
                                      value={memberQuery}
                                      placeholder="添加成员、成员组或空间全员…"
                                      onFocus={() => setPickerOpen(true)}
                                      onChange={(e) => {
                                        setMemberQuery(e.target.value)
                                        setPickerOpen(true)
                                      }}
                                    />
                                  </div>
                                  <AccessRoleSelect
                                    className="is-default"
                                    ariaLabel="新增受众默认权限"
                                    value={defaultRole}
                                    onChange={setDefaultRole}
                                  />

                                  {pickerOpen ? (
                                    <div className="rules-dropdown" role="listbox" aria-label="选择受众">
                                      {!hasPickerItems ? (
                                        <div className="rules-dropdown-empty">没有匹配的对象</div>
                                      ) : (
                                        <>
                                          {showWorkspaceOption || filteredGroups.length > 0 ? (
                                            <div className="rules-dropdown-group">
                                              <div className="rules-dropdown-heading">空间与分组</div>
                                              {showWorkspaceOption ? (
                                                <button
                                                  type="button"
                                                  className="rules-dropdown-item"
                                                  onClick={() => {
                                                    addGrantsToDraft([
                                                      {
                                                        subjectType: 'workspace',
                                                        subjectId: 'workspace',
                                                        role: defaultRole,
                                                        subjectName: '空间全员',
                                                      },
                                                    ])
                                                    setMemberQuery('')
                                                    setPickerOpen(false)
                                                  }}
                                                >
                                                  <span className="rules-avatar-badge">
                                                    <UsersIcon aria-hidden className="size-3.5" />
                                                  </span>
                                                  <span className="rules-dropdown-label">空间全员</span>
                                                  <span className="rules-dropdown-sub">动态</span>
                                                </button>
                                              ) : null}
                                              {filteredGroups.map((grp) => (
                                                <button
                                                  key={grp.id}
                                                  type="button"
                                                  className="rules-dropdown-item"
                                                  onClick={() => {
                                                    addGrantsToDraft([
                                                      {
                                                        subjectType: 'group',
                                                        subjectId: grp.id,
                                                        role: defaultRole,
                                                        subjectName: grp.name,
                                                      },
                                                    ])
                                                    setMemberQuery('')
                                                    setPickerOpen(false)
                                                  }}
                                                >
                                                  <span className="rules-avatar-badge">
                                                    <UserGroupIcon aria-hidden className="size-3.5" />
                                                  </span>
                                                  <span className="rules-dropdown-label">{grp.name}</span>
                                                  {typeof grp.memberCount === 'number' ? (
                                                    <span className="rules-dropdown-sub">{grp.memberCount} 人</span>
                                                  ) : null}
                                                </button>
                                              ))}
                                            </div>
                                          ) : null}

                                          {filteredMembers.length > 0 ? (
                                            <div className="rules-dropdown-group">
                                              <div className="rules-dropdown-heading">成员</div>
                                              {filteredMembers.map((member) => (
                                                <button
                                                  key={member.id}
                                                  type="button"
                                                  className="rules-dropdown-item"
                                                  onClick={() => {
                                                    addGrantsToDraft([
                                                      {
                                                        subjectType: 'account',
                                                        subjectId: member.id,
                                                        role: defaultRole,
                                                        subjectName: member.name,
                                                      },
                                                    ])
                                                    setMemberQuery('')
                                                    setPickerOpen(false)
                                                  }}
                                                >
                                                  <span className="rules-avatar">
                                                    {member.avatar ? (
                                                      <img src={member.avatar} alt="" />
                                                    ) : (
                                                      <AiAvatar seed={member.id} size={22} />
                                                    )}
                                                  </span>
                                                  <span className="rules-dropdown-label">{member.name}</span>
                                                  {member.email ? (
                                                    <span className="rules-dropdown-sub">{member.email}</span>
                                                  ) : null}
                                                </button>
                                              ))}
                                            </div>
                                          ) : null}

                                          {customMemberViews.length > 0 ? (
                                            <div className="rules-dropdown-group">
                                              <div className="rules-dropdown-heading">从成员视图批量添加</div>
                                              {customMemberViews.map((mv) => (
                                                <button
                                                  key={mv.id}
                                                  type="button"
                                                  className="rules-dropdown-item"
                                                  disabled={memberViewBusyId === mv.id}
                                                  onClick={() => void applyMemberViewToDraft(mv)}
                                                >
                                                  <span className="rules-avatar-badge">
                                                    <PlusIcon aria-hidden className="size-3.5" />
                                                  </span>
                                                  <span className="rules-dropdown-label">
                                                    {memberViewBusyId === mv.id ? `正在匹配「${mv.name}」…` : mv.name}
                                                  </span>
                                                  <span className="rules-dropdown-sub">批量导入</span>
                                                </button>
                                              ))}
                                            </div>
                                          ) : null}
                                        </>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}

                              {draft.grants.length > 0 ? (
                                <div className="rules-grant-list">
                                  {draft.grants.map((grant, idx) => {
                                    const member = grant.subjectType === 'account' ? membersById.get(grant.subjectId) : undefined
                                    const displayName =
                                      grant.subjectType === 'workspace'
                                        ? '空间全员'
                                        : grant.subjectName || member?.name || grant.subjectId
                                    const subLabel =
                                      grant.subjectType === 'workspace'
                                        ? '空间所有内部成员'
                                        : grant.subjectType === 'group'
                                          ? '成员组'
                                          : (member?.email ?? '')
                                    return (
                                      <div key={`${grant.subjectType}:${grant.subjectId}`} className="rules-grant-row">
                                        {grant.subjectType === 'account' ? (
                                          <span className="rules-avatar">
                                            {member?.avatar ? (
                                              <img src={member.avatar} alt="" />
                                            ) : (
                                              <AiAvatar seed={grant.subjectId} size={24} />
                                            )}
                                          </span>
                                        ) : (
                                          <span className="rules-avatar-badge">
                                            {grant.subjectType === 'workspace' ? (
                                              <UsersIcon aria-hidden className="size-3.5" />
                                            ) : (
                                              <UserGroupIcon aria-hidden className="size-3.5" />
                                            )}
                                          </span>
                                        )}
                                        <div className="rules-grant-meta">
                                          <span className="rules-grant-name">{displayName}</span>
                                          {subLabel ? <span className="rules-grant-sub">{subLabel}</span> : null}
                                        </div>
                                        <AccessRoleSelect
                                          ariaLabel={`${displayName} 的权限`}
                                          disabled={!draft.canManage}
                                          value={grant.role}
                                          onChange={(role) => {
                                            patchDraft((prev) => {
                                              const grants = prev.grants.map((item, i) =>
                                                i === idx ? { ...item, role } : item,
                                              )
                                              return {
                                                ...prev,
                                                grants,
                                                name: prev.nameTouched ? prev.name : autoRuleName(grants, prev.name),
                                              }
                                            })
                                          }}
                                        />
                                        {draft.canManage ? (
                                          <button
                                            type="button"
                                            className="rules-row-remove"
                                            aria-label={`移除 ${displayName}`}
                                            title="移除"
                                            onClick={() =>
                                              patchDraft((prev) => {
                                                const grants = prev.grants.filter((_, i) => i !== idx)
                                                return {
                                                  ...prev,
                                                  grants,
                                                  name: prev.nameTouched ? prev.name : autoRuleName(grants, prev.name),
                                                }
                                              })
                                            }
                                          >
                                            <XMarkIcon aria-hidden className="size-3.5" />
                                          </button>
                                        ) : null}
                                      </div>
                                    )
                                  })}
                                </div>
                              ) : (
                                <div className="rules-section-empty">
                                  添加成员或分组后，规则将对他们生效；若仅用于对外只读分享，也可留空。
                                </div>
                              )}
                            </section>

                            {/* 区块 2：记录范围（行权限，渐进披露） */}
                            <section className="rules-section">
                              <div className="rules-section-head">
                                <h4>记录范围</h4>
                                <div className="rules-section-tools">
                                  <span className="rules-preview-badge" data-testid="access-rule-preview">
                                    {previewLoading
                                      ? '计算中…'
                                      : preview
                                        ? `预计命中 ${preview.matchCount} 条`
                                        : ''}
                                  </span>
                                  {draft.canManage && importableViews.length > 0 ? (
                                    <div className="rules-import-wrap" ref={viewImportRef}>
                                      <button
                                        type="button"
                                        className="rules-link-btn"
                                        onClick={() => setViewImportOpen((prev) => !prev)}
                                      >
                                        <span>从视图导入</span>
                                        <ChevronDownIcon aria-hidden className="size-3.5" />
                                      </button>
                                      {viewImportOpen ? (
                                        <div className="rules-dropdown is-right" role="menu">
                                          <div className="rules-dropdown-heading">复制视图的筛选条件与列</div>
                                          {importableViews.map(({ view, meta }) => (
                                            <button
                                              key={view.id}
                                              type="button"
                                              role="menuitem"
                                              className="rules-dropdown-item"
                                              onClick={() => applyViewImport(view)}
                                            >
                                              <span className="rules-dropdown-label">{view.name}</span>
                                              <span className="rules-dropdown-sub">{meta}</span>
                                            </button>
                                          ))}
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              </div>

                              <div className="rules-radio-cards" role="radiogroup" aria-label="记录范围">
                                <button
                                  type="button"
                                  role="radio"
                                  aria-checked={!draft.restrictRows}
                                  disabled={!draft.canManage}
                                  className={`rules-radio-card${!draft.restrictRows ? ' is-on' : ''}`}
                                  onClick={() => patchDraft((prev) => ({ ...prev, restrictRows: false }))}
                                >
                                  <span className="rules-radio-dot" aria-hidden />
                                  <span className="rules-radio-copy">
                                    <strong>全部记录</strong>
                                    <span>当前表中的全部记录均在范围内</span>
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  role="radio"
                                  aria-checked={draft.restrictRows}
                                  disabled={!draft.canManage}
                                  className={`rules-radio-card${draft.restrictRows ? ' is-on' : ''}`}
                                  onClick={() =>
                                    patchDraft((prev) => {
                                      const hasRules = countFilterRules(prev.filterTree) > 0
                                      const seeded =
                                        !hasRules && filterFields[0]
                                          ? { ...prev.filterTree, children: [emptyFilterRule(filterFields[0].key)] }
                                          : prev.filterTree
                                      return { ...prev, restrictRows: true, filterTree: seeded }
                                    })
                                  }
                                >
                                  <span className="rules-radio-dot" aria-hidden />
                                  <span className="rules-radio-copy">
                                    <strong>满足指定条件</strong>
                                    <span>
                                      {rowFilterCount > 0 ? `已设置 ${rowFilterCount} 条筛选条件` : '仅符合条件的记录可见/可操作'}
                                    </span>
                                  </span>
                                </button>
                              </div>

                              {draft.restrictRows && filterFields.length > 0 && filterValueOptions ? (
                                <div className="rules-filter-box">
                                  <FilterQueryMenu
                                    bare
                                    tree={draft.filterTree}
                                    fields={filterFields}
                                    valueOptions={filterValueOptions}
                                    onChange={(next) =>
                                      patchDraft((prev) => ({
                                        ...prev,
                                        restrictRows: true,
                                        filterTree: next,
                                      }))
                                    }
                                  />
                                </div>
                              ) : null}
                            </section>

                            {/* 区块 3：可见列（列权限，默认折叠零噪音） */}
                            <section className="rules-section">
                              <div className="rules-section-head">
                                <h4>可见列</h4>
                                <span className="rules-section-hint">
                                  {draft.restrictColumns
                                    ? `已选 ${selectedColsSet.size} / ${schemaFields.length} 列`
                                    : `全部 ${schemaFields.length} 列`}
                                </span>
                              </div>

                              <div className="rules-radio-cards" role="radiogroup" aria-label="可见列">
                                <button
                                  type="button"
                                  role="radio"
                                  aria-checked={!draft.restrictColumns}
                                  disabled={!draft.canManage}
                                  className={`rules-radio-card${!draft.restrictColumns ? ' is-on' : ''}`}
                                  onClick={() =>
                                    patchDraft((prev) => ({ ...prev, restrictColumns: false, columns: null }))
                                  }
                                >
                                  <span className="rules-radio-dot" aria-hidden />
                                  <span className="rules-radio-copy">
                                    <strong>全部列</strong>
                                    <span>显示所有字段（含后续新增字段）</span>
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  role="radio"
                                  aria-checked={draft.restrictColumns}
                                  disabled={!draft.canManage}
                                  className={`rules-radio-card${draft.restrictColumns ? ' is-on' : ''}`}
                                  onClick={() =>
                                    patchDraft((prev) => ({
                                      ...prev,
                                      restrictColumns: true,
                                      columns:
                                        prev.columns && prev.columns.length > 0
                                          ? prev.columns
                                          : schemaFields.map((f) => f.key),
                                    }))
                                  }
                                >
                                  <span className="rules-radio-dot" aria-hidden />
                                  <span className="rules-radio-copy">
                                    <strong>仅指定列</strong>
                                    <span>勾选需要开放的字段，其余自动隐藏</span>
                                  </span>
                                </button>
                              </div>

                              {draft.restrictColumns && schemaFields.length > 0 ? (
                                <div className="rules-col-panel">
                                  <div className="rules-col-panel-bar">
                                    <span>选择允许可见的字段</span>
                                    {draft.canManage ? (
                                      <button
                                        type="button"
                                        className="rules-link-btn"
                                        onClick={() =>
                                          patchDraft((prev) => ({
                                            ...prev,
                                            columns: schemaFields.map((f) => f.key),
                                          }))
                                        }
                                      >
                                        全选
                                      </button>
                                    ) : null}
                                  </div>
                                  <div className="rules-col-grid">
                                    {schemaFields.map((field) => {
                                      const checked = selectedColsSet.has(field.key)
                                      return (
                                        <label key={field.key} className={`rules-col-check${checked ? ' is-on' : ''}`}>
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={!draft.canManage}
                                            onChange={() => {
                                              patchDraft((prev) => {
                                                const next = new Set(prev.columns ?? schemaFields.map((f) => f.key))
                                                if (next.has(field.key)) next.delete(field.key)
                                                else next.add(field.key)
                                                return { ...prev, restrictColumns: true, columns: [...next] }
                                              })
                                            }}
                                          />
                                          <span className="rules-col-box" aria-hidden>
                                            {checked ? <CheckIcon className="size-3" /> : null}
                                          </span>
                                          <span className="rules-col-label">{field.label}</span>
                                        </label>
                                      )
                                    })}
                                  </div>
                                </div>
                              ) : null}
                            </section>
                          </div>

                          {/* 底部保存条 */}
                          {draft.canManage ? (
                            <footer className="rules-footer">
                              <span className="rules-footer-status">
                                {savedNotice ? savedNotice : isDirty ? '有未保存的修改' : ''}
                              </span>
                              <div className="rules-footer-actions">
                                {isDirty ? (
                                  <button
                                    type="button"
                                    className="rules-btn-secondary"
                                    onClick={() => {
                                      if (draft.id) {
                                        const orig = visibleRules.find((r) => r.id === draft.id)
                                        if (orig) selectRuleForEdit(orig)
                                      } else if (visibleRules.length > 0) {
                                        selectRuleForEdit(visibleRules[0])
                                      } else {
                                        setDraft(null)
                                      }
                                    }}
                                  >
                                    {draft.id ? '还原' : '取消'}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="rules-btn-primary"
                                  data-testid="access-rules-save"
                                  disabled={saving || !isDirty}
                                  onClick={() => void saveDraft()}
                                >
                                  {saving ? '保存中…' : '保存规则'}
                                </button>
                              </div>
                            </footer>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Tab 2：公开链接（Notion Publish 风格，独立于内部 RBAC 规则编辑） */
                  <div className="rules-public-pane">
                    <div className="rules-public-hero">
                      <div className="rules-public-hero-copy">
                        <h3>公开只读链接</h3>
                        <p>获得链接的访问者无需登录即可只读查看对应范围内的数据，随时可关闭失效。</p>
                      </div>
                      <button
                        type="button"
                        className="rules-btn-primary"
                        disabled={quickLinkBusy}
                        data-testid="access-rules-quick-link"
                        onClick={() => void quickCreatePublicLinkFromView()}
                      >
                        <LinkIcon aria-hidden className="size-3.5" />
                        <span>{quickLinkBusy ? '生成中…' : '按当前视图生成链接'}</span>
                      </button>
                    </div>

                    {visibleRules.length === 0 ? (
                      <div className="rules-public-empty">
                        还没有可用于公开分享的范围规则，点击上方按钮即可按当前视图快速生成一条只读链接。
                      </div>
                    ) : (
                      <div className="rules-public-list">
                        {visibleRules.map((rule) => {
                          const share = publicLinks[rule.id] ?? null
                          const rowCount = countFilterRules(normalizeFilterTree(rule.filterTree))
                          const copied = copiedKey === `public:${rule.id}`
                          const busy = publicLinkBusyId === rule.id
                          return (
                            <div key={rule.id} className={`rules-public-card${share ? ' is-live' : ''}`}>
                              <div className="rules-public-card-head">
                                <div className="rules-public-card-info">
                                  <span className="rules-public-card-name">{rule.name}</span>
                                  <span className="rules-public-card-meta">
                                    {rowCount > 0 ? `${rowCount} 条行条件` : '全部记录'}
                                    {' · '}
                                    {rule.columns?.length ? `仅 ${rule.columns.length} 列` : '全部列'}
                                  </span>
                                </div>
                                <div className="rules-public-card-tools">
                                  <button
                                    type="button"
                                    className="rules-link-btn"
                                    onClick={() => {
                                      selectRuleForEdit(rule)
                                      setActiveTab('rules')
                                    }}
                                  >
                                    调整范围
                                  </button>
                                  {rule.canManage !== false ? (
                                    <button
                                      type="button"
                                      role="switch"
                                      disabled={busy}
                                      aria-checked={Boolean(share)}
                                      aria-label={share ? `关闭「${rule.name}」的公开链接` : `开启「${rule.name}」的公开链接`}
                                      className={`fsdb-share-toggle${share ? ' is-on' : ''}`}
                                      onClick={() => void toggleRulePublicLink(rule)}
                                    >
                                      <span />
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                              {share ? (
                                <div className="rules-public-url-row">
                                  <input readOnly value={share.url} className="rules-public-url-input" aria-label="公开只读链接" />
                                  <button
                                    type="button"
                                    className="rules-btn-secondary"
                                    onClick={() => void copyText(`public:${rule.id}`, share.url)}
                                  >
                                    {copied ? <CheckIcon aria-hidden className="size-3.5" /> : <LinkIcon aria-hidden className="size-3.5" />}
                                    <span>{copied ? '已复制' : '复制'}</span>
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
    </>
  )

  if (embedded) {
    return (
      <div className="rules-embedded fsdb-page" data-testid="access-rules-drawer">
        {panelContent}
      </div>
    )
  }

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
        title={ruleCount > 0 ? `${modalTitle}（${ruleCount} 条）` : modalTitle}
        aria-label={modalTitle}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="access-rules-trigger"
        onClick={() => setOpen((prev) => !prev)}
      >
        <LockClosedIcon aria-hidden className="size-4" />
        {ruleCount > 0 ? (
          <span className="rules-trigger-badge" data-testid="access-rules-count">
            {ruleCount > 99 ? '99+' : ruleCount}
          </span>
        ) : null}
      </button>

      {open
        ? createPortal(
            <div
              className="biu-float-overlay"
              style={{ zIndex: overlayZ(OVERLAY_Z.modal) }}
              onMouseDown={handleOverlayMouseDown}
            >
              <div
                className="biu-float rules-float fsdb-page"
                role="dialog"
                aria-modal="true"
                aria-label={modalTitle}
                data-testid="access-rules-drawer"
                onMouseDown={(event) => event.stopPropagation()}
              >
                {panelContent}
              </div>
            </div>,
            overlayPortalRoot() ?? document.body,
          )
        : null}
    </>
  )
}

export function AccessRulesPanel(props: {
  collectionPath: string
  scope: 'workspace' | 'personal'
  viewerAccountId?: string
  schema?: CollectionSchema
  filterFields?: QueryField[]
  filterValueOptions?: (field: QueryField) => Array<{ value: string; label: string }>
  initialEditRuleId?: string
}) {
  return (
    <AccessRulesButton
      collectionPath={props.collectionPath}
      forcedScope={props.scope}
      viewerAccountId={props.viewerAccountId}
      schema={props.schema}
      filterFields={props.filterFields}
      filterValueOptions={props.filterValueOptions}
      initialEditRuleId={props.initialEditRuleId}
      embedded
    />
  )
}
