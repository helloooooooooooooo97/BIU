import { readStorageString, writeStorageString } from '@biu/biu-ui/client-storage'
import { getSidebarPersist, SIDEBAR_PERSIST } from '@biu/web-session-view'

/** 聊天列窄于此时自动弹出覆盖对话框（px）。不自动收回。 */
export const CHAT_OVERLAY_ENTER = 420
export const SIDEBAR_MAX = 360
/** 默认就是能正常看会话名的宽度，不是图标细条。 */
export const SIDEBAR_DEFAULT = 240
/** 收起/最小模式留下的 VS Code 式图标轨宽度。 */
export const SIDEBAR_RAIL = 48
/** 再窄就收到图标轨；这个宽度仍显示文字。 */
export const SIDEBAR_MIN = 160
/** 到这个宽度就显示文字标签（会话名、「添加聊天」等）。 */
export const SIDEBAR_LABEL_AT = SIDEBAR_MIN
/** 分栏时主内容区与右侧检查器的最小宽度（对标 Notion，配合响应式页面边距，不再整页横向滚动）。 */
export const CENTER_MIN = 360
export const INSPECTOR_MIN = 360
export const INSPECTOR_DEFAULT = 480
export const INSPECTOR_MAX = 1000
/** 低于此视口宽度时左侧栏自动离开文档流，退化为顶栏展开按钮 + 浮层抽屉（px）。 */
export const SIDEBAR_AUTO_HIDE_BELOW = 768
/** 右侧检查器在极窄视口下直接铺满全宽，否则保留左侧遮罩点击区（px）。 */
export const INSPECTOR_OVERLAY_FULL_BELOW = 520
export const INSPECTOR_OVERLAY_PEEK_GUTTER = 48
const RAIL = 0
const SIDEBAR = SIDEBAR_MAX

export type ShellLeftMode = 'none' | 'docked' | 'rail' | 'hidden'
export type ShellInspectorMode = 'closed' | 'split' | 'overlay'

export type ShellColumns = {
  left: number
  center: number
  inspector: number
  leftMode: ShellLeftMode
  inspectorMode: ShellInspectorMode
  /** 左侧栏因视口不足被自动收窄/隐藏（未改写用户持久化偏好，扩窗自动还原）。 */
  leftAutoCollapsed: boolean
  /** 当前视口下左侧栏是否可以停靠展开；为 false 时展开走浮层抽屉。 */
  leftCanDock: boolean
}

/** 低于文字最小宽度则直接完全收起为 0（不留最小缩略图标轨）。 */
export function clampSidebarWidth(width: number) {
  const n = Math.round(Number(width))
  if (!Number.isFinite(n) || n < SIDEBAR_MIN) return 0
  return Math.min(SIDEBAR_MAX, n)
}

export function sidebarColumnWidth(collapsed: boolean, width: number) {
  return collapsed ? 0 : width
}

/**
 * Notion 式优先级分级自适应分配三栏宽度（纯函数、扩缩窗完全可逆、永不整页横向滚动）：
 * 1. 宽屏：三栏按用户偏好并排；压缩时先让中栏收窄至 CENTER_MIN，再温和压缩右栏至 INSPECTOR_MIN，再收窄左栏至 SIDEBAR_MIN。
 * 2. 中屏（放不下三栏但放得下 48px 图标轨 + 双栏）：优先自动把左栏临时收为 48px 图标轨，保住中 + 右双栏。
 * 3. 窄屏（< 768px）：左栏自动离开文档流（0px + 顶栏按钮 / 浮层抽屉）；放得下双栏则中 + 右分屏。
 * 4. 更窄（< CENTER_MIN + INSPECTOR_MIN = 720px）：右栏从分屏平滑降级为右侧 Overlay 浮层（Notion Side Peek），中栏保持 100% 满宽。
 */
