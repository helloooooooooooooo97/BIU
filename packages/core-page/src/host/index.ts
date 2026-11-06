import { assetsRootPath, dataHome, migrateLegacyPageDir } from '@biu/host-plugin-loader/data-dir'
import type { Context } from 'cordis'
import type { CollectionNamedDocs, CollectionSpec, DbRecord } from '@biu/type-file-system'
import { DATABASE_CHANNEL, REQUIRED_RECORD_FIELDS } from '@biu/type-file-system'
import { PagesStore, PageAssetConflictError, type WorkspaceFs } from './store.ts'
import { parsePageViews, viewsAssetName } from '@biu/core-editor/host'
import { pageBlocksCollection } from './page-blocks-collection.ts'
import { PAGE_BLOCK_TICK_MS, PageBlocksIndex } from './page-blocks-index.ts'

export { PAGE_ROOT, PAGE_ASSETS, ASSET_GC_GRACE_MS, PagesStore } from './store.ts'
export { pageBlocksCollection } from './page-blocks-collection.ts'
export { PageBlocksIndex, PAGE_BLOCK_TICK_MS } from './page-blocks-index.ts'

async function readPageViews(store: PagesStore, pageId: string) {
  try {
    const { bytes } = await store.readAsset(viewsAssetName(pageId))
    return parsePageViews(bytes.toString('utf8'))
  } catch {
    return []
  }
}

async function writePageViews(store: PagesStore, pageId: string, raw: unknown) {
  const views = parsePageViews(raw)
  const name = viewsAssetName(pageId)
  let etag = ''
  try {
    etag = (await store.readAsset(name)).etag
  } catch {
    etag = ''
  }
  await store.writeAsset(name, `${JSON.stringify(views, null, 2)}\n`, etag ? { etag } : undefined)
  return views
}

async function withPageViews(store: PagesStore, row: Awaited<ReturnType<PagesStore['get']>>) {
  if (!row) return row
  return { ...row, views: await readPageViews(store, row.id) }
}

