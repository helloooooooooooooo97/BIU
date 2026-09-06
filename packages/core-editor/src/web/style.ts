export const PAGE_EDITOR_STYLE = `
.page-editor{position:relative;min-width:0;width:100%;padding:6px 0 48px;color:var(--dsw-label);font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,sans-serif,"Apple Color Emoji","Segoe UI Emoji";font-size:16px;line-height:1.7;letter-spacing:-.003em}
.page-editor .tiptap{outline:none;min-height:240px}
.page-editor .tiptap>:first-child{margin-top:0}
.page-editor .tiptap p,.page-editor .tiptap h1,.page-editor .tiptap h2,.page-editor .tiptap h3,.page-editor .tiptap ul,.page-editor .tiptap ol,.page-editor .tiptap blockquote,.page-editor .tiptap pre{margin:2px 0}
.page-editor .tiptap p{min-height:1.7em}
.page-editor .tiptap h1{font-size:1.875em;font-weight:700;line-height:1.3;margin-top:.9em}
.page-editor .tiptap h2{font-size:1.5em;font-weight:650;line-height:1.3;margin-top:.75em}
.page-editor .tiptap h3{font-size:1.25em;font-weight:650;line-height:1.3;margin-top:.6em}
.page-editor .tiptap [data-heading-plugin]{border-radius:8px}
.page-editor .page-block{margin:12px 0;position:relative;z-index:0;isolation:isolate;overflow:hidden}
.page-editor .page-block.ProseMirror-selectednode{outline:none;box-shadow:none}
.page-editor .page-block[data-page-block=excalidraw]{outline:none;box-shadow:none;border:0;border-radius:8px}
.page-editor .page-block-missing{display:flex;flex-direction:column;gap:0;padding:12px 14px;border:1px dashed var(--dsw-border);border-radius:8px;color:var(--dsw-label-3);font-size:13px}
.page-editor .page-block-missing-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 0 10px;margin:0 0 10px;border-bottom:1px solid var(--dsw-border)}
.page-editor .page-block-missing-id{font-family:var(--font-mono);font-weight:600;color:#F0EFED}
.page-editor .page-block-missing-state{color:#7B7B79;font-size:13px;font-weight:600}
.page-editor .page-block-missing-enable{flex:none;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:22px;height:22px;margin:0;border:0;border-radius:5px;padding:0;background:transparent;color:#F0EFED;cursor:pointer}
.page-editor .page-block-missing-enable:hover{background:var(--dsw-hover)}
.page-editor .page-block-missing-enable-icon{display:block;width:14px;height:14px}
.page-editor .tiptap ul,.page-editor .tiptap ol{padding-left:1.6em;list-style-position:outside}
.page-editor .tiptap ul{list-style-type:disc}
.page-editor .tiptap ol{list-style-type:decimal}
.page-editor .tiptap ul ul{list-style-type:circle}
.page-editor .tiptap ul ul ul{list-style-type:square}
.page-editor .tiptap li{display:list-item;margin:1px 0}
.page-editor .tiptap li p{min-height:0;margin:0}
.page-editor .tiptap blockquote{margin-left:0;padding-left:14px;border-left:3px solid var(--dsw-border);color:var(--dsw-label-2)}
.page-editor .tiptap hr{border:0;border-top:1px solid var(--dsw-border);margin:18px 0}
.page-editor .tiptap code{display:inline;padding:.12em .35em;border-radius:4px;background:var(--dsw-hover);font-family:var(--font-mono);font-size:.9em}
.page-editor .tiptap pre{display:block;margin:8px 0;padding:10px 12px;border:1px solid var(--dsw-border);border-radius:10px;background:var(--dsw-chat-code-bg,var(--dsw-sidebar));overflow-x:auto;white-space:pre;font-family:var(--font-mono)}
.page-editor .tiptap pre code{display:block;padding:0;background:transparent;font-size:13px;line-height:1.6;white-space:inherit}
.page-editor pre.page-block-missing-source{margin:0;max-height:220px;overflow:auto;padding:10px 12px;border:1px solid var(--dsw-border);border-radius:8px;background:var(--dsw-chat-code-bg,var(--dsw-sidebar));color:var(--dsw-label-2);font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word}
.page-editor .tiptap a{color:var(--dsw-business);text-underline-offset:2px}
.page-editor .tiptap p.is-editor-empty:first-child::before,
.page-editor .tiptap .is-empty::before{content:attr(data-placeholder);float:left;height:0;pointer-events:none;color:var(--dsw-placeholder)}
.page-bubble{z-index:80;background:var(--dsw-sidebar);border:1px solid var(--dsw-border);box-shadow:0 8px 28px rgba(15,15,15,.12),0 0 0 1px color-mix(in srgb,var(--dsw-border) 70%,transparent);border-radius:10px;overflow:hidden}
.page-slash{position:fixed;z-index:10000;width:240px;max-height:min(52vh,280px);padding:4px;display:flex;flex-direction:column;gap:0;overflow:hidden;background:var(--dsw-sidebar);border:1px solid var(--dsw-border);box-shadow:0 8px 28px rgba(15,15,15,.12);border-radius:8px}
.page-slash-head,.page-slash-empty{padding:6px 8px 4px;color:var(--dsw-label-3);font-size:11px;font-weight:600}
.page-slash-head{flex:none;padding:6px 8px 2px}
.page-slash-list{min-height:0;flex:1;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:1px}
.page-slash-group{display:flex;flex-direction:column;gap:1px}
.page-slash-item{display:flex;align-items:center;gap:8px;width:100%;margin:0;box-sizing:border-box;border:1px solid transparent;border-radius:6px;padding:4px 6px;background:transparent;color:var(--dsw-label);font:inherit;text-align:left;cursor:pointer}
.page-slash-item:hover,.page-slash-item.is-active{background:var(--dsw-hover);border-color:var(--dsw-border)}
.page-slash-icon{flex:none;display:grid;place-items:center;width:18px;height:18px;border:0;border-radius:0;background:transparent;color:var(--dsw-label-2);font-size:11px;font-weight:700;line-height:1}
.page-slash-label{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600;line-height:1.2}
.page-slash-keys{flex:none;color:var(--dsw-label-3);font-size:12px;font-weight:500}
.page-slash-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none;margin-top:2px;padding:6px 8px 4px;border-top:1px solid var(--dsw-border);color:var(--dsw-label-3);font-size:12px;font-weight:500}
.page-bubble{display:flex;align-items:center;gap:2px;padding:4px}
.page-bubble button{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;margin:0;border:0;border-radius:6px;padding:0 7px;background:transparent;color:var(--dsw-label);font:inherit;font-size:13px;font-weight:700;cursor:pointer}
.page-bubble button:hover,.page-bubble button.is-on{background:var(--dsw-hover)}
.page-bubble button.is-on{color:var(--dsw-business)}
`
