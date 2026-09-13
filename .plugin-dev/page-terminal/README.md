# 终端（page-terminal）

页面里 `/terminal` 插入终端卡片：外壳是细顶栏 + 会话 Tab。正文按 VS Code 同一套接法——官方 `xterm.css` + FitAddon 按容器像素 fit + WebGL 渲染（失败则回落到 canvas）。滚动交给 xterm 视口，不改它的 helper DOM。

改完沙箱后 `db_action /plugins/page-terminal action=pack`，然后重启 host。

## 示例写法

```md
:::pageBlock {kind=terminal plugin=page-terminal}
{
  "height": 360
}
:::
```
