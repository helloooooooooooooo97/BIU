import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { CollectionSchema } from '@biu/type-file-system'
import { REQUIRED_RECORD_FIELDS, normalizeSchemaValue } from '@biu/type-file-system'
import { actionWhenKeys, defaultColumnKeys, facetFlatColumnKey, flattenFacetColumns, facetColumnTitle, inferPackFieldType, listProjectionKeys, parseFacetFlatColumnKey, patchFacetFlatValue, pinActionColumn, pinLabelColumn, contentFieldKey, flattenTree, formatField, fieldHasValue, fieldValueOptions, GROUP_STRATEGIES, groupField, groupListFilter, groupListKeys, groupRecords, groupableFields, hasTreeLinks, treeChildren, isGroupableKind, isViewModeId, matchActionWhen, mergeListFilters, overlayListed, previewActionRecord, parentFieldKey, readFacetFlatValue, recordLinkIds, resolveFieldType, uniqueValues } from './fields'
import { placedActions, visibleActions } from './fsdb-cells.tsx'

test('isViewModeId accepts builtin and custom slugs', () => {
  assert.equal(isViewModeId('table'), true)
  assert.equal(isViewModeId('graph'), true)
  assert.equal(isViewModeId('board'), false)
  assert.equal(isViewModeId('queue'), false)
  assert.equal(isViewModeId('cards'), false)
  assert.equal(isViewModeId('??'), false)
})

const schema: CollectionSchema = {
  labelField: 'title',
  fields: {
    ...REQUIRED_RECORD_FIELDS,
    title: { type: 'string' },
    status: { type: 'select', enum: ['todo', 'doing', 'done'] },
    tags: { type: 'multi-select' },
    dueAt: { type: 'datetime' },
    size: { type: 'number' },
  },
}

test('resolveFieldType maps legacy aliases', () => {
  assert.equal(resolveFieldType({ type: 'string[]' }), 'multi-select')
  assert.equal(resolveFieldType({ type: 'string', enum: ['a'] }), 'select')
  assert.equal(resolveFieldType({ type: 'number', format: 'datetime' }), 'datetime')
  assert.equal(resolveFieldType({ type: 'string', format: 'url' }), 'url')
  assert.equal(resolveFieldType({ type: 'image' }), 'image')
  assert.equal(resolveFieldType({ type: 'attachment' }), 'attachment')
  assert.equal(resolveFieldType({ type: 'facet' }), 'facet')
  assert.equal(resolveFieldType({ type: 'action' }), 'action')
  assert.equal(resolveFieldType({ type: 'ref' }), 'ref')
  assert.equal(resolveFieldType({ type: 'multi-ref' }), 'multi-ref')
})

test('closed enums keep stable values and expose translated labels', () => {
  const role = {
    type: 'select' as const,
    enum: ['owner', 'viewer'],
    enumLabels: { owner: '所有者', viewer: '查看者' },
  }
  assert.equal(formatField(role, 'owner'), '所有者')
  assert.deepEqual(fieldValueOptions([{ id: 'a', role: 'other' }], 'role', role), [
    { value: 'owner', label: '所有者' },
    { value: 'viewer', label: '查看者' },
  ])
})

