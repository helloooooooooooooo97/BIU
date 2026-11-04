import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TagStore } from './tags-store.ts'

test('TagStore keeps packs in sqlite including nested facet types', () => {
  const store = new TagStore()
  store.replace([
    {
      id: 'dp',
      label: '动态规划',
      fields: [
        { key: 'complexity', type: 'string', label: '复杂度' },
        { key: 'nested', type: 'tag', label: '套一层' },
      ],
    },
    { id: '??', label: '坏的', fields: [] },
  ])
  const facets = store.list()
  assert.equal(facets.length, 1)
  assert.equal(facets[0]?.id, 'dp')
  assert.deepEqual(facets[0]?.fields.map((field) => field.key), ['complexity', 'nested'])
  assert.equal(store.list('动态').length, 1)
  assert.equal(store.list('nope').length, 0)
})

test('TagStore writes createdAt on insert and keeps it across updates', () => {
  const store = new TagStore()
  const before = Date.now()
  store.upsert({ id: 'dp', label: '动态规划', fields: [] })
  const first = store.entry('dp')
  assert.ok(first)
  assert.ok(first!.createdAt >= before)
  assert.ok(first!.updatedAt >= first!.createdAt)
  const createdAt = first!.createdAt
  store.upsert({ id: 'dp', label: 'DP', fields: [{ key: 'complexity', type: 'string' }] })
  const again = store.entry('dp')
  assert.equal(again?.createdAt, createdAt)
  assert.ok((again?.updatedAt ?? 0) >= first!.updatedAt)
})

test('sqlite file round-trips facet catalog and stamp index', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fs-facet-'))
  const path = join(dir, 'file-system.sqlite')
  const store = new TagStore()
  store.open(path)
  store.replace([{ id: 'dp', label: '动态规划', fields: [{ key: 'complexity', type: 'string' }] }])
  store.indexRecord('/pages', 'home', '首页', ['dp'])
  store.indexRecord('/notes', 'n1', '草稿', ['dp'])
  store.writeRecordBanner('/pages', 'home', { kind: 'html', html: '<section>cover</section>' })

  const again = new TagStore()
  again.open(path)
  assert.deepEqual(again.recordBanner('/pages', 'home'), { kind: 'html', html: '<section>cover</section>' })
  assert.equal(again.list()[0]?.label, '动态规划')
  const collected = again.collect('动态规划')
  assert.equal(collected.tag?.id, 'dp')
  assert.deepEqual(collected.items.map((item) => item.path).sort(), ['/notes/n1', '/pages/home'])
  assert.equal(again.stampedIds('/pages', 'dp').has('home'), true)
  assert.equal(again.stampCounts().dp, 2)
  again.upsert({ id: 'dp', label: 'DP', fields: [{ key: 'complexity', type: 'string' }] })
  assert.equal(again.get('dp')?.label, 'DP')
  again.upsert({ id: 'dp', label: 'DP', fields: [{ key: 'complexity', type: 'string' }] }, '# 说明')
  assert.equal(again.notes('dp'), '# 说明')
  again.upsert({ id: 'dp', label: 'DP2', fields: [{ key: 'complexity', type: 'string' }] })
  assert.equal(again.notes('dp'), '# 说明')
  assert.equal(again.removeFacet('dp'), true)
  assert.equal(again.list().length, 0)
})

test('sqlite stores facet overlay for records that cannot update', async () => {
  const store = new TagStore()
  store.writeRecordTag('/plugins', 'demo', { tags: ['dp'], values: { dp: { complexity: 'O(n)' } } }, 'Demo')
  assert.deepEqual(store.recordTag('/plugins', 'demo')?.tags, ['dp'])
  assert.equal(store.stampedIds('/plugins', 'dp').has('demo'), true)
  store.removeRecord('/plugins', 'demo')
  assert.equal(store.recordTag('/plugins', 'demo'), null)
  assert.equal(store.stampedIds('/plugins', 'dp').has('demo'), false)
})

test('upserting a soft-deleted facet id brings it back', () => {
  const store = new TagStore()
  store.upsert({ id: 'facet-6', label: '未命名标签', fields: [] })
  store.markDeleted('/tags', 'facet-6')
  assert.equal(store.isDeleted('/tags', 'facet-6'), true)
  assert.equal(store.entries().some((item) => item.pack.id === 'facet-6'), false)
  store.upsert({ id: 'facet-6', label: '新标签', fields: [] })
  assert.equal(store.isDeleted('/tags', 'facet-6'), false)
  assert.equal(store.get('facet-6')?.label, '新标签')
})

test('empty facet overlay is not stored', async () => {
  const store = new TagStore()
  store.writeRecordTag('/pages', 'p1', { tags: ['dp'], values: { dp: {} } }, 'P')
  assert.equal(store.recordTag('/pages', 'p1')?.tags[0], 'dp')
  store.writeRecordTag('/pages', 'p1', { tags: [], values: {} }, 'P')
  assert.equal(store.recordTag('/pages', 'p1'), null)
})

