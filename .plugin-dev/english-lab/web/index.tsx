/**
 * 英语练习块。版式跟竞品：Duolingo / TOEFL / Newsela / LingQ / DeepL / Write & Improve / 试译宝。
 * AI 走宿主 /api/english-lab/ai（内置 chat 模型），不要自配 key，不要 import @biu/*。
 */
import { Button, Input, ReUI, Textarea } from '@biu/reui'

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

type ChoiceQ = {
  id: string
  stem: string
  options: string[]
  answer: number | number[]
  explain?: string
  para?: number
  vocab?: string
  type?: 'mcq' | 'vocab' | 'insert' | 'multi'
  insert?: string
}

type ClozeAttempt = { at: number; fills: Record<string, string>; tried: string[]; ms: number; score: number; total: number }

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
function isMulti(answer: number | number[]) {
  return Array.isArray(answer)
}
function pickedOk(answer: number | number[], pick: unknown) {
  if (Array.isArray(answer)) {
    const got = Array.isArray(pick) ? pick.slice().sort().join(',') : ''
    return got === answer.slice().sort().join(',')
  }
  return pick === answer
}

async function askAi(prompt: string) {
  const res = await fetch('/api/english-lab/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: prompt }),
  })
  const json = (await res.json()) as { text?: string; error?: string }
  if (!res.ok) throw new Error(json.error || 'ai failed')
  return json.text || ''
}

