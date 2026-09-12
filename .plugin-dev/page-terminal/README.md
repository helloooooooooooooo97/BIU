# 终端（page-terminal）

在页面里用 `/` 插入一个 **终端卡片**：**真 shell**（宿主侧 `/bin/sh`），输入命令、实时看输出，右上角可以**全屏放大**（Esc 退出）。无头插件，不占运行窗口。

> 这是真 shell，不是模拟：内核能力在 `packages/host-terminal`，页面按块 id 命名会话，
> **和 agent 的 `terminal_write` 是同一条会话**（agent 敲的你能看见，你敲的 agent 读得到）。
> `mysql` 另走一条独立通道（`/api/page-terminal/mysql`，客户端 batch 模式）。
>
> ⚠️ 这条 shell **不受沙箱约束**，等价于你自己开一个终端。边界在「谁能访问这个 HTTP API」，不在 shell 本身。
> 当前 API 无鉴权，风险清单见工作区页面「host-termal 与安全边界」。

## 能力与限制

- **L2 真 shell，无 tty**：`cd` / 环境变量 / 管道 / `&&` / `mysql -p` 提示都能用。
  但 `vim`/`top`/`less` 这类全屏程序不可用（无 tty），`sudo` 拿不到密码提示，
  程序输出会块缓冲（想看实时用 `python3 -u`）。
- **会话活着**：shell 进程挂在 host 里，刷新页面 / 切页 / 关块都不杀；host 重启才没。
- **命名 = 块 id**：会话名是 `page:<blockId>`。agent 用同一个名字 `terminal_open({name:"page:xxx"})`
  就能接上同一条 shell。
- **页面输入**：沿用卡片底部的输入行。Enter 发送；`clear` 只清屏；`help` 看用法。
  按键在输入框上以 capture 阶段原生处理，ProseMirror 不会抢（否则退格会删块、光标会跳出）。
- **孤儿会话**：删块不会自动 kill 会话（避免复制粘贴误杀）。用
  `curl /api/page-terminal/shell` 看活着的会话，或 `terminal_close`。

## 设计要点

- 卡片自带标题栏：左侧写「Terminal」，右侧 `clear`（清屏）和 `⤢`（放大）。
- 放大 = 真全屏：覆盖层直接挂到 `document.body`（`position: fixed; inset: 0`，最高 z-index），并临时把沿途祖先的 `overflow` 放开，所以不会像 HTML 块那样被编辑区裁掉。Esc 或再点 ⤢ 退出，退出后祖先样式原样还原。
- 放大前后**会话不丢**：输入过的命令、输出都在。
- **命令记录存在块详情里**：写在块 `data.session.history`（不是浏览器 localStorage），刷新、换设备、导出 markdown 后在。围栏字段 `cwd` / `prompt` / `lines` 只当开场白，首次挂载灌一次，之后以 `session` 为准。正在输入、还没回车的那半截命令**不落盘**。
- 输入行永远在最底部，Enter 执行；`help` 看命令表，`demo` 看引导。
- 高度写在围栏头 `height=`（默认 320，最小 120），超出滚动。

## mysql（真连数据库）

- `mysql` → 进 SQL 模式，之后每行 SQL 以 `;` 结束执行，`exit` / `\q` 退出。
- `mysql -e "SHOW DATABASES;"` → 直接执行一条 SQL。
- `mysql ping` / `mysql dbs` / `mysql tables [库]` / `mysql use <库>` / `mysql status`。
- `mysql -h 主机 -P 端口 -u 用户 -p密码 -D 库` → 覆盖连接参数（可只给一部分），只对本次会话有效，不写回文档。
- 想在真 shell 里直接用 `mysql -uroot -p` 也行（会真连、真提示），但**没有 tty**，交互式提示可能不显示；批量用 `mysql` 子命令更稳。
- 默认连接参数来自块详情 `data.mysql`（围栏 JSON 的 `mysql` 字段）。**密码写在围栏里就会进 markdown**，介意的话别写，改用 `-p` 临时给。
- host 侧边界：只 spawn mysql 客户端（参数走数组，无 shell 拼接），密码走 `MYSQL_PWD` 环境变量不进 ps；挡掉 `\!` / `system` / `source`。写操作（DML/DDL）会真的执行。
- 客户端位置：`BIU_MYSQL_BIN` 环境变量 > `/opt/homebrew/opt/mysql-client/bin/mysql` > `mysql@8.0` > 系统路径。

## SQL 模式的两个坑（已修，别再踩）

1. **默认凭据没密码 → 每条 SQL 都 1045。** 用裸 `mysql` 进 SQL 模式时，连接参数取块里的
   `data.mysql`（默认 `root@127.0.0.1:3306` 无密码）。本机 root 若设过密码，你看到的会是
   `ERROR 1045 Access denied ... (using password: NO)` ——**这是认证失败，不是 SQL 写错**。
2. **进了 SQL 模式也能换连接。** 直接在 SQL 模式里敲 `mysql -u root -p<密码>`（或 `connect ...`）
   就换过去了，不需要先 `exit`。旧版会把它当 shell 命令拒掉，属于死路，已改。

失败时终端会按错误类型给提示（1045 / 2003 连不上 / 1043 库不存在 / 1064 语法）。

## 示例写法

围栏头：`kind=terminal plugin=page-terminal`。围栏体是 JSON：`cwd`、`prompt`、`lines`（开场白，数组）、`height`、`mysql`（mysql 连接参数，可选）。
`data.session.history` 是命令记录（跟文档走），有 200 行 / 4000 字上限。

```md
:::pageBlock {kind=terminal plugin=page-terminal}
{
  "cwd": "~/demo",
  "prompt": "$",
  "lines": ["Welcome to the demo terminal.", "输入 `help` 看命令，`demo` 看引导。"],
  "height": 340,
  "mysql": { "host": "127.0.0.1", "port": 3306, "user": "root", "password": "", "database": "" }
}
:::
```

写入页面用 `db_content` 对应 page 的 markdown，按上面围栏粘贴或替换。斜杠插入时编辑器会补 `id=`；手写围栏可省略 `id`。
