import { mkdirSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path'
import { Service, type Context } from 'cordis'
import { currentSessionId } from '@biu/host-sessions/scope'
import { currentRequestWorkspaceId, dataHome } from '@biu/host-plugin-loader/data-dir'
import { getRuntimePolicy } from '@biu/host-plugin-loader/runtime'
import {
  STR_REPLACE_EDITOR_DESCRIPTION,
  STR_REPLACE_EDITOR_PARAMETERS,
  runStrReplaceEditor,
} from './str-replace-editor.ts'

export const SANDBOX_VIRTUAL_WORKSPACE = '/workspace'

function requireWorkspaceSegment(id: string): string {
  const safe = id.trim().replace(/[^a-zA-Z0-9_-]/g, '')
  if (!safe) throw new Error('workspace scope is required in cloud runtime')
  return safe
}

export class FsService extends Service {
  constructor(
    ctx: Context,
    public defaultRoot: string,
  ) {
    super(ctx, 'fs')
    this.defaultRoot = resolve(defaultRoot)
  }

  /** 当前生效工作区：云端按 workspaceId 独立隔离（无 workspaceId 时 fail-closed）；本机若 Session 已绑定 host 路径则为该目录，否则默认 `.workspace`。 */
  get root() {
    return this.effectiveRoot()
  }

  effectiveRoot() {
    if (getRuntimePolicy().isolateWorkspaceDirs) {
      const wsId = requireWorkspaceSegment(currentRequestWorkspaceId())
      const dir = resolve(dataHome(), 'workspaces', wsId, 'work')
      mkdirSync(dir, { recursive: true })
      return dir
    }
    return this.sessionProjectRoot() ?? this.defaultRoot
  }

  sessionProjectRoot() {
    const sessionId = currentSessionId()
    if (!sessionId) return null
    const sessions = this.ctx.get('sessions') as { peek?: (id: string) => { project?: { path?: string } } | undefined } | undefined
    const path = sessions?.peek?.(sessionId)?.project?.path
    return path ? resolve(path) : null
  }

  resolveIn(root: string, rel: string) {
    const raw = String(rel)
    const input =
      raw === SANDBOX_VIRTUAL_WORKSPACE
        ? '.'
        : raw.startsWith(`${SANDBOX_VIRTUAL_WORKSPACE}/`)
          ? raw.slice(SANDBOX_VIRTUAL_WORKSPACE.length + 1)
          : raw
    const full = isAbsolute(input) ? resolve(input) : resolve(root, input)
    const relToRoot = relative(root, full)
    if (relToRoot.startsWith('..') || (!isAbsolute(input) && normalize(input).startsWith('..'))) {
      throw new Error('path escapes workspace')
    }
    return full
  }

  async readIn(root: string, rel: string) {
    const path = this.resolveIn(root, rel)
    this.ctx.emit('fs/read', rel)
    return readFile(path, 'utf8')
  }

  async writeIn(root: string, rel: string, content: string) {
    const path = this.resolveIn(root, rel)
    await mkdir(dirname(path), { recursive: true })
    this.ctx.emit('fs/write', rel)
    await writeFile(path, content, 'utf8')
    return { ok: true, path: rel }
  }

  async listIn(root: string, rel = '.') {
    const path = this.resolveIn(root, rel)
    this.ctx.emit('fs/list', rel)
    return readdir(path)
  }

  resolve(rel: string) {
    return this.resolveIn(this.effectiveRoot(), rel)
  }

  async read(rel: string) {
    return this.readIn(this.effectiveRoot(), rel)
  }

  async write(rel: string, content: string) {
    return this.writeIn(this.effectiveRoot(), rel, content)
  }

  async list(rel = '.') {
    return this.listIn(this.effectiveRoot(), rel)
  }

  /** 稳定工作区（defaultRoot，不随 Session 绑定漂移）：供 DB 集合等需要固定落盘的场景使用。 */
  get workspace(): WorkspaceFs {
    const root = this.defaultRoot
    return {
      resolve: (rel: string) => this.resolveIn(root, rel),
      read: (rel: string) => this.readIn(root, rel),
      write: (rel: string, content: string) => this.writeIn(root, rel, content),
      list: (rel?: string) => this.listIn(root, rel ?? '.'),
    }
  }
}

export type WorkspaceFs = {
  resolve: (rel: string) => string
  read: (rel: string) => Promise<string>
  write: (rel: string, content: string) => Promise<unknown>
  list: (rel?: string) => Promise<string[]>
}

export const name = 'fs'
export const inject = ['tools']

const DEFAULT_FS_READ_MAX_BYTES = 32 * 1024
const DEFAULT_FS_LIST_LIMIT = 200

export function apply(ctx: Context, config: { root?: string } = {}) {
  const root = config.root ?? process.env.CORDIS_WORKSPACE ?? join(process.cwd(), '.workspace')
  const fs = new FsService(ctx, root)
  void mkdir(root, { recursive: true })
  ctx.tools.register({
    name: 'fs_read',
    description: '读取工作区内文件（若 Session 已绑定项目路径，则为该目录）。默认最多返回 32KB 防止上下文溢出；大文件建议传 view_range=[start, end]（1-based，end=-1 到末尾）或 max_bytes。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        view_range: {
          type: 'array',
          items: { type: 'integer' },
          description: '可选：1-based 行区间 [start, end]（end=-1 表示到末尾），返回带行号的片段',
        },
        max_bytes: {
          type: 'integer',
          description: '可选：最大返回字符/字节数（默认 32768），超出部分自动截断并提示',
        },
      },
      required: ['path'],
    },
    execution: 'parallel',
    annotations: { readOnly: true, idempotent: true },
    execute: async (args) => {
      const text = await fs.read(String(args.path))
      let output = text
      const hasRange = Array.isArray(args.view_range) && args.view_range.length > 0
      if (hasRange) {
        const lines = text.split('\n')
        const start = Number((args.view_range as unknown[])[0])
        const endRaw = (args.view_range as unknown[]).length > 1 ? Number((args.view_range as unknown[])[1]) : start
        if (!Number.isInteger(start) || start < 1) throw new Error('view_range start must be a positive integer')
        const end = endRaw === -1 ? lines.length : endRaw
        if (!Number.isInteger(end) || end < start) throw new Error('invalid view_range')
        const width = String(Math.max(lines.length, 1)).length
        output = lines
          .slice(start - 1, Math.min(end, lines.length))
          .map((line, i) => `${String(start + i).padStart(width)}\t${line}`)
          .join('\n')
      }
      const limit = typeof args.max_bytes === 'number' && args.max_bytes > 0
        ? args.max_bytes
        : DEFAULT_FS_READ_MAX_BYTES
      if (output.length > limit) {
        const omitted = output.length - limit
        output = `${output.slice(0, limit)}\n... [truncated ${omitted} chars; pass view_range or max_bytes to read specific lines]`
      }
      return output
    },
  })
  ctx.tools.register({
    name: 'fs_write',
    description: '写入工作区内文件（若 Session 已绑定项目路径，则为该目录）',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
    },
    annotations: { readOnly: false, destructive: true },
    execute: (args) => fs.write(String(args.path), String(args.content ?? '')),
  })
  ctx.tools.register({
    name: 'fs_list',
    description: '列出工作区目录（若 Session 已绑定项目路径，则为该目录）。默认最多返回 200 项，超出时截断提示。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        limit: { type: 'integer', description: '可选：最大返回条目数，默认 200' },
      },
    },
    execution: 'parallel',
    annotations: { readOnly: true, idempotent: true },
    execute: async (args) => {
      const items = await fs.list(String(args.path || '.'))
      const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.floor(args.limit) : DEFAULT_FS_LIST_LIMIT
      if (items.length <= limit) return items
      return {
        items: items.slice(0, limit),
        total: items.length,
        truncated: true,
        note: `showing first ${limit} of ${items.length} entries; pass limit or narrow path`,
      }
    },
  })
  ctx.tools.register({
    name: 'str_replace_editor',
    description: STR_REPLACE_EDITOR_DESCRIPTION,
    parameters: { ...STR_REPLACE_EDITOR_PARAMETERS },
    annotations: (args) => ({ readOnly: args.command === 'view' }),
    execute: (args) => runStrReplaceEditor(fs, args),
  })

  ctx.inject(['systemPrompt', 'sessions'], (inner) => {
    inner.systemPrompt.register('session.project', () => {
      const sessionId = currentSessionId()
      if (!sessionId) return ''
      const project = inner.sessions.peek(sessionId)?.project
      if (!project?.path) return ''
      return `当前 Session 绑定 host 工作区「${project.name}」：${project.path}。bash / 文件工具直接读写该目录（对齐 dsh workspace cwd）。`
    })
  })
}
