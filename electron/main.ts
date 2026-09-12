/**
 * Electron 外壳：把现有的 web 界面装进 BrowserWindow，并在右侧栏的位置叠一个
 * 原生 BrowserView（真 Chromium），用来当「侧栏浏览器」。
 *
 * 设计原则：不改动仓库里现有的任何代码。
 *  - 主窗口就是现在的网页（dev 走 vite，build 走 dist）
 *  - BrowserView 是原生视图，浮在窗口之上，位置由前端通过 IPC 报上来的矩形决定
 *  - 前端侧只需要一个普通页面块插件（按 .inspector-stage-pane 量尺寸即可）
 */

import { app, BrowserWindow, BrowserView, ipcMain, shell, session } from 'electron'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const electronRoot = join(__dirname, '..')

/** dev：vite 起的地址；打包 / 无 dev 标记：本地 dist 文件。 */
const DEV_URL = process.env.BIU_DEV_URL || 'http://127.0.0.1:5173'
const distIndex = join(electronRoot, '..', 'dist', 'index.html')
const isDev = process.env.BIU_ELECTRON_DEV === '1' || (!app.isPackaged && !existsSync(distIndex) && process.env.BIU_ELECTRON_DEV !== '0')

/** 侧栏浏览器那块的原生视图。同一时间只开一个。 */
let view: BrowserView | null = null
let win: BrowserWindow | null = null
let browserPanelReady = false

/** 前端报上来的矩形（CSS 像素，相对窗口内容区）。 */
let rect: { x: number; y: number; width: number; height: number } | null = null
/** 面板没有指针交互需求时（比如被别的 tab 盖住）藏起来。 */
let visible = true

function clampRect(r: { x: number; y: number; width: number; height: number }) {
  if (!win) return r
  const [w, h] = win.getContentSize()
  const x = Math.max(0, Math.round(r.x))
  const y = Math.max(0, Math.round(r.y))
  return {
    x,
    y,
    width: Math.max(1, Math.min(Math.round(r.width), w - x)),
    height: Math.max(1, Math.min(Math.round(r.height), h - y)),
  }
}

function applyBounds() {
  if (!view || !win) return
  if (!rect || !visible) {
    // 尺寸为 0 即不可见；比 removeBrowserView 更省事，也不会丢页面状态
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    return
  }
  view.setBounds(clampRect(rect))
}

function createView() {
  if (!win || view) return
  view = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  })
  view.setBackgroundColor('#191919')
  win.addBrowserView(view)
  view.webContents.setWindowOpenHandler(({ url }) => {
    // 外链交给系统浏览器，别在这个视图里越走越远
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  attachEvents(view.webContents)
  applyBounds()
}

function destroyView() {
  if (view && win) {
    win.removeBrowserView(view)
    // @ts-expect-error 旧版类型没有 destroy
    view.webContents?.destroy?.()
  }
  view = null
}

/* ---------------- IPC：前端 → 外壳 ---------------- */

type Cmd =
  | { type: 'navigate'; url: string }
  | { type: 'back' }
  | { type: 'forward' }
  | { type: 'reload' }
  | { type: 'stop' }
  | { type: 'bounds'; rect: { x: number; y: number; width: number; height: number } }
  | { type: 'visible'; visible: boolean }
  | { type: 'openExternal'; url: string }
  | { type: 'inspect'; x: number; y: number }
  | { type: 'close' }

const SNAP_EL = `{
  tag: el.tagName.toLowerCase(),
  id: el.id || '',
  className: typeof el.className === 'string' ? el.className : '',
  text: (el.innerText || el.textContent || '').trim().slice(0, 400),
  html: el.outerHTML.slice(0, 2000),
}`

/** BrowserView 盖住网页，点选必须在访客页里接 click，不能靠外壳 DOM。 */
function inspectScript(x: number, y: number) {
  if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0) {
    return `(() => {
      const el = document.elementFromPoint(${Math.round(x)}, ${Math.round(y)})
      if (!el) return null
      return ${SNAP_EL}
    })()`
  }
  return `(() => {
    if (window.__biuPickOff) window.__biuPickOff()
    return new Promise((resolve) => {
      const prev = document.documentElement.style.cursor
      document.documentElement.style.cursor = 'crosshair'
      const finish = (info) => {
        document.documentElement.style.cursor = prev
        window.removeEventListener('click', onClick, true)
        window.__biuPickOff = null
        resolve(info)
      }
      window.__biuPickOff = () => finish(null)
      function onClick(ev) {
        ev.preventDefault()
        ev.stopPropagation()
        const el = document.elementFromPoint(ev.clientX, ev.clientY)
        if (!el) { finish(null); return }
        finish(${SNAP_EL})
      }
      window.addEventListener('click', onClick, true)
    })
  })()`
}

function send(channel: string, payload: unknown) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

