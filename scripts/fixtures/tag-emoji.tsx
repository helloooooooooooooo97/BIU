import { createRoot } from 'react-dom/client'
import { CollectionBrowser } from '../../packages/core-file-system/src/web/browser.tsx'
import { tagsChrome } from '../../packages/core-file-system/src/web/tag-chrome.tsx'
import { RecordDetailBar } from '../../packages/core-editor/src/web/page-detail-bar.tsx'
import { ensureFsdbStyle } from '../../packages/core-file-system/src/web/fsdb-style.ts'
import { REQUIRED_RECORD_FIELDS } from '@biu/type-file-system'
ensureFsdbStyle()
const schema = {labelField:'title',contentField:'notes',fields:{...REQUIRED_RECORD_FIELDS,title:{type:'string',writable:true},notes:{type:'file'},fields:{type:'string'},stampCount:{type:'number'},table:{type:'string'},tablePath:{type:'string'},sourceId:{type:'string'},tagId:{type:'string'}}}
let record = {id:'tag',title:'性能压测',emoji:'',fields:'[]',stampCount:100}
const rows = Array.from({length:100},(_,i)=>({id:`pages::p${i}`,sourceId:`p${i}`,tablePath:'/pages',table:'页面',title:`页面 ${i}`,tagId:'tag'}))
const requests: string[] = []
const releaseLists: Array<() => void> = []
window.fetch = async (path, init) => {
 const url=new URL(String(path),location.origin);requests.push(url.pathname)
 let body:any={}
 if(url.pathname==='/api/profile') body={dataLocation:'device'}
 if(url.pathname==='/api/db/stat') body={schema}
 if(url.pathname==='/api/db/read') body={value:record,schema}
 if(url.pathname==='/api/db/tags') body={tags:[{id:'tag',label:'性能压测',fields:[]}]}
 if(url.pathname==='/api/db/content') body={value:null,version:1}
 if(url.pathname==='/api/db/views') body={views:[]}
 if(url.pathname==='/api/db/list') {if((window as any).__holdList) await new Promise<void>(resolve=>{releaseLists.push(resolve)});const filter=JSON.parse(url.searchParams.get('filter')||'{}');const items=filter.tagId?rows:[record];body={items:items.slice(Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('offset')||0)+Number(url.searchParams.get('limit')||50)),total:items.length,schema}}
 if(url.pathname==='/api/db/update'){record={...record,...JSON.parse(String(init?.body)).content};body={value:record}}
 return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}})
}
const root=createRoot(document.getElementById('root')!)
Object.assign(window,{__requests:requests,__ready:true,__showTagsList:()=>root.render(<CollectionBrowser key="outer" collectionPath="/tags" title="标签" blurb="" chrome={tagsChrome} routeViewId="builtin-all:/tags" />),__releaseList:()=>{(window as any).__holdList=false;releaseLists.splice(0).forEach(resolve=>resolve())}})
root.render(<CollectionBrowser collectionPath="/tags" title="标签" blurb="" chrome={{...tagsChrome,DetailBar:RecordDetailBar}} routeRecordId="tag" routeViewId="builtin-all:/tags" />)
