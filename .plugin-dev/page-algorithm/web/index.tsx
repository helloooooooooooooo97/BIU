import { Card, Input, ReUI, Select, Textarea } from './reui'

const React = globalThis.React
const { useEffect, useRef, useState } = React

export const name = 'page-algorithm'
export const inject = ['pageEditor']

type Example = { input: string; output: string; explanation?: string }

const DEFAULTS = {
  title: '1. Two Sum',
  difficulty: 'Easy',
  topics: ['Array', 'Hash Table'],
  prompt:
    '给定一个整数数组 nums 和一个整数目标值 target，请你在该数组中找出和为目标值的那两个整数，并返回它们的数组下标。\n\n你可以假设每种输入只会对应一个答案。数组中同一个元素在答案里不能重复出现。你可以按任意顺序返回答案。',
  examples: [
    {
      input: 'nums = [2,7,11,15], target = 9',
      output: '[0,1]',
      explanation: 'Because nums[0] + nums[1] == 9, we return [0, 1].',
    },
    {
      input: 'nums = [3,2,4], target = 6',
      output: '[1,2]',
    },
  ] satisfies Example[],
  constraints: '2 <= nums.length <= 10^4\n-10^9 <= nums[i] <= 10^9\n-10^9 <= target <= 10^9\n只会存在一个有效答案。',
  lang: 'python',
  code: `class Solution:
    def twoSum(self, nums: list[int], target: int) -> list[int]:
        seen = {}
        for i, n in enumerate(nums):
            if target - n in seen:
                return [seen[target - n], i]
            seen[n] = i
        return []`,
}

const DIFF_COLOR: Record<string, string> = {
  Easy: '#00b8a3',
  Medium: '#ffc01e',
  Hard: '#ff375f',
}

function DraftField({
  as: kind,
  value,
  onCommit,
  readOnly,
  testId,
  className,
  style,
}: {
  as: 'input' | 'textarea'
  value: string
  onCommit: (next: string) => void
  readOnly?: boolean
  testId: string
  className: string
  style?: Record<string, unknown>
}) {
  const Tag = kind === 'textarea' ? Textarea : Input
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)
  const draftRef = useRef(draft)
  const valueRef = useRef(value)
  const onCommitRef = useRef(onCommit)
  draftRef.current = draft
  valueRef.current = value
  onCommitRef.current = onCommit
  useEffect(() => {
    if (!focused.current) setDraft(value)
  }, [value])
  useEffect(
    () => () => {
      if (draftRef.current !== valueRef.current) onCommitRef.current(draftRef.current)
    },
    [],
  )
  const flush = () => {
    if (draftRef.current !== valueRef.current) onCommitRef.current(draftRef.current)
  }
  return (
    <Tag
      data-testid={testId}
      data-page-block-capture=""
      readOnly={readOnly}
      spellCheck={kind === 'textarea' ? false : undefined}
      value={draft}
      onFocus={() => {
        focused.current = true
      }}
      onBlur={() => {
        focused.current = false
        flush()
      }}
      onKeyDown={(event) => {
        event.stopPropagation()
      }}
      onChange={(event) => setDraft(event.currentTarget.value)}
      className={className}
      style={style}
    />
  )
}

function readExamples(raw: unknown): Example[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const row = item as Record<string, unknown>
      return {
        input: String(row.input ?? ''),
        output: String(row.output ?? ''),
        explanation: row.explanation ? String(row.explanation) : undefined,
      }
    })
    .filter((item) => item.input || item.output)
}

function readTopics(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => String(item)).filter(Boolean)
}

