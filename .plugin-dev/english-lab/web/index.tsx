/**
 * 英语练习块：听力 / 阅读 / 写作 / 翻译 / 选择 / 填空 / 口语
 * 竞品：TOEFL、IELTS、Cambridge、Write & Improve、DeepL、Clozemaster、ELSA
 */
import { Button, Input, ReUI, Textarea } from './reui'

const React = globalThis.React
const { useEffect, useMemo, useRef, useState } = React

export const name = 'english-lab'
export const inject = ['pageEditor']

const GROUP = { blockType: 'english', blockTypeLabel: '英语' }

type BlockProps = {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  writable: boolean
}

type ChoiceQ = { id: string; stem: string; options: string[]; answer: number; explain?: string }
type ClozeBlank = { id: string; answer: string }

function asText(v: unknown, fallback = '') {
  return typeof v === 'string' ? v : fallback
}
function asNum(v: unknown, fallback = 0) {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}
function words(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

function ListenBlock({ data, update, writable }: BlockProps) {
  const audioUrl = asText(data.audioUrl)
  const title = asText(data.title, 'Listening')
  const transcript = asText(data.transcript)
  const showScript = data.showScript === true
  const speed = asNum(data.speed, 1) || 1
  const questions = Array.isArray(data.questions) ? (data.questions as ChoiceQ[]) : []
  const picks = (data.picks && typeof data.picks === 'object' ? data.picks : {}) as Record<string, number>
  const checked = data.checked === true
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed
  }, [speed])

  const score = questions.filter((q) => picks[q.id] === q.answer).length

  return (
    <ReUI>
      <div className="en-shell" data-testid="english-listen">
        <div className="en-head">
          <div>
            <h2>{title}</h2>
            <p>TOEFL / IELTS Listening · 可调速、看原文、逐题作答</p>
          </div>
          <div className="rui-row">
            <Button variant="outline" onClick={() => update({ showScript: !showScript })}>
              {showScript ? '隐藏原文' : '显示原文'}
            </Button>
            <Button onClick={() => update({ checked: true })}>Check</Button>
          </div>
        </div>
        <div className="en-pane">
          <audio ref={audioRef} controls src={audioUrl || undefined} style={{ width: '100%' }} />
          <div className="rui-row" style={{ marginTop: 8 }}>
            <span className="rui-muted">Speed</span>
            {[0.75, 1, 1.25, 1.5].map((n) => (
              <Button key={n} size="sm" variant={speed === n ? 'secondary' : 'ghost'} onClick={() => update({ speed: n })}>
                {n}×
              </Button>
            ))}
            {writable ? (
              <Input className="rui-grow" placeholder="音频 URL" value={audioUrl} onChange={(e: { target: { value: string } }) => update({ audioUrl: e.target.value })} />
            ) : null}
          </div>
          {showScript ? <div className="en-passage" style={{ marginTop: 12 }}>{transcript || '（无原文）'}</div> : null}
        </div>
        <div className="en-pane" style={{ borderTop: '1px solid var(--rui-border)' }}>
          {questions.map((q, i) => (
            <div className="en-q" key={q.id}>
              <div style={{ fontWeight: 650, marginBottom: 6 }}>{i + 1}. {q.stem}</div>
              {q.options.map((opt, oi) => {
                const on = picks[q.id] === oi
                const ok = checked && oi === q.answer
                const bad = checked && on && oi !== q.answer
                return (
                  <div key={oi} className="en-opt" data-on={on} data-ok={ok} data-bad={bad} onClick={() => update({ picks: { ...picks, [q.id]: oi }, checked: false })}>
                    <span>{String.fromCharCode(65 + oi)}.</span>
                    <span>{opt}</span>
                  </div>
                )
              })}
              {checked && q.explain ? <div className="rui-muted" style={{ marginTop: 6 }}>{q.explain}</div> : null}
            </div>
          ))}
          {checked ? <div className="rui-muted">Score {score}/{questions.length}</div> : null}
        </div>
      </div>
    </ReUI>
  )
}