export function allocateShellColumns(opts: {
  viewportWidth: number
  railWidth?: number
  leftPane: boolean
  leftWidth?: number
  inspectorOpen: boolean
  inspectorWidth: number
  holdCenter?: number | null
}): ShellColumns {
  const rail = opts.railWidth ?? RAIL
  const available = Math.max(0, Math.round(opts.viewportWidth - rail))
  const desiredLeft = opts.leftPane ? clampSidebarWidth(opts.leftWidth ?? SIDEBAR_DEFAULT) : 0
  const rawInspector = Number(opts.inspectorWidth)
  const desiredInspector = Math.min(
    INSPECTOR_MAX,
    Math.max(INSPECTOR_MIN, Math.round(Number.isFinite(rawInspector) && rawInspector > 0 ? rawInspector : INSPECTOR_DEFAULT)),
  )

  if (!opts.inspectorOpen) {
    if (!opts.leftPane) {
      return {
        left: 0,
        center: available,
        inspector: 0,
        leftMode: 'none',
        inspectorMode: 'closed',
        leftAutoCollapsed: false,
        leftCanDock: false,
      }
    }
    const leftCanDock = available >= SIDEBAR_AUTO_HIDE_BELOW && available - SIDEBAR_MIN >= CENTER_MIN
    if (available < SIDEBAR_AUTO_HIDE_BELOW) {
      return {
        left: 0,
        center: available,
        inspector: 0,
        leftMode: 'hidden',
        inspectorMode: 'closed',
        leftAutoCollapsed: desiredLeft > 0,
        leftCanDock: false,
      }
    }
    const maxDockedLeft = Math.max(0, available - CENTER_MIN)
    let left = desiredLeft
    let leftAutoCollapsed = false
    if (left > maxDockedLeft) {
      if (maxDockedLeft >= SIDEBAR_MIN) {
        left = maxDockedLeft
      } else {
        left = 0
        leftAutoCollapsed = desiredLeft > 0
      }
    }
    const leftMode: ShellLeftMode = left <= 0 ? 'hidden' : 'docked'
    return {
      left,
      center: Math.max(0, available - left),
      inspector: 0,
      leftMode,
      inspectorMode: 'closed',
      leftAutoCollapsed,
      leftCanDock,
    }
  }

  const splitMin = CENTER_MIN + INSPECTOR_MIN
  const leftCanDock = opts.leftPane && available >= SIDEBAR_AUTO_HIDE_BELOW && available >= SIDEBAR_MIN + splitMin

  if (available < splitMin) {
    const full = available < INSPECTOR_OVERLAY_FULL_BELOW
    const overlayMax = full ? available : Math.max(Math.min(INSPECTOR_MIN, available), available - INSPECTOR_OVERLAY_PEEK_GUTTER)
    const overlayWidth = full
      ? available
      : Math.min(overlayMax, Math.max(Math.min(INSPECTOR_MIN, overlayMax), desiredInspector))
    return {
      left: 0,
      center: available,
      inspector: Math.max(0, Math.round(overlayWidth)),
      leftMode: opts.leftPane ? 'hidden' : 'none',
      inspectorMode: 'overlay',
      leftAutoCollapsed: opts.leftPane && desiredLeft > 0,
      leftCanDock: false,
    }
  }

  let left = 0
  let leftAutoCollapsed = false
  if (opts.leftPane) {
    if (available < SIDEBAR_AUTO_HIDE_BELOW) {
      left = 0
      leftAutoCollapsed = desiredLeft > 0
    } else if (desiredLeft <= 0) {
      left = 0
    } else {
      const maxDockedLeft = available - splitMin
      if (maxDockedLeft >= desiredLeft) {
        left = desiredLeft
      } else if (maxDockedLeft >= SIDEBAR_MIN) {
        left = maxDockedLeft
      } else {
        left = 0
        leftAutoCollapsed = true
      }
    }
  }

  const remaining = available - left
  const inspector = Math.min(remaining - CENTER_MIN, desiredInspector)
  const center = remaining - inspector
  const leftMode: ShellLeftMode = !opts.leftPane
    ? 'none'
    : left <= 0
      ? 'hidden'
      : 'docked'

  return {
    left,
    center,
    inspector,
    leftMode,
    inspectorMode: 'split',
    leftAutoCollapsed,
    leftCanDock,
  }
}

