# 健身记录块（fitness-tracker）

在页面文档里插入两个**健身打卡块**，数据存在块的 `data` 里、跟着文档走，只读态可一键导出 markdown 给 agent 读。

- **`fitness-day` 今日打卡**：饮水按时间表打点（07:00 / 09:00 / 11:00 …）并可快捷 +250/+300/+400/+500ml，自动累加、对比当日目标（休息日 2.85L / 训练日 3.75L）；8+16 进食窗口按当前时间算「还剩多久开窗 / 是否在窗口内」；餐次逐条勾选；训练完成、电解质、体重、步数、睡眠、备注；卡片还有咖啡因 15:00 提醒。
- **`fitness-log` 训练日志**：周分化动作表，每个动作可加组/减组，逐组勾选完成并填重量×次数，自动算**训练容量**（已完成组重量×次数之和）与完成组数，只读态导出 markdown 表格。

## 示例写法

今日打卡：

```md
:::pageBlock {kind=fitness-day plugin=fitness-tracker}
{
  "fastStart": "20:00",
  "fastEnd": "12:00",
  "sodium": false,
  "water": { "07:00": 500, "09:00": 400 }
}
:::
```

训练日志：

```md
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
```

## 可写字段

`fitness-day`：`date`、`weight`、`steps`、`sleep`、`fastStart`、`fastEnd`、`water`（`"HH:MM" → ml`）、`sodium`、`meals`（餐名 → bool）、`workoutDone`、`note`。

`fitness-log`：`day`、`focus`、`exercises[]`，每个动作 `{ name, scheme, sets: [{ weight, reps, done }] }`。

## 说明

无头页面块插件，不弹窗口、没有操纵栏。斜杠菜单输入 `打卡` / `饮水` / `fitness` 或 `训练` / `workout` 插入。
