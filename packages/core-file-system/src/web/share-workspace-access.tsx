import { useEffect, useState } from 'react'
import { LinkIcon, LockClosedIcon, UserGroupIcon, XMarkIcon } from '@heroicons/react/16/solid'
import {
  applyBatchPermissions,
  createGuestInvite,
  fetchMemberViews,
  fetchRecordAccess,
  grantRecordAccess,
  patchRecordAccess,
  resolveMemberView,
  revokeRecordAccess,
} from './authz-api.ts'
import { WORKSPACE_MEMBERS_COLLECTION_PATH } from './database-path.ts'
import { listCollection } from './db-client.ts'
import { FSDB_SHARES_CHANGE_EVENT, emitFsdbEvent } from './fsdb-events.ts'
import { roleActionLabel as roleLabel } from '../shared/authz-labels.ts'
import {
  MEMBER_DEFAULT_ROLE_OPTIONS,
  ROLE_OPTIONS,
  ShareSelect,
  ShareToggle,
  notifyViewShareChanged,
  renderShareAvatar,
  type ShareRole,
} from './share-controls.tsx'
import { ScopeMark } from './share-scope-label.tsx'

type AccessPerson = {
  id: string
  name: string
  avatar?: string
  email: string
  role: string
  memberKind: 'member' | 'external' | 'guest'
  canEdit?: boolean
  canRevoke?: boolean
}

type AccessMemberView = {
  id: string
  name: string
  role: string
  canEdit?: boolean
  canRevoke?: boolean
}

type InheritedAncestor = {
  collection: string
  recordId: string
  title?: string
  scope?: 'personal' | 'workspace' | 'shared'
  memberDefaultRole?: 'viewer' | 'editor'
  ownerId?: string
  people?: Array<Omit<AccessPerson, 'canEdit' | 'canRevoke'>>
  memberViews?: Array<Omit<AccessMemberView, 'canEdit' | 'canRevoke'>>
}