function AlgorithmCard({
  data,
  update,
  writable,
}: {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  writable: boolean
}) {
  const title = String(data.title ?? '')
  const difficulty = String(data.difficulty ?? 'Easy')
  const prompt = String(data.prompt ?? '')
  const lang = String(data.lang ?? 'python')
  const code = String(data.code ?? '')
  const constraints = String(data.constraints ?? '')
  const topics = readTopics(data.topics)
  const examples = readExamples(data.examples)
  const accent = DIFF_COLOR[difficulty] ?? '#00b8a3'
  const ro = !writable
  const lines = code.split('\n').length

  return (
    <ReUI>
      <Card data-testid="page-algorithm-card" className="lc-shell" style={{ padding: 0, overflow: 'hidden' }}>
        <section className="lc-desc">
          <DraftField
            as="input"
            testId="page-algorithm-title"
            readOnly={ro}
            value={title}
            onCommit={(next) => update({ title: next })}
            className="lc-title"
            style={{ height: 'auto', border: 0, background: 'transparent', fontSize: 22, fontWeight: 600, padding: 0 }}
          />
          <div className="lc-meta">
            {ro ? (
              <span className="lc-diff" style={{ color: accent }}>
                {difficulty}
              </span>
            ) : (
              <Select
                data-testid="page-algorithm-diff"
                style={{ width: 108, border: 0, background: 'transparent', color: accent, fontWeight: 600 }}
                value={difficulty}
                onChange={(event) => update({ difficulty: event.target.value })}
              >
                <option>Easy</option>
                <option>Medium</option>
                <option>Hard</option>
              </Select>
            )}
            <div className="lc-topics">
              {topics.map((topic) => (
                <span className="lc-topic" key={topic}>
                  {topic}
                </span>
              ))}
            </div>
          </div>
          <div className="lc-h">Description</div>
          <DraftField
            as="textarea"
            testId="page-algorithm-prompt"
            readOnly={ro}
            value={prompt}
            onCommit={(next) => update({ prompt: next })}
            className="lc-p"
            style={{ minHeight: 120, border: 0, background: 'transparent', padding: 0, fontSize: 14, lineHeight: 1.75 }}
          />
          {examples.map((ex, i) => (
            <div className="lc-ex" key={i}>
              <strong>Example {i + 1}:</strong>
              <div>
                <span className="rui-muted">Input: </span>
                {ex.input}
              </div>
              <div>
                <span className="rui-muted">Output: </span>
                {ex.output}
              </div>
              {ex.explanation ? (
                <div>
                  <span className="rui-muted">Explanation: </span>
                  {ex.explanation}
                </div>
              ) : null}
            </div>
          ))}
          {constraints ? (
            <>
              <div className="lc-h">Constraints</div>
              <pre className="lc-p" style={{ margin: 0, fontFamily: 'ui-monospace,monospace', fontSize: 13 }}>
                {constraints}
              </pre>
            </>
          ) : null}
        </section>
        <section className="lc-code">
          <div className="lc-codebar">
            <span style={{ fontWeight: 650, fontSize: 13 }}>Code</span>
            <Select
              data-testid="page-algorithm-lang"
              disabled={ro}
              value={lang}
              onChange={(event) => update({ lang: event.target.value })}
            >
              <option value="python">Python3</option>
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="java">Java</option>
              <option value="cpp">C++</option>
            </Select>
            <span className="rui-muted" style={{ marginLeft: 'auto' }}>
              {lines} 行
            </span>
          </div>
          <DraftField
            as="textarea"
            testId="page-algorithm-code"
            readOnly={ro}
            value={code}
            onCommit={(next) => update({ code: next })}
            className="rui-textarea"
            style={{
              flex: 1,
              minHeight: 280,
              resize: 'none',
              border: 0,
              borderRadius: 0,
              fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
              fontSize: 13,
              lineHeight: 1.6,
              padding: '12px 14px',
            }}
          />
          <div className="lc-console">
            <div className="lc-console-tabs">
              <span data-on="true">Testcase</span>
              <span>Output</span>
            </div>
            <div className="lc-console-body lc-empty">
              {examples[0] ? `Case 1\n${examples[0].input}` : 'You must run your code first.'}
            </div>
          </div>
        </section>
      </Card>
    </ReUI>
  )
}

export function apply(ctx: {
  pageEditor: {
    registerBlock: (spec: {
      kind: string
      plugin: string
      label: string
      blockType?: string
      blockTypeLabel?: string
      hint?: string
      aliases?: string[]
      defaults?: Record<string, unknown>
      View: (props: { data: Record<string, unknown>; update: (patch: Record<string, unknown>) => void; writable: boolean }) => unknown
    }) => void
  }
}) {
  ctx.pageEditor.registerBlock({
    kind: 'algorithm',
    plugin: name,
    label: '算法题',
    blockType: 'algorithm',
    blockTypeLabel: '算法题',
    hint: 'LeetCode 结构：题面 / 示例 / 约束 + 代码，跟随页面主题',
    aliases: ['leetcode', 'algo', '算法', 'lc'],
    assets: [],
    defaults: DEFAULTS,
    View: AlgorithmCard,
  })
}
