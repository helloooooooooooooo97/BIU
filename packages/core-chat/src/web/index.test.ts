import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Context } from 'cordis'
import { MapIcon } from '@heroicons/react/16/solid'
import '@biu/type-host-context'
import * as slots from '@biu/web-slots'
import * as appModules from '@biu/web-app-modules'
import * as snapshot from '@biu/web-snapshot'
import * as sessionView from '@biu/web-session-view'
import * as projectView from '@biu/web-project-view'
import * as chat from './index.ts'
import * as shell from '@biu/web-app-shell'

test('one plugin fills thread, trajectory, composer and approvals dock', async () => {
  const ctx = new Context()
  await ctx.plugin(slots)
  await ctx.plugin(appModules)
  await ctx.plugin(sessionView)
  await ctx.plugin(projectView)
  await ctx.plugin(snapshot)
  await ctx.plugin(chat)
  assert.equal(ctx.slots.list('composer').length, 0)
  await ctx.plugin(shell)
  assert.equal(ctx.slots.list('composer')[0]?.id, 'chat')
  assert.equal(ctx.slots.list('stage').some((item) => item.id === 'chat-thread'), true)
  assert.equal(ctx.slots.list('stage-aside').some((item) => item.id === 'chat-outline'), true)
  assert.equal(ctx.slots.list('trajectory').some((item) => item.id === 'trajectory'), true)
  assert.equal(ctx.slots.list('project').length, 0)
  assert.equal(ctx.slots.list('dock').some((item) => item.id === 'approvals'), true)
  assert.equal(ctx.slots.list('dock').some((item) => item.id === 'chat-live-hud'), true)
  assert.equal(ctx.slots.list('models').length, 0)
  const traj = ctx.slots.list('inspector-panels').find((item) => item.id === 'chat-traj')
  const usage = ctx.slots.list('inspector-panels').find((item) => item.id === 'chat-usage')
  assert.equal(traj.props?.().tabIcon, MapIcon)
  assert.ok(usage)
  assert.equal(traj.props?.().requiresSession, true)
  assert.equal(usage.props?.().requiresSession, true)
  assert.deepEqual(traj.props?.().centerKinds, ['session'])
  assert.deepEqual(usage.props?.().centerKinds, ['session'])
})

test('composer banner and approvals share GET /api/chat/config', () => {
  const composer = readFileSync(resolve(import.meta.dirname, './composer.tsx'), 'utf8')
  const banner = readFileSync(resolve(import.meta.dirname, './config-banner.tsx'), 'utf8')
  const approvals = readFileSync(resolve(import.meta.dirname, './approvals.tsx'), 'utf8')
  const config = readFileSync(resolve(import.meta.dirname, './config.tsx'), 'utf8')
  assert.match(composer, /getChatConfig/)
  assert.doesNotMatch(composer, /fetch\('\/api\/chat\/config'\)/)
  assert.match(banner, /getChatConfig/)
  assert.doesNotMatch(banner, /fetch\('\/api\/chat\/config'\)/)
  assert.match(banner, /biu:chat-config-changed/)
  assert.doesNotMatch(banner, /setInterval/)
  assert.match(banner, /chat-config-banner/)
  assert.match(banner, /chat-config-banner-action/)
  assert.match(banner, /尚未配置 API KEY：消息会本地回声，不会调用模型。/)
  assert.match(banner, /点击配置模型的API KEY/)
  assert.match(banner, /ModelConfigDialog/)
  assert.match(banner, /setConfigOpen\(true\)/)
  assert.doesNotMatch(banner, /biu:open-model-menu/)
  assert.doesNotMatch(banner, /点击输入框里的/)
  assert.doesNotMatch(banner, /输入框旁/)
  assert.doesNotMatch(banner, /＋ 配置模型/)
  assert.match(composer, /biu:open-model-menu/)
  assert.match(composer, /setModelOpen\(true\)/)
  assert.doesNotMatch(banner, /biu-business/)
  assert.doesNotMatch(banner, /biu-input/)
  const css = readFileSync(resolve(import.meta.dirname, '../../../../web/style.css'), 'utf8')
  assert.match(css, /\.chat-config-banner\s*\{[^}]*background:\s*var\(--biu-color-bg-subtle\)/s)
  assert.match(css, /\.chat-config-banner\s*\{[^}]*color:\s*var\(--biu-color-text-muted\)/s)
  assert.match(css, /\.chat-config-banner-action\s*\{[^}]*color:\s*var\(--biu-color-text\)/s)
  assert.match(css, /html\.dark \.chat-config-banner\s*\{[^}]*background:\s*#202020/s)
  assert.match(css, /html\.dark \.chat-config-banner\s*\{[^}]*color:\s*#bcbab7/s)
  assert.match(css, /html\.dark \.chat-config-banner-action\s*\{[^}]*color:\s*#d4d4d4/s)
  assert.match(css, /\.composer-model-panel,\s*\n\.composer-model-flyout\s*\{[^}]*background:\s*var\(--biu-color-bg-subtle\)/s)
  assert.match(approvals, /getChatConfig/)
  assert.match(config, /seedChatConfig/)
  assert.match(config, /getChatConfig<ChatPublicConfig>/)
})

test('chat-ui first paint does not statically import thread, composer, or antd', () => {
  const index = readFileSync(resolve(import.meta.dirname, './index.ts'), 'utf8')
  const chrome = readFileSync(resolve(import.meta.dirname, './sessions-chrome.tsx'), 'utf8')
  const hud = readFileSync(resolve(import.meta.dirname, './live-hud.tsx'), 'utf8')
  const thumbs = readFileSync(resolve(import.meta.dirname, './image-thumbs.tsx'), 'utf8')
  const tools = readFileSync(resolve(import.meta.dirname, './tool-card.tsx'), 'utf8')
  assert.doesNotMatch(index, /from '\.\/thread\.tsx'/)
  assert.doesNotMatch(index, /from '\.\/sessions-chrome\.tsx'/)
  assert.doesNotMatch(index, /from '\.\/composer\.tsx'/)
  assert.doesNotMatch(index, /from '\.\/live-hud\.tsx'/)
  assert.doesNotMatch(index, /from '\.\/approvals\.tsx'/)
  assert.doesNotMatch(index, /from '\.\/trajectory\.tsx'/)
  assert.doesNotMatch(index, /from '\.\/usage-panel\.tsx'/)
  assert.match(index, /lazySlot\(\(\) => import\('\.\/thread\.tsx'\)/)
  assert.match(index, /lazySlot\(\(\) => import\('\.\/composer\.tsx'\)/)
  assert.doesNotMatch(chrome, /from '\.\/thread\.tsx'/)
  assert.match(chrome, /lazy\(\(\) => import\('\.\/thread\.tsx'\)/)
  assert.doesNotMatch(hud, /from '\.\/thread\.tsx'/)
  assert.match(hud, /from '\.\/reply-display\.ts'/)
  assert.doesNotMatch(thumbs, /from 'antd'/)
  assert.doesNotMatch(tools, /from 'antd'/)
})

