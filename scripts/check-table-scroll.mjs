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

const bundle = await build({ entryPoints: ['scripts/fixtures/table-scroll.tsx'], bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl' } })
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
  const snapshot = async (offset) => evaluate(`(async()=>{
    const page=document.querySelector('.fsdb-right-body'),wrap=document.querySelector('.tasks-table-wrap'),table=wrap.querySelector('table');
    page.scrollTop=${offset};await new Promise(r=>setTimeout(r,180));
    const viewport=document.querySelector('.fsdb-pinned-head-viewport'),toolbar=document.querySelector('.tasks-toolbar'),rect=page.getBoundingClientRect(),head=(viewport??table.tHead).getBoundingClientRect();
    const separator=getComputedStyle(toolbar,'::before');const separatorBottom=toolbar.getBoundingClientRect().bottom+parseFloat(separator.height);const bottom=Math.min(rect.bottom,table.getBoundingClientRect().bottom),top=Math.max(rect.top,head.bottom);
    const gaps=[...table.querySelectorAll('.fsdb-table-pad')].map(row=>row.getBoundingClientRect()).filter(r=>Math.min(r.bottom,bottom)-Math.max(r.top,top)>1).map(r=>({top:r.top,bottom:r.bottom}));
    const floating=viewport?.querySelector('table'),cell=viewport?.querySelector('th');
    return{offset:page.scrollTop,pinned:!!viewport,gap:viewport?head.top-toolbar.getBoundingClientRect().bottom:null,separatorGap:viewport?head.top-separatorBottom:null,headTop:viewport?head.top:null,mounted:table.querySelectorAll('tbody tr[data-record-id]').length,first:table.querySelector('tbody tr[data-record-id]')?.dataset.recordId,innerY:wrap.scrollTop,gaps,topBorder:floating?parseFloat(getComputedStyle(floating).borderTopWidth):null,extraBottom:floating?parseFloat(getComputedStyle(floating).borderBottomWidth):null,cellBorder:cell?parseFloat(getComputedStyle(cell).borderBottomWidth):null};})()`)
  const samples = []
  for (const offset of [0, 200, 600, 1500, 3000, 1200, 400, 0]) {
    const result = await snapshot(offset); samples.push(result)
    assert.ok(result.mounted > 0 && result.mounted < 70, `virtual window bounded: ${JSON.stringify(result)}`)
    assert.equal(result.innerY, 0, 'only the page scrolls vertically')
    assert.deepEqual(result.gaps, [], `no visible virtual spacers: ${JSON.stringify(result)}`)
    if (offset >= 200) {
      assert.equal(result.pinned, true, 'head is docked')
      assert.ok(Math.abs(result.gap - 10) < 0.5, 'head touches the toolbar separator lower edge')
      assert.ok(Math.abs(result.separatorGap) < 0.5, 'head touches separator'); assert.equal(result.topBorder, 0); assert.equal(result.extraBottom, 0); assert.equal(result.cellBorder, 1)
    }
  }
  const group = await evaluate(`(async()=>{const page=document.querySelector('.fsdb-right-body'),wrap=document.querySelector('.tasks-table-wrap');page.scrollTop=100;await new Promise(r=>setTimeout(r,120));const node=wrap.querySelector('.tasks-queue-ghead');const positions=[];for(const x of [0,80,300,600,0]){wrap.scrollLeft=x;const a=node.getBoundingClientRect(),b=wrap.getBoundingClientRect();positions.push({x:wrap.scrollLeft,left:a.left-b.left,right:a.right-b.left});}return positions})()`)
  for (const position of group) { assert.ok(Math.abs(position.left - group[0].left) < 0.5, `group stays fixed: ${JSON.stringify(group)}`); assert.ok(Math.abs(position.right - group[0].right) < 0.5, 'group right edge stays fixed') }
  const interaction = await evaluate(`(async()=>{
    const page=document.querySelector('.fsdb-right-body'),wrap=document.querySelector('.tasks-table-wrap');page.scrollTop=600;await new Promise(r=>setTimeout(r,150));wrap.scrollLeft=220;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const head=document.querySelector('.fsdb-pinned-head-viewport');head.querySelector('th button').click();
    const original=[...wrap.querySelectorAll('thead th')].map(n=>n.getBoundingClientRect().width),floating=[...head.querySelectorAll('th')].map(n=>n.getBoundingClientRect().width);
    window.__retain('r0');window.__reveal('r90');await new Promise(r=>setTimeout(r,250));
    return{x:wrap.scrollLeft,headX:head.scrollLeft,original,floating,clicks:window.__headerClicks,retained:!!wrap.querySelector('tr[data-record-id="r0"]'),revealed:!!wrap.querySelector('tr[data-record-id="r90"]')};})()`)
  assert.equal(interaction.x, interaction.headX); assert.equal(interaction.clicks, 1)
  assert.equal(interaction.original.length, interaction.floating.length)
  interaction.original.forEach((width, index) => assert.ok(Math.abs(width - interaction.floating[index]) < 0.5, `header column ${index} aligned`))
  assert.equal(interaction.retained, true, 'open editor row retained'); assert.equal(interaction.revealed, true, 'keyboard target materialised')
  const columnWindow = await evaluate(`(async()=>{
    const page=document.querySelector('.fsdb-right-body'),wrap=document.querySelector('.tasks-table-wrap');page.scrollTop=600;
    const result=[];
    for(const x of [0,220,800,1300,600,0]){
      wrap.scrollLeft=x;await new Promise(r=>setTimeout(r,90));
      const table=wrap.querySelector('table'),head=document.querySelector('.fsdb-pinned-head-viewport'),bounds=wrap.getBoundingClientRect();
      const source=[...table.querySelectorAll('thead th[data-col-key]')],floating=[...head.querySelectorAll('th[data-col-key]')];
      const frozen=source.filter(n=>n.classList.contains('is-pin-col'));
      const left=Math.max(bounds.left,...frozen.map(n=>n.getBoundingClientRect().right));
      const row=[...table.querySelectorAll('tbody tr[data-record-id]')].find(n=>{const r=n.getBoundingClientRect();return r.bottom>head.getBoundingClientRect().bottom&&r.top<page.getBoundingClientRect().bottom});
      const gaps=[...row.querySelectorAll('.fsdb-col-pad')].map(n=>n.getBoundingClientRect()).filter(r=>Math.min(r.right,bounds.right)-Math.max(r.left,left)>1).length;
      result.push({x:wrap.scrollLeft,count:source.length,keys:source.map(n=>n.dataset.colKey),floatingKeys:floating.map(n=>n.dataset.colKey),aligned:source.every((n,i)=>Math.abs(n.getBoundingClientRect().left-floating[i]?.getBoundingClientRect().left)<0.5&&Math.abs(n.getBoundingClientRect().width-floating[i]?.getBoundingClientRect().width)<0.5),gaps,width:table.getBoundingClientRect().width});
    }
    wrap.scrollLeft=0;window.__revealColumn('field19');await new Promise(r=>setTimeout(r,140));
    const revealed=!!wrap.querySelector('thead th[data-col-key="field19"]');
    window.__resize('field19',260);await new Promise(r=>setTimeout(r,160));
    const resized=wrap.querySelector('thead th[data-col-key="field19"]').getBoundingClientRect().width;
    const floatingResized=document.querySelector('.fsdb-pinned-head-viewport th[data-col-key="field19"]').getBoundingClientRect().width;
    window.__resize('field19',120);window.__revealColumn('field2');await new Promise(r=>setTimeout(r,160));
    return{samples:result,revealed,resized,floatingResized};
  })()`)
  for (const sample of columnWindow.samples) {
    assert.ok(sample.count >= 2 && sample.count < 20, 'bounded column window: '+JSON.stringify(sample))
    assert.deepEqual(sample.keys.slice(0,2), ['title','actions']); assert.deepEqual(sample.keys,sample.floatingKeys)
    assert.equal(sample.aligned,true,'floating header columns align during window changes')
    assert.equal(sample.gaps,0,'no visible horizontal spacers')
    assert.equal(sample.width,columnWindow.samples[0].width,'table extent does not change when columns unmount')
  }
  assert.equal(columnWindow.revealed,true,'keyboard reveals an unmounted column')
  assert.equal(columnWindow.resized,260); assert.equal(columnWindow.floatingResized,260)
  const wrapped = await evaluate(`(async()=>{window.__retain(null);window.__toggleWrap();const page=document.querySelector('.fsdb-right-body');page.scrollTop=500;await new Promise(r=>setTimeout(r,250));const wrap=document.querySelector('.tasks-table-wrap'),table=wrap.querySelector('table'),head=document.querySelector('.fsdb-pinned-head-viewport').getBoundingClientRect(),bounds=page.getBoundingClientRect();return{mounted:table.querySelectorAll('tbody tr[data-record-id]').length,gaps:[...table.querySelectorAll('.fsdb-table-pad')].map(n=>n.getBoundingClientRect()).filter(r=>Math.min(r.bottom,bounds.bottom)-Math.max(r.top,head.bottom)>1).length}})()`)
  assert.ok(wrapped.mounted > 0 && wrapped.mounted < 70); assert.equal(wrapped.gaps, 0, 'wrapped rows do not expose spacers')
  const collapse = await evaluate(`(async()=>{
    const page=document.querySelector('.fsdb-right-body'),wrap=document.querySelector('.tasks-table-wrap');
    page.scrollTop=100;await new Promise(r=>setTimeout(r,150));
    const before=[...wrap.querySelectorAll('.fsdb-check-slot[data-check]')].filter(n=>n.dataset.check!=='head').map(n=>{const row=wrap.querySelector('tr[data-record-id="'+n.dataset.check+'"]');return row?Math.abs(n.getBoundingClientRect().top-row.getBoundingClientRect().top):0});
    wrap.querySelector('tr[data-group="group0"] button').click();await new Promise(r=>setTimeout(r,180));
    const hidden=!wrap.querySelector('tr[data-record-id="r0"]');
    wrap.querySelector('tr[data-group="group0"] button').click();await new Promise(r=>setTimeout(r,180));
    const restored=!!wrap.querySelector('tr[data-record-id="r0"]');
    return{hidden,restored,checkboxMaxError:Math.max(0,...before)};
  })()`)
  assert.equal(collapse.hidden, true); assert.equal(collapse.restored, true); assert.ok(collapse.checkboxMaxError < 1, 'checkbox rail aligns with measured rows')
  const selection = await evaluate(`(async()=>{
    const page=document.querySelector('.fsdb-right-body'),wrap=document.querySelector('.tasks-table-wrap');page.scrollTop=0;
    window.__sparse(true);await new Promise(r=>setTimeout(r,120));
    const gesture=window.__select;gesture('r0','r8');
    window.__sparse(false);await new Promise(r=>setTimeout(r,150));
    const interleaved=Array.from({length:9},(_,i)=>{const row=wrap.querySelector('tr[data-record-id="r'+i+'"]');return row?.querySelectorAll('td.is-cell-on,td.is-cell-range').length??0});
    const members=window.__selectedMembers();
    gesture('r0','r50');page.scrollTop=1600;await new Promise(r=>setTimeout(r,180));
    const visible=[...wrap.querySelectorAll('tbody tr[data-record-id]')].map(row=>({id:row.dataset.recordId,selected:row.querySelectorAll('td.is-cell-on,td.is-cell-range').length}));
    return{interleaved,members,visible};
  })()`)
  assert.deepEqual(selection.interleaved, Array(9).fill(6), 'no alternating holes after async rows load')
  assert.equal(selection.members, 54, 'logical rectangle includes all newly loaded rows')
  for (const row of selection.visible) assert.equal(row.selected, Number(row.id.slice(1)) <= 50 ? 6 : 0, 'selection restored after virtual remount: ' + row.id)
  const occurrences = await evaluate(`(async()=>{
    window.__retain(null);window.__duplicates(true);
    const page=document.querySelector('.fsdb-right-body');page.scrollTop=0;
    await new Promise(r=>setTimeout(r,200));page.scrollTop=400;await new Promise(r=>setTimeout(r,200));
    const available=[...document.querySelectorAll('.tasks-table-wrap tr[data-row-key]')].map(n=>n.dataset.rowKey);
    if(!available.includes('Python:003')||!available.includes('Python:107'))throw new Error(JSON.stringify({scroll:page.scrollTop,available}));
    window.__dragDisplay('Python:003','Python:107');
    const table=document.querySelector('.tasks-table-wrap table');
    const snapshot=()=>[...table.querySelectorAll('tbody tr[data-record-id]')].map(row=>({key:row.dataset.rowKey,selected:row.querySelectorAll('td.is-cell-on,td.is-cell-range').length,focus:row.querySelectorAll('td.is-cell-on').length}));
    const python=snapshot();page.scrollTop=0;await new Promise(r=>setTimeout(r,150));
    const combined=new Map([...python,...snapshot()].map(row=>[row.key,row]));return [...combined.values()];
  })()`)
  for (const id of ['003','004','008','009','101','102','107']) {
    const row=occurrences.find(row=>row.key==='Python:'+id)
    assert.equal(row?.selected,1,'every row inside the screenshot rectangle is selected: '+id)
  }
  assert.equal(occurrences.find(row=>row.key==='React:107')?.selected,1,'matching record in another group stays selected')
  for (const key of ['React:190','React:191','React:196','React:197','Python:108','Python:113']) assert.equal(occurrences.find(row=>row.key===key)?.selected,0,'unrelated row outside rectangle: '+key)
  assert.deepEqual(occurrences.filter(row=>row.focus).map(row=>row.key),['Python:107'],'focus stays on the actual displayed endpoint')
  assert.deepEqual(errors, [], 'no browser exceptions')
  console.log(JSON.stringify({ passed: true, rows: 100, columns: 20, samples, group, interaction: { ...interaction, original: undefined, floating: undefined }, columnWindow, wrapped, collapse, selection, occurrences }, null, 2))
} finally {
  socket?.close(); chrome.kill('SIGTERM'); await new Promise((resolve) => server.close(resolve)); await delay(200)
  await rm(profile, { recursive: true, force: true }).catch(() => {})
}
