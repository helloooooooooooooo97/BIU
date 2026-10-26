export const WORKBENCH_FILE = 'workbench.json'
export const WORKBENCH_STAGES = ['brief', 'wireframe', 'palette', 'demo', 'plugin'] as const
export const WORKBENCH_KEYS = [
  'stage',
  'kind',
  'who',
  'job',
  'not',
  'tree',
  'clicks',
  'bg',
  'ink',
  'muted',
  'accent',
] as const
export const TREE_TYPES = ['card', 'stack', 'row', 'btn', 'field', 'list', 'tabs', 'text', 'stat'] as const

export type WorkbenchStage = (typeof WORKBENCH_STAGES)[number]
export type WorkbenchKind = 'page' | 'window'
export type TreeType = (typeof TREE_TYPES)[number]

export type WorkbenchTree = {
  t: TreeType
  id?: string
  label?: string
  kids?: WorkbenchTree[]
}

export type WorkbenchClick = { on: string; set?: string }

export type Workbench = {
  stage: WorkbenchStage
  kind: WorkbenchKind
  who: string
  job: string
  not: string
  tree: WorkbenchTree | null
  clicks: WorkbenchClick[]
  bg: string
  ink: string
  muted: string
  accent: string
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const MAX_NODES = 24
const MAX_DEPTH = 4
const MAX_TEXT = 80

export function emptyWorkbench(partial: Partial<Workbench> = {}): Workbench {
  return {
    stage: 'brief',
    kind: 'page',
    who: '',
    job: '',
    not: '',
    tree: null,
    clicks: [],
    bg: '#ffffff',
    ink: '#171717',
    muted: '#737373',
    accent: '#171717',
    ...partial,
  }
}

export function isWorkbenchKey(key: string): key is (typeof WORKBENCH_KEYS)[number] {
  return (WORKBENCH_KEYS as readonly string[]).includes(key)
}

export function isWorkbenchStage(value: unknown): value is WorkbenchStage {
  return (WORKBENCH_STAGES as readonly string[]).includes(String(value))
}

export function workbenchFields(wb: Workbench): Record<string, unknown> {
  return {
    stage: wb.stage,
    kind: wb.kind,
    who: wb.who,
    job: wb.job,
    not: wb.not,
    tree: wb.tree ? JSON.stringify(wb.tree) : '',
    clicks: wb.clicks.length ? JSON.stringify(wb.clicks) : '',
    bg: wb.bg,
    ink: wb.ink,
    muted: wb.muted,
    accent: wb.accent,
  }
}

function clip(value: unknown) {
  return String(value ?? '').trim().slice(0, MAX_TEXT)
}

function parseHex(value: unknown, fallback: string) {
  const text = String(value ?? '').trim()
  return HEX.test(text) ? text.toLowerCase() : fallback
}

function parseKind(value: unknown): WorkbenchKind {
  return value === 'window' ? 'window' : 'page'
}

export function parseTree(raw: unknown, depth = 0): WorkbenchTree | null {
  if (raw == null || raw === '') return null
  let data = raw
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return null
    data = JSON.parse(text) as unknown
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('tree 必须是一个节点对象')
  return readNode(data as Record<string, unknown>, depth, { n: 0 })
}

function readNode(data: Record<string, unknown>, depth: number, count: { n: number }): WorkbenchTree {
  if (depth > MAX_DEPTH) throw new Error(`tree 最多 ${MAX_DEPTH} 层`)
  count.n += 1
  if (count.n > MAX_NODES) throw new Error(`tree 最多 ${MAX_NODES} 个节点`)
  const t = String(data.t ?? '')
  if (!(TREE_TYPES as readonly string[]).includes(t)) throw new Error(`未知组件 ${t}`)
  const kidsRaw = data.kids
  const kids = Array.isArray(kidsRaw) ? kidsRaw.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('kids 必须是节点')
    return readNode(item as Record<string, unknown>, depth + 1, count)
  }) : undefined
  const id = clip(data.id)
  const label = clip(data.label)
  return {
    t: t as TreeType,
    ...(id ? { id } : {}),
    ...(label ? { label } : {}),
    ...(kids?.length ? { kids } : {}),
  }
}

