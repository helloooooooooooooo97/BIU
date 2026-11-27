import type {
  ContextWindow,
  ModelCapabilities,
  ModelChoiceKnob,
  ModelKnob,
  ModelModeValues,
  ReasoningEffort,
  SpeedMode,
  ThinkingMode,
} from '../shared/model-catalog.ts'

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
