// Automatic headless-browser regression check. No desktop/computer-use API is used.
// CHROME_BIN can point to another Chromium executable.
import { build } from 'esbuild'
import WebSocket from 'ws'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'

const bundle = await build({ entryPoints: ['scripts/fixtures/tag-emoji.tsx'], bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl' } })
const html = `<!doctype html><meta charset="utf-8"><style>:root{--biu-size-control-md:32px;--biu-stroke-width:1px;--biu-font-size-4:14px;--biu-font-weight-medium:500;--biu-color-bg:#181818;--biu-color-surface:#181818;--biu-color-border:#444;--biu-color-text:#eee;--biu-color-text-muted:#ddd;--biu-pad-page:20px;--biu-chat-max-width:1200px}html,body,#root{height:100%;margin:0}body{color:#eee}#root>.fsdb-page{height:100%;display:flex}.fsdb-right{height:100%;flex:1;display:flex;flex-direction:column}button{color:inherit;background:transparent;border:0}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script>`
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
  for (let i = 0; i < 100; i++) { if (await evaluate('window.__ready')) break; await delay(50) }
  await delay(200)
  for(let i=0;i<3;i++){
    const result=await evaluate(`(async()=>{document.querySelector('.fsdb-detail-title-icon')?.click();await new Promise(r=>setTimeout(r,100));const buttons=[...document.querySelectorAll('button')];const choice=buttons.find(b=>b.textContent==='${['🔥','🎯','🚀'][i]}');choice?.click();await new Promise(r=>setTimeout(r,500));return {picked:!!choice,count:window.__requests.length,emoji:document.querySelector('.fsdb-detail-title-icon')?.textContent}})()`)
    assert.ok(result.picked, 'emoji picker is usable on every edit')
    assert.equal(result.emoji, ['🔥','🎯','🚀'][i])
    assert.ok(result.count < 80, 'refresh requests remain bounded')
    console.log(result)
  }
  assert.deepEqual(errors, [], 'no render errors')
  const cached = await evaluate(`(async()=>{window.__holdList=true;window.__showTagsList();await new Promise(r=>setTimeout(r,200));return [...document.querySelectorAll('td')].map(x=>x.textContent)})()`)
  assert.ok(cached.every(text=>!text.includes('页面')), 'source pages never paint as tag definitions from cache')
  await evaluate(`(async()=>{window.__releaseList();await new Promise(r=>setTimeout(r,500))})()`)
  const listed=await evaluate(`[...document.querySelectorAll('td')].map(x=>x.textContent)`)
  assert.ok(listed.some(text=>text.includes('性能压测')), 'tag definitions load after returning to the list')
  assert.ok(listed.every(text=>!text.includes('页面')), 'no source records in the tag definition list')
  console.log('Passed: consecutive detail emoji edits and tag list cache isolation')
} finally {
  socket?.close(); chrome.kill('SIGTERM'); await new Promise((resolve) => server.close(resolve)); await delay(200)
  await rm(profile, { recursive: true, force: true }).catch(() => {})
}
