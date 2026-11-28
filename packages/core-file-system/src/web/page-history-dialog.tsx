import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowUturnLeftIcon,
  ClockIcon,
  DocumentDuplicateIcon,
  SparklesIcon,
  UserIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid'
import { apiFetch } from '@biu/biu-ui/api-client'
import { collapseDiffContext, computeLineDiff } from '../shared/text-diff.ts'

export type PageRevisionFieldChange = {
  field: string
  label: string
  before: unknown
  after: unknown
}

export type PageRevisionSummary = {
  id: number
  recordId: string
  version: number
  op: 'create' | 'content' | 'fields' | 'mixed' | 'restore'
  actorKind: 'user' | 'agent'
  actorId: string
  actorName: string
  sessionId: string
  title: string
  changes: PageRevisionFieldChange[]
  addedLines: number
  removedLines: number
  summary: string
  createdAt: number
  updatedAt: number
}

export type PageRevisionDetail = PageRevisionSummary & {
  body: string
  prevBody: string
  fields: Record<string, unknown>
  prevFields: Record<string, unknown>
  prevVersion: number | null
}

const STYLE_ID = 'biu-page-history-style'
const STYLE_CSS = `
.phist-backdrop{position:fixed;inset:0;z-index:260;display:flex;align-items:center;justify-content:center;padding:24px;background:color-mix(in srgb,#000 48%,transparent);backdrop-filter:blur(4px)}
.phist-dialog{display:flex;flex-direction:column;width:min(980px,calc(100vw - 32px));height:min(720px,calc(100vh - 48px));border-radius:14px;border:var(--biu-stroke-width) solid var(--biu-color-border-popover,var(--biu-color-border));background:var(--biu-color-bg-popover,var(--biu-color-bg));color:var(--biu-color-text);box-shadow:var(--biu-shadow-popover,0 24px 60px rgba(0,0,0,.35));overflow:hidden}
.phist-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:var(--biu-stroke-width) solid var(--biu-color-border);flex:none}
.phist-head-left{display:flex;align-items:center;gap:8px;min-width:0}
.phist-head-title{font-size:var(--biu-font-size-4,14px);font-weight:600;white-space:nowrap}
.phist-head-sub{font-size:var(--biu-font-size-3,13px);color:var(--biu-color-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.phist-head-right{display:flex;align-items:center;gap:8px;flex:none}
.phist-seg{display:inline-flex;padding:2px;border-radius:8px;background:var(--biu-color-bg-faint,rgba(128,128,128,.12));gap:2px}
.phist-seg-btn{height:26px;padding:0 10px;border:0;border-radius:6px;background:transparent;color:var(--biu-color-text-muted);font:inherit;font-size:12px;font-weight:500;cursor:pointer}
.phist-seg-btn.is-on{background:var(--biu-color-surface,var(--biu-color-bg));color:var(--biu-color-text);box-shadow:0 1px 2px rgba(0,0,0,.12)}
.phist-close{display:grid;place-items:center;width:28px;height:28px;border:0;border-radius:7px;background:transparent;color:var(--biu-color-icon);cursor:pointer}
.phist-close:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.phist-body{display:grid;grid-template-columns:276px minmax(0,1fr);min-height:0;flex:1}
@media (max-width:720px){.phist-body{grid-template-columns:1fr;grid-template-rows:220px minmax(0,1fr)}}
.phist-list-col{display:flex;flex-direction:column;min-height:0;border-right:var(--biu-stroke-width) solid var(--biu-color-border);background:color-mix(in srgb,var(--biu-color-bg-faint,transparent) 35%,transparent)}
.phist-list{list-style:none;margin:0;padding:8px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:4px}
.phist-item{display:flex;flex-direction:column;gap:4px;width:100%;padding:9px 10px;border:var(--biu-stroke-width) solid transparent;border-radius:9px;background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit}
.phist-item:hover{background:var(--biu-color-bg-hover)}
.phist-item.is-on{background:color-mix(in srgb,var(--biu-color-emphasis) 12%,transparent);border-color:color-mix(in srgb,var(--biu-color-emphasis) 36%,transparent)}
.phist-item-top{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:12px}
.phist-ver{font-weight:600;color:var(--biu-color-text)}
.phist-tag-latest{font-size:11px;padding:1px 6px;border-radius:999px;background:color-mix(in srgb,var(--biu-color-emphasis) 18%,transparent);color:var(--biu-color-emphasis);font-weight:500}
.phist-time{font-size:11px;color:var(--biu-color-text-muted);white-space:nowrap}
.phist-actor{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--biu-color-text-muted)}
.phist-actor.is-agent{color:var(--biu-color-emphasis)}
.phist-summary{font-size:12px;color:var(--biu-color-text);line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.phist-stats{display:inline-flex;gap:6px;font-size:11px;font-family:var(--font-mono,monospace)}
.phist-stat-add{color:var(--biu-color-ink-green,#22c55e)}
.phist-stat-del{color:var(--biu-color-danger,#ef4444)}
.phist-more-btn{margin:4px 8px 8px;height:30px;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:8px;background:transparent;color:var(--biu-color-text-muted);font:inherit;font-size:12px;cursor:pointer}
.phist-more-btn:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.phist-detail-col{display:flex;flex-direction:column;min-width:0;min-height:0}
.phist-detail-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:10px 16px;border-bottom:var(--biu-stroke-width) solid var(--biu-color-border);flex:none}
.phist-detail-meta{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:12px;color:var(--biu-color-text-muted)}
.phist-detail-actions{display:flex;align-items:center;gap:6px}
.phist-btn{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 10px;border-radius:7px;border:var(--biu-stroke-width) solid var(--biu-color-border);background:transparent;color:var(--biu-color-text);font:inherit;font-size:12px;font-weight:500;cursor:pointer}
.phist-btn:hover:not(:disabled){background:var(--biu-color-bg-hover)}
.phist-btn:disabled{opacity:.45;cursor:not-allowed}
.phist-btn.is-primary{border-color:transparent;background:var(--biu-color-emphasis);color:#fff}
.phist-btn.is-primary:hover:not(:disabled){filter:brightness(1.06)}
.phist-scroll{overflow:auto;flex:1;padding:14px 16px 20px;display:flex;flex-direction:column;gap:14px}
.phist-section-label{font-size:11px;font-weight:600;color:var(--biu-color-text-muted);letter-spacing:.04em;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between}
.phist-fields{display:flex;flex-direction:column;gap:6px}
.phist-field-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:7px 10px;border-radius:8px;background:color-mix(in srgb,var(--biu-color-bg-faint,rgba(128,128,128,.12)) 55%,transparent);font-size:12px}
.phist-field-k{font-weight:600;color:var(--biu-color-text-muted);min-width:56px}
.phist-val-old{padding:1px 6px;border-radius:5px;background:color-mix(in srgb,var(--biu-color-danger,#ef4444) 15%,transparent);color:var(--biu-color-danger,#ef4444);text-decoration:line-through;word-break:break-word}
.phist-val-new{padding:1px 6px;border-radius:5px;background:color-mix(in srgb,var(--biu-color-ink-green,#22c55e) 16%,transparent);color:var(--biu-color-ink-green,#22c55e);word-break:break-word}
.phist-diff{border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:9px;overflow:hidden;font-family:var(--font-mono,ui-monospace,monospace);font-size:12px;line-height:1.55}
.phist-diff-line{display:grid;grid-template-columns:40px 40px 18px minmax(0,1fr);padding:1px 8px;white-space:pre-wrap;word-break:break-word}
.phist-diff-line.is-add{background:color-mix(in srgb,var(--biu-color-ink-green,#22c55e) 14%,transparent)}
.phist-diff-line.is-del{background:color-mix(in srgb,var(--biu-color-danger,#ef4444) 14%,transparent)}
.phist-ln{color:var(--biu-color-text-muted);opacity:.65;text-align:right;padding-right:8px;user-select:none}
.phist-sig{user-select:none;font-weight:600}
.phist-diff-line.is-add .phist-sig{color:var(--biu-color-ink-green,#22c55e)}
.phist-diff-line.is-del .phist-sig{color:var(--biu-color-danger,#ef4444)}
.phist-diff-collapse{padding:4px 12px;font-size:11px;color:var(--biu-color-text-muted);background:color-mix(in srgb,var(--biu-color-bg-faint,rgba(128,128,128,.12)) 65%,transparent);text-align:center}
.phist-preview{border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:9px;padding:14px 16px;background:color-mix(in srgb,var(--biu-color-bg-faint,transparent) 28%,transparent)}
.phist-preview-title{font-size:18px;font-weight:700;margin:0 0 10px}
.phist-preview-body{margin:0;white-space:pre-wrap;word-break:break-word;font-family:inherit;font-size:13px;line-height:1.7;color:var(--biu-color-text)}
.phist-empty{display:grid;place-items:center;flex:1;padding:32px;color:var(--biu-color-text-muted);font-size:13px;text-align:center}
.phist-err{padding:8px 12px;border-radius:8px;background:color-mix(in srgb,var(--biu-color-danger,#ef4444) 14%,transparent);color:var(--biu-color-danger,#ef4444);font-size:12px}
`

