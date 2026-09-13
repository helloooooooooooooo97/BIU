# 终端（page-terminal）

页面里 `/terminal` 插入一张 **真终端卡片**：xterm 连宿主 **PTY**，登录你本机 `$SHELL`（`-il`），和系统终端同一套环境：`cd`、别名、`node`、vim 都不做包装。

一张卡片可以 **+ 开多个 Tab**，每个 Tab 是独立的 PTY。右上角放大；Esc 退出放大。聊天通道 `/ws` 不受影响（终端走 `/ws/page-terminal`，HTTP upgrade 按路径分发）。

改完沙箱后 `db_action /plugins/page-terminal action=pack`。

## 示例写法

```md
:::pageBlock {kind=terminal plugin=page-terminal}
{
  "height": 340
}
:::
```
