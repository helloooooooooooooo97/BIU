/** @vitest-environment jsdom */
import assert from 'node:assert/strict'
import { afterEach, describe, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { CollectionSchemaPack } from '@biu/type-file-system'
import { adaptTagFieldValue, isLossyFieldTypeChange, retainArchivedSchemaValue } from '../shared/tag-value-compat.ts'
import { coerceTagPatch } from '../host/schema-coerce.ts'
import { TagStore } from '../host/tags-store.ts'
import { DefaultCell } from './fsdb-cells.tsx'
import { SchemaFieldEditor, TagPackEditor } from './schema-field.tsx'
import { persistTags } from './tag-catalog.ts'

async function seedCatalog(tags: CollectionSchemaPack[]) {
  globalThis.fetch = vi.fn(
    async () => new Response(JSON.stringify({ ok: true, tags }), { status: 200 }),
  ) as typeof fetch
  await persistTags(tags)
}

afterEach(async () => {
  cleanup()
  await seedCatalog([])
  vi.restoreAllMocks()
})

describe('tag field type compatibility & archived value preservation', () => {
  it('adapts lossless cross-type values and flags incompatible values without losing raw data', () => {
    // Lossless / safely parseable conversions
    assert.deepEqual(adaptTagFieldValue({ type: 'multi-select' }, 'P0').value, ['P0'])
    assert.equal(adaptTagFieldValue({ type: 'multi-select' }, 'P0').incompatible, false)

    assert.equal(adaptTagFieldValue({ type: 'select' }, ['P0']).value, 'P0')
    assert.equal(adaptTagFieldValue({ type: 'select' }, ['P0']).incompatible, false)

    assert.equal(adaptTagFieldValue({ type: 'number' }, '42.5').value, 42.5)
    assert.equal(adaptTagFieldValue({ type: 'number' }, '42.5').incompatible, false)

    assert.equal(adaptTagFieldValue({ type: 'string' }, 123).value, '123')
    assert.equal(adaptTagFieldValue({ type: 'string' }, ['A', 'B']).value, 'A、B')

    assert.equal(adaptTagFieldValue({ type: 'boolean' }, '是').value, true)
    assert.equal(adaptTagFieldValue({ type: 'boolean' }, '0').value, false)

    const dt = adaptTagFieldValue({ type: 'datetime' }, '2026-11-28')
    assert.equal(dt.incompatible, false)
    assert.equal(typeof dt.value, 'number')

    // Lossy / incompatible values preserve raw data and flag incompatible
    const badNum = adaptTagFieldValue({ type: 'number' }, '待定')
    assert.equal(badNum.incompatible, true)
    assert.equal(badNum.raw, '待定')
    assert.equal(badNum.rawPreview, '待定')

    const badSelect = adaptTagFieldValue({ type: 'select' }, ['P0', 'P1'])
    assert.equal(badSelect.incompatible, true)
    assert.equal(badSelect.rawPreview, 'P0、P1')

    const badBool = adaptTagFieldValue({ type: 'boolean' }, '高优先级')
    assert.equal(badBool.incompatible, true)
    assert.equal(badBool.rawPreview, '高优先级')

    const badDate = adaptTagFieldValue({ type: 'datetime' }, '下周五之前')
    assert.equal(badDate.incompatible, true)
    assert.equal(badDate.rawPreview, '下周五之前')

    assert.equal(isLossyFieldTypeChange('select', 'multi-select'), false)
    assert.equal(isLossyFieldTypeChange('number', 'string'), false)
    assert.equal(isLossyFieldTypeChange('string', 'number'), true)
    assert.equal(isLossyFieldTypeChange('multi-select', 'select'), true)
  })

  it('retainArchivedSchemaValue keeps non-empty deleted/detached values and trims empty leftovers', () => {
    const packs: CollectionSchemaPack[] = [
      {
        id: 'tag-1',
        label: '需求',
        fields: [
          { key: 'f1', label: '优先级', type: 'select' },
          { key: 'f2', label: '旧备注', type: 'string', deleted: true },
          { key: 'f3', label: '空白旧字段', type: 'string', deleted: true },
        ],
      },
    ]
    const retained = retainArchivedSchemaValue(
      {
        tags: ['tag-1'],
        values: {
          'tag-1': { f1: 'P0', f2: '保留历史说明', f3: '   ' },
          'tag-gone': { oldKey: '已删除标签的残留值', blankKey: '' },
        },
      },
      packs,
    )
    assert.deepEqual(retained.values['tag-1'], { f1: 'P0', f2: '保留历史说明' })
    assert.deepEqual(retained.values['tag-gone'], { oldKey: '已删除标签的残留值' })
  })

  it('preserves archived values across subsequent record edits and allows explicit orphan cleanup', () => {
    const store = new TagStore()
    const pack: CollectionSchemaPack = {
      id: 'tag-1',
      label: '需求',
      fields: [
        { key: 'prio', label: '优先级', type: 'select' },
        { key: 'deadline', label: '截止时间', type: 'string' },
      ],
    }
    store.upsert(pack)
    store.writeRecordTag(
      '/pages',
      'p1',
      { tags: ['tag-1'], values: { 'tag-1': { prio: 'P1', deadline: '周五前' } } },
      '页面1',
    )

    // Soft-delete `deadline`
    store.upsert({
      ...pack,
      fields: [
        { key: 'prio', label: '优先级', type: 'select' },
        { key: 'deadline', label: '截止时间', type: 'string', deleted: true },
      ],
    })

    // Editing another field (`prio`) must NOT wipe archived `deadline`
    const current = store.recordTag('/pages', 'p1')!
    const patched = coerceTagPatch(
      { tags: ['tag-1'], values: { 'tag-1': { prio: 'P0' } } },
      current,
      (id) => store.get(id),
    )
    store.writeRecordTag('/pages', 'p1', patched, '页面1')
    assert.equal(store.recordTag('/pages', 'p1')?.values['tag-1']?.prio, 'P0')
    assert.equal(store.recordTag('/pages', 'p1')?.values['tag-1']?.deadline, '周五前')

    // Explicitly clearing archived `deadline` (null) succeeds and removes only that key
    const cleaned = coerceTagPatch(
      { tags: ['tag-1'], values: { 'tag-1': { deadline: null } } },
      store.recordTag('/pages', 'p1')!,
      (id) => store.get(id),
    )
    store.writeRecordTag('/pages', 'p1', cleaned, '页面1')
    assert.equal(store.recordTag('/pages', 'p1')?.values['tag-1']?.prio, 'P0')
    assert.equal(store.recordTag('/pages', 'p1')?.values['tag-1']?.deadline, undefined)
  })

  it('DefaultCell renders adapted values cleanly and shows mismatch warning badge for incompatible values', () => {
    const okView = render(<DefaultCell field={{ type: 'multi-select' }} value="P0" />)
    assert.equal(okView.container.textContent, 'P0')
    assert.equal(okView.queryByTestId('fsdb-compat-mismatch'), null)
    cleanup()

    const badView = render(<DefaultCell field={{ type: 'number' }} value="待定" />)
    const badge = badView.getByTestId('fsdb-compat-mismatch')
    assert.ok(badge.textContent?.includes('待定'))
  })

  it('SchemaFieldEditor surfaces soft-deleted pack fields and detached tag values in collector with cleanup', async () => {
    await seedCatalog([
      {
        id: 'tag-1',
        label: '需求',
        fields: [
          { key: 'prio', label: '优先级', type: 'number', writable: true },
          { key: 'oldNote', label: '旧备注', type: 'string', deleted: true, writable: true },
        ],
      },
    ])

    const changes: unknown[] = []
    const view = render(
      <SchemaFieldEditor
        collectionPath="/pages"
        record={{ id: 'p1', title: '测试页' }}
        writable
        value={{
          tags: ['tag-1'],
          values: {
            'tag-1': { prio: '高优待定', oldNote: '归档说明文本' },
            'tag-deleted': { legacy: '来自已删除标签的值' },
          },
        }}
        onChange={(next) => changes.push(next)}
      />,
    )

    // Incompatible value on live number field shows mismatch badge without hiding raw text
    assert.ok(view.getByTestId('fsdb-compat-mismatch').textContent?.includes('高优待定'))

    // Archived field inside tag pack is visible with restore + copy + cleanup buttons
    const packOrphans = view.getByTestId('fsdb-pack-orphans-tag-1')
    assert.ok(packOrphans.textContent?.includes('旧备注'))
    assert.ok(packOrphans.textContent?.includes('归档说明文本'))

    // Detached tag value appears in the 「未归属属性」 collector
    const collector = view.getByTestId('fsdb-orphan-collector')
    assert.ok(collector.textContent?.includes('未归属属性（1）'))
    assert.ok(collector.textContent?.includes('来自已删除标签的值'))

    // Clicking cleanup on archived field emits explicit null for that key
    fireEvent.click(view.getByLabelText('清理 旧备注'))
    const last = changes.at(-1) as { values: Record<string, Record<string, unknown>> }
    assert.equal(last.values['tag-1']?.oldNote, null)
    assert.equal(last.values['tag-1']?.prio, '高优待定')
  })

  it('TagPackEditor soft-deletes fields, shows archived fields for recovery, and allows type switching with notice', async () => {
    await seedCatalog([
      {
        id: 'tag-1',
        label: '需求',
        fields: [
          { key: 'prio', label: '优先级', type: 'string', writable: true },
          { key: 'archivedCol', label: '老列', type: 'number', deleted: true, writable: true },
        ],
      },
    ])

    const view = render(<TagPackEditor tagId="tag-1" />)
    const archivedSection = view.getByTestId('fsdb-tag-archived-fields')
    assert.ok(archivedSection.textContent?.includes('已归档字段（1）'))

    // Expand archived section and verify archived field is recoverable
    fireEvent.click(archivedSection.querySelector('button')!)
    assert.ok(view.getByLabelText('恢复 老列'))

    // Soft-deleting live field shows non-destructive archive notice
    fireEvent.click(view.getByLabelText('删除 优先级'))
    assert.ok(view.getByTestId('fsdb-type-change-hint').textContent?.includes('已归档字段「优先级」'))
  })
})
