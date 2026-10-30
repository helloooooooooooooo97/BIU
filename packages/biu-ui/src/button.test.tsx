import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, test } from 'vitest'
import { Button } from './button.tsx'

afterEach(() => cleanup())

test('Button uses Tailwind token classes', () => {
  const src = readFileSync(resolve(import.meta.dirname, './button.tsx'), 'utf8')
  assert.match(src, /function Button/)
  assert.match(src, /from 'class-variance-authority'/)
  assert.match(src, /bg-biu-hover/)
  assert.match(src, /h-\[var\(--biu-size-control-md\)\]/)
  assert.match(src, /rounded-\[var\(--biu-radius-md\)\]/)
  assert.doesNotMatch(src, /createElement\('style'\)/)
})

test('Button clicks and can be danger or disabled', () => {
  let n = 0
  const { rerender } = render(
    <Button
      onClick={() => {
        n += 1
      }}
    >
      发送
    </Button>,
  )
  const btn = screen.getByRole('button', { name: '发送' })
  assert.equal(btn.classList.contains('biu-btn'), true)
  fireEvent.click(btn)
  assert.equal(n, 1)

  rerender(
    <Button
      danger
      onClick={() => {
        n += 1
      }}
    >
      清空
    </Button>,
  )
  assert.equal(screen.getByRole('button', { name: '清空' }).classList.contains('is-danger'), true)

  rerender(
    <Button
      disabled
      onClick={() => {
        n += 1
      }}
    >
      停
    </Button>,
  )
  fireEvent.click(screen.getByRole('button', { name: '停' }))
  assert.equal(n, 1)
})
