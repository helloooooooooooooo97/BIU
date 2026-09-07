import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

test('arena-rogue is a resizable window plugin with 12 weapons and extras slot', async () => {
  const dir = resolve(import.meta.dirname, '../../../../.plugin-dev/arena-rogue')
  const manifest = JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8')) as {
    id: string
    headless?: boolean
    shell?: { width: number; height: number; resizable?: boolean }
  }
  const web = await readFile(resolve(dir, 'web.tsx'), 'utf8')
  const weapons = await readFile(resolve(dir, 'weapons.ts'), 'utf8')
  assert.equal(manifest.id, 'arena-rogue')
  assert.equal(manifest.headless, undefined)
  assert.equal(manifest.shell?.resizable, true)
  assert.ok((manifest.shell?.width ?? 0) >= 800)
  assert.match(web, /export const name = 'arena-rogue'/)
  assert.match(web, /plugin-store-extras/)
  assert.match(web, /key: 'arena-rogue'/)
  assert.equal([...weapons.matchAll(/id: '/g)].length, 12)
})
