# 页面终端

在页面编辑器中输入 `/terminal` 或 `/终端` 插入。终端连接工作区内的真实 PTY，支持 ANSI 色彩、交互程序、滚动历史、复制粘贴和随块宽度自动调整。

每次打开页面块都会创建独立 shell；页面块卸载、连接断开或插件停止时，关联进程会被关闭。

## 示例写法

```md
:::pageBlock {kind=terminal plugin=page-terminal}
{
  "height": 360
}
:::
```
