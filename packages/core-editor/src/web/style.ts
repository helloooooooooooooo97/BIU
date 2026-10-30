import { TAG_TONE_ROSE } from '@biu/biu-ui'

export const PAGE_EDITOR_STYLE = `
.page-editor{position:relative;overflow:visible;min-width:0;width:100%;padding:6px 0 48px;padding-left:0;color:var(--biu-color-text);font-family:var(--font-sans);font-size:var(--fsdb-body-size,15px);font-weight:var(--biu-font-weight-regular);line-height:var(--fsdb-body-leading,1.7);letter-spacing:-.003em}
.page-editor-loading{display:flex;align-items:center;justify-content:center;min-height:120px;user-select:none;pointer-events:none}
.page-editor-loading-icon,.page-editor-loading svg{display:block;flex:none;box-sizing:border-box;width:22px;height:22px;max-width:22px;max-height:22px;overflow:hidden;color:var(--biu-color-icon);opacity:0;animation:page-editor-spin .7s linear infinite,page-editor-load-in 0s 150ms forwards}
@keyframes page-editor-spin{to{transform:rotate(360deg)}}
@keyframes page-editor-load-in{to{opacity:1}}
.page-editor-failed{display:flex;flex-direction:column;align-items:flex-start;gap:10px;min-height:120px;padding:16px 0;color:var(--biu-color-text-muted);font-size:var(--biu-font-size-3);user-select:none}
.page-editor-failed p{margin:0}
.page-editor-retry{margin:0;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:8px;padding:6px 10px;background:transparent;color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold);cursor:pointer}
.page-editor-retry:hover{background:var(--biu-color-bg-hover)}
.page-editor.is-source{font-family:var(--font-mono);font-size:var(--biu-font-size-4);letter-spacing:0}
.page-source{min-width:0;width:100%}
.page-source .cm-editor{background:transparent}
.page-source .cm-focused{outline:none}
.page-source .cm-editor.cm-focused>.cm-scroller>.cm-selectionLayer .cm-selectionBackground,.page-source .cm-selectionLayer .cm-selectionBackground{background:color-mix(in srgb,var(--biu-color-emphasis) 40%,transparent)}
.page-editor .tiptap{outline:none;min-height:240px}
.page-block-handle{position:absolute;z-index:6;width:28px;display:flex;flex-direction:column;align-items:center;pointer-events:auto}
.page-block-handle-grip{flex:none;display:flex;align-items:center;justify-content:center;width:22px;height:var(--biu-size-control-md);margin:0;border:0;border-radius:6px;padding:0;background:transparent;color:var(--biu-color-icon);cursor:grab}
.page-block-handle-grip:hover,.page-block-handle-grip:focus-visible{background:var(--biu-color-bg-hover);color:var(--biu-color-icon-active)}
.page-block-handle-grip:active{cursor:grabbing}
.page-block-handle-dots{display:block;width:10px;height:16px;background-image:radial-gradient(circle,currentColor 1.35px,transparent 1.45px);background-size:5px 5.2px;background-position:0 0}
.page-block-handle-menu{position:absolute;left:26px;top:0;z-index:40;min-width:132px;padding:4px;display:flex;flex-direction:column;gap:1px;background:var(--biu-color-bg-subtle);border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:8px;box-shadow:var(--biu-shadow-md)}
.page-block-handle-menu button{display:flex;align-items:center;gap:8px;width:100%;margin:0;border:0;border-radius:6px;padding:6px 8px;background:transparent;color:var(--biu-color-text-muted);font:inherit;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold);text-align:left;cursor:pointer}
.page-block-handle-menu button svg{flex:none;color:var(--biu-color-icon)}
.page-block-handle-menu button:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-text-muted)}
.page-block-handle-menu button:hover svg{color:var(--biu-color-icon)}
.page-editor .tiptap>:first-child{margin-top:0}
.page-editor .tiptap p,.page-editor .tiptap h1,.page-editor .tiptap h2,.page-editor .tiptap h3,.page-editor .tiptap ul,.page-editor .tiptap ol,.page-editor .tiptap blockquote,.page-editor .tiptap pre{margin:2px 0}
.page-editor .tiptap p{min-height:1.7em}
.page-editor .tiptap h1{font-size:1.875em;font-weight:var(--biu-font-weight-bold);line-height:1.3;margin-top:.9em}
.page-editor .tiptap h2{font-size:1.5em;font-weight:var(--biu-font-weight-semibold);line-height:1.3;margin-top:.75em}
.page-editor .tiptap h3{font-size:1.25em;font-weight:var(--biu-font-weight-semibold);line-height:1.3;margin-top:.6em}
.page-editor .tiptap [data-heading-plugin]{border-radius:8px}
.page-editor .react-renderer.node-pageBlock{overflow:hidden;min-width:0}
.page-editor .react-renderer.node-slide{display:block;width:100%;min-width:0;border:0;outline:none;box-shadow:none}
.page-editor .react-renderer.node-slide.ProseMirror-selectednode{outline:none;box-shadow:none}
.page-editor [data-slide]{display:flex;flex-direction:column;width:100%;min-width:0;margin:12px 0;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:12px;background:transparent;overflow:hidden}
.page-editor .page-slide.is-focus{position:fixed;inset:12px;z-index:var(--biu-z-float);margin:0;background:transparent}
.page-editor .page-slide-bar{display:flex;align-items:center;justify-content:flex-end;gap:2px;padding:6px 8px}
.page-editor .page-slide-icon,.page-editor .layout-picker-btn{display:inline-flex;align-items:center;justify-content:center;width:var(--biu-size-control-md);height:var(--biu-size-control-md);margin:0;border:0;border-radius:6px;padding:0;background:transparent;color:var(--biu-color-text-subtle);cursor:pointer}
.page-editor .page-slide-icon:hover,.page-editor .layout-picker-btn:hover,.page-editor .layout-picker-btn.is-on,.page-editor .page-slide-icon:hover svg{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.page-editor .layout-picker-glyph{display:block;width:16px;height:12px}
.layout-picker-menu{z-index:var(--biu-z-dropdown);display:grid;grid-template-columns:repeat(3,minmax(72px,1fr));gap:6px;padding:8px;background:var(--biu-color-bg-subtle);border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:10px;box-shadow:var(--biu-shadow-md);color:var(--biu-color-text-subtle)}
.layout-picker-menu button{display:flex;flex-direction:column;align-items:center;gap:6px;margin:0;border:var(--biu-stroke-width) solid transparent;border-radius:8px;padding:8px 6px 6px;background:transparent;color:inherit;font:inherit;font-size:var(--biu-font-size-1);cursor:pointer}
.layout-picker-menu button .layout-picker-glyph{width:28px;height:20px}
.layout-picker-menu button:hover,.layout-picker-menu button.is-on{background:var(--biu-color-bg-hover);color:var(--biu-color-text);border-color:var(--biu-color-border)}
.page-editor .page-slide-body{display:grid;width:100%;min-width:0;box-sizing:border-box;aspect-ratio:16/9;min-height:280px;padding:16px;gap:12px;background:transparent}
.page-editor .page-slide.is-focus .page-slide-body{aspect-ratio:auto;flex:1;min-height:0}
.page-editor [data-slide][data-layout=split] .page-slide-body,.page-editor [data-slide][data-layout=hero] .page-slide-body{grid-template-columns:1fr 1fr}
.page-editor [data-slide][data-layout=hero] .page-slide-body{grid-template-columns:1.4fr 1fr}
.page-editor [data-slide][data-layout=trio] .page-slide-body{grid-template-columns:1fr 1fr 1fr}
.page-editor [data-slide][data-layout=stack] .page-slide-body,.page-editor [data-slide][data-layout=title] .page-slide-body{grid-template-columns:1fr;grid-template-rows:auto 1fr}
.page-editor [data-slide-cell]{min-width:0;min-height:0;height:100%;overflow:auto;padding:14px 16px;border-radius:10px;border:1px dashed var(--biu-color-border);background:transparent}
.page-editor .page-slide .is-empty::before{content:none}
.page-editor .page-block[data-page-block]{margin:12px 0;position:relative;z-index:0;isolation:isolate;overflow:hidden}
.page-editor .page-block[data-page-block=sandbox]{margin:0}
.page-editor .page-block-idle{min-height:200px}
.page-editor .page-block iframe{pointer-events:none}
.page-editor .page-block.ProseMirror-selectednode iframe,.page-editor .ProseMirror[contenteditable=false] .page-block iframe{pointer-events:auto}
.page-editor .page-block.ProseMirror-selectednode{outline:none;box-shadow:none}
.page-editor .ProseMirror[contenteditable=false] .ProseMirror-selectednode{outline:none;box-shadow:none;background:transparent}
.page-editor .page-block[data-page-block=excalidraw]{outline:none;box-shadow:none;border:0;border-radius:8px}
.page-editor .page-block-missing{display:flex;flex-direction:column;gap:0;padding:12px 14px;border:1px dashed var(--biu-color-border);border-radius:8px;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-3)}
.page-editor .page-block-missing-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 0 10px;margin:0 0 10px;border-bottom:var(--biu-stroke-width) solid var(--biu-color-border)}
.page-editor .page-block-missing-id{font-family:var(--font-mono);font-weight:var(--biu-font-weight-semibold);color:var(--biu-color-text)}
.page-editor .page-block-missing-state{color:var(--biu-color-text-muted);font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold)}
.page-editor .page-block-missing-enable{flex:none;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:22px;height:22px;margin:0;border:0;border-radius:5px;padding:0;background:transparent;color:var(--biu-color-icon);cursor:pointer}
.page-editor .page-block-missing-enable:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-icon-active)}
.page-editor .page-block-missing-enable-icon{display:block;width:14px;height:14px}
.page-editor .tiptap ul,.page-editor .tiptap ol{padding-left:1.6em;list-style-position:outside}
.page-editor .tiptap ul{list-style-type:disc}
.page-editor .tiptap ol{list-style-type:decimal}
.page-editor .tiptap ul ul{list-style-type:circle}
.page-editor .tiptap ul ul ul{list-style-type:square}
.page-editor .tiptap li{display:list-item;margin:1px 0}
.page-editor .tiptap li p{min-height:0;margin:0}
.page-editor .tiptap blockquote{margin-left:0;padding-left:14px;border-left:3px solid var(--biu-color-border);color:var(--biu-color-text-muted)}
.page-editor .tiptap hr{border:0;border-top:var(--biu-stroke-width) solid var(--biu-color-border);margin:18px 0}
.page-editor .tiptap img{display:block;max-width:100%;height:auto;margin:8px 0;border-radius:8px}
.page-editor .page-block[data-page-block=excalidraw] img{margin:0;max-width:none;height:unset;border-radius:0}
.page-editor .page-block[data-page-block=excalidraw] svg,.page-editor .page-block[data-page-block=excalidraw] canvas{display:block;max-width:none;margin:0;border-radius:0}
.page-editor .page-block[data-page-block=excalidraw] .welcome-screen-center{display:none}
.page-editor .page-block[data-page-block=terminal] .pt-scroll-rail{position:absolute;top:4px;right:3px;bottom:4px;width:6px;z-index:12}
.page-editor .tiptap table{width:100%;margin:8px 0;border-collapse:collapse;table-layout:fixed}
.page-editor .tiptap th,.page-editor .tiptap td{border:var(--biu-stroke-width) solid var(--biu-color-border);padding:6px 8px;vertical-align:top}
.page-editor .tiptap th{background:var(--biu-color-bg-hover);font-weight:var(--biu-font-weight-semibold);text-align:left}
.page-editor .tiptap .selectedCell{background:color-mix(in srgb,var(--biu-color-text) 14%,transparent)}
.page-editor .tiptap div[data-type=block-math].tiptap-mathematics-render{margin:8px 0;overflow-x:auto}
.page-editor .tiptap .tiptap-mathematics-render--editable{cursor:pointer}
.page-editor .tiptap span[data-type=inline-math]{display:inline;margin:0;padding:0 .12em;line-height:inherit;vertical-align:baseline;overflow:visible;cursor:pointer}
.page-editor .tiptap span[data-type=inline-math] .katex{font-size:1em}
.page-editor .tiptap .block-math-error,.page-editor .tiptap .inline-math-error{color:var(--biu-color-text-subtle);font-family:var(--font-mono);font-size:var(--biu-font-size-3)}
.page-editor .tiptap code{display:inline;padding:.12em .35em;border-radius:4px;background:var(--biu-color-bg-hover);font-family:var(--font-mono);font-size:.9em}
.page-editor .tiptap pre{position:relative;display:block;margin:8px 0;padding:10px 12px;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:10px;background:var(--biu-color-bg-code,var(--biu-color-bg-subtle));overflow-x:auto;white-space:pre;font-family:var(--font-mono)}
.page-editor .tiptap pre[data-language]::before{content:attr(data-language);display:block;margin:0 0 6px;color:var(--biu-color-text-muted);font-size:var(--biu-font-size-1);font-weight:var(--biu-font-weight-semibold);line-height:1;letter-spacing:.02em}
.page-editor .tiptap pre code,.page-editor .tiptap pre code.hljs{display:block;padding:0;background:transparent;color:inherit;font-size:var(--biu-font-size-3);line-height:1.6;white-space:inherit}
.page-editor pre.page-block-missing-source,.page-block-missing-source{margin:0;max-height:220px;overflow:auto;padding:10px 12px;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:8px;background:var(--biu-color-bg-code,var(--biu-color-bg-subtle));color:var(--biu-color-text-muted);font-size:var(--biu-font-size-2);line-height:1.55;white-space:pre-wrap;word-break:break-word}
.page-block-missing-source .page-source .cm-content{min-height:0}
.page-editor .pb-ui{border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:8px;background:var(--biu-color-bg);color:var(--biu-color-text);font-family:var(--font-sans);font-size:var(--biu-font-size-4);line-height:1.5;padding:10px 12px}
.page-editor .pb-ui-btn{display:inline-flex;align-items:center;height:var(--biu-size-control-md);margin:0;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:6px;padding:0 8px;background:transparent;color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold);cursor:pointer}
.page-editor .pb-ui-btn:hover{background:var(--biu-color-bg-hover)}
.page-editor .pb-ui-input{height:var(--biu-size-control-md);border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:6px;padding:0 8px;background:var(--biu-color-bg-input);color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-3)}
.page-editor .tiptap a{color:var(--biu-color-text);text-underline-offset:2px}
.page-editor .tiptap span.mention,.page-editor .tiptap span.mention:has(.biu-tag){display:inline;padding:0;background:transparent;color:inherit}
.page-editor .tiptap span.mention .biu-tag,.page-editor .tiptap span.mention .composer-tool-chip.is-pick,.page-editor .tiptap span[data-type=mention].biu-tag{height:var(--biu-space-5);line-height:var(--biu-space-5);margin:0 2px;font-size:var(--biu-chat-chip-font-size);cursor:pointer}
.page-slash .pick-kind-icon{flex:none;width:14px;height:14px;color:var(--biu-color-icon)}
.page-slash-item:hover,.page-slash-item.is-active{color:var(--biu-color-text-muted)}
.page-slash-item:hover .page-slash-icon,.page-slash-item.is-active .page-slash-icon,.page-slash-item:hover .pick-kind-icon,.page-slash-item.is-active .pick-kind-icon{color:var(--biu-color-icon)}
.page-editor .tiptap p.is-editor-empty:first-child::before,
.page-editor .tiptap .is-empty::before{content:attr(data-placeholder);float:left;height:0;pointer-events:none;color:var(--biu-color-text-placeholder)}
.page-bubble{z-index:var(--biu-z-float);background:var(--biu-color-bg-subtle);border:var(--biu-stroke-width) solid var(--biu-color-border);box-shadow:var(--biu-shadow-md);border-radius:var(--biu-radius-sm);overflow:hidden}
html:not(.dark) .page-bubble{box-shadow:none}
.page-slash{position:fixed;z-index:10000;width:240px;max-height:min(52vh,280px);padding:4px;display:flex;flex-direction:column;gap:0;overflow:hidden;background:var(--biu-color-bg-subtle);border:var(--biu-stroke-width) solid var(--biu-color-border);box-shadow:var(--biu-shadow-md);border-radius:8px}
.page-slash-head,.page-slash-empty{padding:6px 8px 4px;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-1);font-weight:var(--biu-font-weight-semibold)}
.page-slash-head{flex:none;padding:6px 8px 2px}
.page-slash-list{min-height:0;flex:1;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:1px}
.page-slash-group{display:flex;flex-direction:column;gap:1px}
.page-slash-item{display:flex;align-items:center;gap:8px;width:100%;margin:0;box-sizing:border-box;border:var(--biu-stroke-width) solid transparent;border-radius:6px;padding:4px 6px;background:transparent;color:var(--biu-color-text-muted);font:inherit;text-align:left;cursor:pointer}
.page-slash-item:hover,.page-slash-item.is-active{background:var(--biu-color-bg-hover);border-color:var(--biu-color-border)}
.page-slash-icon{flex:none;display:grid;place-items:center;width:18px;height:18px;border:0;border-radius:0;background:transparent;color:var(--biu-color-icon);font-size:var(--biu-font-size-1);font-weight:var(--biu-font-weight-bold);line-height:1}
.page-slash-label{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold);line-height:1.2}
.page-slash-keys,.page-slash-status{flex:none;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-medium)}
.page-slash-item.is-failed{color:var(--biu-color-danger)}
.page-slash-item.is-failed .page-slash-icon,.page-slash-item.is-failed .page-slash-status{color:var(--biu-color-danger)}
.page-slash-item.is-loading{opacity:.72}
.page-slash-plugin-link{flex:none;color:var(--biu-color-danger);font-size:var(--biu-font-size-1);font-weight:var(--biu-font-weight-semibold);text-decoration:underline}
.page-slash-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none;margin-top:2px;padding:6px 8px 4px;border-top:var(--biu-stroke-width) solid var(--biu-color-border);color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-medium)}
.fsdb-right:has(.page-find-slot){position:relative}
.page-find-slot{position:absolute;right:12px;z-index:40;display:flex;justify-content:flex-end;pointer-events:none}
.page-find{display:flex;justify-content:flex-end;margin:0;pointer-events:none}
.page-find-box{pointer-events:auto;display:flex;align-items:center;gap:4px;min-width:240px;max-width:min(360px,100%);padding:4px 6px;background:var(--biu-color-bg-subtle);border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:8px;box-shadow:var(--biu-shadow-md)}
.page-find-icon{flex:none;width:14px;height:14px;color:var(--biu-color-icon)}
.page-find-input{flex:1 1 auto;min-width:0;margin:0;border:0;padding:4px 4px;background:transparent;color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-3);outline:none}
.page-find-count{flex:none;min-width:2.4em;color:var(--biu-color-text-muted);font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-semibold);text-align:right}
.page-find-btn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;margin:0;border:0;border-radius:5px;padding:0;background:transparent;color:var(--biu-color-icon);cursor:pointer}
.page-find-btn:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-icon-active)}
@keyframes page-agent-edit-fade{
  0%,55%{color:${TAG_TONE_ROSE};background:color-mix(in srgb,${TAG_TONE_ROSE} 22%,transparent)}
  100%{color:inherit;background:transparent}
}
.page-agent-edit{color:${TAG_TONE_ROSE};background:color-mix(in srgb,${TAG_TONE_ROSE} 22%,transparent);border-radius:2px;animation:page-agent-edit-fade 8s ease forwards}
.page-editor .page-agent-edit,.page-editor .page-agent-edit *{color:${TAG_TONE_ROSE}}
.page-source .page-agent-edit{color:${TAG_TONE_ROSE};background:color-mix(in srgb,${TAG_TONE_ROSE} 22%,transparent);border-radius:2px;animation:page-agent-edit-fade 8s ease forwards}
.page-find-hit{color:${TAG_TONE_ROSE};background:color-mix(in srgb,${TAG_TONE_ROSE} 22%,transparent);border-radius:2px}
.page-find-hit.is-current{background:color-mix(in srgb,${TAG_TONE_ROSE} 34%,transparent)}
.page-editor .page-find-hit:not(.page-block),.page-editor .page-find-hit:not(.page-block) *{color:${TAG_TONE_ROSE}}
.page-editor .page-block.page-find-hit{color:inherit;background:transparent;box-shadow:0 0 0 2px color-mix(in srgb,${TAG_TONE_ROSE} 55%,transparent)}
.page-editor .page-block.page-find-hit.is-current{box-shadow:0 0 0 2px ${TAG_TONE_ROSE}}
.page-bubble{display:flex;flex-wrap:wrap;align-items:center;gap:2px;padding:4px;max-width:min(420px,calc(100vw - 48px))}
.page-bubble button{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;margin:0;border:0;border-radius:6px;padding:0 7px;background:transparent;color:var(--biu-color-text-muted);font:inherit;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-bold);cursor:pointer}
.page-bubble button svg{color:var(--biu-color-icon)}
.page-bubble button:hover,.page-bubble button.is-on{background:var(--biu-color-bg-hover)}
.page-bubble button:hover{color:var(--biu-color-text-muted)}
.page-bubble button:hover svg{color:var(--biu-color-icon)}
.page-bubble button.is-on{color:var(--biu-color-text)}
.page-bubble-chat{gap:4px;padding:0 8px}
.page-bubble-chat-icon{display:block;width:14px;height:14px;flex:none;color:var(--biu-color-icon)}
.page-bubble-letter{font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-bold);line-height:1;border-bottom:2px solid currentColor;color:var(--biu-color-text-muted)}
.page-color-menu{z-index:var(--biu-z-dropdown);width:248px;padding:16px 16px 18px;background:var(--biu-color-bg-elevated);border:0;border-radius:16px;box-shadow:var(--biu-shadow-md)}
.page-color-recent-h,.page-color-menu-h{display:flex;align-items:center;justify-content:space-between;padding:0 4px;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-regular)}
.page-color-menu-h{margin:18px 0 10px}
.page-color-kbd{color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-3);letter-spacing:.02em}
.page-color-recent{display:flex;padding:12px 4px 4px}
.page-color-grid{display:grid;grid-template-columns:repeat(5,32px);gap:12px 14px;justify-content:space-between}
.page-color-grid button,.page-color-recent button{position:relative;min-width:0;width:32px;height:32px;padding:0;border:var(--biu-stroke-width) solid color-mix(in srgb,var(--biu-color-text-subtle) 28%,transparent);border-radius:var(--biu-radius-full);background:transparent;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold);line-height:1;cursor:pointer}
.page-color-grid button.is-on,.page-color-recent button.is-on{box-shadow:0 0 0 2px var(--biu-color-bg-elevated),0 0 0 3.5px var(--biu-color-text-subtle)}
.page-color-none::after{content:"";position:absolute;inset:50% auto auto 50%;width:1px;height:18px;background:var(--biu-color-text-subtle);transform:translate(-50%,-50%) rotate(-45deg)}
.page-color-wash{border-color:transparent}
.page-math-pop{position:fixed;z-index:10000;min-width:220px;max-width:min(360px,calc(100vw - 16px));padding:6px 8px;background:var(--biu-color-bg-subtle);border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:8px;box-shadow:var(--biu-shadow-md)}
.page-math-pop-input{display:block;width:100%;margin:0;border:0;padding:2px 0;background:transparent;color:var(--biu-color-text);font-family:var(--font-mono);font-size:var(--biu-font-size-3);line-height:1.45;outline:none;resize:none}
.page-editor .tiptap mark{border-radius:2px;padding:0 .08em}
.page-blocks-view{min-width:0;min-height:0;flex:1;overflow:auto;padding:8px 12px 32px;display:flex;flex-direction:column;gap:20px}
.page-blocks-view-card{min-width:0;display:flex;flex-direction:column;gap:8px}
.page-blocks-view-head{display:flex;align-items:center;gap:10px;min-width:0}
.page-blocks-view-title{flex:1;min-width:0;margin:0;border:0;padding:0;background:transparent;color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold);outline:none;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.page-blocks-view-meta{display:flex;align-items:center;gap:6px;flex:none;margin-left:auto}
.page-blocks-view-kind{color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-semibold)}
.page-blocks-view-page{max-width:220px;margin:0;border:0;padding:2px 0;background:transparent;color:var(--biu-color-text-muted);font:inherit;font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-semibold);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.page-blocks-view-page:hover{color:var(--biu-color-text)}
.page-blocks-view-zoom,.page-blocks-view-open{display:inline-flex;align-items:center;justify-content:center;width:var(--biu-size-control-md);height:var(--biu-size-control-md);margin:0;border:0;padding:0;border-radius:6px;background:transparent;color:var(--biu-color-text-subtle);cursor:pointer}
.page-blocks-view-zoom:hover,.page-blocks-view-open:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.page-blocks-view-zoom svg,.page-blocks-view-open svg{width:14px;height:14px}
.page-blocks-view .page-block{margin:0}
.page-blocks-view .page-block iframe{pointer-events:auto}
.page-blocks-detail{padding:0 0 32px}
html[data-body-size=sm]{--fsdb-body-size:14px}
html[data-body-size=lg]{--fsdb-body-size:17.5px}
html[data-body-gap=sm]{--fsdb-body-leading:1.5}
html[data-body-gap=lg]{--fsdb-body-leading:1.9}
html[data-body-gap=sm] .page-editor .tiptap p,html[data-body-gap=sm] .page-editor .tiptap h1,html[data-body-gap=sm] .page-editor .tiptap h2,html[data-body-gap=sm] .page-editor .tiptap h3,html[data-body-gap=sm] .page-editor .tiptap ul,html[data-body-gap=sm] .page-editor .tiptap ol,html[data-body-gap=sm] .page-editor .tiptap blockquote,html[data-body-gap=sm] .page-editor .tiptap pre{margin:0}
html[data-body-gap=lg] .page-editor .tiptap p,html[data-body-gap=lg] .page-editor .tiptap h1,html[data-body-gap=lg] .page-editor .tiptap h2,html[data-body-gap=lg] .page-editor .tiptap h3,html[data-body-gap=lg] .page-editor .tiptap ul,html[data-body-gap=lg] .page-editor .tiptap ol,html[data-body-gap=lg] .page-editor .tiptap blockquote,html[data-body-gap=lg] .page-editor .tiptap pre{margin:8px 0}
html[data-body-gap=sm] .page-editor .tiptap p{min-height:1.45em}
html[data-body-gap=lg] .page-editor .tiptap p{min-height:2em}
html:not(.dark) .page-block-handle-menu button,
html:not(.dark) .page-block-handle-menu button:hover,
html:not(.dark) .page-slash-item,
html:not(.dark) .page-slash-item:hover,
html:not(.dark) .page-slash-item.is-active,
html:not(.dark) .page-slash-label,
html:not(.dark) .page-bubble button:not(.is-on),
html:not(.dark) .page-bubble-letter{color:var(--biu-color-text-muted)}
html:not(.dark) .page-block-handle-menu button svg,
html:not(.dark) .page-block-handle-menu button:hover svg,
html:not(.dark) .page-slash-icon,
html:not(.dark) .page-slash-icon svg,
html:not(.dark) .page-slash .pick-kind-icon,
html:not(.dark) .page-slash-item:hover .page-slash-icon,
html:not(.dark) .page-slash-item.is-active .page-slash-icon,
html:not(.dark) .page-bubble button:not(.is-on) svg,
html:not(.dark) .page-bubble-chat-icon{color:var(--biu-color-icon)}
`