function attachEvents(wc: Electron.WebContents) {
  const emitState = async () => {
    send('biu:browser:state', {
      url: wc.getURL(),
      title: wc.getTitle(),
      canGoBack: wc.canGoBack(),
      canGoForward: wc.canGoForward(),
      loading: wc.isLoading(),
    })
  }
  wc.on('did-start-loading', () => void emitState())
  wc.on('did-stop-loading', () => void emitState())
  wc.on('did-navigate', () => void emitState())
  wc.on('did-navigate-in-page', () => void emitState())
  wc.on('page-title-updated', () => void emitState())
  // 站点拒嵌之类的问题：这里能拿到真实的失败原因，比 iframe 强
  wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame) return
    send('biu:browser:error', { code, desc, url })
  })
}

ipcMain.on('biu:browser:cmd', async (_event, cmd: Cmd) => {
  if (cmd.type === 'bounds') {
    rect = cmd.rect
    applyBounds()
    return
  }
  if (cmd.type === 'visible') {
    visible = cmd.visible
    applyBounds()
    return
  }
  if (cmd.type === 'openExternal') {
    if (/^https?:/i.test(cmd.url)) void shell.openExternal(cmd.url)
    return
  }
  if (cmd.type === 'close') {
    destroyView()
    return
  }

  if (cmd.type === 'navigate') {
    const url = cmd.url.trim()
    if (!url || /^about:/i.test(url)) {
      destroyView()
      return
    }
    const fixed = /^https?:\/\//i.test(url) ? url : `https://${url}`
    if (!view) createView()
    if (!view) return
    try {
      await view.webContents.loadURL(fixed)
    } catch (error) {
      send('biu:browser:error', { code: 0, desc: String((error as Error).message || error), url: fixed })
    }
    return
  }

  if (!view) return
  const wc = view.webContents
  if (cmd.type === 'back' && wc.canGoBack()) {
    wc.goBack()
    return
  }
  if (cmd.type === 'forward' && wc.canGoForward()) {
    wc.goForward()
    return
  }
  if (cmd.type === 'reload') {
    wc.reload()
    return
  }
  if (cmd.type === 'stop') {
    wc.stop()
    return
  }
  if (cmd.type === 'inspect') {
    try {
      const info = await wc.executeJavaScript(inspectScript(cmd.x, cmd.y), true)
      send('biu:browser:inspected', info)
    } catch (error) {
      send('biu:browser:error', { code: 0, desc: String((error as Error).message || error), url: '' })
    }
  }
})

/* ---------------- 窗口 ---------------- */

async function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#191919',
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 14 } }
      : {}),
    webPreferences: {
      preload: join(electronRoot, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.on('closed', () => {
    view = null
    win = null
  })

  // 窗口变化时重新贴合
  const relayout = () => applyBounds()
  win.on('resize', relayout)
  win.on('maximize', relayout)
  win.on('unmaximize', relayout)
  win.on('enter-full-screen', relayout)
  win.on('leave-full-screen', relayout)

  win.webContents.on('did-finish-load', () => {
    void win?.webContents.insertCSS(ELECTRON_CHROME_CSS)
    void win?.webContents.executeJavaScript(`document.documentElement.classList.add('biu-electron')`)
    void ensureBrowserPanel()
  })

  if (isDev) {
    await win.loadURL(DEV_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    await win.loadFile(join(electronRoot, '..', 'dist', 'index.html'))
  }
}

/** 给红绿灯让出左侧栏品牌行，避免叠在已有导航上。 */
const ELECTRON_CHROME_CSS = `
html.biu-electron .app-side-bar-head-brand {
  padding-left: 76px !important;
  -webkit-app-region: drag;
}
html.biu-electron .app-side-bar-head-brand button,
html.biu-electron .app-side-bar-head-brand a {
  -webkit-app-region: no-drag;
}
html.biu-electron .app-shell.is-sidebar-collapsed > main,
html.biu-electron .app-shell.is-left-hidden > main {
  padding-left: 76px;
}
`

async function ensureBrowserPanel() {
  if (browserPanelReady) return
  const host = process.env.BIU_HOST_URL || 'http://127.0.0.1:3141'
  for (let i = 0; i < 25; i += 1) {
    try {
      await fetch(`${host}/api/db/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: '/plugins/browser-panel', action: 'pack' }),
      })
      const start = await fetch(`${host}/api/db/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: '/plugins/browser-panel', action: 'start' }),
      })
      if (start.ok || start.status === 400) {
        browserPanelReady = true
        return
      }
    } catch {
      /* host 还没起来 */
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
}

// 开发期开个 CDP 端口，方便自动化和排查（打包不加）
if (isDev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}

// 容器 / 无用户命名空间的 Linux 上 Chromium 沙箱会直接起不来
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-gpu-sandbox')
}

app.whenReady().then(async () => {
  // 允许被嵌的话就允许；这里只是让一些站少弹无谓的告警
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(true))
  await createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow()
})
