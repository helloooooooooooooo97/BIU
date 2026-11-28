import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  chatColumnWidth,
  inspectorWidthForExpandedChat,
  allocateShellColumns,
  applyShellColumnCssVars,
  commitShellLayoutSnap,
  publishShellLayout,
  shellLayoutFromEvent,
  shellLayoutFromElement,
  shellColumnStartWidth,
  CHAT_OVERLAY_ENTER,
  CENTER_MIN,
  INSPECTOR_DEFAULT,
  INSPECTOR_MIN,
  INSPECTOR_OVERLAY_FULL_BELOW,
  INSPECTOR_OVERLAY_PEEK_GUTTER,
  SIDEBAR_AUTO_HIDE_BELOW,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  SIDEBAR_DEFAULT,
  SIDEBAR_LABEL_AT,
  SIDEBAR_RAIL,
  getChatOverlay,
  setChatOverlay,
  closeChatOverlay,
  getOverlayThread,
  isChatPagePath,
  openOverlayComposer,
  revealOverlayThread,
  toggleOverlayThread,
  setOverlayThread,
  shouldCloseOverlayOnOutside,
  getOverlayAutohide,
  setOverlayAutohide,
  clampOverlayWinGeom,
  defaultOverlayWinGeom,
  overlayLayoutGeom,
  parseOverlayLayout,
  readOverlayWinState,
  writeOverlayWinState,
  OVERLAY_CHAT_HEIGHT_MIN,
  OVERLAY_WIN_MIN_H,
  OVERLAY_WIN_MIN_W,
  inspectorTabFromEvent,
  requestInspectorAction,
  requestComposerFocus,
  isComposerFocusPending,
  consumeComposerFocusPending,
  focusComposerEditor,
} from './chat-overlay.ts'

test('collapsed sidebar keeps a VS Code-style icon rail', () => {
  assert.equal(SIDEBAR_RAIL, 48)
  assert.equal(
    chatColumnWidth({ viewportWidth: 1600, inspectorOpen: true, inspectorWidth: 320, sidebarCollapsed: true }),
    1600 - INSPECTOR_MIN - SIDEBAR_RAIL,
  )
})

test('sidebar below min width becomes the icon rail', () => {
  const rail = allocateShellColumns({
    viewportWidth: 1600,
    leftPane: true,
    leftWidth: SIDEBAR_MIN - 1,
    inspectorOpen: false,
    inspectorWidth: 320,
  })
  assert.equal(rail.left, SIDEBAR_RAIL)
})

test('sidebar stays a normal pane at min width', () => {
  assert.equal(SIDEBAR_MIN, 160)
  assert.equal(SIDEBAR_DEFAULT, 240)
  assert.equal(SIDEBAR_LABEL_AT, SIDEBAR_MIN)
  assert.ok(SIDEBAR_MIN <= SIDEBAR_DEFAULT)
  assert.ok(SIDEBAR_DEFAULT < SIDEBAR_MAX)
  const atMin = allocateShellColumns({
    viewportWidth: 1600,
    leftPane: true,
    leftWidth: SIDEBAR_MIN,
    inspectorOpen: false,
    inspectorWidth: 320,
  })
  assert.equal(atMin.left, SIDEBAR_MIN)
})

test('commitShellLayoutSnap writes collapse before the next render', () => {
  const snap = {
    leftPane: true,
    inspectorVisible: true,
    inspectorWidth: 320,
    sidebarWidth: 240,
    sidebarCollapsed: false,
  }
  const afterCollapse = commitShellLayoutSnap(snap, { sidebarCollapsed: true })
  assert.equal(afterCollapse.sidebarCollapsed, true)
  assert.equal(afterCollapse.sidebarWidth, 240)
  assert.equal(snap.sidebarCollapsed, false)
  const afterWidth = commitShellLayoutSnap(afterCollapse, { inspectorWidth: 400 })
  assert.equal(afterWidth.inspectorWidth, 400)
  assert.equal(afterWidth.sidebarCollapsed, true)
})

test('applyShellColumnCssVars writes grid tracks without React state', () => {
  const el = document.createElement('div')
  applyShellColumnCssVars(el, { left: 240, inspector: 320, center: 720 })
  assert.equal(el.style.getPropertyValue('--sidebar-col'), '240px')
  assert.equal(el.style.getPropertyValue('--inspector-width'), '320px')
  assert.equal(el.style.getPropertyValue('--center-col'), '720px')
})

