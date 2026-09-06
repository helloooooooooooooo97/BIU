import { useMemo, useState } from 'react'
import { CheckIcon, ChevronRightIcon, MagnifyingGlassIcon } from '@heroicons/react/16/solid'
import {
  inferModelCapabilities,
  type ContextWindow,
  type ModelCapabilities,
  type ReasoningEffort,
  type ThinkingMode,
} from '../host/model-catalog.ts'
import { modelModeSuffix } from './model-mode.tsx'

export type ComposerModelOption = {
  id: string
  label: string
  provider: string
  endpointId: string
  model: string
  note?: string
}

type Pane = 'root' | 'effort' | 'context' | 'model'

function groupTitle(key: string, labels: Record<string, string>) {
  return (
    labels[key] ||
    (key === 'deepseek' ? 'DeepSeek' : key === 'anthropic' ? 'Claude' : key === 'openai' ? 'GPT' : key)
  )
}

function tagFor(
  option: ComposerModelOption,
  current: ComposerModelOption,
  thinking: ThinkingMode,
  effort: ReasoningEffort,
  context: ContextWindow,
  currentCaps: ModelCapabilities,
) {
  if (option.id === current.id) return modelModeSuffix(thinking, effort, currentCaps, context)
  const caps = inferModelCapabilities(option.model, option.provider as 'deepseek' | 'openai' | 'anthropic')
  return modelModeSuffix('enabled', 'high', caps, '200k')
}

