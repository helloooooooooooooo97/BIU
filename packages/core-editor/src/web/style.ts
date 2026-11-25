import { TAG_TONE_ROSE } from '@biu/biu-ui'

export const PAGE_EDITOR_STYLE = `
.page-editor{position:relative;overflow:visible;min-width:0;width:100%;padding:6px 0 max(120px,24vh);padding-left:0;color:var(--biu-color-text);font-family:var(--font-sans);font-size:var(--fsdb-body-size,15px);font-weight:var(--biu-font-weight-regular);line-height:var(--fsdb-body-leading,1.7);letter-spacing:-.003em;--page-outline-step:22px;--page-outline-icon:14px;--page-outline-gap:8px;--page-outline-line:color-mix(in srgb,var(--biu-color-border) 88%,transparent);--page-outline-dot:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14'%3E%3Ccircle cx='7' cy='7' r='2.15' fill='black'/%3E%3C/svg%3E");--page-outline-chevron:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14' fill='none'%3E%3Cpath d='M3.2 5.2 7 9l3.8-3.8' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")}
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
.page-editor .tiptap{outline:none;min-height:0}
.page-editor .tiptap ::selection{background:color-mix(in srgb,var(--biu-color-emphasis) 28%,transparent)}
html.dark .page-editor .tiptap ::selection{background:color-mix(in srgb,var(--biu-color-emphasis) 36%,transparent)}
.page-editor .editor-pending-selection{background:color-mix(in srgb,var(--biu-color-emphasis) 28%,transparent);border-radius:2px}
html.dark .page-editor .editor-pending-selection{background:color-mix(in srgb,var(--biu-color-emphasis) 36%,transparent)}
.page-editor.is-table .page-editor-doc,.page-editor.is-host .page-editor-doc{display:none}
.page-host-view{position:relative;display:flex;flex-direction:column;min-width:0;width:100%;min-height:min(72vh,720px);overflow:visible;box-sizing:border-box;background:var(--biu-color-bg)}
.page-prop-host{min-height:min(36vh,360px);margin:0 0 8px}
.page-prop-host-field{box-sizing:border-box;width:100%;min-width:0;margin:0}
.page-prop-host-field .fsdb-pop-host,.page-prop-host-field .db-datetime{width:100%;min-width:0}
.page-host-view .page-block{color:var(--biu-color-text);font-family:var(--font-sans);font-size:var(--fsdb-body-size,15px);font-weight:var(--biu-font-weight-regular);line-height:var(--fsdb-body-leading,1.7);letter-spacing:-.003em}
.page-host-view.is-expanded{position:fixed;inset:0;z-index:var(--biu-z-modal);min-height:0;height:100%;max-width:none;overflow:visible;pointer-events:auto;isolation:isolate}
.page-block-expand-nav,.page-editor .page-block-expand-nav{position:relative;top:auto;right:auto;left:auto;flex:none;display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;height:var(--biu-size-control-lg);min-height:var(--biu-size-control-lg);max-height:var(--biu-size-control-lg);width:100%;box-sizing:border-box;padding:0 4px;border:0;border-radius:0;background:var(--biu-color-bg-subtle);box-shadow:none;opacity:1;overflow:hidden;z-index:0;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-medium);line-height:var(--biu-size-control-lg)}
.page-host-view:not(.is-expanded)>.page-block-expand-nav,[data-testid=page-sandbox-block]>.page-block-expand-nav,[data-testid=page-excalidraw]>.page-block-expand-nav,[data-testid=page-html-direct]>.page-block-expand-nav,[data-testid=page-html-frame]>.page-block-expand-nav,[data-slide]>.page-block-expand-nav{border-top-left-radius:0;border-top-right-radius:0}
.page-block-expand-nav-type,.page-editor .page-block-expand-nav-type{display:grid;place-items:center;justify-self:start;grid-column:1;width:24px;height:24px;color:var(--biu-color-icon-active)}
.page-block-expand-nav-title,.page-editor .page-block-expand-nav-title{justify-self:center;grid-column:2;box-sizing:border-box;min-width:4rem;max-width:min(560px,92%);height:24px;margin:0;border:0;border-radius:6px;padding:0 8px;background:transparent;color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-medium);line-height:24px;text-align:center;outline:none;overflow:hidden}
.page-block-expand-nav-title:hover,.page-block-expand-nav-title:focus,.page-editor .page-block-expand-nav-title:hover,.page-editor .page-block-expand-nav-title:focus{background:var(--biu-color-bg-hover)}
.page-block-expand-nav-title:read-only{cursor:default}
.page-block-expand-nav-tools{display:flex;align-items:center;justify-self:end;grid-column:3;gap:0}
.page-host-stage{flex:1;min-height:0;display:flex;overflow:hidden}
.page-host-preview-pane{position:relative;flex:1;min-width:0;overflow:auto}
.page-host-code-pane{position:relative;flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden}
.page-host-code-pane.is-split{border-left:var(--biu-stroke-width) solid var(--biu-color-border)}
.sandbox-split-resize{position:absolute;inset-block:0;right:-1px;z-index:10;width:0;cursor:col-resize;touch-action:none}
.sandbox-split-resize::after{content:"";position:absolute;inset-block:0;right:-3px;width:7px}
.page-host-code-pane .page-source,.page-host-code-pane .page-source .cm-editor{flex:1;min-height:0;height:100%}
.page-host-code-pane .cm-scroller{overflow:auto}
.page-host-compile{flex:none;margin:6px 8px 8px;font-size:11px;color:var(--biu-color-ok)}
.page-host-compile[data-ok='0']{color:var(--biu-color-danger)}
.page-host-error,.page-host-missing{padding:12px 0;color:var(--biu-color-danger);font-size:var(--biu-font-size-3)}
.page-editor.is-table .page-blocks-table-preview .tiptap{display:block;min-height:4em}
.page-editor .page-blocks-table-wrap{width:100%;min-width:0;overflow:visible}
.page-editor .page-blocks-table-wrap .tasks-table{width:100%}
.page-editor .page-blocks-table-wrap .tasks-table.is-wrap th,.page-editor .page-blocks-table-wrap .tasks-table.is-wrap td{vertical-align:middle}
.page-editor .page-blocks-table-wrap th:nth-child(1),.page-editor .page-blocks-table-wrap td:nth-child(1){width:8.5rem;white-space:nowrap}
.page-editor .page-blocks-table-wrap th:nth-child(2),.page-editor .page-blocks-table-wrap td:nth-child(2){width:9.5rem;white-space:nowrap}
.page-editor .page-blocks-table-wrap th:nth-child(4),.page-editor .page-blocks-table-wrap td:nth-child(4){width:12rem;white-space:normal}
.page-editor .page-blocks-table-tag{display:flex;flex-wrap:wrap;align-items:center;gap:4px;min-width:0}
.page-editor .page-blocks-table-tag-add{margin:0;border:0;border-radius:6px;padding:2px 6px;background:transparent;color:var(--biu-color-text-subtle);font:inherit;font-size:var(--biu-font-size-2);cursor:pointer}
.page-editor .page-blocks-table-tag-add:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.page-editor .page-blocks-table-tag-menu{min-width:180px;max-height:min(50vh,280px);overflow:auto;padding:6px;display:flex;flex-direction:column;gap:2px;background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);box-shadow:var(--biu-shadow-popover)}
.page-editor .page-blocks-table-tag-option{display:flex;width:100%;margin:0;border:0;border-radius:6px;padding:6px 8px;background:transparent;color:var(--biu-color-text-muted);font:inherit;font-size:var(--biu-font-size-4);text-align:left;cursor:pointer}
.page-editor .page-blocks-table-tag-option:hover,.page-editor .page-blocks-table-tag-option.is-on{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.page-editor .page-blocks-table-tag-empty{padding:6px 8px;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-3)}
.page-editor .page-blocks-table-wrap .tasks-th,.page-editor .page-blocks-table-wrap .fsdb-cell,.page-editor .page-blocks-table-wrap .page-blocks-table-content,.page-editor .page-blocks-table-wrap .page-blocks-table-id{color:var(--biu-color-text)}
.page-editor .page-blocks-table-kind{display:inline-flex;align-items:center;gap:5px;min-width:0;max-width:100%;margin:0;border:0;padding:0;background:transparent;color:var(--biu-color-text);font:inherit;font-weight:var(--biu-font-weight-medium);line-height:1;cursor:pointer}
.page-editor .page-blocks-table-kind-swap{position:relative;display:inline-grid;place-items:center;width:14px;height:14px;flex:none}
.page-editor .page-blocks-table-kind-swap svg{display:block;width:14px;height:14px;color:var(--biu-color-icon)}
.page-editor .page-blocks-table-kind-type,.page-editor .page-blocks-table-kind-expand{grid-area:1/1}
.page-editor .page-blocks-table-kind-expand{opacity:0}
.page-editor .page-blocks-table-wrap tr:hover .page-blocks-table-kind-type,.page-editor .page-blocks-table-wrap tr.is-open .page-blocks-table-kind-type{opacity:0}
.page-editor .page-blocks-table-wrap tr:hover .page-blocks-table-kind-expand,.page-editor .page-blocks-table-wrap tr.is-open .page-blocks-table-kind-expand{opacity:1}
.page-editor .page-blocks-table-id{font-family:var(--font-mono);font-size:var(--biu-font-size-4)}
.page-editor .page-blocks-table-content{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.page-editor .page-blocks-table-expand td{vertical-align:top;white-space:normal}
.page-editor .page-blocks-table-preview{max-height:min(28rem,60vh);overflow:auto;padding:4px 0;border:0;border-radius:0;background:transparent;color:var(--biu-color-text);box-shadow:none}
.page-editor .page-blocks-table-preview .tiptap{min-height:4em;outline:none}
.page-editor .page-block-is-hidden,.page-editor .tiptap>.page-block-is-hidden,.page-editor.is-outline .tiptap>.page-outline-block.page-block-is-hidden,.page-editor.is-outline .tiptap>pre.page-outline-block.page-block-is-hidden,.page-editor.is-outline .tiptap>table.page-outline-block.page-block-is-hidden,.page-editor.is-outline .tiptap>blockquote.page-outline-block.page-block-is-hidden,.page-editor.is-outline .tiptap>img.page-outline-block.page-block-is-hidden,.page-editor.is-outline .tiptap>.react-renderer.page-block-is-hidden,.page-editor.is-outline .tiptap>.page-block.page-block-is-hidden{display:none}
.page-editor .tiptap:has(> .page-block-is-sorted){display:flex;flex-direction:column}
.page-editor.is-outline .tiptap>ul.page-outline-block::after,.page-editor.is-outline .tiptap>ol.page-outline-block::after{content:none}
.page-editor.is-outline .tiptap>.page-outline-block{--page-outline-indent:calc(var(--page-outline-icon) + var(--page-outline-gap) + var(--page-outline-depth,0)*var(--page-outline-step));position:relative;box-sizing:border-box;width:calc(100% - var(--page-outline-indent));max-width:calc(100% - var(--page-outline-indent));margin:0 0 0 var(--page-outline-indent);padding-top:6px;padding-bottom:6px}
.page-editor.is-outline .tiptap>h1.page-outline-block,.page-editor.is-outline .tiptap>h2.page-outline-block,.page-editor.is-outline .tiptap>h3.page-outline-block,.page-editor.is-outline .tiptap>p.page-outline-block,.page-editor.is-outline .tiptap>ul.page-outline-block,.page-editor.is-outline .tiptap>ol.page-outline-block,.page-editor.is-outline .tiptap>pre.page-outline-block,.page-editor.is-outline .tiptap>blockquote.page-outline-block,.page-editor.is-outline .tiptap>.react-renderer.page-outline-block,.page-editor.is-outline .tiptap>.page-block.page-outline-block,.page-editor.is-outline .tiptap>.page-image-node{margin-top:0;margin-bottom:0}
.page-editor.is-outline .tiptap>.page-outline-block::before,.page-editor.is-outline .tiptap>.page-outline-block.is-empty::before,.page-editor.is-outline .tiptap>.page-outline-block.is-editor-empty::before{content:"";position:absolute;left:calc(-1 * var(--page-outline-indent) + var(--page-outline-icon)/2 - .5px);top:0;bottom:0;width:calc(var(--page-outline-depth,0)*var(--page-outline-step));background-image:repeating-linear-gradient(to right,var(--page-outline-line) 0 1px,transparent 1px var(--page-outline-step));background-repeat:no-repeat;pointer-events:none;float:none;height:auto;color:transparent}
.page-editor.is-outline .tiptap>.page-outline-block.is-empty::before,.page-editor.is-outline .tiptap>.page-outline-block.is-editor-empty::before{width:calc(var(--page-outline-depth,0)*var(--page-outline-step) + var(--page-outline-icon));background-image:radial-gradient(circle 2.15px at 50% 50%,var(--biu-color-icon) 100%,transparent 101%),repeating-linear-gradient(to right,var(--page-outline-line) 0 1px,transparent 1px var(--page-outline-step));background-size:var(--page-outline-icon) var(--page-outline-icon),calc(var(--page-outline-depth,0)*var(--page-outline-step)) 100%;background-position:calc(var(--page-outline-depth,0)*var(--page-outline-step) - var(--page-outline-icon)/2) calc((1.7em - var(--page-outline-icon))/2 + 4px),0 0;background-repeat:no-repeat}
.page-editor.is-outline .tiptap>h1.page-outline-block.is-empty::before,.page-editor.is-outline .tiptap>h1.page-outline-block.is-editor-empty::before,.page-editor.is-outline .tiptap>h2.page-outline-block.is-empty::before,.page-editor.is-outline .tiptap>h2.page-outline-block.is-editor-empty::before,.page-editor.is-outline .tiptap>h3.page-outline-block.is-empty::before,.page-editor.is-outline .tiptap>h3.page-outline-block.is-editor-empty::before{background-position:calc(var(--page-outline-depth,0)*var(--page-outline-step) - var(--page-outline-icon)/2) calc((1.3em - var(--page-outline-icon))/2 + 4px),0 0}
.page-editor.is-outline .tiptap>.page-outline-block::after{content:"";position:absolute;left:calc(-1 * (var(--page-outline-icon) + var(--page-outline-gap)));top:calc((1.7em - var(--page-outline-icon))/2 + 4px);width:var(--page-outline-icon);height:var(--page-outline-icon);background:var(--biu-color-icon);-webkit-mask:var(--page-outline-dot) center / 14px 14px no-repeat;mask:var(--page-outline-dot) center / 14px 14px no-repeat;pointer-events:none}
.page-editor.is-outline .tiptap>.page-outline-block.is-empty::after,.page-editor.is-outline .tiptap>.page-outline-block.is-editor-empty::after{content:attr(data-placeholder);left:0;top:6px;width:auto;max-width:100%;height:auto;color:var(--biu-color-text-placeholder);background:none;-webkit-mask:none;mask:none}
.page-editor.is-outline .tiptap>h1.page-outline-block::after,.page-editor.is-outline .tiptap>h2.page-outline-block::after,.page-editor.is-outline .tiptap>h3.page-outline-block::after{top:calc((1.3em - var(--page-outline-icon))/2 + 4px)}
.page-editor.is-outline .tiptap>.page-outline-heading.has-fold:not([data-outline-folded=true]){background-image:linear-gradient(var(--page-outline-line),var(--page-outline-line));background-size:1px calc(100% - 6px - 1.3em);background-position:calc(-1 * (var(--page-outline-icon) + var(--page-outline-gap)) + var(--page-outline-icon)/2 - .5px) calc(6px + 1.3em);background-repeat:no-repeat}
.page-editor.is-outline .tiptap>.page-outline-heading.has-fold::after{pointer-events:auto;cursor:pointer;transition:transform 150ms cubic-bezier(.22,1,.36,1),opacity 120ms ease}
.page-editor.is-outline .tiptap>.page-outline-heading.has-fold:hover:not(:has(:hover))::after,.page-editor.is-outline .tiptap>.page-outline-heading.has-fold[data-outline-folded=true]::after{background:var(--biu-color-icon-active);-webkit-mask-image:var(--page-outline-chevron);mask-image:var(--page-outline-chevron)}
.page-editor.is-outline .tiptap>.page-outline-heading.has-fold[data-outline-folded=true]::after{transform:rotate(-90deg)}
.page-block-handle{position:absolute;top:0;left:0;z-index:6;width:28px;display:flex;flex-direction:column;align-items:center;pointer-events:none;transition:transform 110ms cubic-bezier(.22,1,.36,1),opacity 110ms ease;animation:page-handle-in 110ms ease}
@keyframes page-handle-in{from{opacity:0}to{opacity:1}}
.page-block-handle-grip{flex:none;display:flex;align-items:center;justify-content:center;width:22px;height:var(--biu-size-control-md);margin:0;border:0;border-radius:6px;padding:0;background:transparent;color:var(--biu-color-icon);cursor:grab;pointer-events:auto}
.page-block-handle-grip:hover,.page-block-handle-grip:focus-visible{background:var(--biu-color-bg-hover);color:var(--biu-color-icon-active)}
.page-block-handle-grip:active{cursor:grabbing}
.page-block-handle-dots{display:block;width:10px;height:16px;background-image:radial-gradient(circle,currentColor 1.35px,transparent 1.45px);background-size:5px 5.2px;background-position:0 0}
.page-block-handle-menu{position:absolute;left:26px;top:0;z-index:40;min-width:132px;padding:4px;display:flex;flex-direction:column;gap:1px;background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);box-shadow:var(--biu-shadow-popover);pointer-events:auto;animation:page-menu-in 120ms cubic-bezier(.22,1,.36,1)}
@keyframes page-menu-in{from{opacity:0;transform:scale(.97) translateY(3px)}to{opacity:1;transform:none}}
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
.page-editor .react-renderer.node-editorBlock{overflow:hidden;min-width:0;outline:none;box-shadow:none;border-radius:0}
.page-editor .react-renderer.node-editorBlock.ProseMirror-selectednode{outline:none;box-shadow:none;border-radius:0}
.page-editor .react-renderer.node-slide{display:block;position:relative;width:100%;min-width:0;border:0;outline:none;box-shadow:none;overflow:visible}
.page-editor .react-renderer.node-slide.ProseMirror-selectednode{outline:none;box-shadow:none;border-radius:0}
.page-editor [data-slide]{display:flex;flex-direction:column;position:relative;width:100%;min-width:0;margin:12px 0;box-sizing:border-box;border:0;border-radius:0;background:transparent;overflow:visible}
.page-editor [data-slide]:focus-within{outline:none}
.page-editor [data-slide].is-selected,.page-editor .react-renderer.node-slide.ProseMirror-selectednode [data-slide],.page-editor [data-slide-selected]{outline:none;border-radius:0;box-shadow:0 0 0 2px var(--biu-color-emphasis)}
.page-editor .page-slide.is-focus{position:fixed;inset:12px;z-index:var(--biu-z-float);margin:0}
.page-editor .page-slide.is-focus:not(.has-bg){background:var(--biu-color-bg)}
.page-slide-bar,.page-editor .page-slide-bar{position:absolute;top:8px;right:8px;left:auto;z-index:8;display:flex;flex-direction:row;align-items:center;justify-content:flex-end;gap:2px;width:auto;margin:0;padding:4px;border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:8px;background:var(--biu-color-bg-popover);box-shadow:var(--biu-shadow-popover);opacity:0;pointer-events:auto;transition:opacity 120ms ease}
.page-slide-bar::before,.page-editor .page-slide-bar::before{content:"";position:absolute;left:0;right:0;top:100%;bottom:auto;width:auto;height:8px}
.page-editor .react-renderer.node-slide:hover .page-slide-bar,.page-editor [data-slide]:hover>.page-slide-bar,.page-editor [data-slide]:focus-within>.page-slide-bar,.page-editor .page-slide-bar:hover,.page-editor .page-slide-bar:focus-within,.page-editor .page-slide-bar:has([aria-expanded=true]),.page-editor .page-slide.is-focus>.page-slide-bar{opacity:1}
.page-editor .page-slide-bar>*{display:grid;place-items:center;width:var(--biu-size-control-md);height:var(--biu-size-control-md);flex:none}
.page-editor .page-slide-icon,.page-editor .layout-picker-btn{position:relative;display:grid;place-items:center;place-content:center;box-sizing:border-box;width:var(--biu-size-control-md);height:var(--biu-size-control-md);margin:0;border:0;border-radius:6px;padding:0;line-height:0;background:transparent;color:var(--biu-color-icon);cursor:pointer}
.page-editor .page-slide-icon:hover,.page-editor .layout-picker-btn:hover,.page-editor .layout-picker-btn.is-on,.page-editor .page-slide-icon.is-on{background:var(--biu-color-bg-hover);color:var(--biu-color-icon-active)}
.page-editor .page-slide-icon.is-deck,.page-editor .page-slide-icon.is-deck:hover{color:var(--biu-tag,var(--biu-color-ink-blue));background:transparent}
.page-editor .page-slide-ico,.page-editor .page-slide-icon svg,.page-editor .layout-picker-btn svg{display:block;width:16px;height:16px;margin:0;flex:none}
.page-editor .page-slide-bg-dot{position:absolute;right:3px;bottom:3px;width:6px;height:6px;border-radius:99px;box-shadow:0 0 0 1.5px var(--biu-color-bg-popover)}
.page-editor .layout-picker-glyph{display:block;width:16px;height:16px}
.page-editor .page-block-expand-nav .page-slide-icon,.page-editor .page-block-expand-nav .layout-picker-btn,.page-block-expand-nav .page-slide-icon,.page-block-expand-nav .layout-picker-btn{display:grid;place-items:center;place-content:center;box-sizing:border-box;width:24px;height:24px;margin:0;border:0;border-radius:6px;padding:0;line-height:0;background:transparent;color:var(--biu-color-icon);cursor:pointer}
.page-block-expand-nav .page-slide-icon:hover,.page-block-expand-nav .page-slide-icon.is-on,.page-editor .page-block-expand-nav .page-slide-icon.is-on,.page-block-expand-nav .page-slide-icon.is-deck,.page-editor .page-block-expand-nav .page-slide-icon.is-deck{background:var(--biu-color-bg-hover);color:var(--biu-color-icon-active)}
.page-editor .page-block-expand-nav svg,.page-editor .page-block-expand-nav .page-slide-ico,.page-editor .page-block-expand-nav .page-slide-icon svg,.page-editor .page-block-expand-nav .layout-picker-btn svg,.page-editor .page-block-expand-nav .layout-picker-glyph,.page-block-expand-nav svg,.page-block-expand-nav .page-slide-ico{display:block;width:var(--biu-size-icon);height:var(--biu-size-icon);min-width:var(--biu-size-icon);min-height:var(--biu-size-icon);max-width:var(--biu-size-icon);max-height:var(--biu-size-icon);margin:0;flex:none}
.layout-picker-menu{z-index:var(--biu-z-dropdown);display:grid;grid-template-columns:repeat(3,minmax(76px,1fr));gap:8px;padding:10px;background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);box-shadow:var(--biu-shadow-popover);color:var(--biu-color-text-subtle)}
.layout-picker-menu button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;margin:0;border:var(--biu-stroke-width) solid transparent;border-radius:10px;padding:10px 8px 8px;background:transparent;color:inherit;font:inherit;font-size:var(--biu-font-size-1);cursor:pointer}
.layout-picker-menu button .layout-picker-glyph{width:24px;height:16px}
.layout-picker-menu button:hover,.layout-picker-menu button.is-on{background:var(--biu-color-bg-hover);color:var(--biu-color-text);border-color:var(--biu-color-border)}
.page-editor .page-slide-body{display:grid;width:100%;min-width:0;box-sizing:border-box;height:auto;padding:16px;gap:12px;background:transparent;align-items:stretch}
.page-editor .page-slide-body>[data-node-view-content-react],.page-editor .page-slide-body>[data-node-view-wrapper]{display:contents}
.page-editor .page-slide.is-focus .page-slide-body{flex:1;min-height:0;align-items:stretch}
.page-editor [data-slide][data-layout=split] .page-slide-body,.page-editor [data-slide][data-layout=hero] .page-slide-body{grid-template-columns:1fr 1fr}
.page-editor [data-slide][data-layout=hero] .page-slide-body{grid-template-columns:1.4fr 1fr}
.page-editor [data-slide][data-layout=trio] .page-slide-body{grid-template-columns:1fr 1fr 1fr}
.page-editor [data-slide][data-layout=title] .page-slide-body,.page-editor [data-slide][data-layout=stack] .page-slide-body{grid-template-columns:1fr;grid-auto-rows:auto}
.page-editor [data-slide-cell]{display:flex;flex-direction:column;justify-content:flex-start;min-width:0;min-height:4.5em;height:auto;overflow:visible;padding:14px 16px;border-radius:10px;border:1px dashed var(--biu-color-border);background:transparent}
.page-editor [data-slide-cell]:has(>:only-child.is-empty),.page-editor [data-slide-cell]:has(>:only-child.is-editor-empty){justify-content:center}
.page-editor [data-slide-cell]>:first-child,.page-editor [data-slide-cell]>h1,.page-editor [data-slide-cell]>h2,.page-editor [data-slide-cell]>h3{margin-top:0}
.page-editor [data-slide-cell]>:only-child.is-empty,.page-editor [data-slide-cell]>:only-child.is-editor-empty{flex:none;width:100%}
.page-editor .page-slide.is-focus [data-slide-cell]{height:100%;min-height:0;overflow:auto}
.page-editor .page-slide .is-empty::before{content:none}
.page-editor .page-block[data-page-block]{margin:12px 0;position:relative;z-index:0;isolation:isolate;overflow:hidden}
.page-editor .page-block[data-page-block=sandbox]{margin:0}
.page-editor .page-block[data-page-block=html],.page-editor .page-block[data-page-block=htmlframe],.page-editor .page-block[data-page-block=sandbox],.page-editor .page-block[data-page-block=database],.page-editor .react-renderer.node-editorBlock:has([data-page-block=html]),.page-editor .react-renderer.node-editorBlock:has([data-page-block=htmlframe]),.page-editor .react-renderer.node-editorBlock:has([data-page-block=sandbox]),.page-editor .react-renderer.node-editorBlock:has([data-page-block=database]){overflow:visible}
.page-editor .page-block[data-page-block=html] [data-testid=page-html-direct],.page-editor .page-block[data-page-block=htmlframe] [data-testid=page-html-frame],.page-editor .page-block[data-page-block=excalidraw] [data-testid=page-excalidraw],.page-editor .page-block[data-page-block=sandbox] [data-testid=page-sandbox-block],[data-testid=page-sandbox-block]{box-sizing:border-box;outline:none;border:0;border-radius:0;box-shadow:none}
.page-editor [data-testid=page-sandbox-preview],.page-editor [data-sandbox],.page-editor [data-sandbox-live],.page-editor [data-sandbox-live]:focus{outline:none;border:0;box-shadow:none}
.page-editor .page-block[data-page-block=toc],.page-editor .page-block[data-page-block=browser],.page-editor .react-renderer.node-editorBlock:has([data-page-block=browser]){display:flex;flex-direction:column;width:100%;max-width:none;box-sizing:border-box}
.page-editor [data-testid=page-browser],.page-editor [data-testid=page-browser] .rui-root,.page-editor [data-testid=page-browser] .page-browser-ui,.page-editor [data-testid=page-browser-surface]{display:flex;flex-direction:column;width:100%;max-width:none;box-sizing:border-box;flex:1 1 auto;min-height:0}
.page-editor [data-testid=page-browser] .rui-root,.page-editor [data-testid=page-browser] .page-browser-ui,.page-editor [data-testid=page-browser-surface]{height:100%}
.page-editor .page-block[data-page-block=toc]{overflow:visible;box-shadow:none;outline:none}
.page-editor .page-block[data-page-block=browser]{overflow:hidden;box-shadow:none;outline:none}
.page-editor .page-block[data-page-block=toc].ProseMirror-selectednode{outline:none;box-shadow:none;background:transparent}
.page-editor .page-block-idle{min-height:200px}
.page-editor .page-block iframe{pointer-events:none;border:0;outline:none}
.page-editor .page-block.ProseMirror-selectednode iframe,.page-editor .ProseMirror[contenteditable=false] .page-block iframe,.page-host-view .page-block iframe{pointer-events:auto}
.page-editor .page-block.ProseMirror-selectednode{outline:none;box-shadow:none}
.page-editor .ProseMirror[contenteditable=false] .ProseMirror-selectednode{outline:none;box-shadow:none;background:transparent}
.page-editor .page-block[data-page-block=excalidraw],.page-editor .react-renderer.node-editorBlock:has([data-page-block=excalidraw]){overflow:visible}
.page-editor .page-block[data-page-block=excalidraw]{outline:none;box-shadow:none;border:0;border-radius:0}
.page-editor .page-block[data-page-block=html].ProseMirror-selectednode,.page-editor .page-block[data-page-block=htmlframe].ProseMirror-selectednode,.page-editor .page-block[data-page-block=excalidraw].ProseMirror-selectednode,.page-editor .page-block[data-page-block=sandbox].ProseMirror-selectednode,.page-editor .page-block[data-page-block=database].ProseMirror-selectednode,.page-editor .page-block[data-page-block=html]:has([data-html-selected]),.page-editor .page-block[data-page-block=htmlframe]:has([data-html-selected]),.page-editor .page-block[data-page-block=excalidraw]:has([data-excalidraw-selected]),.page-editor .page-block[data-page-block=sandbox]:has([data-sandbox-selected]),.page-editor .page-block[data-page-block=database]:has([data-database-selected]){outline:none;border-radius:0;box-shadow:0 0 0 2px var(--biu-color-emphasis)}
.page-editor .page-block[data-page-block=database]{user-select:none;border-radius:0}
.page-editor .page-block[data-page-block=database] input,.page-editor .page-block[data-page-block=database] textarea,.page-editor .page-block[data-page-block=database] [contenteditable=true]{user-select:text}
.page-editor .page-block[data-page-block=database] ::selection{background:transparent}
.page-editor .page-block[data-page-block=database] input::selection,.page-editor .page-block[data-page-block=database] textarea::selection{background:color-mix(in srgb,var(--biu-color-emphasis) 36%,transparent)}
.page-editor .page-block-missing{display:flex;flex-direction:column;gap:0;padding:12px 14px;border:1px dashed var(--biu-color-border);border-radius:8px;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-3)}
.page-editor .page-block-missing-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 0 10px;margin:0 0 10px;border-bottom:var(--biu-stroke-width) solid var(--biu-color-border)}
.page-editor .page-block-missing-id{font-family:var(--font-mono);font-weight:var(--biu-font-weight-semibold);color:var(--biu-color-text)}
.page-editor .page-block-missing-state{color:var(--biu-color-text-muted);font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold)}
.page-editor .page-block-missing-enable{flex:none;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:22px;height:22px;margin:0;border:0;border-radius:5px;padding:0;background:transparent;color:var(--biu-color-icon);cursor:pointer}
.page-editor .page-block-missing-enable:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-icon-active)}
.page-editor .page-block-missing-enable-icon{display:block;width:14px;height:14px}
.page-editor .tiptap ul,.page-editor .tiptap ol{--page-list-depth:0;list-style:none;padding-left:calc(var(--page-outline-icon) + var(--page-outline-gap));margin:2px 0}
.page-editor .tiptap :is(ul,ol) :is(ul,ol){--page-list-depth:1;padding-left:var(--page-outline-step)}
.page-editor .tiptap :is(ul,ol) :is(ul,ol) :is(ul,ol){--page-list-depth:2}
.page-editor .tiptap :is(ul,ol) :is(ul,ol) :is(ul,ol) :is(ul,ol){--page-list-depth:3}
.page-editor .tiptap ol{counter-reset:page-ol}
.page-editor .tiptap li{position:relative;display:block;margin:0;padding:2px 0}
.page-editor .tiptap li::before{content:"";position:absolute;left:calc(-1 * (var(--page-outline-icon) + var(--page-outline-gap) + var(--page-list-depth)*var(--page-outline-step)) + var(--page-outline-icon)/2 - .5px);top:0;bottom:0;width:calc(var(--page-list-depth)*var(--page-outline-step));background-image:repeating-linear-gradient(to right,var(--page-outline-line) 0 1px,transparent 1px var(--page-outline-step));background-repeat:no-repeat;pointer-events:none}
.page-editor .tiptap li::after{content:"";position:absolute;left:calc(-1 * (var(--page-outline-icon) + var(--page-outline-gap)));top:2px;width:var(--page-outline-icon);height:calc(1em * var(--fsdb-body-leading,1.7));background:var(--biu-color-icon);-webkit-mask:var(--page-outline-dot) center / 14px 14px no-repeat;mask:var(--page-outline-dot) center / 14px 14px no-repeat;pointer-events:none}
.page-editor .tiptap ol>li{counter-increment:page-ol}
.page-editor .tiptap ol>li::after{content:counter(page-ol) ".";background:transparent;-webkit-mask:none;mask:none;color:var(--biu-color-icon);font-size:inherit;font-weight:var(--biu-font-weight-medium);font-variant-numeric:tabular-nums;line-height:calc(1em * var(--fsdb-body-leading,1.7));text-align:center}
.page-editor .tiptap li.has-fold:not([data-list-folded=true]){background-image:linear-gradient(var(--page-outline-line),var(--page-outline-line));background-size:1px calc(100% - 2px - 1em * var(--fsdb-body-leading,1.7));background-position:calc(-1 * (var(--page-outline-icon) + var(--page-outline-gap)) + var(--page-outline-icon)/2 - .5px) calc(2px + 1em * var(--fsdb-body-leading,1.7));background-repeat:no-repeat}
.page-editor .tiptap li.has-fold::after,.page-editor .tiptap ol>li.has-fold::after{pointer-events:auto;cursor:pointer;transition:transform 150ms cubic-bezier(.22,1,.36,1),opacity 120ms ease}
.page-editor .tiptap li.has-fold:hover:not(:has(:hover))::after,.page-editor .tiptap ol>li.has-fold:hover:not(:has(:hover))::after,.page-editor .tiptap li.has-fold[data-list-folded=true]::after,.page-editor .tiptap ol>li.has-fold[data-list-folded=true]::after{content:"";background:var(--biu-color-icon-active);-webkit-mask:var(--page-outline-chevron) center / 14px 14px no-repeat;mask:var(--page-outline-chevron) center / 14px 14px no-repeat;color:transparent}
.page-editor .tiptap li.has-fold[data-list-folded=true]::after,.page-editor .tiptap ol>li.has-fold[data-list-folded=true]::after{transform:rotate(-90deg);transform-origin:center}
.page-editor .tiptap li.is-folded>ul,.page-editor .tiptap li.is-folded>ol{display:none}
.page-editor .tiptap li p{min-height:0;margin:0}
.page-editor .tiptap blockquote{margin-left:0;padding-left:14px;border-left:3px solid var(--biu-color-border);color:var(--biu-color-text-muted)}
.page-editor.is-outline .tiptap>blockquote.page-outline-block{overflow:visible;border-left:0;padding-left:0}
.page-editor.is-outline .tiptap>blockquote.page-outline-block>*{margin-top:0;margin-bottom:0}
.page-editor .tiptap hr{border:0;border-top:var(--biu-stroke-width) solid var(--biu-color-border);margin:18px 0}
.page-editor .tiptap img{display:block;max-width:100%;height:auto;margin:8px 0;border-radius:8px}
.page-editor .tiptap .page-image-node,.page-editor .react-renderer.node-image{display:block;position:relative;margin:8px 0;overflow:visible}
.page-editor .tiptap .page-image{position:relative;display:flex;flex-direction:column;max-width:100%;margin:0;overflow:visible}
.page-editor .tiptap .page-image[data-align=left]{align-items:flex-start}
.page-editor .tiptap .page-image[data-align=center]{align-items:center}
.page-editor .tiptap .page-image[data-align=right]{align-items:flex-end}
.page-editor .tiptap .page-image-shell{position:relative;max-width:100%;overflow:visible}
.page-editor .tiptap .page-image .page-slide-bar{top:8px;right:8px;left:auto}
.page-editor .react-renderer.node-image:hover .page-slide-bar,.page-editor .page-image:hover .page-slide-bar,.page-editor .page-image.is-selected .page-slide-bar,.page-editor .page-image:focus-within .page-slide-bar,.page-editor .page-image .page-slide-bar:hover,.page-editor .page-image .page-slide-bar:focus-within,.page-editor .page-image.is-zoom .page-slide-bar{opacity:1}
.page-editor .tiptap .page-image-frame{position:relative;max-width:100%;box-sizing:border-box;border:var(--biu-stroke-width-thick) solid var(--biu-color-bg);border-radius:10px}
.page-editor .tiptap .page-image-frame img{display:block;width:100%;height:auto;margin:0;border-radius:8px;cursor:zoom-in}
.page-editor .tiptap .page-image.is-selected .page-image-frame{border-radius:0;border-color:var(--biu-color-emphasis);box-shadow:none}
.page-editor .tiptap .page-image-empty{display:flex;align-items:center;justify-content:center;min-height:80px;border:var(--biu-stroke-width) dashed var(--biu-color-border);border-radius:8px;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-3)}
.page-editor .tiptap .page-image-resize{position:absolute;right:-5px;bottom:-5px;width:10px;height:10px;border:2px solid var(--biu-color-bg);border-radius:2px;background:var(--biu-color-text-subtle);cursor:nwse-resize;opacity:0;transition:opacity 120ms ease}
.page-editor .tiptap .page-image:hover .page-image-resize,.page-editor .tiptap .page-image.is-selected .page-image-resize{opacity:1}
.page-editor .tiptap .page-image[data-align=right] .page-image-resize{right:auto;left:-5px;cursor:nesw-resize}
.page-editor .tiptap .page-image-caption{display:block;width:100%;max-width:100%;margin:6px 0 0;border:0;padding:0;background:transparent;color:var(--biu-color-text-subtle);font:inherit;font-size:var(--biu-font-size-3);line-height:1.4;text-align:center;outline:none}
.page-editor .tiptap .page-image-caption:focus{color:var(--biu-color-text)}
.page-editor .tiptap .page-image-caption::placeholder{color:var(--biu-color-text-placeholder)}
.page-image-lightbox{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;background:color-mix(in srgb,var(--biu-color-bg) 28%,#000 72%);cursor:zoom-out;animation:page-lightbox-in 160ms ease}
.page-image-lightbox img{max-width:min(92vw,1400px);max-height:92vh;width:auto;height:auto;border-radius:10px;box-shadow:0 18px 48px color-mix(in srgb,#000 42%,transparent);animation:page-lightbox-img-in 160ms cubic-bezier(.22,1,.36,1)}
@keyframes page-lightbox-in{from{opacity:0}to{opacity:1}}
@keyframes page-lightbox-img-in{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
.page-editor .page-block[data-page-block=excalidraw] img,[data-testid=page-excalidraw] img{margin:0;max-width:none;height:unset;border-radius:0}
.page-editor .page-block[data-page-block=excalidraw] svg,.page-editor .page-block[data-page-block=excalidraw] canvas,[data-testid=page-excalidraw] svg,[data-testid=page-excalidraw] canvas{display:block;max-width:none;margin:0;border-radius:0}
.page-editor .page-block[data-page-block=excalidraw] .welcome-screen-center,[data-testid=page-excalidraw] .welcome-screen-center{display:none}
[data-testid=page-excalidraw] > div[style]{min-width:0}
.page-editor .page-block[data-page-block=terminal] .pt-scroll-rail{position:absolute;top:4px;right:3px;bottom:4px;width:6px;z-index:12}
.page-editor .tiptap table:not(.page-block *){width:100%;margin:8px 0;border-collapse:collapse;table-layout:fixed}
.page-editor .tiptap th:not(.page-block *),.page-editor .tiptap td:not(.page-block *){border:var(--biu-stroke-width) solid var(--biu-color-border);padding:6px 8px;vertical-align:top}
.page-editor .tiptap th:not(.page-block *){background:var(--biu-color-bg-hover);font-weight:var(--biu-font-weight-semibold);text-align:left}
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
.page-editor.is-outline .tiptap>pre.page-outline-block,.page-editor.is-outline .tiptap>blockquote.page-outline-block,.page-editor.is-outline .tiptap>.page-block.page-outline-block,.page-editor.is-outline .tiptap>.react-renderer.page-outline-block,.page-editor.is-outline .tiptap>div[data-type=block-math].page-outline-block{overflow:visible}
.page-editor.is-outline .tiptap>pre.page-outline-block{overflow-x:visible;padding:0;--page-outline-shift:var(--biu-stroke-width)}
.page-editor.is-outline .tiptap>pre.page-outline-block code{display:block;padding:10px 12px;overflow-x:auto}
.page-editor.is-outline .tiptap>pre.page-outline-block::before,.page-editor.is-outline .tiptap>pre.page-outline-block[data-language]::before{left:calc(-1 * var(--page-outline-indent) + var(--page-outline-icon)/2 - .5px - var(--page-outline-shift,0px))}
.page-editor.is-outline .tiptap>pre.page-outline-block::after{left:calc(-1 * (var(--page-outline-icon) + var(--page-outline-gap) + var(--page-outline-shift,0px)))}
.page-editor.is-outline .tiptap>pre.page-outline-block[data-language]::before{content:"";display:block;margin:0;color:transparent;font-size:0;font-weight:inherit;line-height:0;letter-spacing:0;position:absolute;top:0;bottom:0;width:calc(var(--page-outline-depth,0)*var(--page-outline-step));background-image:repeating-linear-gradient(to right,var(--page-outline-line) 0 1px,transparent 1px var(--page-outline-step));background-repeat:no-repeat;pointer-events:none}
.page-editor.is-outline .tiptap>pre.page-outline-block[data-language] code::before{content:attr(data-language);display:block;margin:0 0 6px;color:var(--biu-color-text-muted);font-size:var(--biu-font-size-1);font-weight:var(--biu-font-weight-semibold);line-height:1;letter-spacing:.02em}
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
.page-editor .tiptap .is-empty::before{content:attr(data-placeholder);float:left;height:0;pointer-events:none;color:var(--biu-color-text-placeholder);animation:page-placeholder-in 120ms ease 40ms both}
@keyframes page-placeholder-in{from{opacity:0}to{opacity:1}}
.page-bubble{z-index:var(--biu-z-float);background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);box-shadow:var(--biu-shadow-popover);border-radius:var(--biu-radius-popover);overflow:hidden;animation:page-menu-in 120ms cubic-bezier(.22,1,.36,1)}
.page-bubble.is-hidden{display:none!important}
html:not(.dark) .page-bubble{box-shadow:none}
.page-slash{position:fixed;z-index:var(--biu-z-toast);width:240px;max-height:min(52vh,280px);padding:4px;display:flex;flex-direction:column;gap:0;overflow:hidden;background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);box-shadow:var(--biu-shadow-popover);border-radius:var(--biu-radius-popover);animation:page-menu-in 120ms cubic-bezier(.22,1,.36,1)}
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
.page-slash-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none;margin-top:2px;padding:6px 8px 4px;border-top:var(--biu-stroke-width) solid color-mix(in srgb,var(--biu-color-text) 12%,transparent);color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-medium)}
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
.page-bubble{display:flex;flex-wrap:wrap;align-items:center;gap:2px;padding:4px;max-width:min(480px,calc(100vw - 48px))}
.page-bubble button{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;margin:0;border:0;border-radius:6px;padding:0 7px;background:transparent;color:var(--biu-color-text-muted);font:inherit;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-bold);cursor:pointer}
.page-bubble button svg{color:var(--biu-color-icon)}
.page-bubble button:hover,.page-bubble button.is-on{background:var(--biu-color-bg-hover)}
.page-bubble button:hover{color:var(--biu-color-text-muted)}
.page-bubble button:hover svg{color:var(--biu-color-icon)}
.page-bubble button.is-on{color:var(--biu-color-text)}
.page-bubble-chat{gap:4px;padding:0 8px}
.page-bubble-chat-icon{display:block;width:14px;height:14px;flex:none;color:var(--biu-color-icon)}
.page-bubble-letter{font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-bold);line-height:1;border-bottom:2px solid currentColor;color:var(--biu-color-text-muted)}
.page-table-bar{flex-wrap:nowrap;max-width:min(540px,calc(100vw - 32px));gap:2px;padding:3px 4px}
.page-table-bar button{width:26px;min-width:26px;height:26px;padding:0;border-radius:5px}
.page-table-bar button.is-danger:hover,.page-table-bar button.is-danger:hover svg{color:var(--biu-color-danger);background:var(--biu-color-danger-muted)}
.page-table-bar button.is-confirm,.page-table-bar button.is-confirm svg{color:#fff;background:var(--biu-color-danger)}
.page-table-bar-sep{display:inline-block;width:1px;height:16px;margin:0 3px;background:var(--biu-color-border);flex:none}
.page-table-cell-bg-pop .page-color-grid{display:grid;grid-template-columns:repeat(6,22px);gap:4px;padding:6px}
.page-table-cell-bg-pop .page-color-swatch{width:22px;height:22px;border-radius:4px;border:1px solid var(--biu-color-border);display:inline-flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer;background:transparent;color:var(--biu-color-text-muted)}
.page-table-cell-bg-pop .page-color-swatch.is-on{outline:2px solid var(--biu-color-emphasis);outline-offset:1px}
.page-color-menu{z-index:var(--biu-z-dropdown);width:248px;padding:16px 16px 18px;background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);box-shadow:var(--biu-shadow-popover)}
.page-color-recent-h,.page-color-menu-h{display:flex;align-items:center;justify-content:space-between;padding:0 4px;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-regular)}
.page-color-menu-h{margin:18px 0 10px}
.page-color-kbd{color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-3);letter-spacing:.02em}
.page-color-recent{display:flex;padding:12px 4px 4px}
.page-color-grid{display:grid;grid-template-columns:repeat(5,32px);gap:12px 14px;justify-content:space-between}
.page-color-grid button,.page-color-recent button{position:relative;min-width:0;width:32px;height:32px;padding:0;border:var(--biu-stroke-width) solid color-mix(in srgb,var(--biu-color-text-subtle) 28%,transparent);border-radius:var(--biu-radius-full);background:transparent;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold);line-height:1;cursor:pointer}
.page-color-grid button.is-on,.page-color-recent button.is-on{box-shadow:0 0 0 2px var(--biu-color-bg-elevated),0 0 0 3.5px var(--biu-color-text-subtle)}
.page-color-none::after{content:"";position:absolute;inset:50% auto auto 50%;width:1px;height:18px;background:var(--biu-color-text-subtle);transform:translate(-50%,-50%) rotate(-45deg)}
.page-color-wash{border-color:transparent}
.page-math-pop{position:fixed;z-index:var(--biu-z-toast);min-width:220px;max-width:min(360px,calc(100vw - 16px));padding:6px 8px;background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);box-shadow:var(--biu-shadow-popover)}
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
html[data-body-gap=lg] .page-editor.is-outline .tiptap>.page-outline-block{margin-top:0;margin-bottom:0}
html[data-body-gap=sm] .page-editor .tiptap p{min-height:1.45em}
html[data-body-gap=lg] .page-editor .tiptap p{min-height:2em}
html[data-body-gap=sm] .page-editor .tiptap li p,html[data-body-gap=lg] .page-editor .tiptap li p{min-height:0;margin:0}
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
.page-editor .editor-comment-mark{background:rgba(245,158,11,.16);padding:1px 0 1px;border-radius:0;border-bottom:2px solid rgba(245,158,11,.72);-webkit-box-decoration-break:clone;box-decoration-break:clone;cursor:pointer;transition:background .15s ease,border-color .15s ease}
.page-editor .editor-comment-mark:hover,.page-editor .editor-comment-mark.is-overlap{background:rgba(245,158,11,.26);border-bottom-color:rgba(245,158,11,.85)}
.page-editor .editor-comment-mark.is-active{background:rgba(245,158,11,.34);border-bottom-color:rgba(245,158,11,.98)}
.page-editor .tiptap code:has(.editor-comment-mark){background:color-mix(in srgb,rgba(245,158,11,.18) 55%,var(--biu-color-bg-hover));border-radius:4px 4px 0 0;border-bottom:2px solid rgba(245,158,11,.72);-webkit-box-decoration-break:clone;box-decoration-break:clone;cursor:pointer;transition:background .15s ease,border-color .15s ease}
.page-editor .tiptap code:has(.editor-comment-mark:hover),.page-editor .tiptap code:has(.editor-comment-mark.is-overlap){background:color-mix(in srgb,rgba(245,158,11,.28) 65%,var(--biu-color-bg-hover));border-bottom-color:rgba(245,158,11,.85)}
.page-editor .tiptap code:has(.editor-comment-mark.is-active){background:color-mix(in srgb,rgba(245,158,11,.36) 72%,var(--biu-color-bg-hover));border-bottom-color:rgba(245,158,11,.98)}
.page-editor .tiptap code .editor-comment-mark{background:transparent;padding:0;border-bottom:0}
.page-editor .tiptap code:has(.editor-pending-selection){background:color-mix(in srgb,var(--biu-color-emphasis) 28%,var(--biu-color-bg-hover))}
html.dark .page-editor .tiptap code:has(.editor-pending-selection){background:color-mix(in srgb,var(--biu-color-emphasis) 36%,var(--biu-color-bg-hover))}
.page-editor .tiptap code .editor-pending-selection{background:transparent}
.page-editor .page-editor-main{min-width:0;width:100%}
.page-editor.has-comments{display:flex;align-items:flex-start;gap:20px}
.page-editor.has-comments .page-editor-main{flex:1 1 0;min-width:0;width:auto}
.editor-comment-trigger{position:relative}
.editor-comment-badge{position:absolute;top:1px;right:1px;min-width:13px;height:13px;padding:0 3px;border-radius:999px;background:var(--biu-color-emphasis);color:var(--biu-color-on-emphasis,#fff);font-size:9.5px;font-weight:var(--biu-font-weight-semibold);line-height:13px;text-align:center;pointer-events:none}
.page-editor .editor-comment-rail{position:relative;flex:0 0 288px;width:288px;display:flex;flex-direction:column;gap:8px;background:transparent}
.page-editor .editor-comment-list{display:flex;flex-direction:column;gap:10px}
.page-editor .editor-comment-rail.is-anchored .editor-comment-list{display:block;position:static}
.page-editor .editor-comment-rail.is-anchored .editor-comment-composer,.page-editor .editor-comment-rail.is-anchored .editor-comment-card{position:absolute;left:0;right:0;margin:0;transition:top .18s ease,border-color .15s ease,box-shadow .15s ease}
.page-editor .editor-comment-empty{padding:16px 8px;text-align:center;font-size:12.5px;line-height:1.6;color:var(--biu-color-text-muted)}
.page-editor .editor-comment-composer,.page-editor .editor-comment-card{display:flex;flex-direction:column;gap:6px;padding:10px;border-radius:10px;background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);box-shadow:0 2px 8px rgba(0,0,0,.12);transition:border-color .15s ease,box-shadow .15s ease}
.page-editor .editor-comment-card{cursor:pointer}
.page-editor .editor-comment-card:hover{border-color:var(--biu-color-border)}
.page-editor .editor-comment-card.is-resolved{opacity:.72}
@media (max-width:760px){.page-editor.has-comments{flex-direction:column;gap:12px}.page-editor .editor-comment-rail{flex:none;width:100%;min-height:0!important}.page-editor .editor-comment-rail.is-anchored .editor-comment-list{display:flex;flex-direction:column;gap:10px}.page-editor .editor-comment-rail.is-anchored .editor-comment-composer,.page-editor .editor-comment-rail.is-anchored .editor-comment-card{position:static}}
.page-editor .editor-comment-quote{display:flex;flex-direction:column;gap:3px;padding:3px 8px;border-left:2px solid rgba(245,158,11,.35);font-size:12px;line-height:1.45;color:var(--biu-color-text-muted);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;transition:border-left-color .15s ease}
.page-editor .editor-comment-card.is-active .editor-comment-quote{border-left-color:rgba(245,158,11,.95)}
.page-editor .editor-comment-quote.is-detached{border-left-color:var(--biu-color-border-strong);font-style:italic}
.page-editor .editor-comment-detached-tag{display:inline-block;margin-left:6px;padding:0 5px;border-radius:4px;background:var(--biu-color-bg-hover);color:var(--biu-color-text-muted);font-style:normal;font-size:10.5px}
.page-editor .editor-comment-meta,.editor-comment-popover .editor-comment-meta{display:flex;align-items:center;gap:6px;min-width:0;font-size:11.5px;color:var(--biu-color-text-muted)}
.page-editor .editor-comment-author,.editor-comment-popover .editor-comment-author{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:160px;font-weight:var(--biu-font-weight-semibold);color:var(--biu-color-text)}
.page-editor .editor-comment-author-btn,.editor-comment-popover .editor-comment-author-btn{margin:0;padding:1px 5px 1px 2px;border:0;border-radius:999px;background:transparent;font:inherit;cursor:pointer;transition:background-color .12s ease}
.page-editor .editor-comment-author-btn:hover,.editor-comment-popover .editor-comment-author-btn:hover{background:var(--biu-color-bg-hover)}
.page-editor .editor-comment-author-avatar,.editor-comment-popover .editor-comment-author-avatar{display:inline-flex;width:18px;height:18px;flex:none;overflow:hidden;border-radius:50%;background:var(--biu-color-bg-hover)}
.page-editor .editor-comment-author-avatar img,.page-editor .editor-comment-author-ai-avatar,.editor-comment-popover .editor-comment-author-avatar img,.editor-comment-popover .editor-comment-author-ai-avatar{display:block;width:100%;height:100%;object-fit:cover}
.page-editor .editor-comment-author-name,.editor-comment-popover .editor-comment-author-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.page-editor .editor-comment-time{font-variant-numeric:tabular-nums}
.page-editor .editor-comment-actions{margin-left:auto;display:inline-flex;align-items:center;gap:2px}
.page-editor .editor-comment-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--biu-color-text-muted);cursor:pointer}
.page-editor .editor-comment-icon-btn:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.page-editor .editor-comment-icon-btn.is-danger:hover{color:var(--biu-color-danger)}
.page-editor .editor-comment-text{font-size:13px;line-height:1.55;color:var(--biu-color-text);white-space:pre-wrap;word-break:break-word}
.page-editor .editor-comment-replies{display:flex;flex-direction:column;gap:6px;margin-top:2px;padding-top:6px;border-top:var(--biu-stroke-width) solid var(--biu-color-border-subtle)}
.page-editor .editor-comment-reply{display:flex;flex-direction:column;gap:3px;padding-left:8px;border-left:2px solid var(--biu-color-border-subtle)}
.page-editor .editor-comment-input,.page-editor .editor-comment-reply-input{width:100%;box-sizing:border-box;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:7px;padding:6px 8px;background:var(--biu-color-bg-input);color:var(--biu-color-text);font:inherit;font-size:12.5px;resize:none;outline:none}
.page-editor .editor-comment-input:focus,.page-editor .editor-comment-reply-input:focus{border-color:var(--biu-color-border-strong)}
.page-editor .editor-comment-reply-box{margin-top:2px}
.page-editor .editor-comment-composer-actions{display:flex;justify-content:flex-end;gap:6px}
.page-editor .editor-comment-btn{border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:6px;padding:4px 10px;background:transparent;color:var(--biu-color-text-muted);font:inherit;font-size:12px;cursor:pointer}
.page-editor .editor-comment-btn:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.page-editor .editor-comment-btn.is-primary{border-color:transparent;background:var(--biu-color-emphasis);color:var(--biu-color-on-emphasis,#fff)}
.page-editor .editor-comment-btn.is-primary:disabled{opacity:.45;cursor:default}
.editor-comment-popover{position:fixed;z-index:var(--biu-z-float);width:312px;max-width:calc(100vw - 24px);max-height:min(62vh,420px);overflow-y:auto;animation:page-menu-in 120ms cubic-bezier(.22,1,.36,1)}
.editor-comment-compose-pill{width:min(380px,calc(100vw - 24px))}
.editor-comment-popover-stack{display:flex;flex-direction:column;gap:8px}
.editor-comment-popover-all{align-self:flex-end;margin:0;border:0;border-radius:6px;padding:3px 8px;background:var(--biu-color-bg-popover);color:var(--biu-color-text-muted);font:inherit;font-size:11.5px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.1);transition:color .12s ease,background .12s ease}
.editor-comment-popover-all:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.editor-inline-edit{position:fixed;z-index:var(--biu-z-float);display:flex;flex-direction:column;gap:4px;padding:6px 10px;border-radius:14px;background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);box-shadow:var(--biu-shadow-popover,0 4px 18px rgba(0,0,0,.16));animation:page-menu-in 120ms cubic-bezier(.22,1,.36,1)}
.editor-inline-edit-row{display:flex;align-items:center;gap:8px;min-height:32px}
.editor-inline-edit-avatar{width:28px;height:28px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;flex:none;background:var(--biu-color-bg-hover);border:var(--biu-stroke-width) solid var(--biu-color-border-subtle)}
.editor-inline-edit-icon{width:14px;height:14px;flex:none;color:var(--biu-color-icon)}
.editor-inline-edit-input{flex:1 1 auto;min-width:0;border:0;padding:4px 2px;background:transparent;color:var(--biu-color-text);font:inherit;font-size:13.5px;line-height:1.4;outline:none}
.editor-inline-edit-input::placeholder{color:var(--biu-color-text-muted)}
.editor-inline-edit-submit{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:0;border-radius:999px;background:var(--biu-color-emphasis);color:var(--biu-color-on-emphasis,#fff);cursor:pointer;transition:opacity .15s ease}
.editor-inline-edit-submit:disabled{opacity:.35;cursor:default}
.editor-inline-edit-spin{width:13px;height:13px;animation:page-editor-spin .8s linear infinite}
.editor-inline-edit-error{font-size:11.5px;line-height:1.4;color:var(--biu-color-danger);padding:0 4px 2px 36px}
@media (prefers-reduced-motion:reduce){.page-block-handle,.page-block-handle-menu,.page-bubble,.page-slash,.editor-comment-popover,.editor-inline-edit,.page-slide-bar,.page-editor .page-slide-bar,.page-editor .tiptap .page-image-resize,.page-editor.is-outline .tiptap>.page-outline-heading.has-fold::after,.page-editor .tiptap li.has-fold::after,.page-editor .tiptap ol>li.has-fold::after,.page-editor .tiptap p.is-editor-empty:first-child::before,.page-editor .tiptap .is-empty::before,.page-image-lightbox,.page-image-lightbox img{transition:none;animation:none}}
`
