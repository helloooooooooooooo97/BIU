# 插件体检（plugin-doctor）

参考 **Sentry Issues / Linear / Xcode Organizer**：顶部是 Unresolved / Warnings / Resolved 计数和一条严重度分布条，下面按严重度分组的 issue 列表，点开一条看证据。没有健身圆环。

扫描仓库 `.plugin/` 下已安装插件。每条插件带 `level`（`ok` / `warn` / `error`）和 `problems[]`；报告另有扁平 `issues[]`（Sentry 式：一条问题一行）。

**扫什么**

- `id` / 显示名 / 是否 `headless`
- 有没有 `host.js`、`web.js`
- 文件总大小、文件数
- 最近运行时间（`.plugin/store.json` 的 `lastRunAt` / `enabled`）
- README 里有没有 `:::pageBlock` 示例
- `conclusion`：`合规` / `缺 README 示例` / `缺引擎` / `空插件`
- `level`：结论映射成环和分组用的严重度

**块数据**

| 字段 | 说明 |
|---|---|
| `report` | 整份扫描结果（含 `summary` / `plugins` / `issues`） |
| `filter` | `all` / `ok` / `warn` / `error` |
| `focus` | 当前展开的插件 id |

**HTTP**

```
GET /api/plugin-doctor/scan
→ { scannedAt, root, total, summary, plugins, issues }
```

## 示例写法

:::pageBlock {kind=plugin-doctor plugin=plugin-doctor}
{
  "report": null,
  "filter": "all",
  "focus": ""
}
:::
