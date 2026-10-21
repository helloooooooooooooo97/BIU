/** @vitest-environment jsdom */
import { useEffect, useRef } from 'react'
import { act, render } from '@testing-library/react'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { focusComposerEditor } from '@biu/web-app-shell/chat-overlay'

function ComposerFocusProbe({ editor }: { editor: { isDestroyed?: boolean; commands?: { focus?: (where?: string) => unknown } } | null }) {
  const editorRef = useRef(editor)
  editorRef.current = editor
  useEffect(() => {
    const onFocus = () => {
      focusComposerEditor(editorRef.current)
    }
    window.addEventListener('biu:composer-focus', onFocus)
    return () => window.removeEventListener('biu:composer-focus', onFocus)
  }, [])
  return <div data-testid="composer-focus-probe" />
}

test('composer first frame with a null editor does not throw on biu:composer-focus', () => {
  render(<ComposerFocusProbe editor={null} />)
  act(() => {
    window.dispatchEvent(new Event('biu:composer-focus'))
  })
  assert.equal(true, true)
})
