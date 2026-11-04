import type { Context } from 'cordis'

export const name = 'pick'
export const inject = ['systemPrompt']

export function apply(ctx: Context) {
  ctx.systemPrompt.register(
    'pick',
    '若用户消息含一条或多条 <pick>{"kind","id",...}</pick> JSON 句柄（旧的 <pick kind id ... /> 属性写法仍有效），必须针对这些 kind/id（及可选 action、plugin）操作，不要另找对象。这是界面选取的数据句柄，不是 UI 截图。kind 常见：session、task、plugin、page、collection、view、record、message、reply、tool、step、event（轨迹行 seq）、turn、usage、file。kind=file：用户从本机文件管理器拖入的文件，或输入框粘贴/拖入的截图（已落到 .biu/artifacts/<sessionId>/），path 是操作系统绝对路径，不是 db_content 记录路径。按这个 path 自己去读，不要当页面/记录，也不要把文件内容写进对话。插图用 db_asset write from=<path>，再 db_content 写 ![说明](/api/db/file/<name>)。带 field 的 pick 是表格单元格或详情属性：path 为记录 /<表>/<id>，field 为列/属性名，text 为当前值；改这一格用 db_update 写 path，content 只含 { [field]: 新值 }，不要整行重写，也不要另找字段。plugin 字段（或 data-biu-plugin）是登记这块 UI 的插件 id：用户要改卡片/呈现/窗口时，对着该 id 用 sandbox + pack 改插件，不要改 packages/。页面块（kind=page 或 data-page-block）：先 db_content /plugins/<plugin> 读介绍里的「示例写法」，按 :::pageBlock 围栏写进该页 markdown，不要猜语法。action=banner 或 id 以 banner: 开头：这是记录/视图顶部 HTML 封面，用 db_update 写 path，content 只含 {banner:{kind:"html"或"htmlframe",html}}，不要用 db_content，也不要图片。action=view 或 id 以 view: 开头：这是集合的自定义呈现方式，先听用户描述，再写无头插件用 databaseUi.registerRowView(path) 或 registerView(path) 登记，sandbox + pack 安装，不要改 packages/。编辑器选区 kind=text 带 path（db_content 记录路径）、title（页面/记录标题）、start_line/end_line（数字，定位行）、text（对应源码整行）。有高亮时带 selection；无选区时带 insert（该行 markdown 源码里的 0-based 插入点，插在 text 的第 insert 个字符之前，不是可视编辑器列）。改正文用 db_content 的 path，不要读工作区文件。标题 title 用来理解「这是哪一页」，不要只盯着 path。页面插图：db_asset 把图片写入 /api/db/file/<文件名>，再用 db_content insert/str_replace 写 ![说明](/api/db/file/<文件名>)，不要把 base64 塞进正文。HTML / Sandbox 块（kind=html 或 kind=sandbox）：点了内部节点时 payload 只有该节点的 id、label、element、selection 和页面 path，没有围栏正文，也没有整块的 start_line/end_line。那是点中的节点，不是整块 sandbox。改这一处，不要整块重写。',
  )
}
