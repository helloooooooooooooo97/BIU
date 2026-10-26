import type { CollectionSpec, DbRecord } from '@biu/type-file-system'
import { recordBuiltinValues, REQUIRED_RECORD_FIELDS } from '@biu/type-file-system'
import {
  createArgs,
  PLUGIN_PACK_DESCRIPTION,
  PLUGIN_SANDBOX_DESCRIPTION,
  PLUGIN_SANDBOX_PROPERTIES,
} from './plugin-create.ts'
import type { PluginStoreService, StoreListing } from './store.ts'
import { WORKBENCH_STAGES, advanceWorkbench, workbenchFields } from '../workbench.ts'

type SandboxListing = Awaited<ReturnType<PluginStoreService['listSandboxes']>>[number]

export const BIU_OFFICIAL_NAME = 'BIU官方'
export const BIU_GITHUB = 'https://github.com/helloooooooooooooo97/biu'

const BIU_OFFICIAL = { kind: 'user' as const, name: BIU_OFFICIAL_NAME, url: BIU_GITHUB }

function withOfficial<T extends { builtin?: boolean; author: string; authorUrl: string }>(row: T) {
  if (!row.builtin) return row
  return {
    ...row,
    author: BIU_OFFICIAL_NAME,
    authorUrl: BIU_GITHUB,
    createdBy: BIU_OFFICIAL,
    updatedBy: [BIU_OFFICIAL],
  }
}

function withWorkbench(row: DbRecord, store: PluginStoreService): DbRecord {
  const wb = store.readWorkbench(row.id)
  if (!wb) return row
  return { ...row, ...workbenchFields(wb) }
}

function omitEmpty(row: DbRecord): DbRecord {
  const next: DbRecord = { id: row.id }
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id') continue
    if (value == null || value === '' || value === false) continue
    if (Array.isArray(value) && value.length === 0) continue
    next[key] = value
  }
  return { ...next, ...recordBuiltinValues(row) }
}

function asInstalledRecord(row: StoreListing, store: PluginStoreService): DbRecord {
  const shell = row.shell
  return omitEmpty({
    id: row.id,
    name: row.name,
    title: row.name,
    blurb: row.blurb,
    tags: row.tags,
    ...withOfficial(row),
    installed: true,
    pluginPath: store.pluginPath(row.id),
    enabled: row.enabled,
    running: row.running,
    bytes: row.bytes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastRunAt: row.lastRunAt,
    hasHost: row.hasHost,
    hasWeb: row.hasWeb,
    codeVersion: row.codeVersion,
    headless: row.headless === true,
    ...(row.headless || !shell
      ? {}
      : {
          shellWidth: shell.width,
          shellHeight: shell.height,
          shellMinWidth: shell.minWidth,
          shellMinHeight: shell.minHeight,
          shellResizable: shell.resizable,
        }),
  })
}

