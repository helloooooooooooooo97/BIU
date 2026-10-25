# 英语练习块（english-lab）

斜杠菜单分组 **英语**。七种块，数据都在围栏 JSON 里。

| kind | 名称 | 竞品 |
|---|---|---|
| `listen` | 英语听力 | TOEFL / IELTS / Listenwise |
| `read` | 英语阅读 | TOEFL Reading / Newsela |
| `write` | 英语写作 | Cambridge Write & Improve |
| `translate` | 英语翻译 | DeepL / CATTI |
| `choice` | 英语选择 | Quizlet |
| `cloze` | 英语填空 | Cambridge Use of English / Clozemaster |
| `speak` | 英语口语 | IELTS cue card / ELSA |

## 示例写法

:::pageBlock {kind=listen plugin=english-lab}
{
  "title": "Lecture: Urban bees",
  "audioUrl": "",
  "transcript": "Today we will look at how cities can support honeybees.",
  "questions": [
    { "id": "q1", "stem": "What is the lecture mainly about?", "options": ["Honey prices", "Urban habitats for bees"], "answer": 1 }
  ]
}
:::

:::pageBlock {kind=read plugin=english-lab}
{
  "title": "The value of boredom",
  "passage": "Boredom is often treated as a problem…",
  "questions": []
}
:::

:::pageBlock {kind=write plugin=english-lab}
{
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
  "reference": "一座没有蜜蜂忙碌的城市，比看上去更贫瘠。"
}
:::

:::pageBlock {kind=choice plugin=english-lab}
{
  "title": "Vocabulary",
  "questions": [
    { "id": "c1", "stem": "The findings were ____.", "options": ["marginal", "striking"], "answer": 1 }
  ]
}
:::

:::pageBlock {kind=cloze plugin=english-lab}
{
  "template": "People who sit with {{boredom}} rather than a phone often find {{ideas}} arriving later."
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
