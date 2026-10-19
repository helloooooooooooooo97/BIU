export function countFittingViewTabs(
  tabWidths: number[],
  available: number,
  gap: number,
): number {
  const n = tabWidths.length
  if (n === 0) return 0
  const widthOf = (count: number) => {
    let w = 0
    for (let i = 0; i < count; i++) w += tabWidths[i] + gap
    return w
  }
  if (widthOf(n) <= available) return n
  // 和右侧操控栏抢宽时只留当前选中那一个，其余进下拉，避免选中项落在遮挡里。
  return 1
}

export function viewTabsOverlapRight(left: Pick<DOMRect, 'right'>, right: Pick<DOMRect, 'left'>) {
  return left.right > right.left + 1
}

export function splitVisibleViews<T extends { id: string }>(
  views: T[],
  visibleCount: number,
  activeId: string | undefined,
): { shown: T[]; hidden: T[] } {
  if (visibleCount >= views.length) return { shown: views, hidden: [] }
  const take = Math.max(1, Math.min(visibleCount, views.length))
  const head = views.slice(0, take)
  if (!activeId || head.some((view) => view.id === activeId)) {
    return { shown: head, hidden: views.slice(take) }
  }
  const active = views.find((view) => view.id === activeId)
  if (!active) return { shown: head, hidden: views.slice(take) }
  const shown = [...views.slice(0, take - 1), active]
  const ids = new Set(shown.map((view) => view.id))
  return { shown, hidden: views.filter((view) => !ids.has(view.id)) }
}