test('shell column drag starts from CSS tracks, not a fractional bounding box', () => {
  const shell = document.createElement('div')
  shell.setAttribute('data-testid', 'app-shell')
  applyShellColumnCssVars(shell, { left: 240, inspector: 320 })
  const handle = document.createElement('div')
  handle.className = 'sidebar-resize'
  shell.appendChild(handle)
  document.body.appendChild(shell)
  handle.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 239.4,
    bottom: 800,
    width: 239.4,
    height: 800,
    toJSON() {
      return {}
    },
  })
  assert.equal(shellColumnStartWidth(handle, 'left', 160), 240)
  assert.equal(shellColumnStartWidth(handle, 'inspector', 240), 320)
  assert.deepEqual(shellLayoutFromElement(shell), { left: 240, inspector: 320 })
  shell.remove()
})

test('publishShellLayout reports painted column widths', () => {
  const seen: Array<{ left: number; inspector: number }> = []
  const onLayout = (event: Event) => {
    const cols = shellLayoutFromEvent(event)
    if (cols) seen.push(cols)
  }
  window.addEventListener('biu:shell-layout', onLayout)
  publishShellLayout({ left: 0, inspector: 320 })
  window.removeEventListener('biu:shell-layout', onLayout)
  assert.deepEqual(seen, [{ left: 0, inspector: 320 }])
})

test('Notion-style progressive compression sheds sidebar first, then switches inspector to overlay without horizontal overflow', () => {
  assert.equal(CENTER_MIN, 360)
  assert.equal(INSPECTOR_MIN, 360)
  assert.equal(INSPECTOR_DEFAULT, 480)
  assert.equal(SIDEBAR_AUTO_HIDE_BELOW, 768)

  // 1. 宽屏三栏并排：保留用户偏好的左栏与右栏宽度
  const wide = allocateShellColumns({
    viewportWidth: 1600,
    leftPane: true,
    leftWidth: 240,
    inspectorOpen: true,
    inspectorWidth: 480,
  })
  assert.equal(wide.left, 240)
  assert.equal(wide.inspector, 480)
  assert.equal(wide.center, 880)
  assert.equal(wide.leftMode, 'docked')
  assert.equal(wide.inspectorMode, 'split')
  assert.equal(wide.leftAutoCollapsed, false)
  assert.equal(wide.leftCanDock, true)

  // 2. 压缩中：先让中栏收窄到 CENTER_MIN，再温和压窄右栏到 INSPECTOR_MIN
  const squeezeInspector = allocateShellColumns({
    viewportWidth: 1000,
    leftPane: true,
    leftWidth: 240,
    inspectorOpen: true,
    inspectorWidth: 480,
  })
  assert.equal(squeezeInspector.left, 240)
  assert.equal(squeezeInspector.center, CENTER_MIN)
  assert.equal(squeezeInspector.inspector, 400)
  assert.equal(squeezeInspector.inspectorMode, 'split')

  // 3. 继续压缩到 900px：左栏先在 [SIDEBAR_MIN, desiredLeft] 内温和收窄，避免拖拽时突跳
  const narrowLeft = allocateShellColumns({
    viewportWidth: 900,
    leftPane: true,
    leftWidth: 240,
    inspectorOpen: true,
    inspectorWidth: 480,
  })
  assert.equal(narrowLeft.left, 180)
  assert.equal(narrowLeft.center, CENTER_MIN)
  assert.equal(narrowLeft.inspector, INSPECTOR_MIN)
  assert.equal(narrowLeft.leftMode, 'docked')
  assert.equal(narrowLeft.inspectorMode, 'split')

  // 4. 中屏（768~879px）：优先自动把左栏临时收到 48px 图标轨，保住中 + 右双栏
  const autoRail = allocateShellColumns({
    viewportWidth: 840,
    leftPane: true,
    leftWidth: 240,
    inspectorOpen: true,
    inspectorWidth: 480,
  })
  assert.equal(autoRail.left, SIDEBAR_RAIL)
  assert.equal(autoRail.leftMode, 'rail')
  assert.equal(autoRail.leftAutoCollapsed, true)
  assert.equal(autoRail.leftCanDock, false)
  assert.equal(autoRail.inspectorMode, 'split')
  assert.equal(autoRail.center, CENTER_MIN)
  assert.equal(autoRail.inspector, 840 - SIDEBAR_RAIL - CENTER_MIN)

  // 5. 窄屏（720~767px）：左栏自动隐藏为 0px（顶栏展开 + 抽屉），中 + 右继续无滚动分屏
  const autoHideLeft = allocateShellColumns({
    viewportWidth: 740,
    leftPane: true,
    leftWidth: 240,
    inspectorOpen: true,
    inspectorWidth: 480,
  })
  assert.equal(autoHideLeft.left, 0)
  assert.equal(autoHideLeft.leftMode, 'hidden')
  assert.equal(autoHideLeft.leftAutoCollapsed, true)
  assert.equal(autoHideLeft.inspectorMode, 'split')
  assert.equal(autoHideLeft.center, CENTER_MIN)
  assert.equal(autoHideLeft.inspector, 740 - CENTER_MIN)

  // 6. < 720px：右栏平滑降级为 Notion 右侧 Overlay 浮层，中栏占满 100% 宽度
  const overlayPeek = allocateShellColumns({
    viewportWidth: 640,
    leftPane: true,
    leftWidth: 240,
    inspectorOpen: true,
    inspectorWidth: 480,
  })
  assert.equal(overlayPeek.left, 0)
  assert.equal(overlayPeek.center, 640)
  assert.equal(overlayPeek.inspectorMode, 'overlay')
  assert.equal(overlayPeek.inspector, Math.min(480, 640 - INSPECTOR_OVERLAY_PEEK_GUTTER))

  // 7. 极窄屏（< 520px）：右栏 Overlay 全宽覆盖
  const fullOverlay = allocateShellColumns({
    viewportWidth: INSPECTOR_OVERLAY_FULL_BELOW - 20,
    leftPane: true,
    leftWidth: 240,
    inspectorOpen: true,
    inspectorWidth: 480,
  })
  assert.equal(fullOverlay.left, 0)
  assert.equal(fullOverlay.center, 500)
  assert.equal(fullOverlay.inspectorMode, 'overlay')
  assert.equal(fullOverlay.inspector, 500)
})

