import {
  DEFAULT_RECORD_LAYOUT_ID,
  defaultRecordLayout,
  listedRecordLayouts,
  parseRecordLayouts,
  type RecordLayoutView,
} from '@biu/type-file-system/record-views'

export const PAGE_DEFAULT_LAYOUT_ID = DEFAULT_RECORD_LAYOUT_ID
export type PageLayoutView = RecordLayoutView
export type PageLayoutSort = RecordLayoutView['sort']

export function layoutsAssetName(pageId: string) {
  return `page-layouts-${String(pageId ?? '').trim()}.json`
}

export function defaultPageLayout(): PageLayoutView {
  return defaultRecordLayout('doc')
}

export function parsePageLayouts(raw: unknown): PageLayoutView[] {
  return parseRecordLayouts(raw, 'doc')
}

export function listedPageLayouts(raw: unknown): PageLayoutView[] {
  return listedRecordLayouts(raw, 'doc')
}
