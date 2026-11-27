import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { LockClosedIcon, UserGroupIcon, UsersIcon, XMarkIcon } from '@heroicons/react/16/solid'
import { AiAvatar } from '@biu/biu-ui/ai-avatar'
import { apiFetch } from '@biu/biu-ui/api-client'
import { OVERLAY_Z, overlayPortalRoot } from '@biu/biu-ui/overlay-portal'
import { emitFsdbChange } from '@biu/type-file-system'
import { FSDB_SHARES_CHANGE_EVENT, emitFsdbEvent } from './fsdb-events.ts'

export type BatchShareRole = 'viewer' | 'commenter' | 'editor' | 'manager'

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

const ROLE_OPTIONS: Array<{ value: BatchShareRole; label: string }> = [
  { value: 'viewer', label: '可查看' },
  { value: 'commenter', label: '可评论' },
  { value: 'editor', label: '可编辑' },
  { value: 'manager', label: '可管理' },
]

function isImageAvatar(value?: string) {
  return Boolean(value && /^(https?:\/\/|\/|data:image\/)/i.test(value.trim()))
}

function renderMiniAvatar(seed: string, avatar?: string) {
  const trimmed = avatar?.trim() ?? ''
  return (
    <span className="fsdb-share-avatar" aria-hidden style={{ width: 20, height: 20, fontSize: 10 }}>
      {isImageAvatar(trimmed) ? <img src={trimmed} alt="" /> : trimmed || <AiAvatar seed={seed || 'biu'} size={20} />}
    </span>
  )
}

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
  const [members, setMembers] = useState<MemberOption[]>([])
  const [memberViews, setMemberViews] = useState<MemberViewOption[]>([])
  const [selected, setSelected] = useState<SelectedSubject[]>([])
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [expandingViewId, setExpandingViewId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [doneNotice, setDoneNotice] = useState('')

  const isSelectionMode = Array.isArray(target.recordIds) && target.recordIds.length > 0

  const requestScopePayload = useCallback(() => {
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

  useEffect(() => {
    if (!open) return
    let alive = true
    setError('')
    setDoneNotice('')
    setLoadingPreview(true)
    void Promise.all([
      apiFetch('/api/db/batch-permissions/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestScopePayload()),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .catch((err) => {
          throw err
        }),
      apiFetch('/api/account/members')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      apiFetch('/api/db/member-views')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([previewRes, membersRes, viewsRes]) => {
        if (!alive) return
        const p = previewRes as PreviewResult
        setPreview({
          totalCount: Number(p?.totalCount ?? 0),
          manageableCount: Number(p?.manageableCount ?? 0),
          skippedCount: Number(p?.skippedCount ?? 0),
        })
        const rawMembers = Array.isArray((membersRes as { members?: unknown[] } | null)?.members)
          ? ((membersRes as { members: Array<{ id?: string; name?: string; email?: string; avatar?: string; member_kind?: string }> }).members)
          : []
        setMembers(
          rawMembers
            .filter((m) => m.id)
            .map((m) => ({
              id: String(m.id),
              name: String(m.name || m.email || m.id),
              email: m.email ? String(m.email) : undefined,
              avatar: m.avatar ? String(m.avatar) : undefined,
              memberKind: m.member_kind ? String(m.member_kind) : undefined,
            })),
        )
        const rawViews = Array.isArray((viewsRes as { views?: unknown[] } | null)?.views)
          ? ((viewsRes as { views: MemberViewOption[] }).views)
          : []
        setMemberViews(rawViews)
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
  }, [open, requestScopePayload])

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
      const res = await apiFetch(`/api/db/member-views/${encodeURIComponent(v.id)}/resolve`)
      if (!res.ok) throw new Error(`展开成员视图失败 (HTTP ${res.status})`)
      const data = (await res.json()) as { members?: MemberOption[] }
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
        ...requestScopePayload(),
        mode,
        ...(mode === 'access_mode'
          ? { accessMode, ...(accessMode === 'members' ? { memberDefaultRole } : {}) }
          : {
              subjects: selected.map((s) => ({ type: s.type, id: s.id })),
              ...(mode === 'grant' ? { role } : {}),
            }),
      }
      const res = await apiFetch('/api/db/batch-permissions/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as {
        error?: string
        updatedCount?: number
        skippedCount?: number
      }
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
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
        className="biu-float"
        role="dialog"
        aria-modal="true"
        aria-label="批量权限设置"
        style={{ width: 'min(520px, 92vw)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 18, gap: 14 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>批量权限设置</div>
            <div style={{ fontSize: 12, color: 'var(--biu-color-text-muted)', marginTop: 2 }}>
              作用范围：{scopeLabel}
            </div>
          </div>
          <button
            type="button"
            className="biu-float-close"
            onClick={onClose}
            aria-label="关闭"
            style={{ position: 'static' }}
          >
            <XMarkIcon className="size-4" />
          </button>
        </div>

        <div
          data-testid="fsdb-batch-share-preview"
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            background: 'var(--biu-color-bg-hover)',
            fontSize: 12,
            color: 'var(--biu-color-text)',
          }}
        >
          {loadingPreview ? (
            <span>正在统计可操作记录数…</span>
          ) : preview ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span>
                共命中 <strong>{preview.totalCount}</strong> 条
              </span>
              <span>·</span>
              <span>
                可操作 <strong>{preview.manageableCount}</strong> 条
              </span>
              {preview.skippedCount > 0 ? (
                <>
                  <span>·</span>
                  <span style={{ color: 'var(--biu-color-warning, #b45309)' }}>
                    将自动跳过 {preview.skippedCount} 条无管理权限记录
                  </span>
                </>
              ) : null}
            </div>
          ) : (
            <span>暂无可统计记录</span>
          )}
        </div>

        <div role="tablist" style={{ display: 'flex', gap: 6 }}>
          {([
            { id: 'grant', label: '批量授权' },
            { id: 'revoke', label: '批量回收' },
            { id: 'access_mode', label: '通用访问' },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={mode === tab.id}
              data-testid={`fsdb-batch-mode-${tab.id}`}
              onClick={() => {
                setMode(tab.id)
                setDoneNotice('')
              }}
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: 7,
                fontSize: 12,
                fontWeight: mode === tab.id ? 600 : 400,
                border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                background: mode === tab.id ? 'var(--biu-color-bg-active, var(--biu-color-bg-hover))' : 'transparent',
                color: 'var(--biu-color-text)',
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {mode === 'access_mode' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--biu-color-text-muted)' }}>
              切换后仅修改通用访问档位，不会清空已添加的成员或外链授权。
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                data-testid="fsdb-batch-access-members"
                onClick={() => setAccessMode('members')}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 8,
                  textAlign: 'left',
                  border: `1px solid ${accessMode === 'members' ? 'var(--biu-color-accent)' : 'var(--biu-color-border)'}`,
                  background: accessMode === 'members' ? 'var(--biu-color-bg-hover)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600 }}>空间全员可访问</div>
                <div style={{ fontSize: 11, color: 'var(--biu-color-text-muted)', marginTop: 2 }}>
                  空间内所有成员均可访问这些记录
                </div>
              </button>
              <button
                type="button"
                data-testid="fsdb-batch-access-private"
                onClick={() => setAccessMode('private')}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 8,
                  textAlign: 'left',
                  border: `1px solid ${accessMode === 'private' ? 'var(--biu-color-accent)' : 'var(--biu-color-border)'}`,
                  background: accessMode === 'private' ? 'var(--biu-color-bg-hover)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600 }}>仅受邀人员</div>
                <div style={{ fontSize: 11, color: 'var(--biu-color-text-muted)', marginTop: 2 }}>
                  仅所有者与显式授权成员可访问
                </div>
              </button>
            </div>
            {accessMode === 'members' ? (
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                <span>空间成员默认权限</span>
                <select
                  value={memberDefaultRole}
                  onChange={(e) => setMemberDefaultRole(e.target.value === 'editor' ? 'editor' : 'viewer')}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                    background: 'var(--biu-color-bg)',
                    color: 'var(--biu-color-text)',
                  }}
                >
                  <option value="viewer">可查看</option>
                  <option value="editor">可编辑</option>
                </select>
              </label>
            ) : null}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, flex: 1 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索成员或成员视图…"
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: 7,
                  fontSize: 12,
                  border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                  background: 'var(--biu-color-bg)',
                  color: 'var(--biu-color-text)',
                }}
              />
              {mode === 'grant' ? (
                <select
                  aria-label="授予权限"
                  value={role}
                  onChange={(e) => setRole(e.target.value as BatchShareRole)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: 7,
                    fontSize: 12,
                    border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                    background: 'var(--biu-color-bg)',
                    color: 'var(--biu-color-text)',
                  }}
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>

            {selected.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selected.map((s) => (
                  <span
                    key={`${s.type}:${s.id}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 11,
                      background: 'var(--biu-color-bg-hover)',
                      border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                    }}
                  >
                    {s.type === 'member_view' ? <LockClosedIcon className="size-3" /> : null}
                    <span>{s.label}</span>
                    <button
                      type="button"
                      aria-label={`移除 ${s.label}`}
                      onClick={() => setSelected((prev) => prev.filter((item) => !(item.type === s.type && item.id === s.id)))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            <div style={{ overflowY: 'auto', maxHeight: 240, display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 2 }}>
              {filteredViews.length > 0 ? (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--biu-color-text-muted)', marginBottom: 4 }}>
                    成员视图
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {filteredViews.map((v) => {
                      const picked = selectedKeySet.has(`member_view:${v.id}`)
                      return (
                        <button
                          key={v.id}
                          type="button"
                          disabled={expandingViewId === v.id}
                          onClick={() => (v.isLocked ? toggleLockedView(v) : void expandUnlockedView(v))}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            padding: '6px 8px',
                            borderRadius: 7,
                            border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                            background: picked ? 'var(--biu-color-bg-hover)' : 'transparent',
                            color: 'var(--biu-color-text)',
                            fontSize: 12,
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            {v.isLocked ? <LockClosedIcon className="size-3.5" /> : <UserGroupIcon className="size-3.5" />}
                            <span style={{ fontWeight: 500 }}>{v.name}</span>
                            <span style={{ fontSize: 11, color: 'var(--biu-color-text-muted)' }}>
                              {v.isLocked
                                ? `动态组 · ${v.memberCount} 人 · 自动同步`
                                : `快捷名单 · 按当前 ${v.memberCount} 人展开`}
                            </span>
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--biu-color-accent)' }}>
                            {v.isLocked ? (picked ? '已选' : '选择') : expandingViewId === v.id ? '展开中…' : '展开名单'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--biu-color-text-muted)', marginBottom: 4 }}>
                  空间成员（{filteredMembers.length}）
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {filteredMembers.map((m) => {
                    const picked = selectedKeySet.has(`account:${m.id}`)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleMember(m)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          padding: '5px 8px',
                          borderRadius: 7,
                          border: 'var(--biu-stroke-width) solid transparent',
                          background: picked ? 'var(--biu-color-bg-hover)' : 'transparent',
                          color: 'var(--biu-color-text)',
                          fontSize: 12,
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          {renderMiniAvatar(m.id, m.avatar)}
                          <span style={{ fontWeight: 500 }}>{m.name}</span>
                          {m.memberKind === 'external' || m.memberKind === 'guest' ? (
                            <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 999, background: 'var(--biu-color-bg-hover)' }}>
                              外部
                            </span>
                          ) : null}
                        </span>
                        <span style={{ fontSize: 11, color: picked ? 'var(--biu-color-accent)' : 'var(--biu-color-text-muted)' }}>
                          {picked ? '已选' : '选择'}
                        </span>
                      </button>
                    )
                  })}
                  {filteredMembers.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--biu-color-text-muted)', padding: '6px 0' }}>
                      无匹配成员
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )}

        {error ? (
          <div style={{ fontSize: 12, color: 'var(--biu-color-danger, #dc2626)' }} role="alert">
            {error}
          </div>
        ) : null}
        {doneNotice ? (
          <div style={{ fontSize: 12, color: 'var(--biu-color-success, #15803d)' }} data-testid="fsdb-batch-share-done">
            {doneNotice}
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
          <button
            type="button"
            className="fsdb-btn"
            onClick={onClose}
          >
            关闭
          </button>
          <button
            type="button"
            className="fsdb-btn fsdb-btn-primary"
            disabled={!canSubmit}
            data-testid="fsdb-batch-share-submit"
            onClick={() => void handleApply()}
          >
            <UsersIcon className="size-3.5" aria-hidden />
            {submitting
              ? '执行中…'
              : mode === 'grant'
                ? '应用批量授权'
                : mode === 'revoke'
                  ? '应用批量回收'
                  : '应用通用访问'}
          </button>
        </div>
      </div>
    </div>
  )

  const portalRoot = overlayPortalRoot()
  return portalRoot ? createPortal(content, portalRoot) : null
}
