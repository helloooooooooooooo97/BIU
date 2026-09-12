# 侧栏浏览器（browser-panel）

右侧检查器里的**真浏览器面板**：在侧栏打开一个真 Chromium 视图，输入任意链接就能访问（不受 `X-Frame-Options` / CSP 限制），并能把页面里的元素变成 `<pick>` 引用发给 agent。

## 需要 Electron 外壳

这个面板本身只是一块**空位**，真正的网页由 Electron 的**原生 `BrowserView`** 渲染，浮在空位之上。所以：

- 用 `npm run electron:dev` 启动 → 面板里是真浏览器，任意站都能开
- 用 `npm run dev`（网页版）→ 面板显示提示，不报错

## 怎么打开

1. 打开一个会话，点右上角打开检查器
2. 点检查器标签栏的 `+`
3. 选「浏览器」

（检查器栏跟会话走：`requiresSession` + `centerKinds: ['session']`。`common: true` 会被会话检查器丢掉，加号里不会出现。）

## 功能

- **地址栏**：输入 `github.com` 或 `https://…` 回车即可访问
- **← → ⟳**：后退 / 前进 / 刷新（加载中变「停止」）
- **点选元素**：点工具条那个取景框图标，再点页面里任意元素 → 变成一个 `<pick>` 引用进聊天输入框，agent 就能看到那个元素的标签 / class / 文本 / HTML
- **系统浏览器打开**：把当前页丢给系统浏览器
- 加载失败时会显示**真实原因**（`did-fail-load` 的 code + 描述），比 iframe 时代只能靠超时猜强

## 架构（为什么这样分层）

```
Electron 主进程 (electron/main.ts)
  ├─ BrowserWindow        装现有网页（不改一行现有代码）
  └─ BrowserView          侧栏那块真浏览器，位置由 IPC 报上来的矩形决定

网页里的插件 (web.tsx)
  └─ 只做三件事：量空位矩形报给外壳 / 切换可见性 / 画工具条 + 发点选坐标
```

这么分的意义：**将来换成别的宿主（或不用 Electron）时，只有外壳那层要换，插件这层（工具条、地址栏、引用 chip）原样复用。** 检查器顶栏只显示「浏览器」标签，地址栏画在面板里，不要把整块浏览器塞进 `Tab`。

## 关键文件

- `electron/main.ts` — 外壳：窗口 + `BrowserView` + IPC
- `electron/preload.cjs` — 只暴露一个很小的 `window.biuBrowser` 桥
- `web.tsx` — 面板：量矩形、报可见性、工具条、点选引用

## 坑

- `BrowserView` 是**原生视图，浮在网页之上**，所以它不是"长在布局里"的：窗口/侧栏尺寸变化时靠前端每 500ms 报一次矩形兜底，另外有 `ResizeObserver`。
- 面板被切走时（别的 tab 激活）CSS 会把它设成 `visibility: hidden`，此时量出来的矩形是 0，会自动把 `BrowserView` 收成 0 尺寸藏起来。
- 插件**不能 import `@biu/*`**，所以 `pick` 服务是通过 `ctx.get('pick')` 取到再当 props 传进组件的。
