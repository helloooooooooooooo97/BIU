/** 聊天列窄于此时自动弹出覆盖对话框（px）。不自动收回。 */
export const CHAT_OVERLAY_ENTER = 420
export const SIDEBAR_MAX = 360
/** 默认就是能正常看会话名的宽度，不是图标细条。 */
export const SIDEBAR_DEFAULT = 240
/** 再窄就整栏关掉；最小宽度仍是正常侧栏（有会话名），不会压成图标轨。 */
export const SIDEBAR_MIN = 160
/** 到这个宽度就显示文字标签（会话名、「添加聊天」等）。 */
export const SIDEBAR_LABEL_AT = SIDEBAR_MIN
/** 拉到侧栏最大宽度才显示会话 tag（日报、总结、+N 等）。 */
export const SIDEBAR_TAG_AT = SIDEBAR_MAX
/** 中间列希望至少这么宽；不够时先压检查器，不够再压左侧，不要一窄就把侧栏关掉。 */
export const CENTER_MIN = 512
export const INSPECTOR_MIN = 240
const RAIL = 0
const SIDEBAR = SIDEBAR_MAX

/** 低于最小宽度则 0（整栏消失）；否则夹在 [MIN, MAX]。 */
export function clampSidebarWidth(width: number) {
  const n = Math.round(Number(width))
  if (!Number.isFinite(n) || n < SIDEBAR_MIN) return 0
  return Math.min(SIDEBAR_MAX, n)
}

/** 窄屏时先压中间、再把检查器收到 INSPECTOR_MIN；左侧尽量保持，两侧都压到顶后才收到 SIDEBAR_MIN，仍不够才整栏关掉。 */
export function allocateShellColumns(opts: {
  viewportWidth: number
  railWidth?: number
  leftPane: boolean
  leftWidth?: number
  inspectorOpen: boolean
  inspectorWidth: number
}) {
  const rail = opts.railWidth ?? RAIL
  const available = Math.max(0, opts.viewportWidth - rail)
  let left = opts.leftPane ? clampSidebarWidth(opts.leftWidth ?? SIDEBAR_MAX) : 0
  let inspector = opts.inspectorOpen ? Math.max(INSPECTOR_MIN, opts.inspectorWidth) : 0
  let center = available - left - inspector
  if (center < CENTER_MIN && inspector > INSPECTOR_MIN) {
    const take = Math.min(inspector - INSPECTOR_MIN, CENTER_MIN - center)
    inspector -= take
    center += take
  }
  if (center < 0 && left > SIDEBAR_MIN) {
    const take = Math.min(left - SIDEBAR_MIN, -center)
    left -= take
    center += take
  }
  if (center < 0 && left > 0) {
    center += left
    left = 0
  }
  if (center < 0 && inspector > 0) {
    const take = Math.min(inspector, -center)
    inspector -= take
    center += take
  }
  center = Math.max(0, available - left - inspector)
  return { left, inspector, center }
}

export function applyShellColumnCssVars(el: HTMLElement | null, cols: { left: number; inspector: number }) {
  if (!el) return
  el.style.setProperty('--sidebar-col', `${cols.left}px`)
  el.style.setProperty('--inspector-width', `${cols.inspector}px`)
}

export type ShellLayoutSnap = {
  leftPane: boolean
  inspectorVisible: boolean
  inspectorWidth: number
  sidebarWidth: number
  sidebarCollapsed: boolean
}

/** 收起/改宽立刻写 snap，等渲染再覆盖会让下一次拖拽按旧侧栏状态算，弹开一次。 */
export function commitShellLayoutSnap(
  snap: ShellLayoutSnap,
  patch: {
    leftPane?: boolean
    inspectorOpen?: boolean
    inspectorWidth?: number
    sidebarWidth?: number
    sidebarCollapsed?: boolean
  },
): ShellLayoutSnap {
  return {
    leftPane: patch.leftPane ?? snap.leftPane,
    inspectorVisible: patch.inspectorOpen ?? snap.inspectorVisible,
    inspectorWidth: patch.inspectorWidth ?? snap.inspectorWidth,
    sidebarWidth: patch.sidebarWidth ?? snap.sidebarWidth,
    sidebarCollapsed: patch.sidebarCollapsed ?? snap.sidebarCollapsed,
  }
}