function ReadBlock({ data, update, writable }: BlockProps) {
  const title = asText(data.title, 'Reading')
  const passage = asText(data.passage)
  const questions = Array.isArray(data.questions) ? (data.questions as ChoiceQ[]) : []
  const picks = (data.picks && typeof data.picks === 'object' ? data.picks : {}) as Record<string, number>
  const checked = data.checked === true
  const score = questions.filter((q) => picks[q.id] === q.answer).length
  return (
    <ReUI>
      <div className="en-shell" data-testid="english-read">
        <div className="en-head">
          <div>
            <h2>{title}</h2>
            <p>TOEFL Reading · 左文右题</p>
          </div>
          <Button onClick={() => update({ checked: true })}>Check</Button>
        </div>
        <div className="en-split">
          <div className="en-pane">
            {writable ? (
              <Textarea value={passage} style={{ minHeight: 280 }} onChange={(e: { target: { value: string } }) => update({ passage: e.target.value })} />
            ) : (
              <div className="en-passage">{passage}</div>
            )}
          </div>
          <div className="en-pane">
            {questions.map((q, i) => (
              <div className="en-q" key={q.id}>
                <div style={{ fontWeight: 650, marginBottom: 6 }}>{i + 1}. {q.stem}</div>
                {q.options.map((opt, oi) => {
                  const on = picks[q.id] === oi
                  return (
                    <div key={oi} className="en-opt" data-on={on} data-ok={checked && oi === q.answer} data-bad={checked && on && oi !== q.answer} onClick={() => update({ picks: { ...picks, [q.id]: oi }, checked: false })}>
                      <span>{String.fromCharCode(65 + oi)}.</span>
                      <span>{opt}</span>
                    </div>
                  )
                })}
                {checked && q.explain ? <div className="rui-muted">{q.explain}</div> : null}
              </div>
            ))}
            {checked ? <div className="rui-muted">Score {score}/{questions.length}</div> : null}
          </div>
        </div>
      </div>
    </ReUI>
  )
}

function WriteBlock({ data, update, writable }: BlockProps) {
  const prompt = asText(data.prompt)
  const essay = asText(data.essay)
  const sample = asText(data.sample)
  const limit = asNum(data.limit, 250) || 250
  const seconds = asNum(data.seconds, 0)
  const running = data.running === true
  const showSample = data.showSample === true
  const count = words(essay)
  const [tick, setTick] = useState(seconds)

  useEffect(() => {
    setTick(seconds)
  }, [seconds])
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setTick((n: number) => n + 1), 1000)
    return () => clearInterval(t)
  }, [running])

  const mm = String(Math.floor(tick / 60)).padStart(2, '0')
  const ss = String(tick % 60).padStart(2, '0')

  return (
    <ReUI>
      <div className="en-shell" data-testid="english-write">
        <div className="en-head">
          <div>
            <h2>Writing</h2>
            <p>Cambridge Write & Improve · 命题 + 计时 + 字数</p>
          </div>
          <div className="rui-row">
            <span className="en-timer">{mm}:{ss}</span>
            <Button
              variant="outline"
              onClick={() => update({ running: !running, seconds: tick })}
            >
              {running ? '暂停' : '开始'}
            </Button>
            <Button variant="ghost" onClick={() => update({ showSample: !showSample })}>{showSample ? '藏范文' : '看范文'}</Button>
          </div>
        </div>
        <div className="en-pane">
          <div className="en-passage" style={{ marginBottom: 10 }}>{prompt}</div>
          <Textarea
            value={essay}
            disabled={!writable}
            placeholder="Write your essay here…"
            style={{ minHeight: 180 }}
            onChange={(e: { target: { value: string } }) => update({ essay: e.target.value })}
          />
          <div className="en-count">{count} / {limit} words</div>
          {showSample ? (
            <div className="en-passage" style={{ marginTop: 12, color: '#6d6d72' }}>
              <b>Sample</b>
              {'\n'}
              {sample}
            </div>
          ) : null}
        </div>
      </div>
    </ReUI>
  )
}

function TranslateBlock({ data, update, writable }: BlockProps) {
  const source = asText(data.source)
  const mine = asText(data.mine)
  const reference = asText(data.reference)
  const direction = asText(data.direction, 'en-zh')
  return (
    <ReUI>
      <div className="en-shell" data-testid="english-translate">
        <div className="en-head">
          <div>
            <h2>Translation</h2>
            <p>DeepL / CATTI 对照 · {direction === 'zh-en' ? '中 → 英' : '英 → 中'}</p>
          </div>
          {writable ? (
            <Button variant="outline" onClick={() => update({ direction: direction === 'zh-en' ? 'en-zh' : 'zh-en' })}>
              切换方向
            </Button>
          ) : null}
        </div>
        <div className="en-row3">
          <div className="en-col">
            <h4>Source</h4>
            {writable ? <Textarea value={source} style={{ minHeight: 160 }} onChange={(e: { target: { value: string } }) => update({ source: e.target.value })} /> : <div className="en-passage">{source}</div>}
          </div>
          <div className="en-col">
            <h4>Your version</h4>
            <Textarea value={mine} disabled={!writable} style={{ minHeight: 160 }} placeholder="译在这里" onChange={(e: { target: { value: string } }) => update({ mine: e.target.value })} />
          </div>
          <div className="en-col">
            <h4>Reference</h4>
            <div className="en-passage">{reference || '（无参考译文）'}</div>
          </div>
        </div>
      </div>
    </ReUI>
  )
}

