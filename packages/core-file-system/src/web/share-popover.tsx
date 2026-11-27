import { readStorageString, removeStorageKey, writeStorageString } from '@biu/biu-ui/client-storage'
import { AiAvatar } from '@biu/biu-ui/ai-avatar'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowPathIcon, CheckIcon, ChevronDownIcon, LinkIcon, LockClosedIcon, ShareIcon, UserGroupIcon, XMarkIcon } from '@heroicons/react/16/solid'
import { HeadlessDismiss } from '@biu/biu-ui/headless-dismiss'
import { useFloatingPosition } from '@biu/biu-ui/floating-position'
import { OVERLAY_Z, overlayPortalRoot, overlayZ } from '@biu/biu-ui/overlay-portal'
import { WORKSPACE_MEMBERS_COLLECTION_PATH } from './database-path.ts'
import { listCollection, readJson } from './db-client.ts'
import { FSDB_SHARES_CHANGE_EVENT, emitFsdbEvent } from './fsdb-events.ts'

export { ShareScopeLabel, ShareRoleLabel } from './share-scope-label.tsx'
export { ShareScopeDetail, ShareRoleDetail } from './share-chain-detail.tsx'
import { ScopeMark } from './share-scope-label.tsx'
import { roleLabel } from './share-chain-detail.tsx'
import { mintSharePin, shareClipboardText } from '../share-resources.ts'

export type ShareKind = 'record'

