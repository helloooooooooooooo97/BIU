import type { Context } from 'cordis'
import {
  DATABASE_CHANNEL,
  databaseChannelPayload,
  parseContentJump,
  type CollectionListQuery,
} from '@biu/type-file-system'
import { databaseRevealForTool } from '../paths.ts'
import { currentSessionId } from '@biu/host-sessions/scope'
import { AgentDbCompact } from './agent-payload.ts'
import { resolveContentCommand } from './content-edit.ts'
import { clientViewFromDbRow } from './saved-views.ts'
import { asColumnKeys, asCreateRecords, asDeleteQuery, asFilter } from './schema-coerce.ts'

export const DATABASE_TOOL_NAMES = new Set([
  'db_list',
  'db_read',
  'db_update',
  'db_create',
  'db_delete',
  'db_restore',
  'db_action',
  'db_stat',
  'db_content',
  'db_media',
  'db_file',
])

export type DatabaseToolsTarget = {
  list(
    path: string,
    filter?: Record<string, unknown>,
    page?: {
      q?: string
      sortField?: string
      sortDir?: 'asc' | 'desc'
      limit?: number
      offset?: number
      columns?: string[]
    },
  ): Promise<unknown>
  read(path: string): Promise<unknown>
  update(path: string, content: unknown): Promise<unknown>
  resolveViewFilter?(
    collectionPath: string,
    viewId: string,
  ): {
    viewId: string
    viewName: string
    filter: Record<string, unknown>
    q?: string
    sortField?: string
    sortDir?: 'asc' | 'desc'
  }
  batchUpdate?(
    collectionPath: string,
    options: {
      ids?: string[]
      viewId?: string
      filter?: Record<string, unknown>
      q?: string
      fields?: Record<string, unknown>
      updates?: Array<{ id: string; fields: Record<string, unknown> }>
      dryRun?: boolean
      maxRecords?: number
    },
  ): Promise<unknown>
  create(
    path: string,
    content?: unknown,
    options?: { scope?: 'personal' | 'workspace' | 'shared' | 'local' },
  ): Promise<unknown>
  remove(path: string, query?: CollectionListQuery): Promise<unknown>
  restore(path: string, query?: CollectionListQuery): Promise<unknown>
  action(path: string, actionId: string, args?: Record<string, unknown>): Promise<unknown>
  stat(path: string): Promise<unknown>
  editContent(path: string, args?: Record<string, unknown>): Promise<unknown>
  editAsset(path: string, args?: Record<string, unknown>): Promise<unknown>
  editDoc(path: string, args?: Record<string, unknown>): Promise<unknown>
}

const agentDbCompact = new AgentDbCompact()

function rowFromToolResult(result: unknown): Record<string, unknown> | undefined {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return undefined
  const rec = result as { kind?: unknown; items?: unknown; value?: unknown }
  if (rec.kind === 'created') {
    const items = rec.items
    if (!Array.isArray(items) || !items[0] || typeof items[0] !== 'object') return undefined
    const value = (items[0] as { value?: unknown }).value
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    return value as Record<string, unknown>
  }
  if (rec.kind === 'record') {
    const value = rec.value
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    return value as Record<string, unknown>
  }
  return undefined
}

function savedViewFromToolResult(result: unknown) {
  return clientViewFromDbRow(rowFromToolResult(result))
}

function broadcastInspectorReveal(
  ctx: Context,
  path: string,
  result: unknown,
  dropRecord: boolean,
  phase: 'working' | 'done',
) {
  const reveal = databaseRevealForTool({ path, result, dropRecord })
  if (!reveal) return
  const http = ctx.get('http') as { broadcast?: (type: string, payload: unknown) => void } | undefined
  const contentJump = phase === 'done' ? parseContentJump(result) : null
  const savedView = savedViewFromToolResult(result)
  http?.broadcast?.(
    DATABASE_CHANNEL,
    databaseChannelPayload(savedView ? 'views' : 'records', {
      reveal,
      phase,
      sessionId: currentSessionId(),
      ...(savedView ? { savedView } : {}),
      ...(contentJump ? { contentJump } : {}),
    }),
  )
}

