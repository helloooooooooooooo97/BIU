// Automatic headless-browser regression check. No desktop/computer-use API is used.
// CHROME_BIN can point to another Chromium executable.
import WebSocket from 'ws'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'

const css = async path => (await readFile(path, 'utf8')).split('const CSS = `')[1].split('`')[0]
const html = `<!doctype html><meta charset="utf-8"><style>:root{--biu-stroke-width:1px;--biu-font-size-4:14px;--biu-color-border:#444}body{margin:0;line-height:1.5}.fsdb-page{width:600px}.person-table{table-layout:fixed!important;width:420px!important;min-width:0!important;flex:none}.person-table td{overflow:hidden}</style><style>${await css('packages/core-file-system/src/web/fsdb-style.ts')}</style><div class="fsdb-page"><table class="tasks-table person-table is-cols-fixed"><colgroup><col id="person-col" style="width:320px"><col style="width:100px"></colgroup><tbody><tr class="fsdb-prop-tr"><td><div class="fsdb-cell"><span class="fsdb-person-list"><button class="fsdb-person is-link"><span class="fsdb-person-avatar"></span><span class="fsdb-person-name">玫方风</span></button><button class="fsdb-person is-link"><span class="fsdb-person-avatar"></span><span class="fsdb-person-name">member@example.com</span></button></span></div></td><td>下一列</td></tr></tbody></table></div>`
const server = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(html) })
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}`
const profile = await mkdtemp(join(tmpdir(), 'biu-table-scroll-'))
const chrome = spawn(process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1200,800', url], { stdio: 'ignore' })
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let socket
try {
  let port
  for (let i = 0; i < 100; i++) { try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break } catch { await delay(50) } }
  assert.ok(port, 'Chromium started')
  let target
  for (let i = 0; i < 100; i++) {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    target = pages.find((page) => page.type === 'page' && page.url.startsWith(url))
    if (target) break
    await delay(50)
  }
  assert.ok(target, 'fixture loaded')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve) => socket.once('open', resolve))
  let sequence = 0
  const pending = new Map(), errors = []
  socket.on('message', (data) => {
    const message = JSON.parse(data)
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails)
    if (message.id) { const task = pending.get(message.id); pending.delete(message.id); message.error ? task.reject(message.error) : task.resolve(message.result) }
  })
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
  const evaluate = async (expression) => {
    const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails))
    return response.result.value
  }
  await call('Runtime.enable')
  for (let i = 0; i < 100; i++) {
    if (await evaluate("Boolean(document.querySelector('.fsdb-prop-tr'))")) break
    await delay(50)
  }
  assert.ok(await evaluate("Boolean(document.querySelector('.fsdb-prop-tr'))"), 'tag fixture is ready')
  const result = await evaluate(`(()=>{
    const table=document.querySelector('table'),col=document.querySelector('#person-col'),cell=document.querySelector('td');
    const measure=()=>({people:[...document.querySelectorAll('.fsdb-person')].map(el=>el.getBoundingClientRect().width),names:[...document.querySelectorAll('.fsdb-person-name')].map(el=>el.getBoundingClientRect().width),gap:document.querySelectorAll('.fsdb-person')[1].getBoundingClientRect().left-document.querySelectorAll('.fsdb-person')[0].getBoundingClientRect().right,cell:cell.getBoundingClientRect().width,overflow:getComputedStyle(cell).overflowX,inner:document.querySelector('.fsdb-person-list').getBoundingClientRect().width});
    const wide=measure();table.style.setProperty('width','180px','important');col.style.width='80px';const narrow=measure();
    return {wide,narrow};
  })()`)
  console.log(result)
  assert.ok(result.narrow.cell < result.wide.cell)
  assert.deepEqual(result.narrow.people,result.wide.people,'people retain their natural width')
  assert.deepEqual(result.narrow.names,result.wide.names,'member labels do not compress')
  assert.equal(result.narrow.gap,result.wide.gap)
  assert.equal(result.narrow.overflow,'hidden')
  assert.ok(result.narrow.inner > result.narrow.cell,'overflow is clipped at the cell boundary')
} finally {
  socket?.close(); chrome.kill('SIGTERM'); await new Promise((resolve) => server.close(resolve)); await delay(200)
  await rm(profile, { recursive: true, force: true }).catch(() => {})
}
