import { test } from 'vitest'
import assert from 'node:assert/strict'
import { diffStats, formatToolDetail, lineDiff, parseToolCall, prettyJsonString, compactJsonSummary, shouldAutoOpenTool, toolSummary, toolOutputChars, toolTitle } from './tool-format.ts'

test('lineDiff marks removals and additions', () => {
  const lines = lineDiff('a\nb\nc', 'a\nx\nc')
  assert.deepEqual(
    lines.map((line) => [line.type, line.text]),
    [
      ['equal', 'a'],
      ['remove', 'b'],
      ['add', 'x'],
      ['equal', 'c'],
    ],
  )
  assert.deepEqual(diffStats(lines), { added: 1, removed: 1 })
})

test('parseToolCall understands str_replace_editor str_replace', () => {
  const parsed = parseToolCall(
    'str_replace_editor',
    JSON.stringify({
      command: 'str_replace',
      path: 'src/a.ts',
      old_str: 'foo',
      new_str: 'bar',
    }),
  )
  assert.equal(parsed.kind, 'str_replace')
  if (parsed.kind !== 'str_replace') return
  assert.equal(parsed.path, 'src/a.ts')
  assert.equal(parsed.oldStr, 'foo')
  assert.equal(parsed.newStr, 'bar')
  assert.equal(toolSummary(parsed, ''), 'Edited src/a.ts')
})

test('parseToolCall understands bash command', () => {
  const parsed = parseToolCall('bash', JSON.stringify({ command: 'ls -la' }))
  assert.equal(parsed.kind, 'bash')
  if (parsed.kind !== 'bash') return
  assert.equal(parsed.command, 'ls -la')
})

test('parseToolCall create/insert', () => {
  const created = parseToolCall(
    'str_replace_editor',
    JSON.stringify({ command: 'create', path: 'n.ts', file_text: 'hi' }),
  )
  assert.equal(created.kind, 'create')
  const inserted = parseToolCall(
    'str_replace_editor',
    JSON.stringify({ command: 'insert', path: 'n.ts', insert_line: 2, new_str: 'x' }),
  )
  assert.equal(inserted.kind, 'insert')
})

test('formatToolDetail unwraps bash stdout/stderr json', () => {
  const formatted = formatToolDetail(
    JSON.stringify({ code: 0, stdout: 'hello\nworld\n', stderr: '' }),
    'bash',
  )
  assert.equal(formatted?.kind, 'bash')
  if (formatted?.kind !== 'bash') return
  assert.equal(formatted.code, 0)
  assert.equal(formatted.stdout, 'hello\nworld\n')
  assert.equal(formatted.stderr, '')
})

test('toolOutputChars counts bash stdout and stderr', () => {
  assert.equal(toolOutputChars(undefined, 'bash'), 0)
  assert.equal(toolOutputChars(JSON.stringify({ code: 0, stdout: 'hello', stderr: 'err' }), 'bash'), 8)
})

test('formatToolDetail keeps bash artifacts for chat rendering', () => {
  const formatted = formatToolDetail(
    JSON.stringify({
      code: 0,
      stdout: 'shot.png\n',
      stderr: '',
      artifacts: [{ name: 'shot.png', url: '/api/sessions/s1/artifacts/shot.png', mime: 'image/png' }],
    }),
    'bash',
  )
  assert.equal(formatted?.kind, 'bash')
  if (formatted?.kind !== 'bash') return
  assert.equal(formatted.artifacts?.length, 1)
  assert.equal(formatted.artifacts?.[0]?.url, '/api/sessions/s1/artifacts/shot.png')
})

test('formatToolDetail pretty-prints generic json objects', () => {
  const formatted = formatToolDetail('{"a":1,"b":[2,3]}')
  assert.equal(formatted?.kind, 'json')
  if (formatted?.kind !== 'json') return
  assert.match(formatted.text, /\n/)
  assert.match(formatted.text, /"a": 1/)
})