test('fieldHasValue hides missing list/card/board chips', () => {
  assert.equal(fieldHasValue({ type: 'string' }, ''), false)
  assert.equal(fieldHasValue({ type: 'string' }, '   '), false)
  assert.equal(fieldHasValue({ type: 'string' }, null), false)
  assert.equal(fieldHasValue({ type: 'string' }, 'hello'), true)
  assert.equal(fieldHasValue({ type: 'select', enum: ['todo'] }, ''), false)
  assert.equal(fieldHasValue({ type: 'select', enum: ['todo'] }, 'todo'), true)
  assert.equal(fieldHasValue({ type: 'multi-select' }, []), false)
  assert.equal(fieldHasValue({ type: 'multi-select' }, ['a']), true)
  assert.equal(fieldHasValue({ type: 'boolean' }, false), false)
  assert.equal(fieldHasValue({ type: 'boolean' }, true), true)
  assert.equal(fieldHasValue({ type: 'number' }, 0), false)
  assert.equal(fieldHasValue({ type: 'number' }, 3), true)
  assert.equal(fieldHasValue({ type: 'datetime' }, 0), false)
  assert.equal(fieldHasValue({ type: 'url' }, 'javascript:alert(1)'), false)
  assert.equal(fieldHasValue({ type: 'url' }, 'https://example.com'), true)
  assert.equal(fieldHasValue({ type: 'action', label: '开始' }, null), true)
  assert.equal(fieldHasValue({ type: 'facet' }, { tags: [], values: {} }), false)
  assert.equal(fieldHasValue({ type: 'facet' }, { tags: ['dp'], values: {} }), true)
})

test('formatField renders datetime tags and media', () => {
  assert.equal(formatField(schema.fields.size, 2048), '2048')
  assert.equal(formatField(schema.fields.tags, ['a', 'b']), 'a, b')
  assert.equal(formatField(schema.fields.dueAt, 0), '')
  assert.equal(formatField({ type: 'datetime' }, new Date(2026, 8, 5, 9, 1).getTime()), '2026/09/05 09:01')
  assert.equal(formatField({ type: 'url' }, 'https://example.com/x'), 'https://example.com/x')
  assert.equal(formatField({ type: 'url' }, 'javascript:alert(1)'), '')
  assert.equal(formatField({ type: 'attachment' }, { name: 'a.pdf', href: 'https://cdn.example/a.pdf' }), 'a.pdf')
  assert.equal(formatField({ type: 'person' }, { kind: 'user', name: '用户' }), '用户')
  assert.equal(formatField({ type: 'person' }, { kind: 'system', name: '系统' }), '系统')
  assert.equal(formatField({ type: 'ref' }, 'rec-1'), 'rec-1')
  assert.equal(formatField({ type: 'multi-ref' }, ['a', 'b']), 'a, b')
  assert.equal(inferPackFieldType({ kind: 'user', name: '用户' }), 'person')
})

test('overlayListed clears omitted false flags from sparse list rows', () => {
  const base = { id: '1', running: true, installed: true, name: '插件' }
  const listed = { id: '1', installed: true, name: '插件' }
  const next = overlayListed(base, listed)
  assert.equal(next.running, false)
  assert.equal(next.installed, true)
  assert.equal(matchActionWhen(next, { installed: true, running: false }), true)
  assert.equal(matchActionWhen(next, { installed: true, running: true }), false)
  assert.equal(overlayListed(next, listed), next)
  assert.equal(overlayListed(base, { ...listed, running: true }).running, true)
})

test('previewActionRecord flips running from action when', () => {
  const row = { id: '1', installed: true, running: false }
  assert.equal(previewActionRecord(row, { when: { installed: true, running: false } }).running, true)
  assert.equal(previewActionRecord({ ...row, running: true }, { when: { installed: true, running: true } }).running, false)
  assert.equal(previewActionRecord(row, { when: { installed: true } }), row)
  const gone = previewActionRecord({ ...row, running: true, enabled: true }, { id: 'uninstall', when: { installed: true } })
  assert.equal(gone.installed, false)
  assert.equal(gone.running, false)
  assert.equal(gone.enabled, false)
  assert.equal(previewActionRecord({ id: 'draft', sandbox: true }, { id: 'pack', when: { sandbox: true } }).installed, true)
})