export function publishShellLayout(cols: { left: number; inspector: number }) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('biu:shell-layout', { detail: { left: cols.left, inspector: cols.inspector } }))
}

export function shellLayoutFromEvent(event: Event): { left: number; inspector: number } | null {
  const detail = (event as CustomEvent<{ left?: unknown; inspector?: unknown }>).detail
  if (!detail || typeof detail !== 'object') return null
  const left = Number(detail.left)
  const inspector = Number(detail.inspector)
  if (!Number.isFinite(left) || !Number.isFinite(inspector)) return null
  return { left, inspector }
}

export function shellLayoutFromElement(el: Element | null): { left: number; inspector: number } | null {
  if (!(el instanceof HTMLElement)) return null
  const styles = getComputedStyle(el)
  const left = Number.parseFloat(styles.getPropertyValue('--sidebar-col'))
  const inspector = Number.parseFloat(styles.getPropertyValue('--inspector-width'))
  if (!Number.isFinite(left) || !Number.isFinite(inspector)) return null
  return { left, inspector }
}

/** 拖宽起点用格子 CSS 变量，不用 aside 的 getBoundingClientRect（亚像素/边框会让松手回弹、越拖越窄）。 */
export function shellColumnStartWidth(
  handle: Element | null,
  column: 'left' | 'inspector',
  fallback: number,
): number {
  const shell = handle instanceof Element
    ? handle.closest('[data-testid="app-shell"]') ?? handle.closest('.app-shell')
    : null
  const layout = shellLayoutFromElement(shell)
  const n = column === 'left' ? layout?.left : layout?.inspector
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) return n
  return fallback
}

export function chatColumnWidth(opts: {
  viewportWidth: number
  inspectorOpen: boolean
  inspectorWidth: number
  sidebarCollapsed: boolean
}) {
  return allocateShellColumns({
    viewportWidth: opts.viewportWidth,
    leftPane: true,
    leftWidth: opts.sidebarCollapsed ? 0 : SIDEBAR_MAX,
    inspectorOpen: opts.inspectorOpen,
    inspectorWidth: opts.inspectorWidth,
  }).center
}

/** 放大聊天：把检查器收到能给聊天列至少 ENTER 宽度。 */
export function inspectorWidthForExpandedChat(opts: {
  viewportWidth: number
  inspectorWidth: number
  sidebarCollapsed: boolean
}) {
  const side = opts.sidebarCollapsed ? 0 : SIDEBAR
  const maxInspector = opts.viewportWidth - RAIL - side - CHAT_OVERLAY_ENTER
  return Math.min(opts.inspectorWidth, Math.max(INSPECTOR_MIN, Math.round(maxInspector)))
}

let overlay = false
let autohide = false
let resizing = false
let pinned = false
const OVERLAY_THREAD_KEY = 'cordis.overlay.thread'
let overlayThread = false
let overlayThreadReady = false

function readStoredOverlayThread() {
  try {
    const raw = localStorage.getItem(OVERLAY_THREAD_KEY)
    if (raw === '1') return true
    if (raw === '0') return false
  } catch {
    /* ignore */
  }
  return false
}

