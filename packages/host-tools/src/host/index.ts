import { AsyncLocalStorage } from 'node:async_hooks'
import { Service, type Context } from 'cordis'
import { toolNameForApi, stripToolApiName } from './tool-name.ts'
import { currentAccountId, currentPluginId, currentRequestWorkspaceId } from '@biu/host-plugin-loader/data-dir'
import { getAccountPort } from '@biu/host-plugin-loader/ports'
import { TenantStateMap } from '@biu/host-plugin-loader/tenant-state'

export { toolNameForApi, stripToolApiName, TOOL_API_NAME } from './tool-name.ts'

export interface ToolAnnotations {
  /** 是否只读（不产生写入或状态变更副作用）。用于权限拦截与 MCP ToolAnnotations，独立于并发调度 executionMode。 */
  readOnly?: boolean
  /** 是否属于破坏性操作（如删除、覆盖）。 */
  destructive?: boolean
  /** 重复调用是否幂等。 */
  idempotent?: boolean
}

export interface ToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown>
  /**
   * parallel：允许与同一批次里的其它并行工具重叠执行。
   * exclusive / 缺省：作为屏障独占执行，保持既有工具的串行语义。
   */
  execution?: ToolExecutionMode | ((args: Record<string, unknown>) => ToolExecutionMode)
  /** 显式工具安全/语义标注（与 execution 并发调度解耦）。 */
  annotations?: ToolAnnotations | ((args: Record<string, unknown>) => ToolAnnotations)
  execute: (args: Record<string, unknown>, signal: AbortSignal) => unknown | Promise<unknown>
}

export type ToolExecutionMode = 'parallel' | 'exclusive'

export type ToolOrigin = 'core' | 'store'

export interface ToolCatalogItem {
  name: string
  description: string
  origin: ToolOrigin
}

export interface ToolRequest {
  name: string
  args: Record<string, unknown>
  deny?: string
}

export type ToolGuard = (req: ToolRequest) => ToolRequest | Promise<ToolRequest>

/** 极简=底座两工具；文件=文件系统 db_*；标准=全部。旧创造配置并入标准。 */
export const AGENT_TOOL_MODES = ['minimal', 'file', 'standard'] as const
export type AgentToolMode = (typeof AGENT_TOOL_MODES)[number]

export function isAgentToolMode(value: unknown): value is AgentToolMode {
  return value === 'minimal' || value === 'file' || value === 'standard'
}

export function normalizeAgentMode(value: unknown, fallback: AgentToolMode = 'standard'): AgentToolMode {
  if (value === 'minimal' || value === 'file') return value
  if (value === 'standard' || value === 'create') return 'standard'
  return fallback
}

export const MINIMAL_TOOL_NAMES = ['bash', 'str_replace_editor'] as const

/** BIU 文件系统 DB 工具；文件模式下只开放这些。 */
export const FILE_TOOL_NAMES = [
  'db_list',
  'db_read',
  'db_update',
  'db_create',
  'db_delete',
  'db_restore',
  'db_stat',
  'db_action',
  'db_content',
  'db_file',
  'db_media',
] as const

/** 本回合 slash 选中的额外工具（极简模式下临时放开）。 */
const extraToolsStorage = new AsyncLocalStorage<ReadonlySet<string>>()

/** 当前 invoke 的增量汇报（agent-loop 写成 partial tool/result）。 */
const toolProgressStorage = new AsyncLocalStorage<(detail: string) => void>()

export function runWithToolProgress<T>(onProgress: (detail: string) => void, fn: () => T): T {
  return toolProgressStorage.run(onProgress, fn)
}

/** 回合级工具策略（会话 config 覆盖全局 mode/extras）。 */
const toolPolicyStorage = new AsyncLocalStorage<{
  mode: AgentToolMode
  extras: ReadonlySet<string>
}>()

const toolOriginStorage = new AsyncLocalStorage<ToolOrigin>()

/** 商店插件 apply 期间注册的工具标成 store，标准模式可见。 */
export function runWithToolOrigin<T>(origin: ToolOrigin, fn: () => T): T {
  return toolOriginStorage.run(origin, fn)
}

export function runWithExtraTools<T>(names: readonly string[], fn: () => T): T {
  const cleaned = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
  return extraToolsStorage.run(new Set(cleaned), fn)
}

export function runWithToolPolicy<T>(
  policy: { mode: AgentToolMode; extras?: readonly string[] },
  fn: () => T,
): T {
  const extras = [...new Set((policy.extras ?? []).map((n) => n.trim()).filter(Boolean))]
  return toolPolicyStorage.run({ mode: policy.mode, extras: new Set(extras) }, () =>
    runWithExtraTools(extras, fn),
  )
}

