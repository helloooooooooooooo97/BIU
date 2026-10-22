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

/** Space from the view wrap's left edge to the right controls, minus sibling chips. */
export function availableViewTabSpace(
  wrapLeft: number,
  rightLeft: number,
  siblingWidth = 0,
  gap = 8,
): number {
  return Math.max(0, rightLeft - wrapLeft - siblingWidth - gap)
}

export function leftClusterSiblingWidth(left: Element, wrap: Element, gap = 6): number {
  let width = 0
  let others = 0
  for (const child of Array.from(left.children)) {
    if (child === wrap) continue
    width += (child as HTMLElement).offsetWidth
    others += 1
  }
  return width + others * gap
}

export function splitVisibleViews<T extends { id: string }>(
  views: T[],
  visibleCount: number,
  activeId: string | undefined,
): { shown: T[]; hidden: T[] } {
  if (visibleCount >= views.length) return { shown: views, hidden: [] }
  const take = Math.max(1, Math.min(visibleCount, views.length))
  if (take === 1 && activeId) {
    const active = views.find((view) => view.id === activeId)
    if (active) return { shown: [active], hidden: views.filter((view) => view.id !== activeId) }
  }
  return { shown: views.slice(0, take), hidden: views.slice(take) }
}
