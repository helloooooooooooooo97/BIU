import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { UserGroupIcon, UsersIcon, XMarkIcon } from '@heroicons/react/16/solid'
import { AiAvatar } from '@biu/biu-ui/ai-avatar'
import { HeadlessDismiss } from '@biu/biu-ui/headless-dismiss'
import { apiFetch } from '@biu/biu-ui/api-client'
import { parseDefaultTableViewId, viewDomainOf } from '../catalog-views.ts'
import { tableModeFor } from '../paths.ts'
import { openAccessRulesDrawer } from './access-rules-drawer.tsx'
import { FSDB_SHARES_CHANGE_EVENT } from './fsdb-events.ts'
import { useMemberDirectory } from './person-cell.tsx'
import type { SavedView } from './saved-view.ts'

type MemberRow = {
  id: string
  name?: string
  email?: string
  avatar?: string
  role?: string
  member_kind?: string
}

type AccessRuleGrant = {
  subjectType: 'account' | 'workspace' | 'group'
  subjectId: string
  role: 'viewer' | 'editor' | 'manager'
  subjectName?: string
  subjectEmail?: string
  subjectAvatar?: string
}

type AccessRuleRow = {
  id: string
  ownerTable?: string
  scope?: 'workspace' | 'personal'
  enabled?: boolean
  grants?: AccessRuleGrant[]
}

const WS_ROLE_LABEL: Record<string, string> = {
  owner: '所有者',
  admin: '管理员',
  member: '可编辑',
  viewer: '可查看',
}

const RULE_ROLE_LABEL: Record<string, string> = {
  manager: '可管理',
  editor: '可编辑',
  viewer: '可查看',
}

const ROLE_RANK: Record<string, number> = {
  viewer: 1,
  editor: 2,
  manager: 3,
  member: 2,
  admin: 3,
  owner: 4,
}

function isImageAvatar(value?: string) {
  return Boolean(value && /^(https?:\/\/|\/|data:image\/)/i.test(value.trim()))
}

function renderAvatar(seed: string, avatar?: string) {
  const trimmed = avatar?.trim() ?? ''
  return (
    <span className="fsdb-share-avatar" aria-hidden>
      {isImageAvatar(trimmed) ? <img src={trimmed} alt="" /> : trimmed || <AiAvatar seed={seed || 'biu'} size={28} />}
    </span>
  )
}

