import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, test } from 'vitest'
import { Calendar } from './calendar.tsx'

afterEach(() => cleanup())

test('Calendar uses Tailwind token classes and no injected CSS', () => {
  const src = readFileSync(resolve(import.meta.dirname, './calendar.tsx'), 'utf8')
  assert.match(src, /function Calendar/)
  assert.match(src, /from 'class-variance-authority'/)
  assert.match(src, /border-biu-border/)
  assert.match(src, /rounded-\[var\(--biu-radius-md\)\]/)
  assert.match(src, /h-\[var\(--biu-size-control-md\)\]/)
  assert.doesNotMatch(src, /createElement\('style'\)/)
})

test('Calendar highlights today', () => {
  render(<Calendar />)
  assert.ok(document.querySelector('[aria-current="date"]'))
})

test('Calendar navigates months, highlights today/selected, and skips disabled dates', () => {
  const selected = new Date(2026, 9, 12)
  let picked: Date | null = null
  render(
    <Calendar
      month={new Date(2026, 9, 1)}
      value={selected}
      disabledDate={(day) => day.getDate() === 13}
      onChange={(next) => {
        picked = next
      }}
    />,
  )
  assert.match(screen.getByText('2026年10月').textContent ?? '', /2026年10月/)
  const selectedBtn = screen.getByRole('button', { name: '2026-10-12' })
  assert.equal(selectedBtn.getAttribute('aria-pressed'), 'true')
  const blocked = screen.getByRole('button', { name: '2026-10-13' })
  assert.equal(blocked.hasAttribute('disabled'), true)
  fireEvent.click(blocked)
  assert.equal(picked, null)
  fireEvent.click(screen.getByRole('button', { name: '2026-10-20' }))
  assert.equal(picked && (picked as Date).getDate(), 20)
  fireEvent.click(screen.getByRole('button', { name: '下个月' }))
  assert.match(screen.getByText('2026年11月').textContent ?? '', /2026年11月/)
  fireEvent.click(screen.getByRole('button', { name: '上个月' }))
  assert.match(screen.getByText('2026年10月').textContent ?? '', /2026年10月/)
})

test('Calendar month stays controlled only when onMonthChange is provided', () => {
  let view = new Date(2026, 9, 1)
  const { rerender } = render(
    <Calendar
      month={view}
      onMonthChange={(next) => {
        view = next
      }}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '下个月' }))
  assert.equal(view.getMonth(), 10)
  rerender(
    <Calendar
      month={view}
      onMonthChange={(next) => {
        view = next
      }}
    />,
  )
  assert.match(screen.getByText('2026年11月').textContent ?? '', /2026年11月/)
})
