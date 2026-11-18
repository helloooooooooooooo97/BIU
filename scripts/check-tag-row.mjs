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
const html = `<!doctype html><meta charset="utf-8"><style>:root{--biu-stroke-width:1px;--biu-font-size-4:14px;--biu-font-size-3:12px;--biu-space-5:20px;--biu-space-1:4px;--biu-pad-chip-x:6px;--biu-color-border:#444}body{margin:0;line-height:1.5}table{border-collapse:collapse}</style><style>${await css('packages/biu-ui/src/tag-chip.tsx')}${await css('packages/core-file-system/src/web/fsdb-style.ts')}</style><div class="fsdb-page"><div class="fsdb-detail-aside"><table class="tasks-table is-wrap"><tbody><tr class="fsdb-prop-tr is-tag-fold"><td><span class="fsdb-proprow-k"><span class="fsdb-proprow-label">标签</span></span></td><td><span class="fsdb-proprow-v"><span class="fsdb-prop-val is-schema"><span class="fsdb-schema"><span class="fsdb-pop-host"><span class="biu-tags"><span class="biu-tag"><span class="biu-tag-label">性能压测 12</span></span></span></span><span class="fsdb-schema-pack"><span class="fsdb-schema-prop">展开属性</span></span></span></span></span></td></tr><tr><td>动作</td><td>+</td></tr></tbody></table></div></div>`
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
  const results = await evaluate(`(()=>{
    const row=document.querySelector('tr'),table=document.querySelector('table');
    const samples=[];
    for(const wrap of [true,false]) for(const font of [14,16]){
      table.classList.toggle('is-wrap',wrap);document.documentElement.style.setProperty('--biu-font-size-4',font+'px');
      const measure=()=>{const top=row.getBoundingClientRect().top;return {label:document.querySelector('.fsdb-proprow-label').getBoundingClientRect().top-top,tag:document.querySelector('.biu-tag').getBoundingClientRect().top-top}};
      row.classList.remove('is-open');const closed=measure();row.classList.add('is-open');const opened=measure();
      samples.push({wrap,font,closed,opened,tagShift:opened.tag-closed.tag,labelShift:opened.label-closed.label});
    }
    return samples;
  })()`)
  console.log(JSON.stringify(results,null,2))
  for(const sample of results){assert.equal(sample.tagShift,0,'tag remains in place');assert.equal(sample.labelShift,0,'label remains in place')}
} finally {
  socket?.close(); chrome.kill('SIGTERM'); await new Promise((resolve) => server.close(resolve)); await delay(200)
  await rm(profile, { recursive: true, force: true }).catch(() => {})
}
