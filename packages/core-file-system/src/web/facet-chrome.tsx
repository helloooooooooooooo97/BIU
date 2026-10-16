import { lazy, Suspense, type ComponentProps } from 'react'
import type { CollectionChrome } from '@biu/type-file-system/ui'

const FacetCollectBoardLazy = lazy(() => import('./facet-collect.tsx').then((m) => ({ default: m.FacetCollectBoard })))

export function FacetCollectBoard(props: ComponentProps<typeof FacetCollectBoardLazy>) {
  return (
    <Suspense fallback={null}>
      <FacetCollectBoardLazy {...props} />
    </Suspense>
  )
}

export const facetsChrome: CollectionChrome = {
  Board: FacetCollectBoard,
}
