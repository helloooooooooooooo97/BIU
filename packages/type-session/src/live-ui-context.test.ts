import { test } from 'vitest'
import assert from 'node:assert/strict'
import { formatLiveUiContext, sanitizeLiveUiContext } from './live-ui-context.ts'

test('sanitizeLiveUiContext drops empty and clips', () => {
  assert.equal(sanitizeLiveUiContext(null), undefined)
  assert.equal(sanitizeLiveUiContext({}), undefined)
  const live = sanitizeLiveUiContext({
    sessionId: ' s1 ',
    sessionTitle: '爱乐之城',
    route: '/database/pages/record/p002',
    inspectorTab: 'database:/pages',
    inspectorTabLabel: '页面',
    focusPath: '/pages/p002',
    focusTitle: '爱乐之城',
    caretLine: 12,
    caretInsert: 4,
    junk: true,
  })
  assert.deepEqual(live, {
    sessionId: 's1',
    sessionTitle: '爱乐之城',
    route: '/database/pages/record/p002',
    inspectorTab: 'database:/pages',
    inspectorTabLabel: '页面',
    focusPath: '/pages/p002',
    focusTitle: '爱乐之城',
    caretLine: 12,
    caretInsert: 4,
  })
})

test('formatLiveUiContext is a short labeled block', () => {
  const text = formatLiveUiContext({
    sessionId: 's1',
    sessionTitle: '配图',
    route: '/database/pages/record/p002',
    inspectorTabLabel: '页面',
    inspectorTab: 'database:/pages',
    focusPath: '/pages/p002',
    focusTitle: '爱乐之城',
    caretLine: 3,
    caretInsert: 0,
  })
  assert.match(text, /当前界面/)
  assert.match(text, /主会话：配图 id=s1/)
  assert.match(text, /路由：\/database\/pages\/record\/p002/)
  assert.match(text, /右侧栏：页面 \(database:\/pages\)/)
  assert.match(text, /焦点记录：爱乐之城 \/pages\/p002/)
  assert.match(text, /光标：第 3 行，插入点 0/)
  assert.equal(formatLiveUiContext({}), '')
})
