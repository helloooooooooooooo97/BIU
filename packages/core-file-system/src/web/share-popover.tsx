import { readStorageString, removeStorageKey, writeStorageString } from '@biu/biu-ui/client-storage'
import { AiAvatar } from '@biu/biu-ui/ai-avatar'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowPathIcon, CheckIcon, ChevronDownIcon, LinkIcon, ShareIcon, UserGroupIcon, UsersIcon, XMarkIcon } from '@heroicons/react/16/solid'
import { HeadlessDismiss } from '@biu/biu-ui/headless-dismiss'
import { useFloatingPosition } from '@biu/biu-ui/floating-position'
import { OVERLAY_Z, overlayPortalRoot, overlayZ } from '@biu/biu-ui/overlay-portal'
import { VIEWS_COLLECTION_PATH, WORKSPACE_MEMBERS_COLLECTION_PATH } from './database-path.ts'
import { listCollection, readJson } from './db-client.ts'
import { FSDB_SHARES_CHANGE_EVENT, emitFsdbEvent } from './fsdb-events.ts'

export { ShareScopeLabel, ShareRoleLabel } from './share-scope-label.tsx'
export { ShareScopeDetail, ShareRoleDetail } from './share-chain-detail.tsx'
import { ScopeMark } from './share-scope-label.tsx'
import { roleLabel } from './share-chain-detail.tsx'
import { mintSharePin, shareClipboardText } from '../share-resources.ts'
import { builtinAllView, builtinMemberViews, isBuiltinAllViewId, parseBuiltinScopeViewId, scopedCollectionName } from '../catalog-views.ts'
import { effectiveDataScope, grantAudienceKind, recordMatchesGrantedView } from '../view-access.ts'
import type { DbRecord } from '@biu/type-file-system'

export type ShareKind = 'view' | 'record'

export type ShareTarget = {
  kind: ShareKind
  collection: string
  viewId?: string
  recordId?: string
  title: string
}

type ShareInfo = {
  token: string
  url: string
  hasPassword: boolean
  sharePlugins: boolean
  allowCopy: boolean
}

type SharePayload = {
  share: ShareInfo | null
}

function pinStorageKey(token: string) {
  return `fsdb.share.pin:${token}`
}

function rememberedPin(token: string) {
  if (!token) return ''
  try {
    return readStorageString(pinStorageKey(token)) ?? ''
  } catch {
    return ''
  }
}

function rememberPin(token: string, pin: string) {
  try {
    if (pin) writeStorageString(pinStorageKey(token), pin)
    else removeStorageKey(pinStorageKey(token))
  } catch {
    /* ignore */
  }
}

function ShareToggle({
  on,
  disabled,
  label,
  testId,
  onChange,
}: {
  on: boolean
  disabled?: boolean
  label: string
  testId: string
  onChange: (on: boolean) => void
}) {
  return (
    <button
      type="button"
      className={`fsdb-share-toggle${on ? ' is-on' : ''}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      data-testid={testId}
      onClick={() => onChange(!on)}
    >
      <span />
    </button>
  )
}

type ShareSelectOption = {
  value: string
  label: string
  hint?: string
}

const ROLE_OPTIONS: ShareSelectOption[] = [
  { value: 'viewer', label: '可查看', hint: '仅查看内容' },
  { value: 'commenter', label: '可评论', hint: '查看与添加批注' },
  { value: 'editor', label: '可编辑', hint: '修改属性与正文' },
  { value: 'manager', label: '可管理', hint: '分享与权限管理' },
]

function ShareSelect({
  value,
  options,
  ariaLabel,
  placement = 'bottom-end',
  minMenuWidth = 156,
  inline = false,
  onChange,
}: {
  value: string
  options: ShareSelectOption[]
  ariaLabel: string
  placement?: 'bottom-start' | 'bottom-end'
  minMenuWidth?: number
  inline?: boolean
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const current = options.find((opt) => opt.value === value)
  const pos = useFloatingPosition(open ? triggerRef.current : null, menuRef, {
    enabled: open,
    placement,
    offset: 4,
    fallbackWidth: minMenuWidth,
    fallbackHeight: options.length * 40 + 12,
  })

  const portalRoot = typeof document !== 'undefined' ? overlayPortalRoot() : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`fsdb-share-select-trigger${inline ? ' is-inline' : ''}${open ? ' is-open' : ''}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{current?.label ?? roleLabel(value)}</span>
        <ChevronDownIcon aria-hidden className={`fsdb-share-select-chevron ${inline ? 'size-3' : 'size-3.5'}`} />
      </button>
      {open && portalRoot
        ? createPortal(
            <HeadlessDismiss onDismiss={() => setOpen(false)} insideRef={triggerRef}>
              <div
                ref={menuRef}
                className="fsdb-share-select-menu"
                role="listbox"
                aria-label={ariaLabel}
                style={{
                  position: 'fixed',
                  top: pos.top,
                  left: pos.left,
                  minWidth: Math.max(minMenuWidth, pos.anchorWidth),
                  maxHeight: pos.maxHeight,
                  zIndex: overlayZ(OVERLAY_Z.menu),
                }}
              >
                {options.map((opt) => {
                  const selected = opt.value === value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`fsdb-share-select-option${selected ? ' is-selected' : ''}`}
                      onClick={() => {
                        onChange(opt.value)
                        setOpen(false)
                      }}
                    >
                      <span className="fsdb-share-select-option-copy">
                        <strong>{opt.label}</strong>
                        {opt.hint ? <em>{opt.hint}</em> : null}
                      </span>
                      {selected ? <CheckIcon aria-hidden className="fsdb-share-select-check size-3.5" /> : null}
                    </button>
                  )
                })}
              </div>
            </HeadlessDismiss>,
            portalRoot,
          )
        : null}
    </>
  )
}

