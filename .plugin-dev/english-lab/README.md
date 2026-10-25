# 英语练习块（english-lab）

斜杠菜单分组 **英语**。七种块，数据都在围栏 JSON 里。AI 走宿主内置模型 `POST /api/english-lab/ai`。

| kind | 名称 | 竞品交互 |
|---|---|---|
| `listen` | 英语听力 | Duolingo 喇叭重听 + 乌龟词间停顿；理解题 / 精听圈词；原文 Check 后揭 |
| `read` | 英语阅读 | TOEFL 左文右题、滚到底解锁、词义高亮、插入句黑块；Newsela 短文降级；LingQ 点词 |
| `write` | 英语写作 | Write & Improve：essay/chart/email、提纲、字数警告、AI 评分与逐句改 |
| `translate` | 英语翻译 | Google 互换时对调 source/reference；Check 前藏参考；词级 diff；词库降级 |
| `choice` | 英语选择 | Quizlet 单题；单选+多选；Check 后解释（可 AI） |
| `cloze` | 英语填空 | Cambridge / Clozemaster `{{word}}` + 词库；**作答历史必填** |
| `speak` | 英语口语 | IELTS cue card 倒计时 + 转写（不录音）+ AI 评分 |

## 示例写法

:::pageBlock {kind=listen plugin=english-lab}
{
  "title": "Lecture: Urban bees",
  "mode": "questions",
  "transcript": "Today we will look at how cities can support honeybees.",
  "questions": [
    { "id": "q1", "stem": "What is the lecture mainly about?", "options": ["Honey prices", "Urban habitats for bees"], "answer": 1 }
  ]
}
:::

:::pageBlock {kind=read plugin=english-lab}
{
  "title": "The value of boredom",
  "passage": "Boredom is often treated as a problem…\n\nIn one study…",
  "shortPassage": "Boredom can help ideas.",
  "questions": [
    { "id": "r1", "stem": "Boredom is useful because it", "options": ["shortens memory", "encourages mind-wandering"], "answer": 1, "para": 0, "explain": "Unstructured time lets the mind wander." }
  ]
}
:::

:::pageBlock {kind=write plugin=english-lab}
{
  "kind": "essay",
  "prompt": "Discuss both views and give your opinion.",
  "essay": "",
  "limit": 250
}
:::

:::pageBlock {kind=translate plugin=english-lab}
{
  "direction": "en-zh",
  "source": "The city that is not busy with bees is poorer than it looks.",
  "mine": "",
  "reference": "一座没有蜜蜂忙碌的城市，比看上去更贫瘠。",
  "checked": false
}
:::

:::pageBlock {kind=choice plugin=english-lab}
{
  "title": "Vocabulary",
  "questions": [
    { "id": "c1", "stem": "The findings were ____.", "options": ["marginal", "striking"], "answer": 1 },
    { "id": "c2", "type": "multi", "stem": "Which mean brief?", "options": ["cursory", "sketchy", "exhaustive"], "answer": [0, 1] }
  ]
}
:::

:::pageBlock {kind=cloze plugin=english-lab}
{
  "template": "People who sit with {{boredom}} rather than a phone often find {{ideas}} arriving later.",
  "history": []
}
:::

:::pageBlock {kind=speak plugin=english-lab}
{
  "topic": "a book you recently read",
  "bullets": ["what the book was about", "why you chose it"],
  "prep": 60,
  "speakFor": 90
}
:::
