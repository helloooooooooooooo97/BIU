import { useState } from 'react'
import { apiFetch } from '@biu/biu-ui/api-client'
import type { FsContentProps } from '@biu/type-file-system/ui'
import type { CollectionChrome } from '@biu/type-file-system/ui'

export type NoticeFileCard = {
  name: string
  href: string
  image: boolean
}

export type AccessRequestNoticePayload = {
  type: 'access-request'
  requestId: string
  collection: string
  recordId: string
  recordTitle: string
  requesterId: string
  requesterName: string
  requesterEmail: string
  requesterMemberKind?: 'member' | 'external' | 'guest'
  requestedRole: 'viewer' | 'commenter' | 'editor'
  note: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  grantedRole?: 'viewer' | 'commenter' | 'editor'
  handledByName?: string
  decisionNote?: string
}

const ROLE_LABELS: Record<string, string> = {
  viewer: '可查看',
  commenter: '可评论',
  editor: '可编辑',
}

export function noticeFiles(value: unknown): NoticeFileCard[] {
  if (!Array.isArray(value)) return []
  const files: NoticeFileCard[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const name = String(row.name ?? '').trim()
    const href = String(row.href ?? '').trim()
    if (!name || !href) continue
    files.push({ name, href, image: row.image === true })
  }
  return files
}

export function parseAccessRequestNotice(value: unknown): AccessRequestNoticePayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (row.type !== 'access-request') return null
  const requestId = String(row.requestId ?? '').trim()
  const collection = String(row.collection ?? '').trim()
  const recordId = String(row.recordId ?? '').trim()
  if (!requestId || !collection || !recordId) return null
  const requestedRole =
    row.requestedRole === 'editor' || row.requestedRole === 'commenter' ? row.requestedRole : 'viewer'
  const status =
    row.status === 'approved' || row.status === 'rejected' || row.status === 'cancelled' ? row.status : 'pending'
  const grantedRole =
    row.grantedRole === 'viewer' || row.grantedRole === 'commenter' || row.grantedRole === 'editor'
      ? row.grantedRole
      : undefined
  return {
    type: 'access-request',
    requestId,
    collection,
    recordId,
    recordTitle: String(row.recordTitle ?? '').trim() || `${collection}/${recordId}`,
    requesterId: String(row.requesterId ?? '').trim(),
    requesterName: String(row.requesterName ?? '').trim() || '成员',
    requesterEmail: String(row.requesterEmail ?? '').trim(),
    requesterMemberKind:
      row.requesterMemberKind === 'external' || row.requesterMemberKind === 'guest'
        ? row.requesterMemberKind
        : 'member',
    requestedRole,
    note: String(row.note ?? '').trim(),
    status,
    ...(grantedRole ? { grantedRole } : {}),
    ...(row.handledByName ? { handledByName: String(row.handledByName).trim() } : {}),
    ...(row.decisionNote ? { decisionNote: String(row.decisionNote).trim() } : {}),
  }
}

