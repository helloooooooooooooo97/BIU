# 页面目录

参考 **Notion Outline / Obsidian / VS Code Outline / GitHub docs**：`On this page` 大纲，当前标题高亮，H1–H3 深度可切，折叠写进块数据。

围栏头：`kind=toc plugin=page-toc`。

## 示例写法

:::pageBlock {kind=toc plugin=page-toc}
{
  "title": "目录",
  "collapsed": [],
  "activeId": "",
  "maxLevel": 3
}
:::

| 字段 | 说明 |
|---|---|
| `title` | 大纲标题 |
| `collapsed` | 收起的节点 id |
| `activeId` | 当前跳到的标题 |
| `maxLevel` | 显示到 H1 / H2 / H3 |
