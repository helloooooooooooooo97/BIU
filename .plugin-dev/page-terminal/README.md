# 终端（page-terminal）

页面里 `/terminal` 插入终端卡片：自己画的界面（借鉴 Notion / 苹果的留白和字重，没有红绿灯、不用 xterm）。点进正文打字，按键进本机 `$SHELL` PTY，输出可滚动。

改完沙箱后 `db_action /plugins/page-terminal action=pack`。

## 示例写法

```md
:::pageBlock {kind=terminal plugin=page-terminal}
{
  "height": 360
}
:::
```