export function applyShellColumnCssVars(el: HTMLElement | null, cols: { left: number; inspector: number; center?: number }) {
  if (!el) return
  el.style.setProperty('--sidebar-col', `${cols.left}px`)
  el.style.setProperty('--inspector-width', `${cols.inspector}px`)
  if (cols.center != null) el.style.setProperty('--center-col', `${cols.center}px`)
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
const OVERLAY_THREAD_KEY = 'cordis.overlay.thread'
let overlayThread = false
let overlayThreadReady = false

function readStoredOverlayThread() {
  try {
    const raw = readStorageString(OVERLAY_THREAD_KEY)
    if (raw === '1') return true
    if (raw === '0') return false
  } catch {
    /* ignore */
  }
  return false
}

function rememberOverlayThread(next: boolean) {
  try {
    writeStorageString(OVERLAY_THREAD_KEY, next ? '1' : '0')
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
const threadListeners = new Set<() => void>()

function emit() {
  for (const fn of listeners) fn()
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
  '[data-testid="chat-overlay-panel"], [data-testid="pick-chip-data"], .pick-chip-data, .composer-model-flyout, [data-testid="page-mention"], [role="dialog"]'

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
  return path === '/' || path === '/agents' || path.startsWith('/agents/') || path === '/channels' || path.startsWith('/channels/')
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
export function setOverlayAutohide(next: boolean) {
  autohide = next
}

export function requestInspectorClose() {
  window.dispatchEvent(new Event('biu:inspector-close'))
}
export function requestInspectorAction(action: string) {
  if (!action) return
  window.dispatchEvent(new CustomEvent('biu:inspector-action', { detail: action }))
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

export const OVERLAY_CHAT_HEIGHT_MIN = 96

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
  const minW = Math.min(OVERLAY_WIN_MIN_W, Math.max(280, vw - OVERLAY_MARGIN * 2))
  const w = Math.min(OVERLAY_WIN_DEFAULT_W, Math.max(minW, vw - 40))
  const h = Math.min(OVERLAY_WIN_DEFAULT_H, Math.max(OVERLAY_WIN_MIN_H, vh - OVERLAY_MARGIN * 2))
  return overlayLayoutGeom('right', { x: 0, y: overlayDockY(h, vh), w, h }, vw, vh)
}

export function clampOverlayWinGeom(geom: OverlayWinGeom, vw = 1280, vh = 800): OverlayWinGeom {
  const maxW = Math.max(280, vw - 24)
  const minW = Math.min(OVERLAY_WIN_MIN_W, maxW)
  const maxH = Math.max(OVERLAY_CHAT_HEIGHT_MIN, vh - 24)
  const minH = Math.min(OVERLAY_WIN_MIN_H, maxH)
  const w = Math.min(maxW, Math.max(minW, Math.round(geom.w)))
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
  const maxW = Math.max(280, vw - OVERLAY_MARGIN * 2)
  const minW = Math.min(OVERLAY_WIN_MIN_W, maxW)
  const maxH = Math.max(OVERLAY_CHAT_HEIGHT_MIN, vh - OVERLAY_MARGIN * 2)
  const minH = Math.min(OVERLAY_WIN_MIN_H, maxH)
  const w = Math.min(Math.max(prev.w, minW), maxW)
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
    const raw = readStorageString(OVERLAY_WIN_GEOM_KEY)
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
export function writeOverlayWinState(state: OverlayWinState): void {
  try {
    writeStorageString(OVERLAY_WIN_GEOM_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}
export function requestOverlayFocus() {
  window.dispatchEvent(new Event('biu:overlay-focus'))
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
