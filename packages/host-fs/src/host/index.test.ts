import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import * as tools from '@biu/host-tools'
import * as sessionStore from '@biu/host-session-store'
import * as sessions from '@biu/host-sessions'
import * as systemPrompt from '@biu/host-agents/system-prompt'
import * as fs from './index.ts'
import { runWithSession } from '@biu/host-sessions/scope'

test('fs stays inside workspace', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  await ctx.plugin(systemPrompt)
  const root = await mkdtemp(join(tmpdir(), 'cordis-fs-'))
  await ctx.plugin(fs, { root })
  await ctx.fs.write('a.txt', 'ok')
  assert.equal(await ctx.fs.read('a.txt'), 'ok')
  await assert.rejects(() => ctx.fs.read('../secret'), /escapes/)
})

test('bound session project path becomes tool cwd', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  await ctx.plugin(systemPrompt)
  const defaultRoot = await mkdtemp(join(tmpdir(), 'cordis-ws-'))
  const projectRoot = await mkdtemp(join(tmpdir(), 'cordis-app-'))
  await writeFile(join(projectRoot, 'app.txt'), 'hello-project', 'utf8')
  await ctx.plugin(fs, { root: defaultRoot })

  const record = await ctx.sessions.create()
  await ctx.sessions.setProject(record.id, { path: projectRoot })

  await runWithSession(record.id, async () => {
    assert.equal(await ctx.fs.read('app.txt'), 'hello-project')
    await ctx.tools.invoke('str_replace_editor', {
      command: 'str_replace',
      path: 'app.txt',
      old_str: 'hello-project',
      new_str: 'edited-by-tool',
    })
  })

  assert.equal(await (await import('node:fs/promises')).readFile(join(projectRoot, 'app.txt'), 'utf8'), 'edited-by-tool')
})

test('fs_read and fs_list guard context window with default truncation limits', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  await ctx.plugin(systemPrompt)
  const root = await mkdtemp(join(tmpdir(), 'cordis-fs-guard-'))
  await ctx.plugin(fs, { root })

  const huge = 'a'.repeat(40 * 1024)
  await ctx.fs.write('huge.txt', huge)
  const read = (await ctx.tools.invoke('fs_read', { path: 'huge.txt' })) as string
  assert.ok(read.length < huge.length)
  assert.match(read, /truncated \d+ chars/)

  for (let i = 0; i < 6; i += 1) await ctx.fs.write(`f${i}.txt`, 'x')
  const listed = (await ctx.tools.invoke('fs_list', { path: '.', limit: 3 })) as {
    items: string[]
    total: number
    truncated: boolean
  }
  assert.equal(listed.truncated, true)
  assert.equal(listed.items.length, 3)
  assert.ok(listed.total >= 6)
})