export function TableCollaboratorsButton({
  collectionPath,
  activeView,
  viewerAccountId,
  localOnly,
}: {
  collectionPath: string
  activeView?: SavedView
  viewerAccountId?: string
  localOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [rules, setRules] = useState<AccessRuleRow[]>([])
  const [error, setError] = useState('')
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const membersById = useMemberDirectory(!localOnly && open)

  const isKPlus1 = tableModeFor(collectionPath) === 'k-plus-1'
  const ownerTable = useMemo(() => {
    const explicit = activeView?.ownerTable?.trim()
    if (explicit) return explicit
    const parsed = activeView?.id ? parseDefaultTableViewId(activeView.id)?.ownerTable : ''
    if (parsed) return parsed
    const domain = viewDomainOf(activeView)
    if (domain === 'workspace') return 'workspace'
    if (domain === 'personal' && viewerAccountId) return `account:${viewerAccountId}`
    return 'workspace'
  }, [activeView, viewerAccountId])

  const isWorkspaceTable = ownerTable === 'workspace'
  const ownerAccountId = ownerTable.startsWith('account:') ? ownerTable.slice('account:'.length) : ''
  const isMyPersonalTable = Boolean(ownerAccountId && viewerAccountId && ownerAccountId === viewerAccountId)
  const isForeignPersonalTable = Boolean(ownerAccountId && (!viewerAccountId || ownerAccountId !== viewerAccountId))

  const load = useCallback(async () => {
    if (localOnly || !isKPlus1) return
    setLoading(true)
    setError('')
    try {
      const [membersRes, rulesRes] = await Promise.all([
        apiFetch('/api/account/members').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        apiFetch(`/api/account/access-rules?collection=${encodeURIComponent(collectionPath)}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ])
      const rawMembers = Array.isArray((membersRes as { members?: unknown[] } | null)?.members)
        ? ((membersRes as { members: MemberRow[] }).members)
        : []
      const rawRules = Array.isArray((rulesRes as { rules?: unknown[] } | null)?.rules)
        ? ((rulesRes as { rules: AccessRuleRow[] }).rules)
        : []
      setMembers(rawMembers)
      setRules(rawRules)
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法加载协作者')
    } finally {
      setLoading(false)
    }
  }, [collectionPath, isKPlus1, localOnly])

  useEffect(() => {
    if (!open) return
    void load()
    const onRefresh = () => void load()
    window.addEventListener(FSDB_SHARES_CHANGE_EVENT, onRefresh)
    return () => window.removeEventListener(FSDB_SHARES_CHANGE_EVENT, onRefresh)
  }, [load, open])

  const memberMap = useMemo(() => {
    const map = new Map<string, MemberRow>()
    for (const m of members) map.set(m.id, m)
    return map
  }, [members])

  const internalMembers = useMemo(
    () => members.filter((m) => !m.member_kind || m.member_kind === 'member'),
    [members],
  )

  const tableRuleGrants = useMemo(() => {
    const byKey = new Map<
      string,
      {
        key: string
        subjectType: 'account' | 'workspace' | 'group'
        subjectId: string
        name: string
        sub: string
        avatar?: string
        role: string
      }
    >()
    for (const rule of rules) {
      if (rule.enabled === false) continue
      const ruleTable = rule.ownerTable?.trim() || (rule.scope === 'workspace' ? 'workspace' : '')
      if (ruleTable !== ownerTable) continue
      for (const grant of rule.grants ?? []) {
        const key = `${grant.subjectType}:${grant.subjectId}`
        const existing = byKey.get(key)
        if (existing && (ROLE_RANK[existing.role] ?? 0) >= (ROLE_RANK[grant.role] ?? 0)) continue
        if (grant.subjectType === 'workspace') {
          byKey.set(key, {
            key,
            subjectType: 'workspace',
            subjectId: grant.subjectId,
            name: '全体空间成员',
            sub: '通过共享规则授权',
            role: grant.role,
          })
        } else if (grant.subjectType === 'group') {
          byKey.set(key, {
            key,
            subjectType: 'group',
            subjectId: grant.subjectId,
            name: grant.subjectName || '成员组',
            sub: '成员组 · 通过共享规则',
            role: grant.role,
          })
        } else {
          const m = memberMap.get(grant.subjectId)
          const dir = membersById.get(grant.subjectId)
          byKey.set(key, {
            key,
            subjectType: 'account',
            subjectId: grant.subjectId,
            name: m?.name || dir?.name || grant.subjectName || grant.subjectId.slice(0, 8),
            sub: m?.email || grant.subjectEmail || (m?.member_kind === 'external' ? '外部协作者' : '通过共享规则'),
            avatar: m?.avatar || dir?.avatar || grant.subjectAvatar || '',
            role: grant.role,
          })
        }
      }
    }
    return [...byKey.values()]
  }, [memberMap, membersById, ownerTable, rules])

  const externalRuleGrants = useMemo(
    () =>
      isWorkspaceTable
        ? tableRuleGrants.filter((g) => {
            if (g.subjectType !== 'account') return true
            const m = memberMap.get(g.subjectId)
            return Boolean(m && m.member_kind && m.member_kind !== 'member')
          })
        : tableRuleGrants,
    [isWorkspaceTable, memberMap, tableRuleGrants],
  )

  if (localOnly || !isKPlus1) return null

  const ownerInfo = ownerAccountId ? memberMap.get(ownerAccountId) ?? membersById.get(ownerAccountId) : undefined
  const myInfo = viewerAccountId ? memberMap.get(viewerAccountId) ?? membersById.get(viewerAccountId) : undefined
  const headerTitle = isWorkspaceTable
    ? '空间数据协作者'
    : isMyPersonalTable
      ? '我的数据协作者'
      : `${ownerInfo?.name || ownerAccountId.slice(0, 8)} 的协作者`

  return (
    <div className="fsdb-share-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`chat-view-header-expand${open ? ' is-active' : ''}`}
        title="协作者"
        aria-label="协作者"
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="fsdb-table-collaborators-toggle"
        onClick={() => setOpen((prev) => !prev)}
      >
        <UsersIcon aria-hidden className="size-4" />
      </button>
      {open ? (
        <HeadlessDismiss onDismiss={() => setOpen(false)} insideRef={wrapRef}>
          <div
            className="fsdb-share-panel"
            role="dialog"
            aria-label={headerTitle}
            data-testid="fsdb-table-collaborators-popover"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontWeight: 600, fontSize: 13 }}>
                <UsersIcon aria-hidden className="size-4 opacity-80 shrink-0" />
                <span className="truncate">{headerTitle}</span>
              </div>
              <button
                type="button"
                className="chat-view-header-expand"
                style={{ width: 24, height: 24 }}
                aria-label="关闭"
                onClick={() => setOpen(false)}
              >
                <XMarkIcon className="size-3.5" />
              </button>
            </div>

            <div className="fsdb-share-link-section" style={{ marginTop: 0 }}>
              {error ? <p className="fsdb-share-error">{error}</p> : null}
              {loading && members.length === 0 ? (
                <p className="fsdb-share-hint">加载中…</p>
              ) : isWorkspaceTable ? (
                <>
                  <section className="fsdb-share-collab-section">
                    <div className="fsdb-share-section-head">
                      <h3>空间成员</h3>
                      <span className="fsdb-share-section-count">{internalMembers.length}</span>
                    </div>
                    {internalMembers.length === 0 ? (
                      <p className="fsdb-share-hint">暂无空间成员</p>
                    ) : (
                      <ul className="fsdb-share-collaborators" style={{ maxHeight: 240, overflowY: 'auto' }}>
                        {internalMembers.map((m) => (
                          <li key={m.id}>
                            <div className="fsdb-share-collab-id">
                              {renderAvatar(m.id, m.avatar)}
                              <div className="fsdb-share-collab-copy">
                                <strong>
                                  {m.name || m.email || m.id.slice(0, 8)}
                                  {viewerAccountId && m.id === viewerAccountId ? '（我）' : ''}
                                </strong>
                                {m.email ? <span>{m.email}</span> : null}
                              </div>
                            </div>
                            <span className="fsdb-share-ghost" style={{ pointerEvents: 'none', fontSize: 11.5 }}>
                              {WS_ROLE_LABEL[m.role ?? 'member'] ?? '可编辑'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  {externalRuleGrants.length > 0 ? (
                    <section className="fsdb-share-collab-section">
                      <div className="fsdb-share-section-head">
                        <h3>规则授权</h3>
                        <span className="fsdb-share-section-count">{externalRuleGrants.length}</span>
                      </div>
                      <ul className="fsdb-share-collaborators" style={{ maxHeight: 180, overflowY: 'auto' }}>
                        {externalRuleGrants.map((g) => (
                          <li key={g.key}>
                            <div className="fsdb-share-collab-id">
                              {g.subjectType === 'account' ? (
                                renderAvatar(g.subjectId, g.avatar)
                              ) : (
                                <span className="fsdb-share-avatar is-view" aria-hidden>
                                  <UserGroupIcon className="size-3.5" />
                                </span>
                              )}
                              <div className="fsdb-share-collab-copy">
                                <strong>{g.name}</strong>
                                <span>{g.sub}</span>
                              </div>
                            </div>
                            <span className="fsdb-share-ghost" style={{ pointerEvents: 'none', fontSize: 11.5 }}>
                              {RULE_ROLE_LABEL[g.role] ?? '可查看'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="fsdb-share-ghost"
                      onClick={() => {
                        setOpen(false)
                        openAccessRulesDrawer({ collection: collectionPath, fromView: activeView ?? null })
                      }}
                    >
                      管理空间访问规则
                    </button>
                  </div>
                </>
              ) : isMyPersonalTable ? (
                <>
                  <section className="fsdb-share-collab-section">
                    <div className="fsdb-share-section-head">
                      <h3>表主人</h3>
                    </div>
                    <ul className="fsdb-share-collaborators">
                      <li>
                        <div className="fsdb-share-collab-id">
                          {renderAvatar(viewerAccountId || 'me', myInfo?.avatar)}
                          <div className="fsdb-share-collab-copy">
                            <strong>{myInfo?.name || '我'}</strong>
                            {myInfo && 'email' in myInfo && myInfo.email ? <span>{myInfo.email}</span> : null}
                          </div>
                        </div>
                        <span className="fsdb-share-ghost" style={{ pointerEvents: 'none', fontSize: 11.5 }}>
                          所有者
                        </span>
                      </li>
                    </ul>
                  </section>

                  <section className="fsdb-share-collab-section">
                    <div className="fsdb-share-section-head">
                      <h3>共享协作者</h3>
                      <span className="fsdb-share-section-count">{tableRuleGrants.length}</span>
                    </div>
                    {tableRuleGrants.length === 0 ? (
                      <p className="fsdb-share-hint">当前仅自己可见，可通过分享规则或单条记录添加协作者</p>
                    ) : (
                      <ul className="fsdb-share-collaborators" style={{ maxHeight: 200, overflowY: 'auto' }}>
                        {tableRuleGrants.map((g) => (
                          <li key={g.key}>
                            <div className="fsdb-share-collab-id">
                              {g.subjectType === 'account' ? (
                                renderAvatar(g.subjectId, g.avatar)
                              ) : (
                                <span className="fsdb-share-avatar is-view" aria-hidden>
                                  <UserGroupIcon className="size-3.5" />
                                </span>
                              )}
                              <div className="fsdb-share-collab-copy">
                                <strong>{g.name}</strong>
                                <span>{g.sub}</span>
                              </div>
                            </div>
                            <span className="fsdb-share-ghost" style={{ pointerEvents: 'none', fontSize: 11.5 }}>
                              {RULE_ROLE_LABEL[g.role] ?? '可查看'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="fsdb-share-ghost"
                      onClick={() => {
                        setOpen(false)
                        openAccessRulesDrawer({ collection: collectionPath, fromView: activeView ?? null })
                      }}
                    >
                      管理个人分享规则
                    </button>
                  </div>
                </>
              ) : isForeignPersonalTable ? (
                <section className="fsdb-share-collab-section">
                  <div className="fsdb-share-section-head">
                    <h3>参与者</h3>
                    <span className="fsdb-share-section-count">{viewerAccountId ? 2 : 1}</span>
                  </div>
                  <ul className="fsdb-share-collaborators">
                    <li>
                      <div className="fsdb-share-collab-id">
                        {renderAvatar(ownerAccountId, ownerInfo?.avatar)}
                        <div className="fsdb-share-collab-copy">
                          <strong>{ownerInfo?.name || ownerAccountId.slice(0, 8)}</strong>
                          {ownerInfo && 'email' in ownerInfo && ownerInfo.email ? <span>{ownerInfo.email}</span> : <span>数据所有者</span>}
                        </div>
                      </div>
                      <span className="fsdb-share-ghost" style={{ pointerEvents: 'none', fontSize: 11.5 }}>
                        所有者
                      </span>
                    </li>
                    {viewerAccountId ? (
                      <li>
                        <div className="fsdb-share-collab-id">
                          {renderAvatar(viewerAccountId, myInfo?.avatar)}
                          <div className="fsdb-share-collab-copy">
                            <strong>{myInfo?.name ? `${myInfo.name}（我）` : '我'}</strong>
                            <span>已获得共享访问权限</span>
                          </div>
                        </div>
                        <span className="fsdb-share-ghost" style={{ pointerEvents: 'none', fontSize: 11.5 }}>
                          协作者
                        </span>
                      </li>
                    ) : null}
                  </ul>
                </section>
              ) : null}
            </div>
          </div>
        </HeadlessDismiss>
      ) : null}
    </div>
  )
}
