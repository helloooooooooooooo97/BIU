# API 调试块（api-playground）

参考 **Insomnia / Paw / Postman / Bruno**：左侧 Collection 历史，顶栏 method + URL + Send，请求分 Params / Headers / Body 键值表，响应分 Body / Headers。

host 用 Node `fetch` 真发请求。只放行 `http:` / `https:`；15s 超时；响应体超过 200 KB 截断。

## 块数据

| 字段 | 说明 |
|---|---|
| `method` / `url` / `body` | 请求三件套 |
| `headerRows` | `{ id, enabled, key, value }[]`，Postman 式请求头 |
| `queryRows` | 同上，Query Params；发送时由 host 并进 URL |
| `headers` | 由 `headerRows` 序列化的多行文本，兼容旧围栏 |
| `reqTab` | `params` / `headers` / `body` |
| `resTab` | `body` / `headers` |
| `history` | 最近 20 条（含 rows、status、preview） |
| `last` | 最后一次响应；`body` 截到 20 000 字 |
| `activeHistory` | 侧栏高亮的那条 `at` |

旧文档只有 `headers` 字符串时，打开块会解析成 `headerRows`。

## 示例写法

:::pageBlock {kind=api-play plugin=api-playground}
{
  "method": "GET",
  "url": "http://127.0.0.1:3141/api/page-terminal/shell",
  "headerRows": [{ "id": "ct", "enabled": true, "key": "Content-Type", "value": "application/json" }],
  "queryRows": [{ "id": "q0", "enabled": true, "key": "", "value": "" }],
  "body": ""
}
:::

## HTTP

```sh
curl -X POST http://127.0.0.1:3141/api/api-playground/send \
  -H 'Content-Type: application/json' \
  -d '{"method":"GET","url":"http://127.0.0.1:3141/api/page-terminal/shell","headers":[{"key":"Accept","value":"application/json"}],"query":[{"key":"pretty","value":"1"}]}'
```
