import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon, LockClosedIcon, ShieldCheckIcon, UserGroupIcon, XMarkIcon } from '@heroicons/react/16/solid'
import { HeadlessDismiss } from '@biu/biu-ui/headless-dismiss'
import { OVERLAY_Z, overlayPortalRoot, overlayZ } from '@biu/biu-ui/overlay-portal'
import { emitFsdbChange } from '@biu/type-file-system'
import {
  applyBatchPermissions,
  fetchMemberViews,
  previewBatchPermissions,
  resolveMemberView,
} from './authz-api.ts'
import { WORKSPACE_MEMBERS_COLLECTION_PATH } from './database-path.ts'
import { listCollection } from './db-client.ts'
import { FSDB_SHARES_CHANGE_EVENT, emitFsdbEvent } from './fsdb-events.ts'
import {
  MEMBER_DEFAULT_ROLE_OPTIONS,
  ROLE_OPTIONS,
  ShareSelect,
  renderShareAvatar,
  type ShareRole,
} from './share-controls.tsx'
import { registerWorkspaceCache } from './workspace-client-store.ts'

export type BatchShareRole = ShareRole

export type BatchShareTarget = {
  collectionPath: string
  collectionLabel?: string
  /** 选中行批量模式时传入；缺省时按当前视图筛选全量命中。 */
  recordIds?: string[]
  viewId?: string
  viewName?: string
  filter?: Record<string, unknown>
  q?: string
}

type MemberOption = {
  id: string
  name: string
  email?: string
  avatar?: string
  memberKind?: string
}

type MemberViewOption = {
  id: string
  name: string
  protection: 'public' | 'locked' | 'personal'
  isLocked: boolean
  memberCount: number
  grantCount: number
}

type SelectedSubject =
  | { type: 'account'; id: string; label: string; avatar?: string }
  | { type: 'member_view'; id: string; label: string; memberCount: number }

type PreviewResult = {
  totalCount: number
  manageableCount: number
  skippedCount: number
}

let cachedBatchMembers: MemberOption[] | null = null
let cachedBatchMemberViews: MemberViewOption[] | null = null

registerWorkspaceCache('batch-share-dialog', () => {
  cachedBatchMembers = null
  cachedBatchMemberViews = null
})

