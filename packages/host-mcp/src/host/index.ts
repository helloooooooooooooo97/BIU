import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { Service, type Context } from 'cordis'
import { currentAccountId, currentRequestWorkspaceId, currentTenantScope, dataHome, dataPath } from '@biu/host-plugin-loader/data-dir'
import { getRuntimePolicy } from '@biu/host-plugin-loader/runtime'
import { TenantStateMap } from '@biu/host-plugin-loader/tenant-state'
import { mcpCollection } from './collection.ts'
import { McpConnection, type McpToolInfo } from './client.ts'
import { applyHostServer } from './serve.ts'
import {
  incompleteReason,
  mcpConfigPath,
  normalizeServerConfig,
  normalizeToolFilter,
  readMcpConfig,
  toolAllowed,
  writeMcpConfig,
  type McpServerConfig,
  type McpToolFilter,
} from './config.ts'

const CLOUD_STDIO_ERROR = 'stdio MCP servers are disabled in cloud runtime'

function assertCloudTransportAllowed(transport: McpServerConfig['transport']) {
  if (!getRuntimePolicy().allowHostProcess && transport === 'stdio') {
    throw new Error(CLOUD_STDIO_ERROR)
  }
}

export type McpStatus = 'idle' | 'connecting' | 'ready' | 'error'

export type McpServerRow = {
  id: string
  transport: McpServerConfig['transport']
  command: string
  args: string[]
  url: string
  cwd: string
  enabled: boolean
  builtin: boolean
  status: McpStatus
  error: string
  serverName: string
  serverVersion: string
  connectedAt: number
  /** 过滤后暴露给 Agent 的工具数 / 服务器实际提供的工具数 */
  toolCount: number
  totalToolCount: number
  allow: string[]
  deny: string[]
}