export class ToolsService extends Service {
  private tools = new Map<string, ToolSpec>()
  private origins = new Map<string, ToolOrigin>()
  private pluginIds = new Map<string, string>()
  /** 仅用于非 ASCII 工具名到 OpenAI API 安全名的内部映射，不对外提供工具别名。 */
  private sanitizedNames = new Map<string, string>()
  private notes = new Map<string, string[]>()
  private guards: ToolGuard[] = []
  private modes: TenantStateMap<AgentToolMode>
  /** 极简模式下常驻额外工具（按账号隔离，随租户吊销自动回收）。 */
  private pinnedExtrasMap: TenantStateMap<string[]>

  constructor(ctx: Context) {
    super(ctx, 'tools')
    this.modes = new TenantStateMap(ctx, { granularity: 'account' })
    this.pinnedExtrasMap = new TenantStateMap(ctx, { granularity: 'account' })
  }

  getMode(): AgentToolMode {
    return this.modes.get() ?? 'standard'
  }

  originOf(name: string): ToolOrigin {
    return this.origins.get(this.resolveName(name)) ?? 'core'
  }

  setMode(mode: AgentToolMode) {
    if (!isAgentToolMode(mode)) throw new Error(`unknown agent tool mode: ${mode}`)
    if ((this.modes.get() ?? 'standard') === mode) return
    this.modes.set(mode)
    this.ctx.emit('hub/change')
  }

  getPinnedExtras() {
    return [...(this.pinnedExtrasMap.get() ?? [])]
  }

  setPinnedExtras(names: readonly string[]) {
    const cleaned = [
      ...new Set(
        names
          .map((name) => name.trim())
          .filter(Boolean)
          .filter((name) => !(MINIMAL_TOOL_NAMES as readonly string[]).includes(name))
          .filter((name) => !(FILE_TOOL_NAMES as readonly string[]).includes(name)),
      ),
    ]
    const prev = this.pinnedExtrasMap.get() ?? []
    const same =
      cleaned.length === prev.length && cleaned.every((name, i) => name === prev[i])
    if (same) return
    this.pinnedExtrasMap.set(cleaned)
    this.ctx.emit('hub/change')
  }

  private visible(name: string) {
    const pluginId = this.pluginIds.get(this.resolveName(name))
    if (pluginId && currentAccountId()) {
      const store = getAccountPort(this.ctx)?.store
      if (!store?.canAccessPlugin?.(currentAccountId(), currentRequestWorkspaceId(), pluginId)) return false
    }
    const policy = toolPolicyStorage.getStore()
    const mode = policy?.mode ?? this.getMode()
    const pinnedExtras = this.pinnedExtrasMap.get() ?? []
    if (mode === 'standard') return true
    if (this.originOf(name) === 'store') return false
    if (mode === 'file') return (FILE_TOOL_NAMES as readonly string[]).includes(name)
    if ((MINIMAL_TOOL_NAMES as readonly string[]).includes(name)) return true
    if ((policy?.extras ?? new Set()).has(name)) return true
    if ([...(policy?.extras ?? [])].some((item) => this.resolveName(item) === name)) return true
    if (!policy && pinnedExtras.includes(name)) return true
    if (!policy && pinnedExtras.some((item) => this.resolveName(item) === name)) return true
    if (extraToolsStorage.getStore()?.has(name)) return true
    return [...(extraToolsStorage.getStore() ?? [])].some((item) => this.resolveName(item) === name)
  }

  private resolveName(name: string) {
    const raw = String(name ?? '').trim()
    const mapped = this.sanitizedNames.get(raw)
    if (mapped) return mapped
    if (this.tools.has(raw)) return raw
    const stripped = stripToolApiName(raw)
    if (stripped && this.tools.has(stripped)) return stripped
    return raw
  }

  /** 插件给已有工具追加说明（卸载时摘掉）。工具尚未注册也可以先挂。 */
  annotate(name: string, text: string) {
    const key = String(name ?? '').trim()
    const note = String(text ?? '').trim()
    if (!key || !note) throw new Error('tools.annotate needs name and text')
    return this.ctx.effect(() => {
      const list = this.notes.get(key) ?? []
      list.push(note)
      this.notes.set(key, list)
      this.ctx.emit('hub/change')
      return () => {
        const next = (this.notes.get(key) ?? []).filter((item) => item !== note)
        if (next.length) this.notes.set(key, next)
        else this.notes.delete(key)
        this.ctx.emit('hub/change')
      }
    }, `tools.annotate ${key}`)
  }

  private noteTexts(name: string) {
    const canonical = this.resolveName(name)
    const keys = new Set<string>([canonical, name])
    return [...keys].flatMap((key) => this.notes.get(key) ?? [])
  }

  private describe(tool: ToolSpec) {
    const extra = this.noteTexts(tool.name)
    if (!extra.length) return tool.description
    return [tool.description, ...extra].join(' ')
  }

