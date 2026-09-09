import { test } from 'vitest'
import assert from 'node:assert/strict'
import { parsePageBanner } from './page-banner.ts'

test('parsePageBanner accepts html and htmlframe payloads', () => {
  assert.equal(parsePageBanner(null), null)
  assert.equal(parsePageBanner({ kind: 'html', html: '  ' }), null)
  assert.deepEqual(parsePageBanner('<div>hi</div>'), { kind: 'html', html: '<div>hi</div>' })
  assert.deepEqual(parsePageBanner({ kind: 'htmlframe', html: '<script></script>' }), {
    kind: 'htmlframe',
    html: '<script></script>',
  })
})
