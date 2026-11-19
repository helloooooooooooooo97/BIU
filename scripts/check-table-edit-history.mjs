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

const bundle = await build({ entryPoints: ['scripts/fixtures/table-edit-history.tsx'], bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl' } })
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
  const result = await evaluate(`(async()=>{
    const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const button=id=>document.querySelector('#'+id+' td[data-col-key="flag"] button');
    for(let i=0;i<100 && (!button('main')||!button('side'));i++) await delay(50);
    if(!button('main')||!button('side')) throw new Error('tables not ready: '+document.body.innerText.slice(0,1000));
    const key=(target,key,options={})=>{target.focus();const event=new KeyboardEvent('keydown',{key,ctrlKey:true,bubbles:true,cancelable:true,...options});target.dispatchEvent(event);return event.defaultPrevented};
    button('main').click();await delay(200);
    const afterEdit=window.__records['/notes'].flag;
    const undoHandled=key(button('main'),'z');await delay(200);
    const afterUndo=window.__records['/notes'].flag;
    key(button('main'),'y');await delay(200);
    const afterRedo=window.__records['/notes'].flag;
    button('side').click();await delay(200);
    key(button('side'),'z');await delay(200);
    const independent={main:window.__records['/notes'].flag,side:window.__records['/tasks'].flag};
    key(button('side'),'Z',{ctrlKey:false,metaKey:true,shiftKey:true});await delay(200);
    const macRedo=window.__records['/tasks'].flag;
    const beforeInput=window.__writes.length;
    const inputHandled=key(document.querySelector('#outside-input'),'z');await delay(150);
    const inputWrites=window.__writes.length-beforeInput;
    window.__fail(true);key(button('main'),'z');await delay(200);
    const failedUndo=window.__records['/notes'].flag;
    window.__fail(false);key(button('main'),'z');await delay(200);
    const retriedUndo=window.__records['/notes'].flag;
    const beforeRapid=window.__writes.length;
    button('main').click();key(button('main'),'z');await delay(350);
    const rapid=window.__records['/notes'].flag;
    const rapidWrites=window.__writes.length-beforeRapid;
    const title=document.querySelector('#main td[data-col-key="title"]');
    title.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:1,clientX:title.getBoundingClientRect().left+20,clientY:title.getBoundingClientRect().top+10}));
    title.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0,pointerId:1}));
    const table=title.closest('table');table.focus();
    table.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    for(let i=0;i<50 && !document.querySelector('.fsdb-cell-pop-text');i++) await delay(20);
    const editor=document.querySelector('.fsdb-cell-pop-text');
    if(!editor) throw new Error('text editor did not open');
    const textInputHandled=key(editor,'z');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(editor,'Main edited');
    editor.dispatchEvent(new Event('input',{bubbles:true}));await delay(30);
    editor.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await delay(220);
    const titleSaved=window.__records['/notes'].title;
    key(button('main'),'z');await delay(200);const titleUndone=window.__records['/notes'].title;
    key(button('main'),'y');await delay(200);const titleRedone=window.__records['/notes'].title;
    return {afterEdit,undoHandled,afterUndo,afterRedo,independent,macRedo,inputHandled,inputWrites,failedUndo,retriedUndo,rapid,rapidWrites,textInputHandled,titleSaved,titleUndone,titleRedone};
  })()`)
  console.log(result)
  assert.equal(result.afterEdit,true)
  assert.equal(result.undoHandled,true)
  assert.equal(result.afterUndo,false)
  assert.equal(result.afterRedo,true)
  assert.deepEqual(result.independent,{main:true,side:false})
  assert.equal(result.macRedo,true)
  assert.equal(result.inputHandled,false)
  assert.equal(result.inputWrites,0)
  assert.equal(result.failedUndo,true)
  assert.equal(result.retriedUndo,false)
  assert.equal(result.rapid,false)
  assert.equal(result.rapidWrites,2)
  assert.equal(result.textInputHandled,false)
  assert.equal(result.titleSaved,'Main edited')
  assert.equal(result.titleUndone,'Main original')
  assert.equal(result.titleRedone,'Main edited')
  assert.deepEqual(errors,[])
  console.log('Passed: persisted table undo/redo, pane isolation, native inputs, failure retry and pending saves')
} finally {
  socket?.close(); chrome.kill('SIGTERM'); await new Promise((resolve) => server.close(resolve)); await delay(200)
  await rm(profile, { recursive: true, force: true }).catch(() => {})
}
