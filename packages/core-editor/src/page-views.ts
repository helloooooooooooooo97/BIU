import { parseRecordSandboxes, type RecordSandboxView } from '@biu/type-file-system/record-views'

export type PageSandboxView = RecordSandboxView

export function viewsAssetName(pageId: string) {
  return `page-views-${String(pageId ?? '').trim()}.json`
}

export function parsePageViews(raw: unknown): PageSandboxView[] {
  return parseRecordSandboxes(raw, '沙盒')
}
