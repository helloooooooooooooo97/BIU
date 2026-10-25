# 页面回归检查块

参考 **Playwright HTML report / Vitest UI / Cypress / GitHub Checks**：断言是测试用例，`runs` 是 CI 记录，顶栏 Passed/Failed，历史是一次次 run chip。

## 示例写法

:::pageBlock {kind=run plugin=page-regression}
{
  "filter": "all",
  "selected": "",
  "runAt": 0,
  "asserts": [
    { "id": "a1", "type": "exists", "selector": "h1", "note": "标题存在" }
  ],
  "runs": []
}
:::

| 字段 | 说明 |
|---|---|
| `asserts[]` | 用例：`id` / `type` / `selector` / `expect` / `method` / `url` / `status` / `note` |
| `runs[]` | `{ at, ms, total, passed, failed, items[] }`，`items[].delta` 为 `fixed` / `broken` |
| `filter` | `all` / `failed` / `passed` |
| `selected` | 展开的用例 id |
| `runAt` | 当前对照的那次 run |

`POST /api/page-regression/http` 仍负责 http 断言。
