/** 就绪之后再压一次：翻页、搜索、滚动、展开树、点会话输入。 */

export function stressInteractSource() {
  return `(async () => {
    const out = { pager: false, search: false, scroll: false, tree: false, composer: false }
    const next = document.querySelector('.fsdb-pager-nav button[aria-label="下一页"]')
    if (next && !next.disabled) {
      next.click()
      out.pager = true
    }
    const searchBtn = document.querySelector('.tasks-search-wrap button[aria-label="搜索"]')
    if (searchBtn) {
      searchBtn.click()
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    }
    const input = document.querySelector('input.tasks-search')
    if (input) {
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
      desc.set.call(input, '压测')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      out.search = true
    }
    const wrap = document.querySelector('.tasks-table-wrap, .fsdb-main, [data-testid="app-shell"]')
    if (wrap) {
      wrap.scrollTop = Math.max(wrap.scrollHeight, 2400)
      wrap.scrollLeft = Math.max(wrap.scrollWidth, 800)
      out.scroll = true
    }
    const tree = document.querySelector('.tasks-tree-toggle:not(.is-empty)')
    if (tree) {
      tree.click()
      out.tree = true
    }
    const composer = document.querySelector('textarea, [contenteditable="true"], .composer-pill')
    if (composer) {
      composer.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      out.composer = true
    }
    return out
  })()`
}

export function inspectInteractSource() {
  return `(() => {
    const longTasks = Array.isArray(window.__biuPerf?.longTasks) ? window.__biuPerf.longTasks : []
    return {
      tableRows: document.querySelectorAll('.tasks-table tbody tr[data-record-id]').length,
      searchValue: document.querySelector('input.tasks-search')?.value || '',
      pagerTotal: document.querySelector('.fsdb-pager-meta span:last-child')?.textContent || '',
      textLen: (document.body?.innerText || '').length,
      longTaskMs: longTasks.reduce((sum, row) => sum + (row.duration || 0), 0),
    }
  })()`
}
