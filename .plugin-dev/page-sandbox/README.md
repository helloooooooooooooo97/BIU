# Sandbox

斜杠插入 **Sandbox**。块里写 React 组件，在文档内沙箱预览。改页面或代写块之前，先照「示例写法」写围栏。

## 约定

- 围栏：`kind=sandbox`，`plugin=page-sandbox`。
- 围栏体**只写两个附件指针**，不要写 React 源码，不要写运行时数据：
  - `file`：源码，`assets/sandbox-….jsx`
  - `dataFile`：组件要记住的数据，`assets/sandbox-data-….json`
- 源码用 `db_doc`（或 `PUT /api/page/file/<名>`）写到 `file`。可以覆盖。**不要用 `db_asset`**（内容寻址，不能改）。
- 运行时数据不要写进 `.jsx`，也不要写进围栏。组件里调用 `biu.write(value)`，宿主把它存进 `dataFile`。`biu.read()` 读回上次写入的 JSON；还没有文件时是 `null`。
- 优先 `export default function App()`。不要 `import react` / `import` / `require`，用宿主注入的 `React` 和 `biu`。
- 颜色、字号、描边走 `--biu-*`，不要写死色值。
- 顶栏：左边点名称可改；中间预览 / 代码；右边分栏（左预览、右代码）、放大。放大后顶栏还在，Esc 或再点缩小退出。
- 旧围栏把源码写在体内时，打开块会迁到 `file` 附件，围栏里的源码随后去掉。

## 示例写法

:::pageBlock {kind=sandbox plugin=page-sandbox height=280}
{
  "file": "assets/sandbox-demo.jsx",
  "dataFile": "assets/sandbox-data-demo.json"
}
:::

`.jsx` 附件里的源码：

```jsx
export default function App() {
  const [n, setN] = React.useState(0)
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    let gone = false
    biu.read().then((saved) => {
      if (gone) return
      const v = saved && typeof saved === 'object' ? saved.n : 0
      setN(typeof v === 'number' && isFinite(v) ? v : 0)
      setReady(true)
    }).catch(() => setReady(true))
    return () => { gone = true }
  }, [])

  const bump = () => {
    setN((prev) => {
      const next = prev + 1
      void biu.write({ n: next })
      return next
    })
  }

  return (
    <button type="button" onClick={bump}>
      {!ready ? '…' : n === 0 ? '试一下 →' : `已点 ${n} 次 →`}
    </button>
  )
}
```

写入页面用 `db_content` 对应 page 的 markdown，围栏按上面只贴 `file` / `dataFile`。源码单独 `db_doc` 写到 `file`。用户操作产生的数据由 `biu.write` 写入 `dataFile`，agent 不要把这些数据改写进源码。

## 编译校验

```
POST /api/page-sandbox/compile
{ "source": "export default function App() { return <div /> }" }
```

或工具 `sandbox_compile`。只校验，不落盘。通过返回 `{ ok:true, mode:"jsx" }`；语法错误、`import`/`require` 会失败。

## 怎么用

1. 编辑某个页面，输入 `/`，选「Sandbox」。
2. 左边点名称改标题，中间切「代码」改源码，切「预览」看沙箱。
3. 放大左边的分栏：左边预览，右边代码。再点一次回到预览。
4. 最右边放大铺满窗口，顶栏不收。
