import type {
  ContextWindow,
  ModelCapabilities,
  ModelChoiceKnob,
  ModelKnob,
  ModelModeValues,
  ReasoningEffort,
  SpeedMode,
  ThinkingMode,
} from '../host/model-catalog.ts'

const pillCls = (on: boolean) =>
  `rounded-md border px-2 py-[3px] text-[12px] leading-none transition-colors ${
    on
      ? 'border-(--dsw-business) bg-(--dsw-business-soft) text-(--dsw-business)'
      : 'border-(--dsw-border) text-(--dsw-label-3) hover:bg-(--dsw-hover) hover:text-(--dsw-label)'
  }`

export type ModelModePatch = Partial<ModelModeValues>

function knobs(caps: ModelCapabilities): ModelKnob[] {
  return caps.knobs ?? []
}

function valueOf(knob: ModelKnob, mode: ModelModeValues): string {
  if (knob.id === 'thinking') return mode.thinking
  if (knob.id === 'speed') return mode.speed
  if (knob.id === 'effort') return mode.effort
  return mode.context
}

function patchKnob(knob: ModelKnob, value: string): ModelModePatch {
  if (knob.id === 'thinking') return { thinking: value as ThinkingMode }
  if (knob.id === 'speed') return { speed: value as SpeedMode }
  if (knob.id === 'effort') return { effort: value as ReasoningEffort }
  return { context: value as ContextWindow }
}

export function ModelModeControls(props: {
  capabilities: ModelCapabilities
  mode: ModelModeValues
  disabled?: boolean
  onChange: (next: ModelModePatch) => void
}) {
  const { capabilities, mode, disabled, onChange } = props
  const items = knobs(capabilities)
  if (!items.length) return null
  return (
    <div className="flex flex-col gap-2" data-testid="model-mode-controls">
      {items.map((knob) => {
        const current = valueOf(knob, mode)
        if (knob.kind === 'toggle') {
          return (
            <div key={knob.id} className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-[11px] text-(--dsw-label-3)">{knob.label}</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  className={pillCls(current === knob.off)}
                  disabled={disabled}
                  data-testid={`${knob.id}-off`}
                  onClick={() => onChange(patchKnob(knob, knob.off))}
                >
                  关
                </button>
                <button
                  type="button"
                  className={pillCls(current === knob.on)}
                  disabled={disabled}
                  data-testid={`${knob.id}-on`}
                  onClick={() => onChange(patchKnob(knob, knob.on))}
                >
                  开
                </button>
              </div>
            </div>
          )
        }
        return (
          <div key={knob.id} className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-[11px] text-(--dsw-label-3)">{knob.label}</span>
            <div className="flex gap-1">
              {knob.options.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={pillCls(current === item.value)}
                  disabled={disabled}
                  data-testid={`${knob.id}-${item.value}`}
                  onClick={() => onChange(patchKnob(knob, item.value))}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function modelModeSuffix(mode: ModelModeValues, caps: ModelCapabilities) {
  for (const knob of knobs(caps)) {
    const current = valueOf(knob, mode)
    if (knob.kind === 'toggle' && knob.id === 'speed' && current === knob.on) return '快'
    if (knob.kind === 'toggle' && knob.id === 'thinking' && current === knob.off) return ''
    if (knob.id === 'context' && current === '1m') return '1M'
    if (knob.id === 'effort') return current === 'max' ? 'Max' : 'High'
  }
  return ''
}

export function choiceKnob(caps: ModelCapabilities, id: string): ModelChoiceKnob | undefined {
  return knobs(caps).find((knob): knob is ModelChoiceKnob => knob.kind === 'choice' && knob.id === id)
}

export { knobs as modelKnobs, valueOf as knobValue, patchKnob }