export function WorkspaceAccess({
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
  const [people, setPeople] = useState<AccessPerson[]>([])
  const [memberViews, setMemberViews] = useState<AccessMemberView[]>([])
  const [availableMemberViews, setAvailableMemberViews] = useState<Array<{
    id: string
    name: string
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
  const isAgentCollection = collection === '/agents'
  const [policy, setPolicy] = useState<{
    allowExternalShare: boolean
    allowAgentEditShare: boolean
  }>({
    allowExternalShare: true,
    allowAgentEditShare: true,
  })
  const agentRoleOptions: ReadonlyArray<{ value: ShareRole; label: string; hint: string }> = [
    { value: 'viewer', label: '可查看', hint: '查看聊天记录，可 Fork 为自己的代理' },
    ...(policy.allowAgentEditShare
      ? [{ value: 'editor' as ShareRole, label: '可编辑', hint: '可重命名与调整配置，但不能直接对话' }]
      : []),
  ]
  const effectiveRoleOptions = isAgentCollection ? agentRoleOptions : ROLE_OPTIONS
  const effectiveExternalRoleOptions = isAgentCollection ? agentRoleOptions : ROLE_OPTIONS
  const effectiveMemberDefaultRoleOptions = isAgentCollection
    ? [
        { value: 'viewer' as const, label: '可查看', hint: '查看聊天记录，可 Fork 为自己的代理' },
        ...(policy.allowAgentEditShare
          ? [{ value: 'editor' as const, label: '可编辑', hint: '可重命名与调整配置，但不能直接对话' }]
          : []),
      ]
    : MEMBER_DEFAULT_ROLE_OPTIONS
  const [role, setRole] = useState<ShareRole>(isAgentCollection ? 'viewer' : 'editor')
  const [externalRole, setExternalRole] = useState<ShareRole>(isAgentCollection ? 'viewer' : 'editor')
  const [guestUrl, setGuestUrl] = useState('')
  const [guestCopied, setGuestCopied] = useState(false)
  const [inheritance, setInheritance] = useState<{
    mode: 'inherit' | 'custom'
    hasParent: boolean
    parentTitle?: string
    ancestors: InheritedAncestor[]
  }>({ mode: 'custom', hasParent: false, ancestors: [] })
  const [inheritanceBusy, setInheritanceBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const data = await fetchRecordAccess<{
      scope?: 'personal' | 'workspace' | 'shared'
      hasExternalCollaborator?: boolean
      accessMode?: 'inherit' | 'private' | 'members'
      memberDefaultRole?: 'viewer' | 'editor'
      ownerId?: string
      currentAccountId?: string
      canManage?: boolean
      people?: AccessPerson[]
      memberViews?: AccessMemberView[]
      policy?: {
        allowExternalShare?: boolean
        allowAgentEditShare?: boolean
      }
      inheritance?: {
        mode?: 'inherit' | 'custom'
        hasParent?: boolean
        parent?: { collection: string; recordId: string; title?: string } | null
        ancestors?: InheritedAncestor[]
      }
    }>(collection, recordId)
    setScope(data.scope ?? 'personal')
    setHasExternalCollaborator(Boolean(data.hasExternalCollaborator))
    setAccessMode(data.accessMode ?? (data.scope === 'workspace' ? 'members' : 'private'))
    setMemberDefaultRole(data.memberDefaultRole === 'editor' ? 'editor' : 'viewer')
    setOwnerId(data.ownerId ?? '')
    setCurrentAccountId(data.currentAccountId ?? '')
    setCanManage(data.canManage !== false)
    setPeople(data.people ?? [])
    setMemberViews(data.memberViews ?? [])
    if (data.policy) {
      const nextPolicy = {
        allowExternalShare: data.policy.allowExternalShare !== false,
        allowAgentEditShare: data.policy.allowAgentEditShare !== false,
      }
      setPolicy(nextPolicy)
      if (isAgentCollection) {
        setRole((prev) => (prev === 'editor' && !nextPolicy.allowAgentEditShare ? 'viewer' : prev === 'manager' ? 'viewer' : prev))
        setExternalRole((prev) => (prev === 'editor' && !nextPolicy.allowAgentEditShare ? 'viewer' : prev === 'manager' ? 'viewer' : prev))
      }
    }
    setInheritance({
      mode: data.inheritance?.mode === 'inherit' ? 'inherit' : 'custom',
      hasParent: Boolean(data.inheritance?.hasParent),
      parentTitle: data.inheritance?.parent?.title,
      ancestors: Array.isArray(data.inheritance?.ancestors) ? data.inheritance!.ancestors : [],
    })
  }

  useEffect(() => {
    void load().catch((error) => {
      console.warn('[share-popover] load grants failed', collection, error)
      setPeople([])
    })
    void fetchMemberViews()
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
    return grantRecordAccess({
      collection,
      recordId,
      role: nextRole ?? role,
      ...(input.email ? { collaboratorKind } : {}),
      ...input,
    })
      .then(() => {
        if (!nextRole) {
          setEmail('')
          setMemberQuery('')
          setSelectedTarget(null)
          setMemberPickerOpen(false)
        }
        emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
        notifyViewShareChanged(collection, recordId)
        return load()
      })
      .catch((err) => setError(err instanceof Error ? err.message : '无法授权'))
  }

  async function grantUnlockedMemberViewSnapshot(viewId: string, viewName: string) {
    setError('')
    setStatusNotice('')
    try {
      const resolved = await resolveMemberView<{ id: string; name?: string }>(viewId)
      const matched = (resolved.members ?? []).filter(
        (m) => m.id && m.id !== ownerId && m.id !== currentAccountId,
      )
      if (!matched.length) {
        setError(`「${viewName}」当前没有可添加的其他成员`)
        return
      }
      await applyBatchPermissions({
        collection,
        recordIds: [recordId],
        mode: 'grant',
        role,
        subjects: matched.map((m) => ({ type: 'account', id: m.id })),
      })
      setMemberQuery('')
      setSelectedTarget(null)
      setMemberPickerOpen(false)
      setStatusNotice(`已按「${viewName}」一次性展开添加 ${matched.length} 位成员`)
      emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
      notifyViewShareChanged(collection, recordId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法展开添加成员')
    }
  }

  async function revoke(subjectType: 'account' | 'member_view', subjectId: string) {
    setError('')
    setStatusNotice('')
    try {
      await revokeRecordAccess({
        collection,
        recordId,
        subjectType,
        subjectId,
      })
      emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
      notifyViewShareChanged(collection, recordId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法移除协作者')
    }
  }

  async function updateGeneralAccess(nextAccessMode: 'private' | 'members', nextMemberDefaultRole?: 'viewer' | 'editor') {
    if (!recordId) return
    const wasInheriting = inheritance.mode === 'inherit'
    setError('')
    setStatusNotice('')
    setInheritanceBusy(true)
    try {
      await patchRecordAccess({
        collection,
        recordId,
        accessMode: nextAccessMode,
        ...(nextAccessMode === 'members' ? { memberDefaultRole: nextMemberDefaultRole ?? memberDefaultRole } : {}),
      })
      if (wasInheriting) {
        setStatusNotice('已切换为独立通用访问，已自动关闭「继承上级权限」')
      }
      emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
      notifyViewShareChanged(collection, recordId)
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
      await patchRecordAccess({
        collection,
        recordId,
        inheritanceMode: on ? 'inherit' : 'custom',
      })
      emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
      notifyViewShareChanged(collection, recordId)
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
      const data = await createGuestInvite({
        collection,
        recordId,
        role: role === 'editor' ? 'editor' : 'viewer',
        expiresInHours: 24,
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
      options={effectiveRoleOptions}
      ariaLabel="权限"
      placement="bottom-end"
      minMenuWidth={208}
      onChange={(next) => setRole(next)}
    />
  )

  const externalRoleSelect = (
    <ShareSelect
      value={externalRole}
      options={effectiveExternalRoleOptions}
      ariaLabel="外部协作者权限"
      placement="bottom-end"
      minMenuWidth={208}
      onChange={(next) => setExternalRole(next)}
    />
  )

  const internalCount = internalPeople.length + memberViews.length
  const externalCount = externalPeople.length

  const isMembersOpen = accessMode === 'members' || (accessMode === 'inherit' && shownScope === 'workspace')
  const inheritedEntries = (() => {
    if (inheritance.mode !== 'inherit' || !inheritance.ancestors.length) return []
    const rank = (r: string) =>
      r === 'owner' ? 5 : r === 'manager' ? 4 : r === 'editor' ? 3 : r === 'commenter' ? 2 : 1
    type InheritedRow = {
      key: string
      kind: 'workspace_members' | 'account' | 'member_view'
      id: string
      name: string
      avatar?: string
      memberKind?: 'member' | 'external' | 'guest'
      role: string
      sourceTitle: string
    }
    const byKey = new Map<string, InheritedRow>()
    const upsert = (row: InheritedRow) => {
      const prev = byKey.get(row.key)
      if (!prev || rank(row.role) > rank(prev.role)) {
        byKey.set(row.key, row)
      }
    }
    for (const anc of inheritance.ancestors) {
      const sourceTitle = anc.title?.trim() || '上级内容'
      if (anc.scope === 'workspace') {
        upsert({
          key: 'workspace_members',
          kind: 'workspace_members',
          id: 'workspace_members',
          name: '全部空间成员',
          role: anc.memberDefaultRole === 'editor' ? 'editor' : 'viewer',
          sourceTitle,
        })
      }
      for (const person of anc.people ?? []) {
        if (person.id === anc.ownerId) continue
        upsert({
          key: `account:${person.id}`,
          kind: 'account',
          id: person.id,
          name: person.name,
          avatar: person.avatar,
          memberKind: person.memberKind,
          role: person.role,
          sourceTitle,
        })
      }
      for (const mv of anc.memberViews ?? []) {
        upsert({
          key: `member_view:${mv.id}`,
          kind: 'member_view',
          id: mv.id,
          name: mv.name,
          role: mv.role,
          sourceTitle,
        })
      }
    }
    return [...byKey.values()]
  })()

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
      {isAgentCollection ? (
        <div
          style={{ fontSize: 12, color: 'var(--biu-color-text-muted)', marginTop: 4, lineHeight: 1.5 }}
          data-testid="fsdb-share-agent-roles-hint"
        >
          代理权限：<strong>可查看</strong>可查看记录并 Fork 为自己的代理；<strong>可编辑</strong>可改名与调整配置，仅创建者本人可直接对话与操作。
        </div>
      ) : null}
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
                value={isAgentCollection && !policy.allowAgentEditShare ? 'viewer' : memberDefaultRole}
                options={effectiveMemberDefaultRoleOptions}
                ariaLabel="空间全员默认权限"
                placement="bottom-end"
                minMenuWidth={190}
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
            <em>
              {inheritance.mode === 'inherit'
                ? `自动沿用${inheritance.parentTitle ? `「${inheritance.parentTitle}」` : '上级内容'}的通用访问、协作者与公开分享（本条可额外叠加）`
                : '已断开继承，按本条独立设置生效'}
            </em>
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

      {inheritedEntries.length > 0 ? (
        <section className="fsdb-share-collab-section is-inherited" data-testid="fsdb-share-inherited">
          <div className="fsdb-share-section-head">
            <h3>继承自上级</h3>
            <span className="fsdb-share-section-count">{inheritedEntries.length}</span>
          </div>
          <ul className="fsdb-share-collaborators">
            {inheritedEntries.map((row) => (
              <li key={row.key} className="is-inherited">
                {row.kind === 'workspace_members' ? (
                  <span className="fsdb-share-avatar is-view" aria-hidden><UserGroupIcon className="size-3.5" /></span>
                ) : row.kind === 'member_view' ? (
                  <span className="fsdb-share-avatar is-view" aria-hidden><LockClosedIcon className="size-3.5" /></span>
                ) : (
                  renderShareAvatar(row.id || row.name, row.avatar, {
                    extraClass: row.memberKind !== 'member' ? 'is-external' : '',
                  })
                )}
                <span className="fsdb-share-collaborator-copy">
                  <strong>{row.name}</strong>
                  <em>
                    {row.kind === 'workspace_members'
                      ? `空间全员 · 来自「${row.sourceTitle}」`
                      : row.kind === 'member_view'
                        ? `锁定成员视图 · 来自「${row.sourceTitle}」`
                        : `${row.memberKind === 'member' ? '空间成员' : '外部协作者'} · 来自「${row.sourceTitle}」`}
                  </em>
                </span>
                <span className="fsdb-share-collaborator-role">{roleLabel(row.role)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="fsdb-share-collab-section">
        <div className="fsdb-share-section-head">
          <h3>内部协作者</h3>
          {internalCount > 0 ? <span className="fsdb-share-section-count">{internalCount}</span> : null}
        </div>
        <ul className="fsdb-share-collaborators">
          {internalPeople.map((row) => {
            const isSelf = Boolean(currentAccountId && row.id === currentAccountId)
            const canEdit = Boolean(row.email && row.role !== 'owner' && !isSelf && row.canEdit !== false)
            const canRevoke = Boolean(row.role !== 'owner' && !isSelf && row.canRevoke !== false)
            return (
              <li key={row.id}>
                {renderShareAvatar(row.id || row.name, row.avatar)}
                <span className="fsdb-share-collaborator-copy"><strong>{row.name}</strong>{row.email ? <em>{row.email}</em> : null}</span>
                {canEdit ? (
                  <ShareSelect
                    inline
                    value={row.role as ShareRole}
                    options={effectiveRoleOptions}
                    ariaLabel={`调整 ${row.name} 的权限`}
                    placement="bottom-end"
                    minMenuWidth={208}
                    onChange={(next) => {
                      if (next !== row.role) {
                        void grant({ email: row.email }, 'internal', next)
                      }
                    }}
                  />
                ) : (
                  <span className="fsdb-share-collaborator-role">{roleLabel(row.role)}</span>
                )}
                {canRevoke ? (
                  <button
                    type="button"
                    className="fsdb-share-remove"
                    title="移除协作者"
                    aria-label={`移除 ${row.name}`}
                    onClick={() => void revoke('account', row.id)}
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
                    value={(row.role || 'editor') as ShareRole}
                    options={effectiveRoleOptions}
                    ariaLabel={`调整 ${row.name} 的权限`}
                    placement="bottom-end"
                    minMenuWidth={208}
                    onChange={(next) => {
                      if (next !== row.role) {
                        void grant({ memberViewId: row.id }, 'internal', next)
                      }
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
                      {renderShareAvatar(row.id || row.name, row.avatar, { extraClass: 'is-sm', size: 26 })}
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
            const canEdit = Boolean(row.email && row.canEdit !== false)
            const canRevoke = row.canRevoke !== false
            return (
              <li key={row.id}>
                {renderShareAvatar(row.id || row.name, row.avatar, { extraClass: 'is-external' })}
                <span className="fsdb-share-collaborator-copy"><strong>{row.name}</strong>{row.email ? <em>{row.email}</em> : null}</span>
                {canEdit ? (
                  <ShareSelect
                    inline
                    value={row.role as ShareRole}
                    options={effectiveExternalRoleOptions}
                    ariaLabel={`调整 ${row.name} 的权限`}
                    placement="bottom-end"
                    minMenuWidth={208}
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
                    title="移除协作者"
                    aria-label={`移除 ${row.name}`}
                    onClick={() => void revoke('account', row.id)}
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
          policy.allowExternalShare ? (
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
                {externalRoleSelect}
                <button
                  type="button"
                  className="fsdb-share-publish"
                  disabled={!email.trim()}
                  onClick={() => void grant({ email: email.trim() }, 'external', externalRole)}
                >
                  添加
                </button>
              </div>
              <div className="fsdb-share-guest-row" data-testid="fsdb-share-guest">
                <span className="fsdb-share-guest-info">
                  <span className="fsdb-share-guest-icon" aria-hidden><LinkIcon className="size-3.5" /></span>
                  <span><strong>临时访客</strong><em>{guestUrl ? '链接有效期 24 小时' : '无需注册，仅可访问此内容'}</em></span>
                </span>
                <button type="button" onClick={() => void createGuestLink()}>{guestCopied ? '已复制' : guestUrl ? '重新生成' : '生成链接'}</button>
              </div>
            </>
          ) : (
            <p className="fsdb-share-copy-note" data-testid="fsdb-share-external-disabled">
              当前空间已在「设置 → 工作区 → 权限」中关闭该数据类型的外部分享。
            </p>
          )
        ) : null}
      </section>
      {error ? <p className="fsdb-share-error is-inline">{error}</p> : null}
    </div>
  )
}
