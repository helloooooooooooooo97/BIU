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
  rows: ArrayLike<TableFoldRowLike> | null | undefined,
  reducedMotion = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches),
): Map<string, number> | null {
  if (reducedMotion || !rows) return null
  const snap = new Map<string, number>()
  for (let i = 0; i < rows.length; i += 1) {
    const tr = rows[i]
    if (!tr) continue
    const key = tableFoldRowKey(tr)
    if (key) snap.set(key, tr.getBoundingClientRect().top)
  }
  return snap.size ? snap : null
}

export function playTableFoldFlip(
  rows: ArrayLike<TableFoldRowLike> | null | undefined,
  prev: Map<string, number> | null,
): void {
  if (!prev || !rows) return
  for (let i = 0; i < rows.length; i += 1) {
    const tr = rows[i]
    if (!tr || typeof tr.animate !== 'function') break
    const key = tableFoldRowKey(tr)
    if (!key) continue
    const oldTop = prev.get(key)
    const rawBase = tr.dataset.rowTop != null ? Number(tr.dataset.rowTop) : 0
    const baseY = Number.isFinite(rawBase) ? rawBase : 0
    const baseT = baseY === 0 ? 'translate3d(0, 0, 0)' : `translate3d(0, ${baseY}px, 0)`
    if (oldTop != null) {
      const deltaY = oldTop - tr.getBoundingClientRect().top
      if (Math.abs(deltaY) >= 1 && Math.abs(deltaY) < MAX_FLIP_DELTA_PX) {
        tr.animate(
          [
            { transform: `translate3d(0, ${baseY + deltaY}px, 0)` },
            { transform: baseT },
          ],
          { duration: FOLD_DURATION_MS, easing: FOLD_EASING },
        )
      }
    } else {
      tr.animate(
        [
          { opacity: 0, transform: `translate3d(0, ${baseY - 6}px, 0)` },
          { opacity: 1, transform: baseT },
        ],
        { duration: FOLD_DURATION_MS, easing: FOLD_EASING },
      )
    }
  }
}
