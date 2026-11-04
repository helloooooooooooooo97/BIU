import { lazy, Suspense, type ComponentProps } from 'react'
import type { CollectionChrome } from '@biu/type-file-system/ui'

const TagCollectBoardLazy = lazy(() => import('./tag-collect.tsx').then((m) => ({ default: m.TagCollectBoard })))

export function TagCollectBoard(props: ComponentProps<typeof TagCollectBoardLazy>) {
  return (
    <Suspense fallback={null}>
      <TagCollectBoardLazy {...props} />
    </Suspense>
  )
}

export const tagsChrome: CollectionChrome = {
  Board: TagCollectBoard,
}