test('installed plugin actions show run or stop with uninstall, and install only after uninstall', () => {
  const schema: CollectionSchema = {
    fields: { ...REQUIRED_RECORD_FIELDS },
    actions: [
      { id: 'start', label: '运行', when: { installed: true, running: false } },
      { id: 'stop', label: '停止', when: { installed: true, running: true } },
      { id: 'pack', label: '安装', when: { sandbox: true, installed: false } },
      { id: 'uninstall', label: '卸载', when: { installed: true } },
    ],
  }
  const installed = { id: 'page-toc', installed: true, running: true, sandbox: true, builtin: true }
  assert.deepEqual(visibleActions(schema, installed, 'row').map((item) => item.id), ['stop', 'uninstall'])
  assert.deepEqual(
    visibleActions(schema, { ...installed, running: false }, 'row').map((item) => item.id),
    ['start', 'uninstall'],
  )
  const removed = previewActionRecord(installed, { id: 'uninstall', when: { installed: true } })
  assert.deepEqual(visibleActions(schema, removed, 'row').map((item) => item.id), ['pack'])
  assert.deepEqual(
    visibleActions(schema, { id: 'draft', sandbox: true }, 'row').map((item) => item.id),
    ['pack'],
  )
})

test('placedActions keeps start and stop so chrome.Actions can own the pair', () => {
  const schema: CollectionSchema = {
    fields: { ...REQUIRED_RECORD_FIELDS },
    actions: [
      { id: 'start', label: '运行', when: { running: false } },
      { id: 'stop', label: '停止', when: { running: true } },
    ],
  }
  assert.deepEqual(
    placedActions(schema, 'row').map((item) => item.id),
    ['start', 'stop'],
  )
  assert.deepEqual(
    visibleActions(schema, { id: '1', running: false }, 'row').map((item) => item.id),
    ['start'],
  )
})

test('visibleActions hides agent-only actions from the page', () => {
  const schema: CollectionSchema = {
    fields: { ...REQUIRED_RECORD_FIELDS },
    actions: [
      { id: 'run', label: '运行' },
      { id: 'progress', label: '进度', for: 'agent' },
      { id: 'edit', label: '编辑', for: 'user' },
    ],
  }
  assert.deepEqual(
    visibleActions(schema, { id: '1' }, 'row').map((item) => item.id),
    ['run', 'edit'],
  )
})

test('default columns skip id and timestamps unless schema.columns lists them; title stays first', () => {
  const keys = ['id', 'title', 'status', 'createdAt', 'updatedAt', 'content']
  assert.deepEqual(defaultColumnKeys(schema, keys), ['title', 'status'])
  assert.deepEqual(defaultColumnKeys({ ...schema, columns: ['status', 'createdAt'] }, keys), ['title', 'status', 'createdAt'])
  assert.deepEqual(pinLabelColumn(schema, ['status', 'title']), ['title', 'status'])
  assert.deepEqual(pinActionColumn(schema, ['status', 'title', 'actions'], true), ['title', 'actions', 'status'])
  assert.deepEqual(pinActionColumn(schema, ['status', 'title'], true), ['title', 'actions', 'status'])
  assert.deepEqual(pinActionColumn(schema, ['title', 'actions', 'status'], false), ['title', 'status'])
})

test('default columns omit flattened type properties', () => {
  const nested = facetFlatColumnKey('haohao', 'dede')
  assert.deepEqual(defaultColumnKeys(schema, ['title', 'status', 'facet', nested]), ['title', 'status', 'facet'])
  assert.equal(parseFacetFlatColumnKey(nested)?.packId, 'haohao')
  assert.equal(parseFacetFlatColumnKey(nested)?.fieldKey, 'dede')
  const cols = flattenFacetColumns([
    {
      id: 'haohao',
      label: '好好哈',
      fields: [
        { key: 'dede', type: 'string', label: '的的' },
        { key: 'gone', type: 'string', label: '旧的', deleted: true },
      ],
    },
  ])
  assert.equal(cols.length, 1)
  assert.equal(cols[0]?.key, nested)
  assert.equal(facetColumnTitle(cols[0]!), '好好哈.的的')
  assert.equal(facetColumnTitle({ key: 'title', field: { label: '标题' } }), '标题')
  const row = { id: '1', facet: { tags: ['haohao'], values: { haohao: { dede: 'v' } } } }
  assert.equal(readFacetFlatValue(row, nested), 'v')
  assert.deepEqual(uniqueValues([row], nested, { type: 'string', label: '的的' }), ['v'])
  assert.deepEqual(patchFacetFlatValue(row, nested, 'next').values.haohao?.dede, 'next')
  const untagged = { id: '2', facet: { tags: [], values: {} } }
  const stamped = patchFacetFlatValue(untagged, nested, 'next')
  assert.deepEqual(stamped.tags, ['haohao'])
  assert.equal(stamped.values.haohao?.dede, 'next')
  assert.equal(normalizeSchemaValue(stamped).values.haohao?.dede, 'next')
})

