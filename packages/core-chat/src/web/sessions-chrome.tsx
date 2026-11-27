import { apiFetch } from '@biu/biu-ui/api-client'
import { lazy, Suspense, useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChatPane, ChatStage } from '@biu/biu-ui/chat-pane'
import { SidebarMascot, resolveSessionMascot } from '@biu/public-mascot'
import { MASCOT_COLOR_NAME, MASCOT_EYE_NAME, MASCOT_SHAPE_NAME } from '@biu/type-session'
import type { CollectionChrome, FsCellProps, FsContentProps, FsDetailTools } from '@biu/type-file-system/ui'
import type { DbRecord } from '@biu/type-file-system'
import { useActiveRecordLayout } from '@biu/core-file-system/record-layouts'
import {
  mergeDispatchedUsageIntoNodes,
  projectNodes,
  TRAJECTORY_TAIL_TURNS,
  type ChatNode,
  type SessionEvent,
  type TrajectoryUsage,
  type SessionViewService,
} from '@biu/web-session-view'
const ChatNodeList = lazy(() => import('./thread.tsx').then((m) => ({ default: m.ChatNodeList })))

function sessionMascot(record: DbRecord) {
  const raw = record.mascot
  if (!raw || typeof raw !== 'object') return undefined
  const mascot = raw as { shape?: unknown; color?: unknown; eye?: unknown }
  if (typeof mascot.shape !== 'string' || typeof mascot.color !== 'string') return undefined
  return {
    shape: mascot.shape,
    color: mascot.color,
    ...(typeof mascot.eye === 'number' ? { eye: mascot.eye } : {}),
  }
}

function SessionIcon({ record, size = 20 }: { record: DbRecord; size?: number }) {
  const identity = resolveSessionMascot(String(record.id), sessionMascot(record))
  return <SidebarMascot size={size} sessionId={String(record.id)} identity={identity} animate={false} title="" />
}

function SessionTitle({ label }: { record: DbRecord; label: string }) {
  return <span className="sessions-title-label">{label}</span>
}

function MascotShapeCell({ value }: FsCellProps) {
  const key = String(value ?? '')
  return <span>{MASCOT_SHAPE_NAME[key] ?? key}</span>
}

function MascotColorCell({ value }: FsCellProps) {
  const key = String(value ?? '')
  return <span>{MASCOT_COLOR_NAME[key] ?? key}</span>
}

function MascotEyeCell({ value }: FsCellProps) {
  const n = Number(value)
  if (!Number.isFinite(n)) return <span>—</span>
  const name = MASCOT_EYE_NAME[Math.abs(Math.trunc(n)) % MASCOT_EYE_NAME.length]
  return <span>{name}</span>
}

function eventsFromContent(value: unknown): SessionEvent[] | null {
  if (Array.isArray(value)) return value as SessionEvent[]
  if (value && typeof value === 'object' && Array.isArray((value as { events?: unknown }).events)) {
    return (value as { events: SessionEvent[] }).events
  }
  return null
}

function usageFromContent(value: unknown): Record<string, TrajectoryUsage> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const raw = (value as { dispatchedUsageByTurn?: unknown }).dispatchedUsageByTurn
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return raw as Record<string, TrajectoryUsage>
}

function nodesFromContent(value: unknown): ChatNode[] | null {
  const events = eventsFromContent(value)
  if (!events) return null
  return mergeDispatchedUsageIntoNodes(projectNodes(events), usageFromContent(value))
}

function loadSessionNodes(sessionId: string, signal?: AbortSignal) {
  return apiFetch(`/api/agents/${sessionId}?turns=${TRAJECTORY_TAIL_TURNS}`, { signal, cache: 'no-store' }).then((res) =>
    res.ok ? res.json() : null,
  )
}

export const AGENTS_DETAIL_TOOLS: FsDetailTools = {
  sorts: [
    { id: 'time-desc', label: '时间倒序' },
    { id: 'time-asc', label: '时间正序' },
  ],
}

