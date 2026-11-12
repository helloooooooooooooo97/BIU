export { defaultPropSandboxSource } from '@biu/type-file-system/record-views'
import { parseRecordSandboxes, type RecordSandboxView } from '@biu/type-file-system/record-views'

export type { RecordSandboxView as PagePropSandboxView }

export function propViewsAssetName(pageId: string) {
  return `page-prop-views-${String(pageId ?? '').trim()}.json`
}

export function parsePagePropViews(raw: unknown): RecordSandboxView[] {
  return parseRecordSandboxes(raw, '属性沙盒')
}