test('list projection keeps visible columns plus title, emoji, and parent', () => {
  const nested = facetFlatColumnKey('haohao', 'dede')
  const keys = listProjectionKeys({ schema, columns: ['status'], groupBy: 'tags' })
  assert.equal(keys.includes('id'), true)
  assert.equal(keys.includes('title'), true)
  assert.equal(keys.includes('status'), true)
  assert.equal(keys.includes('emoji'), true)
  assert.equal(keys.includes('tags'), true)
  assert.equal(keys.includes('parentChain'), true)
  assert.equal(keys.includes('usageParts'), true)
  assert.equal(keys.includes('builtin'), true)
  assert.equal(keys.includes('dueAt'), false)
  const withFacet = listProjectionKeys({ schema: { ...schema, fields: { ...schema.fields, facet: { type: 'facet' } } }, columns: [nested] })
  assert.equal(withFacet.includes('facet'), true)
})

const pluginActions: CollectionSchema = {
  labelField: 'title',
  fields: { ...REQUIRED_RECORD_FIELDS, title: { type: 'string' }, builtin: { type: 'boolean' } },
  actions: [
    { id: 'start', label: '运行', when: { installed: true, running: false } },
    { id: 'stop', label: '停止', when: { installed: true, running: true } },
    { id: 'pack', label: '安装', when: { sandbox: true, installed: false } },
    { id: 'uninstall', label: '卸载', when: { installed: true } },
  ],
}

test('builtin plugins hide install and uninstall unless canManagePackage', () => {
  const schema: CollectionSchema = {
    fields: { ...REQUIRED_RECORD_FIELDS },
    actions: [
      { id: 'start', label: '运行', when: { installed: true, running: false } },
      { id: 'stop', label: '停止', when: { installed: true, running: true } },
      { id: 'pack', label: '安装', when: { sandbox: true, installed: false, canManagePackage: true } },
      { id: 'uninstall', label: '卸载', when: { installed: true, canManagePackage: true } },
    ],
  }
  const builtin = { id: 'page-toc', installed: true, running: true, sandbox: true, builtin: true }
  assert.deepEqual(visibleActions(schema, builtin, 'row').map((item) => item.id), ['stop'])
  assert.deepEqual(
    visibleActions(schema, { ...builtin, canManagePackage: true }, 'row').map((item) => item.id),
    ['stop', 'uninstall'],
  )
  assert.deepEqual(
    visibleActions(schema, { id: 'page-toc', sandbox: true, builtin: true }, 'row').map((item) => item.id),
    [],
  )
  assert.deepEqual(
    visibleActions(schema, { id: 'page-toc', sandbox: true, builtin: true, canManagePackage: true }, 'row').map((item) => item.id),
    ['pack'],
  )
})

test('list projection keeps action when keys so plugin actions do not flash', () => {
  assert.deepEqual(actionWhenKeys(pluginActions), ['installed', 'running', 'sandbox'])
  const keys = listProjectionKeys({ schema: pluginActions, columns: ['title', 'tags'] })
  assert.equal(keys.includes('installed'), true)
  assert.equal(keys.includes('running'), true)
  assert.equal(keys.includes('sandbox'), true)
  assert.equal(keys.includes('builtin'), true)
  assert.equal(keys.includes('tags'), true)
})