  register(spec: ToolSpec) {
    const original = String(spec.name ?? '').trim()
    const name = toolNameForApi(original, new Set(this.tools.keys()))
    const pluginId = currentPluginId()
    const next = { ...spec, name, parameters: normalizeToolParameters(spec.parameters) }
    return this.ctx.effect(() => {
      if (this.tools.has(name)) throw new Error(`tool already registered: ${name}`)
      this.tools.set(name, next)
      this.origins.set(name, toolOriginStorage.getStore() ?? 'core')
      if (pluginId) this.pluginIds.set(name, pluginId)
      if (original && original !== name) this.sanitizedNames.set(original, name)
      this.ctx.emit('hub/change')
      return () => {
        this.tools.delete(name)
        this.origins.delete(name)
        this.pluginIds.delete(name)
        if (original && original !== name) this.sanitizedNames.delete(original)
        this.ctx.emit('hub/change')
      }
    }, `tools.register ${name}`)
  }

  guard(fn: ToolGuard) {
    return this.ctx.effect(() => {
      this.guards.push(fn)
      return () => {
        this.guards = this.guards.filter((item) => item !== fn)
      }
    }, 'tools.guard')
  }

  /** 全量目录（不受 mode 过滤），供 slash 菜单。 */
  catalog(): ToolCatalogItem[] {
    return [...this.tools.values()]
      .map((tool) => ({
        name: tool.name,
        description: this.describe(tool),
        origin: this.originOf(tool.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  schemas() {
    return [...this.tools.values()]
      .filter((tool) => this.visible(tool.name))
      .map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: this.describe(tool),
          parameters: tool.parameters,
        },
      }))
  }

  names() {
    return [...this.tools.keys()].filter((name) => this.visible(name))
  }

  executionMode(name: string, args: Record<string, unknown> = {}): ToolExecutionMode {
    const execution = this.tools.get(this.resolveName(name))?.execution
    if (typeof execution !== 'function') return execution ?? 'exclusive'
    try {
      return execution(args)
    } catch {
      // 调度提示不能改变工具原本的报错路径；判断失败时保守串行。
      return 'exclusive'
    }
  }

  annotationsOf(name: string, args: Record<string, unknown> = {}): ToolAnnotations {
    const raw = this.tools.get(this.resolveName(name))?.annotations
    if (!raw) return {}
    if (typeof raw !== 'function') return raw
    try {
      return raw(args) ?? {}
    } catch {
      // 标注求值失败时保守按非只读处理
      return { readOnly: false }
    }
  }

  /** 显式只读判定：优先读 annotations.readOnly，未显式标注时回退到 executionMode === 'parallel'。 */
  isReadOnly(name: string, args: Record<string, unknown> = {}): boolean {
    const ann = this.annotationsOf(name, args)
    if (typeof ann.readOnly === 'boolean') return ann.readOnly
    return this.executionMode(name, args) === 'parallel'
  }

  /** 工具执行中把当前结果推到 UI；无 listener 时为空操作。 */
  report(detail: unknown) {
    toolProgressStorage.getStore()?.(stringify(detail))
  }

  async invoke(name: string, args: Record<string, unknown> = {}, signal: AbortSignal = new AbortController().signal) {
    const resolved = this.resolveName(name)
    if (signal.aborted) throw new Error('cancelled')
    if (!this.visible(resolved)) {
      const mode = toolPolicyStorage.getStore()?.mode ?? this.getMode()
      throw new Error(`tool not available in ${mode} mode: ${resolved}`)
    }
    if (!isPlainObject(args)) {
      throw new Error(`invalid arguments for ${resolved}: expected JSON object`)
    }
    let req: ToolRequest = { name: resolved, args }
    for (const guard of this.guards) req = await raceAbort(signal, Promise.resolve(guard(req)))
    req = this.ctx.waterfall('tools/pre-execute', req, () => req)
    if (req.deny) {
      this.ctx.emit('tools/post-execute', { name: resolved, ok: false, detail: req.deny })
      throw new Error(req.deny)
    }
    const tool = this.tools.get(resolved)
    if (!tool) throw new Error(`unknown tool: ${resolved}`)
    try {
      validateToolArgs(resolved, tool.parameters, req.args)
      const result = await raceAbort(signal, Promise.resolve(tool.execute(req.args, signal)))
      this.ctx.emit('tools/post-execute', { name: resolved, ok: true, detail: stringify(result) })
      return result
    } catch (error) {
      this.ctx.emit('tools/post-execute', { name: resolved, ok: false, detail: String(error) })
      throw error
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeToolParameters(parameters: Record<string, unknown>): Record<string, unknown> {
  if (!isPlainObject(parameters)) return { type: 'object', properties: {}, additionalProperties: false }
  if (parameters.type === 'object' && isPlainObject(parameters.properties) && parameters.additionalProperties === undefined) {
    return { ...parameters, additionalProperties: false }
  }
  return parameters
}

function matchesSchemaType(expected: string, value: unknown): boolean {
  if (expected === 'string') return typeof value === 'string'
  if (expected === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (expected === 'integer') return typeof value === 'number' && Number.isInteger(value)
  if (expected === 'boolean') return typeof value === 'boolean'
  if (expected === 'array') return Array.isArray(value)
  if (expected === 'object') return isPlainObject(value)
  if (expected === 'null') return value === null
  return true
}

function validateSchemaValue(
  toolName: string,
  fieldPath: string,
  spec: Record<string, unknown>,
  value: unknown,
  requiredField: boolean,
): void {
  if (value === null && !requiredField) {
    const types = Array.isArray(spec.type) ? spec.type : spec.type ? [spec.type] : []
    if (!types.length || types.includes('null')) return
  }
  const types = Array.isArray(spec.type)
    ? spec.type.filter((item): item is string => typeof item === 'string')
    : typeof spec.type === 'string'
      ? [spec.type]
      : []
  if (types.length && !types.some((t) => matchesSchemaType(t, value))) {
    throw new Error(`invalid argument "${fieldPath}" for ${toolName}: expected ${types.join(' | ')}`)
  }
  if (Array.isArray(spec.enum) && spec.enum.length && !spec.enum.includes(value)) {
    throw new Error(
      `invalid argument "${fieldPath}" for ${toolName}: got ${JSON.stringify(value)}, expected one of ${spec.enum.map((v) => JSON.stringify(v)).join(', ')}`,
    )
  }
  if (Array.isArray(value) && isPlainObject(spec.items)) {
    for (let i = 0; i < value.length; i += 1) {
      validateSchemaValue(toolName, `${fieldPath}[${i}]`, spec.items, value[i], true)
    }
  }
  if (isPlainObject(value) && isPlainObject(spec.properties)) {
    const nestedProps = spec.properties as Record<string, Record<string, unknown>>
    const nestedRequired = Array.isArray(spec.required)
      ? spec.required.filter((item): item is string => typeof item === 'string')
      : []
    for (const reqKey of nestedRequired) {
      if (value[reqKey] === undefined) {
        throw new Error(`missing required argument "${fieldPath}.${reqKey}" for ${toolName}`)
      }
    }
    if (spec.additionalProperties === false) {
      const allowed = Object.keys(nestedProps)
      const unknown = Object.keys(value).filter((k) => value[k] !== undefined && !(k in nestedProps))
      if (unknown.length) {
        throw new Error(
          `unknown argument(s) at "${fieldPath}" for ${toolName}: ${unknown.join(', ')}. Allowed: ${allowed.join(', ') || '(none)'}`,
        )
      }
    }
    for (const [k, childSpec] of Object.entries(nestedProps)) {
      if (value[k] === undefined || !isPlainObject(childSpec)) continue
      validateSchemaValue(toolName, `${fieldPath}.${k}`, childSpec, value[k], nestedRequired.includes(k))
    }
  }
}

export function validateToolArgs(
  toolName: string,
  parameters: Record<string, unknown>,
  args: Record<string, unknown>,
): void {
  if (!isPlainObject(args)) {
    throw new Error(`invalid arguments for ${toolName}: expected JSON object`)
  }
  if (!isPlainObject(parameters)) return
  const props = isPlainObject(parameters.properties)
    ? (parameters.properties as Record<string, Record<string, unknown>>)
    : null
  const required = Array.isArray(parameters.required)
    ? parameters.required.filter((item): item is string => typeof item === 'string')
    : []

  for (const key of required) {
    if (args[key] === undefined) {
      throw new Error(`missing required argument "${key}" for ${toolName}`)
    }
  }

  if (props && parameters.additionalProperties === false) {
    const allowed = Object.keys(props)
    const unknown = Object.keys(args).filter((key) => args[key] !== undefined && !(key in props))
    if (unknown.length) {
      throw new Error(
        `unknown argument(s) for ${toolName}: ${unknown.join(', ')}. Allowed: ${allowed.join(', ') || '(none)'}`,
      )
    }
  }

  if (!props) return
  for (const [key, spec] of Object.entries(props)) {
    const value = args[key]
    if (value === undefined) continue
    if (!isPlainObject(spec)) continue
    validateSchemaValue(toolName, key, spec, value, required.includes(key))
  }
}

function raceAbort<T>(signal: AbortSignal, work: Promise<T>): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('cancelled'))
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('cancelled'))
    signal.addEventListener('abort', onAbort, { once: true })
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

function stringify(value: unknown) {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export const name = 'tools'
export const inject = [] as const

export function apply(ctx: Context) {
  new ToolsService(ctx)
}
