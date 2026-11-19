import { createRoot } from 'react-dom/client'
import { CollectionBrowser } from '../../packages/core-file-system/src/web/browser.tsx'
import { ensureFsdbStyle } from '../../packages/core-file-system/src/web/fsdb-style.ts'
import { REQUIRED_RECORD_FIELDS } from '@biu/type-file-system'

ensureFsdbStyle()
const schema = { labelField: 'title', columns: ['title', 'flag'], fields: {
  ...REQUIRED_RECORD_FIELDS, title: { type: 'string', writable: true }, flag: { type: 'boolean', writable: true },
} }
const records: Record<string, any> = {
  '/notes': { id: 'one', title: 'Main original', flag: false },
  '/tasks': { id: 'two', title: 'Inspector original', flag: false },
}
const writes: any[] = []
let fail = false
window.fetch = async (path, init) => {
  const url = new URL(String(path), location.origin)
  let body: any = {}, status = 200
  const collection = '/' + (url.searchParams.get('path') || '').split('/').filter(Boolean)[0]
  if (url.pathname === '/api/profile') body = { dataLocation: 'device' }
  if (url.pathname === '/api/db/stat') body = { schema }
  if (url.pathname === '/api/db/tags') body = { tags: [] }
  if (url.pathname === '/api/db/views') body = { views: [] }
  if (url.pathname === '/api/db/read') body = { value: records[collection], schema }
  if (url.pathname === '/api/db/content') body = { value: null, version: 1 }
  if (url.pathname === '/api/db/list') body = { items: records[collection] ? [records[collection]] : [], total: 1, schema }
  if (url.pathname === '/api/db/update') {
    const patch = JSON.parse(String(init?.body))
    await new Promise(resolve => setTimeout(resolve, 80))
    if (fail) { body = { error: 'network' }; status = 500 }
    else {
      const key = '/' + patch.path.split('/').filter(Boolean)[0]
      writes.push(patch)
      records[key] = { ...records[key], ...patch.content }
      body = { value: records[key] }
    }
  }
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
Object.assign(window, { __ready: true, __writes: writes, __records: records, __fail: (value: boolean) => { fail = value } })
createRoot(document.getElementById('root')!).render(<>
  <div id="main" style={{ height: 380, display: 'flex' }}><CollectionBrowser collectionPath="/notes" title="Notes" blurb="" /></div>
  <div id="side" style={{ height: 380, display: 'flex' }}><CollectionBrowser embed inspectorPaneId="history-test" collectionPath="/tasks" title="Tasks" blurb="" /></div>
  <textarea id="outside-input" defaultValue="native undo" />
</>)
