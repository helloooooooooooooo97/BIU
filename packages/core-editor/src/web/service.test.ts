import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { BlockEditorService, getBlockEditor } from './service.ts'
import { filterSlashItems } from './slash.ts'

test('replaceHeading is scoped to the calling plugin fiber', async () => {
  const ctx = new Context()
  new BlockEditorService(ctx)
  assert.ok(getBlockEditor())
  const fiber = ctx.plugin({
    name: 'theme',
    inject: ['blockEditor'],
    apply(inner) {
      inner.blockEditor.replaceHeading(1, { label: 'H1' })
    },
  })
  await fiber
  assert.equal(ctx.blockEditor.headingView(1)?.label, 'H1')
  await fiber.dispose()
  assert.equal(ctx.blockEditor.headingView(1), undefined)
})

test('slash extras override built-in labels and dispose', async () => {
  const ctx = new Context()
  new BlockEditorService(ctx)
  const fiber = ctx.plugin({
    name: 'slash-theme',
    inject: ['blockEditor'],
    apply(inner) {
      inner.blockEditor.slash({ id: 'h1', label: '封面标题', hint: '插件', aliases: ['cover'] })
    },
  })
  await fiber
  const hit = filterSlashItems('cover').find((item) => item.id === 'h1')
  assert.equal(hit?.label, '封面标题')
  await fiber.dispose()
  assert.equal(filterSlashItems('cover').some((item) => item.id === 'h1'), false)
})
