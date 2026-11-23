import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'vitest'
import type { DbRecord, FieldSpec } from '@biu/type-file-system'
import {
  buildTableClipboardPayload,
  buildTablePastePlan,
  clearTableClipboard,
  coerceClipboardCell,
  formatTablePasteNotice,
  parseClipboardMatrix,
  parseHtmlTableMatrix,
  parseTsvMatrix,
  rememberTableClipboard,
  resolvePasteTargetBounds,
  tableFillDownHotkey,
  type TableClipboardCell,
  type TablePasteColumn,
} from './table-paste.ts'

afterEach(() => {
  clearTableClipboard()
})

const writable = (field: FieldSpec) => Boolean(field.writable) && field.type !== 'file' && field.type !== 'action'

describe('table-paste clipboard parsing', () => {
  it('parses RFC 4180 TSV including quoted newlines, tabs, and strips single trailing newline', () => {
    assert.deepEqual(parseTsvMatrix('BIU\n'), [['BIU']])
    assert.deepEqual(parseTsvMatrix('A\tB\r\nC\tD\r\n'), [
      ['A', 'B'],
      ['C', 'D'],
    ])
    assert.deepEqual(parseTsvMatrix('"hello\nworld"\t"a""b"\n1\t2'), [
      ['hello\nworld', 'a"b'],
      ['1', '2'],
    ])
  })

  it('parses HTML table matrices from spreadsheet clipboards', () => {
    const html = '<table><tr><td>BIU</td><td>+595</td></tr><tr><td>line1<br>line2</td><td>P1 &amp; P2</td></tr></table>'
    assert.deepEqual(parseHtmlTableMatrix(html), [
      ['BIU', '+595'],
      ['line1\nline2', 'P1 & P2'],
    ])
  })

  it('prefers internal rich clipboard when plain text matches and falls back when external clipboard changes', () => {
    const payload = buildTableClipboardPayload([{ id: 'r1', key: 'project' }], () => ({
      text: 'BIU',
      raw: 'BIU',
      fieldType: 'select',
      fieldKey: 'project',
      readonly: false,
      empty: false,
    }))
    assert.ok(payload)
    rememberTableClipboard(payload)

    const hit = parseClipboardMatrix({ plain: 'BIU\n' })
    assert.equal(hit[0]?.[0]?.fromInternal, true)
    assert.equal(hit[0]?.[0]?.fieldType, 'select')
    assert.equal(hit[0]?.[0]?.raw, 'BIU')

    const external = parseClipboardMatrix({ plain: 'OTHER' })
    assert.equal(external[0]?.[0]?.fromInternal, false)
    assert.equal(external[0]?.[0]?.text, 'OTHER')
  })
})

describe('table-paste bounds & matrix mapping', () => {
  it('broadcasts 1x1 source across entire target selection', () => {
    const bounds = resolvePasteTargetBounds({
      srcRows: 1,
      srcCols: 1,
      selRStart: 0,
      selREnd: 6,
      selCStart: 3,
      selCEnd: 3,
      maxRows: 10,
      maxCols: 6,
    })
    assert.deepEqual(bounds, { rStart: 0, rEnd: 6, cStart: 3, cEnd: 3 })
  })

  it('tiles r x c source when target selection is an exact multiple', () => {
    const bounds = resolvePasteTargetBounds({
      srcRows: 2,
      srcCols: 1,
      selRStart: 0,
      selREnd: 5,
      selCStart: 1,
      selCEnd: 1,
      maxRows: 10,
      maxCols: 6,
    })
    assert.deepEqual(bounds, { rStart: 0, rEnd: 5, cStart: 1, cEnd: 1 })
  })

  it('expands from anchor and clamps to grid bounds when target is single cell or non-multiple', () => {
    const bounds = resolvePasteTargetBounds({
      srcRows: 3,
      srcCols: 2,
      selRStart: 8,
      selREnd: 8,
      selCStart: 5,
      selCEnd: 5,
      maxRows: 10,
      maxCols: 6,
    })
    assert.deepEqual(bounds, { rStart: 8, rEnd: 9, cStart: 5, cEnd: 5 })
  })
})

