import { test } from 'vitest'
import assert from 'node:assert/strict'
import { parsePageBanner, serializePageBanner } from './page-banner.ts'

test('parsePageBanner accepts html and htmlframe payloads', () => {
  assert.equal(parsePageBanner(null), null)
  assert.equal(parsePageBanner({ kind: 'html', html: '  ' }), null)
  assert.deepEqual(parsePageBanner('<div>hi</div>'), { kind: 'html', html: '<div>hi</div>' })
  assert.deepEqual(parsePageBanner({ kind: 'htmlframe', html: '<script></script>' }), {
    kind: 'htmlframe',
    html: '<script></script>',
  })
  assert.equal(serializePageBanner(undefined), null)
  assert.equal(serializePageBanner(null), '')
  assert.equal(serializePageBanner({ kind: 'html', html: '<p>a</p>' }), '{"kind":"html","html":"<p>a</p>"}')
})
