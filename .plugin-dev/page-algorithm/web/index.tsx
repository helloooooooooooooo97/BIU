import { Card, Input, ReUI, Select, Textarea } from './reui'

const React = globalThis.React
const { useEffect, useRef, useState } = React

export const name = 'page-algorithm'
export const inject = ['pageEditor']

const DEFAULTS = {
  title: '1. Two Sum',
  difficulty: 'Easy',
  prompt:
    '给定一个整数数组 nums 和一个整数目标值 target，请你在该数组中找出和为目标值的那两个整数，并返回它们的数组下标。\n\n你可以假设每种输入只会对应一个答案。数组中同一个元素在答案里不能重复出现。',
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

/** 草稿在本地；失焦/点到外部才写回，避免每次按键 update 把光标甩到末尾。 */

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
  const accent = DIFF_COLOR[difficulty] ?? '#00b8a3'
  const ro = !writable

  return (
    <ReUI>
    <Card data-testid="page-algorithm-card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 280, overflow: 'hidden', padding: 0, ['--pa-diff' as string]: accent }}>
      <section style={{ minWidth: 0, background: 'var(--rui-accent)', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span className="rui-muted">题目</span>
          <Select
            data-testid="page-algorithm-diff"
            className="ml-auto w-auto rounded-full border-0"
            disabled={ro}
            value={difficulty}
            onChange={(event) => update({ difficulty: event.target.value })}
          >
            <option>Easy</option>
            <option>Medium</option>
            <option>Hard</option>
          </Select>
        </div>
        <DraftField
          as="input"
          testId="page-algorithm-title"
          readOnly={ro}
          value={title}
          onCommit={(next) => update({ title: next })}
          className="rui-input" style={{ height: 'auto', border: 0, background: 'transparent', fontSize: 20, fontWeight: 700 }}
        />
        <DraftField
          as="textarea"
          testId="page-algorithm-prompt"
          readOnly={ro}
          value={prompt}
          onCommit={(next) => update({ prompt: next })}
          className="rui-textarea" style={{ minHeight: 160, border: 0, background: 'transparent' }}
        />
      </section>
      <section className="flex min-w-0 flex-col">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--rui-border)', padding: '8px 12px' }}>
          <span className="rui-muted">代码</span>
          <Select
            data-testid="page-algorithm-lang"
            className="ml-auto w-auto"
            disabled={ro}
            value={lang}
            onChange={(event) => update({ lang: event.target.value })}
          >
            <option value="python">Python</option>
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
            <option value="java">Java</option>
            <option value="cpp">C++</option>
          </Select>
        </div>
        <DraftField
          as="textarea"
          testId="page-algorithm-code"
          readOnly={ro}
          value={code}
          onCommit={(next) => update({ code: next })}
          className="rui-textarea" style={{ minHeight: 200, flex: 1, resize: 'none', border: 0, fontFamily: 'ui-monospace,monospace' }}
        />
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
    hint: '左右分栏：题面 + 代码，跟随页面主题',
    aliases: ['leetcode', 'algo', '算法', 'lc'],
    assets: [],
    defaults: DEFAULTS,
    View: AlgorithmCard,
  })
}
