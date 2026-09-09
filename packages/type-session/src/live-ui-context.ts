/** 发送回合时的界面快照。进本回合 system/prompt，不写进用户原文。 */
export type LiveUiContext = {
  sessionId?: string
  sessionTitle?: string
  route?: string
  inspectorTab?: string
  inspectorTabLabel?: string
  focusPath?: string
  focusTitle?: string
  caretLine?: number
  caretInsert?: number
}

function clip(value: unknown, max: number) {
  const text = String(value ?? '').trim()
  if (!text) return undefined
  return text.length > max ? text.slice(0, max) : text
}

export function sanitizeLiveUiContext(raw: unknown): LiveUiContext | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const src = raw as Record<string, unknown>
  const next: LiveUiContext = {}
  const sessionId = clip(src.sessionId, 80)
  const sessionTitle = clip(src.sessionTitle, 80)
  const route = clip(src.route, 240)
  const inspectorTab = clip(src.inspectorTab, 160)
  const inspectorTabLabel = clip(src.inspectorTabLabel, 80)
  const focusPath = clip(src.focusPath, 240)
  const focusTitle = clip(src.focusTitle, 80)
  const caretLine = Number(src.caretLine)
  const caretInsert = Number(src.caretInsert)
  if (sessionId) next.sessionId = sessionId
  if (sessionTitle) next.sessionTitle = sessionTitle
  if (route) next.route = route
  if (inspectorTab) next.inspectorTab = inspectorTab
  if (inspectorTabLabel) next.inspectorTabLabel = inspectorTabLabel
  if (focusPath) next.focusPath = focusPath
  if (focusTitle) next.focusTitle = focusTitle
  if (Number.isInteger(caretLine) && caretLine >= 1) next.caretLine = caretLine
  if (Number.isInteger(caretInsert) && caretInsert >= 0) next.caretInsert = caretInsert
  return Object.keys(next).length ? next : undefined
}

/** 给模型看的短动态上下文。空则返回空串。 */
export function formatLiveUiContext(ctx: LiveUiContext | undefined): string {
  const live = sanitizeLiveUiContext(ctx)
  if (!live) return ''
  const lines: string[] = [
    '当前界面（发送时的动态画面，不是用户点名的对象。点名对象在 <pick> 里。）',
  ]
  if (live.sessionId || live.sessionTitle) {
    const name = live.sessionTitle || '（未命名）'
    const id = live.sessionId ? ` id=${live.sessionId}` : ''
    lines.push(`- 主会话：${name}${id}`)
  }
  if (live.route) lines.push(`- 路由：${live.route}`)
  if (live.inspectorTabLabel || live.inspectorTab) {
    const tab = live.inspectorTabLabel || live.inspectorTab
    const id = live.inspectorTab && live.inspectorTabLabel ? ` (${live.inspectorTab})` : ''
    lines.push(`- 右侧栏：${tab}${id}`)
  }
  if (live.focusTitle || live.focusPath) {
    const title = live.focusTitle || '（无标题）'
    const path = live.focusPath ? ` ${live.focusPath}` : ''
    lines.push(`- 焦点记录：${title}${path}`)
  }
  if (live.caretLine != null) {
    const insert = live.caretInsert != null ? `，插入点 ${live.caretInsert}` : ''
    lines.push(`- 光标：第 ${live.caretLine} 行${insert}`)
  }
  return lines.length > 1 ? lines.join('\n') : ''
}
