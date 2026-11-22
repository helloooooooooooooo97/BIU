/** @vitest-environment jsdom */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { recordEditorExtensions } from './kit.ts'
import { assignTopLevelBlockIds } from './block-id.ts'
import { captureCommentAnchor, resolveCommentAnchor } from './comment-anchor.ts'
import { collectDriftedCommentAnchors, getCommentRange, setEditorComments } from './comment-plugin.ts'

function createTestEditor(markdown: string) {
  const editor = new Editor({
    extensions: recordEditorExtensions(),
    content: markdown,
    contentType: 'markdown',
  })
  const tr = assignTopLevelBlockIds(editor.state)
  if (tr) editor.view.dispatch(tr)
  return editor
}

test('comment anchor survives prepending text and disambiguates duplicate phrases', () => {
  const editor = createTestEditor('第一处苹果很好吃，第二处苹果也很甜。')
  try {
    const text = editor.state.doc.textContent
    const secondIdx = text.indexOf('苹果', text.indexOf('苹果') + 1)
    // pos = secondIdx + 1 (paragraph content starts at 1)
    const anchor = captureCommentAnchor(editor.state.doc, secondIdx + 1, secondIdx + 1 + 2)
    assert.ok(anchor)
    assert.equal(anchor.quote, '苹果')
    assert.ok(anchor.prefix.includes('第二处'))

    // Tier 1: exact offset match
    const exact = resolveCommentAnchor(editor.state.doc, anchor)
    assert.ok(exact)
    assert.equal(exact.confidence, 'exact-offset')
    assert.equal(editor.state.doc.textBetween(exact.from, exact.to), '苹果')

    // Prepend text at start of paragraph -> offset shifts, Tier 2 disambiguates second 苹果!
    editor.commands.insertContentAt(1, '新增的前缀内容：')
    const shifted = resolveCommentAnchor(editor.state.doc, anchor)
    assert.ok(shifted)
    assert.equal(shifted.confidence, 'block-context')
    assert.equal(editor.state.doc.textBetween(shifted.from, shifted.to), '苹果')
    assert.ok(shifted.from > exact.from)
    assert.ok(shifted.updated && shifted.updated.offset > anchor.offset)
  } finally {
    editor.destroy()
  }
})

test('comment anchor survives edits inside the quoted span via fuzzy/context match', () => {
  const editor = createTestEditor('视图分组支持按天分组以及自定义排序。')
  try {
    const text = editor.state.doc.textContent
    const idx = text.indexOf('按天分组')
    const anchor = captureCommentAnchor(editor.state.doc, idx + 1, idx + 1 + 4)
    assert.ok(anchor)

    // Simulate external / Agent edit inside the commented text: "按天分组" -> "按天和按周分组"
    editor.commands.setContent('视图分组支持按天和按周分组以及自定义排序。', { contentType: 'markdown' })
    const recovered = resolveCommentAnchor(editor.state.doc, anchor)
    assert.ok(recovered)
    assert.equal(editor.state.doc.textBetween(recovered.from, recovered.to), '按天和按周分组')
    assert.equal(recovered.updated?.originalQuote, '按天分组')
    assert.equal(recovered.updated?.quote, '按天和按周分组')
  } finally {
    editor.destroy()
  }
})

test('comment anchor recovers across blocks when blockId is lost and detaches when text is deleted', () => {
  const editor = createTestEditor('段落一\n\n目标批注文字在这里。')
  try {
    const doc = editor.state.doc
    const pos = doc.textContent.indexOf('目标批注文字')
    // Find exact doc pos in second paragraph
    let foundFrom = -1
    doc.descendants((node, p) => {
      if (node.isText && node.text?.includes('目标批注文字')) {
        foundFrom = p + node.text.indexOf('目标批注文字')
      }
    })
    assert.ok(pos >= 0 && foundFrom > 0)
    const anchor = captureCommentAnchor(doc, foundFrom, foundFrom + 6)!
    // Simulate lost blockId (e.g., Agent rewrote paragraph)
    const lostBlockAnchor = { ...anchor, blockId: 'nonexistent99' }
    const docHit = resolveCommentAnchor(editor.state.doc, lostBlockAnchor)
    assert.ok(docHit)
    assert.equal(docHit.confidence, 'doc-match')
    assert.equal(editor.state.doc.textBetween(docHit.from, docHit.to), '目标批注文字')

    // Completely delete quoted text -> detached (null)
    editor.commands.setContent('完全无关的新正文内容。', { contentType: 'markdown' })
    assert.equal(resolveCommentAnchor(editor.state.doc, anchor), null)
  } finally {
    editor.destroy()
  }
})

test('editorComments plugin maps ranges live on edit and collects drifted anchors', () => {
  const editor = createTestEditor('支持按天分组功能。')
  try {
    const anchor = captureCommentAnchor(editor.state.doc, 3, 7)! // "按天分组"
    const threads = [{ id: 'cmt_1', status: 'open' as const, anchor }]
    setEditorComments(editor, threads, 'cmt_1')
    assert.deepEqual(getCommentRange(editor, 'cmt_1'), { from: 3, to: 7 })

    // Insert text before the commented span -> range shifts automatically
    editor.commands.insertContentAt(1, '新版')
    assert.deepEqual(getCommentRange(editor, 'cmt_1'), { from: 5, to: 9 })

    const drifted = collectDriftedCommentAnchors(editor, threads)
    assert.equal(drifted.length, 1)
    assert.equal(drifted[0]!.id, 'cmt_1')
    assert.equal(drifted[0]!.anchor.quote, '按天分组')
    assert.equal(drifted[0]!.anchor.offset, 4)
    assert.equal(drifted[0]!.anchor.originalQuote, '按天分组')
  } finally {
    editor.destroy()
  }
})

test('captureCommentAnchor skips empty trailing boundary and captures full multi-block selection', () => {
  const editor = createTestEditor('- 尚未进行浏览器视觉复核。\n\nPR #1958 已合并到 fix 分支。\n\n## 需求背景')
  try {
    const doc = editor.state.doc
    const listEnd = doc.child(0).nodeSize
    // 模拟从列表最后一行末尾边界向下跨块拖选到后续段落与标题
    const fromAtListTrail = listEnd - 2
    const toInHeading = doc.content.size - 1
    const anchor = captureCommentAnchor(doc, fromAtListTrail, toInHeading)
    assert.ok(anchor, 'cross-block selection starting at list trailing boundary must still capture an anchor')
    assert.equal(anchor.quote, 'PR #1958 已合并到 fix 分支。\n需求背景')

    const hit = resolveCommentAnchor(doc, anchor)
    assert.ok(hit)
    assert.equal(doc.textBetween(hit.from, hit.to, '\n'), 'PR #1958 已合并到 fix 分支。\n需求背景')
  } finally {
    editor.destroy()
  }
})
