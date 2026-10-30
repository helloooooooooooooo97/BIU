import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { WrenchScrewdriverIcon, XMarkIcon } from '@heroicons/react/16/solid'
import { CellMulti } from '@biu/database-ui'
import { normalizeSchemaValue, type CollectionSchemaPack, type SchemaFieldValue } from '@biu/type-file-system'
import {
  bindSessionView,
  type SessionViewService,
} from './index.ts'
import { ChatOutlineFilterFields } from './chat-outline-fields.tsx'

type ToolSourceId = 'minimal' | 'db' | 'plugin' | 'store'
type AgentMode = 'standard' | 'file' | 'minimal'
type ChatProvider = 'deepseek' | 'openai'

interface InspectorTool {
  name: string
  description: string
  source: ToolSourceId
  active: boolean
  configurable: boolean
}

interface InspectorSource {
  id: ToolSourceId
  label: string
  description: string
}

interface SessionConfigFields {
  title?: string
  provider?: ChatProvider
  model?: string
  systemPrompt?: string
  agentMode?: AgentMode
  extraTools?: string[]
  facet?: SchemaFieldValue
  pinned?: boolean
  autoCompactInputTokens?: number
}

interface InspectorPayload {
  sessionId: string
  title?: string | null
  agentMode: AgentMode
  extraTools: string[]
  defaults?: SessionConfigFields & { agentMode: AgentMode; extraTools: string[]; provider: ChatProvider; model: string; systemPrompt: string }
  config?: SessionConfigFields | null
  effective?: SessionConfigFields & { agentMode: AgentMode; extraTools: string[]; provider: ChatProvider; model: string; systemPrompt: string }
  sources: InspectorSource[]
  tools: InspectorTool[]
  contextWindow?: '200k' | '1m'
  contextWindowTokens?: number
}

const fieldClass =
  'rounded-lg border border-(--biu-color-border) bg-(--biu-color-surface) px-2 py-1.5 text-[12px] text-(--biu-color-text) outline-none'

function slugFacetId(label: string, used: Set<string>) {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'facet'
  let id = /^[a-z]/.test(base) ? base : `f-${base}`
  let n = 2
  while (used.has(id) || !/^[a-z][a-z0-9-]{0,31}$/.test(id)) {
    id = `${base.slice(0, 20)}-${n}`
    if (!/^[a-z]/.test(id)) id = `f-${id}`
    n += 1
  }
  return id
}