function AccessRequestNoticeCard({ payload }: { payload: AccessRequestNoticePayload }) {
  const [role, setRole] = useState<'viewer' | 'commenter' | 'editor'>(payload.requestedRole)
  const [status, setStatus] = useState(payload.status)
  const [grantedRole, setGrantedRole] = useState(payload.grantedRole)
  const [handledByName, setHandledByName] = useState(payload.handledByName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const roleChoices: Array<'viewer' | 'commenter' | 'editor'> =
    payload.collection === '/agents' ? ['viewer', 'editor'] : ['viewer', 'commenter', 'editor']

  async function decide(decision: 'approve' | 'reject') {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await apiFetch(`/api/account/access-requests/${encodeURIComponent(payload.requestId)}/decide`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          decision,
          ...(decision === 'approve' ? { grantedRole: role } : {}),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        request?: { status?: 'approved' | 'rejected'; grantedRole?: 'viewer' | 'commenter' | 'editor'; handledByName?: string }
      }
      if (!res.ok) throw new Error(data.error || '审批失败')
      setStatus(data.request?.status ?? (decision === 'approve' ? 'approved' : 'rejected'))
      if (data.request?.grantedRole) setGrantedRole(data.request.grantedRole)
      if (data.request?.handledByName) setHandledByName(data.request.handledByName)
    } catch (err) {
      setError(err instanceof Error ? err.message : '审批失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      data-testid="notice-access-request-card"
      style={{
        display: 'grid',
        gap: 10,
        padding: 14,
        borderRadius: 10,
        border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
        background: 'var(--biu-color-surface)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <strong>{payload.requesterName}</strong>
        {payload.requesterEmail ? (
          <span style={{ color: 'var(--biu-color-text-muted)' }}>({payload.requesterEmail})</span>
        ) : null}
        {payload.requesterMemberKind && payload.requesterMemberKind !== 'member' ? (
          <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 999, border: 'var(--biu-stroke-width) solid var(--biu-color-border)' }}>
            {payload.requesterMemberKind === 'guest' ? '访客' : '外部协作者'}
          </span>
        ) : null}
        <span>申请</span>
        <strong>「{payload.recordTitle}」</strong>
        <span>的 {ROLE_LABELS[payload.requestedRole] ?? payload.requestedRole} 权限</span>
      </div>
      {payload.note ? (
        <div style={{ fontSize: 12, color: 'var(--biu-color-text-muted)', lineHeight: 1.5 }}>
          申请留言：{payload.note}
        </div>
      ) : null}
      {status === 'pending' ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <select
            aria-label="授予权限角色"
            value={role}
            disabled={busy}
            onChange={(e) => setRole(e.target.value as 'viewer' | 'commenter' | 'editor')}
            style={{
              height: 30,
              padding: '0 8px',
              borderRadius: 6,
              border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
              background: 'var(--biu-color-bg)',
              color: 'inherit',
              fontSize: 12,
            }}
          >
            {roleChoices.map((opt) => (
              <option key={opt} value={opt}>
                {ROLE_LABELS[opt]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            data-testid="notice-access-request-approve"
            onClick={() => void decide('approve')}
            style={{
              height: 30,
              padding: '0 12px',
              borderRadius: 6,
              border: 'none',
              background: 'var(--biu-color-emphasis)',
              color: '#fff',
              fontSize: 12,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            同意
          </button>
          <button
            type="button"
            disabled={busy}
            data-testid="notice-access-request-reject"
            onClick={() => void decide('reject')}
            style={{
              height: 30,
              padding: '0 12px',
              borderRadius: 6,
              border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
              background: 'transparent',
              color: 'inherit',
              fontSize: 12,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            拒绝
          </button>
        </div>
      ) : (
        <div data-testid="notice-access-request-status" style={{ fontSize: 12, color: 'var(--biu-color-text-muted)' }}>
          {status === 'approved'
            ? `已同意（授予${ROLE_LABELS[grantedRole ?? payload.requestedRole] ?? grantedRole ?? payload.requestedRole}）`
            : status === 'rejected'
              ? '已拒绝'
              : '申请人已撤回'}
          {handledByName ? ` · 处理人：${handledByName}` : ''}
        </div>
      )}
      {error ? <div style={{ fontSize: 12, color: 'var(--biu-color-danger)' }}>{error}</div> : null}
    </div>
  )
}

function NoticeContent({ value }: FsContentProps) {
  const accessReq = parseAccessRequestNotice(value)
  if (accessReq) return <AccessRequestNoticeCard payload={accessReq} />
  const files = noticeFiles(value)
  if (!files.length) return null
  return (
    <ul className="notice-files" data-testid="notice-files">
      {files.map((file) => (
        <li key={file.href} className="notice-file">
          {file.image ? <img className="notice-file-img" src={file.href} alt="" /> : null}
          <a className="notice-file-name" href={file.href} target="_blank" rel="noreferrer">
            {file.name}
          </a>
        </li>
      ))}
    </ul>
  )
}

export const noticesChrome: CollectionChrome = {
  Content: NoticeContent,
}