/** 进程内 echo：不依赖子进程，让 MCP 这条缝在没有任何外部 server 时也可自检。 */
const ECHO_TOOLS: McpToolInfo[] = [
  {
    name: 'mcp_echo',
    description: 'echo arguments',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
]

type ServerState = {
  config: McpServerConfig
  status: McpStatus
  error: string
  tools: McpToolInfo[]
  connection?: McpConnection
  connectedAt: number
  builtin: boolean
}

function echoState(): ServerState {
  return {
    config: normalizeServerConfig('echo', { command: 'builtin:echo' })!,
    status: 'ready',
    error: '',
    tools: ECHO_TOOLS,
    connectedAt: Date.now(),
    builtin: true,
  }
}

function sanitizeWorkspaceSegment(id: string): string {
  return id.trim().replace(/[^a-zA-Z0-9_-]/g, '')
}

function sanitizeAccountSegment(id: string): string {
  return id.trim().replace(/[^a-zA-Z0-9_-]/g, '')
}

const MCP_DIAL_KEYS = ['transport', 'command', 'args', 'env', 'cwd', 'url', 'headers'] as const

export class McpService extends Service {
  private defaultServers = new Map<string, ServerState>()
  private tenantServers: TenantStateMap<Map<string, ServerState>>
  private workspaceConfigs = new Map<string, Map<string, McpServerConfig>>()
  private workspaceRevisions = new Map<string, number>()
  private bucketRevisions = new WeakMap<Map<string, ServerState>, number>()
  private userEnabledCache = new Map<string, Map<string, boolean>>()
  private configPath: string

  constructor(ctx: Context) {
    super(ctx, 'mcp')
    this.configPath = mcpConfigPath()
    this.defaultServers.set('echo', echoState())
    this.tenantServers = new TenantStateMap(ctx, {
      onDispose: (bucket) => {
        for (const state of bucket.values()) void state.connection?.close()
      },
    })
    ctx.effect(() => {
      const offDeleted = ctx.on('workspace/deleted', ({ workspaceId }) => {
        const safe = sanitizeWorkspaceSegment(String(workspaceId ?? ''))
        if (!safe) return
        this.workspaceConfigs.delete(safe)
        this.workspaceRevisions.delete(safe)
        for (const key of [...this.userEnabledCache.keys()]) {
          if (key.startsWith(`${safe}\0`)) this.userEnabledCache.delete(key)
        }
      })
      const offRevoked = ctx.on('tenant/revoked', ({ accountId, workspaceId }) => {
        const safeAcc = sanitizeAccountSegment(String(accountId ?? ''))
        const safeWs = workspaceId ? sanitizeWorkspaceSegment(String(workspaceId)) : ''
        for (const key of [...this.userEnabledCache.keys()]) {
          const [ws, acc] = key.split('\0')
          if (safeAcc && acc !== safeAcc) continue
          if (safeWs && ws !== safeWs) continue
          this.userEnabledCache.delete(key)
        }
      })
      return () => {
        offDeleted()
        offRevoked()
        void this.closeAll()
      }
    }, 'mcp.dispose-all')
    ctx.inject(['database'], (inner) => {
      inner.database.register(mcpCollection(this))
    })
  }

  private isTenantIsolated() {
    return getRuntimePolicy().authzMode === 'rbac'
  }

  private currentWorkspaceSegment(): string {
    const raw = currentRequestWorkspaceId().trim() || currentTenantScope().workspaceId.trim()
    return sanitizeWorkspaceSegment(raw)
  }

  private currentConfigPath(wsId = this.currentWorkspaceSegment()) {
    if (!this.isTenantIsolated()) return this.configPath
    if (!wsId) throw new Error('workspace scope is required in cloud runtime')
    return dataPath(dataHome(), 'mcp', `${wsId}.json`)
  }

  private userEnabledScope(): {
    wsId: string
    accountId: string
    rawWorkspaceId: string
    rawAccountId: string
  } | null {
    if (!this.isTenantIsolated()) return null
    const rawWorkspaceId = currentRequestWorkspaceId().trim() || currentTenantScope().workspaceId.trim()
    const rawAccountId = currentAccountId().trim() || currentTenantScope().accountId.trim()
    const wsId = sanitizeWorkspaceSegment(rawWorkspaceId)
    const accountId = sanitizeAccountSegment(rawAccountId)
    if (!wsId || !accountId) return null
    return { wsId, accountId, rawWorkspaceId, rawAccountId }
  }

  private userEnabledDir(wsId: string): string {
    return dataPath(dataHome(), 'mcp', `${wsId}.user-enabled`)
  }

  private userEnabledFilePath(wsId: string, accountId: string): string {
    return dataPath(dataHome(), 'mcp', `${wsId}.user-enabled`, `${accountId}.json`)
  }

  private loadUserEnabledMap(wsId: string, accountId: string): Map<string, boolean> {
    const key = `${wsId}\0${accountId}`
    const hit = this.userEnabledCache.get(key)
    if (hit) return hit
    const map = new Map<string, boolean>()
    const filePath = this.userEnabledFilePath(wsId, accountId)
    try {
      if (existsSync(filePath)) {
        const raw = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          for (const [k, v] of Object.entries(raw)) {
            if (typeof v === 'boolean') map.set(k, v)
          }
        }
      }
    } catch {
      /* 忽略损坏或尚未创建的个人开关文件 */
    }
    this.userEnabledCache.set(key, map)
    return map
  }

  private writeUserEnabled(wsId: string, accountId: string, serverId: string, enabled: boolean) {
    const map = this.loadUserEnabledMap(wsId, accountId)
    map.set(serverId, enabled)
    mkdirSync(this.userEnabledDir(wsId), { recursive: true })
    writeFileSync(this.userEnabledFilePath(wsId, accountId), JSON.stringify(Object.fromEntries(map), null, 2), 'utf8')
  }

  private isServerOwner(id: string, workspaceId: string, accountId: string): boolean {
    const account = this.ctx.get('account' as never) as
      | {
          store?: {
            collectionRecordOwners?: (ws: string, collection: string) => Map<string, string>
          }
        }
      | undefined
    const owners = account?.store?.collectionRecordOwners?.(workspaceId, '/mcp')
    if (!owners) return true
    const ownerId = owners.get(id)
    if (!ownerId) return false
    return ownerId === accountId
  }

  private resolveEnabled(id: string, config: McpServerConfig): boolean {
    const scope = this.userEnabledScope()
    if (!scope) return config.enabled
    const map = this.loadUserEnabledMap(scope.wsId, scope.accountId)
    if (map.has(id)) return map.get(id)!
    if (this.isServerOwner(id, scope.rawWorkspaceId, scope.rawAccountId)) {
      return config.enabled
    }
    return false
  }

  private sharedConfigsFor(wsId: string): Map<string, McpServerConfig> {
    let map = this.workspaceConfigs.get(wsId)
    if (!map) {
      map = new Map<string, McpServerConfig>()
      for (const config of readMcpConfig(this.currentConfigPath(wsId))) {
        if (config.id === 'echo') continue
        map.set(config.id, config)
      }
      this.workspaceConfigs.set(wsId, map)
      this.workspaceRevisions.set(wsId, (this.workspaceRevisions.get(wsId) ?? 0) + 1)
    }
    return map
  }

  private persistWorkspaceShared(wsId: string) {
    const configs = [...this.sharedConfigsFor(wsId).values()]
    writeMcpConfig(configs, this.currentConfigPath(wsId))
    this.workspaceRevisions.set(wsId, (this.workspaceRevisions.get(wsId) ?? 0) + 1)
  }

  private syncBucketFromWorkspace(bucket: Map<string, ServerState>, wsId: string) {
    const shared = this.sharedConfigsFor(wsId)
    const rev = this.workspaceRevisions.get(wsId) ?? 0
    if (this.bucketRevisions.get(bucket) === rev) return
    if (!bucket.has('echo')) bucket.set('echo', echoState())
    for (const [id, state] of [...bucket.entries()]) {
      if (state.builtin) continue
      if (!shared.has(id)) {
        void state.connection?.close()
        bucket.delete(id)
      }
    }
    for (const [id, config] of shared.entries()) {
      const existing = bucket.get(id)
      if (!existing) {
        bucket.set(id, {
          config: { ...config, args: [...config.args], env: { ...config.env }, headers: { ...config.headers }, tools: { allow: [...config.tools.allow], deny: [...config.tools.deny] } },
          status: 'idle',
          error: '',
          tools: [],
          connectedAt: 0,
          builtin: false,
        })
      } else {
        const dialChanged = MCP_DIAL_KEYS.some((key) => JSON.stringify(existing.config[key]) !== JSON.stringify(config[key]))
        existing.config = { ...config, args: [...config.args], env: { ...config.env }, headers: { ...config.headers }, tools: { allow: [...config.tools.allow], deny: [...config.tools.deny] } }
        if (dialChanged && existing.connection) {
          void existing.connection.close()
          existing.connection = undefined
          existing.tools = []
          existing.status = 'idle'
          existing.connectedAt = 0
        }
      }
    }
    this.bucketRevisions.set(bucket, rev)
  }

  private get servers(): Map<string, ServerState> {
    if (!this.isTenantIsolated()) return this.defaultServers
    const wsId = this.currentWorkspaceSegment()
    if (!wsId) return new Map([['echo', echoState()]])
    const bucket = this.tenantServers.getOrCreate(() => new Map([['echo', echoState()]]))
    this.syncBucketFromWorkspace(bucket, wsId)
    return bucket
  }

  /** 读 .biu/mcp.json 并连上当前账号 enabled 的 server。连接失败只记在行上，不拖住启动。 */
  async restore() {
    if (this.isTenantIsolated()) {
      const wsId = this.currentWorkspaceSegment()
      if (!wsId) return
      const fresh = new Map<string, McpServerConfig>()
      for (const config of readMcpConfig(this.currentConfigPath(wsId))) {
        if (config.id === 'echo') continue
        fresh.set(config.id, config)
      }
      this.workspaceConfigs.set(wsId, fresh)
      this.workspaceRevisions.set(wsId, (this.workspaceRevisions.get(wsId) ?? 0) + 1)
    } else {
      for (const config of readMcpConfig(this.currentConfigPath())) {
        if (config.id === 'echo') continue
        this.servers.set(config.id, {
          config,
          status: 'idle',
          error: '',
          tools: [],
          connectedAt: 0,
          builtin: false,
        })
      }
    }
    const bucket = this.servers
    this.changed()
    const pending = [...bucket.values()]
      // 草稿行（字段还没填齐）不去连，留在 idle 等用户补完。
      .filter((state) => !state.builtin && this.resolveEnabled(state.config.id, state.config) && !incompleteReason(state.config))
      .map((state) => this.connect(state.config.id).catch(() => undefined))
    await Promise.all(pending)
  }

  private changed() {
    this.ctx.emit('hub/change')
    try {
      this.ctx.emit('database/change')
    } catch {
      // File System 还没挂上时不影响 MCP 自身。
    }
  }

  private require(id: string) {
    const state = this.servers.get(id)
    if (!state) throw new Error(`unknown mcp server: ${id}`)
    return state
  }

  private persist() {
    if (this.isTenantIsolated()) {
      const wsId = this.currentWorkspaceSegment()
      if (!wsId) throw new Error('workspace scope is required in cloud runtime')
      this.persistWorkspaceShared(wsId)
      return
    }
    const servers = [...this.defaultServers.values()].filter((state) => !state.builtin).map((state) => state.config)
    writeMcpConfig(servers, this.currentConfigPath())
  }

  async connect(id: string) {
    const state = this.require(id)
    if (state.builtin) return this.row(state)
    if (!getRuntimePolicy().allowHostProcess && state.config.transport === 'stdio') {
      state.status = 'error'
      state.error = CLOUD_STDIO_ERROR
      this.changed()
      throw new Error(CLOUD_STDIO_ERROR)
    }
    const missing = incompleteReason(state.config)
    if (missing) {
      state.status = 'error'
      state.error = missing
      this.changed()
      throw new Error(`mcp server not configured yet: ${id} — ${missing}`)
    }
    if (state.connection) await this.disconnect(id)
    state.status = 'connecting'
    state.error = ''
    this.changed()
    try {
      const connection = await McpConnection.open(state.config)
      connection.onClosed((reason) => {
        // server 连上之后自己退出：留下痕迹，等下次显式 connect 再拉起。
        if (state.connection !== connection) return
        state.connection = undefined
        state.status = 'error'
        state.error = reason || 'mcp server closed'
        state.tools = []
        this.changed()
      })
      state.connection = connection
      state.tools = await connection.listTools()
      state.status = 'ready'
      state.connectedAt = Date.now()
      state.error = ''
    } catch (error) {
      state.status = 'error'
      state.error = String(error instanceof Error ? error.message : error)
      state.tools = []
      state.connection = undefined
      this.changed()
      throw error
    }
    this.changed()
    return this.row(state)
  }

  async disconnect(id: string) {
    const state = this.require(id)
    if (state.builtin) throw new Error('cannot disconnect built-in echo server')
    await state.connection?.close()
    state.connection = undefined
    state.tools = []
    state.status = 'idle'
    state.connectedAt = 0
    this.changed()
    return this.row(state)
  }

  /** 挂载/覆盖一台 server，落盘到共享配置。当前账号 enabled 时立刻连。 */
  async upsert(raw: Record<string, unknown> & { id: string }) {
    const config = normalizeServerConfig(raw.id, raw)
    if (!config) throw new Error(`invalid mcp server config: ${raw.id}`)
    assertCloudTransportAllowed(config.transport)
    if (config.id === 'echo') throw new Error('echo is reserved for the built-in server')
    const existing = this.servers.get(config.id)
    if (existing?.connection) await this.disconnect(config.id)
    if (this.isTenantIsolated()) {
      const wsId = this.currentWorkspaceSegment()
      if (!wsId) throw new Error('workspace scope is required in cloud runtime')
      this.sharedConfigsFor(wsId).set(config.id, config)
      this.persistWorkspaceShared(wsId)
      const scope = this.userEnabledScope()
      if (scope) this.writeUserEnabled(scope.wsId, scope.accountId, config.id, config.enabled)
      this.syncBucketFromWorkspace(this.servers, wsId)
    } else {
      this.defaultServers.set(config.id, {
        config,
        status: 'idle',
        error: '',
        tools: [],
        connectedAt: 0,
        builtin: false,
      })
      this.persist()
    }
    if (this.resolveEnabled(config.id, config)) await this.connect(config.id)
    return this.row(this.require(config.id))
  }

  private hasServerPolicy(id: string, workspaceId: string): boolean {
    const account = this.ctx.get('account' as never) as
      | {
          store?: {
            collectionRecordOwners?: (ws: string, collection: string) => Map<string, string>
          }
        }
      | undefined
    const owners = account?.store?.collectionRecordOwners?.(workspaceId, '/mcp')
    return Boolean(owners?.has(id))
  }

  async setEnabled(id: string, enabled: boolean) {
    const state = this.require(id)
    if (state.builtin) throw new Error('built-in echo server is always enabled')
    const scope = this.userEnabledScope()
    if (scope) {
      if (this.hasServerPolicy(id, scope.rawWorkspaceId) && !this.canReadServer(id)) {
        throw new Error(`permission denied: mcp server is private (${id})`)
      }
      this.writeUserEnabled(scope.wsId, scope.accountId, id, enabled)
      this.changed()
      if (!enabled) return this.disconnect(id)
      return this.connect(id)
    }
    state.config = { ...state.config, enabled }
    if (this.isTenantIsolated()) {
      const wsId = this.currentWorkspaceSegment()
      if (wsId) this.sharedConfigsFor(wsId).set(id, state.config)
    }
    this.persist()
    if (!enabled) return this.disconnect(id)
    return this.connect(id)
  }

  configOf(id: string): McpServerConfig {
    const state = this.require(id)
    return {
      ...state.config,
      enabled: state.builtin ? true : this.resolveEnabled(id, state.config),
      args: [...state.config.args],
      tools: { ...state.config.tools },
    }
  }

  /** 改 id：迁移配置并按需重连。表格里改「服务器」列走这条。 */
  async rename(id: string, nextId: string) {
    const state = this.require(id)
    if (state.builtin) throw new Error('cannot rename the built-in echo server')
    const wanted = String(nextId ?? '').trim()
    if (wanted === id) return this.row(state)
    if (this.servers.has(wanted)) throw new Error(`mcp server already exists: ${wanted}`)
    const config = normalizeServerConfig(wanted, { ...state.config, id: wanted })
    if (!config) throw new Error(`invalid mcp server id: ${nextId}`)
    const wasConnected = Boolean(state.connection)
    const wasEnabled = this.resolveEnabled(id, state.config)
    await state.connection?.close()
    if (this.isTenantIsolated()) {
      const wsId = this.currentWorkspaceSegment()
      if (!wsId) throw new Error('workspace scope is required in cloud runtime')
      const shared = this.sharedConfigsFor(wsId)
      shared.delete(id)
      shared.set(wanted, config)
      this.persistWorkspaceShared(wsId)
      for (const [key, map] of this.userEnabledCache) {
        if (!key.startsWith(`${wsId}\0`) || !map.has(id)) continue
        const prev = map.get(id)!
        map.delete(id)
        map.set(wanted, prev)
        const acc = key.slice(wsId.length + 1)
        this.writeUserEnabled(wsId, acc, wanted, prev)
      }
      this.syncBucketFromWorkspace(this.servers, wsId)
    } else {
      this.defaultServers.delete(id)
      this.defaultServers.set(wanted, {
        config,
        status: 'idle',
        error: '',
        tools: [],
        connectedAt: 0,
        builtin: false,
      })
      this.persist()
    }
    if (wasConnected || (wasEnabled && !incompleteReason(config))) {
      await this.connect(wanted).catch(() => undefined)
    }
    this.changed()
    return this.row(this.require(wanted))
  }

  /**
   * 合并配置字段。只有连接参数变了才重连；工具选择与开关各走各的路，
   * 这样在表格里改一个 deny 不会白白掐断一条正常连接。
   */
  async patchConfig(id: string, patch: Partial<McpServerConfig>) {
    const state = this.require(id)
    if (state.builtin) throw new Error('cannot edit the built-in echo server')
    const scope = this.userEnabledScope()
    const patchKeys = Object.keys(patch).filter((k) => patch[k as keyof McpServerConfig] !== undefined)
    if (scope && patchKeys.length === 1 && patchKeys[0] === 'enabled') {
      return this.setEnabled(id, patch.enabled !== false).catch(() => this.row(this.require(id)))
    }
    const before = state.config
    const beforeEnabled = this.resolveEnabled(id, before)
    const { enabled: nextEnabledRaw, ...sharedPatch } = patch
    const merged = normalizeServerConfig(id, {
      ...before,
      ...(scope ? sharedPatch : patch),
      id,
    })
    if (!merged) throw new Error(`invalid mcp server config: ${id}`)
    assertCloudTransportAllowed(merged.transport)
    const redial = MCP_DIAL_KEYS.some((key) => JSON.stringify(before[key]) !== JSON.stringify(merged[key]))
    if (scope && nextEnabledRaw !== undefined) {
      this.writeUserEnabled(scope.wsId, scope.accountId, id, nextEnabledRaw !== false)
    }
    const effectiveEnabled = this.resolveEnabled(id, merged)
    if (this.isTenantIsolated()) {
      const wsId = this.currentWorkspaceSegment()
      if (!wsId) throw new Error('workspace scope is required in cloud runtime')
      this.sharedConfigsFor(wsId).set(id, merged)
      this.persistWorkspaceShared(wsId)
      state.config = merged
      this.bucketRevisions.set(this.servers, this.workspaceRevisions.get(wsId) ?? 0)
    } else {
      state.config = merged
      this.persist()
    }
    this.changed()
    if (redial) {
      if (state.connection) await this.disconnect(id)
      if (effectiveEnabled && !incompleteReason(merged)) await this.connect(id).catch(() => undefined)
      return this.row(this.require(id))
    }
    if (effectiveEnabled !== beforeEnabled) return this.setEnabled(id, effectiveEnabled).catch(() => this.row(this.require(id)))
    return this.row(this.require(id))
  }

  /** 工具选择：只改配置，读时过滤立即生效，不需要重连。 */
  setToolFilter(id: string, filter: unknown) {
    const state = this.require(id)
    if (state.builtin) throw new Error('cannot filter the built-in echo server')
    const nextConfig = { ...state.config, tools: normalizeToolFilter(filter) }
    if (this.isTenantIsolated()) {
      const wsId = this.currentWorkspaceSegment()
      if (!wsId) throw new Error('workspace scope is required in cloud runtime')
      this.sharedConfigsFor(wsId).set(id, nextConfig)
      this.persistWorkspaceShared(wsId)
      state.config = nextConfig
      this.bucketRevisions.set(this.servers, this.workspaceRevisions.get(wsId) ?? 0)
    } else {
      state.config = nextConfig
      this.persist()
    }
    this.changed()
    return this.row(state)
  }

  async remove(id: string) {
    const state = this.require(id)
    if (state.builtin) throw new Error('cannot remove built-in echo server')
    await state.connection?.close()
    if (this.isTenantIsolated()) {
      const wsId = this.currentWorkspaceSegment()
      if (!wsId) throw new Error('workspace scope is required in cloud runtime')
      this.sharedConfigsFor(wsId).delete(id)
      this.persistWorkspaceShared(wsId)
      this.servers.delete(id)
      this.bucketRevisions.set(this.servers, this.workspaceRevisions.get(wsId) ?? 0)
      for (const [key, map] of this.userEnabledCache) {
        if (key.startsWith(`${wsId}\0`)) map.delete(id)
      }
    } else {
      this.defaultServers.delete(id)
      this.persist()
    }
    this.changed()
    return { id, removed: true }
  }

  /** 重新拉取工具清单（server 端热更新了工具时用）。 */
  async refresh(id: string) {
    const state = this.require(id)
    if (state.builtin) return this.row(state)
    if (!state.connection) return this.connect(id)
    state.tools = await state.connection.listTools()
    this.changed()
    return this.row(state)
  }

  /** 界面「新建」用：先落一行停用的 stdio 草稿，字段在表格里慢慢填。 */
  draft() {
    let id = 'new-server'
    for (let n = 2; this.servers.has(id); n++) id = `new-server-${n}`
    const config = normalizeServerConfig(id, { transport: 'stdio', command: '', enabled: false })
    if (!config) throw new Error(`cannot create mcp draft: ${id}`)
    if (this.isTenantIsolated()) {
      const wsId = this.currentWorkspaceSegment()
      if (!wsId) throw new Error('workspace scope is required in cloud runtime')
      this.sharedConfigsFor(wsId).set(id, config)
      this.persistWorkspaceShared(wsId)
      const scope = this.userEnabledScope()
      if (scope) this.writeUserEnabled(scope.wsId, scope.accountId, id, false)
      this.syncBucketFromWorkspace(this.servers, wsId)
    } else {
      this.defaultServers.set(id, {
        config,
        status: 'idle',
        error: '',
        tools: [],
        connectedAt: 0,
        builtin: false,
      })
      this.persist()
    }
    this.changed()
    return this.row(this.require(id))
  }

  /** 兼容旧签名：等价于 upsert 一台 stdio server 并连上。 */
  async addStdio(id: string, command: string, args: string[] = [], extra: Record<string, unknown> = {}) {
    await this.upsert({ ...extra, id, command, args, transport: 'stdio' })
    return this.listTools()
  }

  private canReadServer(id: string): boolean {
    if (getRuntimePolicy().authzMode !== 'rbac') return true
    const account = this.ctx.get('account' as never) as
      | {
          authorization?: {
            currentActor?: () => { accountId: string; workspaceId: string } | null
            authorize?: (
              actor: { accountId: string; workspaceId: string },
              action: string,
              resource: { type: 'record'; workspaceId: string; collection: string; recordId: string },
            ) => { allowed: boolean }
          }
        }
      | undefined
    const authz = account?.authorization
    const actor = authz?.currentActor?.()
    if (!authz?.authorize || !actor) return true
    return authz.authorize(actor, 'resource:read', {
      type: 'record',
      workspaceId: actor.workspaceId,
      collection: '/mcp',
      recordId: id,
    }).allowed
  }

  private visibleTools(state: ServerState) {
    if (state.builtin) return state.tools
    return state.tools.filter((tool) => toolAllowed(state.config.tools, tool.name))
  }

  listTools(serverId?: string) {
    const states = (serverId ? [this.require(serverId)] : [...this.servers.values()]).filter(
      (state) =>
        state.builtin ||
        (this.canReadServer(state.config.id) && this.resolveEnabled(state.config.id, state.config)),
    )
    return states.flatMap((state) =>
      this.visibleTools(state).map((tool) => ({ server: state.config.id, ...tool })),
    )
  }

  toolExecutionMode(serverId: string, name: string): 'parallel' | 'exclusive' {
    const state = this.servers.get(serverId)
    const tool = state && this.visibleTools(state).find((item) => item.name === name)
    return tool?.annotations?.readOnlyHint === true && tool.annotations.destructiveHint !== true
      ? 'parallel'
      : 'exclusive'
  }

  /** 未过滤的全量清单，供 /mcp 表勾选工具用。 */
  catalog(serverId: string) {
    const state = this.require(serverId)
    return state.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      allowed: state.builtin || toolAllowed(state.config.tools, tool.name),
    }))
  }

  private row(state: ServerState): McpServerRow {
    const info = state.connection?.serverInfo()
    // 草稿行没有真错误，但要在 error 列告诉用户还差什么。
    const missing = state.builtin ? '' : incompleteReason(state.config)
    return {
      id: state.config.id,
      transport: state.config.transport,
      command: state.config.command,
      args: [...state.config.args],
      url: state.config.url,
      cwd: state.config.cwd,
      enabled: state.builtin ? true : this.resolveEnabled(state.config.id, state.config),
      builtin: state.builtin,
      status: state.status,
      error: state.error || missing,
      serverName: info?.name ?? '',
      serverVersion: info?.version ?? '',
      connectedAt: state.connectedAt,
      toolCount: this.visibleTools(state).length,
      totalToolCount: state.tools.length,
      allow: [...state.config.tools.allow],
      deny: [...state.config.tools.deny],
    }
  }

  listServers(): McpServerRow[] {
    return [...this.servers.values()]
      .map((state) => this.row(state))
      .sort((a, b) => a.id.localeCompare(b.id))
  }

  listVisibleServers(): McpServerRow[] {
    return this.listServers().filter((row) => row.builtin || this.canReadServer(row.id))
  }

  serverIds() {
    return [...this.servers.keys()].sort()
  }

  async call(serverId: string, name: string, args: Record<string, unknown>) {
    const state = this.require(serverId)
    if (state.builtin) {
      if (name !== 'mcp_echo') throw new Error(`unknown mcp tool: ${name}`)
      return { text: String(args.text ?? '') }
    }
    if (!this.canReadServer(serverId)) {
      throw new Error(`permission denied: mcp server is private (${serverId})`)
    }
    // 工具选择是硬约束：被排除的工具即使 Agent 猜到名字也调不动。
    if (!toolAllowed(state.config.tools, name)) {
      throw new Error(`mcp tool disabled by server config: ${serverId}/${name}`)
    }
    if (!this.resolveEnabled(serverId, state.config)) {
      throw new Error(`mcp server not connected (disabled for current account): ${serverId}`)
    }
    if (!state.connection) throw new Error(`mcp server not connected: ${serverId} (${state.error || state.status})`)
    return state.connection.callTool(name, args)
  }

  private async closeAll() {
    for (const state of this.defaultServers.values()) await state.connection?.close()
    this.defaultServers.clear()
    this.tenantServers.clear()
    this.workspaceConfigs.clear()
    this.workspaceRevisions.clear()
    this.userEnabledCache.clear()
  }
}

