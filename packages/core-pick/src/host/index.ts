import type { Context } from 'cordis'

export const name = 'pick'
export const inject = ['systemPrompt']

export function apply(ctx: Context) {
  ctx.systemPrompt.register(
    'pick',
    '若用户消息含一条或多条 <pick kind id ... />，必须针对这些 kind/id（及可选 action）操作，不要另找对象。这是界面选取的数据句柄，不是 UI 截图。kind 常见：session、task、plugin、page、collection、view、record、message、reply、tool、step、event（轨迹行 seq）、turn、usage。编辑器选区 kind=text 带 path（db_content 记录路径）、start_line/end_line（定位行）、text（对应源码整行）。有高亮时带 selection；无选区时带 insert（该行 markdown 源码里的 0-based 插入点，插在 text 的第 insert 个字符之前，不是可视编辑器列）。改正文用 db_content 的 path，不要读工作区文件。',
  )
}