export function ShareButton({
  target,
  buttonClassName = 'chat-view-header-expand',
  localOnly = false,
}: {
  target: ShareTarget | null
  buttonClassName?: string
  localOnly?: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  if (!target) return null
  return (
    <div className="fsdb-share-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`${buttonClassName}${open ? ' is-active' : ''}`}
        title="分享"
        aria-label="分享"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="fsdb-share-toggle"
        onClick={() => setOpen((prev) => !prev)}
      >
        <ShareIcon aria-hidden className="size-4" />
      </button>
      {open ? (
        <HeadlessDismiss onDismiss={() => setOpen(false)} insideRef={wrapRef}>
          <SharePanel target={target} localOnly={localOnly} />
        </HeadlessDismiss>
      ) : null}
    </div>
  )
}

function WorkspaceAccess({
  collection,
  recordId = '',
  viewId = '',
}: {
  collection: string
  recordId?: string
  viewId?: string
}) {
  const [email, setEmail] = useState('')
  const [scope, setScope] = useState<'personal' | 'workspace' | 'shared'>('personal')
  const [ownerId, setOwnerId] = useState('')
  const [currentAccountId, setCurrentAccountId] = useState('')
  const [people, setPeople] = useState<Array<{
    id: string
    name: string
    avatar?: string
    email: string
    role: string
    memberKind: 'member' | 'external' | 'guest'
    grantedBy?: string
    grantedByName?: string
    canEdit?: boolean
    canRevoke?: boolean
  }>>([])
  const [groups, setGroups] = useState<Array<{ id: string; name: string; role: string }>>([])
  const [memberViews, setMemberViews] = useState<Array<{
    id: string
    name: string
    role?: string
    grantedBy?: string
    grantedByName?: string
    canEdit?: boolean
    canRevoke?: boolean
  }>>([])
  const [availableMemberViews, setAvailableMemberViews] = useState<Array<{ id: string; name: string; filters?: Record<string, unknown> }>>([])
  const [workspaceMembers, setWorkspaceMembers] = useState<Array<{
    id: string
    name: string
    avatar?: string
    email: string
    role: string
  }>>([])
  const [memberQuery, setMemberQuery] = useState('')
  const [selectedTarget, setSelectedTarget] = useState<
    | { kind: 'member'; id: string; email: string; name: string }
    | { kind: 'member_view'; id: string; name: string }
    | null
  >(null)
  const [memberPickerOpen, setMemberPickerOpen] = useState(false)
  const [role, setRole] = useState<'viewer' | 'commenter' | 'editor' | 'manager'>('editor')
  const [viewGrants, setViewGrants] = useState<Array<{
    viewId: string
    subjectType: 'account' | 'member_view'
    subjectId: string
    role: string
    name: string
    avatar?: string
    email: string
    memberKind: 'member' | 'external' | 'guest'
    grantedBy?: string
  }>>([])
  const [record, setRecord] = useState<DbRecord | null>(null)
  const [dataViews, setDataViews] = useState<Array<{ id: string; name: string; filters?: Record<string, unknown> }>>([])
  const [tableLabel, setTableLabel] = useState('')
  const [guestUrl, setGuestUrl] = useState('')
  const [guestCopied, setGuestCopied] = useState(false)
  const [inheritance, setInheritance] = useState<{ mode: 'inherit' | 'custom'; hasParent: boolean }>({ mode: 'custom', hasParent: false })
  const [inheritanceBusy, setInheritanceBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const data = await readJson<{
      scope?: 'personal' | 'workspace' | 'shared'
      ownerId?: string
      currentAccountId?: string
      people?: Array<{
        id: string
        name: string
        avatar?: string
        email: string
        role: string
        memberKind: 'member' | 'external' | 'guest'
        grantedBy?: string
        grantedByName?: string
        canEdit?: boolean
        canRevoke?: boolean
      }>
      groups?: Array<{ id: string; name: string; role: string }>
      memberViews?: Array<{
        id: string
        role: string
        grantedBy?: string
        grantedByName?: string
        canEdit?: boolean
        canRevoke?: boolean
      }>
      viewGrants?: Array<{
        viewId: string
        subjectType: 'account' | 'member_view'
        subjectId: string
        role: string
        name: string
        avatar?: string
        email: string
        memberKind: 'member' | 'external' | 'guest'
      }>
      inheritance?: {
        mode?: 'inherit' | 'custom'
        hasParent?: boolean
      }
    }>(
      viewId
        ? `/api/account/access?collection=${encodeURIComponent(collection)}&viewId=${encodeURIComponent(viewId)}`
        : `/api/account/access?collection=${encodeURIComponent(collection)}&recordId=${encodeURIComponent(recordId)}`,
    )
    setScope(data.scope ?? 'personal')
    setOwnerId(data.ownerId ?? '')
    setCurrentAccountId(data.currentAccountId ?? '')
    setPeople(data.people ?? [])
    setGroups(data.groups ?? [])
    setMemberViews((data.memberViews ?? []).map((item) => ({
      ...item,
      name: availableMemberViews.find((view) => view.id === item.id)?.name ?? item.id,
    })))
    setViewGrants(data.viewGrants ?? [])
    setInheritance({
      mode: data.inheritance?.mode === 'inherit' ? 'inherit' : 'custom',
      hasParent: Boolean(data.inheritance?.hasParent),
    })
  }

  useEffect(() => {
    void load().catch((error) => {
      console.warn('[share-popover] load grants failed', collection, error)
      setPeople([])
    })
    void listCollection({
      path: VIEWS_COLLECTION_PATH,
      limit: 200,
      filters: { tablePath: WORKSPACE_MEMBERS_COLLECTION_PATH },
      columns: ['title', 'tablePath', 'viewId', 'filters'],
    })
      .then((page) => {
        const rows = page.items.flatMap((row) => {
          const id = String(row.viewId ?? '').trim()
          if (!id) return []
          let filters: Record<string, unknown> | undefined
          try {
            const parsed = JSON.parse(String(row.filters ?? '{}'))
            filters = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined
          } catch {
            filters = undefined
          }
          return [{ id, name: String(row.title ?? id), filters }]
        })
        setAvailableMemberViews(rows)
        setMemberViews((current) => current.map((item) => ({
          ...item,
          name: rows.find((view) => view.id === item.id)?.name ?? item.name,
        })))
      })
      .catch((error) => {
        console.warn('[share-popover] load member views failed', error)
        setAvailableMemberViews([])
      })
    void listCollection({
      path: WORKSPACE_MEMBERS_COLLECTION_PATH,
      limit: 200,
      columns: ['title', 'name', 'avatar', 'email', 'role', 'membershipKind'],
    })
      .then((page) => {
        setWorkspaceMembers(page.items.flatMap((row) => {
          const id = String(row.id ?? '').trim()
          const email = String(row.email ?? '').trim()
          if (!id || !email || row.membershipKind !== 'member') return []
          const avatar = typeof row.avatar === 'string' ? row.avatar.trim() : ''
          return [{
            id,
            email,
            name: String(row.name ?? '').trim() || String(row.title ?? '').trim() || email,
            ...(avatar ? { avatar } : {}),
            role: String(row.role ?? ''),
          }]
        }))
      })
      .catch((error) => {
        console.warn('[share-popover] load workspace members failed', error)
        setWorkspaceMembers([])
      })
    if (viewId || !recordId) {
      setRecord(null)
      setDataViews([])
      return
    }
    void listCollection({ path: collection, limit: 1, filters: { id: recordId } })
      .then((page) => setRecord(page.items[0] ?? null))
      .catch((error) => {
        console.warn('[share-popover] load record failed', collection, recordId, error)
        setRecord(null)
      })
    void listCollection({
      path: VIEWS_COLLECTION_PATH,
      limit: 200,
      filters: { tablePath: collection },
      columns: ['title', 'table', 'viewId', 'filters'],
    })
      .then((page) => {
        const label = String(page.items[0]?.table ?? '').trim()
        if (label) setTableLabel(label)
        setDataViews(page.items.flatMap((row) => {
          const id = String(row.viewId ?? '').trim()
          if (!id) return []
          let filters: Record<string, unknown> | undefined
          try {
            const parsed = JSON.parse(String(row.filters ?? '{}'))
            filters = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined
          } catch {
            filters = undefined
          }
          return [{ id, name: String(row.title ?? id), filters }]
        }))
      })
      .catch((error) => {
        console.warn('[share-popover] load data views failed', collection, error)
        setDataViews([])
      })
  }, [collection, recordId, viewId])

  function grant(
    input: { email?: string; memberViewId?: string },
    collaboratorKind: 'internal' | 'external' = 'internal',
    nextRole?: string,
  ) {
    setError('')
    return readJson(`/api/account/access`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        collection,
        ...(viewId ? { viewId } : { recordId }),
        role: nextRole ?? role,
        ...(input.email ? { collaboratorKind } : {}),
        ...input,
      }),
    })
      .then(() => {
        if (!nextRole) {
          setEmail('')
          setMemberQuery('')
          setSelectedTarget(null)
          setMemberPickerOpen(false)
        }
        emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
        return load()
      })
      .catch((err) => setError(err instanceof Error ? err.message : '无法授权'))
  }

  async function revoke(subjectType: 'account' | 'group' | 'member_view', subjectId: string, grantedBy?: string) {
    setError('')
    try {
      await readJson('/api/account/access', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          collection,
          ...(viewId ? { viewId } : { recordId }),
          subjectType,
          subjectId,
          ...(grantedBy ? { grantedBy } : {}),
        }),
      })
      emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法移除协作者')
    }
  }

  async function toggleInheritance(on: boolean) {
    if (viewId || !recordId) return
    setError('')
    setInheritanceBusy(true)
    try {
      await readJson('/api/account/access', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          collection,
          recordId,
          inheritanceMode: on ? 'inherit' : 'custom',
        }),
      })
      emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法切换继承模式')
    } finally {
      setInheritanceBusy(false)
    }
  }

  async function createGuestLink() {
    setError('')
    try {
      const data = await readJson<{ path: string; url?: string }>('/api/account/access/guest-invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          collection,
          ...(viewId ? { viewId } : { recordId }),
          role: role === 'editor' ? 'editor' : 'viewer',
          expiresInHours: 24,
        }),
      })
      const url = data.url ? String(data.url) : new URL(data.path, window.location.origin).toString()
      setGuestUrl(url)
      await navigator.clipboard.writeText(url)
      setGuestCopied(true)
      emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
      window.setTimeout(() => setGuestCopied(false), 1600)
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法生成临时访客链接')
    }
  }

  const memberViewFilters = [
    { id: builtinAllView({ path: WORKSPACE_MEMBERS_COLLECTION_PATH }).id, filters: builtinAllView({ path: WORKSPACE_MEMBERS_COLLECTION_PATH }).filters },
    ...builtinMemberViews().map((view) => ({ id: view.id, filters: view.filters })),
    ...availableMemberViews,
  ]
  const inherited = !viewId && record
    ? viewGrants.flatMap((grant) => {
        if (!recordMatchesGrantedView(record, grant.viewId, dataViews, scope, { grantedBy: grant.grantedBy, recordOwnerId: ownerId })) return []
        const audience = grant.subjectType === 'member_view'
          ? grantAudienceKind({ subjectType: 'member_view', subjectId: grant.subjectId }, memberViewFilters)
          : grant.memberKind === 'external' || grant.memberKind === 'guest' ? 'external' : 'internal'
        const parsed = parseBuiltinScopeViewId(grant.viewId)
        const source = dataViews.find((view) => view.id === grant.viewId)?.name
          || (parsed ? scopedCollectionName({ path: collection, label: tableLabel || collection.replace(/^\//, '') }, parsed.scope) : '')
          || (isBuiltinAllViewId(grant.viewId) ? `全部${tableLabel}` : grant.viewId)
        const name = grant.subjectType === 'member_view'
          ? availableMemberViews.find((view) => view.id === grant.subjectId)?.name ?? grant.name
          : grant.name
        return [{ ...grant, name, audience, source }]
      })
    : []
  const internalPeople = people.filter((row) => row.memberKind === 'member')
  const externalPeople = people.filter((row) => row.memberKind === 'external' || row.memberKind === 'guest')
  const inheritedInternal = inherited.filter((row) => row.audience === 'internal')
  const inheritedExternal = inherited.filter((row) => row.audience === 'external')
  const shownScope = !viewId && record
    ? effectiveDataScope(scope, record, viewGrants.map((grant) => ({
        viewId: grant.viewId,
        subjectType: grant.subjectType,
        subjectId: grant.subjectId,
        memberKind: grant.memberKind,
        grantedBy: grant.grantedBy,
      })), dataViews, memberViewFilters, ownerId)
    : scope
  const grantedAccountIds = new Set(
    people
      .filter((row) => !viewId || !row.grantedBy || !currentAccountId || row.grantedBy === currentAccountId)
      .map((row) => row.id),
  )
  const grantedMemberViewIds = new Set(
    memberViews
      .filter((row) => !viewId || !row.grantedBy || !currentAccountId || row.grantedBy === currentAccountId)
      .map((row) => row.id),
  )
  const normalizedMemberQuery = memberQuery.trim().toLowerCase()
  const matchingMemberViews = availableMemberViews
    .filter((row) => !grantedMemberViewIds.has(row.id))
    .filter((row) => !normalizedMemberQuery || `${row.name} 动态成员视图`.toLowerCase().includes(normalizedMemberQuery))
    .slice(0, 6)
  const matchingMembers = workspaceMembers
    .filter((row) => row.id !== ownerId && !grantedAccountIds.has(row.id))
    .filter((row) => !normalizedMemberQuery || `${row.name} ${row.email}`.toLowerCase().includes(normalizedMemberQuery))
    .slice(0, 8)

  const roleSelect = (
    <ShareSelect
      value={role}
      options={ROLE_OPTIONS}
      ariaLabel="权限"
      placement="bottom-end"
      minMenuWidth={168}
      onChange={(next) => setRole(next as typeof role)}
    />
  )

  const internalCount = internalPeople.length + groups.length + memberViews.length + inheritedInternal.length
  const externalCount = externalPeople.length + inheritedExternal.length
  const isImageAvatar = (value?: string) => Boolean(value && /^(https?:\/\/|\/|data:image\/)/i.test(value.trim()))
  const renderPersonAvatar = (seed: string, avatar?: string, extraClass = '', size = 28) => {
    const trimmed = avatar?.trim() ?? ''
    return (
      <span className={`fsdb-share-avatar${extraClass ? ` ${extraClass}` : ''}`} aria-hidden>
        {isImageAvatar(trimmed) ? <img src={trimmed} alt="" /> : trimmed || <AiAvatar seed={seed || 'biu-ai'} size={size} />}
      </span>
    )
  }
  const grantorText = (grantedBy?: string, grantedByName?: string) => {
    if (!grantedBy) return ''
    if (currentAccountId && grantedBy === currentAccountId) return '由我授权'
    return grantedByName ? `由 ${grantedByName} 授权` : ''
  }
  const revokeTitle = (base: string, grantedBy?: string, grantedByName?: string) => {
    if (grantedBy && currentAccountId && grantedBy !== currentAccountId && grantedByName) {
      return `移除 ${grantedByName} 的授权`
    }
    return base
  }

  return (
    <div className="fsdb-share-link-section" data-testid="fsdb-share-members">
      {viewId ? null : (
        <div className="fsdb-share-collab-summary">
          <span>可见范围</span>
          <strong className={`fsdb-share-scope is-${shownScope}`} data-testid="fsdb-share-scope"><ScopeMark scope={shownScope} /></strong>
        </div>
      )}
      {!viewId && inheritance.hasParent ? (
        <div className="fsdb-share-inherit-row" data-testid="fsdb-share-inherit">
          <span>
            <strong>继承上级权限</strong>
            <em>{inheritance.mode === 'inherit' ? '自动沿用上级内容的协作者与权限' : '已断开继承，仅按本条设置与视图规则生效'}</em>
          </span>
          <ShareToggle
            on={inheritance.mode === 'inherit'}
            disabled={inheritanceBusy}
            label="继承上级权限"
            testId="fsdb-share-inherit-toggle"
            onChange={(on) => void toggleInheritance(on)}
          />
        </div>
      ) : null}

      <section className="fsdb-share-collab-section">
        <div className="fsdb-share-section-head">
          <h3>内部协作者</h3>
          {internalCount > 0 ? <span className="fsdb-share-section-count">{internalCount}</span> : null}
        </div>
        <ul className="fsdb-share-collaborators">
          {internalPeople.map((row) => {
            const sub = [row.email, grantorText(row.grantedBy, row.grantedByName)].filter(Boolean).join(' · ')
            const canEdit = Boolean(row.email && row.role !== 'owner' && row.canEdit !== false)
            const canRevoke = Boolean(row.role !== 'owner' && row.canRevoke !== false)
            return (
              <li key={`${row.id}:${row.grantedBy ?? ''}`}>
                {renderPersonAvatar(row.id || row.name, row.avatar)}
                <span className="fsdb-share-collaborator-copy"><strong>{row.name}</strong>{sub ? <em>{sub}</em> : null}</span>
                {canEdit ? (
                  <ShareSelect
                    inline
                    value={row.role}
                    options={ROLE_OPTIONS}
                    ariaLabel={`调整 ${row.name} 的权限`}
                    placement="bottom-end"
                    minMenuWidth={168}
                    onChange={(next) => {
                      if (next !== row.role) void grant({ email: row.email }, 'internal', next)
                    }}
                  />
                ) : (
                  <span className="fsdb-share-collaborator-role">{roleLabel(row.role)}</span>
                )}
                {canRevoke ? (
                  <button
                    type="button"
                    className="fsdb-share-remove"
                    title={revokeTitle('移除协作者', row.grantedBy, row.grantedByName)}
                    aria-label={`移除 ${row.name}`}
                    onClick={() => void revoke('account', row.id, row.grantedBy)}
                  >
                    <XMarkIcon aria-hidden className="size-3.5" />
                  </button>
                ) : null}
              </li>
            )
          })}
          {groups.map((row) => (
            <li key={`group:${row.id}`}>
              <span className="fsdb-share-avatar is-view" aria-hidden><UserGroupIcon className="size-3.5" /></span>
              <span className="fsdb-share-collaborator-copy"><strong>{row.name}</strong><em>成员组</em></span>
              <span className="fsdb-share-collaborator-role">{roleLabel(row.role)}</span>
              <button type="button" className="fsdb-share-remove" title="移除成员组" aria-label={`移除 ${row.name}`} onClick={() => void revoke('group', row.id)}>
                <XMarkIcon aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
          {memberViews.map((row) => {
            const sub = ['动态成员视图', grantorText(row.grantedBy, row.grantedByName)].filter(Boolean).join(' · ')
            const canEdit = row.canEdit !== false
            const canRevoke = row.canRevoke !== false
            return (
              <li key={`view:${row.id}:${row.grantedBy ?? ''}`}>
                <span className="fsdb-share-avatar is-view" aria-hidden><UsersIcon className="size-3.5" /></span>
                <span className="fsdb-share-collaborator-copy"><strong>{row.name}</strong><em>{sub}</em></span>
                {canEdit ? (
                  <ShareSelect
                    inline
                    value={row.role ?? 'editor'}
                    options={ROLE_OPTIONS}
                    ariaLabel={`调整 ${row.name} 的权限`}
                    placement="bottom-end"
                    minMenuWidth={168}
                    onChange={(next) => {
                      if (next !== row.role) void grant({ memberViewId: row.id }, 'internal', next)
                    }}
                  />
                ) : (
                  <span className="fsdb-share-collaborator-role">{roleLabel(row.role ?? '')}</span>
                )}
                {canRevoke ? (
                  <button
                    type="button"
                    className="fsdb-share-remove"
                    title={revokeTitle('移除成员视图', row.grantedBy, row.grantedByName)}
                    aria-label={`移除 ${row.name}`}
                    onClick={() => void revoke('member_view', row.id, row.grantedBy)}
                  >
                    <XMarkIcon aria-hidden className="size-3.5" />
                  </button>
                ) : null}
              </li>
            )
          })}
          {inheritedInternal.map((row) => (
            <li key={`inherited:${row.viewId}:${row.subjectType}:${row.subjectId}`} className="is-inherited">
              {row.subjectType === 'member_view'
                ? <span className="fsdb-share-avatar is-view" aria-hidden><UsersIcon className="size-3.5" /></span>
                : renderPersonAvatar(row.subjectId || row.name, row.avatar, 'is-view')}
              <span className="fsdb-share-collaborator-copy"><strong>{row.name}</strong><em>来自视图「{row.source}」</em></span>
              <span className="fsdb-share-collaborator-role">{roleLabel(row.role)}</span>
            </li>
          ))}
          {!internalCount ? <li className="is-empty">尚未添加内部协作者</li> : null}
        </ul>
        <div className="fsdb-share-invite-row">
          <div className="fsdb-share-member-picker">
            <input
              className="fsdb-share-link-field"
              type="search"
              role="combobox"
              aria-label="搜索空间成员"
              aria-expanded={memberPickerOpen}
              aria-controls="fsdb-share-member-options"
              autoComplete="off"
              value={memberQuery}
              placeholder="搜索空间成员或成员视图"
              data-testid="fsdb-share-member-search"
              onFocus={() => setMemberPickerOpen(true)}
              onBlur={() => window.setTimeout(() => setMemberPickerOpen(false), 120)}
              onChange={(event) => {
                setMemberQuery(event.target.value)
                setSelectedTarget(null)
                setMemberPickerOpen(true)
              }}
            />
            {memberPickerOpen ? (
              <div className="fsdb-share-member-options" id="fsdb-share-member-options" role="listbox">
                {matchingMemberViews.map((row) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedTarget?.kind === 'member_view' && selectedTarget.id === row.id}
                    data-testid="fsdb-share-member-view"
                    key={`view:${row.id}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setSelectedTarget({ kind: 'member_view', id: row.id, name: row.name })
                      setMemberQuery(row.name)
                      setMemberPickerOpen(false)
                    }}
                  >
                    <span className="fsdb-share-avatar is-view is-sm" aria-hidden><UsersIcon className="size-3.5" /></span>
                    <span className="fsdb-share-member-option-copy">
                      <strong>{row.name}</strong>
                      <em>动态成员视图</em>
                    </span>
                  </button>
                ))}
                {matchingMembers.map((row) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedTarget?.kind === 'member' && selectedTarget.id === row.id}
                    key={`member:${row.id}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setSelectedTarget({ kind: 'member', id: row.id, email: row.email, name: row.name })
                      setMemberQuery(row.name)
                      setMemberPickerOpen(false)
                    }}
                  >
                    {renderPersonAvatar(row.id || row.name, row.avatar, 'is-sm', 26)}
                    <span className="fsdb-share-member-option-copy">
                      <strong>{row.name}</strong>
                      <em>{row.email}</em>
                    </span>
                  </button>
                ))}
                {!matchingMemberViews.length && !matchingMembers.length ? <p>没有可添加的成员或视图</p> : null}
              </div>
            ) : null}
          </div>
          {roleSelect}
          <button type="button" className="fsdb-share-publish" disabled={!selectedTarget} data-testid="fsdb-share-member-add" onClick={() => {
            if (!selectedTarget) return
            if (selectedTarget.kind === 'member_view') void grant({ memberViewId: selectedTarget.id }, 'internal')
            else void grant({ email: selectedTarget.email }, 'internal')
          }}>添加</button>
        </div>
      </section>

      <section className="fsdb-share-collab-section is-external">
        <div className="fsdb-share-section-head">
          <h3>外部协作者</h3>
          {externalCount > 0 ? <span className="fsdb-share-section-count">{externalCount}</span> : null}
        </div>
        <ul className="fsdb-share-collaborators">
          {externalPeople.map((row) => {
            const sub = [row.email, grantorText(row.grantedBy, row.grantedByName)].filter(Boolean).join(' · ')
            const canEdit = Boolean(row.email && row.canEdit !== false)
            const canRevoke = row.canRevoke !== false
            return (
              <li key={`${row.id}:${row.grantedBy ?? ''}`}>
                {renderPersonAvatar(row.id || row.name, row.avatar, 'is-external')}
                <span className="fsdb-share-collaborator-copy"><strong>{row.name}</strong>{sub ? <em>{sub}</em> : null}</span>
                {canEdit ? (
                  <ShareSelect
                    inline
                    value={row.role}
                    options={ROLE_OPTIONS}
                    ariaLabel={`调整 ${row.name} 的权限`}
                    placement="bottom-end"
                    minMenuWidth={168}
                    onChange={(next) => {
                      if (next !== row.role) void grant({ email: row.email }, 'external', next)
                    }}
                  />
                ) : (
                  <span className="fsdb-share-collaborator-role">{roleLabel(row.role)}</span>
                )}
                {canRevoke ? (
                  <button
                    type="button"
                    className="fsdb-share-remove"
                    title={revokeTitle('移除协作者', row.grantedBy, row.grantedByName)}
                    aria-label={`移除 ${row.name}`}
                    onClick={() => void revoke('account', row.id, row.grantedBy)}
                  >
                    <XMarkIcon aria-hidden className="size-3.5" />
                  </button>
                ) : null}
              </li>
            )
          })}
          {inheritedExternal.map((row) => (
            <li key={`inherited:${row.viewId}:${row.subjectType}:${row.subjectId}`} className="is-inherited">
              {renderPersonAvatar(row.subjectId || row.name, row.avatar, 'is-external')}
              <span className="fsdb-share-collaborator-copy"><strong>{row.name}</strong><em>来自视图「{row.source}」</em></span>
              <span className="fsdb-share-collaborator-role">{roleLabel(row.role)}</span>
            </li>
          ))}
          {!externalCount ? <li className="is-empty">尚未添加外部协作者</li> : null}
        </ul>
        <div className="fsdb-share-invite-row">
          <input
            className="fsdb-share-link-field"
            type="email"
            value={email}
            placeholder="输入外部账号邮箱"
            data-testid="fsdb-share-member-email"
            onChange={(event) => setEmail(event.target.value)}
          />
          {roleSelect}
          <button type="button" className="fsdb-share-publish" disabled={!email.trim()} onClick={() => void grant({ email: email.trim() }, 'external')}>添加</button>
        </div>
        <div className="fsdb-share-guest-row" data-testid="fsdb-share-guest">
          <span className="fsdb-share-guest-info">
            <span className="fsdb-share-guest-icon" aria-hidden><LinkIcon className="size-3.5" /></span>
            <span><strong>临时访客</strong><em>{guestUrl ? '链接有效期 24 小时' : viewId ? '无需注册，仅可访问此视图' : '无需注册，仅可访问此内容'}</em></span>
          </span>
          <button type="button" onClick={() => void createGuestLink()}>{guestCopied ? '已复制' : guestUrl ? '重新生成' : '生成链接'}</button>
        </div>
      </section>
      {error ? <p className="fsdb-share-error is-inline">{error}</p> : null}
    </div>
  )
}

export function SharePanel({
  target,
  embedded = false,
  localOnly = false,
}: {
  target: ShareTarget
  embedded?: boolean
  localOnly?: boolean
}) {
  const [tab, setTab] = useState<'public' | 'collaboration'>('public')
  const [share, setShare] = useState<ShareInfo | null>(null)
  const [pin, setPin] = useState('')
  const [usePassword, setUsePassword] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (localOnly && tab !== 'public') setTab('public')
  }, [localOnly, tab])

  const params = new URLSearchParams({
    kind: target.kind,
    collection: target.collection,
    viewId: target.viewId ?? '',
    recordId: target.recordId ?? '',
  })

  useEffect(() => {
    let gone = false
    void readJson<SharePayload>(`/api/db/shares?${params}`).then((data) => {
      if (gone) return
      applyPayload(data)
    }).catch(() => {
      if (!gone) setShare(null)
    })
    return () => {
      gone = true
    }
  }, [target.kind, target.collection, target.viewId, target.recordId])

  function applyPayload(data: SharePayload, nextPin?: string, flagsOnly = false) {
    if (data.share === undefined) return
    if (!data.share) {
      setShare(null)
      setUsePassword(false)
      setPin('')
      return
    }
    setShare(data.share)
    if (flagsOnly) return
    const locked = Boolean(data.share.hasPassword)
    setUsePassword(locked)
    if (locked) {
      const remembered = nextPin ?? rememberedPin(data.share.token)
      setPin(remembered)
      if (nextPin) rememberPin(data.share.token, nextPin)
    } else {
      setPin('')
      rememberPin(data.share.token, '')
    }
  }

  async function publish(
    patch: {
      password?: string | null
      enabled?: boolean
      sharePlugins?: boolean
      allowCopy?: boolean
    },
    opts: { quiet?: boolean; pin?: string; flagsOnly?: boolean } = {},
  ) {
    if (!opts.quiet) {
      setBusy(true)
      setError('')
    }
    try {
      const data = await readJson<SharePayload>('/api/db/shares', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: target.kind,
          collection: target.collection,
          viewId: target.viewId ?? '',
          recordId: target.recordId ?? '',
          ...patch,
        }),
      })
      applyPayload(data, opts.pin, opts.flagsOnly)
      if (patch.enabled === false && data.share == null && share) rememberPin(share.token, '')
      emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
      return data.share
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err))
      return null
    } finally {
      if (!opts.quiet) setBusy(false)
    }
  }

  async function copyShare() {
    setError('')
    let live = share
    let livePin = pin
    if (!live) {
      live = await publish({})
    } else if ((usePassword || live.hasPassword) && pin.length === 6 && pin !== rememberedPin(live.token)) {
      live = (await publish({ password: pin }, { quiet: true, pin })) ?? live
      livePin = pin
    }
    if (!live) return
    const locked = usePassword || live.hasPassword
    if (locked && !livePin) {
      setError('密码已设置。换一组后即可连同链接一起复制。')
      return
    }
    try {
      await navigator.clipboard.writeText(shareClipboardText(live.url, locked ? livePin : ''))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setError('无法复制，请重试')
    }
  }

  function togglePassword(on: boolean) {
    setUsePassword(on)
    if (!on) {
      setPin('')
      if (share) {
        rememberPin(share.token, '')
        void publish({ password: '' }, { quiet: true })
      }
      return
    }
    const next = mintSharePin()
    setPin(next)
    void publish({ password: next }, { quiet: true, pin: next }).then((live) => {
      if (live) rememberPin(live.token, next)
    })
  }

  const copyReady = !usePassword || Boolean(pin)

  return (
    <div className={`fsdb-share-panel${embedded ? ' is-embedded' : ''}`} role="dialog" aria-label="分享" data-testid="fsdb-share-panel">
      <div className="fsdb-share-tabs" role="tablist" aria-label="分享方式">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'public'}
          className={tab === 'public' ? 'is-on' : ''}
          data-testid="fsdb-share-public-tab"
          onClick={() => setTab('public')}
        >
          {localOnly ? '局域网分享' : '公开分享'}
        </button>
        {!localOnly && ((target.kind === 'record' && target.recordId) || (target.kind === 'view' && target.viewId)) ? (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'collaboration'}
            className={tab === 'collaboration' ? 'is-on' : ''}
            data-testid="fsdb-share-collaboration-tab"
            onClick={() => setTab('collaboration')}
          >
            邀请协作
          </button>
        ) : null}
      </div>
      {tab === 'collaboration' && ((target.kind === 'record' && target.recordId) || (target.kind === 'view' && target.viewId)) ? (
        <WorkspaceAccess collection={target.collection} recordId={target.recordId} viewId={target.kind === 'view' ? target.viewId : ''} />
      ) : null}
      {tab === 'public' ? <><section className="fsdb-share-link-section">
        {!share ? (
          <div className="fsdb-share-empty">
            <span>
              <p className="fsdb-share-empty-title">{localOnly ? '局域网链接' : '公开链接'}</p>
              <p className="fsdb-share-empty-copy">
                {localOnly ? '仅在本机服务运行且处于同一局域网时可访问' : '获得链接的人可以查看'}
              </p>
            </span>
            <button
              type="button"
              className="fsdb-share-publish"
              disabled={busy}
              data-testid="fsdb-share-enable"
              onClick={() => void copyShare()}
            >
              {busy ? '正在开启…' : copied ? '已复制' : '开启并复制'}
            </button>
          </div>
        ) : (
          <>
            <div className="fsdb-share-public-state">
              <span><i aria-hidden />{localOnly ? '局域网链接已开启' : '公开链接已开启'}</span>
              <button
                type="button"
                disabled={busy}
                data-testid="fsdb-share-stop"
                onClick={() => void publish({ enabled: false })}
              >
                关闭
              </button>
            </div>
            <div className="fsdb-share-link-row">
              <div className="fsdb-share-link-field">
                <LinkIcon aria-hidden className="size-4" />
                <input
                  readOnly
                  value={share.url}
                  aria-label="分享链接"
                  data-testid="fsdb-share-url"
                  onFocus={(event) => event.currentTarget.select()}
                />
              </div>
              <button
                type="button"
                className="fsdb-share-copy"
                disabled={busy || !copyReady}
                title={copyReady ? '复制链接' : '换一组密码后即可复制'}
                data-testid="fsdb-share-copy"
                onClick={() => void copyShare()}
              >
                {copied ? <CheckIcon aria-hidden className="size-4" /> : null}
                {copied ? '已复制' : '复制链接'}
              </button>
            </div>
            {usePassword ? <p className="fsdb-share-copy-note">复制时会同时包含链接和密码。</p> : null}
          </>
        )}
      </section>
      {share ? (
        <>
          <section className="fsdb-share-settings" aria-label={localOnly ? '局域网链接设置' : '公开链接设置'}>
            <div className="fsdb-share-setting">
              <span className="fsdb-share-setting-copy">
                <strong>密码保护</strong>
              </span>
              <ShareToggle
                on={usePassword}
                label="密码保护"
                testId="fsdb-share-password-toggle"
                onChange={togglePassword}
              />
            </div>
            {usePassword ? (
              <div className="fsdb-share-pin">
                <span>
                  密码
                  <strong data-testid="fsdb-share-password">{pin || '······'}</strong>
                </span>
                <button type="button" data-testid="fsdb-share-rotate-pin" onClick={() => togglePassword(true)}>
                  <ArrowPathIcon aria-hidden className="size-4" />
                  换一组
                </button>
              </div>
            ) : (
              <div className="fsdb-share-pin is-collapsed" hidden />
            )}
            <div className="fsdb-share-setting">
              <span className="fsdb-share-setting-copy">
                <strong>分享插件</strong>
              </span>
              <ShareToggle
                on={share.sharePlugins}
                label="分享插件"
                testId="fsdb-share-plugins"
                onChange={(on) => {
                  setShare({ ...share, sharePlugins: on })
                  void publish({ sharePlugins: on }, { quiet: true, flagsOnly: true })
                }}
              />
            </div>
            <div className="fsdb-share-setting">
              <span className="fsdb-share-setting-copy">
                <strong>允许复制</strong>
              </span>
              <ShareToggle
                on={share.allowCopy !== false}
                label="允许复制"
                testId="fsdb-share-allow-copy"
                onChange={(on) => {
                  setShare({ ...share, allowCopy: on })
                  void publish({ allowCopy: on }, { quiet: true, flagsOnly: true })
                }}
              />
            </div>
          </section>
        </>
      ) : null}
      </> : null}
      {error ? <p className="fsdb-share-error">{error}</p> : null}
    </div>
  )
}
