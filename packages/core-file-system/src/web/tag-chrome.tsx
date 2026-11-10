import { lazy, Suspense, type ComponentProps } from 'react'
import { TagIcon } from '@heroicons/react/16/solid'
import { tagTone } from '@biu/biu-ui'
import type { DbRecord } from '@biu/type-file-system'
import type { CollectionChrome } from '@biu/type-file-system/ui'
import { TagContent, TagDetailBar } from './tag-detail-bar.tsx'

const TagCollectBoardLazy = lazy(() => import('./tag-collect.tsx').then((m) => ({ default: m.TagCollectBoard })))

export function TagCollectBoard(props: ComponentProps<typeof TagCollectBoardLazy>) {
  return (
    <Suspense fallback={null}>
      <TagCollectBoardLazy {...props} />
    </Suspense>
  )
}

function TagRecordIcon({ record, size = 16 }: { record: DbRecord; size?: number }) {
  return (
    <TagIcon
      aria-hidden
      style={{ width: size, height: size, color: tagTone(record.id) }}
    />
  )
}

export const tagsChrome: CollectionChrome = {
  Board: TagCollectBoard,
  Icon: TagRecordIcon,
  DetailBar: TagDetailBar,
  Content: TagContent,
}
