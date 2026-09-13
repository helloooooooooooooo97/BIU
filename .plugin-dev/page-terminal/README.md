# 终端（page-terminal）

页面里 `/terminal` 插入一张卡片：里面是 **xterm + 宿主 PTY**，登录你本机的 `$SHELL`（和系统终端一样：`cd`、`ll`、`node` 都不做转换）。右上角可全屏。Esc 退出全屏。

改完沙箱后 `db_action /plugins/page-terminal action=pack`。