export type ShareTarget = {
  kind: ShareKind
  collection: string
  recordId: string
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
  const [hasActiveShare, setHasActiveShare] = useState(false)

  useEffect(() => {
    if (!target) {
      setHasActiveShare(false)
      return
    }
    let gone = false
    const check = async () => {
      try {
        const params = new URLSearchParams({
          kind: 'record',
          collection: target.collection,
          recordId: target.recordId,
        })
        const shareData = await readJson<SharePayload>(`/api/db/shares?${params}`).catch(() => ({ share: null }))
        if (gone) return
        if (shareData.share) {
          setHasActiveShare(true)
          return
        }
        if (!localOnly && target.recordId) {
          const accessParams = new URLSearchParams({ collection: target.collection, recordId: target.recordId })
          const accessData = await readJson<{
            scope?: string
            ownerId?: string
            people?: Array<{ id?: string; role?: string }>
            groups?: unknown[]
          }>(`/api/account/access?${accessParams}`).catch(() => null)
          if (gone) return
          const nonOwnerPeople = (accessData?.people ?? []).filter(
            (p) => p.role !== 'owner' && (!accessData?.ownerId || p.id !== accessData.ownerId),
          )
          if (
            nonOwnerPeople.length > 0 ||
            (accessData?.groups?.length ?? 0) > 0 ||
            (accessData?.scope && accessData.scope !== 'personal')
          ) {
            setHasActiveShare(true)
            return
          }
        }
        if (!gone) setHasActiveShare(false)
      } catch {
        if (!gone) setHasActiveShare(false)
      }
    }
    void check()
    const onChange = () => void check()
    window.addEventListener(FSDB_SHARES_CHANGE_EVENT, onChange)
    return () => {
      gone = true
      window.removeEventListener(FSDB_SHARES_CHANGE_EVENT, onChange)
    }
  }, [target?.collection, target?.recordId, localOnly])

  if (!target) return null
  return (
    <div className="fsdb-share-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`${buttonClassName}${open || hasActiveShare ? ' is-active' : ''}`}
        style={hasActiveShare ? { color: 'var(--biu-color-emphasis)' } : undefined}
        title={hasActiveShare ? '已开启分享' : '分享'}
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
  recordId,
}: {
  collection: string
  recordId: string
}) {
  const [email, setEmail] = useState('')
  const [scope, setScope] = useState<'personal' | 'workspace' | 'shared'>('personal')
  const [hasExternalCollaborator, setHasExternalCollaborator] = useState(false)
  const [accessMode, setAccessMode] = useState<'inherit' | 'private' | 'members'>('private')
  const [memberDefaultRole, setMemberDefaultRole] = useState<'viewer' | 'editor'>('viewer')
  const [ownerId, setOwnerId] = useState('')
  const [currentAccountId, setCurrentAccountId] = useState('')
  const [canManage, setCanManage] = useState(true)
  const [statusNotice, setStatusNotice] = useState('')
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
  const [memberViews, setMemberViews] = useState<Array<{
    id: string
    name: string
    role: string
    canEdit?: boolean
    canRevoke?: boolean
  }>>([])
  const [availableMemberViews, setAvailableMemberViews] = useState<Array<{
    id: string
    name: string
    protection: 'public' | 'locked' | 'personal'
    isLocked: boolean
    memberCount: number
  }>>([])
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
    | { kind: 'member_view'; id: string; name: string; isLocked: boolean; memberCount: number }
    | null
  >(null)
  const [memberPickerOpen, setMemberPickerOpen] = useState(false)
  const [role, setRole] = useState<'viewer' | 'commenter' | 'editor' | 'manager'>('editor')
  const [guestUrl, setGuestUrl] = useState('')
  const [guestCopied, setGuestCopied] = useState(false)
  const [inheritance, setInheritance] = useState<{ mode: 'inherit' | 'custom'; hasParent: boolean }>({ mode: 'custom', hasParent: false })
  const [inheritanceBusy, setInheritanceBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const data = await readJson<{
      scope?: 'personal' | 'workspace' | 'shared'
      hasExternalCollaborator?: boolean
      accessMode?: 'inherit' | 'private' | 'members'
      memberDefaultRole?: 'viewer' | 'editor'
      ownerId?: string
      currentAccountId?: string
      canManage?: boolean
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
      memberViews?: Array<{
        id: string
        name: string
        role: string
        canEdit?: boolean
        canRevoke?: boolean
      }>
      inheritance?: {
        mode?: 'inherit' | 'custom'
        hasParent?: boolean
      }
    }>(`/api/account/access?collection=${encodeURIComponent(collection)}&recordId=${encodeURIComponent(recordId)}`)
    setScope(data.scope ?? 'personal')
    setHasExternalCollaborator(Boolean(data.hasExternalCollaborator))
    setAccessMode(data.accessMode ?? (data.scope === 'workspace' ? 'members' : 'private'))
    setMemberDefaultRole(data.memberDefaultRole === 'editor' ? 'editor' : 'viewer')
    setOwnerId(data.ownerId ?? '')
    setCurrentAccountId(data.currentAccountId ?? '')
    setCanManage(data.canManage !== false)
    setPeople(data.people ?? [])
    setMemberViews(data.memberViews ?? [])
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
    void readJson<{ views?: Array<{ id: string; name: string; protection: 'public' | 'locked' | 'personal'; isLocked: boolean; memberCount: number }> }>(
      '/api/db/member-views',
    )
      .then((res) => {
        setAvailableMemberViews(Array.isArray(res.views) ? res.views : [])
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
            name: String(row.title ?? '').trim() || String(row.name ?? '').trim() || email,
            ...(avatar ? { avatar } : {}),
            role: String(row.role ?? ''),
          }]
        }))
      })
      .catch((error) => {
        console.warn('[share-popover] load workspace members failed', error)
        setWorkspaceMembers([])
      })
  }, [collection, recordId])

  function grant(
    input: { email?: string; memberViewId?: string },
    collaboratorKind: 'internal' | 'external' = 'internal',
    nextRole?: string,
  ) {
    setError('')
    setStatusNotice('')
    return readJson(`/api/account/access`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        collection,
        recordId,
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

  async function grantUnlockedMemberViewSnapshot(viewId: string, viewName: string) {
    setError('')
    setStatusNotice('')
    try {
      const resolved = await readJson<{ members?: Array<{ id: string; name?: string }> }>(
        `/api/db/member-views/${encodeURIComponent(viewId)}/resolve`,
      )
      const matched = (resolved.members ?? []).filter(
        (m) => m.id && m.id !== ownerId && m.id !== currentAccountId,
      )
      if (!matched.length) {
        setError(`「${viewName}」当前没有可添加的其他成员`)
        return
      }
      await readJson('/api/db/batch-permissions/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          collection,
          recordIds: [recordId],
          mode: 'grant',
          role,
          subjects: matched.map((m) => ({ type: 'account', id: m.id })),
        }),
      })
      setMemberQuery('')
      setSelectedTarget(null)
      setMemberPickerOpen(false)
      setStatusNotice(`已按「${viewName}」一次性展开添加 ${matched.length} 位成员`)
      emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法展开添加成员')
    }
  }

  async function revoke(subjectType: 'account' | 'member_view', subjectId: string, grantedBy?: string) {
    setError('')
    setStatusNotice('')
    try {
      await readJson('/api/account/access', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          collection,
          recordId,
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

  async function updateGeneralAccess(nextAccessMode: 'private' | 'members', nextMemberDefaultRole?: 'viewer' | 'editor') {
    if (!recordId) return
    setError('')
    setStatusNotice('')
    setInheritanceBusy(true)
    try {
      await readJson('/api/account/access', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          collection,
          recordId,
          accessMode: nextAccessMode,
          ...(nextAccessMode === 'members' ? { memberDefaultRole: nextMemberDefaultRole ?? memberDefaultRole } : {}),
        }),
      })
      emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法更新通用访问设置')
    } finally {
      setInheritanceBusy(false)
    }
  }

  async function toggleInheritance(on: boolean) {
    if (!recordId) return
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
          recordId,
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

  const internalPeople = people.filter((row) => row.memberKind === 'member')
  const externalPeople = people.filter((row) => row.memberKind === 'external' || row.memberKind === 'guest')
  const shownScope = scope
  const grantedAccountIds = new Set(people.map((row) => row.id))
  const grantedViewIds = new Set(memberViews.map((row) => row.id))
  const normalizedMemberQuery = memberQuery.trim().toLowerCase()
  const matchingMemberViews = availableMemberViews
    .filter((row) => !(row.isLocked && grantedViewIds.has(row.id)))
    .filter((row) => !normalizedMemberQuery || `${row.name} 成员视图 动态组 快捷名单`.toLowerCase().includes(normalizedMemberQuery))
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

  const internalCount = internalPeople.length + memberViews.length
  const externalCount = externalPeople.length
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

  const isMembersOpen = accessMode === 'members' || (accessMode === 'inherit' && shownScope === 'workspace')

  return (
    <div className="fsdb-share-link-section" data-testid="fsdb-share-members">
      <div className="fsdb-share-collab-summary">
        <span>可见范围</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <strong className={`fsdb-share-scope is-${shownScope}`} data-testid="fsdb-share-scope"><ScopeMark scope={shownScope} /></strong>
          {hasExternalCollaborator ? (
            <span
              data-testid="fsdb-share-external-pill"
              style={{
                fontSize: 11,
                padding: '1px 6px',
                borderRadius: 999,
                border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                color: 'var(--biu-color-text-muted)',
              }}
            >
              含外部协作者
            </span>
          ) : null}
        </div>
      </div>
      {statusNotice ? (
        <div style={{ fontSize: 12, color: 'var(--biu-color-emphasis)', marginTop: 4 }} data-testid="fsdb-share-status-notice">
          {statusNotice}
        </div>
      ) : null}
      {canManage ? (
        <div className="fsdb-share-inherit-row" data-testid="fsdb-share-general-access">
          <span>
            <strong>通用访问</strong>
            <em>{isMembersOpen ? '空间内所有成员均可访问（不影响下方个人/外链授权）' : '仅所有者与下方受邀人员可访问'}</em>
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShareSelect
              inline
              value={isMembersOpen ? 'members' : 'private'}
              options={[
                { value: 'private', label: '仅受邀人员', hint: '仅所有者与受邀成员可访问' },
                { value: 'members', label: '空间全员', hint: '空间内所有成员均可访问' },
              ]}
              ariaLabel="通用访问范围"
              placement="bottom-end"
              minMenuWidth={180}
              onChange={(next) => {
                if (next === 'members' || next === 'private') {
                  void updateGeneralAccess(next)
                }
              }}
            />
            {isMembersOpen ? (
              <ShareSelect
                inline
                value={memberDefaultRole}
                options={[
                  { value: 'viewer', label: '可查看', hint: '空间成员默认可查看' },
                  { value: 'editor', label: '可编辑', hint: '空间成员默认可编辑' },
                ]}
                ariaLabel="空间全员默认权限"
                placement="bottom-end"
                minMenuWidth={160}
                onChange={(next) => {
                  if (next === 'viewer' || next === 'editor') {
                    void updateGeneralAccess('members', next)
                  }
                }}
              />
            ) : null}
          </div>
        </div>
      ) : null}
      {inheritance.hasParent ? (
        <div className="fsdb-share-inherit-row" data-testid="fsdb-share-inherit">
          <span>
            <strong>继承上级权限</strong>
            <em>{inheritance.mode === 'inherit' ? '自动沿用上级内容的通用访问与协作者权限' : '已断开继承，按本条独立设置生效'}</em>
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
            const isSelf = Boolean(currentAccountId && row.id === currentAccountId)
            const canEdit = Boolean(row.email && row.role !== 'owner' && !isSelf && row.canEdit !== false)
            const canRevoke = Boolean(row.role !== 'owner' && !isSelf && row.canRevoke !== false)
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
          {memberViews.map((row) => {
            const canEdit = canManage && row.canEdit !== false
            const canRevoke = canManage && row.canRevoke !== false
            return (
              <li key={`member_view:${row.id}`}>
                <span className="fsdb-share-avatar is-view" aria-hidden><LockClosedIcon className="size-3.5" /></span>
                <span className="fsdb-share-collaborator-copy"><strong>{row.name}</strong><em>锁定成员视图 · 动态同步</em></span>
                {canEdit ? (
                  <ShareSelect
                    inline
                    value={row.role || 'editor'}
                    options={ROLE_OPTIONS}
                    ariaLabel={`调整 ${row.name} 的权限`}
                    placement="bottom-end"
                    minMenuWidth={168}
                    onChange={(next) => {
                      if (next !== row.role) void grant({ memberViewId: row.id }, 'internal', next)
                    }}
                  />
                ) : (
                  <span className="fsdb-share-collaborator-role">{roleLabel(row.role)}</span>
                )}
                {canRevoke ? (
                  <button type="button" className="fsdb-share-remove" title="移除成员视图授权" aria-label={`移除 ${row.name}`} onClick={() => void revoke('member_view', row.id)}>
                    <XMarkIcon aria-hidden className="size-3.5" />
                  </button>
                ) : null}
              </li>
            )
          })}
          {!internalCount ? <li className="is-empty">尚未添加内部协作者</li> : null}
        </ul>
        {canManage ? (
        <div className="fsdb-share-invite-row">
          <div className="fsdb-share-member-picker">
            <input
              className="fsdb-share-link-field"
              type="search"
              role="combobox"
              aria-label="搜索空间成员或成员视图"
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
                    data-testid="fsdb-share-member-view-option"
                    key={`member_view:${row.id}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setSelectedTarget({ kind: 'member_view', id: row.id, name: row.name, isLocked: row.isLocked, memberCount: row.memberCount })
                      setMemberQuery(row.name)
                      setMemberPickerOpen(false)
                    }}
                  >
                    <span className="fsdb-share-avatar is-view is-sm" aria-hidden>
                      {row.isLocked ? <LockClosedIcon className="size-3.5" /> : <UserGroupIcon className="size-3.5" />}
                    </span>
                    <span className="fsdb-share-member-option-copy">
                      <strong>{row.name}</strong>
                      <em>{row.isLocked ? `动态组 · ${row.memberCount} 人 · 自动同步` : `快捷名单 · 按当前 ${row.memberCount} 人展开`}</em>
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
                {!matchingMemberViews.length && !matchingMembers.length ? <p>没有可添加的成员或成员视图</p> : null}
              </div>
            ) : null}
          </div>
          {roleSelect}
          <button type="button" className="fsdb-share-publish" disabled={!selectedTarget} data-testid="fsdb-share-member-add" onClick={() => {
            if (!selectedTarget) return
            if (selectedTarget.kind === 'member_view') {
              if (selectedTarget.isLocked) void grant({ memberViewId: selectedTarget.id }, 'internal')
              else void grantUnlockedMemberViewSnapshot(selectedTarget.id, selectedTarget.name)
            } else {
              void grant({ email: selectedTarget.email }, 'internal')
            }
          }}>添加</button>
        </div>
        ) : null}
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
          {!externalCount ? <li className="is-empty">尚未添加外部协作者</li> : null}
        </ul>
        {canManage ? (
          <>
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
                <span><strong>临时访客</strong><em>{guestUrl ? '链接有效期 24 小时' : '无需注册，仅可访问此内容'}</em></span>
              </span>
              <button type="button" onClick={() => void createGuestLink()}>{guestCopied ? '已复制' : guestUrl ? '重新生成' : '生成链接'}</button>
            </div>
          </>
        ) : null}
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
    kind: 'record',
    collection: target.collection,
    recordId: target.recordId,
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
  }, [target.collection, target.recordId])

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
          kind: 'record',
          collection: target.collection,
          recordId: target.recordId,
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
        {!localOnly && target.recordId ? (
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
      {tab === 'collaboration' && target.recordId ? (
        <WorkspaceAccess collection={target.collection} recordId={target.recordId} />
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
