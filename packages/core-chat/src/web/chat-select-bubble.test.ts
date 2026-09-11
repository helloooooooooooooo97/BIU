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