function ChoiceBlock({ data, update }: BlockProps) {
  const title = asText(data.title, 'Multiple choice')
  const questions = Array.isArray(data.questions) ? (data.questions as ChoiceQ[]) : []
  const picks = (data.picks && typeof data.picks === 'object' ? data.picks : {}) as Record<string, number>
  const checked = data.checked === true
  const index = Math.min(questions.length - 1, Math.max(0, asNum(data.index, 0)))
  const q = questions[index]
  const score = questions.filter((item) => picks[item.id] === item.answer).length
  if (!q) {
    return (
      <ReUI>
        <div className="en-shell" data-testid="english-choice"><div className="en-pane">还没有题目</div></div>
      </ReUI>
    )
  }
  return (
    <ReUI>
      <div className="en-shell" data-testid="english-choice">
        <div className="en-head">
          <div>
            <h2>{title}</h2>
            <p>Quizlet / 机考选择 · {index + 1}/{questions.length}{checked ? ` · ${score}/${questions.length}` : ''}</p>
          </div>
          <div className="rui-row">
            <Button variant="ghost" disabled={index <= 0} onClick={() => update({ index: index - 1 })}>上一题</Button>
            <Button variant="ghost" disabled={index >= questions.length - 1} onClick={() => update({ index: index + 1 })}>下一题</Button>
            <Button onClick={() => update({ checked: true })}>Check</Button>
          </div>
        </div>
        <div className="en-pane">
          <div style={{ fontWeight: 650, fontSize: 16, marginBottom: 10 }}>{q.stem}</div>
          {q.options.map((opt, oi) => {
            const on = picks[q.id] === oi
            return (
              <div key={oi} className="en-opt" data-on={on} data-ok={checked && oi === q.answer} data-bad={checked && on && oi !== q.answer} onClick={() => update({ picks: { ...picks, [q.id]: oi }, checked: false })}>
                <span>{String.fromCharCode(65 + oi)}.</span>
                <span>{opt}</span>
              </div>
            )
          })}
          {checked && q.explain ? <div className="rui-muted" style={{ marginTop: 10 }}>{q.explain}</div> : null}
        </div>
      </div>
    </ReUI>
  )
}

function parseCloze(template: string): Array<{ text: string } | { blank: ClozeBlank }> {
  const out: Array<{ text: string } | { blank: ClozeBlank }> = []
  const re = /\{\{([^}]+)\}\}/g
  let last = 0
  let i = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(template))) {
    if (m.index > last) out.push({ text: template.slice(last, m.index) })
    out.push({ blank: { id: 'b' + i, answer: m[1].trim() } })
    i += 1
    last = m.index + m[0].length
  }
  if (last < template.length) out.push({ text: template.slice(last) })
  return out
}

function ClozeBlock({ data, update }: BlockProps) {
  const template = asText(data.template)
  const parts = useMemo(() => parseCloze(template), [template])
  const blanks = parts.filter((p): p is { blank: ClozeBlank } => 'blank' in p).map((p) => p.blank)
  const fills = (data.fills && typeof data.fills === 'object' ? data.fills : {}) as Record<string, string>
  const checked = data.checked === true
  const bank = Array.from(new Set(blanks.map((b) => b.answer)))
  const score = blanks.filter((b) => (fills[b.id] || '').trim().toLowerCase() === b.answer.toLowerCase()).length
  return (
    <ReUI>
      <div className="en-shell" data-testid="english-cloze">
        <div className="en-head">
          <div>
            <h2>Use of English</h2>
            <p>Cambridge cloze / Clozemaster</p>
          </div>
          <Button onClick={() => update({ checked: true })}>Check</Button>
        </div>
        <div className="en-pane">
          <div className="en-bank">
            {bank.map((w) => (
              <span key={w} className="en-chip">{w}</span>
            ))}
          </div>
          <div className="en-passage">
            {parts.map((part, i) =>
              'text' in part ? (
                <span key={i}>{part.text}</span>
              ) : (
                <input
                  key={part.blank.id}
                  className="en-blank"
                  value={fills[part.blank.id] ?? ''}
                  data-ok={checked && (fills[part.blank.id] || '').trim().toLowerCase() === part.blank.answer.toLowerCase()}
                  data-bad={checked && (fills[part.blank.id] || '').trim().toLowerCase() !== part.blank.answer.toLowerCase()}
                  onChange={(e: { target: { value: string } }) => update({ fills: { ...fills, [part.blank.id]: e.target.value }, checked: false })}
                />
              ),
            )}
          </div>
          {checked ? <div className="rui-muted" style={{ marginTop: 10 }}>Score {score}/{blanks.length}</div> : null}
        </div>
      </div>
    </ReUI>
  )
}