function asSandboxRecord(row: SandboxListing, store: PluginStoreService): DbRecord {
  return omitEmpty({
    id: row.id,
    name: row.name,
    title: row.name,
    blurb: row.blurb,
    tags: row.tags,
    ...withOfficial(row),
    sandbox: true,
    sandboxPath: store.sandboxPath(row.id),
    hasHost: row.hasHost,
    hasWeb: row.hasWeb,
    headless: row.headless === true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

function mergeLifecycle(
  installed: StoreListing | undefined,
  sandbox: SandboxListing | undefined,
  store: PluginStoreService,
): DbRecord {
  const builtin = Boolean(installed?.builtin || sandbox?.builtin)
  const official = builtin
    ? { builtin: true, author: BIU_OFFICIAL_NAME, authorUrl: BIU_GITHUB, createdBy: BIU_OFFICIAL, updatedBy: [BIU_OFFICIAL] }
    : {}
  if (installed && sandbox) {
    return omitEmpty({
      ...asInstalledRecord(installed, store),
      sandbox: true,
      sandboxPath: store.sandboxPath(sandbox.id),
      updatedAt: Math.max(installed.updatedAt, sandbox.updatedAt),
      ...official,
    })
  }
  if (installed) return { ...asInstalledRecord(installed, store), ...official }
  if (sandbox) return { ...asSandboxRecord(sandbox, store), ...official }
  throw new Error('empty plugin row')
}

export function pluginsCollection(store: PluginStoreService): CollectionSpec {
  const list = async () => {
    const [installed, sandboxes] = await Promise.all([store.list(), store.listSandboxes()])
    const ids = new Set([...installed.map((row) => row.id), ...sandboxes.map((row) => row.id)])
    const byInstalled = new Map(installed.map((row) => [row.id, row]))
    const bySandbox = new Map(sandboxes.map((row) => [row.id, row]))
    return [...ids]
      .sort()
      .map((id) => withWorkbench(mergeLifecycle(byInstalled.get(id), bySandbox.get(id), store), store))
  }
  const find = async (id: string) => {
    const row = (await list()).find((item) => item.id === id) ?? null
    if (!row) return null
    return { ...row, readme: await store.readReadme(id) }
  }
  return {
    id: 'plugins',
    path: '/plugins',
    label: '插件',
    view: {
      moduleId: 'plugins',
      route: '/plugins',
      title: '插件',
      inspector: true,
      blurb: '这是插件，不是代理。新插件先 sandbox（只要 name，不要 hostJs/webJs），再 db_update 本行工作台字段：who/job/not、tree、bg/ink/muted/accent。阶段 brief→wireframe→palette→demo→plugin，用 action=advance。到 plugin 再写代码并 pack。改已有插件可直接 sandbox+pack。用户说「再开一个 agent」去 /sessions。不能 db_create。列表 db_list /plugins。README 用 db_content。页面块先读介绍「示例写法」再写 :::pageBlock。name 只读。不要直写 .plugin。',
      order: 30,
      icon: 'puzzle-piece',
    },
    records: { update: true, create: false, delete: true },
    schema: {
      labelField: 'title',
      contentField: 'readme',
      contentBackend: 'editorContent',
      columns: [
        'title',
        'blurb',
        'installed',
        'sandbox',
        'sandboxPath',
        'pluginPath',
        'running',
        'enabled',
        'createdBy',
        'updatedBy',
        'bytes',
        'shellWidth',
        'shellHeight',
        'hasHost',
        'hasWeb',
        'codeVersion',
        'headless',
        'stage',
        'kind',
      ],
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', label: '标题' },
        blurb: { type: 'string', label: '简介' },
        installed: { type: 'boolean', label: '已安装' },
        sandbox: { type: 'boolean', label: '沙箱' },
        sandboxPath: { type: 'string', label: '源码路径' },
        pluginPath: { type: 'string', label: '安装路径' },
        enabled: { type: 'boolean', label: '已打开' },
        running: { type: 'boolean', label: '运行中' },
        bytes: { type: 'number', label: '大小' },
        createdAt: { type: 'datetime', label: '创建时间' },
        updatedAt: { type: 'datetime', label: '更新时间' },
        lastRunAt: { type: 'datetime', label: '上次运行' },
        hasHost: { type: 'boolean', label: 'Host' },
        hasWeb: { type: 'boolean', label: 'Web' },
        codeVersion: { type: 'string', label: '代码版本' },
        headless: { type: 'boolean', label: '无头' },
        shellWidth: { type: 'number', label: '窗口宽' },
        shellHeight: { type: 'number', label: '窗口高' },
        shellMinWidth: { type: 'number', label: '最小宽' },
        shellMinHeight: { type: 'number', label: '最小高' },
        shellResizable: { type: 'boolean', label: '可缩放' },
        readme: { type: 'file', label: '介绍', writable: true },
        stage: {
          type: 'select',
          label: '工作台',
          enum: [...WORKBENCH_STAGES],
          enumLabels: { brief: '需求', wireframe: '线框', palette: '色彩', demo: '演示', plugin: '生成' },
        },
        kind: { type: 'select', label: '形态', writable: true, enum: ['page', 'window'], enumLabels: { page: '页面块', window: '窗口' } },
        who: { type: 'string', label: '给谁', writable: true, description: '≤80 字' },
        job: { type: 'string', label: '干什么', writable: true, description: '≤80 字' },
        not: { type: 'string', label: '不做', writable: true, description: '≤80 字' },
        tree: { type: 'string', label: '线框', writable: true, description: '{t,id?,label?,kids?} t=card|stack|row|btn|field|list|tabs|text|stat' },
        clicks: { type: 'string', label: '点击', writable: true, description: '[{on,set?}]' },
        bg: { type: 'string', label: '底色', writable: true },
        ink: { type: 'string', label: '字色', writable: true },
        muted: { type: 'string', label: '弱色', writable: true },
        accent: { type: 'string', label: '强调', writable: true },
      },
    },
    list,
    get: find,
    update: async (id, patch) => {
      const bench: Record<string, unknown> = {}
      const extra: string[] = []
      for (const [key, value] of Object.entries(patch)) {
        if (key === 'readme') continue
        if (
          key === 'kind' ||
          key === 'who' ||
          key === 'job' ||
          key === 'not' ||
          key === 'tree' ||
          key === 'clicks' ||
          key === 'bg' ||
          key === 'ink' ||
          key === 'muted' ||
          key === 'accent'
        ) {
          bench[key] = value
          continue
        }
        extra.push(key)
      }
      if (extra.length) throw new Error(`plugin fields not writable: ${extra.join(', ')}`)
      if ('readme' in patch) await store.writeReadme(id, String(patch.readme ?? ''))
      if (Object.keys(bench).length) store.writeWorkbench(id, bench)
      return (await find(id)) ?? (() => {
        throw new Error(`unknown plugin: ${id}`)
      })()
    },
    remove: async (query) => {
      const ids = query.ids ?? []
      for (const id of ids) await store.destroy(id)
      return ids
    },
    actions: [
      {
        id: 'sandbox',
        label: '开沙箱',
        for: 'agent',
        placement: [],
        allowMissing: true,
        requiredAction: 'resource:read',
        description: PLUGIN_SANDBOX_DESCRIPTION,
        parameters: {
          type: 'object',
          description: PLUGIN_SANDBOX_DESCRIPTION,
          properties: PLUGIN_SANDBOX_PROPERTIES,
          required: ['name'],
        },
        run: async (id, _record, args = {}) => store.initSandbox(createArgs({ ...args, id })),
      },
      {
        id: 'advance',
        label: '下一段',
        description: '校验当前阶段短字段，推进 brief→wireframe→palette→demo→plugin。不要在聊天里复述字段。',
        requiredAction: 'resource:update',
        run: async (id) => {
          const wb = store.readWorkbench(id)
          if (!wb) throw new Error('先 db_update 写 who/job')
          store.writeWorkbench(id, advanceWorkbench(wb))
        },
      },
      {
        id: 'start',
        label: '运行',
        when: { installed: true, running: false },
        description: '为当前账号在这个空间加载已安装插件（无头则只挂 host）。别人的加载状态互不影响。when：installed 且未 running。不要对纯沙箱、未 pack 的行调用。',
        requiredAction: 'resource:read',
        run: async (id) => {
          await store.openPlugin(id)
        },
      },
      {
        id: 'stop',
        label: '停止',
        when: { installed: true, running: true },
        description: '停止当前账号在这个空间加载的插件。别人如果还在用，他们的加载不受影响。when：installed 且 running。',
        requiredAction: 'resource:read',
        run: async (id) => {
          await store.close(id)
        },
      },
      {
        id: 'pack',
        label: '安装',
        when: { sandbox: true, installed: false },
        description: PLUGIN_PACK_DESCRIPTION,
        requiredAction: 'resource:read',
        parameters: { type: 'object', description: PLUGIN_PACK_DESCRIPTION, properties: {} },
        run: async (id) => store.pack(id),
      },
      {
        id: 'uninstall',
        label: '卸载',
        tone: 'danger',
        confirm: '确定卸载？会停止运行，并删掉已安装的代码。沙箱源码还在的话可以再安装。',
        when: { installed: true },
        description: '停止运行并删除 .plugin/<id>/。已安装才显示，和安装互斥。沙箱 .plugin-dev/<id>/ 还在的话行不会消失，installed 变 false，动作列改显示安装。',
        requiredAction: 'resource:read',
        run: async (id) => {
          await store.uninstall(id)
        },
      },
    ],
  }
}
