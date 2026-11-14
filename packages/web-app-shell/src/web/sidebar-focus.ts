export const FOCUS_SHELL_SIDEBAR = 'biu:focus-shell-sidebar'
export const FOCUS_SHELL_TABLE = 'biu:focus-shell-table'

function visibleInSidebar(el: Element) {
  return !el.closest('[inert]')
}

function sidebarBar(root: ParentNode | null) {
  if (!root) return null
  if (root instanceof Element && root.classList.contains('app-side-bar')) return root
  return root.querySelector('.app-side-bar')
}

function sidebarIsNarrow(root: ParentNode | null) {
  return Boolean(sidebarBar(root)?.classList.contains('is-narrow'))
}

export function sidebarPlaceButtons(root: ParentNode | null) {
  if (!root) return [] as HTMLElement[]
  return [...root.querySelectorAll<HTMLElement>('.shell-side-places .app-side-actions-item')].filter(visibleInSidebar)
}

export function sidebarRowMain(row: HTMLElement) {
  return (
    row.querySelector<HTMLElement>('a.chat-session-row-main, button.chat-session-row-main') ??
    row.querySelector<HTMLElement>('.chat-session-row-main > button.min-w-0') ??
    row.querySelector<HTMLElement>('button.min-w-0.flex-1') ??
    row.querySelector<HTMLElement>('a[href]')
  )
}

export function sidebarRailButtons(root: ParentNode | null) {
  if (!root) return [] as HTMLElement[]
  return [...root.querySelectorAll<HTMLElement>('.fsdb-icon-rail-btn')].filter(visibleInSidebar)
}

export function sidebarListMains(root: ParentNode | null) {
  if (!root) return [] as HTMLElement[]
  const narrow = sidebarIsNarrow(root)
  const mains: HTMLElement[] = []
  if (narrow) mains.push(...sidebarRailButtons(root))
  for (const row of root.querySelectorAll<HTMLElement>('.chat-session-row')) {
    if (!visibleInSidebar(row)) continue
    if (narrow && row.closest('.fsdb-views-full')) continue
    const main = sidebarRowMain(row)
    if (main) mains.push(main)
  }
  return mains
}

export function sidebarStops(root: ParentNode | null) {
  return [...sidebarPlaceButtons(root), ...sidebarListMains(root)]
}

function activeStop(stops: HTMLElement[]) {
  return stops.find((el) => el.classList.contains('is-active') || Boolean(el.closest('.chat-session-row.is-active'))) ?? null
}

export function focusShellSidebar(root: ParentNode | null) {
  if (!root) return false
  const list = sidebarListMains(root)
  const places = sidebarPlaceButtons(root)
  const target = activeStop(list) ?? list[0] ?? activeStop(places) ?? places[0]
  if (!target) return false
  target.focus()
  return document.activeElement === target || target.contains(document.activeElement)
}

export function stepSidebarStop(stops: HTMLElement[], current: Element | null, dir: -1 | 1) {
  if (!stops.length) return null
  const index = current ? stops.indexOf(current as HTMLElement) : -1
  if (index < 0) return stops[dir > 0 ? 0 : stops.length - 1] ?? null
  return stops[Math.min(stops.length - 1, Math.max(0, index + dir))] ?? null
}
