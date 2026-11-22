import type { CollectionSpec, DbRecord } from '@biu/type-file-system'
import {
  commentToRecord,
  normalizeCommentAnchor,
  normalizeCommentStatus,
  type CommentsStore,
} from './comments-store.ts'

export const COMMENTS_COLLECTION_PATH = '/comments'

export function commentsCollection(store: CommentsStore): CollectionSpec {
  const asRecord = (id: string): DbRecord | null => {
    const row = store.get(id)
    return row ? commentToRecord(row) : null
  }
  return {
    id: 'comments',
    path: COMMENTS_COLLECTION_PATH,
    label: '批注',
    view: {
      moduleId: 'comments',
      route: '/db-comments',
      title: '批注',
      inspector: false,
      sidebar: false,
      icon: 'chat',
      blurb:
        '编辑器文档批注与回复。按 targetPath（如 /pages/xxx）关联记录；threadId 标识同一批注串，parentId 非空表示回复。status=open|resolved。anchor 为 JSON（blockId/quote/prefix/suffix/offset）。',
      order: 19,
    },
    records: { update: true, create: true, delete: true, allocateId: false },
    schema: {
      labelField: 'title',
      columns: ['title', 'targetPath', 'status', 'author', 'updatedAt'],
      fields: {
        title: { type: 'string', label: '摘要' },
        body: { type: 'string', label: '内容', writable: true },
        targetPath: { type: 'string', label: '目标文档', writable: true },
        threadId: { type: 'string', label: '批注串', writable: true },
        parentId: { type: 'string', label: '父批注', writable: true },
        status: { type: 'select', label: '状态', writable: true, enum: ['open', 'resolved'] },
        anchor: { type: 'string', label: '锚点', writable: true },
        author: { type: 'string', label: '作者', writable: true },
      },
    },
    list: async (query) => {
      const target =
        query?.filters && typeof query.filters.targetPath === 'string'
          ? query.filters.targetPath
          : undefined
      return store.list(target).map((row) => commentToRecord(row))
    },
    get: async (id) => asRecord(id),
    create: async (rows) => {
      const out: DbRecord[] = []
      for (const fields of rows) {
        const created = store.create({
          body: String(fields.body ?? fields.title ?? ''),
          targetPath: String(fields.targetPath ?? ''),
          threadId: typeof fields.threadId === 'string' ? fields.threadId : undefined,
          parentId: typeof fields.parentId === 'string' ? fields.parentId : undefined,
          status: fields.status !== undefined ? normalizeCommentStatus(fields.status) : 'open',
          anchor: fields.anchor !== undefined ? normalizeCommentAnchor(fields.anchor) : null,
          author: typeof fields.author === 'string' ? fields.author : undefined,
        })
        out.push(commentToRecord(created))
      }
      return out
    },
    update: async (id, patch) => {
      const updated = store.update(id, {
        ...(patch.body !== undefined ? { body: String(patch.body) } : {}),
        ...(patch.status !== undefined ? { status: normalizeCommentStatus(patch.status) } : {}),
        ...(patch.anchor !== undefined ? { anchor: normalizeCommentAnchor(patch.anchor) } : {}),
      })
      return commentToRecord(updated)
    },
    remove: async (query) => {
      const ids = typeof query === 'string' ? [query] : (query?.ids ?? [])
      const removed: string[] = []
      for (const id of ids) {
        if (store.remove(id)) removed.push(id)
      }
      return removed
    },
  }
}
