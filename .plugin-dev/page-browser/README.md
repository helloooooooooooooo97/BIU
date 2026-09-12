# 浏览器（page-browser）

在页面里用 `/` 插入一个 **浏览器卡片**：地址栏输入链接（`example.com` 或 `https://…`）点「前往」就在卡片里访问，可后退、刷新、放大全屏、新标签打开。无头插件，不占运行窗口。

## 设计要点

- 顶部工具条：← 回起始页、⟳ 刷新、地址输入框、前往、↗ 新标签打开、⤢ 放大。
- 放大 = 真全屏：覆盖层直接挂到 `document.body`（`position: fixed; inset: 0`，最高 z-index），并临时放开沿途祖先的 `overflow`，不会被编辑区裁掉。**iframe 不重建**，放大/退出后页面和滚动位置都在。Esc 或 ⤢ 退出。
- 页面装在 `<iframe>` 里（无 `allow-top-navigation`，不会劫持你的界面）。
- **有些站点禁止被嵌入**（`X-Frame-Options` / CSP `frame-ancestors`，如 google.com、github.com、百度）。卡片会在 7 秒后浮出提示条，点「新标签打开」即可正常访问。
- 高度写在围栏头 `height=`（默认 420，最小 160），超出滚动。

## 示例写法

围栏头：`kind=browser plugin=page-browser`。围栏体是 JSON：`url`、`height`。

```md
:::pageBlock {kind=browser plugin=page-browser}
{
  "url": "https://example.com",
  "height": 420
}
:::
```

写入页面用 `db_content` 对应 page 的 markdown，按上面围栏粘贴或替换。斜杠插入时编辑器会补 `id=`；手写围栏可省略 `id`。