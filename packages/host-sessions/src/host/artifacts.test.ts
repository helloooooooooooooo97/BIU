import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  extractImagePathCandidates,
  findRecentImageFiles,
  ingestSessionImages,
  persistPastedImages,
  pastedImagePickText,
  readArtifactFile,
  resolveArtifactFile,
  withPastedImagePicks,
} from './artifacts.ts'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test('extractImagePathCandidates finds relative and absolute image paths', () => {
  const text = 'saved shot.png\nalso ./shots/a.jpg and /tmp/out.webp done'
  assert.deepEqual(extractImagePathCandidates(text), ['shot.png', './shots/a.jpg', '/tmp/out.webp'])
})

test('ingestSessionImages copies workspace images into .biu/artifacts', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'biu-art-'))
  const workspace = join(baseDir, 'ws')
  await mkdir(join(workspace, 'shots'), { recursive: true })
  await writeFile(join(workspace, 'shots', 'demo.png'), TINY_PNG)

  const artifacts = await ingestSessionImages({
    sessionId: 'sess-1',
    candidates: ['shots/demo.png', '../escape.png', 'missing.png'],
    workspaceRoot: workspace,
    baseDir,
  })
  assert.equal(artifacts.length, 1)
  assert.equal(artifacts[0]?.name, 'demo.png')
  assert.equal(artifacts[0]?.mime, 'image/png')
  assert.equal(artifacts[0]?.url, '/api/sessions/sess-1/artifacts/demo.png')

  const file = await readArtifactFile('sess-1', 'demo.png', baseDir)
  assert.ok(file)
  assert.equal(file.mime, 'image/png')
  assert.deepEqual(file.data, TINY_PNG)
})

test('ingestSessionImages accepts absolute paths outside workspace', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'cordis-art-abs-'))
  const workspace = join(baseDir, 'ws')
  const outside = join(baseDir, 'outside.png')
  await mkdir(workspace, { recursive: true })
  await writeFile(outside, TINY_PNG)

  const artifacts = await ingestSessionImages({
    sessionId: 'sess-abs',
    candidates: [outside],
    workspaceRoot: workspace,
    baseDir,
  })
  assert.equal(artifacts.length, 1)
  assert.equal(artifacts[0]?.name, 'outside.png')
  const file = await readArtifactFile('sess-abs', 'outside.png', baseDir)
  assert.deepEqual(file?.data, TINY_PNG)
})

test('findRecentImageFiles picks up newly written workspace images', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'cordis-art-recent-'))
  const since = Date.now() - 1000
  await writeFile(join(workspace, 'fresh.png'), TINY_PNG)
  const found = await findRecentImageFiles(workspace, since)
  assert.ok(found.some((path) => path.endsWith('fresh.png')))
})

test('persistPastedImages writes data URLs into session artifacts and names picks', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'biu-paste-'))
  const png = TINY_PNG.toString('base64')
  const saved = await persistPastedImages(
    'sess-paste',
    [
      { name: 'shot.png', mime: 'image/png', url: `data:image/png;base64,${png}` },
      { name: 'shot.png', mime: 'image/png', url: `data:image/png;base64,${png}` },
    ],
    baseDir,
  )
  assert.equal(saved.length, 2)
  assert.equal(saved[0]?.name, 'shot.png')
  assert.equal(saved[1]?.name, 'shot-1.png')
  assert.ok(saved[0]?.path?.includes(`${join('artifacts', 'sess-paste')}`))
  const file = await readArtifactFile('sess-paste', 'shot.png', baseDir)
  assert.deepEqual(file?.data, TINY_PNG)
  const picks = pastedImagePickText(saved)
  assert.match(picks, /"kind":"file"/)
  assert.match(picks, /shot\.png/)
  assert.equal(withPastedImagePicks('看看', saved).startsWith('看看\n<pick>'), true)
})

test('persistPastedImages rejects non data URLs', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'biu-paste-bad-'))
  await assert.rejects(
    () => persistPastedImages('sess-bad', [{ name: 'a.png', mime: 'image/png', url: '/tmp/a.png' }], baseDir),
    /data URL/,
  )
})

test('resolveArtifactFile rejects path traversal', () => {
  assert.equal(resolveArtifactFile('s1', '../x.png'), null)
  assert.equal(resolveArtifactFile('s1', 'a/b.png'), null)
  assert.equal(resolveArtifactFile('s1', 'ok.png')?.endsWith('ok.png'), true)
})
