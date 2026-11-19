import { useCallback, useRef, type RefObject } from 'react'

const TOOL = '.tasks-search-wrap, .tasks-sort-wrap, .tasks-filter-btn-wrap, .fsdb-refresh-wrap, .tasks-refresh'

/** Keep a prefix of tools, reserving the view name and the create action. */
export function fitToolbarTools(toolbar: HTMLElement) {
  const left = toolbar.querySelector<HTMLElement>(':scope > .tasks-toolbar-left')
  const right = toolbar.querySelector<HTMLElement>(':scope > .tasks-toolbar-right')
  if (!left || !right) return
  const children = [...right.children].filter((node): node is HTMLElement => node instanceof HTMLElement)
  for (const child of children) child.removeAttribute('data-toolbar-hidden')
  const tools = children.filter((child) => child.matches(TOOL))
  const toolbarStyle = getComputedStyle(toolbar)
  const gap = parseFloat(getComputedStyle(right).columnGap) || 0
  const fixed = children.filter((child) => !child.matches(TOOL) && child.getBoundingClientRect().width > 0)
  const reserved = fixed.reduce((sum, child) => sum + child.getBoundingClientRect().width, 0)
    + Math.max(0, fixed.length - 1) * gap
  const contentWidth = toolbar.clientWidth - (parseFloat(toolbarStyle.paddingLeft) || 0)
    - (parseFloat(toolbarStyle.paddingRight) || 0)
  left.style.maxWidth = `${Math.max(0, contentWidth - reserved - (parseFloat(toolbarStyle.columnGap) || 0))}px`
  const available = Math.max(0, toolbar.getBoundingClientRect().right
    - (parseFloat(toolbarStyle.paddingRight) || 0)
    - left.getBoundingClientRect().right - (parseFloat(toolbarStyle.columnGap) || 0))
  let used = reserved
  let count = fixed.length
  let full = false
  for (const tool of tools) {
    const width = tool.getBoundingClientRect().width
    const needed = width + (count ? gap : 0)
    if (full || used + needed > available) {
      full = true
      tool.setAttribute('data-toolbar-hidden', '')
    } else {
      used += needed
      count += 1
    }
  }
}

export function useToolbarOverflow(ref: RefObject<HTMLDivElement | null>) {
  const cleanup = useRef<(() => void) | null>(null)
  return useCallback((node: HTMLDivElement | null) => {
    cleanup.current?.()
    cleanup.current = null
    ref.current = node
    if (!node) return
    const fit = () => fitToolbarTools(node)
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    resize?.observe(node)
    const left = node.querySelector(':scope > .tasks-toolbar-left')
    if (left) resize?.observe(left)
    const mutation = new MutationObserver(fit)
    mutation.observe(node, { childList: true, subtree: true, characterData: true })
    fit()
    cleanup.current = () => { resize?.disconnect(); mutation.disconnect() }
  }, [ref])
}