function SessionFacetPicker({
  value,
  disabled,
  onChange,
}: {
  value: unknown
  disabled?: boolean
  onChange: (next: SchemaFieldValue) => void
}) {
  const parsed = normalizeSchemaValue(value)
  const [catalog, setCatalog] = useState<CollectionSchemaPack[]>([])

  useEffect(() => {
    let cancelled = false
    void fetch('/api/db/facets')
      .then((res) => res.json())
      .then((body: { facets?: CollectionSchemaPack[] }) => {
        if (cancelled || !Array.isArray(body.facets)) return
        setCatalog(body.facets)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  function applyTags(nextIds: string[]) {
    let packs = catalog
    const used = new Set(packs.map((tag) => tag.id))
    const resolved: string[] = []
    for (const item of nextIds) {
      if (used.has(item)) {
        resolved.push(item)
        continue
      }
      const hit = packs.find((tag) => tag.label === item)
      if (hit) {
        resolved.push(hit.id)
        continue
      }
      const id = slugFacetId(item, used)
      packs = [...packs, { id, label: item, fields: [] }]
      used.add(id)
      resolved.push(id)
    }
    const apply = () => {
      const keep = new Set(resolved)
      const values: SchemaFieldValue['values'] = {}
      for (const id of resolved) values[id] = parsed.values[id] ?? {}
      for (const [id, bag] of Object.entries(parsed.values)) {
        if (keep.has(id)) values[id] = bag
      }
      onChange({ tags: resolved, values })
    }
    if (packs !== catalog) {
      void fetch('/api/db/facets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ facets: packs }),
      })
        .then((res) => {
          if (!res.ok) return
          setCatalog(packs)
          apply()
        })
        .catch(() => undefined)
      return
    }
    apply()
  }

  return (
    <div className={disabled ? 'pointer-events-none opacity-50' : undefined}>
      <CellMulti
        values={parsed.tags}
        options={catalog.map((tag) => ({ value: tag.id, label: tag.label }))}
        onChange={applyTags}
        multiple
        placeholder="添加标签"
      />
    </div>
  )
}

export type SessionConfigDialogProps = {
  open: boolean
  onClose: () => void
  useSessionView: ReturnType<typeof bindSessionView>
  sessionView: SessionViewService
}

export const SessionConfigDialog = memo(function SessionConfigDialog({
  open,
  onClose,
  useSessionView,
  sessionView,
}: SessionConfigDialogProps) {
  const sessionId = useSessionView((state) => state.sessionId)
  const [data, setData] = useState<InspectorPayload | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [promptDraft, setPromptDraft] = useState('')
  const [compactDraft, setCompactDraft] = useState('')
  const titleFocusedRef = useRef(false)
  const promptFocusedRef = useRef(false)
  const compactFocusedRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!sessionId || !open) return
    try {
      const res = await fetch(`/api/agents/${sessionId}/inspector`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as InspectorPayload
      setData(body)
      if (!titleFocusedRef.current) setTitleDraft(body.config?.title ?? '')
      if (!promptFocusedRef.current) {
        setPromptDraft(
          typeof body.config?.systemPrompt === 'string'
            ? body.config.systemPrompt
            : (body.defaults?.systemPrompt ?? ''),
        )
      }
      if (!compactFocusedRef.current) {
        const cap = body.contextWindowTokens && body.contextWindowTokens > 0 ? body.contextWindowTokens : 200_000
        const tokens = body.config?.autoCompactInputTokens
        setCompactDraft(String(tokens && tokens > 0 ? Math.min(tokens, cap) : cap))
      }
      setError('')
    } catch (err) {
      setError(String(err))
    }
  }, [sessionId, open])

  // 打开时刷新一次，并在打开期间轮询保持同步
  useEffect(() => {
    if (!open) return
    void refresh()
    const timer = window.setInterval(() => {
      void refresh()
    }, 2000)
    return () => window.clearInterval(timer)
  }, [open, sessionId, refresh])

  async function patchSessionConfig(patch: Record<string, unknown>) {
    if (!sessionId) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/agents/${sessionId}/config`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(`保存失败 HTTP ${res.status}`)
      await refresh()
      void sessionView.refreshSessions({ refresh: true })
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  function toggleExtra(name: string, checked: boolean) {
    const current = data?.effective?.extraTools ?? data?.extraTools ?? []
    const next = checked
      ? [...new Set([...current, name])]
      : current.filter((item) => item !== name)
    void patchSessionConfig({ extraTools: next, agentMode: 'minimal' })
  }

  if (!open) return null

  const defaults = data?.defaults
  const effective = data?.effective
  const sources = data?.sources ?? []
  const tools = data?.tools ?? []

  return (
    <div
      className="biu-float-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="代理配置"
      data-testid="session-config-dialog"
    >
      <div
        className="biu-float max-h-[min(72vh,640px)] w-[min(560px,calc(100vw-32px))]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="biu-float-head">
          <h2 className="biu-float-title">配置</h2>
          <button
            type="button"
            className="biu-float-close"
            title="关闭"
            aria-label="关闭"
            onClick={onClose}
          >
            <XMarkIcon className="size-4 shrink-0" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {error ? (
            <div className="mb-2 rounded-lg bg-(color-mix(in_srgb,#c44_16%,transparent)) p-2 text-[11px] text-[#f08888]">
              {error}
            </div>
          ) : null}
          {!sessionId ? (
            <div className="text-[11px] leading-[1.45] text-(--biu-color-text-subtle)">打开代理后可编辑配置。</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <p className="m-0 text-[11px] leading-[1.45] text-(--biu-color-text-subtle)">
                名称、提示词和工具只作用于当前 session；未改的字段沿用全局默认。
              </p>

              <ChatOutlineFilterFields />

              <label className="flex flex-col gap-1 text-[11px] text-(--biu-color-text-subtle)">
                <span>名称</span>
                <input
                  className={fieldClass}
                  value={titleDraft}
                  placeholder={defaults?.title || '未命名（用最近消息推导）'}
                  disabled={busy}
                  data-testid="config-session-title"
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onFocus={() => {
                    titleFocusedRef.current = true
                  }}
                  onBlur={() => {
                    titleFocusedRef.current = false
                    const next = titleDraft.trim()
                    const prev = data?.config?.title ?? ''
                    if (next === prev) return
                    void patchSessionConfig({ title: next || null })
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    ;(event.target as HTMLInputElement).blur()
                  }}
                />
              </label>

              <label className="flex flex-col gap-1 text-[11px] text-(--biu-color-text-subtle)">
                <span>标签 · 侧栏可按标签分组</span>
                <SessionFacetPicker
                  value={data?.config?.facet}
                  disabled={busy}
                  onChange={(facet) => void patchSessionConfig({ facet })}
                />
              </label>

              <label className="flex flex-col gap-1 text-[11px] text-(--biu-color-text-subtle)">
                <span>系统提示词</span>
                <textarea
                  className={`${fieldClass} min-h-[88px] resize-y font-mono text-[11px] leading-[1.45]`}
                  value={promptDraft}
                  disabled={busy}
                  data-testid="config-system-prompt"
                  onChange={(event) => setPromptDraft(event.target.value)}
                  onFocus={() => {
                    promptFocusedRef.current = true
                  }}
                  onBlur={() => {
                    promptFocusedRef.current = false
                    const prev =
                      typeof data?.config?.systemPrompt === 'string'
                        ? data.config.systemPrompt
                        : (defaults?.systemPrompt ?? '')
                    if (promptDraft === prev) return
                    void patchSessionConfig({ systemPrompt: promptDraft })
                  }}
                />
              </label>

              <label className="flex flex-col gap-1 text-[11px] text-(--biu-color-text-subtle)">
                <span>自动压缩上限（输入 token）</span>
                <input
                  className={fieldClass}
                  inputMode="numeric"
                  value={compactDraft}
                  disabled={busy}
                  data-testid="config-auto-compact"
                  onChange={(event) => setCompactDraft(event.target.value.replace(/[^\d]/g, ''))}
                  onFocus={() => {
                    compactFocusedRef.current = true
                  }}
                  onBlur={() => {
                    compactFocusedRef.current = false
                    const cap = data?.contextWindowTokens && data.contextWindowTokens > 0 ? data.contextWindowTokens : 200_000
                    const raw = compactDraft.trim() ? Number(compactDraft) : cap
                    const next = Number.isFinite(raw) ? Math.min(Math.max(1, Math.floor(raw)), cap) : cap
                    setCompactDraft(String(next))
                    const prev = data?.config?.autoCompactInputTokens
                    if (prev === next) return
                    void patchSessionConfig({ autoCompactInputTokens: next })
                  }}
                />
                <span>
                  关不掉，只能改上限。当前模型上下文 {data?.contextWindowTokens ?? 200000} token，上限不能超过它。
                </span>
              </label>

              <div className="flex flex-col gap-px">
                {sources.map((source) => (
                  <div key={source.id} className="rounded-lg px-2 py-1.5 hover:bg-(--biu-color-bg-hover)">
                    <div className="text-[11px] font-semibold text-(--biu-color-text-muted)">{source.label}</div>
                    <div className="mt-0.5 text-[11px] leading-[1.4] text-(--biu-color-text-subtle)">
                      {source.description}
                    </div>
                  </div>
                ))}
              </div>

              <ul className="m-0 flex list-none flex-col gap-px p-0" data-testid="config-tools">
                {tools.map((tool) => (
                  <li
                    key={tool.name}
                    className={`relative box-border flex h-[30px] min-h-[30px] w-full items-center gap-2 rounded-lg border-0 px-2 py-[5px] text-[12px] font-medium leading-[1.2] transition-none hover:bg-(--biu-color-bg-hover) hover:text-(--biu-color-text) ${
                      tool.active ? 'text-(--biu-color-text)' : 'text-(--biu-color-text-muted)'
                    }`}
                    data-tool={tool.name}
                    title={tool.description || tool.name}
                  >
                    {tool.configurable ? (
                      <input
                        type="checkbox"
                        className="m-0 size-3.5 shrink-0 accent-(--biu-color-text)"
                        checked={(effective?.extraTools ?? data?.extraTools ?? []).includes(tool.name)}
                        disabled={busy}
                        aria-label={`启用 ${tool.name}`}
                        onChange={(event) => toggleExtra(tool.name, event.target.checked)}
                      />
                    ) : (
                      <span
                        className={`grid size-4 shrink-0 place-items-center ${
                          tool.active ? 'text-(--biu-color-text)' : 'text-(--biu-color-text-subtle)'
                        }`}
                        aria-hidden
                      >
                        <WrenchScrewdriverIcon className="size-3.5" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium">{tool.name}</span>
                    <span className="shrink-0 text-[10px] font-medium text-(--biu-color-text-subtle)">
                      {sources.find((item) => item.id === tool.source)?.label ?? tool.source}
                    </span>
                    <span
                      className={`ml-auto shrink-0 text-[10px] font-semibold ${
                        tool.active ? 'text-(--biu-color-ok,#448361)' : 'text-(--biu-color-text-subtle)'
                      }`}
                    >
                      {tool.active ? '可用' : '未开'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
