/** @vitest-environment node */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'
import { bundleStoreEntry, parseStoreManifest } from './plugin-create.ts'

const root = resolve(import.meta.dirname, '../../../..')

function pluginFile(id: string, file: string) {
  return resolve(root, '.plugin-dev', id, file)
}

describe('terminal store plugins', () => {
  it('declares one headless page block and one resizable window', async () => {
    const page = parseStoreManifest(JSON.parse(await readFile(pluginFile('page-terminal', 'manifest.json'), 'utf8')))
    const global = parseStoreManifest(JSON.parse(await readFile(pluginFile('global-terminal', 'manifest.json'), 'utf8')))

    assert.equal(page.id, 'page-terminal')
    assert.equal(page.headless, true)
    assert.equal(page.shell, undefined)
    assert.equal(global.id, 'global-terminal')
    assert.equal(global.headless, undefined)
    assert.equal(global.shell?.resizable, true)
    assert.ok((global.shell?.width ?? 0) >= 560)
  })

  it('bundles both host and web entries as standalone store plugins', async () => {
    for (const id of ['page-terminal', 'global-terminal']) {
      const host = await bundleStoreEntry(pluginFile(id, 'host.ts'), 'host')
      const web = await bundleStoreEntry(pluginFile(id, 'web.tsx'), 'web')

      assert.match(host, new RegExp(`/ws/${id}`))
      assert.match(host, /node-pty/)
      assert.match(web, new RegExp(`/ws/${id}`))
      assert.match(web, /type:"resize"/)
      assert.doesNotMatch(web, /from"@biu\//)
    }
  })

  it('documents the complete page block fence', async () => {
    const readme = await readFile(pluginFile('page-terminal', 'README.md'), 'utf8')
    assert.match(readme, /:::pageBlock \{kind=terminal plugin=page-terminal\}/)
    assert.match(readme, /"height": 360/)
  })

  it('puts padding on xterm so FitAddon subtracts it from the grid', async () => {
    for (const id of ['page-terminal', 'global-terminal']) {
      const css = await readFile(pluginFile(id, 'terminal.css'), 'utf8')
      const mountRule = css.match(/\.biu-terminal-mount\s*\{([^}]*)\}/)?.[1] ?? ''
      const xtermRule = css.match(/\.biu-terminal-mount \.xterm\s*\{([^}]*)\}/)?.[1] ?? ''

      assert.doesNotMatch(mountRule, /padding:/)
      assert.match(xtermRule, /padding:/)
      assert.match(xtermRule, /box-sizing:\s*border-box/)
      assert.match(css, /\.xterm-scrollable-element/)
    }
  })
})