test('compressing then restoring viewport is completely reversible without ratcheting center', () => {
  const before = allocateShellColumns({
    viewportWidth: 1600,
    leftPane: true,
    leftWidth: 240,
    inspectorOpen: true,
    inspectorWidth: 480,
  })
  const compressed = allocateShellColumns({
    viewportWidth: 600,
    leftPane: true,
    leftWidth: 240,
    inspectorOpen: true,
    inspectorWidth: 480,
    holdCenter: before.center,
  })
  assert.equal(compressed.inspectorMode, 'overlay')
  const restored = allocateShellColumns({
    viewportWidth: 1600,
    leftPane: true,
    leftWidth: 240,
    inspectorOpen: true,
    inspectorWidth: 480,
    holdCenter: compressed.center,
  })
  assert.deepEqual(restored, before)
})

test('closed inspector still auto-hides left sidebar below 768px and restores when widened', () => {
  const desktop = allocateShellColumns({
    viewportWidth: 900,
    leftPane: true,
    leftWidth: 240,
    inspectorOpen: false,
    inspectorWidth: 480,
  })
  assert.equal(desktop.left, 240)
  assert.equal(desktop.center, 660)
  assert.equal(desktop.leftMode, 'docked')
  assert.equal(desktop.leftCanDock, true)

  const narrow = allocateShellColumns({
    viewportWidth: 640,
    leftPane: true,
    leftWidth: 240,
    inspectorOpen: false,
    inspectorWidth: 480,
  })
  assert.equal(narrow.left, 0)
  assert.equal(narrow.center, 640)
  assert.equal(narrow.leftMode, 'hidden')
  assert.equal(narrow.leftAutoCollapsed, true)
  assert.equal(narrow.leftCanDock, false)
})

test('shell columns never overflow viewport horizontally across all widths', () => {
  for (const viewportWidth of [200, 320, 480, 640, 720, 767, 768, 840, 960, 1200, 1600]) {
    for (const inspectorWidth of [0, 80, 360, 480, 1000]) {
      for (const inspectorOpen of [false, true]) {
        const cols = allocateShellColumns({
          viewportWidth,
          leftPane: true,
          leftWidth: 240,
          inspectorOpen,
          inspectorWidth,
        })
        if (cols.inspectorMode === 'split') {
          assert.equal(cols.left + cols.center + cols.inspector, viewportWidth)
          assert.ok(cols.center >= CENTER_MIN)
          assert.ok(cols.inspector >= INSPECTOR_MIN)
        } else if (cols.inspectorMode === 'overlay') {
          assert.equal(cols.left, 0)
          assert.equal(cols.center, viewportWidth)
          assert.ok(cols.inspector <= viewportWidth)
        } else {
          assert.equal(cols.left + cols.center, viewportWidth)
          assert.equal(cols.inspector, 0)
        }
      }
    }
  }
})