export function ComposerModelMenu(props: {
  models: ComposerModelOption[]
  current: ComposerModelOption
  endpointLabels: Record<string, string>
  thinking: ThinkingMode
  reasoningEffort: ReasoningEffort
  contextWindow: ContextWindow
  capabilities: ModelCapabilities
  disabled?: boolean
  onSelect: (option: ComposerModelOption) => void
  onMode: (next: { thinking?: ThinkingMode; reasoningEffort?: ReasoningEffort; contextWindow?: ContextWindow }) => void
  onAddModels: () => void
}) {
  const {
    models,
    current,
    endpointLabels,
    thinking,
    reasoningEffort,
    contextWindow,
    capabilities,
    disabled,
    onSelect,
    onMode,
    onAddModels,
  } = props
  const [pane, setPane] = useState<Pane>('root')
  const [query, setQuery] = useState('')
  const thinkingOn = thinking === 'enabled'
  const fast = Boolean(capabilities.speed && thinking === 'disabled')
  const showThinking = Boolean(capabilities.thinking)
  const showFast = Boolean(capabilities.speed)
  const showEffort = Boolean(capabilities.effort?.length)
  const showContext = Boolean(capabilities.context?.length)
  const effortLabel = reasoningEffort === 'max' ? 'Max' : 'High'
  const contextLabel = contextWindow === '1m' ? '1M' : '200k'

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase()
    const visible = models.filter((m) => {
      if (!q) return true
      return m.label.toLowerCase().includes(q) || m.model.toLowerCase().includes(q) || (m.note || '').toLowerCase().includes(q)
    })
    const order = ['deepseek', 'anthropic', 'openai']
    const map = new Map<string, ComposerModelOption[]>()
    for (const m of visible) {
      const key = m.endpointId || m.provider
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(m)
    }
    const keys = [...order.filter((k) => map.has(k)), ...[...map.keys()].filter((k) => !order.includes(k))]
    return keys.map((key) => ({ id: key, title: groupTitle(key, endpointLabels), items: map.get(key)! }))
  }, [models, query, endpointLabels])

  return (
    <div className="composer-model-pop" data-testid="composer-model-menu">
      {pane === 'model' ? (
        <div className="composer-model-flyout" role="listbox" aria-label="选择模型">
          <div className="composer-model-search">
            <MagnifyingGlassIcon className="size-3.5 opacity-60" aria-hidden />
            <input
              type="search"
              value={query}
              placeholder="搜索模型"
              aria-label="搜索模型"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="composer-model-flyout-list">
            {models.length === 0 ? (
              <div className="composer-model-empty">尚未配置可用模型。点「添加模型」添加官方 Key 或第三方。</div>
            ) : grouped.every((g) => !g.items.length) ? (
              <div className="composer-model-empty">没有匹配的模型</div>
            ) : (
              grouped.map((group) => (
                <div key={group.id} className="composer-model-group">
                  <div className="composer-model-group-label">{group.title}</div>
                  {group.items.map((option) => {
                    const active = option.id === current.id
                    const tag = tagFor(option, current, thinking, reasoningEffort, contextWindow, capabilities)
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={`composer-model-item${active ? ' is-active' : ''}`}
                        onClick={() => onSelect(option)}
                      >
                        <span className="composer-model-item-main">
                          <span className="composer-model-item-label">{option.label}</span>
                          {tag ? <span className="composer-model-item-tag">{tag}</span> : null}
                        </span>
                        {active ? <CheckIcon className="composer-model-check size-3.5" aria-hidden /> : null}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>
          <button type="button" className="composer-model-add-models" data-testid="open-model-config" onClick={onAddModels}>
            添加模型
          </button>
        </div>
      ) : null}

      {pane === 'effort' ? (
        <div className="composer-model-flyout is-compact" role="listbox" aria-label="推理力度">
          {(capabilities.effort ?? []).map((item) => {
            const active = reasoningEffort === item
            const label = item === 'max' ? 'Max' : 'High'
            return (
              <button
                key={item}
                type="button"
                role="option"
                aria-selected={active}
                className={`composer-model-item${active ? ' is-active' : ''}`}
                data-testid={`effort-${item}`}
                disabled={disabled}
                onClick={() => onMode({ reasoningEffort: item })}
              >
                <span className="composer-model-item-label">{label}</span>
                {active ? <CheckIcon className="composer-model-check size-3.5" aria-hidden /> : null}
              </button>
            )
          })}
        </div>
      ) : null}

      {pane === 'context' ? (
        <div className="composer-model-flyout is-compact" role="listbox" aria-label="上下文">
          {(capabilities.context ?? []).map((item) => {
            const active = contextWindow === item
            const label = item === '1m' ? '1M' : '200k'
            return (
              <button
                key={item}
                type="button"
                role="option"
                aria-selected={active}
                className={`composer-model-item${active ? ' is-active' : ''}`}
                data-testid={`context-${item}`}
                disabled={disabled}
                onClick={() => onMode({ contextWindow: item })}
              >
                <span className="composer-model-item-label">{label}</span>
                {active ? <CheckIcon className="composer-model-check size-3.5" aria-hidden /> : null}
              </button>
            )
          })}
        </div>
      ) : null}

      <div className="composer-model-panel" data-testid="composer-model-panel">
        {showThinking ? (
          <button
            type="button"
            role="switch"
            aria-checked={thinkingOn}
            className="composer-model-row"
            data-testid="thinking-toggle"
            disabled={disabled}
            onClick={() => onMode({ thinking: thinkingOn ? 'disabled' : 'enabled' })}
          >
            <span className="composer-model-row-label">思考</span>
            <span className={`composer-model-switch${thinkingOn ? ' is-on' : ''}`} aria-hidden />
          </button>
        ) : null}
        {showFast ? (
          <button
            type="button"
            role="switch"
            aria-checked={fast}
            className="composer-model-row"
            data-testid="speed-toggle"
            disabled={disabled}
            onClick={() => onMode({ thinking: fast ? 'enabled' : 'disabled' })}
          >
            <span className="composer-model-row-label">快</span>
            <span className={`composer-model-switch${fast ? ' is-on' : ''}`} aria-hidden />
          </button>
        ) : null}
        {showEffort ? (
          <button
            type="button"
            className={`composer-model-row${pane === 'effort' ? ' is-open' : ''}`}
            disabled={disabled}
            onClick={() => setPane((p) => (p === 'effort' ? 'root' : 'effort'))}
          >
            <span className="composer-model-row-label">力度</span>
            <span className="composer-model-row-val">{effortLabel}</span>
            <ChevronRightIcon className="size-3.5 opacity-50" aria-hidden />
          </button>
        ) : null}
        {showContext ? (
          <button
            type="button"
            className={`composer-model-row${pane === 'context' ? ' is-open' : ''}`}
            disabled={disabled}
            onClick={() => setPane((p) => (p === 'context' ? 'root' : 'context'))}
          >
            <span className="composer-model-row-label">上下文</span>
            <span className="composer-model-row-val">{contextLabel}</span>
            <ChevronRightIcon className="size-3.5 opacity-50" aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          className={`composer-model-row${pane === 'model' ? ' is-open' : ''}`}
          onClick={() => setPane((p) => (p === 'model' ? 'root' : 'model'))}
        >
          <span className="composer-model-row-label">模型</span>
          <span className="composer-model-row-val">{current.label}</span>
          <ChevronRightIcon className="size-3.5 opacity-50" aria-hidden />
        </button>
      </div>
    </div>
  )
}
