# Sandbox（page-html-blocks）

在页面里用 `/` 插入 **Sandbox**，把卡片、刊头、小应用直接放进文档内沙箱。改页面或代写块之前，先照下面「示例写法」写 `:::pageBlock` 围栏。

## 设计要点

- 顶栏一直在：左边 Sandbox，中间「预览 / 代码」，右边刷新和放大。
- 预览在 Shadow 沙箱里跑脚本，继承全局 `--biu-*` 与宿主样式表。
- 新块把源码写在块 data 里（HTML 片段 + 可选 script），不要生成完整 HTML 文件。
- **演示开关**：`deck` 写在围栏头上。默认 true。
- **放大**：浏览器真实全屏。← → / 空格翻页，Esc 退出。

## 示例写法

围栏头写 `kind` / `plugin` / 可选 `deck`、`width`、`height`。

:::pageBlock {kind=html plugin=page-html-blocks deck=true}
{"html":"<div>刊头</div>"}
:::

旧的 `kind=htmlframe` 仍能打开，不再单独进斜杠。

:::pageBlock {kind=htmlframe plugin=page-html-blocks deck=true height=300}
{"html":"<div>刊头</div>"}
:::

写入页面用 `db_content` 对应 page 的 markdown，按上面围栏粘贴。

## 编译校验

```
POST /api/page-html-blocks/compile
{ "source": "<div>…</div><script>…</script>" }
```

或工具 `html_block_compile`。通过返回 `{ ok:true, mode:"markup"|"script"|"jsx" }`；语法错误、外链 script、`import`/`require` 会失败。

## 怎么用

1. 编辑某个页面，输入 `/`，选「Sandbox」。
2. 顶栏切「代码」改源码，切「预览」看沙箱渲染。
3. 右边刷新会重挂预览；放大进入放映。