test('expanding chat clamps inspector so the column is at least ENTER', () => {
  const next = inspectorWidthForExpandedChat({
    viewportWidth: 1440,
    inspectorWidth: 900,
    sidebarCollapsed: false,
  })
  assert.equal(next, 1440 - SIDEBAR_MAX - CHAT_OVERLAY_ENTER)
  assert.ok(
    chatColumnWidth({
      viewportWidth: 1440,
      inspectorOpen: true,
      inspectorWidth: next,
      sidebarCollapsed: false,
    }) >= CHAT_OVERLAY_ENTER,
  )
})

test('overlay starts closed', () => {
  setChatOverlay(false)
  assert.equal(getChatOverlay(), false)
  setChatOverlay(true)
  assert.equal(getChatOverlay(), true)
  setChatOverlay(false)
})

test('chat page paths skip the overlay', () => {
  assert.equal(isChatPagePath('/'), true)
  assert.equal(isChatPagePath('/agents/abc'), true)
  assert.equal(isChatPagePath('/agents/abc/debug'), true)
  assert.equal(isChatPagePath('/channels/ch-1'), true)
  assert.equal(isChatPagePath('/s/abc'), false)
  assert.equal(isChatPagePath('/database'), false)
  assert.equal(isChatPagePath('/tasks'), false)
})

test('pick-attached only opens; closing stays closed even if chips remain', () => {
  setChatOverlay(false)
  history.replaceState(null, '', '/database')
  window.dispatchEvent(new Event('biu:pick-attached'))
  assert.equal(getChatOverlay(), true)
  closeChatOverlay()
  assert.equal(getChatOverlay(), false)
})

test('pick-attached on the chat page focuses composer instead of overlay', async () => {
  setChatOverlay(false)
  history.replaceState(null, '', '/agents/session-1')
  let focused = 0
  const onFocus = () => {
    focused += 1
  }
  window.addEventListener('biu:composer-focus', onFocus)
  window.dispatchEvent(new Event('biu:pick-attached'))
  assert.equal(focused, 0)
  assert.equal(isComposerFocusPending(), true)
  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
  window.removeEventListener('biu:composer-focus', onFocus)
  assert.equal(getChatOverlay(), false)
  assert.ok(focused > 0)
})

test('requestComposerFocus does not dispatch in the same tick', () => {
  consumeComposerFocusPending()
  let focused = 0
  const onFocus = () => {
    focused += 1
  }
  window.addEventListener('biu:composer-focus', onFocus)
  requestComposerFocus()
  window.removeEventListener('biu:composer-focus', onFocus)
  assert.equal(focused, 0)
  assert.equal(isComposerFocusPending(), true)
  consumeComposerFocusPending()
})

test('focusComposerEditor ignores a null or destroyed editor', () => {
  consumeComposerFocusPending()
  requestComposerFocus()
  assert.equal(focusComposerEditor(null), false)
  assert.equal(isComposerFocusPending(), true)
  assert.equal(focusComposerEditor({ isDestroyed: true, commands: { focus() {} } }), false)
  const exploded = {
    isDestroyed: false,
    get commands() {
      return (null as unknown as { commands: { focus: () => void } }).commands
    },
  }
  assert.equal(focusComposerEditor(exploded), false)
  assert.equal(isComposerFocusPending(), true)
  let focused = 0
  assert.equal(
    focusComposerEditor({
      isDestroyed: false,
      commands: {
        focus() {
          focused += 1
        },
      },
    }),
    true,
  )
  assert.equal(focused, 1)
  assert.equal(isComposerFocusPending(), false)
})

test('openOverlayComposer on a database page requests composer focus', () => {
  consumeComposerFocusPending()
  setChatOverlay(false)
  history.replaceState(null, '', '/database/pages/p1')
  openOverlayComposer({ revealThread: true })
  assert.equal(getChatOverlay(), true)
  assert.equal(getOverlayThread(), true)
  assert.equal(isComposerFocusPending(), true)
  consumeComposerFocusPending()
  setChatOverlay(false)
})