export function SessionRecordChat({
  record,
  value,
  sessionView,
}: FsContentProps & { sessionView?: SessionViewService }) {
  const sessionId = String(record.id)
  const navigate = useNavigate()
  const layout = useActiveRecordLayout('/agents', sessionId, 'chat')
  const newestFirst = layout.sort !== 'time-asc'
  const live = useSyncExternalStore(
    (fn) => (sessionView ? sessionView.subscribe(fn) : () => undefined),
    () => sessionView?.get() ?? null,
    () => sessionView?.get() ?? null,
  )
  const [nodes, setNodes] = useState<ChatNode[]>(() => nodesFromContent(value) ?? [])
  const shown = live?.sessionId === sessionId ? live.nodes : nodes
  useEffect(() => {
    const seeded = nodesFromContent(value)
    if (seeded?.length) setNodes(seeded)
    const ac = new AbortController()
    const apply = (body: { events?: unknown; dispatchedUsageByTurn?: Record<string, TrajectoryUsage> } | null) => {
      if (!body || !Array.isArray(body.events)) return
      setNodes(
        mergeDispatchedUsageIntoNodes(
          projectNodes(body.events as SessionEvent[]),
          body.dispatchedUsageByTurn ?? {},
        ),
      )
    }
    void loadSessionNodes(sessionId, ac.signal).then(apply).catch(() => undefined)
    const onRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail
      if (detail?.id && detail.id !== sessionId) return
      void loadSessionNodes(sessionId, ac.signal).then(apply).catch(() => undefined)
    }
    window.addEventListener('fsdb:detail-refresh', onRefresh)
    return () => {
      ac.abort()
      window.removeEventListener('fsdb:detail-refresh', onRefresh)
    }
  }, [sessionId, value])
  const onFork = useCallback(async (upToSeq?: number) => {
    const res = await apiFetch(
      `/api/agents/${sessionId}/fork`,
      upToSeq != null
        ? {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ upToSeq }),
          }
        : { method: 'POST' },
    )
    const body = (await res.json().catch(() => ({}))) as { id?: string }
    const id = String(body.id ?? '').trim()
    if (!res.ok || !id) return
    window.dispatchEvent(new Event('fsdb:change'))
    navigate(`/agents/${id}`)
  }, [navigate, sessionId])
  return (
    <ChatPane
      embed
      thread={
        <ChatStage variant="pane">
          <Suspense fallback={null}>
            <ChatNodeList
              nodes={shown}
              sessionId={sessionId}
              newestFirst={newestFirst}
              onInspect={() => undefined}
              onFork={onFork}
            />
          </Suspense>
        </ChatStage>
      }
    />
  )
}

export function sessionsChrome(): CollectionChrome {
  return {
    Title: SessionTitle,
    Icon: SessionIcon,
    Content: SessionRecordChat,
    cells: {
      mascotShape: MascotShapeCell,
      mascotColor: MascotColorCell,
      mascotEye: MascotEyeCell,
    },
  }
}

if (typeof document !== 'undefined') {
  const id = 'biu-sessions-chrome-style'
  const style = document.getElementById(id) ?? document.createElement('style')
  style.id = id
  style.textContent = `
.sessions-title-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:var(--biu-font-weight-medium)}
.fsdb-detail-main:has(.chat-pane-embed){--biu-chat-max-width:none}
.fsdb-detail-main:has(.chat-pane-embed) > :not(.fsdb-page-banner){max-width:none;width:100%;margin-inline:0}
.fsdb-fileview:has(.chat-pane-embed){display:flex;flex-direction:column;flex:none;min-width:0;min-height:0;height:auto;width:100%;max-width:none;background:var(--biu-color-bg)}
.inspector-database-page .fsdb-fileview:has(.chat-pane-embed){min-height:0;flex:1}
.fsdb-detail-main:has(.chat-pane-embed),.fsdb-detail-screen:has(.chat-pane-embed){background:var(--biu-color-bg)}
.fsdb-detail-main:has(.chat-pane-embed) .chat-pane-embed{padding:0;min-width:0;min-height:0;width:100%;max-width:none;box-sizing:border-box}
.fsdb-detail-main:has(.chat-pane-embed) .chat-pane-embed,.fsdb-detail-main:has(.chat-pane-embed) .chat-overlay-thread,.fsdb-detail-main:has(.chat-pane-embed) .chat-stage{overflow:visible;flex:none;min-width:0;min-height:0;height:auto;max-width:none;width:100%;overscroll-behavior:auto;align-items:stretch;scrollbar-gutter:auto}
.fsdb-detail-main:has(.chat-pane-embed) .chat-stage{padding-inline:0}
.fsdb-detail-main:has(.chat-pane-embed) .chat-stage>*,.fsdb-detail-main:has(.chat-pane-embed) .chat-node-list,.fsdb-detail-main:has(.chat-pane-embed) .chat-turn,.fsdb-detail-main:has(.chat-pane-embed) .chat-user-card{max-width:none;width:100%;min-width:0;margin-inline:0;box-sizing:border-box}
`
  document.head.appendChild(style)
}