test('sparse plugin rows without when flags flash 安装; projected flags keep 运行/停止 and 卸载', () => {
  const sparse = { id: 'page-toc', title: '目录' }
  assert.deepEqual(visibleActions(pluginActions, sparse, 'row').map((item) => item.id), [])
  const missingFlags = { id: 'page-sandbox', title: 'HTML', sandbox: true }
  assert.deepEqual(visibleActions(pluginActions, missingFlags, 'row').map((item) => item.id), ['pack'])
  assert.deepEqual(
    visibleActions(pluginActions, { id: 'page-toc', title: '目录', installed: true, running: true, sandbox: true }, 'row').map(
      (item) => item.id,
    ),
    ['stop', 'uninstall'],
  )
  assert.deepEqual(
    visibleActions(pluginActions, { id: 'page-sandbox', title: 'HTML', installed: true, sandbox: true }, 'row').map(
      (item) => item.id,
    ),
    ['start', 'uninstall'],
  )
})

test('contentFieldKey prefers content then contentField then notes', () => {
  assert.equal(contentFieldKey(schema), null)
  assert.equal(
    contentFieldKey({
      labelField: 'title',
      fields: { ...REQUIRED_RECORD_FIELDS, title: { type: 'string' }, content: { type: 'file' } },
    }),
    'content',
  )
  assert.equal(
    contentFieldKey({
      labelField: 'title',
      contentField: 'notes',
      fields: { ...REQUIRED_RECORD_FIELDS, title: { type: 'string' }, notes: { type: 'string' } },
    }),
    'notes',
  )
})

test('groupField follows the strategy registry and skips free text', () => {
  assert.equal(groupField(schema), null)
  assert.equal(groupField(schema, 'status')?.key, 'status')
  assert.equal(groupField(schema, 'tags')?.key, 'tags')
  assert.equal(groupField(schema, 'dueAt')?.key, 'dueAt')
  assert.equal(groupField(schema, 'size')?.key, 'size')
  assert.equal(groupField(schema, 'title'), null)
  assert.equal(isGroupableKind('boolean'), true)
  assert.equal(isGroupableKind('string'), false)
  assert.equal(isGroupableKind('url'), false)
  assert.deepEqual(
    Object.keys(GROUP_STRATEGIES).sort(),
    ['boolean', 'datetime', 'facet', 'multi-ref', 'multi-select', 'number', 'person', 'ref', 'select'].sort(),
  )
})

test('groupListKeys uses schema enum and skips 未填 when enum is declared', () => {
  assert.deepEqual(
    groupListKeys(schema, 'status').map((item) => item.key),
    ['todo', 'doing', 'done'],
  )
  const scoped = groupListKeys(
    {
      labelField: 'title',
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string' },
        shareScope: { type: 'select', enum: ['私人', '空间', '共享'] },
      },
    },
    'shareScope',
  )
  assert.deepEqual(
    scoped.map((item) => item.key),
    ['私人', '空间', '共享'],
  )
  assert.deepEqual(groupListKeys(schema, 'tags'), [])
  assert.deepEqual(
    groupListKeys(schema, 'tags', ['game']).map((item) => item.key),
    ['game', ''],
  )
})

test('groupListFilter maps shareScope labels to $scope and empty to is_empty', () => {
  assert.deepEqual(groupListFilter('shareScope', '私人'), { $scope: 'personal' })
  assert.deepEqual(groupListFilter('shareScope', '空间'), { $scope: 'workspace' })
  assert.deepEqual(groupListFilter('shareScope', '共享'), { $scope: 'shared' })
  assert.deepEqual(groupListFilter('status', 'doing'), { status: 'doing' })
  const empty = groupListFilter('status', '')
  const tree = empty.$tree as { children?: Array<{ op?: string; field?: string }> }
  assert.equal(tree.children?.[0]?.op, 'is_empty')
  assert.equal(tree.children?.[0]?.field, 'status')
})

