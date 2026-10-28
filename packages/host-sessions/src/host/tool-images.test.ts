import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { liftToolImages, stripDeclaredImagesFromToolDetail } from './tool-images.ts'
import { artifactsDir } from './artifacts.ts'
import type { LlmMessage } from '@biu/host-llm'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const DATA_URL = `data:image/png;base64,${TINY_PNG.toString('base64')}`

test('stripDeclaredImagesFromToolDetail removes artifacts that would be lifted', () => {
  assert.equal(
    stripDeclaredImagesFromToolDetail(
      JSON.stringify({
        stdout: 'ok',
        artifacts: [{ name: 'shot.png', mime: 'image/png', url: '/x/shot.png' }],
      }),
    ),
    JSON.stringify({ stdout: 'ok' }),
  )
})

test('liftToolImages skip leaves tool JSON as text', async () => {
  const lifted = await liftToolImages(
    [
      {
        role: 'tool',
        tool_call_id: '1',
        content: JSON.stringify({
          artifacts: [{ name: 'shot.png', mime: 'image/png', url: '/x/shot.png' }],
        }),
      },
    ],
    'sess-skip-flag',
    { skip: true },
  )
  assert.equal(typeof lifted[0]?.content, 'string')
})

test('liftToolImages turns bash artifacts into image_url blocks', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'biu-lift-'))
  const dir = artifactsDir('sess-1', baseDir)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'shot.png'), TINY_PNG)

  const messages: LlmMessage[] = [
    {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: '1', type: 'function', function: { name: 'bash', arguments: '{}' } }],
    },
    {
      role: 'tool',
      tool_call_id: '1',
      content: JSON.stringify({
        stdout: 'wrote shot.png',
        artifacts: [{ name: 'shot.png', mime: 'image/png', url: '/api/agents/sess-1/artifacts/shot.png' }],
      }),
    },
  ]
  const lifted = await liftToolImages(messages, 'sess-1', { baseDir })
  const parts = lifted[1]?.content as Array<{ type: string; text?: string; image_url?: { url: string } }>
  assert.equal(parts[0]?.type, 'text')
  assert.equal(parts[1]?.type, 'image_url')
  assert.equal(parts[1]?.image_url?.url, DATA_URL)
})

test('liftToolImages reads web_fetch local image files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'biu-lift-web-'))
  const path = join(dir, 'hero.png')
  await writeFile(path, TINY_PNG)
  const messages: LlmMessage[] = [
    {
      role: 'tool',
      tool_call_id: '2',
      content: JSON.stringify({
        file: { path, mime: 'image/png', bytes: TINY_PNG.length },
        text: `saved image → ${path}`,
      }),
    },
  ]
  const lifted = await liftToolImages(messages, 'sess-web')
  const parts = lifted[0]?.content as Array<{ type: string; image_url?: { url: string } }>
  assert.equal(parts[1]?.image_url?.url, DATA_URL)
})

test('liftToolImages leaves plain tool text alone', async () => {
  const messages: LlmMessage[] = [{ role: 'tool', tool_call_id: '3', content: 'pong' }]
  const lifted = await liftToolImages(messages, 'sess')
  assert.equal(lifted[0]?.content, 'pong')
})

test('liftToolImages does not lift SVG bytes even if named like a png', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'biu-lift-svg-'))
  const dir = artifactsDir('sess-svg', baseDir)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'shot.png'), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))

  const messages: LlmMessage[] = [
    {
      role: 'tool',
      tool_call_id: 'svg',
      content: JSON.stringify({
        artifacts: [{ name: 'shot.png', mime: 'image/png', url: '/api/agents/sess-svg/artifacts/shot.png' }],
      }),
    },
  ]
  const lifted = await liftToolImages(messages, 'sess-svg', { baseDir })
  assert.equal(lifted[0]?.content, messages[0]?.content)
})

test('liftToolImages skips svg refs and still lifts a later png', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'biu-lift-mix-'))
  const dir = artifactsDir('sess-mix', baseDir)
  await mkdir(dir, { recursive: true })
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
  for (const name of ['a.svg', 'b.svg', 'c.svg', 'd.svg', 'e.svg', 'f.svg']) {
    await writeFile(join(dir, name), svg)
  }
  await writeFile(join(dir, 'shot.png'), TINY_PNG)

  const messages: LlmMessage[] = [
    {
      role: 'tool',
      tool_call_id: 'mix',
      content: JSON.stringify({
        artifacts: [
          ...['a.svg', 'b.svg', 'c.svg', 'd.svg', 'e.svg', 'f.svg'].map((name) => ({
            name,
            mime: 'image/svg+xml',
            url: `/api/agents/sess-mix/artifacts/${name}`,
          })),
          { name: 'shot.png', mime: 'image/png', url: '/api/agents/sess-mix/artifacts/shot.png' },
        ],
      }),
    },
  ]
  const lifted = await liftToolImages(messages, 'sess-mix', { baseDir })
  const parts = lifted[0]?.content as Array<{ type: string; image_url?: { url: string } }>
  assert.equal(parts[0]?.type, 'text')
  assert.equal(parts.filter((part) => part.type === 'image_url').length, 1)
  assert.equal(parts[1]?.image_url?.url, DATA_URL)
})

test('liftToolImages ignores image paths that are only mentioned in text', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'biu-lift-skip-'))
  const path = join(dir, 'hero.png')
  await writeFile(path, TINY_PNG)
  const messages: LlmMessage[] = [
    {
      role: 'tool',
      tool_call_id: '4',
      content: JSON.stringify({
        stdout: `wrote ${path}`,
        images: ['https://cdn.example.com/hero.png'],
        text: 'page has images',
      }),
    },
  ]
  const lifted = await liftToolImages(messages, 'sess-skip')
  assert.equal(lifted[0]?.content, messages[0]?.content)
})
