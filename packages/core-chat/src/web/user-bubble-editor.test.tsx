import { describe, expect, it } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { UserBubbleEditor } from './user-bubble-editor.tsx'
import { jsonFromDraft } from './composer-tiptap.ts'

describe('UserBubbleEditor', () => {
  it('keeps pick chips inline with surrounding text', async () => {
    const text = '看 <pick kind="task" id="t1" action="open" route="/tasks" label="写需求" /> 吧'
    const json = jsonFromDraft(text)
    expect(JSON.stringify(json)).toContain('pickChip')
    const { container } = render(<UserBubbleEditor text={text} />)
    await waitFor(() => {
      expect(container.textContent).toContain('写需求')
    })
    expect(container.querySelector('[data-testid="user-pick-chip"]')).toBeTruthy()
    const html = container.innerHTML
    expect(html.indexOf('看')).toBeLessThan(html.indexOf('user-pick-chip'))
    expect(html.indexOf('user-pick-chip')).toBeLessThan(html.indexOf('吧'))
  })

  it('renders a pick-only message as a chip, not the raw tag', async () => {
    const text =
      '<pick kind="text" id="3c6fe4e9" route="/s/abc" path="/pages/p000" start_line="7" end_line="9" text="**<mark data-color=&quot;color-mix(in srgb, #c4554d 22%, transparent)&quot;>遥襟甫畅，逸兴遄飞。</mark>**" selection="遥襟甫畅" />'
    const { container } = render(<UserBubbleEditor text={text} />)
    await waitFor(() => {
      expect(container.querySelector('[data-testid="user-pick-chip"]')).toBeTruthy()
    })
    expect(container.textContent).not.toContain('<pick')
    expect(container.textContent).not.toContain('<mark')
    expect(container.textContent).toContain('遥襟甫畅')
  })
})