describe('table-paste readonly columns and type coercion', () => {
  const columns: TablePasteColumn[] = [
    { key: 'title', field: { type: 'string', label: '标题', writable: true } },
    { key: 'actions', field: { type: 'action', label: '动作', writable: false } },
    { key: 'priority', field: { type: 'string', label: '优先级', enum: ['P0', 'P1', 'P2'], writable: true } },
    { key: 'done', field: { type: 'boolean', label: '完成', writable: true } },
    { key: 'added', field: { type: 'number', label: '+', writable: true } },
    { key: 'createdAt', field: { type: 'number', format: 'datetime', label: '提交时间', writable: true } },
    { key: 'project', field: { type: 'string', label: '项目', enum: ['BIU', 'Cordis'], writable: true } },
    { key: 'computed', field: { type: 'string', label: '公式', writable: true, computed: true } },
  ]

  const rows: DbRecord[] = [
    { id: 'r1', title: 'Old 1', priority: 'P2', done: false, added: 10, createdAt: 0, project: '' },
    { id: 'r2', title: 'Old 2', priority: 'P2', done: false, added: 20, createdAt: 0, project: '' },
    { id: 'r3', title: 'Old 3', priority: 'P2', done: false, added: 30, createdAt: 0, project: '' },
  ]
  const rowIds = rows.map((r) => r.id)
  const findRow = (id: string) => rows.find((r) => r.id === id)
  const readVal = (row: DbRecord, key: string) => row[key]

  it('broadcasts a single select value (BIU) across all 3 selected rows', () => {
    const src: TableClipboardCell[][] = [[{ text: 'BIU', raw: 'BIU', fieldType: 'select', empty: false, fromInternal: true }]]
    const plan = buildTablePastePlan({
      sourceMatrix: src,
      rowIds,
      columns,
      selection: { anchor: { id: 'r1', key: 'project' }, focus: { id: 'r3', key: 'project' } },
      findRow,
      readCurrentValue: readVal,
      cellFieldWritable: writable,
    })

    assert.equal(plan.mutations.length, 3)
    assert.deepEqual(
      plan.mutations.map((m) => [m.row.id, m.key, m.value]),
      [
        ['r1', 'project', 'BIU'],
        ['r2', 'project', 'BIU'],
        ['r3', 'project', 'BIU'],
      ],
    )
    assert.equal(formatTablePasteNotice(plan.stats, '粘贴'), '已粘贴 3 个单元格')
  })

  it('positionally skips readonly/action columns without shifting subsequent columns', () => {
    const src = parseClipboardMatrix({ plain: 'New Title\tIGNORED_ACTION\tP0' })
    const plan = buildTablePastePlan({
      sourceMatrix: src,
      rowIds,
      columns,
      selection: { anchor: { id: 'r1', key: 'title' }, focus: { id: 'r1', key: 'title' } },
      findRow,
      readCurrentValue: readVal,
      cellFieldWritable: writable,
    })

    assert.deepEqual(
      plan.mutations.map((m) => [m.key, m.value]),
      [
        ['title', 'New Title'],
        ['priority', 'P0'],
      ],
    )
    assert.equal(plan.stats.skippedReadonly, 1)
    assert.equal(plan.stats.skippedInvalid, 0)
    assert.equal(formatTablePasteNotice(plan.stats, '粘贴'), '已粘贴 2 个单元格（跳过 1 个不可编辑格）')
  })

  it('skips type-mismatched cells while preserving valid cells (partial success)', () => {
    // priority='INVALID_ENUM' (skip), done='是' (true), added='not-a-num' (skip), createdAt='2026/11/23 22:24' (valid ts)
    const src = parseClipboardMatrix({ plain: 'INVALID_ENUM\t是\tnot-a-num\t2026/11/23 22:24' })
    const plan = buildTablePastePlan({
      sourceMatrix: src,
      rowIds,
      columns,
      selection: { anchor: { id: 'r1', key: 'priority' }, focus: { id: 'r1', key: 'priority' } },
      findRow,
      readCurrentValue: readVal,
      cellFieldWritable: writable,
    })

    assert.equal(plan.mutations.length, 2)
    assert.equal(plan.mutations[0]?.key, 'done')
    assert.equal(plan.mutations[0]?.value, true)
    assert.equal(plan.mutations[1]?.key, 'createdAt')
    assert.equal(plan.mutations[1]?.value, new Date(2026, 10, 23, 22, 24, 0).getTime())
    assert.equal(plan.stats.skippedInvalid, 2)
    assert.equal(formatTablePasteNotice(plan.stats, '粘贴'), '已粘贴 2 个单元格（跳过 2 个类型不匹配格）')
  })

  it('treats empty cells as valid clears rather than type mismatches', () => {
    const src: TableClipboardCell[][] = [[{ text: '', raw: null, empty: true, fromInternal: false }]]
    const plan = buildTablePastePlan({
      sourceMatrix: src,
      rowIds,
      columns,
      selection: { anchor: { id: 'r1', key: 'priority' }, focus: { id: 'r1', key: 'added' } },
      findRow,
      readCurrentValue: readVal,
      cellFieldWritable: writable,
    })

    // priority -> '', done -> false (already false so unchanged), added -> null
    assert.deepEqual(
      plan.mutations.map((m) => [m.key, m.value]),
      [
        ['priority', ''],
        ['added', null],
      ],
    )
    assert.equal(plan.stats.unchanged, 1)
    assert.equal(plan.stats.skippedInvalid, 0)
  })

  it('coerces formatted numbers (+595, 1,506, ¥99.5) and rejects NaN', () => {
    const numField: FieldSpec = { type: 'number', writable: true }
    assert.deepEqual(coerceClipboardCell({ text: '+595', empty: false, fromInternal: false }, numField), { ok: true, value: 595 })
    assert.deepEqual(coerceClipboardCell({ text: '1,506', empty: false, fromInternal: false }, numField), { ok: true, value: 1506 })
    assert.deepEqual(coerceClipboardCell({ text: '¥99.5', empty: false, fromInternal: false }, numField), { ok: true, value: 99.5 })
    assert.deepEqual(coerceClipboardCell({ text: '-410', empty: false, fromInternal: false }, numField), { ok: true, value: -410 })
    assert.deepEqual(coerceClipboardCell({ text: 'hello', empty: false, fromInternal: false }, numField), { ok: false, reason: 'invalid' })
  })

  it('coerces multi-select by splitting Chinese/English separators and filtering enum', () => {
    const msField: FieldSpec = { type: 'string[]', enum: ['A', 'B', 'C'], writable: true }
    assert.deepEqual(coerceClipboardCell({ text: 'a，C; invalid', empty: false, fromInternal: false }, msField), {
      ok: true,
      value: ['A', 'C'],
    })
    assert.deepEqual(coerceClipboardCell({ text: 'unknown', empty: false, fromInternal: false }, msField), {
      ok: false,
      reason: 'invalid',
    })
  })

  it('reports all-readonly and all-invalid notices clearly', () => {
    const src = parseClipboardMatrix({ plain: 'abc' })
    const roPlan = buildTablePastePlan({
      sourceMatrix: src,
      rowIds,
      columns,
      selection: { anchor: { id: 'r1', key: 'computed' }, focus: { id: 'r2', key: 'computed' } },
      findRow,
      readCurrentValue: readVal,
      cellFieldWritable: writable,
    })
    assert.equal(roPlan.mutations.length, 0)
    assert.equal(formatTablePasteNotice(roPlan.stats, '粘贴'), '未粘贴：目标列不可编辑')

    const badPlan = buildTablePastePlan({
      sourceMatrix: src,
      rowIds,
      columns,
      selection: { anchor: { id: 'r1', key: 'added' }, focus: { id: 'r2', key: 'added' } },
      findRow,
      readCurrentValue: readVal,
      cellFieldWritable: writable,
    })
    assert.equal(badPlan.mutations.length, 0)
    assert.equal(formatTablePasteNotice(badPlan.stats, '粘贴'), '未粘贴：内容与目标列类型不匹配')
  })

  it('tableFillDownHotkey matches Cmd/Ctrl+D only', () => {
    assert.equal(tableFillDownHotkey({ key: 'd', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }), true)
    assert.equal(tableFillDownHotkey({ key: 'D', metaKey: false, ctrlKey: true, altKey: false, shiftKey: false }), true)
    assert.equal(tableFillDownHotkey({ key: 'd', metaKey: true, ctrlKey: false, altKey: false, shiftKey: true }), false)
    assert.equal(tableFillDownHotkey({ key: 'd', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, isComposing: true }), false)
  })
})
