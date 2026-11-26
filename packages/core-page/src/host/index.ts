import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve as pathResolve, sep } from 'node:path'
import { assetsRootPath, dataHome, migrateLegacyPageDir } from '@biu/host-plugin-loader/data-dir'
import type { Context } from 'cordis'
import type { CollectionSpec } from '@biu/type-file-system'
import { PagesStore, type WorkspaceFs } from './store.ts'
import { pageBlocksCollection } from './page-blocks-collection.ts'
import { PAGE_BLOCK_TICK_MS, PageBlocksIndex } from './page-blocks-index.ts'

export { PAGE_ROOT, PAGE_ASSETS, ASSET_GC_GRACE_MS, PagesStore } from './store.ts'
export { pageBlocksCollection } from './page-blocks-collection.ts'
export { PageBlocksIndex, PAGE_BLOCK_TICK_MS } from './page-blocks-index.ts'

export function pagesCollection(store: PagesStore, index: PageBlocksIndex): CollectionSpec {
  return {
    id: 'pages',
    path: '/pages',
    label: '页面',
    view: {
      moduleId: 'page',
      route: '/pages',
      title: '页面',
      inspector: true,
      blurb: '每页正文在 .biu/biu.sqlite 的 editor_content。正文用 db_content；改标题等用 db_update。标签用 db_update 写 tag：{tags:["tag-2"],values:{导演:"查泽雷"}}。图片不要写 data URL：先 db_media write name=xxx.png from=本地文件，再 db_content 插入 ![说明](/api/db/file/xxx.png)。附件在 .biu/assets。树用 parentId。新建 db_create，删除 db_delete 或 db_action action=delete（进回收站）。加子页 db_action action=add-child。',
      order: 25,
      icon: 'document',
    },
    schema: {
      contentField: 'notes',
      contentBackend: 'editorContent',
      parentField: 'parentId',
      columns: ['title', 'tag', 'createdBy', 'updatedBy'],
      fields: {
        title: { type: 'string', label: '标题', writable: true },
        notes: { type: 'file', label: '正文', writable: true },
        parentId: { type: 'ref', label: '父级', writable: true },
        dependsOn: { type: 'multi-ref', label: '依赖', writable: true },
      },
    },
    records: { update: true, create: true, delete: true, allocateId: true },
    list: (query) => store.list(query?.ids),
    listPage: (query) => store.listPage(query),
    groupPage: (query) => store.groupPage(query),
    get: (id) => store.get(id),
    update: async (id, patch, options) => {
      const row = await store.update(id, patch, options)
      if ('notes' in patch) await index.reindexPage(row)
      return row
    },
    create: async (rows) => {
      const out = []
      for (const fields of rows) {
        const row = await store.create(fields)
        await index.reindexPage(row)
        out.push(row)
      }
      return out
    },
    remove: async (query) => {
      const ids = query.ids ?? []
      for (const id of ids) {
        await index.dropRecord('/pages', id)
        await store.remove(id)
      }
      return ids
    },
    actions: [
      {
        id: 'add-child',
        label: '添加子页面',
        for: 'both',
        placement: ['row', 'detail'],
        requiredAction: 'resource:create',
        description: '在当前页面下新建子页面。parentId 写成这一页。',
        run: async (id) => {
          const row = await store.create({ parentId: id })
          await index.reindexPage(row)
          return row
        },
      },
      {
        id: 'delete',
        label: '删除',
        for: 'both',
        placement: ['row', 'detail'],
        tone: 'danger',
        requiredAction: 'resource:delete',
        description: '软删除：把这一页放进回收站，列表不再显示。恢复走 /trash。彻底删除不要用这个动作。',
      },
    ],
  }
}

export const name = 'page'
export const inject = ['database']

function localWorkspaceFs(root: string): WorkspaceFs {
  const base = pathResolve(root)
  const resolve = (rel: string) => {
    const abs = pathResolve(base, rel)
    if (abs !== base && !abs.startsWith(`${base}${sep}`)) {
      throw new Error(`path escapes data root: ${rel}`)
    }
    return abs
  }
  return {
    resolve,
    read: (rel) => readFile(resolve(rel), 'utf8'),
    write: async (rel, content) => {
      const target = resolve(rel)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, content, 'utf8')
    },
    list: async (rel = '.') => {
      try {
        return await readdir(resolve(rel))
      } catch {
        return []
      }
    },
  }
}

export function apply(ctx: Context) {
  // 页面落到工作区 `.biu`（与 file-system / sessions 同一数据目录的父目录）。
  // 用 defaultRoot，不随 Session 绑定项目路径漂移；云端 profile 不加载 host-fs 时直接以 dataHome() 读写。
  const hostFs = (() => {
    try {
      return ctx.get('fs') as {
        workspace: { resolve: (p: string) => string }
        resolveIn: (r: string, p: string) => string
        readIn: (r: string, p: string) => Promise<string>
        writeIn: (r: string, p: string, c: string) => Promise<unknown>
        listIn: (r: string, p: string) => Promise<string[]>
      } | undefined
    } catch {
      return undefined
    }
  })()
  const workspaceRoot = hostFs ? hostFs.workspace.resolve('.') : dataHome()
  const root = process.env.VITEST ? workspaceRoot : dataHome()
  if (root !== workspaceRoot) migrateLegacyPageDir(workspaceRoot, root)
  const fs: WorkspaceFs = hostFs
    ? {
        resolve: (rel) => hostFs.resolveIn(root, rel),
        read: (rel) => hostFs.readIn(root, rel),
        write: (rel, content) => hostFs.writeIn(root, rel, content),
        list: (rel) => hostFs.listIn(root, rel ?? '.'),
      }
    : localWorkspaceFs(root)
  const store = new PagesStore(fs, assetsRootPath(root))
  const index = new PageBlocksIndex(store)
  ctx.database.register(pagesCollection(store, index))
  ctx.database.register(pageBlocksCollection(store, index))
  const tick = setInterval(() => {
    void index.sync()
  }, PAGE_BLOCK_TICK_MS)
  tick.unref()
  ctx.effect(() => () => clearInterval(tick))
}

