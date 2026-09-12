# MCP 调用记录

页面里的 CDB 诊断数据查看器。输入 `/mcp` 插入，选择会话和 turn 后，只展示以下数据：

- `list_instance_metainfo_*_preprocess` 元数据
- processlist raw
- `query_analyzed_slow_log` / `export_raw_slow_log`
- InnoDB transaction raw
- `query_status_data` / `query_metrics`
- `query_iostat_all_devices_trend`
- `query_iotop_snapshot`
- `query_host_load`

其他 MCP tools、调用入参、`call_id / trace_id / tokens / status / data_status / start_time / end_time` 不进入主展示。

## 主动补拉

浏览器不能直接访问 MCP 凭据。`host.ts` 的 `/api/mcp-inspector/enrich` 从 session 事件反查来源调用，浏览器只传 `sessionId + turn`，不能传任意 tool/arguments。

- Processlist：
  - 已有 `query_processlist_raw_logs` 直接复用。
  - 成功且非空的 `query_processlist_one_snapshot_aggregated` 使用服务端实际匹配的时间。
  - 成功且非空的 `query_processlist_timeline_snapshot_aggregated` 使用 `snapshot_aggregated.timestamp`。
  - 两者均以 `start_time=end_time` 补拉完整单点快照，不使用窗口起点后的前 4 个采样点。
- InnoDB trx：
  - 已有 `query_innodb_trx_raw` 直接复用。
  - 成功且非空的 `query_innodb_trx` 用相同 product/ip/port/start/end 补拉 raw，强制 `mode=logjson`。
- Status / iostat / host load：
  - 原调用已有 `include_raw_data=true` 时直接复用。
  - 否则保持原定位和时间参数，补拉 `include_raw_data=true`。
- `query_metrics`、slow log、iotop、元数据只使用原 MCP 调用结果，不补拉。

同参数补拉共享一次 MCP Promise，并在 host 进程内缓存 30 分钟；错误缓存 15 秒。远端并发上限 4。重复成功的来源调用不会合并，仍逐条渲染。

## 成功判定

不能只看 session 事件的 `tool/result.ok`。历史上存在事件层 `ok=true`、但 SDK `isError=true` 或叶子 payload `status=error` 的记录。`model.ts` 会依次检查：

1. `tool/result.ok`
2. MCP `CallToolResult.isError`
3. 叶子 JSON 的 `status / error_message`
4. `data_status` 与实际 `records / sections / snapshots / transactions`

失败或空数据保留一行简短提示，不把技术 status JSON 整块显示出来。

## 专用格式

- Processlist：按 timestamp 分段；每行固定 `ID,USER,HOST,db,COMMAND,TIME,STATE,INFO`。
- Analyzed slow：每条 SQL 一张平铺键值卡，SQL 独占整行。
- Raw slow：MySQL slow-log 文本（Time / User@Host / Query_time / SET timestamp / SQL），缺字段即忽略。
- InnoDB trx：snapshot_time + `***** N.row *****` + 服务端返回的全部 transaction 字段。
- Status / query_metrics：按 section、按单指标小图展示，避免不同量纲共用 Y 轴。
- Iostat：每个设备分吞吐、await、队列三组图。
- Iotop：summary + process 表格。
- Host load：Load、CPU、Tasks、Memory 四组图。

## 选取、文字拖选和全屏

内容直接渲染在主文档中（不是 iframe），`stamp-picks.ts` 把 `data-biu-*` 盖入 HTML 字符串，因此 AI「选取」能命中内部 article/pre/table/svg。表格只盖到 table，不下到 tr/td，避免 processlist 把选取列表冲爆。

页面块是 TipTap draggable atom：

- `mousedown.stopPropagation()` 阻止 `PageBlockView.setNodeSelection()`。
- `drag-guard.ts` 在按下期间临时关掉祖先 `draggable=true`，mouseup/dragend 后还原，让鼠标拖选文字和块拖拽排序同时可用。

每组数据都可全屏，浮层通过 portal 挂到 `document.body`。全屏内容同样带 pick 标记。

## 样式约束

报告活在主文档，`reportCss()` 的每条规则必须以 `.mcpi` 开头，禁止 `:root / html / body`；颜色统一使用 `--dsw-*`。测试会守住这条，避免污染全局。

## 改完要 pack

`.plugin-dev` 是源码，运行时读取 `.plugin/mcp-inspector/{host,web}.js`：

```text
db_action path=/plugins/mcp-inspector action=pack
```

然后刷新页面。
