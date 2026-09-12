# HTML（page-html-blocks）

在页面里用 `/` 插入 **静态HTML** 或 **动态HTML**，把卡片、刊头、小应用直接放进文档。改页面或代写块之前，先照下面「示例写法」写 `:::pageBlock` 围栏。

## 设计要点：无外框，编辑/预览悬浮

- 内容贴在文档里，插件**不套外框 / 标题栏 / 底色**。默认高度跟内容走。
- 右下角可拖动宽高，写进围栏（如 `width=480 height=320` 或 `width=100% height=100vh`）。定了尺寸后溢出滚动。右上角「自适应」清掉宽高。
- 鼠标**悬停**在该块上时，右上角才**浮出**「预览 / 编辑 / 放大」小工具条（动态HTML 另带高度 H）。
- 点「编辑」→ 变成源码编辑框；点「预览」→ 还原为内容本身。
- **演示开关**：`deck` 写在围栏头上。默认 true。工具条「演示」点一下即可移出/加入放映。围栏里面直接写 HTML，不要再包一层 JSON。
- **放大**：浏览器真实全屏，片子铺满视口。← → ↑ ↓ / 空格翻页，Esc 退出。底栏悬停才出现。

## 两种块

### 1. `/html` — 静态HTML

- 一段 HTML/CSS（可带图片）画在文档里。
- 简单、样式跟文档在一起；脚本不执行。
- 适合卡片、表格、刊头。

### 2. `/htmlframe`（别名 `/slide`）— 动态HTML

- 一段完整 HTML，作为独立页面嵌进文档，可以跑脚本。
- 样式与主文档隔离；无边框，内容自带背景更佳。
- 悬停工具条可调高度 H。
- 适合交互小应用 / 示例 / 幻灯片。

## 示例写法

静态 HTML：围栏头写 `kind` / `plugin` / 可选 `deck`、`width`、`height`；**围栏体就是 HTML**。

```md
:::pageBlock {kind=html plugin=page-html-blocks deck=true}
<div style="width:100%;height:100vh;display:flex;flex-direction:column;justify-content:center;box-sizing:border-box;padding:6% 10%;color:#f6f2ea;background:linear-gradient(150deg,#3b277c,#642665 55%,#cf5a55)">
  <div style="font-size:13px;letter-spacing:.4em;font-weight:700">02 · 导演</div>
  <div style="font-size:clamp(32px,6vw,72px);font-weight:900;margin-top:14px">达米恩·查泽雷</div>
</div>
:::
```

动态 HTML：`kind=htmlframe`，体里写完整文档（可含 script）。高度用围栏头 `height=`。

```md
:::pageBlock {kind=htmlframe plugin=page-html-blocks deck=true height=300}
<!DOCTYPE html>
<html>
  <body style="margin:0;background:#111;color:#eee;font:16px sans-serif;padding:24px">
    <p id="n">0</p>
    <button onclick="n.textContent=String(+n.textContent+1)">+1</button>
  </body>
</html>
:::
```

写入页面用 `db_content` 对应 page 的 markdown，按上面围栏粘贴或替换；不要改成 JSON 体（旧 JSON 仍能读，新写不要用）。

## 怎么用

1. 编辑某个页面，输入 `/`，选「静态HTML」或「动态HTML」。
2. 默认即预览效果；把鼠标移到块上浮出「编辑」，粘贴/修改 HTML。
3. 切「预览」看渲染；只读态直接展示。