function ensureHistoryStyle() {
  if (typeof document === 'undefined') return
  const existing = document.getElementById(STYLE_ID)
  if (existing) {
    if (existing.textContent !== STYLE_CSS) existing.textContent = STYLE_CSS
    return
  }
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = STYLE_CSS
  document.head.appendChild(style)
}

function formatRevisionTime(ts: number, now = Date.now()) {
  if (!ts || !Number.isFinite(ts)) return ''
  const d = new Date(ts)
  const cur = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.getFullYear() === cur.getFullYear() && d.getMonth() === cur.getMonth() && d.getDate() === cur.getDate()) {
    return hm
  }
  const yest = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() - 1)
  if (d.getFullYear() === yest.getFullYear() && d.getMonth() === yest.getMonth() && d.getDate() === yest.getDate()) {
    return `昨天 ${hm}`
  }
  if (d.getFullYear() === cur.getFullYear()) return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${hm}`
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${hm}`
}

function formatFieldVal(val: unknown): string {
  if (val == null || val === '') return '（空）'
  if (typeof val === 'boolean') return val ? '是' : '否'
  if (Array.isArray(val)) return val.length ? val.map((item) => String(item)).join('、') : '（空）'
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val)
    } catch {
      return String(val)
    }
  }
  return String(val)
}