function SpeakBlock({ data, update, writable }: BlockProps) {
  const topic = asText(data.topic)
  const bullets = Array.isArray(data.bullets) ? (data.bullets as string[]) : []
  const prep = asNum(data.prep, 60)
  const speakFor = asNum(data.speakFor, 90)
  const phase = asText(data.phase, 'idle') as 'idle' | 'prep' | 'speak' | 'done'
  const leftStored = asNum(data.left, prep)
  const transcript = asText(data.transcript)
  const takes = Array.isArray(data.takes) ? (data.takes as Array<{ at: number; durationMs: number }>) : []
  const [left, setLeft] = useState(leftStored)

  useEffect(() => {
    setLeft(leftStored)
  }, [leftStored])
  useEffect(() => {
    if (phase !== 'prep' && phase !== 'speak') return
    const t = setInterval(() => {
      setLeft((n: number) => {
        if (n <= 1) {
          if (phase === 'prep') update({ phase: 'speak', left: speakFor })
          else update({ phase: 'done', left: 0, takes: [{ at: Date.now(), durationMs: speakFor * 1000 }, ...takes].slice(0, 8) })
          return 0
        }
        return n - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [phase, speakFor, takes, update])

  return (
    <ReUI>
      <div className="en-shell" data-testid="english-speak">
        <div className="en-head">
          <div>
            <h2>Speaking</h2>
            <p>IELTS cue card · ELSA · 准备 {prep}s / 陈述 {speakFor}s</p>
          </div>
          <div className="rui-row">
            <span className="en-timer">{phase === 'idle' ? `${prep}s` : `${left}s`}</span>
            {phase === 'idle' ? (
              <Button onClick={() => update({ phase: 'prep', left: prep })}>Start</Button>
            ) : (
              <Button variant="outline" onClick={() => update({ phase: 'idle', left: prep })}>Reset</Button>
            )}
          </div>
        </div>
        <div className="en-card">
          <h3>Describe {topic}</h3>
          <div className="rui-muted">You should say:</div>
          <ul>
            {bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
        <div className="en-pane">
          <div className="rui-muted" style={{ marginBottom: 6 }}>
            {phase === 'prep' ? '准备中，可做笔记' : phase === 'speak' ? '请开始说' : phase === 'done' ? '结束，写下转写' : '点 Start 倒计时'}
          </div>
          <Textarea
            value={transcript}
            disabled={!writable}
            placeholder="转写 / 笔记"
            style={{ minHeight: 100 }}
            onChange={(e: { target: { value: string } }) => update({ transcript: e.target.value })}
          />
          {takes.length ? <div className="rui-muted" style={{ marginTop: 8 }}>Takes {takes.length}</div> : null}
        </div>
      </div>
    </ReUI>
  )
}

const LISTEN = {
  title: 'Lecture: Urban bees',
  audioUrl: '',
  speed: 1,
  showScript: false,
  transcript: 'Today we will look at how cities can support honeybees. Parks, rooftops and even balconies provide forage. The key is a continuous bloom from spring to fall.',
  questions: [
    { id: 'q1', stem: 'What is the lecture mainly about?', options: ['Honey prices', 'Urban habitats for bees', 'Desert farming', 'Airline food'], answer: 1, explain: 'The speaker focuses on cities supporting bees.' },
    { id: 'q2', stem: 'What does the speaker say is key?', options: ['More sugar water', 'Continuous bloom', 'Indoor hives', 'Fewer parks'], answer: 1 },
  ],
  picks: {},
  checked: false,
}

const READ = {
  title: 'The value of boredom',
  passage: 'Boredom is often treated as a problem to be solved with a screen. Yet psychologists argue that unstructured time lets the mind wander, making room for memory consolidation and creative combination. In one study, people who sat quietly before a task generated more original ideas than those who filled the gap with puzzles.',
  questions: [
    { id: 'r1', stem: 'According to the passage, boredom can be useful because it', options: ['shortens memory', 'encourages mind-wandering', 'replaces sleep', 'increases screen time'], answer: 1, explain: 'Unstructured time lets the mind wander.' },
    { id: 'r2', stem: 'The study compared quiet sitting with', options: ['sleep', 'puzzles', 'exercise', 'lecture notes'], answer: 1 },
  ],
  picks: {},
  checked: false,
}

const WRITE = {
  prompt: 'Some people think students should learn practical skills at school, while others believe academic subjects are more important. Discuss both views and give your own opinion. Write at least 250 words.',
  essay: '',
  sample: 'Schools have always balanced the useful and the theoretical. Practical skills help graduates find work quickly, but academic subjects train the habits of reasoning that last longer than any single tool. In my view, a core of academic study should come first, with workshops as a complement rather than a replacement.',
  limit: 250,
  seconds: 0,
  running: false,
  showSample: false,
}

const TRANSLATE = {
  direction: 'en-zh',
  source: 'The city that is not busy with bees is poorer than it looks: fewer blossoms, weaker harvests, quieter summers.',
  mine: '',
  reference: '一座没有蜜蜂忙碌的城市，比看上去更贫瘠：花更少，收成更弱，夏天也更安静。',
}

const CHOICE = {
  title: 'Vocabulary',
  index: 0,
  checked: false,
  picks: {},
  questions: [
    { id: 'c1', stem: 'The findings were ____; nobody had expected such a large effect.', options: ['marginal', 'striking', 'stale', 'narrow'], answer: 1, explain: 'Striking = surprising and noticeable.' },
    { id: 'c2', stem: 'She gave a ____ account of the meeting.', options: ['cursory', 'curious', 'curved', 'cured'], answer: 0, explain: 'Cursory = brief and not detailed.' },
  ],
}

const CLOZE = {
  template: 'People who sit with {{boredom}} rather than a phone often find {{ideas}} arriving later, when the task actually begins.',
  fills: {},
  checked: false,
}

const SPEAK = {
  topic: 'a book you recently read',
  bullets: ['what the book was about', 'why you chose it', 'what you learned', 'and explain whether you would recommend it'],
  prep: 60,
  speakFor: 90,
  phase: 'idle',
  left: 60,
  transcript: '',
  takes: [],
}

export function apply(ctx: { pageEditor: { registerBlock: (spec: Record<string, unknown>) => void } }) {
  const blocks = [
    { kind: 'listen', label: '英语听力', hint: 'TOEFL/IELTS：音频调速 + 选择题', aliases: ['listen', '听力', 'listening'], defaults: () => LISTEN, View: ListenBlock },
    { kind: 'read', label: '英语阅读', hint: 'TOEFL Reading：左文右题', aliases: ['read', '阅读', 'reading'], defaults: () => READ, View: ReadBlock },
    { kind: 'write', label: '英语写作', hint: 'Write & Improve：计时作文', aliases: ['write', '写作', 'essay'], defaults: () => WRITE, View: WriteBlock },
    { kind: 'translate', label: '英语翻译', hint: 'DeepL/CATTI：三栏对照', aliases: ['translate', '翻译', 'catti'], defaults: () => TRANSLATE, View: TranslateBlock },
    { kind: 'choice', label: '英语选择', hint: 'Quizlet 式单选题', aliases: ['choice', '选择', 'mcq'], defaults: () => CHOICE, View: ChoiceBlock },
    { kind: 'cloze', label: '英语填空', hint: 'Cambridge cloze / Clozemaster', aliases: ['cloze', '填空', '完型'], defaults: () => CLOZE, View: ClozeBlock },
    { kind: 'speak', label: '英语口语', hint: 'IELTS cue card + 倒计时', aliases: ['speak', '口语', 'ielts'], defaults: () => SPEAK, View: SpeakBlock },
  ]
  for (const spec of blocks) {
    ctx.pageEditor.registerBlock({
      ...GROUP,
      plugin: name,
      assets: [],
      ...spec,
    })
  }
}
