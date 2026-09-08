import { sanitizeLiveUiContext, type LiveUiContext } from '@biu/type-session'
import { decodeCollectionSeg, normalizePath } from './session-route.ts'

type LiveView = {
  get(): {
    sessionId: string | null
    sessions: Array<{ id: string; title: string }>
    sessionInspector?: { tab?: string }
  }
}

const DATABASE_RECORD = /^\/database\/([^/]+)(?:\/view\/[^/]+)?\/record\/([^/]+)\/?$/

export function captureLiveUiContext(view: LiveView): LiveUiContext | undefined {
  const state = view.get()
  const sessionId = state.sessionId?.trim() || undefined
  const sessionTitle = state.sessions.find((item) => item.id === sessionId)?.title?.trim() || undefined
  const route = typeof location === 'undefined' ? undefined : normalizePath(location.pathname)
  const inspectorTab = state.sessionInspector?.tab?.trim() || undefined
  const inspectorTabLabel = inspectorTabLabelFromDom(inspectorTab)
  const fromRoute = focusFromRoute(route)
  const fromDom = focusFromDom()
  const live = sanitizeLiveUiContext({
    sessionId,
    sessionTitle,
    route,
    inspectorTab,
    inspectorTabLabel,
    focusPath: fromDom.path || fromRoute.path,
    focusTitle: fromDom.title || fromRoute.title,
    caretLine: fromDom.caretLine,
    caretInsert: fromDom.caretInsert,
  })
  return live
}

function inspectorTabLabelFromDom(tabId?: string) {
  if (typeof document === 'undefined') return undefined
  const selected = document.querySelector('.session-inspector [role="tab"][aria-selected="true"]')
  const label = selected?.textContent?.replace(/\s+/g, ' ').trim()
  if (label) return label
  if (!tabId) return undefined
  const slot = tabId.startsWith('database:') ? tabId.slice('database:'.length) : tabId
  const leaf = slot.split('/').filter(Boolean).pop()
  return leaf || undefined
}

function focusFromRoute(pathname?: string) {
  if (!pathname) return {}
  const match = pathname.match(DATABASE_RECORD)
  if (!match?.[1] || !match[2]) return {}
  const collection = decodeCollectionSeg(match[1])
  const recordId = decodeURIComponent(match[2])
  const path = `${collection.replace(/\/$/, '')}/${recordId}`.replace(/\/{2,}/g, '/')
  return { path, title: undefined as string | undefined }
}

function focusFromDom() {
  if (typeof document === 'undefined') return {}
  const editors = [...document.querySelectorAll<HTMLElement>('.page-editor[data-live-path], .page-editor[data-live-title]')]
  const stamped = editors.sort((a, b) => Number(b.dataset.liveAt ?? 0) - Number(a.dataset.liveAt ?? 0))[0]
  const titleInput = document.querySelector<HTMLTextAreaElement | HTMLInputElement>('.fsdb-detail-title-input')
  const titleHead = document.querySelector('.fsdb-detail-title')
  const title = titleInput?.value.trim() || titleHead?.textContent?.trim() || stamped?.dataset.liveTitle
  const path = stamped?.dataset.livePath
  const caretLine = Number(stamped?.dataset.liveLine)
  const caretInsert = Number(stamped?.dataset.liveInsert)
  return {
    path,
    title,
    caretLine: Number.isInteger(caretLine) && caretLine >= 1 ? caretLine : undefined,
    caretInsert: Number.isInteger(caretInsert) && caretInsert >= 0 ? caretInsert : undefined,
  }
}