test('openOverlayComposer on the chat page does not open a window', () => {
  setChatOverlay(false)
  history.replaceState(null, '', '/agents/session-1')
  openOverlayComposer({ revealThread: true })
  assert.equal(getChatOverlay(), false)
})

test('pick opens a compose-only overlay; only the expand control reveals the thread', () => {
  setOverlayThread(false)
  setChatOverlay(false)
  history.replaceState(null, '', '/database')
  openOverlayComposer()
  assert.equal(getChatOverlay(), true)
  assert.equal(getOverlayThread(), false)
  assert.equal(getOverlayAutohide(), false)
  toggleOverlayThread()
  assert.equal(getOverlayThread(), true)
  setChatOverlay(false)
  assert.equal(getOverlayThread(), true)
})

test('reopening the overlay restores the last thread expand state', () => {
  setOverlayThread(true)
  setChatOverlay(true)
  setChatOverlay(false)
  history.replaceState(null, '', '/database')
  openOverlayComposer()
  assert.equal(getChatOverlay(), true)
  assert.equal(getOverlayThread(), true)
  setOverlayThread(false)
  setChatOverlay(false)
  openOverlayComposer()
  assert.equal(getOverlayThread(), false)
  setChatOverlay(false)
})

test('toggleOverlayThread expands and collapses the overlay transcript', () => {
  setChatOverlay(true)
  setOverlayThread(false)
  toggleOverlayThread()
  assert.equal(getOverlayThread(), true)
  toggleOverlayThread()
  assert.equal(getOverlayThread(), false)
  setChatOverlay(false)
})

test('collapsed overlay closes on outside click; expanded overlay stays', () => {
  setChatOverlay(true)
  setOverlayThread(false)
  window.dispatchEvent(new CustomEvent('biu:pick-mode', { detail: { picking: false } }))
  const panel = document.createElement('div')
  panel.setAttribute('data-testid', 'chat-overlay-panel')
  const flyout = document.createElement('div')
  flyout.className = 'composer-model-flyout'
  const chip = document.createElement('div')
  chip.setAttribute('data-testid', 'pick-chip-data')
  document.body.append(panel, flyout, chip)
  assert.equal(shouldCloseOverlayOnOutside(panel), false)
  assert.equal(shouldCloseOverlayOnOutside(flyout), false)
  assert.equal(shouldCloseOverlayOnOutside(chip), false)
  assert.equal(shouldCloseOverlayOnOutside(document.body), true)
  setOverlayThread(true)
  assert.equal(shouldCloseOverlayOnOutside(document.body), false)
  panel.remove()
  flyout.remove()
  chip.remove()
  setChatOverlay(false)
})

test('pick mode opens the overlay and blocks outside dismiss', () => {
  setOverlayThread(false)
  setChatOverlay(false)
  history.replaceState(null, '', '/database')
  window.dispatchEvent(new CustomEvent('biu:pick-mode', { detail: { picking: true } }))
  assert.equal(getChatOverlay(), true)
  assert.equal(getOverlayThread(), false)
  assert.equal(shouldCloseOverlayOnOutside(document.body), false)
  window.dispatchEvent(new CustomEvent('biu:pick-mode', { detail: { picking: false } }))
  assert.equal(shouldCloseOverlayOnOutside(document.body), true)
  setChatOverlay(false)
})

test('pick on an already-open overlay keeps the revealed thread', () => {
  setChatOverlay(false)
  history.replaceState(null, '', '/database')
  openOverlayComposer()
  revealOverlayThread()
  assert.equal(getOverlayThread(), true)
  openOverlayComposer()
  assert.equal(getOverlayThread(), true)
  setChatOverlay(false)
})

test('closeChatOverlay is a no-op when already closed', () => {
  setChatOverlay(false)
  let closed = 0
  const onClosed = () => {
    closed += 1
  }
  window.addEventListener('biu:overlay-closed', onClosed)
  closeChatOverlay()
  window.removeEventListener('biu:overlay-closed', onClosed)
  assert.equal(getChatOverlay(), false)
  assert.equal(closed, 0)
})

