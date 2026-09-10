# 算法题卡片

在页面里用 `/` 插入 LeetCode 风算法块：左边题目描述，右边代码。可改题名、难度、题面、语言和代码。无头插件，不占运行窗口。

改页面或代写块之前，先照下面「示例写法」写 `:::pageBlock` 围栏。

## 示例写法

围栏头：`kind=algorithm plugin=page-algorithm`。围栏体是 JSON：`title`、`difficulty`（Easy / Medium / Hard）、`prompt`、`lang`、`code`。

```md
:::pageBlock {kind=algorithm plugin=page-algorithm}
{
  "title": "1. Two Sum",
  "difficulty": "Easy",
  "prompt": "给定一个整数数组 nums 和一个整数目标值 target，请你在该数组中找出和为目标值的那两个整数，并返回它们的数组下标。",
  "lang": "python",
  "code": "class Solution:\n    def twoSum(self, nums: list[int], target: int) -> list[int]:\n        seen = {}\n        for i, n in enumerate(nums):\n            if target - n in seen:\n                return [seen[target - n], i]\n            seen[n] = i\n        return []"
}
:::
```

写入页面用 `db_content` 对应 page 的 markdown，按上面围栏粘贴或替换。斜杠插入时编辑器会补 `id=`；手写围栏可省略 `id`。
