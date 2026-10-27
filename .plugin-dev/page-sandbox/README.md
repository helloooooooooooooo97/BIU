# Sandbox

斜杠插入 **Sandbox**。块里写 React 组件，在文档内沙箱预览。改页面或代写块之前，先照「示例写法」写围栏。

## 约定

- 围栏：`kind=sandbox`，`plugin=page-sandbox`。
- 优先 `export default function App()`。不要 `import react` / `import` / `require`，用宿主注入的 `React`。
- 颜色、字号、描边走 `--biu-*`，不要写死色值。
- 源码写在围栏体里，不要另存完整 HTML 文件。
- 顶栏：左边点名称可改；中间预览 / 代码；右边刷新、放大。
- `deck` 默认 true。放大后 ← → / 空格翻页，Esc 退出。

## 示例写法

:::pageBlock {kind=sandbox plugin=page-sandbox deck=true}
export default function App() {
  return (
    <div style={{ padding: 16, color: 'var(--biu-color-text)', background: 'var(--biu-color-bg)' }}>
      Sandbox
    </div>
  )
}
:::

写入页面用 `db_content` 对应 page 的 markdown，按上面围栏粘贴。

## 编译校验

```
POST /api/page-sandbox/compile
{ "source": "export default function App() { return <div /> }" }
```

或工具 `sandbox_compile`。通过返回 `{ ok:true, mode:"markup"|"script"|"jsx" }`；语法错误、外链 script、`import`/`require` 会失败。

## 怎么用

1. 编辑某个页面，输入 `/`，选「Sandbox」。
2. 左边点名称改标题，中间切「代码」改源码，切「预览」看沙箱。
3. 右边刷新会重挂预览；放大进入放映。
