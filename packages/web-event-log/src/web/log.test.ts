import { test } from 'vitest'
import assert from 'node:assert/strict'
import { clientLog, clientLogErrorText, clientLogSnapshot, resetClientLogs } from './log.ts'

test('client log keeps the newest line and the error text', () => {
  resetClientLogs()
  clientLog('info', 'page-block', 'page-toc 已在运行，跳过 start')
  clientLog('error', 'ui-hub', 'page-toc web 加载失败: Failed to fetch')
  const rows = clientLogSnapshot()
  assert.equal(rows[0]?.scope, 'ui-hub')
  assert.equal(rows[0]?.level, 'error')
  assert.match(rows[0]?.message ?? '', /web 加载失败/)
  assert.equal(rows[1]?.message, 'page-toc 已在运行，跳过 start')
  assert.equal(clientLogErrorText(new Error('action not available: start')), 'action not available: start')
  resetClientLogs()
  assert.equal(clientLogSnapshot().length, 0)
})
