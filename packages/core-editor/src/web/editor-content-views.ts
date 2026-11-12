import { CodeBracketIcon, DocumentTextIcon, ListBulletIcon, TableCellsIcon } from '@heroicons/react/16/solid'
import type { FsDetailTools, FsRecordContentView } from '@biu/type-file-system/ui'
import { kindLabel } from './block-id.ts'
import { EditorDetailSearch } from './editor-detail-search.tsx'

export const EDITOR_CONTENT_VIEWS: FsRecordContentView[] = [
  { id: 'doc', label: '文档', Icon: DocumentTextIcon, plugin: 'core-editor' },
  { id: 'outline', label: '大纲', Icon: ListBulletIcon, plugin: 'core-editor' },
  { id: 'table', label: '表格', Icon: TableCellsIcon, plugin: 'core-editor' },
  { id: 'source', label: '源码', Icon: CodeBracketIcon, plugin: 'core-editor' },
]

const FILTER_KINDS = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'blockquote',
  'codeBlock',
  'table',
  'editorBlock',
  'slide',
  'blockMath',
  'image',
]

export const EDITOR_DETAIL_TOOLS: FsDetailTools = {
  Search: EditorDetailSearch,
  sorts: [
    { id: 'doc', label: '原文顺序' },
    { id: 'title-asc', label: '按标题 A→Z' },
    { id: 'title-desc', label: '按标题 Z→A' },
    { id: 'kind', label: '按块类型' },
  ],
  filters: FILTER_KINDS.map((id) => ({ id, label: kindLabel(id) })),
  filterAllLabel: '全部类型',
}