function rememberOverlayThread(next: boolean) {
  try {
    localStorage.setItem(OVERLAY_THREAD_KEY, next ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function hydrateOverlayThread() {
  if (overlayThreadReady) return
  overlayThreadReady = true
  if (typeof window === 'undefined') return
  overlayThread = readStoredOverlayThread()
}
const listeners = new Set<() => void>()
const autohideListeners = new Set<() => void>()
const pinListeners = new Set<() => void>()
const threadListeners = new Set<() => void>()

function emit() {
  for (const fn of listeners) fn()
}

function emitAutohide() {
  for (const fn of autohideListeners) fn()
}

function emitPin() {
  for (const fn of pinListeners) fn()
}

function emitThread() {
  for (const fn of threadListeners) fn()
}

export function getChatOverlay() {
  return overlay
}

export function subscribeChatOverlay(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function setChatOverlay(next: boolean) {
  if (overlay === next) return
  overlay = next
  if (!next) {
    setOverlayAutohide(false)
    notifyOverlayClosed()
  }
  emit()
}

function notifyOverlayClosed() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event('biu:overlay-closed'))
}

export function closeChatOverlay() {
  setChatOverlay(false)
}

export function getOverlayThread() {
  hydrateOverlayThread()
  return overlayThread
}

export function subscribeOverlayThread(fn: () => void) {
  threadListeners.add(fn)
  return () => {
    threadListeners.delete(fn)
  }
}

export function setOverlayThread(next: boolean) {
  hydrateOverlayThread()
  if (overlayThread === next) return
  overlayThread = next
  rememberOverlayThread(next)
  emitThread()
}

export function toggleOverlayThread() {
  setOverlayThread(!overlayThread)
}

/** 收缩态点外面关掉；展开态、选取态或点在窗口/弹出菜单里则留下。 */
export const OVERLAY_OUTSIDE_KEEP =
  '[data-testid="chat-overlay-panel"], [data-testid="pick-chip-data"], .pick-chip-data, .composer-model-flyout, [data-testid="page-mention"], [data-testid="chat-session-title-pop"], [role="dialog"]'

let pickLive = false

export function shouldCloseOverlayOnOutside(target: EventTarget | null) {
  if (!overlay || overlayThread || pickLive) return false
  if (!(target instanceof Node)) return true
  const el = target instanceof Element ? target : target.parentElement
  if (!el) return true
  return !el.closest(OVERLAY_OUTSIDE_KEEP)
}

let composerFocusPending = false

/** 已挂载的输入框听事件；尚未建好的实例靠 pending，等 editor 就绪后再 focus。不要同步派发——点小人时旧实例正在卸、新实例还是 null。 */
export function requestComposerFocus() {
  composerFocusPending = true
  if (typeof window === 'undefined') return
  const fire = () => window.dispatchEvent(new Event('biu:composer-focus'))
  requestAnimationFrame(fire)
  window.setTimeout(fire, 40)
  window.setTimeout(fire, 200)
}

export function isComposerFocusPending() {
  return composerFocusPending
}

export function consumeComposerFocusPending() {
  const pending = composerFocusPending
  composerFocusPending = false
  return pending
}

type ComposerFocusTarget = {
  isDestroyed?: boolean
  commands?: { focus?: (where?: string) => unknown }
} | null | undefined

/** editor 未就绪或已 destroy（commandManager 已空）时不要读 .commands。 */
export function focusComposerEditor(editor: ComposerFocusTarget) {
  if (!editor || editor.isDestroyed) return false
  try {
    const focus = editor.commands?.focus
    if (typeof focus !== 'function') return false
    focus.call(editor.commands, 'end')
  } catch {
    return false
  }
  consumeComposerFocusPending()
  return true
}

/** 聊天页中间已有输入框，选取不要再弹悬浮窗。 */
export function isChatPagePath(pathname: string) {
  const path = (pathname.split('?')[0] || '/').replace(/\/+$/, '') || '/'
  return path === '/' || path === '/agents' || path.startsWith('/agents/')
}

/** 选取或点小人弹出输入条。回复区沿用上次展开/收缩，首次默认收缩；revealThread 才强制展开。聊天页本身已有输入框，不要再弹窗。 */
export function openOverlayComposer(opts?: { revealThread?: boolean }) {
  if (typeof window !== 'undefined' && isChatPagePath(window.location.pathname)) {
    requestComposerFocus()
    return
  }
  setChatOverlay(true)
  setOverlayAutohide(false)
  if (opts?.revealThread) setOverlayThread(true)
  requestComposerFocus()
}

export function revealOverlayThread() {
  if (!overlay) return
  setOverlayThread(true)
}

export function getOverlayAutohide() {
  return autohide
}

export function subscribeOverlayAutohide(fn: () => void) {
  autohideListeners.add(fn)
  return () => {
    autohideListeners.delete(fn)
  }
}

export function setOverlayAutohide(next: boolean) {
  if (autohide === next) return
  autohide = next
  emitAutohide()
}

export function getOverlayPinned() {
  return pinned
}

export function subscribeOverlayPinned(fn: () => void) {
  pinListeners.add(fn)
  return () => {
    pinListeners.delete(fn)
  }
}

export function setOverlayPinned(next: boolean) {
  if (pinned === next) return
  pinned = next
  if (next) setOverlayAutohide(false)
  emitPin()
}

export function toggleOverlayPinned() {
  setOverlayPinned(!pinned)
}

export function setOverlayResizing(next: boolean) {
  resizing = next
}

/** 仅在未钉住、未拖高度、且指针已离开时收起。 */
/** 指针其实还在浮窗里（子节点重绘、composer 穿透）时不要收起。 */
export function overlayStillHoldsPointer(
  panel: EventTarget | null,
  related: EventTarget | null,
  clientX?: number,
  clientY?: number,
) {
  const root = panel instanceof Element ? panel : null
  if (!root) return false
  if (related instanceof Node && root.contains(related)) return true
  if (typeof clientX === 'number' && typeof clientY === 'number') {
    const hit = document.elementFromPoint(clientX, clientY)
    if (hit && (root.contains(hit) || hit.closest('[data-testid="chat-overlay-panel"]'))) return true
  }
  return false
}

export function requestOverlayAutohide() {
  if (!overlay || resizing || pinned) return
  setOverlayAutohide(true)
}

export function requestInspectorWidth(width: number) {
  window.dispatchEvent(new CustomEvent('biu:inspector-width', { detail: width }))
}

export function requestInspectorOpen() {
  window.dispatchEvent(new Event('biu:inspector-open'))
}

export function requestInspectorClose() {
  window.dispatchEvent(new Event('biu:inspector-close'))
}

export function requestInspectorTab(tabId: string) {
  if (!tabId) return
  window.dispatchEvent(new CustomEvent('biu:inspector-tab', { detail: tabId }))
}

export function requestInspectorAction(action: string) {
  if (!action) return
  window.dispatchEvent(new CustomEvent('biu:inspector-action', { detail: action }))
}

export function inspectorActionFromEvent(event: Event): string | undefined {
  const detail = (event as CustomEvent).detail
  return typeof detail === 'string' && detail ? detail : undefined
}

export function inspectorTabFromEvent(event: Event): string | undefined {
  const detail = (event as CustomEvent).detail
  if (typeof detail === 'string' && detail) return detail
  if (detail && typeof detail === 'object' && typeof (detail as { tabId?: unknown }).tabId === 'string') {
    const tabId = (detail as { tabId: string }).tabId
    return tabId || undefined
  }
  return undefined
}

export function toggleChatOverlay() {
  if (overlay) {
    let inspectorWidth = 320
    try {
      const n = Number(localStorage.getItem('cordis.inspector.width'))
      if (Number.isFinite(n) && n >= 240) inspectorWidth = n
    } catch {
      /* ignore */
    }
    const shell = document.querySelector('[data-testid="app-shell"]')
    const col = shell ? Number.parseFloat(getComputedStyle(shell).getPropertyValue('--sidebar-col')) : NaN
    const sidebarCollapsed = !Number.isFinite(col) || col < SIDEBAR_MIN
    requestInspectorWidth(
      inspectorWidthForExpandedChat({
        viewportWidth: window.innerWidth,
        inspectorWidth,
        sidebarCollapsed,
      }),
    )
    setChatOverlay(false)
    return
  }
  if (typeof window !== 'undefined' && isChatPagePath(window.location.pathname)) {
    requestComposerFocus()
    return
  }
  requestInspectorOpen()
  setChatOverlay(true)
}

export const OVERLAY_CHAT_HEIGHT_MIN = 96
export const OVERLAY_CHAT_HEIGHT_DEFAULT = 200

export type OverlayWinGeom = { x: number; y: number; w: number; h: number }
export type OverlayLayout = 'right' | 'bottom'
export type OverlayWinState = OverlayWinGeom & { layout: OverlayLayout }

export const OVERLAY_WIN_MIN_W = 420
export const OVERLAY_WIN_MIN_H = 280
export const OVERLAY_WIN_DEFAULT_W = 420
export const OVERLAY_WIN_DEFAULT_H = 520
const OVERLAY_WIN_GEOM_KEY = 'cordis.overlay.geom'
const OVERLAY_MARGIN = 12

export function parseOverlayLayout(_value: unknown): OverlayLayout {
  return 'right'
}

export function overlayDockY(h: number, vh = 800) {
  return Math.max(OVERLAY_MARGIN, vh - h - OVERLAY_MARGIN)
}

export function defaultOverlayWinGeom(vw = 1280, vh = 800): OverlayWinGeom {
  const w = Math.min(OVERLAY_WIN_DEFAULT_W, Math.max(OVERLAY_WIN_MIN_W, vw - 40))
  const h = Math.min(OVERLAY_WIN_DEFAULT_H, Math.max(OVERLAY_WIN_MIN_H, vh - OVERLAY_MARGIN * 2))
  return overlayLayoutGeom('right', { x: 0, y: overlayDockY(h, vh), w, h }, vw, vh)
}

export function clampOverlayWinGeom(geom: OverlayWinGeom, vw = 1280, vh = 800): OverlayWinGeom {
  const maxW = Math.max(OVERLAY_WIN_MIN_W, vw - 24)
  const maxH = Math.max(OVERLAY_CHAT_HEIGHT_MIN, vh - 24)
  const minH = Math.min(OVERLAY_WIN_MIN_H, maxH)
  const w = Math.min(maxW, Math.max(OVERLAY_WIN_MIN_W, Math.round(geom.w)))
  const h = Math.min(maxH, Math.max(minH, Math.round(geom.h)))
  const x = Math.min(vw - 48, Math.max(12 - (w - 48), Math.round(geom.x)))
  const y = Math.min(overlayDockY(h, vh), Math.max(OVERLAY_MARGIN, Math.round(geom.y)))
  return { x, y, w, h }
}

export function overlayLayoutGeom(
  _layout: OverlayLayout,
  prev: OverlayWinGeom,
  vw = 1280,
  vh = 800,
): OverlayWinGeom {
  const maxW = Math.max(OVERLAY_WIN_MIN_W, vw - OVERLAY_MARGIN * 2)
  const maxH = Math.max(OVERLAY_CHAT_HEIGHT_MIN, vh - OVERLAY_MARGIN * 2)
  const minH = Math.min(OVERLAY_WIN_MIN_H, maxH)
  const w = Math.min(Math.max(prev.w, OVERLAY_WIN_MIN_W), maxW)
  const h = Math.min(Math.max(prev.h, minH), maxH)
  const dockY = overlayDockY(h, vh)
  const y = Number.isFinite(prev.y) ? prev.y : dockY
  return clampOverlayWinGeom(
    {
      w,
      h,
      x: vw - w - OVERLAY_MARGIN,
      y,
    },
    vw,
    vh,
  )
}

export function readOverlayWinState(): OverlayWinState {
  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight
  const fallback = { ...defaultOverlayWinGeom(vw, vh), layout: 'right' as const }
  try {
    const raw = localStorage.getItem(OVERLAY_WIN_GEOM_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<OverlayWinState>
    const layout = parseOverlayLayout(parsed.layout)
    const prev = {
      x: Number(parsed.x),
      y: Number(parsed.y),
      w: Number(parsed.w),
      h: Number(parsed.h),
    }
    if (![prev.x, prev.y, prev.w, prev.h].every((n) => Number.isFinite(n))) return fallback
    const geom = overlayLayoutGeom(layout, prev, vw, vh)
    return { ...geom, layout }
  } catch {
    return fallback
  }
}

export function readOverlayWinGeom(): OverlayWinGeom {
  const { layout: _layout, ...geom } = readOverlayWinState()
  return geom
}

export function writeOverlayWinState(state: OverlayWinState): void {
  try {
    localStorage.setItem(OVERLAY_WIN_GEOM_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

export function writeOverlayWinGeom(geom: OverlayWinGeom, layout: OverlayLayout = 'right'): void {
  writeOverlayWinState({ ...geom, layout })
}

export function requestOverlayFocus() {
  window.dispatchEvent(new Event('biu:overlay-focus'))
}

export function clampOverlayChatHeight(height: number, maxHeight = 800) {
  const max = Math.max(OVERLAY_CHAT_HEIGHT_MIN, Math.round(maxHeight))
  if (!Number.isFinite(height)) return OVERLAY_CHAT_HEIGHT_DEFAULT
  return Math.min(max, Math.max(OVERLAY_CHAT_HEIGHT_MIN, Math.round(height)))
}

function openPickOverlay() {
  if (isChatPagePath(window.location.pathname)) {
    requestComposerFocus()
    return
  }
  openOverlayComposer()
}

if (typeof window !== 'undefined') {
  window.addEventListener('biu:pick-attached', () => {
    openPickOverlay()
  })
  window.addEventListener('biu:pick-mode', (event) => {
    pickLive = Boolean((event as CustomEvent<{ picking?: boolean }>).detail?.picking)
    if (pickLive) openPickOverlay()
  })
}