test('sqlite stores emoji and tags overlay without wiping the other', () => {
  const store = new TagStore()
  store.writeRecordMeta('/plugins', 'demo', { emoji: '🔌' })
  assert.equal(store.recordMeta('/plugins', 'demo')?.emoji, '🔌')
  assert.equal(store.recordMeta('/plugins', 'demo')?.tags, null)
  store.writeRecordMeta('/plugins', 'demo', { tags: ['host-ui'] })
  store.markDeleted('/plugins', 'demo')
  assert.equal(store.isDeleted('/plugins', 'demo'), true)
  store.restoreDeleted('/plugins', 'demo')
  assert.equal(store.isDeleted('/plugins', 'demo'), false)
  assert.equal(store.recordMeta('/plugins', 'demo')?.emoji, '🔌')
  assert.deepEqual(store.recordMeta('/plugins', 'demo')?.tags, ['host-ui'])
  store.removeRecord('/plugins', 'demo')
  assert.equal(store.recordMeta('/plugins', 'demo'), null)
})

test('sqlite stores html banner in its own table without wrapping json', () => {
  const store = new TagStore()
  store.writeRecordMeta('/pages', 'home', { emoji: '🏠' })
  store.writeRecordBanner('/pages', 'home', { kind: 'htmlframe', html: '<div>live</div>' })
  assert.equal(store.recordMeta('/pages', 'home')?.emoji, '🏠')
  assert.deepEqual(store.recordBanner('/pages', 'home'), { kind: 'htmlframe', html: '<div>live</div>' })
  store.writeRecordBanner('/pages', 'home', null)
  assert.equal(store.recordBanner('/pages', 'home'), null)
  assert.equal(store.recordMeta('/pages', 'home')?.emoji, '🏠')
  store.writeRecordBanner('/pages', 'home', { kind: 'html', html: '<div>custom-cover</div>' })
  assert.equal(store.listBannerGallery().some((item) => item.html.includes('custom-cover')), true)
  const mine = store.listBannerGallery().find((item) => item.html.includes('custom-cover'))
  assert.ok(mine)
  assert.equal(store.forgetBannerGallery(mine.id), true)
  assert.equal(store.listBannerGallery().some((item) => item.html.includes('custom-cover')), false)
  assert.deepEqual(store.recordBanner('/pages', 'home'), { kind: 'html', html: '<div>custom-cover</div>' })
})

test('attachments and refs live next to record_meta', () => {
  const store = new TagStore()
  store.putAttachment({ name: 'ab'.repeat(32) + '.png', etag: 'ab'.repeat(32) + '.png', mime: 'image/png', bytes: 4, kind: 'asset' })
  store.linkContentRef('/pages', 'p1', 'fresh.png')
  const linked = store.recordsReferencingAsset('fresh.png')
  assert.equal(linked.length, 1)
  assert.equal(linked[0]?.collection, '/pages')
  assert.equal(linked[0]?.record_id, 'p1')
  store.replaceContentRefs('/pages', 'p1', ['hero.png'], ['cover.png'])
  store.replaceBlockRefs('/pages', 'p1', 'e4945888', [{ name: 'ab'.repeat(32) + '.html', source: 'block:e4945888:core' }])
  assert.deepEqual(store.listedAttachmentNames('/pages', 'p1'), ['ab'.repeat(32) + '.html', 'cover.png', 'hero.png'].sort())
  store.removeRecord('/pages', 'p1')
  assert.deepEqual(store.listedAttachmentNames('/pages', 'p1'), [])
})

test('removing a pack field clears that value on stamped records and keeps the pages', () => {
  const store = new TagStore()
  store.upsert({
    id: 'dp',
    label: '动态规划',
    fields: [
      { key: 'complexity', type: 'string', label: '复杂度' },
      { key: 'year', type: 'number', label: '年份' },
    ],
  })
  store.writeRecordTag('/pages', 'p1', { tags: ['dp'], values: { dp: { complexity: 'O(n)', year: 2016 } } }, '页一')
  store.writeRecordTag('/pages', 'p2', { tags: ['dp'], values: { dp: { complexity: 'O(1)' } } }, '页二')
  store.writeRecordTag('/notes', 'n1', { tags: ['dp'], values: { dp: { year: 2020 } } }, '笔记')
  assert.deepEqual(store.filledFieldCounts(), { dp: { complexity: 2, year: 2 } })
  store.upsert({
    id: 'dp',
    label: '动态规划',
    fields: [{ key: 'year', type: 'number', label: '年份' }],
  })
  assert.equal(store.get('dp')?.fields.map((field) => field.key).join(), 'year')
  assert.equal(store.recordTag('/pages', 'p1')?.values.dp.complexity, undefined)
  assert.equal(store.recordTag('/pages', 'p1')?.values.dp.year, 2016)
  assert.deepEqual(store.recordTag('/pages', 'p1')?.tags, ['dp'])
  assert.equal(store.recordTag('/pages', 'p2')?.values.dp.complexity, undefined)
  assert.equal(store.stampedIds('/pages', 'dp').has('p1'), true)
  assert.equal(store.stampedIds('/pages', 'dp').has('p2'), true)
  assert.deepEqual(store.filledFieldCounts(), { dp: { year: 2 } })
})

test('preset banners are not copied into the custom gallery', async () => {
  const { BANNER_PRESETS } = await import('../banner-presets.ts')
  const store = new TagStore()
  const sample = BANNER_PRESETS[0]!
  store.writeRecordBanner('/pages', 'home', { kind: sample.kind, html: sample.html })
  assert.equal(store.listBannerGallery().length, 0)
  store.rememberBannerGallery({ kind: sample.kind, html: sample.html })
  assert.equal(store.listBannerGallery().length, 0)
})
