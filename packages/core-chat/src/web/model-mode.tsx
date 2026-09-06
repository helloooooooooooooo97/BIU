import type { ContextWindow, ModelCapabilities, ReasoningEffort, ThinkingMode } from '../host/model-catalog.ts'

const pillCls = (on: boolean) =>
  `rounded-md border px-2 py-[3px] text-[12px] leading-none transition-colors ${
    on
      ? 'border-(--dsw-business) bg-(--dsw-business-soft) text-(--dsw-business)'
      : 'border-(--dsw-border) text-(--dsw-label-3) hover:bg-(--dsw-hover) hover:text-(--dsw-label)'
  }`

export function ModelModeControls(props: {
  capabilities: ModelCapabilities
  thinking: ThinkingMode
  reasoningEffort: ReasoningEffort
  contextWindow?: ContextWindow
  disabled?: boolean
  onChange: (next: { thinking?: ThinkingMode; reasoningEffort?: ReasoningEffort; contextWindow?: ContextWindow }) => void
}) {
  const { capabilities: caps, thinking, reasoningEffort, contextWindow = '200k', disabled, onChange } = props
  if (!caps.thinking && !caps.speed && !caps.effort?.length && !caps.context?.length) return null
  return (
    <div className="flex flex-col gap-2" data-testid="model-mode-controls">
      {caps.thinking ? (
        <div className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-[11px] text-(--dsw-label-3)">思考</span>
          <div className="flex gap-1">
            <button
              type="button"
              className={pillCls(thinking === 'disabled')}
              disabled={disabled}
              data-testid="thinking-off"
              onClick={() => onChange({ thinking: 'disabled' })}
            >
              关
            </button>
            <button
              type="button"
              className={pillCls(thinking === 'enabled')}
              disabled={disabled}
              data-testid="thinking-on"
              onClick={() => onChange({ thinking: 'enabled' })}
            >
              开
            </button>
          </div>
        </div>
      ) : null}
      {caps.speed ? (
        <div className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-[11px] text-(--dsw-label-3)">快</span>
          <div className="flex gap-1">
            <button
              type="button"
              className={pillCls(thinking === 'disabled')}
              disabled={disabled}
              data-testid="speed-on"
              onClick={() => onChange({ thinking: 'disabled' })}
            >
              开
            </button>
            <button
              type="button"
              className={pillCls(thinking !== 'disabled')}
              disabled={disabled}
              data-testid="speed-off"
              onClick={() => onChange({ thinking: 'enabled' })}
            >
              关
            </button>
          </div>
        </div>
      ) : null}
      {caps.effort?.length ? (
        <div className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-[11px] text-(--dsw-label-3)">力度</span>
          <div className="flex gap-1">
            {caps.effort.map((item) => (
              <button
                key={item}
                type="button"
                className={pillCls(reasoningEffort === item)}
                disabled={disabled}
                data-testid={`effort-${item}`}
                onClick={() => onChange({ reasoningEffort: item })}
              >
                {item === 'max' ? 'Max' : 'High'}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {caps.context?.length ? (
        <div className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-[11px] text-(--dsw-label-3)">上下文</span>
          <div className="flex gap-1">
            {caps.context.map((item) => (
              <button
                key={item}
                type="button"
                className={pillCls(contextWindow === item)}
                disabled={disabled}
                data-testid={`context-${item}`}
                onClick={() => onChange({ contextWindow: item })}
              >
                {item === '1m' ? '1M' : '200k'}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function modelModeSuffix(
  thinking: ThinkingMode,
  effort: ReasoningEffort,
  caps: ModelCapabilities,
  context: ContextWindow = '200k',
) {
  if (caps.speed && thinking === 'disabled') return '快'
  if (caps.thinking && thinking === 'disabled') return ''
  if (caps.context?.length && context === '1m') return '1M'
  if (!caps.thinking && !caps.effort?.length) return ''
  if (effort === 'max') return 'Max'
  return caps.effort?.length ? 'High' : ''
}
