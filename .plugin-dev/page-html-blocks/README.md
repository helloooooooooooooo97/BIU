# HTML（page-html-blocks）

在页面里用 `/` 插入 **静态HTML** 或 **动态HTML**，把卡片、刊头、小应用直接放进文档。改页面或代写块之前，先照下面「示例写法」写 `:::pageBlock` 围栏。

## 设计要点：无外框，源码走附件

- 内容贴在文档里，插件**不套外框 / 标题栏 / 底色**。默认高度跟内容走。
- **源码全部存附件**（`{"file":"assets/….html"}`），不要把 HTML 写进围栏体：打开块时附件内容会覆盖围栏体，围栏里的 HTML 会丢。旧围栏体 HTML 仍能读一次，打开后会迁到附件。
- 右下角可拖动宽高，写进围栏头（如 `width=480 height=320`）。定了尺寸后溢出滚动。右上角「自适应」清掉宽高。
- 鼠标**悬停**在该块上时，右上角才**浮出**「预览 / 编辑 / 放大」小工具条（动态HTML 另带高度 H）。
- 点「编辑」→ 源码编辑框，底部显示编译结果；点「预览」→ 还原为内容本身。
- **演示开关**：`deck` 写在围栏头上。默认 true。
- **放大**：浏览器真实全屏。← → / 空格翻页，Esc 退出。

静态块和动态块都能读到页面全局样式（`--biu-*` 与已加载样式表）。

## 两种块

### 1. `/html` — 静态HTML

- 一段 HTML/CSS（可带图片）画在文档里，不执行脚本。
- 跟文档同一套全局样式。
- 适合卡片、表格、刊头。

### 2. `/htmlframe`（别名 `/slide`）— 动态HTML

- **不用 iframe**。文档内 Shadow 沙箱，光标可以点进去交互。
- 沙箱提供：全局 style（变量 + 样式表）、`React`、`document`（沙箱根）、`root`、`css`。
- 可写 HTML+`<script>`，或 React 函数 / JSX（`export default function App`）。
- 写完用 `html_block_compile` 或 `POST /api/page-html-blocks/compile` 验证。

## 示例写法

静态 HTML：围栏头写 `kind` / `plugin` / 可选 `deck`、`width`、`height`；**体只写附件指针**。

:::pageBlock {kind=html plugin=page-html-blocks deck=true}
{"file":"assets/html-sample.html"}
:::

动态 HTML：`kind=htmlframe`，高度用围栏头 `height=`，源码同样只在附件里。

:::pageBlock {kind=htmlframe plugin=page-html-blocks deck=true height=300}
{"file":"assets/html-live.html"}
:::

写入页面用 `db_content` 对应 page 的 markdown，按上面围栏粘贴；**源码用 `db_doc`（或 `/api/page/file/<名>`）写附件**，不要用 `db_asset`（内容寻址、不可覆盖）。不要把 HTML 直接写进围栏，否则打开预览会被附件覆盖。

## 编译校验

```
POST /api/page-html-blocks/compile
{ "source": "<div>…</div><script>…</script>" }
```

或工具 `html_block_compile`。通过返回 `{ ok:true, mode:"markup"|"script"|"jsx" }`；语法错误、外链 script、`import`/`require` 会失败。

## 怎么用

1. 编辑某个页面，输入 `/`，选「静态HTML」或「动态HTML」。
2. 默认即预览效果；把鼠标移到块上浮出「编辑」，改 HTML。
3. 切「预览」看渲染；只读态直接展示。
