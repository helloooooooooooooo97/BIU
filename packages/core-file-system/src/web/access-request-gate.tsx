import { useEffect, useState } from 'react'
import { LockClosedIcon } from '@heroicons/react/16/solid'
import {
  cancelAccessRequest,
  createAccessRequest,
  fetchAccessRequests,
  type AccessRequestItem,
  type AccessRequestRole,
} from './authz-api.ts'
import { roleActionLabel } from '../shared/authz-labels.ts'

const ACCESS_REQUESTABLE_COLLECTIONS = new Set([
  '/pages',
  '/agents',
  '/tags',
  '/plugins',
  '/skills',
  '/mcp',
])

export function isAccessRequestableCollection(collectionPath: string): boolean {
  return ACCESS_REQUESTABLE_COLLECTIONS.has(String(collectionPath ?? '').trim())
}

export function accessRequestRoleOptions(collection: string): Array<{ value: AccessRequestRole; label: string }> {
  if (collection === '/agents') {
    return [
      { value: 'viewer', label: '可查看' },
      { value: 'editor', label: '可编辑' },
    ]
  }
  return [
    { value: 'viewer', label: '可查看' },
    { value: 'commenter', label: '可评论' },
    { value: 'editor', label: '可编辑' },
  ]
}

export function AccessRequestGate({
  collection,
  recordId,
  onRetry,
  onBack,
}: {
  collection: string
  recordId: string
  onRetry?: () => void
  onBack?: () => void
}) {
  const [role, setRole] = useState<AccessRequestRole>('viewer')
  const [note, setNote] = useState('')
  const [pending, setPending] = useState<AccessRequestItem | null>(null)
  const [submittedSilent, setSubmittedSilent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let gone = false
    setPending(null)
    setSubmittedSilent(false)
    setError('')
    void fetchAccessRequests({ scope: 'mine', status: 'pending', collection, recordId })
      .then((res) => {
        if (!gone) setPending(res.items?.[0] ?? null)
      })
      .catch(() => {
        if (!gone) setPending(null)
      })
    return () => {
      gone = true
    }
  }, [collection, recordId])

  const options = accessRequestRoleOptions(collection)

  async function submit() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await createAccessRequest({ collection, recordId, requestedRole: role, note })
      if (res.request) {
        setPending(res.request)
        setSubmittedSilent(false)
      } else {
        setSubmittedSilent(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '申请发送失败')
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    if (!pending || busy) return
    setBusy(true)
    setError('')
    try {
      await cancelAccessRequest(pending.id)
      setPending(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '撤回失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      data-testid="fsdb-access-request-gate"
      style={{
        display: 'flex',
        justifyContent: 'center',
        padding: '48px 20px',
      }}
    >
      <div
        style={{
          width: 'min(440px, 100%)',
          display: 'grid',
          gap: 14,
          padding: 24,
          borderRadius: 12,
          border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
          background: 'var(--biu-color-surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--biu-color-bg)',
              border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
            }}
          >
            <LockClosedIcon aria-hidden className="size-4" />
          </span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>暂无访问权限或内容不存在</div>
            <div style={{ fontSize: 12, color: 'var(--biu-color-text-muted)', marginTop: 2 }}>
              如果这是空间内的受限内容，可向所有者申请权限；审批通过后系统会通知你。
            </div>
          </div>
        </div>

        {pending || submittedSilent ? (
          <div data-testid="fsdb-access-request-pending" style={{ display: 'grid', gap: 10 }}>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: 'var(--biu-color-bg)',
                border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              已发送权限申请（等待审批）
              {pending ? ` · 申请角色：${roleActionLabel(pending.requestedRole)}` : ''}
              {pending?.note ? ` · 留言：${pending.note}` : ''}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {onRetry ? (
                <button
                  type="button"
                  data-testid="fsdb-access-request-retry"
                  onClick={onRetry}
                  style={{
                    height: 32,
                    padding: '0 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'var(--biu-color-emphasis)',
                    color: '#fff',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  重试打开
                </button>
              ) : null}
              {pending ? (
                <button
                  type="button"
                  disabled={busy}
                  data-testid="fsdb-access-request-cancel"
                  onClick={() => void cancel()}
                  style={{
                    height: 32,
                    padding: '0 14px',
                    borderRadius: 8,
                    border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                    background: 'transparent',
                    color: 'inherit',
                    fontSize: 13,
                    cursor: busy ? 'wait' : 'pointer',
                  }}
                >
                  撤回申请
                </button>
              ) : null}
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  style={{
                    height: 32,
                    padding: '0 14px',
                    borderRadius: 8,
                    border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                    background: 'transparent',
                    color: 'inherit',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  返回列表
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              <span style={{ color: 'var(--biu-color-text-muted)' }}>申请角色</span>
              <select
                aria-label="申请权限角色"
                data-testid="fsdb-access-request-role"
                value={role}
                disabled={busy}
                onChange={(e) => setRole(e.target.value as AccessRequestRole)}
                style={{
                  height: 34,
                  padding: '0 10px',
                  borderRadius: 8,
                  border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                  background: 'var(--biu-color-bg)',
                  color: 'inherit',
                  fontSize: 13,
                }}
              >
                {options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              <span style={{ color: 'var(--biu-color-text-muted)' }}>申请说明（可选）</span>
              <textarea
                rows={2}
                placeholder="说明为什么需要访问该内容…"
                data-testid="fsdb-access-request-note"
                value={note}
                disabled={busy}
                onChange={(e) => setNote(e.target.value)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                  background: 'var(--biu-color-bg)',
                  color: 'inherit',
                  fontSize: 13,
                  resize: 'vertical',
                }}
              />
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                disabled={busy}
                data-testid="fsdb-access-request-submit"
                onClick={() => void submit()}
                style={{
                  height: 32,
                  padding: '0 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--biu-color-emphasis)',
                  color: '#fff',
                  fontSize: 13,
                  cursor: busy ? 'wait' : 'pointer',
                }}
              >
                {busy ? '发送中…' : '申请权限'}
              </button>
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  style={{
                    height: 32,
                    padding: '0 14px',
                    borderRadius: 8,
                    border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                    background: 'transparent',
                    color: 'inherit',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  返回列表
                </button>
              ) : null}
            </div>
          </div>
        )}

        {error ? (
          <div data-testid="fsdb-access-request-error" style={{ fontSize: 12, color: 'var(--biu-color-danger)' }}>
            {error}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function AccessUpgradeBar({
  collection,
  recordId,
}: {
  collection: string
  recordId: string
}) {
  const [pending, setPending] = useState<AccessRequestItem | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let gone = false
    setPending(null)
    setExpanded(false)
    setError('')
    void fetchAccessRequests({ scope: 'mine', status: 'pending', collection, recordId })
      .then((res) => {
        if (!gone) setPending(res.items?.[0] ?? null)
      })
      .catch(() => {
        if (!gone) setPending(null)
      })
    return () => {
      gone = true
    }
  }, [collection, recordId])

  async function requestEdit() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await createAccessRequest({ collection, recordId, requestedRole: 'editor', note })
      if (res.request) setPending(res.request)
      setExpanded(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '申请失败')
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    if (!pending || busy) return
    setBusy(true)
    setError('')
    try {
      await cancelAccessRequest(pending.id)
      setPending(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '撤回失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      data-testid="fsdb-access-upgrade-bar"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '8px 14px',
        borderBottom: 'var(--biu-stroke-width) solid var(--biu-color-border)',
        background: 'var(--biu-color-surface)',
        fontSize: 12,
      }}
    >
      <span style={{ color: 'var(--biu-color-text-muted)' }}>
        {pending ? `已申请${roleActionLabel(pending.requestedRole)}权限（待审批）` : '当前为只读权限'}
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        {pending ? (
          <button
            type="button"
            disabled={busy}
            data-testid="fsdb-access-upgrade-cancel"
            onClick={() => void cancel()}
            style={{
              height: 26,
              padding: '0 10px',
              borderRadius: 6,
              border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
              background: 'transparent',
              color: 'inherit',
              fontSize: 12,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            撤回申请
          </button>
        ) : expanded ? (
          <>
            <input
              type="text"
              placeholder="留言（可选）"
              value={note}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
              style={{
                height: 26,
                padding: '0 8px',
                borderRadius: 6,
                border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                background: 'var(--biu-color-bg)',
                color: 'inherit',
                fontSize: 12,
                width: 160,
              }}
            />
            <button
              type="button"
              disabled={busy}
              data-testid="fsdb-access-upgrade-submit"
              onClick={() => void requestEdit()}
              style={{
                height: 26,
                padding: '0 10px',
                borderRadius: 6,
                border: 'none',
                background: 'var(--biu-color-emphasis)',
                color: '#fff',
                fontSize: 12,
                cursor: busy ? 'wait' : 'pointer',
              }}
            >
              发送申请
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setExpanded(false)}
              style={{
                height: 26,
                padding: '0 8px',
                borderRadius: 6,
                border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
                background: 'transparent',
                color: 'inherit',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              取消
            </button>
          </>
        ) : (
          <button
            type="button"
            data-testid="fsdb-access-upgrade-trigger"
            onClick={() => setExpanded(true)}
            style={{
              height: 26,
              padding: '0 10px',
              borderRadius: 6,
              border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
              background: 'var(--biu-color-bg)',
              color: 'inherit',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            申请编辑权限
          </button>
        )}
      </div>
      {error ? (
        <div style={{ width: '100%', color: 'var(--biu-color-danger)', fontSize: 12 }}>{error}</div>
      ) : null}
    </div>
  )
}