test('mergeListFilters ANDs trees and rejects conflicting $scope', () => {
  assert.equal(mergeListFilters({ $scope: 'personal' }, { $scope: 'workspace' }), null)
  assert.deepEqual(mergeListFilters({ $scope: 'personal' }, { status: 'todo' }), { $scope: 'personal', status: 'todo' })
  const merged = mergeListFilters(
    { $tree: { kind: 'group', id: 'a', combinator: 'and', children: [] } },
    groupListFilter('status', ''),
  )
  const tree = merged?.$tree as { combinator?: string; children?: unknown[] }
  assert.equal(tree.combinator, 'and')
  assert.equal(tree.children?.length, 2)
})

test('groupRecords without a field keeps a single bucket', () => {
  const grouped = groupRecords([{ id: '1', title: 'a', status: 'todo' }], schema)
  assert.deepEqual(
    grouped.map((item) => [item.label, item.rows.map((row) => row.id)]),
    [['全部', ['1']]],
  )
})

test('groupRecords puts multi-select rows in every matching column', () => {
  const rows = [
    { id: '1', title: 'a', tags: ['game', 'web'] },
    { id: '2', title: 'b', tags: [] },
  ]
  const grouped = groupRecords(
    rows,
    {
      labelField: 'title',
      fields: { ...REQUIRED_RECORD_FIELDS, title: { type: 'string' }, tags: { type: 'multi-select', enum: ['game', 'web'] } },
    },
    'tags',
  )
  assert.deepEqual(
    grouped.map((item) => [item.label, item.rows.map((row) => row.id)]),
    [
      ['game', ['1']],
      ['web', ['1']],
      ['未填', ['2']],
    ],
  )
})

test('boolean grouping keeps unset out of 否 and filters with real booleans', () => {
  const boolSchema: CollectionSchema = {
    labelField: 'title',
    fields: { ...REQUIRED_RECORD_FIELDS, title: { type: 'string' }, done: { type: 'boolean' } },
  }
  const grouped = groupRecords(
    [
      { id: '1', title: 'a', done: true },
      { id: '2', title: 'b', done: false },
      { id: '3', title: 'c' },
    ],
    boolSchema,
    'done',
  )
  assert.deepEqual(
    grouped.map((item) => [item.key, item.label, item.rows.map((row) => row.id)]),
    [
      ['true', '是', ['1']],
      ['false', '否', ['2']],
      ['', '未填', ['3']],
    ],
  )
  assert.deepEqual(groupListFilter('done', 'true', boolSchema), { done: true })
  assert.deepEqual(groupListFilter('done', 'false', boolSchema), { done: false })
  const empty = groupListFilter('done', '', boolSchema)
  const tree = empty.$tree as { children?: Array<{ op?: string; field?: string }> }
  assert.equal(tree.children?.[0]?.op, 'is_empty')
})

test('datetime grouping uses month buckets instead of distinct timestamps', () => {
  const oct = new Date(2026, 9, 8).getTime()
  const oct2 = new Date(2026, 9, 21).getTime()
  const sep = new Date(2026, 8, 1).getTime()
  const grouped = groupRecords(
    [
      { id: '1', title: 'a', dueAt: oct },
      { id: '2', title: 'b', dueAt: oct2 },
      { id: '3', title: 'c', dueAt: sep },
      { id: '4', title: 'd' },
    ],
    schema,
    'dueAt',
  )
  const keys = grouped.map((item) => item.key)
  assert.equal(keys.includes(String(oct)), false)
  assert.equal(grouped.find((item) => item.label === '2026/10')?.rows.map((row) => row.id).join(), '1,2')
  assert.equal(grouped.find((item) => item.label === '2026/09')?.rows.map((row) => row.id).join(), '3')
  assert.equal(grouped.find((item) => item.label === '未填')?.rows[0]?.id, '4')
  const headers = groupListKeys(schema, 'dueAt').map((item) => item.key)
  assert.ok(headers.includes('m:earlier'))
  assert.ok(headers.some((key) => key.startsWith('m:20')))
  assert.ok(headers.includes(''))
  const month = groupListFilter('dueAt', 'm:2026-10', schema)
  const kids = (month.$tree as { children: Array<{ op: string; field: string }> }).children
  assert.equal(kids[0]?.op, 'gt')
  assert.equal(kids[1]?.op, 'lt')
  assert.equal(kids[0]?.field, 'dueAt')
})

