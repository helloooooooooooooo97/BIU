import { parseRecordSandboxes, type RecordSandboxView } from '@biu/type-file-system/record-views'

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

const TAG_VIEW_FILE_ID = [
  /^tag-views-(.+)\.json$/i,
  /^tag-view-data-(.+)-([a-z0-9]{6,32})\.json$/i,
  /^tag-prop-data-(.+)-([a-z0-9]{6,32})\.json$/i,
  /^tag-prop-(.+)-([a-z0-9]{6,32})\.jsx$/i,
  /^tag-view-(.+)-([a-z0-9]{6,32})\.jsx$/i,
  /^prop-view-data-(.+)-([a-z0-9]{6,32})\.json$/i,
  /^view-data-(.+)-([a-z0-9]{6,32})\.json$/i,
  /^prop-view-(.+)-([a-z0-9]{6,32})\.jsx$/i,
  /^view-(.+)-([a-z0-9]{6,32})\.jsx$/i,
]

export function tagIdFromViewDocName(name: string) {
  const file = String(name ?? '')
    .trim()
    .replace(/^assets\//, '')
    .replace(/^.*[/\\]/, '')
  for (const pattern of TAG_VIEW_FILE_ID) {
    const hit = pattern.exec(file)
    if (hit) return hit[1] ?? ''
  }
  return ''
}

export function createTagViewId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8)
}
