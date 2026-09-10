import { test } from 'vitest'
import assert from 'node:assert/strict'
import { render } from '@testing-library/react'
import { bindRowFields, CollectionRowsShell } from './rows-view.tsx'

test('bindRowFields keeps visible columns in order', () => {
  const fields = bindRowFields(
    { id: 't1', title: '写文档', status: 'doing' },
    {
      labelField: 'title',
      fields: {
        title: { type: 'string', label: '标题' },
        status: { type: 'string', label: '状态' },
      },
    },
    ['status', 'title', 'missing'],
  )
  assert.deepEqual(
    fields.map((item) => item.key),
    ['status', 'title', 'missing'],
  )
  assert.equal(fields[0]?.label, '状态')
  assert.equal(fields[0]?.value, 'doing')
  assert.equal(fields[2]?.label, 'missing')
})

test('rows shell paints one Row per record with bound fields', () => {
  const { container } = render(
    <CollectionRowsShell
      rows={[{ id: 'a', title: '甲' }, { id: 'b', title: '乙' }]}
      schema={{ labelField: 'title', fields: { title: { type: 'string', label: '标题' } } }}
      columns={['title']}
      onOpen={() => undefined}
      Row={({ fields, onOpen }) => (
        <button type="button" onClick={onOpen}>
          {String(fields[0]?.value ?? '')}
        </button>
      )}
    />,
  )
  const buttons = [...container.querySelectorAll('button')]
  assert.deepEqual(
    buttons.map((item) => item.textContent),
    ['甲', '乙'],
  )
})
