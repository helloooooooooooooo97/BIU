import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import { HeadlessPopover } from './headless-popover.tsx'

afterEach(cleanup)

test('an externally anchored popup uses Radix positioning and closes on Escape', async () => {
  const close = vi.fn()
  function Harness() {
    const anchorRef = useRef<HTMLButtonElement>(null)
    return <>
      <button ref={anchorRef}>筛选</button>
      <HeadlessPopover open anchorRef={anchorRef} onOpenChange={close} align="end" sideOffset={6}>
        <div>筛选条件</div>
      </HeadlessPopover>
    </>
  }
  const view = render(<Harness />)
  await waitFor(() => expect(view.getByText('筛选条件').closest('[data-radix-popper-content-wrapper]')).not.toBeNull())
  expect(document.activeElement).not.toBe(view.getByText('筛选条件'))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(close).toHaveBeenCalledWith(false)
})

test('existing trigger popovers still open and preserve nested flyout focus', async () => {
  const change = vi.fn()
  const nested = document.createElement('button')
  nested.className = 'test-nested-flyout'
  document.body.append(nested)
  try {
    const view = render(
      <HeadlessPopover trigger={<button>排序</button>} onOpenChange={change} inside={(node) => nested.contains(node)}>
        <div>排序规则</div>
      </HeadlessPopover>,
    )
    fireEvent.click(view.getByText('排序'))
    await waitFor(() => expect(view.getByText('排序规则')).toBeTruthy())
    change.mockClear()
    fireEvent.focusIn(nested)
    expect(change).not.toHaveBeenCalledWith(false)
  } finally {
    nested.remove()
  }
})
