# 终端（page-terminal）

页面里 `/terminal` 插入一张 **真终端卡片**。PTY 和 WebSocket 都在本插件的 `host.ts`（pack 进 `.plugin/page-terminal`），**不改** `packages/host-terminal`。前端 xterm 连 `/ws/page-terminal`，登录本机 `$SHELL -il`。一张卡片可开多个 Tab。

聊天仍走 `/ws`。改完沙箱后 `db_action /plugins/page-terminal action=pack`。

## 示例写法

```md
:::pageBlock {kind=terminal plugin=page-terminal}
{
  "height": 340
}
:::
```