test('closing the overlay notifies pick to exit', () => {
  setChatOverlay(true)
  let closed = 0
  const onClosed = () => {
    closed += 1
  }
  window.addEventListener('biu:overlay-closed', onClosed)
  setChatOverlay(false)
  window.removeEventListener('biu:overlay-closed', onClosed)
  assert.equal(closed, 1)
})

test('autohide resets when overlay closes', () => {
  setChatOverlay(true)
  setOverlayAutohide(true)
  assert.equal(getOverlayAutohide(), true)
  setChatOverlay(false)
  assert.equal(getOverlayAutohide(), false)
})

test('overlay window geom clamps and docks to the right, bottom-aligned by default', () => {
  const def = defaultOverlayWinGeom(1280, 800)
  assert.equal(OVERLAY_WIN_MIN_W, 420)
  assert.ok(def.w >= OVERLAY_WIN_MIN_W)
  assert.ok(def.h >= OVERLAY_WIN_MIN_H)
  assert.equal(def.x, 1280 - def.w - 12)
  assert.equal(def.y, 800 - def.h - 12)
  assert.ok(def.y + def.h <= 800)
  const tiny = clampOverlayWinGeom({ x: -400, y: -20, w: 10, h: 10 }, 1280, 800)
  assert.equal(tiny.w, OVERLAY_WIN_MIN_W)
  assert.equal(tiny.h, OVERLAY_WIN_MIN_H)
  const short = clampOverlayWinGeom({ x: 12, y: 12, w: 420, h: 520 }, 1280, 400)
  assert.ok(short.h <= 400 - 24)
  assert.ok(short.h >= OVERLAY_CHAT_HEIGHT_MIN)
  const narrow = overlayLayoutGeom('right', { x: 0, y: 12, w: 420, h: 400 }, 380, 700)
  assert.equal(narrow.w, 380 - 24)
  assert.equal(narrow.x, 12)
})

test('layout always pins the overlay to the right of the viewport', () => {
  const prev = { x: 100, y: 80, w: 420, h: 400 }
  const bottom = overlayLayoutGeom('bottom', prev, 1280, 800)
  assert.equal(bottom.x, 1280 - 420 - 12)
  assert.equal(bottom.w, 420)
  assert.equal(bottom.y, 80)
  const wide = overlayLayoutGeom('bottom', { ...prev, w: 640 }, 1600, 900)
  assert.equal(wide.x, 1600 - 640 - 12)
  assert.equal(wide.w, 640)
  const right = overlayLayoutGeom('right', prev, 1280, 800)
  assert.equal(right.x, 1280 - 420 - 12)
  assert.equal(right.h, 400)
  assert.equal(right.y, 80)
  const tall = overlayLayoutGeom('right', { ...prev, h: 560 }, 1280, 900)
  assert.equal(tall.h, 560)
  assert.equal(tall.y, 80)
})

test('saved layout recomputes when the viewport changes', () => {
  writeOverlayWinState({ x: 12, y: 12, w: 420, h: 400, layout: 'right' })
  const original = { innerWidth: window.innerWidth, innerHeight: window.innerHeight }
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
  const state = readOverlayWinState()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: original.innerWidth })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: original.innerHeight })
  assert.equal(state.layout, 'right')
  assert.equal(state.x, 1600 - state.w - 12)
  assert.equal(state.h, 400)
  assert.equal(state.y, 12)
  writeOverlayWinState({ x: 0, y: 0, w: 500, h: 360, layout: 'bottom' })
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1400 })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 820 })
  const bottom = readOverlayWinState()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: original.innerWidth })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: original.innerHeight })
  assert.equal(bottom.layout, 'right')
  assert.equal(bottom.w, 500)
  assert.equal(bottom.x, 1400 - 500 - 12)
  assert.equal(parseOverlayLayout('nope'), 'right')
  assert.equal(parseOverlayLayout('free'), 'right')
  assert.equal(parseOverlayLayout('left'), 'right')
  assert.equal(parseOverlayLayout('bottom'), 'right')
})

test('inspector tab event accepts string or { tabId }', () => {
  assert.equal(inspectorTabFromEvent(new CustomEvent('biu:inspector-tab', { detail: 'database' })), 'database')
  assert.equal(inspectorTabFromEvent(new CustomEvent('biu:inspector-tab', { detail: { tabId: 'traj' } })), 'traj')
  assert.equal(inspectorTabFromEvent(new Event('biu:inspector-tab')), undefined)
})