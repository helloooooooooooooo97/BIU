/** 检查器里一条页面算「已经画出来」：详情壳在、标题在、正文编辑器在、不再转圈。 */

export function inspectInspectorPage(root = globalThis.document) {
  if (!root?.querySelector) {
    return { inspector: false, title: false, editor: false, loading: false, painted: false }
  }
  const inspector = Boolean(root.querySelector('[data-testid="inspector-database"]'))
  const title = Boolean(root.querySelector('.fsdb-detail-title-input, .inspector-database-page .fsdb-detail-title'))
  const editor = Boolean(
    root.querySelector('.page-editor, .fsdb-detail-doc, [data-testid="stub-page-editor"]'),
  )
  const loading = Boolean(root.querySelector('[data-testid="page-content-loading"]'))
  return {
    inspector,
    title,
    editor,
    loading,
    painted: inspector && title && editor && !loading,
  }
}

export function inspectInspectorPageSource() {
  return `(${inspectInspectorPage.toString()})()`
}

export function clickCreateRecordSource() {
  return `(() => {
    const btn = document.querySelector('button.fsdb-create-btn, button[aria-label="新建记录"]')
    if (!btn || btn.disabled) return { clicked: false }
    btn.click()
    return { clicked: true }
  })()`
}
