import {
  defaultContentSandboxSource,
  defaultPropSandboxSource,
  parseRecordSandboxes,
  type RecordSandboxView,
} from '@biu/type-file-system/record-views'

export { defaultPropSandboxSource }

export type TagSandboxView = RecordSandboxView

export function tagViewsAssetName(tagId: string) {
  return `tag-views-${String(tagId ?? '').trim()}.json`
}

export function parseTagViews(raw: unknown): TagSandboxView[] {
  return parseRecordSandboxes(raw)
}

function docBaseName(raw: unknown) {
  return String(raw ?? '')
    .trim()
    .replace(/^assets\//, '')
    .replace(/^.*[/\\]/, '')
}

export function tagViewFileNames(record: { id?: unknown; views?: unknown; propViews?: unknown }): string[] {
  const id = String(record.id ?? '').trim()
  const out: string[] = []
  if (id) out.push(tagViewsAssetName(id))
  for (const view of [...parseTagViews(record.views), ...parseRecordSandboxes(record.propViews)]) {
    for (const raw of [view.file, view.dataFile]) {
      const name = docBaseName(raw)
      if (name) out.push(name)
    }
  }
  return out
}

export function isTagViewDocName(name: string) {
  const file = String(name ?? '')
    .trim()
    .replace(/^assets\//, '')
    .replace(/^.*[/\\]/, '')
  if (/^tag-views-.+\.json$/i.test(file)) return true
  if (/^tag-view-data-.+\.json$/i.test(file)) return true
  if (/^tag-prop-data-.+\.json$/i.test(file)) return true
  if (/^tag-prop-.+\.jsx$/i.test(file)) return true
  if (/^prop-view-.+\.jsx$/i.test(file)) return true
  if (/^prop-view-data-.+\.json$/i.test(file)) return true
  if (/^view-data-.+\.json$/i.test(file)) return true
  if (/^view-.+\.jsx$/i.test(file)) return true
  return /^tag-view-.+\.jsx$/i.test(file)
}

export function tagIdFromViewDocName(name: string) {
  const file = String(name ?? '')
    .trim()
    .replace(/^assets\//, '')
    .replace(/^.*[/\\]/, '')
  const catalog = /^tag-views-(.+)\.json$/i.exec(file)
  if (catalog) return catalog[1] ?? ''
  const data = /^tag-view-data-(.+)-([a-z0-9]{6,32})\.json$/i.exec(file)
  if (data) return data[1] ?? ''
  const propData = /^tag-prop-data-(.+)-([a-z0-9]{6,32})\.json$/i.exec(file)
  if (propData) return propData[1] ?? ''
  const prop = /^tag-prop-(.+)-([a-z0-9]{6,32})\.jsx$/i.exec(file)
  if (prop) return prop[1] ?? ''
  const jsx = /^tag-view-(.+)-([a-z0-9]{6,32})\.jsx$/i.exec(file)
  return jsx?.[1] ?? ''
}

export function createTagViewId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8)
}

export const defaultTagSandboxSource = defaultContentSandboxSource
