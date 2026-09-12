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
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** dev：vite 起的地址；打包：本地 dist 文件。 */
const DEV_URL = process.env.BIU_DEV_URL || 'http://127.0.0.1:5173'
const isDev = !app.isPackaged

/** 侧栏浏览器那块的原生视图。同一时间只开一个。 */
let view: BrowserView | null = null
let win: BrowserWindow | null = null

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
  if (!win) return
  view = new BrowserView({
    webPreferences: {
      // 这是给「用户自己上网」用的视图，不是我们的代码，别给它任何宿主能力
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  })
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

  // 自动建视图：前端一放面板就会先报 bounds，这里兜底
  if (!view) createView()
  if (!view) return
  const wc = view.webContents

  if (cmd.type === 'navigate') {
    const url = cmd.url.trim()
    if (!url) {
      wc.loadURL('about:blank')
      return
    }
    const fixed = /^https?:\/\//i.test(url) ? url : `https://${url}`
    try {
      await wc.loadURL(fixed)
    } catch (error) {
      send('biu:browser:error', { code: 0, desc: String((error as Error).message || error), url: fixed })
    }
    return
  }
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
    // 放大时的兜底：拿一个点上的元素信息
    try {
      const info = await wc.executeJavaScript(
        `(() => {
          const el = document.elementFromPoint(${Math.round(cmd.x)}, ${Math.round(cmd.y)})
          if (!el) return null
          return {
            tag: el.tagName.toLowerCase(),
            id: el.id || '',
            className: typeof el.className === 'string' ? el.className : '',
            text: (el.innerText || el.textContent || '').trim().slice(0, 400),
            html: el.outerHTML.slice(0, 2000),
          }
        })()`,
        true,
      )
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
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
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

  if (isDev) {
    await win.loadURL(DEV_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    await win.loadFile(join(__dirname, '..', 'dist', 'index.html'))
  }
}

// 开发期开个 CDP 端口，方便自动化和排查（打包不加）
if (isDev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
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
