# 终端（page-terminal）

在页面里用 `/` 插入一个 **终端卡片**：输入命令、看宿主回传的输出，右上角可以**全屏放大**（Esc 退出）。无头插件，不占运行窗口。

这是 **工作区真 shell**：回车后走 host `POST /api/page-terminal/run`，和 agent 的 `bash` 工具同一套 `ctx.shell`（工作区 `/bin/sh -c`，超时约 15 秒）。`node -v`、`node -e "console.log(1)"`、脚本路径都会拿到真实 stdout/stderr。`clear` 只清卡片，不进 shell。

不是 PTY：没有交互式 TTY（vim、裸 `node` REPL 会等到超时）。一次回车一条命令。

## 设计要点

- 卡片自带标题栏：左侧写「Terminal」，右侧 `clear`（清屏）和 `⤢`（放大）。
- 放大 = 真全屏：覆盖层直接挂到 `document.body`。Esc 或再点 ⤢ 退出。
- **命令记录存在块详情里**：写在块 `data.session.history`。正在输入、还没回车的那半截命令**不落盘**。
- 输入行永远在最底部，Enter 执行。
- 高度写在围栏头 `height=`（默认 320，最小 120），超出滚动。

## 示例写法

围栏头：`kind=terminal plugin=page-terminal`。

```md
:::pageBlock {kind=terminal plugin=page-terminal}
{
  "cwd": ".",
  "prompt": "$",
  "lines": ["工作区 shell。回车执行真实命令，例如 node -v。"],
  "height": 340
}
:::
```

改完沙箱后必须 `db_action /plugins/page-terminal action=pack` 才会打进已安装插件。
