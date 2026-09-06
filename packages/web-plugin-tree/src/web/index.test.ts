import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('settings plugin tree keeps core out of capability and hides core toggles', () => {
  const src = readFileSync(resolve(import.meta.dirname, './index.tsx'), 'utf8')
  assert.match(src, /layer: 'core'/)
  assert.match(src, /内核 · Core/)
  assert.match(src, /能力插件/)
  assert.match(src, /plugin\.togglable \?/)
  assert.doesNotMatch(src, /disabled=\{!plugin\.togglable\}/)
  assert.doesNotMatch(src, /不可卸载/)
  assert.doesNotMatch(src, /plugin\.blurb/)
  assert.doesNotMatch(src, /plugin\.id\} ·/)
  assert.match(src, /data-testid="plugin-enabled-dot"/)
  assert.match(src, /plugin\.state === 'active'/)
  assert.doesNotMatch(src, /text-\[1[12]px\]/)
})