export function PageHistoryDialog({
  recordId,
  pageTitle,
  readOnly = false,
  onClose,
  onRestored,
}: {
  recordId: string
  pageTitle: string
  readOnly?: boolean
  onClose: () => void
  onRestored?: () => void
}) {
  ensureHistoryStyle()
  const [items, setItems] = useState<PageRevisionSummary[]>([])
  const [total, setTotal] = useState(0)
  const [loadingList, setLoadingList] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<PageRevisionDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [mode, setMode] = useState<'diff' | 'preview'>('diff')
  const [showFullDiff, setShowFullDiff] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const loadList = useCallback(
    async (offset = 0, append = false) => {
      setLoadingList(true)
      setError('')
      try {
        const res = await apiFetch(
          `/api/db/pages/${encodeURIComponent(recordId)}/revisions?limit=40&offset=${offset}`,
        )
        const data = (await res.json().catch(() => ({}))) as {
          items?: PageRevisionSummary[]
          total?: number
          error?: string
        }
        if (!res.ok) throw new Error(data.error || '加载历史记录失败')
        const nextItems = Array.isArray(data.items) ? data.items : []
        setItems((prev) => (append ? [...prev, ...nextItems] : nextItems))
        setTotal(Number(data.total ?? nextItems.length))
        if (!append) {
          setSelectedId((prev) => {
            if (prev && nextItems.some((item) => item.id === prev)) return prev
            return nextItems[0]?.id ?? null
          })
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载历史记录失败')
      } finally {
        setLoadingList(false)
      }
    },
    [recordId],
  )

  useEffect(() => {
    void loadList(0, false)
  }, [loadList])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    let cancelled = false
    setLoadingDetail(true)
    setConfirmRestore(false)
    setShowFullDiff(false)
    setError('')
    void apiFetch(`/api/db/pages/${encodeURIComponent(recordId)}/revisions/${selectedId}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as PageRevisionDetail & { error?: string }
        if (!res.ok) throw new Error(data.error || '读取版本详情失败')
        if (!cancelled) setDetail(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '读取版本详情失败')
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false)
      })
    return () => {
      cancelled = true
    }
  }, [recordId, selectedId])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const diffLines = useMemo(() => {
    if (!detail) return []
    return computeLineDiff(detail.prevBody, detail.body)
  }, [detail])

  const hunks = useMemo(() => {
    if (showFullDiff) return diffLines.map((line) => ({ kind: 'line' as const, line }))
    return collapseDiffContext(diffLines, 3)
  }, [diffLines, showFullDiff])

  const hasCollapsedHunks = useMemo(
    () => !showFullDiff && hunks.some((item) => item.kind === 'collapse'),
    [hunks, showFullDiff],
  )

  const latestVersion = items[0]?.version ?? null
  const isLatest = Boolean(detail && latestVersion != null && detail.version === latestVersion)

  async function doRestore() {
    if (!detail || restoring || readOnly) return
    setRestoring(true)
    setError('')
    try {
      const res = await apiFetch(
        `/api/db/pages/${encodeURIComponent(recordId)}/revisions/${detail.id}/restore`,
        { method: 'POST' },
      )
      const data = (await res.json().catch(() => ({}))) as { error?: string; revision?: PageRevisionSummary }
      if (!res.ok) throw new Error(data.error || '恢复失败')
      setConfirmRestore(false)
      onRestored?.()
      await loadList(0, false)
      if (data.revision?.id) setSelectedId(data.revision.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '恢复失败')
    } finally {
      setRestoring(false)
    }
  }

  function copyBody() {
    if (!detail) return
    void navigator.clipboard?.writeText(detail.body).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }

  const dialog = (
    <div
      className="phist-backdrop"
      data-testid="page-history-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="phist-dialog" role="dialog" aria-modal="true" aria-label="页面历史记录" data-testid="page-history-dialog">
        <div className="phist-head">
          <div className="phist-head-left">
            <ClockIcon className="size-4 shrink-0" aria-hidden />
            <span className="phist-head-title">历史记录</span>
            {pageTitle ? <span className="phist-head-sub">· {pageTitle}</span> : null}
          </div>
          <div className="phist-head-right">
            <div className="phist-seg" role="tablist" aria-label="视图模式">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'diff'}
                className={`phist-seg-btn${mode === 'diff' ? ' is-on' : ''}`}
                data-testid="page-history-tab-diff"
                onClick={() => setMode('diff')}
              >
                变更对比
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'preview'}
                className={`phist-seg-btn${mode === 'preview' ? ' is-on' : ''}`}
                data-testid="page-history-tab-preview"
                onClick={() => setMode('preview')}
              >
                完整预览
              </button>
            </div>
            <button
              type="button"
              className="phist-close"
              aria-label="关闭历史记录"
              title="关闭"
              data-testid="page-history-close"
              onClick={onClose}
            >
              <XMarkIcon className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        <div className="phist-body">
          <div className="phist-list-col">
            {loadingList && !items.length ? (
              <div className="phist-empty">正在加载历史记录…</div>
            ) : !items.length ? (
              <div className="phist-empty" data-testid="page-history-empty">
                暂无历史版本记录
                <br />
                编辑正文或属性后会自动生成
              </div>
            ) : (
              <>
                <ul className="phist-list" data-testid="page-history-list">
                  {items.map((item, idx) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`phist-item${item.id === selectedId ? ' is-on' : ''}`}
                        data-testid="page-history-item"
                        onClick={() => setSelectedId(item.id)}
                      >
                        <div className="phist-item-top">
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span className="phist-ver">#{item.version}</span>
                            {idx === 0 ? <span className="phist-tag-latest">当前</span> : null}
                          </span>
                          <span className="phist-time">{formatRevisionTime(item.updatedAt)}</span>
                        </div>
                        <span className={`phist-actor${item.actorKind === 'agent' ? ' is-agent' : ''}`}>
                          {item.actorKind === 'agent' ? (
                            <SparklesIcon className="size-3 shrink-0" aria-hidden />
                          ) : (
                            <UserIcon className="size-3 shrink-0" aria-hidden />
                          )}
                          <span>{item.actorName || (item.actorKind === 'agent' ? 'Agent' : '用户')}</span>
                        </span>
                        <span className="phist-summary">{item.summary}</span>
                        {item.addedLines > 0 || item.removedLines > 0 ? (
                          <span className="phist-stats">
                            {item.addedLines > 0 ? <span className="phist-stat-add">+{item.addedLines}</span> : null}
                            {item.removedLines > 0 ? <span className="phist-stat-del">-{item.removedLines}</span> : null}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
                {items.length < total ? (
                  <button
                    type="button"
                    className="phist-more-btn"
                    disabled={loadingList}
                    onClick={() => void loadList(items.length, true)}
                  >
                    {loadingList ? '加载中…' : `加载更多（共 ${total} 条）`}
                  </button>
                ) : null}
              </>
            )}
          </div>

          <div className="phist-detail-col">
            {detail ? (
              <>
                <div className="phist-detail-bar">
                  <div className="phist-detail-meta">
                    <strong style={{ color: 'var(--biu-color-text)' }}>版本 #{detail.version}</strong>
                    <span>·</span>
                    <span>{detail.actorName || '用户'}</span>
                    <span>·</span>
                    <span>{new Date(detail.updatedAt).toLocaleString()}</span>
                  </div>
                  <div className="phist-detail-actions">
                    {mode === 'preview' ? (
                      <button type="button" className="phist-btn" onClick={copyBody}>
                        <DocumentDuplicateIcon className="size-3.5" aria-hidden />
                        {copied ? '已复制' : '复制正文'}
                      </button>
                    ) : null}
                    {!readOnly && !isLatest ? (
                      confirmRestore ? (
                        <>
                          <button
                            type="button"
                            className="phist-btn is-primary"
                            disabled={restoring}
                            data-testid="page-history-restore-confirm"
                            onClick={() => void doRestore()}
                          >
                            {restoring ? '恢复中…' : `确认恢复到 #${detail.version}`}
                          </button>
                          <button
                            type="button"
                            className="phist-btn"
                            disabled={restoring}
                            onClick={() => setConfirmRestore(false)}
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="phist-btn"
                          data-testid="page-history-restore"
                          onClick={() => setConfirmRestore(true)}
                        >
                          <ArrowUturnLeftIcon className="size-3.5" aria-hidden />
                          恢复到此版本
                        </button>
                      )
                    ) : null}
                  </div>
                </div>

                <div className="phist-scroll">
                  {error ? <div className="phist-err">{error}</div> : null}

                  {detail.changes.length > 0 ? (
                    <div>
                      <div className="phist-section-label">属性变更</div>
                      <div className="phist-fields" data-testid="page-history-field-changes">
                        {detail.changes.map((chg) => (
                          <div key={chg.field} className="phist-field-row">
                            <span className="phist-field-k">{chg.label}</span>
                            <span className="phist-val-old">{formatFieldVal(chg.before)}</span>
                            <span style={{ color: 'var(--biu-color-text-muted)' }}>→</span>
                            <span className="phist-val-new">{formatFieldVal(chg.after)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {mode === 'diff' ? (
                    <div>
                      <div className="phist-section-label">
                        <span>
                          正文变更
                          {detail.prevVersion != null ? `（对比版本 #${detail.prevVersion}）` : '（初始版本）'}
                        </span>
                        {hasCollapsedHunks ? (
                          <button
                            type="button"
                            className="phist-btn"
                            style={{ height: 22, padding: '0 8px', fontSize: 11 }}
                            onClick={() => setShowFullDiff(true)}
                          >
                            展开全部行
                          </button>
                        ) : null}
                      </div>
                      {hunks.length > 0 ? (
                        <div className="phist-diff" data-testid="page-history-diff">
                          {hunks.map((item, idx) =>
                            item.kind === 'collapse' ? (
                              <div key={`c-${idx}`} className="phist-diff-collapse">
                                … 已折叠 {item.count} 行未变更内容 …
                              </div>
                            ) : (
                              <div
                                key={`l-${idx}`}
                                className={`phist-diff-line${item.line.type === 'add' ? ' is-add' : item.line.type === 'del' ? ' is-del' : ''}`}
                              >
                                <span className="phist-ln">{item.line.oldLine ?? ''}</span>
                                <span className="phist-ln">{item.line.newLine ?? ''}</span>
                                <span className="phist-sig">
                                  {item.line.type === 'add' ? '+' : item.line.type === 'del' ? '-' : ' '}
                                </span>
                                <span>{item.line.text || ' '}</span>
                              </div>
                            ),
                          )}
                        </div>
                      ) : (
                        <div className="phist-empty" style={{ padding: 20 }}>
                          此版本未改动正文
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div className="phist-section-label">版本快照预览</div>
                      <div className="phist-preview" data-testid="page-history-preview">
                        <h3 className="phist-preview-title">{detail.title || '未命名页面'}</h3>
                        <pre className="phist-preview-body">{detail.body || '（正文为空）'}</pre>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : loadingDetail ? (
              <div className="phist-empty">正在读取版本详情…</div>
            ) : error ? (
              <div className="phist-empty">
                <div className="phist-err">{error}</div>
              </div>
            ) : (
              <div className="phist-empty">选择左侧版本查看变更详情</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(dialog, document.body) : dialog
}
