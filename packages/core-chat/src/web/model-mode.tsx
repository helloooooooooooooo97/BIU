import type { ModelCapabilities, ReasoningEffort, ThinkingMode } from '../host/model-catalog.ts'

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
  disabled?: boolean
  onChange: (next: { thinking?: ThinkingMode; reasoningEffort?: ReasoningEffort }) => void
}) {
  const { capabilities: caps, thinking, reasoningEffort, disabled, onChange } = props
  if (!caps.thinking && !caps.speed && !caps.effort?.length) return null
  return (
    <div className="flex flex-col gap-2" data-testid="model-mode-controls">
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
      {caps.effort?.length && (caps.thinking ? thinking === 'enabled' : true) ? (
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
                onClick={() => onChange({ thinking: 'enabled', reasoningEffort: item })}
              >
                {item === 'max' ? 'Max' : 'High'}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function modelModeSuffix(thinking: ThinkingMode, effort: ReasoningEffort, caps: ModelCapabilities) {
  if (caps.speed && thinking === 'disabled') return '快'
  if (caps.thinking && thinking === 'disabled') return ''
  if (!caps.thinking && !caps.effort?.length) return ''
  if (effort === 'max') return 'Max'
  return caps.effort?.length ? 'High' : ''
}
