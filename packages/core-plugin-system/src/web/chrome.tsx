import type { DbRecord } from '@biu/type-file-system'
import type { CollectionChrome } from '@biu/type-file-system/ui'

function PluginTitle({ record, label }: { record: DbRecord; label: string }) {
  const enabled = record.enabled === true || record.enabled === 'true'
  return (
    <span className="inline-flex min-w-0 items-center" data-plugin-enabled={enabled ? '' : undefined}>
      <span className="truncate font-medium">{label}</span>
    </span>
  )
}

export const pluginsChrome: CollectionChrome = {
  Title: PluginTitle,
}
