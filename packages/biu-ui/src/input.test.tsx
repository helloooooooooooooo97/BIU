import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, test } from 'vitest'
import { Input } from './input.tsx'

afterEach(() => cleanup())

test('Input uses Tailwind token classes', () => {
  const src = readFileSync(resolve(import.meta.dirname, './input.tsx'), 'utf8')
  assert.match(src, /function Input/)
  assert.match(src, /bg-biu-input/)
  assert.match(src, /border-biu-border/)
  assert.match(src, /focus:border-biu-emphasis/)
  assert.match(src, /h-\[var\(--biu-size-control-md\)\]/)
  assert.doesNotMatch(src, /createElement\('style'\)/)
})

test('Input types and can be disabled', () => {
  let value = ''
  const { rerender } = render(
    <Input
      aria-label="url"
      value={value}
      onChange={(event) => {
        value = event.currentTarget.value
      }}
    />,
  )
  const field = screen.getByRole('textbox', { name: 'url' })
  assert.equal(field.classList.contains('biu-input'), true)
  fireEvent.change(field, { target: { value: 'https://biu.local' } })
  assert.equal(value, 'https://biu.local')

  rerender(<Input aria-label="url" disabled value="" onChange={() => undefined} />)
  assert.equal(screen.getByRole('textbox', { name: 'url' }).hasAttribute('disabled'), true)
})
