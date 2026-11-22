const FOLD_DURATION_MS = 180
const FOLD_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'
const MAX_FLIP_DELTA_PX = 2400

export type TableFoldRowLike = {
  dataset: Record<string, string | undefined>
  getBoundingClientRect: () => { top: number }
  animate?: (keyframes: Keyframe[], options?: KeyframeAnimationOptions) => unknown
}

export function tableFoldRowKey(tr: Pick<TableFoldRowLike, 'dataset'>): string {
  if (tr.dataset.rowKey) return tr.dataset.rowKey
  if (tr.dataset.groupKey) return `gh:${tr.dataset.groupKey}`
  if (tr.dataset.groupPager) return `gp:${tr.dataset.groupPager}`
  return ''
}

export function captureTableFoldSnapshot(
  rows: Iterable<TableFoldRowLike> | null | undefined,
  reducedMotion = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches),
): Map<string, number> | null {
  if (reducedMotion || !rows) return null
  const snap = new Map<string, number>()
  for (const tr of rows) {
    const key = tableFoldRowKey(tr)
    if (key) snap.set(key, tr.getBoundingClientRect().top)
  }
  return snap.size ? snap : null
}

export function playTableFoldFlip(
  rows: Iterable<TableFoldRowLike> | null | undefined,
  prev: Map<string, number> | null,
): void {
  if (!prev || !rows) return
  for (const tr of rows) {
    if (typeof tr.animate !== 'function') break
    const key = tableFoldRowKey(tr)
    if (!key) continue
    const oldTop = prev.get(key)
    if (oldTop != null) {
      const deltaY = oldTop - tr.getBoundingClientRect().top
      if (Math.abs(deltaY) >= 1 && Math.abs(deltaY) < MAX_FLIP_DELTA_PX) {
        tr.animate(
          [{ transform: `translate3d(0, ${deltaY}px, 0)` }, { transform: 'translate3d(0, 0, 0)' }],
          { duration: FOLD_DURATION_MS, easing: FOLD_EASING },
        )
      }
    } else {
      tr.animate(
        [
          { opacity: 0, transform: 'translate3d(0, -6px, 0)' },
          { opacity: 1, transform: 'translate3d(0, 0, 0)' },
        ],
        { duration: FOLD_DURATION_MS, easing: FOLD_EASING },
      )
    }
  }
}