export function parseClicks(raw: unknown): WorkbenchClick[] {
  if (raw == null || raw === '') return []
  const data = typeof raw === 'string' ? (JSON.parse(raw.trim() || '[]') as unknown) : raw
  if (!Array.isArray(data)) throw new Error('clicks 必须是数组')
  if (data.length > MAX_NODES) throw new Error(`clicks 最多 ${MAX_NODES} 条`)
  return data.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('click 必须是对象')
    const on = clip((item as { on?: unknown }).on)
    if (!on) throw new Error('click.on 必填')
    const set = clip((item as { set?: unknown }).set)
    return set ? { on, set } : { on }
  })
}

export function parseWorkbench(raw: unknown): Workbench {
  const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const stage = isWorkbenchStage(data.stage) ? data.stage : 'brief'
  return emptyWorkbench({
    stage,
    kind: parseKind(data.kind),
    who: clip(data.who),
    job: clip(data.job),
    not: clip(data.not),
    tree: parseTree(data.tree),
    clicks: parseClicks(data.clicks),
    bg: parseHex(data.bg, '#ffffff'),
    ink: parseHex(data.ink, '#171717'),
    muted: parseHex(data.muted, '#737373'),
    accent: parseHex(data.accent, '#171717'),
  })
}

export function applyWorkbenchPatch(wb: Workbench, patch: Record<string, unknown>): Workbench {
  const next = { ...wb }
  if (patch.stage !== undefined) {
    if (!isWorkbenchStage(patch.stage)) throw new Error(`未知阶段 ${String(patch.stage)}`)
    next.stage = patch.stage
  }
  if (patch.kind !== undefined) next.kind = parseKind(patch.kind)
  if (patch.who !== undefined) next.who = clip(patch.who)
  if (patch.job !== undefined) next.job = clip(patch.job)
  if (patch.not !== undefined) next.not = clip(patch.not)
  if (patch.tree !== undefined) next.tree = parseTree(patch.tree)
  if (patch.clicks !== undefined) next.clicks = parseClicks(patch.clicks)
  if (patch.bg !== undefined) next.bg = parseHex(patch.bg, next.bg)
  if (patch.ink !== undefined) next.ink = parseHex(patch.ink, next.ink)
  if (patch.muted !== undefined) next.muted = parseHex(patch.muted, next.muted)
  if (patch.accent !== undefined) next.accent = parseHex(patch.accent, next.accent)
  return next
}

export function assertStageReady(wb: Workbench, stage: WorkbenchStage) {
  if (stage === 'brief') {
    if (!wb.who || !wb.job) throw new Error('需求缺 who 或 job')
    return
  }
  if (stage === 'wireframe') {
    if (!wb.tree) throw new Error('线框缺 tree')
    return
  }
  if (stage === 'palette') {
    for (const key of ['bg', 'ink', 'muted', 'accent'] as const) {
      if (!HEX.test(wb[key])) throw new Error(`色彩缺 ${key}`)
    }
    return
  }
  if (stage === 'demo') {
    if (!wb.tree) throw new Error('演示缺 tree')
  }
}

export function nextWorkbenchStage(stage: WorkbenchStage): WorkbenchStage {
  const i = WORKBENCH_STAGES.indexOf(stage)
  if (i < 0 || i >= WORKBENCH_STAGES.length - 1) throw new Error('已经是最后一段')
  return WORKBENCH_STAGES[i + 1]!
}

export function advanceWorkbench(wb: Workbench): Workbench {
  assertStageReady(wb, wb.stage)
  return { ...wb, stage: nextWorkbenchStage(wb.stage) }
}

export function workbenchBlocksCode(wb: Workbench | null | undefined) {
  return Boolean(wb && wb.stage !== 'plugin')
}
