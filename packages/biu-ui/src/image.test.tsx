import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, test } from 'vitest'
import { Image } from './image.tsx'

afterEach(() => cleanup())

test('Image uses Tailwind token classes and no injected CSS', () => {
  const src = readFileSync(resolve(import.meta.dirname, './image.tsx'), 'utf8')
  assert.match(src, /function ImageRoot/)
  assert.match(src, /biu-image-skeleton/)
  assert.match(src, /border-biu-border/)
  assert.match(src, /rounded-\[var\(--biu-radius-md\)\]/)
  assert.doesNotMatch(src, /createElement\('style'\)/)
})

test('Image shows skeleton then preview, and error fallback', () => {
  const { rerender } = render(<Image src="/ok.png" alt="cover" width={56} height={56} />)
  assert.ok(document.querySelector('.biu-image-skeleton'))
  const img = screen.getByAltText('cover')
  fireEvent.load(img)
  assert.equal(document.querySelector('.biu-image-skeleton'), null)
  fireEvent.click(img)
  assert.ok(screen.getByRole('dialog', { name: '图片预览' }))
  fireEvent.click(document.querySelector('.biu-image-preview-shot') as HTMLElement)
  assert.equal(document.querySelector('.biu-image-preview-shot')?.classList.contains('scale-150'), true)

  rerender(<Image src="/bad.png" alt="broken" fallback="缺图" />)
  fireEvent.error(screen.getByAltText('broken'))
  assert.match(document.body.textContent ?? '', /缺图/)
})