export function pageViewFileNames(record: { id?: unknown; views?: unknown }): string[] {
  const id = String(record.id ?? '').trim()
  const out: string[] = []
  if (id) out.push(viewsAssetName(id))
  for (const view of parsePageViews(record.views)) {
    for (const raw of [view.file, view.dataFile]) {
      const name = String(raw ?? '')
        .trim()
        .replace(/^assets\//, '')
        .replace(/^.*[/\\]/, '')
      if (name) out.push(name)
    }
  }
  return out
}

export function pageNamedDocs(store: PagesStore): CollectionNamedDocs {
  return {
    names: (record: DbRecord) => pageViewFileNames(record),
    read: (name) => store.readAsset(name),
    write: async (name, content, opts) => {
      const written = await store.writeAsset(name, content, opts)
      return { name: written.name, etag: written.etag }
    },
  }
}

export function pagesCollection(store: PagesStore, index: PageBlocksIndex): CollectionSpec {
  return {
    id: 'pages',
    path: '/pages',
    namedDocs: pageNamedDocs(store),
    label: '页面',
    view: {
      moduleId: 'page',
      route: '/pages',
      title: '页面',
      inspector: true,
      blurb: '每页正文在 .biu/biu.sqlite 的 editor_content。正文用 db_content；改标题等用 db_update。标签用 db_update 写 tag：{tags:["tag-2"],values:{导演:"查泽雷"}}。图片不要写 data URL：先 db_media write name=xxx.png from=本地文件，再 db_content 插入 ![说明](/api/db/file/xxx.png)。附件在 .biu/assets。树用 parentId。新建 db_create，删除 db_delete。本表没有 db_action。',
      order: 25,
      icon: 'document',
    },
    schema: {
      labelField: 'title',
      contentField: 'notes',
      contentBackend: 'editorContent',
      parentField: 'parentId',
      columns: ['title', 'tag', 'createdBy', 'updatedBy'],
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', label: '标题', writable: true },
        notes: { type: 'file', label: '正文', writable: true },
        parentId: { type: 'ref', label: '父级', writable: true },
        dependsOn: { type: 'multi-ref', label: '依赖', writable: true },
        views: {
          type: 'string',
          label: '视图',
          writable: true,
          description: '本页特制沙盒视图。JSON 数组：id、name、kind=sandbox、file、dataFile。改视图源码用 db_file path=/pages/<id> name=<file>。文档/大纲/表格/源码是内置视图，不写在这里。',
        },
      },
    },
    records: { update: true, create: true, delete: true },
    list: (query) => store.list(query?.ids),
    get: async (id) => withPageViews(store, await store.get(id)),
    update: async (id, patch) => {
      if ('views' in patch) await writePageViews(store, id, patch.views)
      const row = await store.update(id, patch)
      if ('notes' in patch) await index.reindexPage(row)
      return withPageViews(store, row)
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
  }
}

function servePageFile(ctx: Context, store: PagesStore) {
  ctx.inject(['http'], (inner) => {
    inner.http.route('GET', '/api/page/file/:name', async (route) => {
      try {
        const name = route.params.name ?? ''
        const path = route.query.get('path') || String(route.req.headers['x-biu-resource-path'] ?? '')
        if (path) await inner.database.requirePath(path, 'resource:read')
        else inner.database.requireAsset(name, 'resource:read')
        const { bytes, type, etag } = await store.readAsset(name)
        route.res.writeHead(200, {
          'content-type': type,
          'cache-control': 'no-store',
          etag: `"${etag}"`,
        })
        route.res.end(bytes)
      } catch {
        route.send(404, { error: 'not found' })
      }
    })
    inner.http.route('PUT', '/api/page/file/:name', async (route) => {
      try {
        const name = route.params.name ?? ''
        const path = route.query.get('path') || String(route.req.headers['x-biu-resource-path'] ?? '')
        if (path) await inner.database.requirePath(path, 'resource:update')
        else inner.database.requireAsset(name, 'resource:update')
        const ifMatch = String(route.req.headers['if-match'] ?? '').trim().replace(/^W\//, '').replaceAll('"', '')
        const written = await store.writeAsset(name, await route.bytes(), {
          etag: ifMatch && ifMatch !== '*' ? ifMatch : '',
        })
        inner.http.broadcast?.(DATABASE_CHANNEL, { ts: Date.now(), asset: { name: written.name, etag: written.etag } })
        route.res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          etag: `"${written.etag}"`,
        })
        route.res.end(JSON.stringify({ ok: true, ...written }))
      } catch (error) {
        if (error instanceof PageAssetConflictError) {
          const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' }
          if (error.etag) headers.etag = `"${error.etag}"`
          route.res.writeHead(409, headers)
          route.res.end(JSON.stringify({ error: 'etag conflict', etag: error.etag }))
          return
        }
        route.send(400, { error: String(error) })
      }
    })
  })
}

export const name = 'page'
export const inject = ['database', 'fs']

export function apply(ctx: Context) {
  // 页面落到工作区 `.biu`（与 file-system / sessions 同一数据目录的父目录）。
  // 用 defaultRoot，不随 Session 绑定项目路径漂移。
  const workspaceRoot = ctx.fs.workspace.resolve('.')
  const root = process.env.VITEST ? workspaceRoot : dataHome()
  if (root !== workspaceRoot) migrateLegacyPageDir(workspaceRoot, root)
  const fs: WorkspaceFs = {
    resolve: (rel) => ctx.fs.resolveIn(root, rel),
    read: (rel) => ctx.fs.readIn(root, rel),
    write: (rel, content) => ctx.fs.writeIn(root, rel, content),
    list: (rel) => ctx.fs.listIn(root, rel ?? '.'),
  }
  const store = new PagesStore(fs, assetsRootPath(root))
  const index = new PageBlocksIndex(store)
  ctx.database.register(pagesCollection(store, index))
  ctx.database.register(pageBlocksCollection(store, index))
  servePageFile(ctx, store)
  const tick = setInterval(() => {
    void index.sync()
  }, PAGE_BLOCK_TICK_MS)
  tick.unref()
  ctx.effect(() => () => clearInterval(tick))
}