export const name = 'mcp'
export const inject = ['tools']

export function apply(ctx: Context) {
  const mcp = new McpService(ctx)
  void mcp.restore()
  ctx.inject(['http'], (inner) => applyHostServer(inner))

  ctx.tools.register({
    name: 'mcp_servers',
    description:
      '列出已挂载的 MCP 服务器及连接状态（status: ready/idle/connecting/error）。toolCount 是工具选择后暴露的数量，totalToolCount 是服务器实际提供的数量。',
    parameters: { type: 'object', properties: {} },
    execution: 'parallel',
    execute: () => mcp.listVisibleServers(),
  })
  ctx.tools.register({
    name: 'mcp_list',
    description:
      '列出 MCP 工具（已按各服务器的工具选择过滤）。不传 server 就列全部；可传 query 按名称/简介过滤，或 include_schema=false 仅看名称和简介以大幅节省 token。',
    parameters: {
      type: 'object',
      properties: {
        server: { type: 'string', description: '只列这台服务器的工具' },
        query: { type: 'string', description: '可选：按工具名或描述子串（不区分大小写）过滤' },
        include_schema: {
          type: 'boolean',
          description: '是否包含完整 inputSchema（默认 true；传 false 仅返回 server/name/description 省 token）',
        },
      },
    },
    execution: 'parallel',
    execute: (args) => {
      const server = String(args.server ?? '').trim()
      const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : ''
      const includeSchema = args.include_schema !== false
      const listed = mcp.listTools(server || undefined)
      const filtered = query
        ? listed.filter(
            (item) =>
              item.name.toLowerCase().includes(query) ||
              String(item.description ?? '').toLowerCase().includes(query),
          )
        : listed
      if (includeSchema) return filtered
      return filtered.map(({ inputSchema: _schema, ...rest }) => rest)
    },
  })
  ctx.tools.register({
    name: 'mcp_call',
    description: '调用 MCP 工具。server 与 name 取自 mcp_list；被禁用的工具会直接报错。',
    parameters: {
      type: 'object',
      properties: {
        server: { type: 'string' },
        name: { type: 'string' },
        arguments: { type: 'object' },
      },
      required: ['server', 'name'],
    },
    execution: (args) => mcp.toolExecutionMode(String(args.server), String(args.name)),
    execute: (args) =>
      mcp.call(String(args.server), String(args.name), (args.arguments as Record<string, unknown>) ?? {}),
  })
  ctx.tools.register({
    name: 'mcp_add_stdio',
    description:
      '挂载 stdio MCP 服务（command + args），写入 .biu/mcp.json 后重启仍在。远端服务器请用 /mcp 表的 add 动作填 url。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        command: { type: 'string' },
        args: { type: 'array', items: { type: 'string' } },
        env: { type: 'object', description: '追加的环境变量' },
        cwd: { type: 'string', description: '子进程工作目录' },
      },
      required: ['id', 'command'],
    },
    execute: (args) =>
      mcp.addStdio(String(args.id), String(args.command), Array.isArray(args.args) ? args.args.map(String) : [], {
        env: args.env,
        cwd: args.cwd,
      }),
  })
  ctx.tools.register({
    name: 'mcp_remove',
    description: '卸载 MCP 服务：断开连接并从 .biu/mcp.json 删掉。只想临时停用请改用 /mcp 表的 disable 动作。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    execute: (args) => mcp.remove(String(args.id)),
  })
}

export type { McpServerConfig, McpToolFilter }
export { mcpConfigPath, parseMcpConfig, serializeMcpConfig, toolAllowed } from './config.ts'
