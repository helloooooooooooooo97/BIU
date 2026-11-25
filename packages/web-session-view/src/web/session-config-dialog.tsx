import { apiFetch } from '@biu/biu-ui/api-client'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { WrenchScrewdriverIcon, XMarkIcon } from '@heroicons/react/16/solid'
import { CellMulti } from '@biu/biu-ui/db-ui'
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
  tag?: SchemaFieldValue
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

function slugTagId(label: string, used: Set<string>) {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'tag'
  let id = /^[a-z]/.test(base) ? base : `f-${base}`
  let n = 2
  while (used.has(id) || !/^[a-z][a-z0-9-]{0,31}$/.test(id)) {
    id = `${base.slice(0, 20)}-${n}`
    if (!/^[a-z]/.test(id)) id = `f-${id}`
    n += 1
  }
  return id
}

function SessionTagPicker({
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
    void apiFetch('/api/db/tags')
      .then((res) => res.json())
      .then((body: { tags?: CollectionSchemaPack[] }) => {
        if (cancelled || !Array.isArray(body.tags)) return
        setCatalog(body.tags)
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
      const id = slugTagId(item, used)
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
      void apiFetch('/api/db/tags', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tags: packs }),
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
      const res = await apiFetch(`/api/agents/${sessionId}/inspector`)
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
      const res = await apiFetch(`/api/agents/${sessionId}/config`, {
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
  const tools = data?.tools ?? []
  const activeToolCount = tools.filter((tool) => tool.active).length
  const contextCap = data?.contextWindowTokens && data.contextWindowTokens > 0 ? data.contextWindowTokens : 200_000

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
        className="biu-float scfg-float"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="biu-float-head scfg-head">
          <h2 className="biu-float-title scfg-title">会话配置</h2>
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
        <div className="scfg-body">
          {error ? (
            <div className="scfg-error" role="alert">
              {error}
            </div>
          ) : null}
          {!sessionId ? (
            <div className="scfg-hint">打开会话后可编辑配置。</div>
          ) : (
            <div className="scfg-sections">
              <div className="scfg-section">
                <label className="scfg-field">
                  <span className="scfg-label">名称</span>
                  <input
                    className="scfg-input"
                    value={titleDraft}
                    placeholder={defaults?.title || '未命名（自动推导）'}
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

                <div className="scfg-field">
                  <span className="scfg-label">标签</span>
                  <div className="scfg-tag-box">
                    <SessionTagPicker
                      value={data?.config?.tag}
                      disabled={busy}
                      onChange={(tag) => void patchSessionConfig({ tag })}
                    />
                  </div>
                </div>

                <label className="scfg-field">
                  <span className="scfg-label">系统提示词</span>
                  <textarea
                    className="scfg-textarea"
                    value={promptDraft}
                    placeholder="为当前会话设置专属系统提示词"
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
              </div>

              <div className="scfg-section">
                <ChatOutlineFilterFields />

                <label className="scfg-row">
                  <div className="scfg-row-copy">
                    <span className="scfg-label">自动压缩上限</span>
                    <span className="scfg-hint">
                      不超过当前模型上下文（{contextCap.toLocaleString()} token）
                    </span>
                  </div>
                  <input
                    className="scfg-input scfg-input-compact"
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
                      const raw = compactDraft.trim() ? Number(compactDraft) : contextCap
                      const next = Number.isFinite(raw) ? Math.min(Math.max(1, Math.floor(raw)), contextCap) : contextCap
                      setCompactDraft(String(next))
                      const prev = data?.config?.autoCompactInputTokens
                      if (prev === next) return
                      void patchSessionConfig({ autoCompactInputTokens: next })
                    }}
                  />
                </label>
              </div>

              {tools.length > 0 ? (
                <div className="scfg-section">
                  <div className="scfg-tools-head">
                    <span className="scfg-label">工具</span>
                    <span className="scfg-hint">{activeToolCount} / {tools.length} 可用</span>
                  </div>
                  <ul className="scfg-tools-list" data-testid="config-tools">
                    {tools.map((tool) => (
                      <li
                        key={tool.name}
                        className={`scfg-tool-row${tool.active ? ' is-active' : ''}`}
                        data-tool={tool.name}
                        title={tool.description || tool.name}
                      >
                        {tool.configurable ? (
                          <input
                            type="checkbox"
                            className="scfg-tool-check"
                            checked={(effective?.extraTools ?? data?.extraTools ?? []).includes(tool.name)}
                            disabled={busy}
                            aria-label={`启用 ${tool.name}`}
                            onChange={(event) => toggleExtra(tool.name, event.target.checked)}
                          />
                        ) : (
                          <span className="scfg-tool-icon" aria-hidden>
                            <WrenchScrewdriverIcon className="size-3.5" />
                          </span>
                        )}
                        <span className="scfg-tool-name">{tool.name}</span>
                        <span className={`scfg-tool-status${tool.active ? ' is-active' : ''}`}>
                          {tool.active ? '可用' : '未开'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