test('person and ref grouping reuse multi-value buckets', () => {
  const people: CollectionSchema = {
    labelField: 'title',
    fields: {
      ...REQUIRED_RECORD_FIELDS,
      title: { type: 'string' },
      owner: { type: 'person' },
      project: { type: 'ref' },
    },
  }
  const grouped = groupRecords(
    [
      { id: '1', title: 'a', owner: { kind: 'user', name: '用户' }, project: 'p1' },
      { id: '2', title: 'b', owner: { kind: 'system', name: '系统' } },
      { id: '3', title: 'c' },
    ],
    people,
    'owner',
  )
  assert.deepEqual(
    grouped.map((item) => [item.key, item.label, item.rows.map((row) => row.id)]),
    [
      ['user', '用户', ['1']],
      ['system', '系统', ['2']],
      ['', '未指派', ['3']],
    ],
  )
  const refs = groupRecords(
    [
      { id: '1', title: 'a', project: 'p1' },
      { id: '2', title: 'b' },
    ],
    people,
    'project',
  )
  assert.deepEqual(
    refs.map((item) => [item.key, item.label, item.rows.map((row) => row.id)]),
    [
      ['p1', 'p1', ['1']],
      ['', '未关联', ['2']],
    ],
  )
})

test('number grouping uses interval buckets instead of distinct values', () => {
  const grouped = groupRecords(
    [
      { id: '1', title: 'a', size: 3 },
      { id: '2', title: 'b', size: 8 },
      { id: '3', title: 'c', size: 40 },
      { id: '4', title: 'd', size: 2000 },
    ],
    schema,
    'size',
  )
  assert.deepEqual(
    grouped.map((item) => [item.label, item.rows.map((row) => row.id)]),
    [
      ['1–9', ['1', '2']],
      ['10–99', ['3']],
      ['1000+', ['4']],
    ],
  )
  assert.equal(groupListKeys(schema, 'size').some((item) => item.key === '3'), false)
})

test('unsupported saved groupBy falls back to a single 全部 bucket', () => {
  const grouped = groupRecords([{ id: '1', title: 'a', url: 'https://x' }], schema, 'url')
  assert.deepEqual(
    grouped.map((item) => item.label),
    ['全部'],
  )
})

test('parentFieldKey reads schema then parentId then data links', () => {
  assert.equal(parentFieldKey(schema), 'parentId')
  assert.equal(
    parentFieldKey({
      labelField: 'title',
      parentField: 'owner',
      fields: { ...REQUIRED_RECORD_FIELDS, title: { type: 'string' }, owner: { type: 'string' } },
    }),
    'owner',
  )
  assert.equal(
    parentFieldKey({
      labelField: 'title',
      fields: { ...REQUIRED_RECORD_FIELDS, title: { type: 'string' }, parentId: { type: 'string' } },
    }),
    'parentId',
  )
  assert.equal(
    parentFieldKey(
      { labelField: 'title', parentField: 'folder', fields: { ...REQUIRED_RECORD_FIELDS, title: { type: 'string' }, folder: { type: 'string' } } },
      [
        { id: 'a', title: 'root', folder: '' },
        { id: 'b', title: 'child', folder: 'a' },
      ],
    ),
    'folder',
  )
})

