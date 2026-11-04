import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const dir = import.meta.dirname

test('chat selection bubble attaches a text pick', () => {
  const src = readFileSync(resolve(dir, './chat-select-bubble.tsx'), 'utf8')
  assert.match(src, /data-testid="chat-select-bubble"/)
  assert.match(src, /加入对话/)
  assert.match(src, /ChatBubbleLeftRightIcon/)
  assert.match(src, /chat-select-bubble-key/)
  assert.match(src, /⌘L/)
  const css = readFileSync(resolve(dir, '../../../../web/style.css'), 'utf8')
  assert.match(css, /\.chat-select-bubble\s*\{[^}]*height:\s*28px/s)
  assert.match(css, /\.chat-select-bubble\s*\{[^}]*gap:\s*4px/s)
  assert.match(css, /\.chat-select-bubble\s*\{[^}]*padding:\s*0 8px/s)
  assert.match(css, /\.chat-select-bubble\s*\{[^}]*font-size:\s*var\(--biu-font-size-3\)/s)
  assert.match(css, /\.chat-select-bubble-icon\s*\{[^}]*width:\s*14px/s)
  assert.match(css, /\.chat-select-bubble-icon\s*\{[^}]*height:\s*14px/s)
  assert.match(src, /closest\('\.chat-stage'\)/)
  assert.match(src, /chat-composer-dock/)
  assert.match(src, /textPickFromPlain/)
  assert.match(src, /getPick\(\)\?\.attach/)
  assert.match(src, /pick-mode/)
  assert.match(src, /key === 'l'/)
})

test('chat ui mounts the selection bubble on root overlays', () => {
  const src = readFileSync(resolve(dir, './index.ts'), 'utf8')
  assert.match(src, /ChatSelectBubble/)
  assert.match(src, /root-overlays/)
  assert.match(src, /chat-select-bubble/)
})
