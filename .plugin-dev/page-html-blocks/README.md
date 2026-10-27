# Sandbox（page-html-blocks）

斜杠插入 **Sandbox**。块里写 React 组件（或 HTML 片段），在文档内沙箱预览。改页面或代写块之前，先照「示例写法」写 `:::pageBlock`。

## 约定

- 优先 `export default function App()`。不要 `import react` / `import` / `require`，用宿主注入的 `React`。
- 颜色、字号、描边走 `--biu-*`，不要写死色值。
- 源码写在块 `html` 里，不要另存完整 HTML 文件。
- 顶栏：左边点名称可改；中间预览 / 代码；右边刷新、放大。
- 围栏 `deck` 默认 true。放大后 ← → / 空格翻页，Esc 退出。

## 示例写法

围栏头写 `kind` / `plugin` / 可选 `deck`、`width`、`height`。块数据用 `title` 和 `html`。

:::pageBlock {kind=html plugin=page-html-blocks deck=true}
{
  "title": "Sandbox",
  "html": "export default function App() {\n  return (\n    <div style={{ padding: 16, color: 'var(--biu-color-text)', background: 'var(--biu-color-bg)' }}>\n      Sandbox\n    </div>\n  )\n}\n"
}
:::

旧的 `kind=htmlframe` 仍能打开，不再单独进斜杠。

:::pageBlock {kind=htmlframe plugin=page-html-blocks deck=true height=300}
{
  "title": "Sandbox",
  "html": "export default function App() {\n  return <div>Sandbox</div>\n}\n"
}
:::

写入页面用 `db_content` 对应 page 的 markdown，按上面围栏粘贴。

## 编译校验

```
POST /api/page-html-blocks/compile
{ "source": "export default function App() { return <div /> }" }
```

或工具 `html_block_compile`。通过返回 `{ ok:true, mode:"markup"|"script"|"jsx" }`；语法错误、外链 script、`import`/`require` 会失败。

## 怎么用

1. 编辑某个页面，输入 `/`，选「Sandbox」。
2. 左边点名称改标题，中间切「代码」改源码，切「预览」看沙箱。
3. 右边刷新会重挂预览；放大进入放映。
