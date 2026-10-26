# Deck

参考 **Gamma** 的卡片：固定 16:9 画布，用网格预设排版，格子里放标题 / 正文 / 列表 / 引语 / 数字。插入后自带五种排版示例，点「放大」全屏翻页编辑。

围栏头：`kind=deck plugin=page-deck`。

## 示例写法

:::pageBlock {kind=deck plugin=page-deck}
{
  "title": "Deck",
  "index": 0,
  "slides": [
    {
      "id": "demo-title",
      "layout": "title",
      "cells": [
        { "id": "t1", "kind": "heading", "text": "Deck" },
        { "id": "t2", "kind": "text", "text": "一页里放下多种块，换排版，放大成幻灯片。" }
      ]
    }
  ]
}
:::

| 字段 | 说明 |
|---|---|
| `title` | 片头名 |
| `index` | 当前页 |
| `slides[].layout` | `title` / `split` / `hero` / `trio` / `stack` |
| `slides[].cells` | 格子：`heading` `text` `list` `quote` `stat` |
