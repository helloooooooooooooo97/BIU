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

const PATH_PARAM = { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } as const
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
  ctx.tools.register({
    name: 'db_list',
    description: '列出 File System 路径：/ 为已登记表（path、中文名、view.blurb 说明书），/<表> 返回列式 JSON { columns: string[], rows: unknown[][], total }（不含 content、默认不含 createdAt/updatedAt/createdBy/updatedBy）。默认每页 20，最多 200。columns 参数只取需要的列。表结构用 db_stat。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        filter: { type: 'object', description: '可选，按列等值过滤' },
        q: { type: 'string', description: '可选，全文搜索' },
        sortField: { type: 'string' },
        sortDir: { type: 'string', enum: ['asc', 'desc'] },
        limit: { type: 'number', description: '每页条数，默认 20，最大 200' },
        offset: { type: 'number' },
        columns: {
          type: 'array',
          items: { type: 'string' },
          description: '可选，只返回这些列。始终带 id。label 等于标题列（默认 title）。不传则除 content 外全返回。标签属性列写成 tag::<标签id>::<字段key>，例如 tag::tag::category。',
        },
      },
      required: ['path'],
    },
    execution: 'parallel',
    execute: (args) => {
      const path = String(args.path)
      return withInspectorReveal(ctx, path, () =>
        db
          .list(path, asFilter(args.filter), {
            q: args.q != null ? String(args.q) : '',
            sortField: args.sortField != null ? String(args.sortField) : '',
            sortDir: args.sortDir === 'desc' ? 'desc' : 'asc',
            limit: args.limit != null ? Number(args.limit) : undefined,
            offset: args.offset != null ? Number(args.offset) : undefined,
            columns: asColumnKeys(args.columns),
          })
          .then((body) => agentDbCompact.query(body)),
      )
    },
  })
  ctx.tools.register({
    name: 'db_read',
    description: '读取 File System 路径：表返回列式列表 columns/rows（不含 schema，结构用 db_stat），记录返回该行 JSON（空字段省略，不含 content 正文，正文用 db_content）。',
    parameters: PATH_PARAM,
    execution: 'parallel',
    execute: (args) =>
      withInspectorReveal(ctx, String(args.path), () => db.read(String(args.path)).then((body) => agentDbCompact.query(body))),
  })
  ctx.tools.register({
    name: 'db_update',
    description: '按表结构 schema 的可写字段更新一条已有记录，路径为 /<表>/<id>。成功只返回 {ok, path}，不回整行。未知字段会列出该表可写字段。标签 tag：推荐始终按标签 id 分组写 values（与读取结构一致），如 {tags:["tag-2"],values:{"tag-2":{导演:"查泽雷"}}}；单标签也兼容扁平 values。省略 tags 则合并更新当前已贴标签的属性，不撕掉其它标签。改标签定义用 db_update /tags/<id> fields（数组或 JSON 字符串均可）。新建用 db_create，长正文用 db_content。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: {
          type: 'object',
          description:
            '要更新的字段对象（也兼容 fields / patch 参数名或 JSON 字符串）。标签写 tag：{tag:{tags:["tag-2"],values:{"tag-2":{导演:"查泽雷"}}}}（单标签也支持扁平 values）。省略 tags 只改属性，不撕掉其它标签。',
        },
        fields: {
          type: 'object',
          description: 'content 的别名：要更新的字段对象。',
        },
        patch: {
          type: 'object',
          description: 'content 的别名：要更新的字段对象。',
        },
      },
      required: ['path'],
    },
    execute: (args) => {
      const payload = args.content !== undefined ? args.content : args.fields !== undefined ? args.fields : args.patch
      return withInspectorReveal(ctx, String(args.path), () => db.update(String(args.path), payload)).then(
        (body) => agentDbCompact.write(body),
      )
    },
  })
  ctx.tools.register({
    name: 'db_create',
    description: '在已登记且允许新建的表中新增记录。路径为 /<表>，传 records 数组或单条 record 对象（记录内可直接带 content 字符串一步写入正文）。成功返回 {ok, path, ids}，不回整行。能否新建看 db_stat 的 caps。新建标签用 db_create path=/tags records=[{title}]。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        records: {
          type: 'array',
          items: { type: 'object' },
          description: '要创建的记录（非空对象数组），按 schema 可写字段给初值；可附带 content 直接写入正文',
        },
        record: {
          type: 'object',
          description: '创建单条记录时的简写对象（等价于 records=[record]）；可附带 content 直接写入正文',
        },
        scope: {
          type: 'string',
          enum: ['personal', 'workspace', 'shared', 'local'],
          description: '根记录归属：personal 私人（默认，仅自己可见）；workspace 空间（成员可编辑）；shared 公开链接，所有人可查看；local 存在本机，仍属于当前账号和空间。子记录始终继承父记录。',
        },
      },
      required: ['path'],
    },
    execute: (args) =>
      withInspectorReveal(ctx, String(args.path), () =>
        db.create(String(args.path), asCreateRecords(args), {
          scope:
            args.scope === 'workspace' ? 'workspace' : args.scope === 'shared' ? 'shared' : args.scope === 'local' ? 'local' : 'personal',
        }),
      ).then(
        (body) => agentDbCompact.write(body),
      ),
  })
  ctx.tools.register({
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
    execute: (args) =>
      withInspectorReveal(ctx, String(args.path), () => db.remove(String(args.path), asDeleteQuery(args)), true).then(
        (body) => agentDbCompact.write(body),
      ),
  })
  ctx.tools.register({
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
    execute: (args) =>
      withInspectorReveal(ctx, String(args.path), () => db.restore(String(args.path), asDeleteQuery(args))).then(
        (body) => agentDbCompact.write(body),
      ),
  })
  ctx.tools.register({
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
  ctx.tools.register({
    name: 'db_stat',
    description: agentDbCompact.statBlurb,
    parameters: PATH_PARAM,
    execution: 'parallel',
    execute: (args) => Promise.resolve(db.stat(String(args.path))).then((body) => agentDbCompact.query(body)),
  })
  ctx.tools.register({
    name: 'db_content',
    description: [
      '读写一条记录的正文（一篇，只要 path）。list/read 不含正文。path 为 /<表>/<id>。',
      'command=view：带行号读一段正文，默认前 80 行，可用 view_range=[start,end]（1-based，end=-1 到末尾）；truncated 表示还有未读行。引用形如 [@ id="page/<id>"]，view 会补当前 label；落盘只留 id，写回时不要依赖 label。',
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
          enum: ['view', 'str_replace', 'find_replace', 'replace_lines', 'insert', 'write'],
          description:
            'view | str_replace | find_replace | replace_lines | insert | write。省略时：有 value 或 from 则 write，否则 view。',
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
      },
      required: ['path'],
    },
    execution: (args) => (resolveContentCommand(args) === 'view' ? 'parallel' : 'exclusive'),
    execute: (args) =>
      withInspectorReveal(ctx, String(args.path), () =>
        db.editContent(String(args.path), args).then((body) => agentDbCompact.query(body)),
      ),
  })
  ctx.tools.register({
    name: 'db_media',
    description: [
      '读写一条记录的不可变附件（图片、音频、导入文件）。旧名 db_asset 仍可用。可变文件（画板、沙盒 jsx）用 db_file。正文用 db_content。',
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
        etag: { type: 'string', description: '资源路径不用 etag；可变文件请用 db_file' },
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
    execution: (args) => {
      const command = String(args.command ?? (args.value != null || args.from ? 'write' : 'view'))
      return command === 'view' ? 'parallel' : 'exclusive'
    },
    execute: (args) =>
      withInspectorReveal(ctx, String(args.path), () =>
        db.editAsset(String(args.path), args).then((body) => agentDbCompact.query(body)),
      ),
  })
  ctx.tools.register({
    name: 'db_file',
    description: [
      '读写一条记录上的可变文件（画板、视频脚本、htmlframe、页面沙盒 jsx）。旧名 db_doc 仍可用。不可变附件用 db_media。正文用 db_content。',
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
          enum: ['view', 'str_replace', 'find_replace', 'replace_lines', 'insert', 'write'],
          description:
            'view | str_replace | find_replace | replace_lines | insert | write。省略时：有 value 或 from 则 write，否则 view。',
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
        etag: { type: 'string', description: '可选 If-Match；省略则用刚读到的当前 etag' },
        block_id: { type: 'string' },
        source: { type: 'string' },
        kind: { type: 'string' },
      },
      required: ['path'],
    },
    execution: (args) => (resolveContentCommand(args) === 'view' ? 'parallel' : 'exclusive'),
    execute: (args) =>
      withInspectorReveal(ctx, String(args.path), () =>
        db.editDoc(String(args.path), args).then((body) => agentDbCompact.query(body)),
      ),
  })
  ctx.tools.alias('db_file', ['db_doc'])
  ctx.tools.alias('db_media', ['db_asset'])
}