async function withInspectorReveal<T>(
  ctx: Context,
  path: string,
  op: () => T | Promise<T>,
  dropRecord = false,
) {
  const sessionId = currentSessionId()?.trim()
  if (!sessionId) {
    const result = await op()
    const savedView = savedViewFromToolResult(result)
    if (savedView) {
      const http = ctx.get('http') as { broadcast?: (type: string, payload: unknown) => void } | undefined
      http?.broadcast?.(DATABASE_CHANNEL, databaseChannelPayload('views', { savedView }))
    }
    return result
  }
  broadcastInspectorReveal(ctx, path, undefined, dropRecord, 'working')
  try {
    const result = await op()
    broadcastInspectorReveal(ctx, path, result, dropRecord, 'done')
    return result
  } catch (error) {
    broadcastInspectorReveal(ctx, path, undefined, dropRecord, 'done')
    throw error
  }
}

export function registerDatabaseTools(ctx: Context, db: DatabaseToolsTarget) {
  const registerDbTool = (def: Parameters<typeof ctx.tools.register>[0]) => {
    ctx.tools.register(def)
  }
  registerDbTool({
    name: 'db_list',
    description: '列出 File System 路径：/ 为已登记表（path、中文名、view.blurb 说明书），/<表> 返回列式 JSON { columns: string[], rows: unknown[][], total }（不含 content、默认不含 createdAt/updatedAt/createdBy/updatedBy）。默认每页 20，最多 200。可传 view_id（视图 id 或名称）直接按已保存视图的筛选/排序条件查询；columns 参数只取需要的列；count_only=true 只返回 { path, total } 省 token。表结构用 db_stat。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        view_id: { type: 'string', description: '可选，按已保存视图的 id 或名称复用其筛选与排序条件（与 viewId 等价）' },
        viewId: { type: 'string' },
        filter: { type: 'object', description: '可选，按列等值过滤' },
        q: { type: 'string', description: '可选，全文搜索' },
        sort_field: { type: 'string', description: '排序字段名（与 sortField 等价）' },
        sort_dir: { type: 'string', enum: ['asc', 'desc'], description: '排序方向（与 sortDir 等价）' },
        sortField: { type: 'string' },
        sortDir: { type: 'string', enum: ['asc', 'desc'] },
        limit: { type: 'number', description: '每页条数，默认 20，最大 200' },
        offset: { type: 'number' },
        columns: {
          type: 'array',
          items: { type: 'string' },
          description: '可选，只返回这些列。始终带 id。label 等于标题列（默认 title）。不传则除 content 外全返回。标签属性列写成 tag::<标签id>::<字段key>，例如 tag::tag::category。',
        },
        count_only: {
          type: 'boolean',
          description: 'true 时仅返回 { path, total }，不返回任何行数据，适合统计数量',
        },
      },
      required: ['path'],
    },
    execution: 'parallel',
    annotations: { readOnly: true, idempotent: true },
    execute: (args) => {
      const path = String(args.path)
      const countOnly = args.count_only === true
      const rawViewId = args.view_id ?? args.viewId
      const viewResolved =
        typeof rawViewId === 'string' && rawViewId.trim() && db.resolveViewFilter
          ? db.resolveViewFilter(path, rawViewId.trim())
          : null
      const explicitFilter = asFilter(args.filter)
      const mergedFilter =
        viewResolved || explicitFilter
          ? { ...(viewResolved?.filter ?? {}), ...(explicitFilter ?? {}) }
          : undefined
      const rawSortField = args.sort_field ?? args.sortField ?? viewResolved?.sortField
      const rawSortDir = args.sort_dir ?? args.sortDir ?? viewResolved?.sortDir
      const q = args.q != null ? String(args.q) : (viewResolved?.q ?? '')
      return withInspectorReveal(ctx, path, () =>
        db
          .list(path, mergedFilter && Object.keys(mergedFilter).length ? mergedFilter : undefined, {
            q,
            sortField: rawSortField != null ? String(rawSortField) : '',
            sortDir: rawSortDir === 'desc' ? 'desc' : 'asc',
            limit: countOnly ? 1 : args.limit != null ? Number(args.limit) : undefined,
            offset: countOnly ? 0 : args.offset != null ? Number(args.offset) : undefined,
            columns: countOnly ? ['id'] : asColumnKeys(args.columns),
          })
          .then((body) => {
            if (countOnly) {
              const total =
                body && typeof body === 'object' && typeof (body as { total?: unknown }).total === 'number'
                  ? (body as { total: number }).total
                  : Array.isArray((body as { items?: unknown[] })?.items)
                    ? (body as { items: unknown[] }).items.length
                    : 0
              return { path, total }
            }
            return agentDbCompact.query(body)
          }),
      )
    },
  })
  registerDbTool({
    name: 'db_read',
    description: '读取单条或多条记录（path 或 paths）：返回记录 JSON（空字段省略）。默认不含正文；传 include_content=true 可在同一次调用里附带前 content_lines（默认 80）行正文预览，省去再调 db_content。查表列表请用 db_list。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '单条记录路径，如 /pages/<id>' },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: '批量读取多条记录路径（与 path 二选一），一次返回 { items } 减少轮次',
        },
        include_content: {
          type: 'boolean',
          description: 'true 时同时返回正文预览（前 content_lines 行），避免再调一次 db_content',
        },
        content_lines: {
          type: 'integer',
          description: 'include_content=true 时返回的最大正文行数，默认 80',
        },
      },
    },
    execution: 'parallel',
    annotations: { readOnly: true, idempotent: true },
    execute: async (args, signal) => {
      const includeContent = args.include_content === true
      const contentLines = typeof args.content_lines === 'number' && args.content_lines > 0 ? args.content_lines : 80
      const readOne = async (targetPath: string) => {
        if (signal.aborted) throw new Error('cancelled')
        const row = agentDbCompact.query(await db.read(targetPath))
        if (!includeContent) return row
        try {
          const content = agentDbCompact.query(
            await db.editContent(targetPath, { command: 'view', view_range: [1, contentLines] }),
          )
          if (row && typeof row === 'object' && !Array.isArray(row)) {
            return { ...(row as Record<string, unknown>), content }
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          if (row && typeof row === 'object' && !Array.isArray(row) && !/no content field/i.test(msg)) {
            return { ...(row as Record<string, unknown>), contentError: msg }
          }
        }
        return row
      }
      if (Array.isArray(args.paths) && args.paths.length > 0) {
        const list = args.paths.map((item) => String(item).trim()).filter(Boolean)
        if (!list.length) throw new Error('paths must contain at least one path')
        const items = []
        for (const p of list) {
          if (signal.aborted) throw new Error('cancelled')
          items.push(await readOne(p))
        }
        return { items }
      }
      if (typeof args.path !== 'string' || !args.path.trim()) {
        throw new Error('path or paths is required for db_read')
      }
      const target = String(args.path)
      return withInspectorReveal(ctx, target, () => readOne(target))
    },
  })
  registerDbTool({
    name: 'db_update',
    description: '按表结构 schema 的可写字段更新已有记录，支持单条与批量两种模式：1）单条更新：path 为 /<表>/<id>，属性对象传在 fields 中，可选传 content 整篇覆写正文（也可只传 content 单独覆写正文）；2）批量更新：path 为表路径 /<表>（如 /pages），传 view_id（视图 id 或名称）、ids、filter、q 之一配合 fields 统一打补丁，或传 updates=[{id, fields}] 逐条异构更新；可先传 dry_run=true 预览命中条数。标签 tag 统一按标签 id 分组写 values：{tags:["tag-2"],values:{"tag-2":{导演:"查泽雷"}}}（支持直接传对象或 JSON 字符串，含 + / - 等符号键名均可）；省略 tags 则合并更新当前已贴标签的属性，不撕掉其它标签。新建用 db_create，局部改正文用 db_content。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '单条路径 /<表>/<id>，或批量模式表路径 /<表>' },
        fields: {
          type: 'object',
          description:
            '要更新的字段对象（单条模式传 content 时可省略）。标签写 tag：{tag:{tags:["tag-2"],values:{"tag-2":{导演:"查泽雷"}}}}（支持对象或 JSON 字符串）。省略 tags 只改属性，不撕掉其它标签。',
        },
        content: {
          type: 'string',
          description: '可选（单条模式）：整篇覆写该记录的 Markdown 正文（可与 fields 同传或单独传入），省去再调一次 db_content',
        },
        view_id: {
          type: 'string',
          description: '可选（批量模式）：按已保存视图的 id 或名称命中全部记录',
        },
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: '可选（批量模式）：显式要更新的记录 id 列表',
        },
        filter: {
          type: 'object',
          description: '可选（批量模式）：按列等值过滤命中记录',
        },
        q: {
          type: 'string',
          description: '可选（批量模式）：全文搜索条件',
        },
        updates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              fields: { type: 'object' },
            },
            required: ['id', 'fields'],
          },
          description: '可选（批量模式）：每条记录写不同值的异构更新数组',
        },
        dry_run: {
          type: 'boolean',
          description: '可选（批量模式）：true 时仅预览命中条数与样本 ID，不落库',
        },
        max_records: {
          type: 'number',
          description: '可选（批量模式）：单次最大更新条数，默认 200，上限 500',
        },
      },
      required: ['path'],
    },
    annotations: { readOnly: false, idempotent: true },
    execute: (args) => {
      const target = String(args.path)
      const segments = target.split('/').filter(Boolean)
      const isBatch =
        segments.length === 1 ||
        args.view_id != null ||
        Array.isArray(args.ids) ||
        Array.isArray(args.updates) ||
        args.dry_run === true
      if (isBatch) {
        if (!db.batchUpdate) throw new Error('batch update is not supported by this database target')
        return withInspectorReveal(ctx, target, () =>
          db.batchUpdate!(target, {
            ids: Array.isArray(args.ids) ? args.ids.map((item) => String(item)) : undefined,
            viewId: typeof args.view_id === 'string' ? args.view_id : undefined,
            filter: asFilter(args.filter),
            q: typeof args.q === 'string' ? args.q : undefined,
            fields:
              args.fields && typeof args.fields === 'object' && !Array.isArray(args.fields)
                ? (args.fields as Record<string, unknown>)
                : undefined,
            updates: Array.isArray(args.updates)
              ? (args.updates as Array<{ id: string; fields: Record<string, unknown> }>)
              : undefined,
            dryRun: args.dry_run === true,
            maxRecords: args.max_records != null ? Number(args.max_records) : undefined,
          }),
        ).then((body) => agentDbCompact.write(body))
      }
      const payload = (args.fields && typeof args.fields === 'object' && !Array.isArray(args.fields)
        ? args.fields
        : {}) as Record<string, unknown>
      const hasFields = Object.keys(payload).length > 0
      const hasContent = typeof args.content === 'string'
      if (!hasFields && !hasContent) {
        throw new Error('fields must include at least one field to update')
      }
      return withInspectorReveal(ctx, target, async () => {
        const updated = hasFields ? await db.update(target, payload) : { kind: 'record' as const, path: target }
        if (hasContent) {
          await db.editContent(target, { command: 'write', value: args.content as string })
        }
        return updated
      }).then((body) => agentDbCompact.write(body))
    },
  })
  registerDbTool({
    name: 'db_create',
    description: '在已登记且允许新建的表中新增记录。路径为 /<表>，传 records 非空对象数组；记录内可直接附带正文（字段名 content）及标签 tag（支持对象 {tags:["tag-2"],values:{"tag-2":{...}}} 或 JSON 字符串，含 + / - 等符号键名均可一步写入）。成功返回 {ok, path, ids}（单条带标签时附带 tag）。能否新建看 db_stat 的 caps。新建标签用 db_create path=/tags records=[{title}]。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        records: {
          type: 'array',
          items: { type: 'object' },
          description: '要创建的记录（非空对象数组），按 schema 可写字段给初值；正文用 content 字段，标签 tag 支持对象或 JSON 字符串',
        },
        scope: {
          type: 'string',
          enum: ['personal', 'workspace', 'shared', 'local'],
          description: '根记录归属：personal 私人（默认，仅自己可见）；workspace 空间（成员可编辑）；shared 公开链接，所有人可查看；local 存在本机，仍属于当前账号和空间。子记录始终继承父记录。',
        },
      },
      required: ['path', 'records'],
    },
    annotations: { readOnly: false },
    execute: (args) =>
      withInspectorReveal(ctx, String(args.path), () =>
        db.create(String(args.path), asCreateRecords(args), {
          scope: (args.scope as 'personal' | 'workspace' | 'shared' | 'local' | undefined) ?? 'personal',
        }),
      ).then(
        (body) => agentDbCompact.write(body),
      ),
  })
  registerDbTool({
    name: 'db_delete',
    description: '按条件把记录放进回收站（软删除）。路径为 /<表>，必须带 ids、q 或 filter 之一。purge=true 才从原表彻底删掉。成功返回 {ok, path, ids}。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        ids: { type: 'array', items: { type: 'string' }, description: '要删除的 id 列表' },
        q: { type: 'string', description: '全文搜索条件' },
        filter: { type: 'object', description: '按列等值过滤' },
        purge: { type: 'boolean', description: 'true 时彻底删除，不再进回收站' },
      },
      required: ['path'],
    },
    annotations: { readOnly: false, destructive: true },
    execute: (args) =>
      withInspectorReveal(ctx, String(args.path), () => db.remove(String(args.path), asDeleteQuery(args)), true).then(
        (body) => agentDbCompact.write(body),
      ),
  })
  registerDbTool({
    name: 'db_restore',
    description: '从回收站恢复记录。路径为 /<表>，必须带 ids、q 或 filter 之一。记录仍在原表，只是去掉删除标记。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        ids: { type: 'array', items: { type: 'string' }, description: '要恢复的 id 列表' },
        q: { type: 'string' },
        filter: { type: 'object' },
      },
      required: ['path'],
    },
    annotations: { readOnly: false, idempotent: true },
    execute: (args) =>
      withInspectorReveal(ctx, String(args.path), () => db.restore(String(args.path), asDeleteQuery(args))).then(
        (body) => agentDbCompact.write(body),
      ),
  })
  registerDbTool({
    name: 'db_action',
    description:
      '对一条记录执行该表登记的动作。路径为 /<表>/<id>，action 为动作 id（见 db_stat 的 schema.actions）。成功返回 {ok, path}，有返回值时带 result，不回整行。需要参数时放在 args。任务派工/汇报、代理压缩/进度、插件创建/打包一律走这里。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        action: { type: 'string' },
        args: { type: 'object', description: '可选，动作参数（见 schema.actions[].parameters）' },
      },
      required: ['path', 'action'],
    },
    annotations: { readOnly: false },
    execute: (args) =>
      withInspectorReveal(ctx, String(args.path), () =>
        db.action(
          String(args.path),
          String(args.action),
          args.args && typeof args.args === 'object' && !Array.isArray(args.args)
            ? (args.args as Record<string, unknown>)
            : undefined,
        ),
      ).then((body) => agentDbCompact.write(body)),
  })
  registerDbTool({
    name: 'db_stat',
    description: `${agentDbCompact.statBlurb} 传 include_tags=true 可一次附带工作区标签定义摘要（id、名称、属性名与类型），写标签属性前无需再额外查 /tags。`,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        include_tags: {
          type: 'boolean',
          description: 'true 时附带工作区标签定义摘要（id、title、fields），省去再查 /tags',
        },
      },
      required: ['path'],
    },
    execution: 'parallel',
    annotations: { readOnly: true, idempotent: true },
    execute: async (args) => {
      const stat = agentDbCompact.query(await db.stat(String(args.path)))
      if (args.include_tags !== true || !stat || typeof stat !== 'object' || Array.isArray(stat)) return stat
      try {
        const listed = (await db.list('/tags', undefined, { limit: 200 })) as {
          items?: Array<Record<string, unknown>>
        }
        const tags = (listed.items ?? []).map((item) => {
          let fields: unknown = item.fields
          if (typeof fields === 'string') {
            try {
              fields = JSON.parse(fields)
            } catch {
              fields = []
            }
          }
          const summary = Array.isArray(fields)
            ? fields
                .filter((f): f is Record<string, unknown> => Boolean(f && typeof f === 'object'))
                .map((f) => ({
                  key: String(f.key ?? ''),
                  type: String(f.type ?? 'string'),
                  ...(f.example !== undefined ? { example: f.example } : {}),
                }))
            : []
          return { id: String(item.id ?? ''), title: String(item.title ?? ''), fields: summary }
        })
        return { ...(stat as Record<string, unknown>), tags }
      } catch (error) {
        return {
          ...(stat as Record<string, unknown>),
          tagsError: error instanceof Error ? error.message : String(error),
        }
      }
    },
  })
  registerDbTool({
    name: 'db_content',
    description: [
      '读写一条记录的正文（一篇，只要 path）。list/read 不含正文。path 为 /<表>/<id>。',
      'command=view：带行号读一段正文，默认前 80 行，可用 view_range=[start,end]（1-based，end=-1 到末尾）或 grep 关键字过滤定位行号；truncated 表示还有未读行。引用形如 [@ id="page/<id>"]，view 会补当前 label；落盘只留 id，写回时不要依赖 label。',
      'command=outline：只返回 Markdown 标题目录与行号，长文档快速定位章节，省去翻页。',
      'command=str_replace：old_str 必须在正文里唯一，替换为 new_str（短文本）或 from 文件内容（长文本）。',
      'command=replace_lines：按 1-based 闭区间 start_line..end_line 换成 new_str（短）或 from 文件内容（长）。',
      'command=insert：在 insert_line 之后插入。短文本用 new_str；长文本用 from=<本地文件>。',
      'command=find_replace：批量替换。默认等价 str_replace（old_str 必须唯一）；all=true 替换所有匹配（可用 count 限制次数），regex=true 时 old_str 按正则解释。返回 replaced 为实际替换次数。新文本同样：短用 new_str，长用 from。',
      'command=write：整篇覆盖。短全文用 value 内联，长全文用 from=<本地文件路径>（工作区或 /tmp）。new_str / value 与 from 都保留；同时给时以 from 为准。写成功只返回 {ok, path}，不含全文。str_replace / find_replace / replace_lines / insert 成功额外返回 start_line、end_line（改后正文的 1-based 行）。编辑器会标出该段改动，不抢输入焦点、不自动跳转；跳转只在用户主动点目录或查找时发生。',
      '页面插图：不要把 data URL / base64 写进正文。先把图片文件落到工作区（下载或生成），再用 db_media command=write name=<逻辑名.ext> from=<本地路径> 入库（内容寻址，返回 name=<哈希.ext>），然后 insert/str_replace 写入一行 Markdown：![说明](/api/db/file/<哈希.ext>)。也可以先写这一行再 write 附件。',
      '写 :::editorBlock 前先 db_content /plugins/<plugin> 读介绍里的「示例写法」，不要猜围栏，也不要把块源码写进围栏体。',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        command: {
          type: 'string',
          enum: ['view', 'outline', 'str_replace', 'find_replace', 'replace_lines', 'insert', 'write'],
          description:
            'view | outline | str_replace | find_replace | replace_lines | insert | write。省略时：有 value 或 from 则 write，否则 view。',
        },
        value: { type: 'string', description: 'command=write 的全文内容（必填 value 或 from，示例：{"path":"/pages/<id>","command":"write","value":"# 标题\\n正文"}）。' },
        from: {
          type: 'string',
          description:
            '长文本：从该本地文件路径（工作区或 /tmp）读入。write 对应 value；insert / str_replace / find_replace / replace_lines 对应 new_str。与短文本字段可同时出现，有 from 时用文件。',
        },
        old_str: { type: 'string', description: 'str_replace / find_replace 要替换的原文；find_replace 且 regex=true 时按正则解释' },
        new_str: {
          type: 'string',
          description: 'str_replace / find_replace / insert / replace_lines 的短新文本。长文本用 from。',
        },
        regex: { type: 'boolean', description: 'find_replace：old_str 是否按正则解释（默认 false）' },
        all: { type: 'boolean', description: 'find_replace：是否替换所有匹配（默认 false，等价 str_replace 的唯一性要求）' },
        count: { type: 'integer', description: 'find_replace：最多替换几处（默认不限）' },
        insert_line: { type: 'integer', description: 'insert：在该行之后插入' },
        start_line: { type: 'integer', description: 'replace_lines 起始行（含）' },
        end_line: { type: 'integer', description: 'replace_lines 结束行（含）' },
        view_range: {
          type: 'array',
          items: { type: 'integer' },
          description: 'view 的行区间，如 [11, 20] 或 [80, -1]',
        },
        grep: {
          type: 'string',
          description: 'view 时按子串（不区分大小写）过滤匹配行并返回行号，长文档精准定位用',
        },
      },
      required: ['path'],
    },
    execution: (args) => {
      const cmd = resolveContentCommand(args)
      return cmd === 'view' || cmd === 'outline' ? 'parallel' : 'exclusive'
    },
    annotations: (args) => {
      const cmd = resolveContentCommand(args)
      const ro = cmd === 'view' || cmd === 'outline'
      return { readOnly: ro, ...(ro ? { idempotent: true } : cmd === 'write' ? { destructive: true } : {}) }
    },
    execute: (args) =>
      withInspectorReveal(ctx, String(args.path), () =>
        db.editContent(String(args.path), args).then((body) => agentDbCompact.query(body)),
      ),
  })
  registerDbTool({
    name: 'db_media',
    description: [
      '读写一条记录的不可变附件（图片、音频、导入文件）。可变文件（画板、沙盒 jsx）用 db_file。正文用 db_content。',
      'path 为 /<表>/<id>。write 落盘 .biu/assets/hash/<2>/<2>/<哈希>.<ext>，返回 name=<哈希.ext>。引用写成 /api/db/file/<哈希.ext>。',
      'command=view：列出已引用附件；带 name 读该文件。missing=true 合法。',
      'command=write：内容寻址，只增不改。可带 block_id / source / kind=core|asset；refs 为该块当前引用完整列表。',
      '插图：write from=本地路径，再用返回的 name 插入 ![说明](/api/db/file/<name>)。',
      '写成功只返回 {ok, path, name, etag}。',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        name: { type: 'string', description: '附件文件名，如 画板-ab12cd.json' },
        command: {
          type: 'string',
          enum: ['view', 'write'],
          description: 'view | write。省略时：有 value 或 from 则 write，否则 view。',
        },
        value: { type: 'string', description: 'write 的全文（json/文本）。大文件用 from，不要把整段 JSON 贴进来。' },
        from: {
          type: 'string',
          description: 'write 时读这个本地文件作为内容，代替 value。相对工作区根，或绝对路径。',
        },
        block_id: { type: 'string', description: '块级归属，写入 block_refs' },
        source: { type: 'string', description: '引用子键，如 block:<id>:bgm' },
        kind: { type: 'string', description: 'core（永不自动回收）或 asset' },
        refs: {
          type: 'array',
          items: { type: 'object' },
          description: '该 block_id 当前引用的完整列表 [{name, source}]，宿主 diff 后写 block_refs',
        },
      },
      required: ['path'],
    },
    execution: (args) => (resolveContentCommand(args) === 'view' ? 'parallel' : 'exclusive'),
    annotations: (args) => {
      const ro = resolveContentCommand(args) === 'view'
      return { readOnly: ro, ...(ro ? { idempotent: true } : {}) }
    },
    execute: (args) =>
      withInspectorReveal(ctx, String(args.path), () =>
        db.editAsset(String(args.path), args).then((body) => agentDbCompact.query(body)),
      ),
  })
  registerDbTool({
    name: 'db_file',
    description: [
      '读写一条记录上的可变文件（画板、视频脚本、htmlframe、页面沙盒 jsx）。不可变附件用 db_media。正文用 db_content。',
      'path 为 /<表>/<id>，name 为稳定逻辑名。页面沙盒用 path=/pages/<id> name=view-<id>-<viewId>.jsx。',
      '命令与 db_content 相同：view / str_replace / find_replace / replace_lines / insert / write。局部改写会先读当前文件再覆盖，不必先 view 再带 etag；并发冲突仍返回 etag conflict。write 整篇覆盖。',
      'command=view：不带 name 列出引用；带 name 按行号读（可用 view_range）。',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        name: { type: 'string', description: '稳定逻辑名，如 view-p194-8fdbc4f8.jsx' },
        command: {
          type: 'string',
          enum: ['view', 'outline', 'str_replace', 'find_replace', 'replace_lines', 'insert', 'write'],
          description:
            'view | outline | str_replace | find_replace | replace_lines | insert | write。省略时：有 value 或 from 则 write，否则 view。',
        },
        value: { type: 'string', description: 'command=write 的全文内容（必填 value 或 from，示例：{"path":"/pages/<id>","command":"write","value":"# 标题\\n正文"}）。' },
        from: {
          type: 'string',
          description:
            '长文本：从本地文件读入。write 对应 value；insert / str_replace / find_replace / replace_lines 对应 new_str。',
        },
        old_str: { type: 'string', description: 'str_replace / find_replace 要替换的原文' },
        new_str: {
          type: 'string',
          description: 'str_replace / find_replace / insert / replace_lines 的短新文本。长文本用 from。',
        },
        regex: { type: 'boolean', description: 'find_replace：old_str 是否按正则解释' },
        all: { type: 'boolean', description: 'find_replace：是否替换所有匹配' },
        count: { type: 'integer', description: 'find_replace：最多替换几处' },
        insert_line: { type: 'integer', description: 'insert：在该行之后插入' },
        start_line: { type: 'integer', description: 'replace_lines 起始行（含）' },
        end_line: { type: 'integer', description: 'replace_lines 结束行（含）' },
        view_range: {
          type: 'array',
          items: { type: 'integer' },
          description: 'view 的行区间，如 [11, 20] 或 [80, -1]',
        },
        grep: {
          type: 'string',
          description: 'view 时按子串（不区分大小写）过滤匹配行并返回行号',
        },
        etag: { type: 'string', description: '可选 If-Match；省略则用刚读到的当前 etag' },
        block_id: { type: 'string' },
        source: { type: 'string' },
        kind: { type: 'string' },
      },
      required: ['path'],
    },
    execution: (args) => {
      const cmd = resolveContentCommand(args)
      return cmd === 'view' || cmd === 'outline' ? 'parallel' : 'exclusive'
    },
    annotations: (args) => {
      const cmd = resolveContentCommand(args)
      const ro = cmd === 'view' || cmd === 'outline'
      return { readOnly: ro, ...(ro ? { idempotent: true } : cmd === 'write' ? { destructive: true } : {}) }
    },
    execute: (args) =>
      withInspectorReveal(ctx, String(args.path), () =>
        db.editDoc(String(args.path), args).then((body) => agentDbCompact.query(body)),
      ),
  })
}