test('parseToolCall understands mcp_call remote tool name', () => {
  const parsed = parseToolCall(
    'mcp_call',
    JSON.stringify({
      server: 'cdb',
      name: 'cdb.status.query_metrics',
      arguments: { instance: 'db-1', start: '12:00', end: '13:00' },
    }),
  )
  assert.equal(parsed.kind, 'mcp')
  if (parsed.kind !== 'mcp') return
  assert.equal(parsed.server, 'cdb')
  assert.equal(parsed.tool, 'cdb.status.query_metrics')
  assert.equal(toolTitle(parsed, 'mcp_call'), 'cdb.status.query_metrics')
  assert.match(toolSummary(parsed, ''), /db-1/)
})

test('parseToolCall unwraps execute_tools gateway to the leaf MCP tool', () => {
  const parsed = parseToolCall(
    'mcp_call',
    JSON.stringify({
      server: 'cloud-dba-ai-cdb-mcpserver',
      name: 'execute_tools',
      arguments: {
        tool_name: 'cdb.status.query_metrics',
        arguments: { ip: '1.2.3.4', metrics: 'qps,cpu' },
      },
    }),
  )
  assert.equal(parsed.kind, 'mcp')
  if (parsed.kind !== 'mcp') return
  assert.equal(parsed.tool, 'cdb.status.query_metrics')
  assert.equal(toolTitle(parsed, 'mcp_call'), 'cdb.status.query_metrics')
  assert.match(toolSummary(parsed, ''), /qps/)
})

test('formatToolDetail charts timestamped metric records from mcp payload', () => {
  const records = [
    { timestamp: '2026-09-09T12:00:00Z', qps: 10, cpu: 20 },
    { timestamp: '2026-09-09T12:01:00Z', qps: 14, cpu: 28 },
    { timestamp: '2026-09-09T12:02:00Z', qps: 18, cpu: 24 },
  ]
  const formatted = formatToolDetail(
    JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ records }) }] }),
    'mcp',
  )
  assert.equal(formatted?.kind, 'chart')
  if (formatted?.kind !== 'chart') return
  assert.equal(formatted.series.length, 2)
  assert.equal(formatted.series[0]?.points.length, 3)
  assert.equal(formatted.stats.length, 2)
  assert.match(formatted.text, /"qps": 10/)
  assert.equal(shouldAutoOpenTool(parseToolCall('mcp_call', '{"server":"cdb","name":"cdb.status.query_metrics"}'), JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ records }) }] })), true)
})

test('formatToolDetail charts processlist active counts', () => {
  const formatted = formatToolDetail(
    JSON.stringify({
      active_counts_timeline: {
        active_counts: [
          ['12:00:00', 3],
          ['12:01:00', 7],
          ['12:02:00', 5],
        ],
      },
    }),
    'mcp',
  )
  assert.equal(formatted?.kind, 'chart')
  if (formatted?.kind !== 'chart') return
  assert.equal(formatted.series[0]?.name, 'active_count')
  assert.equal(formatted.series[0]?.points.length, 3)
})

test('formatToolDetail does not chart ordinary object lists', () => {
  const formatted = formatToolDetail('{"items":[{"id":"task_1","title":"写文档","status":"open"}]}')
  assert.equal(formatted?.kind, 'json')
})

test('prettyJsonString indents objects', () => {
  assert.match(prettyJsonString('{"x":1}'), /"x": 1/)
})

test('compactJsonSummary prefers titles over raw json', () => {
  const tasks = JSON.stringify([
    { id: 'task_1', title: '创建五子棋插件：极光五子棋（store-gomoku-aurora）', status: 'open' },
    { id: 'task_2', title: '第二项', status: 'open' },
  ])
  assert.equal(compactJsonSummary(tasks), '2 条 · 创建五子棋插件：极光五子棋（store-gomoku-aurora）')
  assert.equal(compactJsonSummary('{"views":[{"id":"v1","name":"表格"}]}'), '表格')
  const parsed = parseToolCall('tasks_list', tasks)
  assert.equal(parsed.kind, 'raw')
  assert.equal(toolSummary(parsed, tasks), '2 条 · 创建五子棋插件：极光五子棋（store-gomoku-aurora）')
  assert.doesNotMatch(toolSummary(parsed, tasks), /\[\{/)
})