test('treeChildren lists direct kids and treats missing parents as roots', () => {
  const rows = [
    { id: 'p', title: 'parent' },
    { id: 'c2', title: 'second', parentId: 'p' },
    { id: 'c1', title: 'first', parentId: 'p' },
    { id: 'g', title: 'grand', parentId: 'c1' },
    { id: 'orphan', title: 'orphan', parentId: 'gone' },
  ]
  assert.deepEqual(
    treeChildren(rows, 'parentId', '').map((row) => row.id),
    ['p', 'orphan'],
  )
  assert.deepEqual(
    treeChildren(rows, 'parentId', 'p').map((row) => row.id),
    ['c2', 'c1'],
  )
  assert.deepEqual(
    treeChildren(rows, 'parentId', 'c1').map((row) => row.id),
    ['g'],
  )
})

test('hasTreeLinks is false until a row points at another row', () => {
  assert.equal(hasTreeLinks([], 'parentId'), false)
  assert.equal(
    hasTreeLinks(
      [
        { id: 'a', title: 'root', parentId: '' },
        { id: 'b', title: 'also', parentId: '' },
      ],
      'parentId',
    ),
    false,
  )
  assert.equal(
    hasTreeLinks(
      [
        { id: 'a', title: 'root', parentId: '' },
        { id: 'b', title: 'child', parentId: 'a' },
      ],
      'parentId',
    ),
    true,
  )
})

test('flattenTree keeps sibling order, indents children, and hides collapsed subtrees', () => {
  const rows = [
    { id: 'p', title: 'parent' },
    { id: 'c2', title: 'second', parentId: 'p' },
    { id: 'c1', title: 'first', parentId: 'p' },
    { id: 'g', title: 'grand', parentId: 'c1' },
  ]
  assert.deepEqual(
    flattenTree(rows, 'parentId').map((item) => [item.row.id, item.depth, item.hasKids, item.kidCount]),
    [
      ['p', 0, true, 3],
      ['c2', 1, false, 0],
      ['c1', 1, true, 1],
      ['g', 2, false, 0],
    ],
  )
  assert.deepEqual(
    flattenTree(rows, 'parentId', { p: true }).map((item) => item.row.id),
    ['p'],
  )
})

test('flattenTree does not blow the stack on a parent cycle', () => {
  const rows = [
    { id: 'a', title: 'A', parentId: 'b' },
    { id: 'b', title: 'B', parentId: 'a' },
  ]
  const flat = flattenTree(rows, 'parentId')
  assert.deepEqual(flat.map((item) => item.row.id).sort(), ['a', 'b'])
  assert.ok(flat.every((item) => item.kidCount >= 0))
})

test('defaultColumnKeys omits parentId', () => {
  const treeSchema: CollectionSchema = {
    labelField: 'title',
    fields: { ...REQUIRED_RECORD_FIELDS, title: { type: 'string' }, parentId: { type: 'string' }, status: { type: 'select' } },
  }
  assert.deepEqual(defaultColumnKeys(treeSchema, ['title', 'parentId', 'dependsOn', 'status', 'createdAt']), ['title', 'status'])
  assert.deepEqual(
    defaultColumnKeys(treeSchema, ['title', 'createdBy', 'updatedBy', 'status']),
    ['title', 'status'],
  )
})

test('uniqueValues lists tags already on the table, not schema enum', () => {
  const rows = [
    { id: '1', title: 'a', status: 'doing', tags: ['docs', 'wip'] },
    { id: '2', title: 'b', status: 'doing', tags: ['docs'] },
  ]
  assert.deepEqual(uniqueValues(rows, 'tags', schema.fields.tags!), ['docs', 'wip'])
  assert.deepEqual(uniqueValues(rows, 'status', schema.fields.status!), ['doing'])
  assert.equal(uniqueValues(rows, 'status', schema.fields.status!).includes('todo'), false)
})

test('recordLinkIds treats ref as one id and multi-ref as many', () => {
  assert.deepEqual(recordLinkIds({ type: 'ref' }, 'p1'), ['p1'])
  assert.deepEqual(recordLinkIds({ type: 'ref' }, ''), [])
  assert.deepEqual(recordLinkIds({ type: 'multi-ref' }, ['a', 'b']), ['a', 'b'])
  assert.deepEqual(recordLinkIds('parentId', 'p1'), ['p1'])
})