function parseAiJson(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

type ScoreCard = { task: number; coherence: number; lexis: number; grammar: number; notes?: Record<string, string> }
type FixItem = { from: string; to: string; type?: string; why?: string }

function markClass(type: string) {
  if (type === 'spelling') return 'en-mark-s'
  if (type === 'lexis' || type === 'vocabulary') return 'en-mark-l'
  if (type === 'style') return 'en-mark-y'
  return 'en-mark-g'
}

function MarkedEssay({ essay, items, open, onOpen }: { essay: string; items: FixItem[]; open: number; onOpen: (i: number) => void }) {
  const parts: unknown[] = []
  let rest = essay
  items.forEach((item, i) => {
    const at = rest.indexOf(item.from)
    if (at < 0) return
    if (at > 0) parts.push(rest.slice(0, at))
    parts.push(
      <span key={i} className={markClass(item.type || 'grammar')} data-on={open === i} onClick={() => onOpen(i)}>
        {item.from}
      </span>,
    )
    rest = rest.slice(at + item.from.length)
  })
  parts.push(rest)
  return <div className="en-passage">{parts}</div>
}

function tokenize(s: string) {
  return s.trim().split(/\s+/).filter(Boolean)
}

function wordDiff(a: string, b: string) {
  const left = tokenize(a)
  const right = tokenize(b)
  const rightSet = new Map<string, number>()
  for (const w of right) rightSet.set(w.toLowerCase(), (rightSet.get(w.toLowerCase()) || 0) + 1)
  const used = new Map<string, number>()
  return {
    left: left.map((w) => {
      const k = w.toLowerCase()
      const n = used.get(k) || 0
      const ok = n < (rightSet.get(k) || 0)
      used.set(k, n + 1)
      return { w, kind: ok ? 'eq' : 'del' as const }
    }),
    right: right.map((w) => {
      const k = w.toLowerCase()
      const inLeft = left.filter((x) => x.toLowerCase() === k).length
      return { w, kind: inLeft ? 'eq' : 'add' as const }
    }),
  }
}

function speakWords(text: string, slow: boolean) {
  if (typeof speechSynthesis === 'undefined') return
  speechSynthesis.cancel()
  const parts = tokenize(text)
  if (!parts.length) return
  if (!slow) {
    const u = new SpeechSynthesisUtterance(text)
    speechSynthesis.speak(u)
    return
  }
  let i = 0
  const next = () => {
    if (i >= parts.length) return
    const u = new SpeechSynthesisUtterance(parts[i++])
    u.rate = 0.9
    u.onend = () => setTimeout(next, 260)
    speechSynthesis.speak(u)
  }
  next()
}

function ListenBlock({ data, update, writable }: BlockProps) {
  const audioUrl = asText(data.audioUrl)
  const title = asText(data.title, 'Listening')
  const transcript = asText(data.transcript)
  const mode = asText(data.mode, 'questions') === 'intensive' ? 'intensive' : 'questions'
  const useBank = data.useBank === true
  const questions = Array.isArray(data.questions) ? (data.questions as ChoiceQ[]) : []
  const picks = (data.picks && typeof data.picks === 'object' ? data.picks : {}) as Record<string, number>
  const checked = data.checked === true
  const qIndex = Math.min(Math.max(0, asNum(data.qIndex, 0)), Math.max(0, questions.length - 1))
  const marked = Array.isArray(data.marked) ? (data.marked as string[]) : []
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const q = questions[qIndex]

  const play = (slow: boolean) => {
    if (slow) {
      speakWords(transcript, true)
      return
    }
    if (audioUrl && audioRef.current) {
      audioRef.current.currentTime = 0
      void audioRef.current.play()
      return
    }
    speakWords(transcript, false)
  }

  const markWord = (w: string) => {
    const next = marked.includes(w) ? marked.filter((x) => x !== w) : [...marked, w]
    update({ marked: next })
  }

  const loopMarked = () => speakWords(marked.join(' '), true)

  useEffect(() => {
    if (!checked || mode !== 'questions' || !q) return
    const t = setTimeout(() => {
      if (qIndex < questions.length - 1) update({ qIndex: qIndex + 1, checked: false })
    }, 1200)
    return () => clearTimeout(t)
  }, [checked, mode, qIndex, q, questions.length, update])

  const bank = q ? [...q.options] : []

  return (
    <ReUI>
      <div className="en-shell" data-testid="english-listen">
        <div className="en-head">
          <div>
            <h2>{title}</h2>
            <p>Duolingo · Tap what you hear · {mode === 'intensive' ? '精听（圈生词循环）' : '理解题'}</p>
          </div>
          <div className="rui-row">
            <Button size="sm" variant={mode === 'questions' ? 'secondary' : 'ghost'} onClick={() => update({ mode: 'questions', checked: false })}>
              理解题
            </Button>
            <Button size="sm" variant={mode === 'intensive' ? 'secondary' : 'ghost'} onClick={() => update({ mode: 'intensive', checked: false })}>
              精听
            </Button>
            {writable ? (
              <Button size="sm" variant="ghost" onClick={() => update({ useBank: !useBank })}>
                {useBank ? '改打字' : '词库降级'}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="en-pane" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button type="button" className="en-speaker" aria-label="replay" onClick={() => play(false)}>
            ▶
          </button>
          <button type="button" className="en-turtle" aria-label="slow replay" onClick={() => play(true)}>
            🐢
          </button>
          <span className="rui-muted">无限重听 · 乌龟键是词间停顿，不是倍速</span>
          <audio ref={audioRef} src={audioUrl || undefined} preload="none" hidden />
        </div>
        {mode === 'questions' && q ? (
          <div className="en-pane" style={{ borderTop: 'var(--biu-stroke-width) solid var(--biu-color-border)' }}>
            <div className="rui-muted" style={{ marginBottom: 8 }}>
              {qIndex + 1}/{questions.length}
            </div>
            <div style={{ fontWeight: 650, marginBottom: 8 }}>{q.stem}</div>
            {useBank ? (
              <div className="en-bank">
                {bank.map((opt, oi) => (
                  <button
                    type="button"
                    key={oi}
                    className="en-chip"
                    data-on={picks[q.id] === oi}
                    onClick={() => update({ picks: { ...picks, [q.id]: oi }, checked: false })}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              q.options.map((opt, oi) => (
                <div
                  key={oi}
                  className="en-opt"
                  data-on={picks[q.id] === oi}
                  data-ok={checked && oi === q.answer}
                  data-bad={checked && picks[q.id] === oi && oi !== q.answer}
                  onClick={() => update({ picks: { ...picks, [q.id]: oi }, checked: false })}
                >
                  <span>{String.fromCharCode(65 + oi)}.</span>
                  <span>{opt}</span>
                </div>
              ))
            )}
            <div className="rui-row" style={{ marginTop: 10 }}>
              <Button onClick={() => update({ checked: true })}>Check</Button>
            </div>
            {checked ? (
              <div className="rui-muted" style={{ marginTop: 8 }}>
                正确写法：{typeof q.answer === 'number' ? q.options[q.answer] : q.options.filter((_, i) => (q.answer as number[]).includes(i)).join(' / ')}
              </div>
            ) : null}
          </div>
        ) : null}
        {mode === 'intensive' ? (
          <div className="en-pane" style={{ borderTop: 'var(--biu-stroke-width) solid var(--biu-color-border)' }}>
            <div className="rui-muted">点出没听清的词，再循环</div>
            <div className="en-mark" style={{ marginTop: 8 }}>
              {tokenize(transcript).map((w, i) => (
                <Button key={i} size="sm" variant={marked.includes(w) ? 'secondary' : 'outline'} data-on={marked.includes(w)} onClick={() => markWord(w)}>
                  {w}
                </Button>
              ))}
            </div>
            <div className="rui-row" style={{ marginTop: 10 }}>
              <Button onClick={loopMarked} disabled={!marked.length}>
                循环生词
              </Button>
              <Button variant="outline" onClick={() => update({ checked: true })}>
                Check 揭原文
              </Button>
            </div>
          </div>
        ) : null}
        {checked ? <div className="en-passage" style={{ padding: 16, borderTop: 'var(--biu-stroke-width) solid var(--biu-color-border)' }}>{transcript}</div> : null}
      </div>
    </ReUI>
  )
}

function ReadBlock({ data, update }: BlockProps) {
  const title = asText(data.title, 'Reading')
  const shortOn = data.useShort === true
  const passage = shortOn ? asText(data.shortPassage) || asText(data.passage) : asText(data.passage)
  const questions = Array.isArray(data.questions) ? (data.questions as ChoiceQ[]) : []
  const picks = (data.picks && typeof data.picks === 'object' ? data.picks : {}) as Record<string, unknown>
  const checked = data.checked === true
  const unlocked = data.unlocked === true
  const hiPara = asNum(data.hiPara, -1)
  const hiWord = asText(data.hiWord)
  const vocab = Array.isArray(data.vocab) ? (data.vocab as Array<{ word: string; def: string }>) : []
  const insertPick = asNum(data.insertPick, -1)
  const paneRef = useRef<HTMLDivElement | null>(null)
  const paras = passage.split(/\n\n+/)

  const onScroll = () => {
    const el = paneRef.current
    if (!el || unlocked) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 28) update({ unlocked: true })
  }
  useEffect(() => {
    const el = paneRef.current
    if (!el || unlocked) return
    if (el.scrollHeight <= el.clientHeight + 4) update({ unlocked: true })
  }, [passage, unlocked, update])

  const saveWord = (word: string) => {
    if (vocab.some((v) => v.word === word)) return
    update({ vocab: [...vocab, { word, def: '' }] })
    void askAi(`Give a one-line English definition for: ${word}`).then((def) => {
      update({ vocab: [...vocab, { word, def }] })
    }).catch(() => undefined)
  }

  const insertQ = questions.find((q) => q.type === 'insert')
  const squares = insertQ ? [0, 1, 2, 3] : []

  return (
    <ReUI>
      <div className="en-shell" data-testid="english-read">
        <div className="en-head">
          <div>
            <h2>{title}</h2>
            <p>TOEFL left/right · Newsela shorter · LingQ tap-word</p>
          </div>
          <div className="rui-row">
            <Button size="sm" variant="ghost" onClick={() => update({ useShort: !shortOn })}>
              {shortOn ? '原文难度' : '较短降级'}
            </Button>
            <Button onClick={() => update({ checked: true })}>Check</Button>
          </div>
        </div>
        <div className="en-split">
          <div className="en-pane" ref={paneRef} onScroll={onScroll} style={{ maxHeight: 420 }}>
            {paras.map((p, i) => (
              <p key={i} className="en-para en-passage" data-on={hiPara === i}>
                {insertQ && i === (insertQ.para ?? 0)
                  ? p.split(/(?<=\.)\s+/).flatMap((sent, si) => [
                      squares.includes(si) ? (
                        <span
                          key={'sq' + si}
                          className="en-sq"
                          data-on={insertPick === si}
                          onClick={() => update({ insertPick: si })}
                        />
                      ) : null,
                      <span key={'s' + si}>{sent} </span>,
                    ])
                  : tokenize(p).map((w, wi) => (
                      <span
                        key={wi}
                        className="en-word"
                        data-saved={vocab.some((v) => v.word === w)}
                        data-on={hiWord.toLowerCase() === w.toLowerCase()}
                        onClick={() => saveWord(w.replace(/[^\w'-]/g, ''))}
                      >
                        {w}{' '}
                      </span>
                    ))}
              </p>
            ))}
            {insertQ && insertPick >= 0 ? <div className="rui-muted">Inserted: {insertQ.insert}</div> : null}
          </div>
          <div className="en-pane" style={{ maxHeight: 420 }}>
            {!unlocked ? (
              <div className="en-lock">TOEFL：请先滚到文章末尾再作答</div>
            ) : (
              questions
                .filter((q) => q.type !== 'insert')
                .map((q, i) => {
                  const multi = q.type === 'multi' || isMulti(q.answer)
                  const pick = picks[q.id]
                  return (
                    <div className="en-q" key={q.id}>
                      <div
                        style={{ fontWeight: 650, marginBottom: 6, cursor: 'pointer' }}
                        onClick={() => update({ hiPara: q.para ?? 0, hiWord: q.vocab || '' })}
                      >
                        {i + 1}. {q.stem}
                      </div>
                      {q.options.map((opt, oi) => {
                        const on = multi ? Array.isArray(pick) && (pick as number[]).includes(oi) : pick === oi
                        return (
                          <div
                            key={oi}
                            className="en-opt"
                            data-on={on}
                            data-ok={checked && (multi ? (q.answer as number[]).includes(oi) : oi === q.answer)}
                            data-bad={checked && on && !(multi ? (q.answer as number[]).includes(oi) : oi === q.answer)}
                            onClick={() => {
                              if (multi) {
                                const cur = Array.isArray(pick) ? (pick as number[]) : []
                                const next = cur.includes(oi) ? cur.filter((x) => x !== oi) : [...cur, oi]
                                update({ picks: { ...picks, [q.id]: next }, hiPara: q.para ?? 0, hiWord: q.vocab || '' })
                              } else {
                                update({ picks: { ...picks, [q.id]: oi }, hiPara: q.para ?? 0, hiWord: q.vocab || '' })
                              }
                            }}
                          >
                            <span>{String.fromCharCode(65 + oi)}.</span>
                            <span>{opt}</span>
                          </div>
                        )
                      })}
                      {checked && q.explain ? <div className="rui-muted">{q.explain}</div> : null}
                    </div>
                  )
                })
            )}
            {vocab.length ? (
              <div className="rui-muted" style={{ marginTop: 12 }}>
                LingQ 生词：{vocab.map((v) => v.word + (v.def ? ` (${v.def})` : '')).join(' · ')}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </ReUI>
  )
}

function WriteBlock({ data, update, writable }: BlockProps) {
  const kind = asText(data.kind, 'essay')
  const prompt = asText(data.prompt)
  const chart = asText(data.chart)
  const essay = asText(data.essay)
  const outline = asText(data.outline)
  const sample = asText(data.sample)
  const prev = asText(data.prevEssay)
  const limit = asNum(data.limit, 250) || 250
  const outlineFirst = data.outlineFirst === true
  const showSample = data.showSample === true
  const compare = data.compare === true
  const tab = asText(data.aiTab, 'score') === 'fix' ? 'fix' : 'score'
  const scoreRaw = asText(data.aiScore)
  const fixRaw = asText(data.aiFix)
  const score = parseAiJson(scoreRaw) as ScoreCard | null
  const fix = parseAiJson(fixRaw)
  const items = Array.isArray(fix?.sentences) ? (fix?.sentences as FixItem[]) : []
  const rewrite = typeof fix?.rewrite === 'string' ? fix.rewrite : ''
  const count = words(essay)
  const over = count > 0 && count < limit
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState(-1)
  const openItem = items[open]

  const runScore = async () => {
    setBusy('score')
    try {
      const text = await askAi(
        `Return ONLY JSON: {"task":n,"coherence":n,"lexis":n,"grammar":n,"notes":{"task":"...","coherence":"...","lexis":"...","grammar":"..."}} with IELTS 0-9 scores for this ${kind}. Prompt:\n${prompt}\nText:\n${essay}`,
      )
      update({ aiScore: text, aiTab: 'score' })
    } catch (e) {
      update({ aiScore: JSON.stringify({ error: String(e) }), aiTab: 'score' })
    } finally {
      setBusy('')
    }
  }

  const runFix = async () => {
    setBusy('fix')
    try {
      const text = await askAi(
        `Return ONLY JSON: {"sentences":[{"from":"exact substring from the essay","to":"correction","type":"grammar|spelling|lexis|style","why":"one line"}],"rewrite":"full model answer"} for this ${kind}:\n${essay}`,
      )
      update({ aiFix: text, aiTab: 'fix' })
    } catch (e) {
      update({ aiFix: JSON.stringify({ error: String(e) }), aiTab: 'fix' })
    } finally {
      setBusy('')
    }
  }

  return (
    <ReUI>
      <div className="en-shell" data-testid="english-write">
        <div className="en-head">
          <div>
            <h2>Writing</h2>
            <p>Cambridge Write & Improve · Grammarly underlines · {kind}</p>
          </div>
          <div className="rui-row">
            {['essay', 'chart', 'email'].map((k) => (
              <Button key={k} size="sm" variant={kind === k ? 'secondary' : 'ghost'} onClick={() => update({ kind: k })}>
                {k}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => update({ outlineFirst: !outlineFirst })}>
              先提纲
            </Button>
          </div>
        </div>
        <div className="en-pane">
          <div className="en-passage" style={{ marginBottom: 10 }}>{prompt}</div>
          {kind === 'chart' && chart ? <pre className="rui-muted">{chart}</pre> : null}
          {outlineFirst ? (
            <Textarea value={outline} disabled={!writable} placeholder="Outline first…" style={{ minHeight: 80, marginBottom: 8 }} onChange={(e: { target: { value: string } }) => update({ outline: e.target.value })} />
          ) : null}
          <Textarea value={essay} disabled={!writable} placeholder="Write here…" style={{ minHeight: 140 }} onChange={(e: { target: { value: string } }) => update({ essay: e.target.value })} />
          <div className={over ? 'en-warn' : 'en-count'}>
            {count} / {limit} words{over ? ' — 未达最低字数' : ''}
          </div>
          <div className="rui-row" style={{ marginTop: 8 }}>
            <Button disabled={!!busy || !essay} onClick={() => void runScore()}>
              {busy === 'score' ? '评分中…' : 'AI 评分'}
            </Button>
            <Button variant="outline" disabled={!!busy || !essay} onClick={() => void runFix()}>
              {busy === 'fix' ? '批改中…' : '逐句批改'}
            </Button>
            <Button variant="ghost" onClick={() => update({ showSample: !showSample })}>
              {showSample ? '藏范文' : '看范文'}
            </Button>
            <Button variant="ghost" onClick={() => update({ compare: !compare, prevEssay: prev || essay })}>
              版本对比
            </Button>
          </div>
          <div className="rui-tabs" style={{ marginTop: 12 }}>
            <Button size="sm" variant={tab === 'score' ? 'secondary' : 'ghost'} onClick={() => update({ aiTab: 'score' })}>
              评分
            </Button>
            <Button size="sm" variant={tab === 'fix' ? 'secondary' : 'ghost'} onClick={() => update({ aiTab: 'fix' })}>
              批改
            </Button>
          </div>
          {tab === 'score' ? (
            score && typeof score.task === 'number' ? (
              <div className="en-rubric">
                {(
                  [
                    ['Task', score.task, score.notes?.task],
                    ['Coherence', score.coherence, score.notes?.coherence],
                    ['Lexis', score.lexis, score.notes?.lexis],
                    ['Grammar', score.grammar, score.notes?.grammar],
                  ] as Array<[string, number, string | undefined]>
                ).map(([label, n, note]) => (
                  <div key={label}>
                    <span className="rui-kicker">{label}</span>
                    <b>{n}</b>
                    {note ? <small>{note}</small> : null}
                  </div>
                ))}
              </div>
            ) : scoreRaw ? (
              <div className="en-passage" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{scoreRaw}</div>
            ) : (
              <div className="rui-muted" style={{ marginTop: 10 }}>Write & Improve：先写再点评分，四项分会排成卡片</div>
            )
          ) : (
            <div style={{ marginTop: 10 }}>
              {items.length ? (
                <>
                  <div className="rui-muted" style={{ marginBottom: 6 }}>Grammarly：点下划线看说明 · 红语法 蓝用词 金风格</div>
                  <MarkedEssay essay={essay} items={items} open={open} onOpen={setOpen} />
                  {openItem ? (
                    <div className="en-pop">
                      <div className="rui-kicker">{openItem.type || 'grammar'}</div>
                      <div>
                        <s>{openItem.from}</s> → <span className="en-to">{openItem.to}</span>
                      </div>
                      {openItem.why ? <div className="rui-muted">{openItem.why}</div> : null}
                    </div>
                  ) : null}
                  <div className="en-fix">
                    <div className="en-col">
                      <h4>Your sentence</h4>
                      {items.map((it, i) => (
                        <div key={i} className="en-q" onClick={() => setOpen(i)}>
                          <span className={markClass(it.type || 'grammar')}>{it.from}</span>
                        </div>
                      ))}
                    </div>
                    <div className="en-col">
                      <h4>Correction</h4>
                      {items.map((it, i) => (
                        <div key={i} className="en-q">
                          <span className="en-to">{it.to}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {rewrite ? (
                    <div className="en-passage" style={{ marginTop: 10 }}>
                      <h4 className="rui-kicker">Model rewrite</h4>
                      {rewrite}
                    </div>
                  ) : null}
                </>
              ) : fixRaw ? (
                <div className="en-passage" style={{ whiteSpace: 'pre-wrap' }}>{fixRaw}</div>
              ) : (
                <div className="rui-muted">点逐句批改后，原文会出现下划线</div>
              )}
            </div>
          )}
          {showSample ? <div className="en-passage rui-muted" style={{ marginTop: 10 }}>{sample}</div> : null}
          {compare && prev ? (
            <div className="en-passage" style={{ marginTop: 10 }}>
              {wordDiff(prev, essay).right.map((t, i) => (
                <span key={i} className={t.kind === 'add' ? 'en-diff-add' : 'en-diff-eq'}>
                  {t.w}{' '}
                </span>
              ))}
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
  const useBank = data.useBank === true
  const checked = data.checked === true
  const bank = useMemo(() => tokenize(reference), [reference])
  const diff = useMemo(() => wordDiff(mine, reference), [mine, reference])

  const swap = () => {
    update({
      direction: direction === 'zh-en' ? 'en-zh' : 'zh-en',
      source: reference,
      reference: source,
      mine: '',
      checked: false,
    })
  }

  return (
    <ReUI>
      <div className="en-shell" data-testid="english-translate">
        <div className="en-head">
          <div>
            <h2>Translation</h2>
            <p>Google 互换 · DeepL 对照 · 试译宝 Check 后揭参考 · {direction === 'zh-en' ? '中 → 英' : '英 → 中'}</p>
          </div>
          <div className="rui-row">
            {writable ? (
              <Button variant="outline" onClick={swap}>
                切换方向
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => update({ useBank: !useBank })}>
              {useBank ? '自由译' : '词库降级'}
            </Button>
            <Button onClick={() => update({ checked: true })}>Check</Button>
          </div>
        </div>
        <div className="en-row3">
          <div className="en-col">
            <h4>Source</h4>
            <div className="en-passage">{source}</div>
          </div>
          <div className="en-col">
            <h4>Your version</h4>
            {useBank ? (
              <div>
                <div className="en-bank">
                  {bank.map((w, i) => (
                    <button type="button" key={i} className="en-chip" onClick={() => update({ mine: (mine + ' ' + w).trim() })}>
                      {w}
                    </button>
                  ))}
                </div>
                <div className="en-passage">{mine || '点词组句'}</div>
              </div>
            ) : (
              <Textarea value={mine} disabled={!writable} style={{ minHeight: 160 }} placeholder="译在这里" onChange={(e: { target: { value: string } }) => update({ mine: e.target.value, checked: false })} />
            )}
          </div>
          <div className="en-col">
            <h4>Reference</h4>
            {checked ? (
              <div>
                <div className="en-passage">{reference || '（无参考译文）'}</div>
                <div style={{ marginTop: 8 }}>
                  {diff.left.map((t, i) => (
                    <span key={i} className={t.kind === 'del' ? 'en-diff-del' : 'en-diff-eq'}>
                      {t.w}{' '}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="en-lock">Check 后显示参考（有道先自译再对照）</div>
            )}
          </div>
        </div>
      </div>
    </ReUI>
  )
}

function ChoiceBlock({ data, update }: BlockProps) {
  const title = asText(data.title, 'Multiple choice')
  const questions = Array.isArray(data.questions) ? (data.questions as ChoiceQ[]) : []
  const picks = (data.picks && typeof data.picks === 'object' ? data.picks : {}) as Record<string, unknown>
  const checked = data.checked === true
  const index = Math.min(questions.length - 1, Math.max(0, asNum(data.index, 0)))
  const aiExplain = asText(data.aiExplain)
  const q = questions[index]
  const [busy, setBusy] = useState(false)
  if (!q) {
    return (
      <ReUI>
        <div className="en-shell" data-testid="english-choice">
          <div className="en-pane">还没有题目</div>
        </div>
      </ReUI>
    )
  }
  const multi = q.type === 'multi' || isMulti(q.answer)
  const pick = picks[q.id]
  const score = questions.filter((item) => pickedOk(item.answer, picks[item.id])).length

  const afterCheck = async () => {
    update({ checked: true })
    if (q.explain) return
    setBusy(true)
    try {
      const text = await askAi(`Explain why the correct option is right for: ${q.stem}\nOptions: ${q.options.join(' | ')}`)
      update({ aiExplain: text, checked: true })
    } catch (e) {
      update({ aiExplain: String(e), checked: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <ReUI>
      <div className="en-shell" data-testid="english-choice">
        <div className="en-head">
          <div>
            <h2>{title}</h2>
            <p>Quizlet · {multi ? '多选' : '单选'} · {index + 1}/{questions.length}{checked ? ` · ${score}/${questions.length}` : ''}</p>
          </div>
          <div className="rui-row">
            <Button variant="ghost" disabled={index <= 0} onClick={() => update({ index: index - 1, checked: false, aiExplain: '' })}>
              上一题
            </Button>
            <Button variant="ghost" disabled={index >= questions.length - 1} onClick={() => update({ index: index + 1, checked: false, aiExplain: '' })}>
              下一题
            </Button>
            <Button onClick={() => void afterCheck()} disabled={busy}>
              Check
            </Button>
          </div>
        </div>
        <div className="en-pane">
          <div style={{ fontWeight: 650, fontSize: 16, marginBottom: 10 }}>{q.stem}</div>
          {q.options.map((opt, oi) => {
            const on = multi ? Array.isArray(pick) && (pick as number[]).includes(oi) : pick === oi
            const ok = multi ? (q.answer as number[]).includes(oi) : oi === q.answer
            return (
              <div
                key={oi}
                className="en-opt"
                data-on={on}
                data-ok={checked && ok}
                data-bad={checked && on && !ok}
                onClick={() => {
                  if (multi) {
                    const cur = Array.isArray(pick) ? (pick as number[]) : []
                    const next = cur.includes(oi) ? cur.filter((x) => x !== oi) : [...cur, oi]
                    update({ picks: { ...picks, [q.id]: next }, checked: false })
                  } else {
                    update({ picks: { ...picks, [q.id]: oi }, checked: false })
                  }
                }}
              >
                <span>{String.fromCharCode(65 + oi)}.</span>
                <span>{opt}</span>
              </div>
            )
          })}
          {checked && (q.explain || aiExplain) ? <div className="rui-muted" style={{ marginTop: 10 }}>{q.explain || aiExplain}</div> : null}
        </div>
      </div>
    </ReUI>
  )
}

function parseCloze(template: string) {
  const out: Array<{ text: string } | { blank: { id: string; answer: string } }> = []
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
  const blanks = parts.filter((p): p is { blank: { id: string; answer: string } } => 'blank' in p).map((p) => p.blank)
  const fills = (data.fills && typeof data.fills === 'object' ? data.fills : {}) as Record<string, string>
  const checked = data.checked === true
  const started = asNum(data.startedAt, 0)
  const history = Array.isArray(data.history) ? (data.history as ClozeAttempt[]) : []
  const bank = Array.from(new Set(blanks.map((b) => b.answer)))
  const score = blanks.filter((b) => (fills[b.id] || '').trim().toLowerCase() === b.answer.toLowerCase()).length

  useEffect(() => {
    if (!started) update({ startedAt: Date.now() })
  }, [started, update])

  const check = () => {
    const ms = Date.now() - (started || Date.now())
    const tried = blanks.map((b) => fills[b.id] || '')
    const attempt: ClozeAttempt = { at: Date.now(), fills: { ...fills }, tried, ms, score, total: blanks.length }
    update({ checked: true, history: [attempt, ...history].slice(0, 20) })
  }

  return (
    <ReUI>
      <div className="en-shell" data-testid="english-cloze">
        <div className="en-head">
          <div>
            <h2>Use of English</h2>
            <p>Cambridge cloze / Clozemaster · 词库 + 作答历史</p>
          </div>
          <Button onClick={check}>Check</Button>
        </div>
        <div className="en-pane">
          <div className="en-bank">
            {bank.map((w) => (
              <span key={w} className="en-chip">
                {w}
              </span>
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
          {checked ? (
            <div className="rui-muted" style={{ marginTop: 10 }}>
              Score {score}/{blanks.length}
            </div>
          ) : null}
          <table className="en-hist">
            <thead>
              <tr>
                <th>时间</th>
                <th>试填</th>
                <th>用时</th>
                <th>结果</th>
              </tr>
            </thead>
            <tbody>
              {history.length ? (
                history.map((h) => (
                  <tr key={h.at}>
                    <td>{new Date(h.at).toLocaleTimeString()}</td>
                    <td>{h.tried.join(', ')}</td>
                    <td>{Math.round(h.ms / 1000)}s</td>
                    <td>
                      {h.score}/{h.total}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="rui-muted">
                    还没有作答记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
  const aiText = asText(data.aiText)
  const [left, setLeft] = useState(leftStored)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setLeft(leftStored)
  }, [leftStored])
  useEffect(() => {
    if (phase !== 'prep' && phase !== 'speak') return
    const t = setInterval(() => {
      setLeft((n: number) => {
        if (n <= 1) {
          if (phase === 'prep') update({ phase: 'speak', left: speakFor })
          else update({ phase: 'done', left: 0 })
          return 0
        }
        return n - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [phase, speakFor, update])

  const score = async () => {
    setBusy(true)
    try {
      const text = await askAi(`Score this IELTS cue-card transcript 0-9 for Fluency, Vocabulary, Grammar, Relevance. Topic: ${topic}\n${transcript}`)
      update({ aiText: text })
    } catch (e) {
      update({ aiText: String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <ReUI>
      <div className="en-shell" data-testid="english-speak">
        <div className="en-head">
          <div>
            <h2>Speaking</h2>
            <p>IELTS cue card · 转写评分，不录音</p>
          </div>
          <div className="rui-row">
            <span className="en-timer">{phase === 'idle' ? `${prep}s` : `${left}s`}</span>
            {phase === 'idle' ? (
              <Button onClick={() => update({ phase: 'prep', left: prep })}>Start</Button>
            ) : (
              <Button variant="outline" onClick={() => update({ phase: 'idle', left: prep })}>
                Reset
              </Button>
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
          <Textarea value={transcript} disabled={!writable} placeholder="转写 / 笔记" style={{ minHeight: 100 }} onChange={(e: { target: { value: string } }) => update({ transcript: e.target.value })} />
          <div className="rui-row" style={{ marginTop: 8 }}>
            <Button disabled={busy || !transcript} onClick={() => void score()}>
              AI 评分转写
            </Button>
          </div>
          {aiText ? <div className="en-passage" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{aiText}</div> : null}
        </div>
      </div>
    </ReUI>
  )
}

const LISTEN = {
  title: 'Lecture: Urban bees',
  audioUrl: '',
  mode: 'questions',
  useBank: false,
  qIndex: 0,
  marked: [],
  transcript: 'Today we will look at how cities can support honeybees. Parks rooftops and even balconies provide forage. The key is a continuous bloom from spring to fall.',
  questions: [
    { id: 'q1', stem: 'What is the lecture mainly about?', options: ['Honey prices', 'Urban habitats for bees', 'Desert farming', 'Airline food'], answer: 1 },
    { id: 'q2', stem: 'What does the speaker say is key?', options: ['More sugar water', 'Continuous bloom', 'Indoor hives', 'Fewer parks'], answer: 1 },
  ],
  picks: {},
  checked: false,
}

const READ = {
  title: 'The value of boredom',
  passage:
    'Boredom is often treated as a problem to be solved with a screen. Yet psychologists argue that unstructured time lets the mind wander, making room for memory consolidation and creative combination.\n\nIn one study, people who sat quietly before a task generated more original ideas than those who filled the gap with puzzles. The difference was not extra knowledge, but extra space.',
  shortPassage: 'Boredom can help the mind wander and make more original ideas.\n\nA study compared quiet sitting with puzzles.',
  useShort: false,
  unlocked: false,
  hiPara: -1,
  hiWord: '',
  vocab: [],
  insertPick: -1,
  questions: [
    { id: 'r1', stem: 'According to the passage, boredom can be useful because it', options: ['shortens memory', 'encourages mind-wandering', 'replaces sleep', 'increases screen time'], answer: 1, para: 0, explain: 'Unstructured time lets the mind wander.' },
    { id: 'r2', type: 'vocab', stem: 'The word “unstructured” in paragraph 1 is closest in meaning to', options: ['rigid', 'without a fixed plan', 'noisy', 'expensive'], answer: 1, para: 0, vocab: 'unstructured' },
    { id: 'r3', type: 'insert', stem: 'Insert the sentence', insert: 'That pause matters more than another quiz.', para: 1, options: [], answer: 0 },
    { id: 'r4', type: 'multi', stem: 'Which of the following are mentioned as benefits? (多选)', options: ['memory consolidation', 'creative combination', 'higher screen time', 'more original ideas'], answer: [0, 1, 3], para: 0 },
  ],
  picks: {},
  checked: false,
}

const WRITE = {
  kind: 'essay',
  prompt: 'Some people think students should learn practical skills at school, while others believe academic subjects are more important. Discuss both views and give your own opinion. Write at least 250 words.',
  chart: 'Year | Practical % | Academic %\n2010 | 40 | 60\n2020 | 55 | 45',
  essay: 'Practical skills help graduates find work quickly, but academic subjects train reasoning. A core of academic study should come first.',
  outline: '',
  outlineFirst: false,
  sample: 'Schools have always balanced the useful and the theoretical.',
  limit: 250,
  prevEssay: '',
  compare: false,
  showSample: false,
  aiTab: 'score',
  aiScore: '{"task":7,"coherence":7,"lexis":6,"grammar":6,"notes":{"task":"Addresses both views with a clear opinion.","coherence":"Paragraphs follow a simple but clear order.","lexis":"Some repetition; try more precise verbs.","grammar":"A few article and agreement slips."}}',
  aiFix: '{"sentences":[{"from":"Practical skills help graduates find work quickly","to":"Practical skills help graduates find work more quickly","type":"grammar","why":"Adverb placement."},{"from":"academic subjects train reasoning","to":"academic subjects train habits of reasoning","type":"lexis","why":"More precise collocation."}],"rewrite":"Schools should keep a core of academic study and add workshops as a complement, not a replacement."}',
}

const TRANSLATE = {
  direction: 'en-zh',
  source: 'The city that is not busy with bees is poorer than it looks: fewer blossoms, weaker harvests, quieter summers.',
  mine: '',
  reference: '一座没有蜜蜂忙碌的城市，比看上去更贫瘠：花更少，收成更弱，夏天也更安静。',
  checked: false,
  useBank: false,
}

const CHOICE = {
  title: 'Vocabulary',
  index: 0,
  checked: false,
  picks: {},
  aiExplain: '',
  questions: [
    { id: 'c1', stem: 'The findings were ____; nobody had expected such a large effect.', options: ['marginal', 'striking', 'stale', 'narrow'], answer: 1, explain: 'Striking = surprising and noticeable.' },
    { id: 'c2', type: 'multi', stem: 'Which words can mean “brief and not detailed”? (多选)', options: ['cursory', 'sketchy', 'exhaustive', 'thorough'], answer: [0, 1] },
  ],
}

const CLOZE = {
  template: 'People who sit with {{boredom}} rather than a phone often find {{ideas}} arriving later, when the task actually begins.',
  fills: {},
  checked: false,
  startedAt: 0,
  history: [
    { at: Date.now() - 60000, fills: { b0: 'boredom', b1: 'ideas' }, tried: ['boredom', 'ideas'], ms: 18000, score: 2, total: 2 },
  ] as ClozeAttempt[],
}

const SPEAK = {
  topic: 'a book you recently read',
  bullets: ['what the book was about', 'why you chose it', 'what you learned', 'and explain whether you would recommend it'],
  prep: 60,
  speakFor: 90,
  phase: 'idle',
  left: 60,
  transcript: '',
  aiText: '',
}

export function apply(ctx: { pageEditor: { registerBlock: (spec: Record<string, unknown>) => void } }) {
  const blocks = [
    { kind: 'listen', label: '英语听力', hint: 'Duolingo 喇叭+乌龟 · 理解题/精听', aliases: ['listen', '听力', 'listening'], defaults: () => LISTEN, View: ListenBlock },
    { kind: 'read', label: '英语阅读', hint: 'TOEFL 左文右题 · 滚到底解锁', aliases: ['read', '阅读', 'reading'], defaults: () => READ, View: ReadBlock },
    { kind: 'write', label: '英语写作', hint: 'Write & Improve 评分', aliases: ['write', '写作', 'essay'], defaults: () => WRITE, View: WriteBlock },
    { kind: 'translate', label: '英语翻译', hint: '互换源/参考 · Check 揭参考', aliases: ['translate', '翻译', 'catti'], defaults: () => TRANSLATE, View: TranslateBlock },
    { kind: 'choice', label: '英语选择', hint: '单选+多选 · Check 后 AI 解释', aliases: ['choice', '选择', 'mcq'], defaults: () => CHOICE, View: ChoiceBlock },
    { kind: 'cloze', label: '英语填空', hint: '词库 + 作答历史', aliases: ['cloze', '填空', '完型'], defaults: () => CLOZE, View: ClozeBlock },
    { kind: 'speak', label: '英语口语', hint: '倒计时+转写 AI 分', aliases: ['speak', '口语', 'ielts'], defaults: () => SPEAK, View: SpeakBlock },
  ]
  for (const spec of blocks) {
    ctx.pageEditor.registerBlock({ ...GROUP, plugin: name, assets: [], ...spec })
  }
}
