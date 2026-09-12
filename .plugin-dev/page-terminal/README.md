# 终端（page-terminal）

在页面里用 `/` 插入一个 **终端卡片**：像真终端一样输入命令、看输出，右上角可以**全屏放大**（Esc 退出）。无头插件，不占运行窗口。

> 这是**本地演示终端**：命令表在 `shell.ts` 里，纯前端模拟（ls / cat / tree / echo / date / neofetch / open / help / demo / clear），**不会**执行宿主真 shell。要接真 shell 请改成 host 侧服务。

## 设计要点

- 卡片自带标题栏：左侧写「Terminal」，右侧 `clear`（清屏）和 `⤢`（放大）。
- 放大 = 真全屏：覆盖层直接挂到 `document.body`（`position: fixed; inset: 0`，最高 z-index），并临时把沿途祖先的 `overflow` 放开，所以不会像 HTML 块那样被编辑区裁掉。Esc 或再点 ⤢ 退出，退出后祖先样式原样还原。
- 放大前后**会话不丢**：输入过的命令、输出都在。
- **命令记录存在块详情里**：写在块 `data.session.history`（不是浏览器 localStorage），刷新、换设备、导出 markdown 后在。围栏字段 `cwd` / `prompt` / `lines` 只当开场白，首次挂载灌一次，之后以 `session` 为准。正在输入、还没回车的那半截命令**不落盘**。
- 输入行永远在最底部，Enter 执行；`help` 看命令表，`demo` 看引导。
- 高度写在围栏头 `height=`（默认 320，最小 120），超出滚动。

## 示例写法

围栏头：`kind=terminal plugin=page-terminal`。围栏体是 JSON：`cwd`、`prompt`、`lines`（开场输出，数组）、`height`。

```md
:::pageBlock {kind=terminal plugin=page-terminal}
{
  "cwd": "~/demo",
  "prompt": "$",
  "lines": ["Welcome to the demo terminal.", "输入 `help` 看命令，`demo` 看引导。"],
  "height": 340
}
:::
```

写入页面用 `db_content` 对应 page 的 markdown，按上面围栏粘贴或替换。斜杠插入时编辑器会补 `id=`；手写围栏可省略 `id`。
