import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, test } from 'vitest'
import { Textarea } from './textarea.tsx'

afterEach(() => cleanup())

test('Textarea types', () => {
  let value = ''
  render(
    <Textarea
      aria-label="body"
      value={value}
      onChange={(event) => {
        value = event.currentTarget.value
      }}
    />,
  )
  const field = screen.getByRole('textbox', { name: 'body' })
  assert.equal(field.classList.contains('biu-textarea'), true)
  fireEvent.change(field, { target: { value: '{}' } })
  assert.equal(value, '{}')
})
