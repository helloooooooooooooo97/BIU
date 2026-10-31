# 健身记录块（fitness-tracker）

对照竞品：

- **今日打卡**：**Apple 健身** 三环（饮水 / 餐次 / 训练）+ **Waterllama** 时间表打点 + **Zero** 进食窗口；下面是步数 / 睡眠 / 体重磁贴。
- **训练日志**：**Hevy / Strong**：动作卡片 + 组表（组 / 上次 / kg / 次 / 勾选），顶栏容量和完成组。

数据存在块的 `data` 里、跟着文档走，可导出 markdown。

## 示例写法

今日打卡：

:::pageBlock {kind=fitness-day plugin=fitness-tracker}
{
  "fastStart": "20:00",
  "fastEnd": "12:00",
  "sodium": false,
  "water": { "07:00": 500, "09:00": 400 }
}
:::

训练日志：

:::pageBlock {kind=fitness-log plugin=fitness-tracker}
{
  "day": "周一",
  "focus": "上肢A（推为主）",
  "exercises": [
    { "name": "杠铃卧推", "scheme": "4×6–8", "sets": [{ "weight": 60, "reps": 8, "done": true }] },
    { "name": "侧平举", "scheme": "4×12–15", "sets": [] }
  ]
}
:::

## 可写字段

`fitness-day`：`date`、`weight`、`steps`、`sleep`、`fastStart`、`fastEnd`、`water`（`"HH:MM" → ml`）、`sodium`、`meals`（餐名 → bool）、`workoutDone`、`note`。

`fitness-log`：`day`、`focus`、`exercises[]`，每个动作 `{ name, scheme, sets: [{ weight, reps, done }] }`。

## 说明

无头页面块插件，不弹窗口、没有操纵栏。斜杠菜单输入 `打卡` / `饮水` / `fitness` 或 `训练` / `workout` 插入。