export function BatchShareDialog({
  open,
  target,
  onClose,
  onApplied,
}: {
  open: boolean
  target: BatchShareTarget
  onClose: () => void
  onApplied?: (result: { updatedCount: number; skippedCount: number }) => void
}) {
  const [mode, setMode] = useState<'grant' | 'revoke' | 'access_mode'>('grant')
  const [role, setRole] = useState<BatchShareRole>('viewer')
  const [accessMode, setAccessMode] = useState<'private' | 'members'>('members')
  const [memberDefaultRole, setMemberDefaultRole] = useState<'viewer' | 'editor'>('viewer')
  const [members, setMembers] = useState<MemberOption[]>(() => cachedBatchMembers ?? [])
  const [memberViews, setMemberViews] = useState<MemberViewOption[]>(() => cachedBatchMemberViews ?? [])
  const [selected, setSelected] = useState<SelectedSubject[]>([])
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [expandingViewId, setExpandingViewId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [doneNotice, setDoneNotice] = useState('')

  const isSelectionMode = Array.isArray(target.recordIds) && target.recordIds.length > 0

  const scopePayload = useMemo(() => {
    if (isSelectionMode) {
      return { collection: target.collectionPath, recordIds: target.recordIds }
    }
    return {
      collection: target.collectionPath,
      ...(target.viewId ? { viewId: target.viewId } : {}),
      ...(target.filter ? { filter: target.filter } : {}),
      ...(target.q ? { q: target.q } : {}),
    }
  }, [isSelectionMode, target.collectionPath, target.filter, target.q, target.recordIds, target.viewId])
  const scopePayloadJson = JSON.stringify(scopePayload)

  // 1. 独立拉取预览计数（不阻塞在成员目录/成员视图接口上，且按内容序列化去重避免重复触发）
  useEffect(() => {
    if (!open) return
    let alive = true
    setError('')
    setDoneNotice('')
    setLoadingPreview(true)
    void previewBatchPermissions(scopePayloadJson)
      .then((previewRes) => {
        if (!alive) return
        const p = previewRes as PreviewResult
        setPreview({
          totalCount: Number(p?.totalCount ?? 0),
          manageableCount: Number(p?.manageableCount ?? 0),
          skippedCount: Number(p?.skippedCount ?? 0),
        })
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (alive) setLoadingPreview(false)
      })
    return () => {
      alive = false
    }
  }, [open, scopePayloadJson])

  // 2. 独立拉取成员视图列表与空间成员列表（各自返回即渲染，不互相阻塞，并用工作区级内存缓存实现二次秒开）
  useEffect(() => {
    if (!open) return
    let alive = true
    if (cachedBatchMemberViews) setMemberViews(cachedBatchMemberViews)
    if (cachedBatchMembers) setMembers(cachedBatchMembers)

    void fetchMemberViews()
      .catch(() => null)
      .then((viewsRes) => {
        if (!alive || !viewsRes) return
        const rawViews = Array.isArray(viewsRes.views)
          ? (viewsRes.views as MemberViewOption[])
          : []
        cachedBatchMemberViews = rawViews
        setMemberViews(rawViews)
      })

    void listCollection({
      path: WORKSPACE_MEMBERS_COLLECTION_PATH,
      limit: 500,
      columns: ['title', 'name', 'avatar', 'email', 'role', 'membershipKind'],
    })
      .then((page) => {
        if (!alive) return
        const nextMembers: MemberOption[] = page.items.flatMap((row) => {
          const id = String(row.id ?? '').trim()
          if (!id) return []
          const email = typeof row.email === 'string' && row.email.trim() ? row.email.trim() : undefined
          const name = String(row.title ?? '').trim() || String(row.name ?? '').trim() || email || id
          const avatar = typeof row.avatar === 'string' && row.avatar.trim() ? row.avatar.trim() : undefined
          const memberKind = typeof row.membershipKind === 'string' && row.membershipKind.trim() ? row.membershipKind.trim() : undefined
          return [{ id, name, ...(email ? { email } : {}), ...(avatar ? { avatar } : {}), ...(memberKind ? { memberKind } : {}) }]
        })
        cachedBatchMembers = nextMembers
        setMembers(nextMembers)
      })
      .catch(() => {
        /* ignore transient member directory failure */
      })

    return () => {
      alive = false
    }
  }, [open])

  const selectedKeySet = useMemo(() => new Set(selected.map((s) => `${s.type}:${s.id}`)), [selected])

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return members
    return members.filter(
      (m) => m.name.toLowerCase().includes(q) || (m.email ?? '').toLowerCase().includes(q),
    )
  }, [members, search])

  const filteredViews = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return memberViews
    return memberViews.filter((v) => v.name.toLowerCase().includes(q))
  }, [memberViews, search])

  const toggleMember = (m: MemberOption) => {
    const key = `account:${m.id}`
    setSelected((prev) =>
      prev.some((s) => `${s.type}:${s.id}` === key)
        ? prev.filter((s) => `${s.type}:${s.id}` !== key)
        : [...prev, { type: 'account', id: m.id, label: m.name, avatar: m.avatar }],
    )
  }

  const toggleLockedView = (v: MemberViewOption) => {
    const key = `member_view:${v.id}`
    setSelected((prev) =>
      prev.some((s) => `${s.type}:${s.id}` === key)
        ? prev.filter((s) => `${s.type}:${s.id}` !== key)
        : [...prev, { type: 'member_view', id: v.id, label: v.name, memberCount: v.memberCount }],
    )
  }

  const expandUnlockedView = async (v: MemberViewOption) => {
    setExpandingViewId(v.id)
    setError('')
    try {
      const data = await resolveMemberView<MemberOption>(v.id)
      const resolved = Array.isArray(data.members) ? data.members : []
      if (!resolved.length) {
        setError(`「${v.name}」当前没有匹配的成员`)
        return
      }
      setSelected((prev) => {
        const existing = new Set(prev.map((s) => `${s.type}:${s.id}`))
        const added: SelectedSubject[] = []
        for (const m of resolved) {
          if (!m.id || existing.has(`account:${m.id}`)) continue
          existing.add(`account:${m.id}`)
          added.push({ type: 'account', id: m.id, label: m.name || m.email || m.id, avatar: m.avatar })
        }
        return [...prev, ...added]
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setExpandingViewId(null)
    }
  }

  const canSubmit = useMemo(() => {
    if (submitting || loadingPreview || !preview || preview.manageableCount <= 0) return false
    if (mode === 'access_mode') return true
    return selected.length > 0
  }, [loadingPreview, mode, preview, selected.length, submitting])

  const handleApply = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError('')
    setDoneNotice('')
    try {
      const payload = {
        ...scopePayload,
        mode,
        ...(mode === 'access_mode'
          ? { accessMode, ...(accessMode === 'members' ? { memberDefaultRole } : {}) }
          : {
              subjects: selected.map((s) => ({ type: s.type, id: s.id })),
              ...(mode === 'grant' ? { role } : {}),
            }),
      }
      const data = await applyBatchPermissions(payload)
      const updatedCount = Number(data.updatedCount ?? 0)
      const skippedCount = Number(data.skippedCount ?? 0)
      setDoneNotice(
        skippedCount > 0
          ? `已批量更新 ${updatedCount} 条记录，跳过 ${skippedCount} 条无管理权限记录`
          : `已成功批量更新 ${updatedCount} 条记录`,
      )
      emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
      emitFsdbChange({ scope: 'records', path: target.collectionPath })
      onApplied?.({ updatedCount, skippedCount })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  const scopeLabel = isSelectionMode
    ? `已选中的 ${target.recordIds!.length} 条记录`
    : target.viewName
      ? `视图「${target.viewName}」全部筛选命中记录`
      : `${target.collectionLabel || target.collectionPath} 当前全部命中记录`

  const content = (
    <div
      className="biu-float-overlay"
      style={{ zIndex: OVERLAY_Z.modal }}
      data-testid="fsdb-batch-share-dialog"
      onClick={onClose}
    >
      <div
        className="fsdb-batch-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="批量权限设置"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fsdb-batch-head">
          <div className="fsdb-batch-head-copy">
            <h2 className="fsdb-batch-title">批量权限设置</h2>
            <div className="fsdb-batch-sub">{scopeLabel}</div>
          </div>
          <button
            type="button"
            className="biu-float-close"
            onClick={onClose}
            aria-label="关闭"
          >
            <XMarkIcon className="size-4" />
          </button>
        </div>

        <div className="fsdb-batch-body">
          <div className="fsdb-batch-preview" data-testid="fsdb-batch-share-preview">
            {loadingPreview ? (
              <span>正在统计可操作记录数…</span>
            ) : preview ? (
              <>
                <span>
                  命中 <strong>{preview.totalCount}</strong> 条
                </span>
                <span>·</span>
                <span>
                  可操作 <strong>{preview.manageableCount}</strong> 条
                </span>
                {preview.skippedCount > 0 ? (
                  <>
                    <span>·</span>
                    <span className="fsdb-batch-preview-warn">
                      自动跳过 {preview.skippedCount} 条无管理权限
                    </span>
                  </>
                ) : null}
              </>
            ) : (
              <span>暂无可统计记录</span>
            )}
          </div>

          <div role="tablist" className="fsdb-batch-tabs">
            {([
              { id: 'grant', label: '批量授权' },
              { id: 'revoke', label: '批量回收' },
              { id: 'access_mode', label: '通用访问' },
            ] as const).map((tab) => {
              const active = mode === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-testid={`fsdb-batch-mode-${tab.id}`}
                  className={`fsdb-batch-tab${active ? ' is-on' : ''}`}
                  onClick={() => {
                    setMode(tab.id)
                    setDoneNotice('')
                  }}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          {mode === 'access_mode' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="fsdb-batch-access-note">
                切换后仅修改通用访问档位，不会清空已添加的成员或外链授权。
              </div>
              <div className="fsdb-batch-access-grid">
                <button
                  type="button"
                  data-testid="fsdb-batch-access-members"
                  className={`fsdb-batch-access-card${accessMode === 'members' ? ' is-on' : ''}`}
                  onClick={() => setAccessMode('members')}
                >
                  <strong>空间全员可访问</strong>
                  <span>空间内所有成员均可访问</span>
                </button>
                <button
                  type="button"
                  data-testid="fsdb-batch-access-private"
                  className={`fsdb-batch-access-card${accessMode === 'private' ? ' is-on' : ''}`}
                  onClick={() => setAccessMode('private')}
                >
                  <strong>仅受邀人员</strong>
                  <span>仅所有者与显式授权成员可访问</span>
                </button>
              </div>
              {accessMode === 'members' ? (
                <div className="fsdb-batch-default-row">
                  <span>空间成员默认权限</span>
                  <ShareSelect
                    ariaLabel="空间成员默认权限"
                    className="fsdb-batch-role-select"
                    value={memberDefaultRole}
                    options={MEMBER_DEFAULT_ROLE_OPTIONS}
                    onChange={(next) => setMemberDefaultRole(next)}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, flex: 1 }}>
              <div className="fsdb-batch-search-row">
                <input
                  type="text"
                  className="fsdb-batch-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索成员或成员视图…"
                />
                {mode === 'grant' ? (
                  <ShareSelect
                    ariaLabel="授予权限"
                    className="fsdb-batch-role-select"
                    value={role}
                    options={ROLE_OPTIONS}
                    onChange={(next) => setRole(next)}
                  />
                ) : null}
              </div>

              {selected.length > 0 ? (
                <div className="fsdb-batch-chips">
                  {selected.map((s) => (
                    <span key={`${s.type}:${s.id}`} className="fsdb-batch-chip">
                      {s.type === 'member_view' ? <LockClosedIcon className="size-3" /> : null}
                      <span>{s.label}</span>
                      <button
                        type="button"
                        aria-label={`移除 ${s.label}`}
                        onClick={() => setSelected((prev) => prev.filter((item) => !(item.type === s.type && item.id === s.id)))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="fsdb-batch-list">
                {filteredViews.length > 0 ? (
                  <div>
                    <div className="fsdb-batch-section-title">成员视图</div>
                    <div className="fsdb-batch-rows">
                      {filteredViews.map((v) => {
                        const picked = selectedKeySet.has(`member_view:${v.id}`)
                        return (
                          <button
                            key={v.id}
                            type="button"
                            disabled={expandingViewId === v.id}
                            className={`fsdb-batch-row${picked ? ' is-picked' : ''}`}
                            onClick={() => (v.isLocked ? toggleLockedView(v) : void expandUnlockedView(v))}
                          >
                            <span className="fsdb-batch-row-main">
                              {v.isLocked ? (
                                <LockClosedIcon className="fsdb-batch-row-icon size-3.5" />
                              ) : (
                                <UserGroupIcon className="fsdb-batch-row-icon size-3.5" />
                              )}
                              <span className="fsdb-batch-row-name">{v.name}</span>
                              <span className="fsdb-batch-row-meta">
                                {v.isLocked ? `动态组 · ${v.memberCount} 人` : `名单 · ${v.memberCount} 人`}
                              </span>
                            </span>
                            <span className="fsdb-batch-row-action">
                              {v.isLocked ? (
                                picked ? <CheckIcon className="size-3.5" /> : '选择'
                              ) : expandingViewId === v.id ? (
                                '展开中…'
                              ) : (
                                '展开'
                              )}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                <div>
                  <div className="fsdb-batch-section-title">空间成员（{filteredMembers.length}）</div>
                  <div className="fsdb-batch-rows">
                    {filteredMembers.map((m) => {
                      const picked = selectedKeySet.has(`account:${m.id}`)
                      return (
                        <button
                          key={m.id}
                          type="button"
                          className={`fsdb-batch-row${picked ? ' is-picked' : ''}`}
                          onClick={() => toggleMember(m)}
                        >
                          <span className="fsdb-batch-row-main">
                            {renderShareAvatar(m.id, m.avatar, { mini: true })}
                            <span className="fsdb-batch-row-name">{m.name}</span>
                            {m.memberKind === 'external' || m.memberKind === 'guest' ? (
                              <span className="fsdb-batch-row-tag">外部</span>
                            ) : null}
                          </span>
                          <span className="fsdb-batch-row-action">
                            {picked ? <CheckIcon className="size-3.5" /> : '选择'}
                          </span>
                        </button>
                      )
                    })}
                    {filteredMembers.length === 0 ? (
                      <div className="fsdb-batch-empty">无匹配成员</div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          )}

          {error ? (
            <div className="fsdb-batch-error" role="alert">
              {error}
            </div>
          ) : null}
          {doneNotice ? (
            <div className="fsdb-batch-done" data-testid="fsdb-batch-share-done">
              {doneNotice}
            </div>
          ) : null}
        </div>

        <div className="fsdb-batch-foot">
          <button type="button" className="fsdb-batch-cancel" onClick={onClose}>
            关闭
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            data-testid="fsdb-batch-share-submit"
            className="fsdb-batch-submit"
            onClick={() => void handleApply()}
          >
            <ShieldCheckIcon className="size-3.5" aria-hidden />
            <span>
              {submitting
                ? '执行中…'
                : mode === 'grant'
                  ? '应用批量授权'
                  : mode === 'revoke'
                    ? '应用批量回收'
                    : '应用通用访问'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )

  const portalRoot = overlayPortalRoot()
  return portalRoot ? createPortal(content, portalRoot) : null
}
