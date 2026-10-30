import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'

test('user data section only folds and does not open a home route', () => {
  const page = readFileSync(resolve(import.meta.dirname, './index.tsx'), 'utf8')
  const sidebar = readFileSync(resolve(import.meta.dirname, './data-sidebar.tsx'), 'utf8')
  assert.doesNotMatch(page, /home=user/)
  assert.doesNotMatch(page, /scopeHome/)
  assert.doesNotMatch(sidebar, /onOpenScopeHome/)
  assert.match(sidebar, /setUserOpen\(\(prev\) => !prev\)/)
})
