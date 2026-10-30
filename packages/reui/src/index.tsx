/**
 * ReUI kit for store page plugins. Host hangs this module on globalThis.ReUI;
 * pack maps `import from '@biu/reui'` onto that singleton (same as React).
 */
import * as React from 'react'

const CSS = `
.rui-root{color:var(--biu-color-text);color-scheme:light;font:12.5px/1.45 var(--font-sans),ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
html.dark .rui-root{--biu-color-on-emphasis:var(--biu-color-bg);color-scheme:dark}
.rui-card{background:var(--biu-color-bg);border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:var(--biu-radius-xl);padding:18px 20px}
.rui-card-head{display:flex;align-items:flex-start;gap:12px;margin:0 0 16px}
.rui-card-title{margin:0;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold);letter-spacing:-.01em;line-height:1.3}
.rui-card-desc{margin:3px 0 0;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);line-height:1.4;font-weight:var(--biu-font-weight-regular)}
.rui-actions{margin-left:auto;display:flex;gap:6px;flex-shrink:0;align-items:center}
.rui-row{display:flex;align-items:center;gap:8px;min-width:0}
.rui-stack{display:flex;flex-direction:column;gap:8px}
.rui-grow{flex:1 1 auto;min-width:0}
.rui-kicker{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--biu-color-text-subtle);font-weight:var(--biu-font-weight-semibold)}
.rui-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin:0 0 16px;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:10px;overflow:hidden;background:var(--biu-color-bg-subtle)}
.rui-stat{padding:14px 16px;border-right:var(--biu-stroke-width) solid var(--biu-color-border);background:transparent}
.rui-stat:last-child{border-right:0}
.rui-stat-val{display:block;margin:8px 0 4px;font-size:22px;font-weight:var(--biu-font-weight-semibold);letter-spacing:-.04em;font-variant-numeric:tabular-nums;color:var(--biu-color-text)}
.rui-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;padding:0 11px;border-radius:6px;border:var(--biu-stroke-width) solid transparent;font:500 12px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer;background:var(--biu-color-text);color:var(--biu-color-on-emphasis);white-space:nowrap;flex:0 0 auto}
.rui-btn:hover{background:var(--biu-color-bg-hover-strong)}
.rui-btn:disabled{opacity:.4;cursor:default;pointer-events:none}
.rui-btn-secondary,.rui-btn-outline{background:var(--biu-color-bg);color:var(--biu-color-text);border-color:var(--biu-color-border)}
.rui-btn-secondary:hover,.rui-btn-outline:hover{background:var(--biu-color-bg-hover)}
.rui-btn-ghost{background:transparent;color:var(--biu-color-text-subtle);border-color:transparent}
.rui-btn-ghost:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.rui-btn-destructive{background:var(--biu-color-bg);color:var(--biu-color-danger);border-color:var(--biu-color-border)}
.rui-btn-sm{height:24px;padding:0 8px;font-size:11.5px}
.rui-btn-icon{width:24px;height:24px;padding:0}
.rui-input,.rui-select{display:inline-block;width:auto;max-width:100%;min-width:0;box-sizing:border-box;height:28px;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:6px;background:var(--biu-color-bg);color:var(--biu-color-text);padding:0 9px;font:12.5px/28px ui-sans-serif,system-ui,sans-serif;outline:none;flex:0 0 auto}
.rui-textarea{display:block;width:100%;min-height:80px;box-sizing:border-box;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:6px;background:var(--biu-color-bg);color:var(--biu-color-text);padding:8px 9px;font:12.5px/1.5 ui-sans-serif,system-ui,sans-serif;outline:none;resize:vertical}
.rui-grow.rui-input,.rui-grow.rui-select,.rui-fill{width:100%;flex:1 1 auto}
.rui-input:focus,.rui-select:focus,.rui-textarea:focus{border-color:var(--biu-color-text)}
.rui-input:disabled,.rui-select:disabled,.rui-textarea:disabled{opacity:.5;background:var(--biu-color-bg-subtle)}
.rui-label{display:block;margin:0 0 6px;font-size:11px;font-weight:var(--biu-font-weight-medium);color:var(--biu-color-text-subtle)}
.rui-badge{display:inline-flex;align-items:center;border-radius:4px;border:0;padding:1px 6px;font-size:11px;font-weight:var(--biu-font-weight-medium);background:var(--biu-color-bg-muted);color:var(--biu-color-text-subtle);white-space:nowrap}
.rui-badge-on{background:var(--biu-color-text);color:var(--biu-color-on-emphasis)}
.rui-badge-destructive{background:color-mix(in srgb,var(--biu-color-danger) 14%,transparent);color:var(--biu-color-danger)}
.rui-table-wrap{width:100%;overflow:auto}
.rui-table{width:100%;border-collapse:collapse;font-size:12.5px}
.rui-table th{text-align:left;font-size:10.5px;font-weight:var(--biu-font-weight-semibold);letter-spacing:.06em;text-transform:uppercase;color:var(--biu-color-text-subtle);padding:0 10px 8px;border-bottom:var(--biu-stroke-width) solid var(--biu-color-border);white-space:nowrap}
.rui-table td{padding:10px;border-bottom:var(--biu-stroke-width) solid var(--biu-color-border);vertical-align:middle}
.rui-table tr:last-child td{border-bottom:0}
.rui-tabs{display:inline-flex;align-items:center;gap:0;padding:3px;background:var(--biu-color-bg-muted);border-radius:8px;width:fit-content}
.rui-tabs .rui-btn{height:22px;padding:0 10px;box-shadow:none}
.rui-tabs .rui-btn-secondary{background:var(--biu-color-bg);border-color:transparent;color:var(--biu-color-text)}
.rui-tabs .rui-btn-ghost{background:transparent}
.rui-progress{height:3px;border-radius:99px;background:var(--biu-color-border);overflow:hidden;margin-top:8px}
.rui-progress>i{display:block;height:100%;background:var(--biu-color-text)}
.rui-check{width:14px;height:14px;accent-color:var(--biu-color-text);flex:0 0 auto}
.rui-muted{color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2)}
.rui-sep{height:1px;background:var(--biu-color-border);border:0;margin:14px 0}
.rui-dialog-mask{position:fixed;inset:0;background:rgba(0,0,0,.4);display:grid;place-items:center;z-index:var(--biu-z-float)}
.rui-dialog{width:min(400px,calc(100vw - 32px));background:var(--biu-color-bg);border-radius:12px;padding:20px;border:var(--biu-stroke-width) solid var(--biu-color-border)}
.rui-dialog h2{margin:0 0 8px;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-semibold)}
.rui-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
.rui-tree{display:flex;flex-direction:column;--tree-indent:16px;margin-top:10px;position:relative}
.rui-tree-item{position:relative;z-index:1;display:block;width:100%;box-sizing:border-box;border:0;background:transparent;padding:0 0 1px calc(var(--tree-padding,0px));color:inherit;font:inherit;text-align:left;cursor:pointer;outline:none}
.rui-tree-item::before{content:"";position:absolute;left:calc(var(--tree-padding) - 9px);top:0;bottom:0;width:1px;background:var(--biu-color-border)}
.rui-tree-item[data-level="0"]::before{display:none}
.rui-tree-label{display:flex;align-items:center;gap:6px;min-height:28px;padding:3px 8px;border-radius:6px;font-size:12.5px;line-height:1.35;color:var(--biu-color-text)}
.rui-tree-item:hover .rui-tree-label,.rui-tree-item[data-selected=true] .rui-tree-label{background:var(--biu-color-bg-hover)}
.rui-tree-item:focus-visible .rui-tree-label{box-shadow:inset 0 0 0 1px var(--biu-color-text)}
.rui-tree-chevron{width:14px;height:14px;flex:0 0 auto;color:var(--biu-color-text-subtle);transition:transform .15s ease}
.rui-tree-item[aria-expanded=false] .rui-tree-chevron{transform:rotate(-90deg)}
.rui-tree-dot{width:5px;height:5px;border-radius:99px;background:var(--biu-color-border);flex:0 0 auto;margin-left:4.5px;margin-right:4.5px}
@media (max-width:720px){.rui-stats{grid-template-columns:1fr 1fr}.rui-stat:nth-child(2){border-right:0}.rui-stat:nth-child(n+3){border-top:var(--biu-stroke-width) solid var(--biu-color-border)}}
.rui-ios{background:#f2f2f7;border-radius:16px;padding:8px 0 16px}
.rui-large{margin:8px 20px 12px;font-size:28px;font-weight:var(--biu-font-weight-bold);letter-spacing:-.04em;line-height:1.1}
.rui-sub{margin:-8px 20px 14px;color:#6d6d72;font-size:var(--biu-font-size-3)}
.rui-group{margin:0 16px 18px;background:#fff;border-radius:12px;overflow:hidden}
.rui-section{margin:0 20px 6px;font-size:var(--biu-font-size-2);color:#6d6d72;letter-spacing:.02em}
.rui-cell{display:flex;align-items:center;gap:10px;min-height:44px;padding:6px 14px;background:#fff;border-bottom:.5px solid rgba(60,60,67,.12);font-size:15px}
.rui-cell:last-child{border-bottom:0}
.rui-cell-main{flex:1 1 auto;min-width:0}
.rui-cell-meta{color:#8e8e93;font-size:15px;font-variant-numeric:tabular-nums;flex:0 0 auto}
.rui-activity{margin:0 16px 18px;background:#000;color:var(--biu-color-text);border-radius:18px;padding:22px 20px;display:flex;align-items:center;gap:22px}
.rui-legend{display:flex;flex-direction:column;gap:12px;min-width:0}
.rui-legend i{display:inline-block;width:8px;height:8px;border-radius:99px;margin-right:6px}
.rui-legend b{display:block;font-size:22px;font-weight:var(--biu-font-weight-semibold);letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1.15}
.rui-legend em{display:block;font-style:normal;font-size:var(--biu-font-size-2);color:rgba(255,255,255,.5);margin-top:2px}
.fit-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 16px 16px}
.fit-tile{background:#fff;border-radius:12px;padding:12px 12px 10px}
.fit-tile b{display:block;font-size:20px;font-weight:var(--biu-font-weight-semibold);letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.fit-tile em{display:block;margin-top:3px;font-style:normal;font-size:11px;color:#6d6d72}
.fit-meter{height:4px;border-radius:99px;background:#ececef;margin-top:8px;overflow:hidden}
.fit-meter i{display:block;height:100%;border-radius:99px}
.hv-stats{display:flex;gap:18px;margin:0 16px 14px;font-variant-numeric:tabular-nums}
.hv-stats b{display:block;font-size:22px;font-weight:var(--biu-font-weight-semibold);letter-spacing:-.03em}
.hv-stats em{display:block;font-style:normal;font-size:11px;color:#6d6d72;margin-top:2px}
.hv-ex{margin:0 16px 12px;background:#fff;border-radius:12px;overflow:hidden}
.hv-ex h3{margin:0;padding:12px 14px 4px;font-size:16px;font-weight:var(--biu-font-weight-semibold)}
.hv-ex p{margin:0;padding:0 14px 8px;font-size:var(--biu-font-size-2);color:#6d6d72}
.hv-table{width:100%;border-collapse:collapse}
.hv-table th{text-align:left;font-size:11px;color:#8e8e93;font-weight:var(--biu-font-weight-semibold);letter-spacing:.04em;text-transform:uppercase;padding:6px 10px;border-bottom:var(--biu-stroke-width) solid #f0f0f0}
.hv-table td{padding:6px 10px;border-bottom:var(--biu-stroke-width) solid #f6f6f6;font-size:var(--biu-font-size-4)}
.hv-table input{width:56px;border:0;background:transparent;text-align:center;font:650 14px/28px ui-sans-serif,system-ui,sans-serif}
.rui-chrome{display:flex;align-items:center;gap:8px;height:44px;padding:0 10px;background:#f6f6f6;border-bottom:.5px solid rgba(0,0,0,.1)}
.rui-traffic{display:flex;gap:6px;padding:0 6px}
.rui-traffic i{width:10px;height:10px;border-radius:99px}
.rui-traffic .r{background:#ff5f57}
.rui-traffic .y{background:#febc2e}
.rui-traffic .g{background:#28c840}
.rui-addr{flex:1 1 auto;min-width:0;height:28px;border:0;border-radius:8px;background:#e8e8ed;padding:0 12px;text-align:center;font-size:var(--biu-font-size-3)}
.rui-split{display:grid;grid-template-columns:1fr 1fr;min-height:280px}
.rui-assert{padding:12px 14px;border-bottom:.5px solid rgba(60,60,67,.12)}
.rui-assert:last-child{border-bottom:0}
.rui-assert-top{display:flex;align-items:center;gap:8px}
.rui-assert-out{margin-top:6px;font-size:var(--biu-font-size-2);color:#8e8e93;font-family:ui-monospace,monospace}
.rui-ok{color:#34c759}
.rui-bad{color:#ff3b30}
.rui-chip{width:22px;height:22px;border-radius:99px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:var(--biu-font-weight-bold);flex:0 0 auto}
.rui-chip-ok{background:#e8f8ee;color:#248a3d}
.rui-chip-bad{background:#ffece9;color:#d70015}
.rui-chip-wait{background:#f2f2f7;color:#8e8e93}
.lc-shell{display:grid;grid-template-columns:minmax(260px,1fr) minmax(280px,1.1fr);min-height:420px;background:#fff}
.lc-desc{padding:20px 22px 28px;overflow:auto;border-right:var(--biu-stroke-width) solid var(--biu-color-border);background:#fff;min-width:0}
.lc-title{display:block;width:100%;border:0;background:transparent;font-size:22px;font-weight:var(--biu-font-weight-semibold);letter-spacing:-.03em;line-height:1.25;padding:0;margin:0 0 10px;color:#262626}
.lc-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.lc-diff{font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold)}
.lc-topics{display:flex;flex-wrap:wrap;gap:6px}
.lc-topic{background:#f3f3f3;border-radius:99px;padding:3px 10px;font-size:var(--biu-font-size-2);color:#5c5c5c}
.lc-h{font-size:15px;font-weight:var(--biu-font-weight-semibold);margin:18px 0 8px;color:#262626}
.lc-p{font-size:var(--biu-font-size-4);line-height:1.75;color:#373737;white-space:pre-wrap}
.lc-ex{background:#f5f5f5;border-radius:8px;padding:12px 14px;margin:8px 0 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:var(--biu-font-size-3);line-height:1.55;color:#262626}
.lc-ex strong{display:block;font-family:ui-sans-serif,system-ui,sans-serif;font-size:var(--biu-font-size-3);margin:0 0 8px}
.lc-code{display:flex;flex-direction:column;min-width:0;min-height:0;background:#fff}
.lc-codebar{display:flex;align-items:center;gap:8px;height:42px;padding:0 12px;border-bottom:var(--biu-stroke-width) solid var(--biu-color-border);background:#fafafa}
.lc-codebar .rui-select{border:0;background:transparent;height:28px;font-weight:var(--biu-font-weight-semibold)}
.lc-run{height:28px;padding:0 14px;border:0;border-radius:6px;background:#2cbb5d;color:var(--biu-color-on-emphasis);font:600 13px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer}
.lc-run:disabled{opacity:.45;cursor:default}
.lc-run-ghost{background:#fff;color:#262626;border:var(--biu-stroke-width) solid #e5e5e5}
.lc-console{border-top:var(--biu-stroke-width) solid var(--biu-color-border);background:#fff}
.lc-console-tabs{display:flex;align-items:center;gap:14px;padding:8px 14px;border-bottom:var(--biu-stroke-width) solid var(--biu-color-border);font-size:var(--biu-font-size-3);color:#8c8c8c}
.lc-console-tabs [data-on=true]{color:#262626;font-weight:var(--biu-font-weight-semibold);border-bottom:2px solid #262626;padding-bottom:6px;margin-bottom:-9px}
.lc-console-body{padding:12px 14px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;line-height:1.65;min-height:72px;color:#262626;white-space:pre-wrap}
.lc-empty{color:#8c8c8c}
@media (max-width:820px){.lc-shell{grid-template-columns:1fr}}
.doc-shell{background:#fafafa;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:12px;overflow:hidden}
.doc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 18px 8px}
.doc-head h2{margin:0;font-size:18px;font-weight:var(--biu-font-weight-semibold);letter-spacing:-.02em}
.doc-head p{margin:4px 0 0;font-size:12.5px;color:#6d6d72}
.doc-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:8px 18px 14px}
.doc-stat{background:#fff;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:10px;padding:12px 14px}
.doc-stat b{display:block;font-size:26px;font-weight:var(--biu-font-weight-semibold);letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1.1}
.doc-stat em{display:block;margin-top:4px;font-style:normal;font-size:var(--biu-font-size-2);color:#6d6d72}
.doc-bar{display:flex;height:8px;margin:0 18px 14px;border-radius:99px;overflow:hidden;background:#ececef}
.doc-bar i{display:block;height:100%}
.doc-filters{display:flex;gap:0;padding:0 10px;border-bottom:var(--biu-stroke-width) solid var(--biu-color-border);background:#fff}
.doc-filter{height:36px;padding:0 12px;border:0;border-radius:0;background:transparent;color:#6d6d72;font:600 12.5px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer}
.doc-filter[data-on=true]{color:#1c1c1e;box-shadow:inset 0 -2px 0 #1c1c1e}
.doc-list{background:#fff}
.doc-table{width:100%;border-collapse:collapse}
.doc-table th{text-align:left;font:600 11px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#8e8e93;padding:10px 14px;border-bottom:var(--biu-stroke-width) solid var(--biu-color-border);background:#fff}
.doc-table td{padding:12px 14px;border-bottom:var(--biu-stroke-width) solid #f0f0f0;font-size:13.5px;vertical-align:top}
.doc-table tr[data-open=true]{background:#fafafa}
.doc-table tr.doc-row{cursor:pointer}
.doc-table tr.doc-row:hover{background:#f7f8fa}
.doc-lvl{display:inline-block;font:700 11px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase}
.doc-title{font-weight:var(--biu-font-weight-semibold);color:#1c1c1e}
.doc-culprit{color:#6d6d72;font-family:ui-monospace,monospace;font-size:var(--biu-font-size-2);margin-top:3px}
.doc-detail{padding:0 14px 14px 14px;color:#6d6d72;font-size:var(--biu-font-size-3);background:#fafafa;border-bottom:var(--biu-stroke-width) solid #f0f0f0}
.ins-shell{display:grid;grid-template-columns:220px minmax(0,1fr);min-height:460px;background:#fff}
.ins-side{border-right:var(--biu-stroke-width) solid var(--biu-color-border);background:#f7f7f7;display:flex;flex-direction:column;min-width:0}
.ins-side h4{margin:12px 12px 6px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8e8e93}
.ins-hit{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;text-align:left;padding:8px 12px;cursor:pointer;font:12.5px/1.3 ui-sans-serif,system-ui,sans-serif;color:#1c1c1e}
.ins-hit[data-on=true]{background:#fff}
.ins-main{display:flex;flex-direction:column;min-width:0}
.ins-urlbar{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:var(--biu-stroke-width) solid var(--biu-color-border)}
.ins-panes{display:flex;gap:0;padding:0 12px;border-bottom:var(--biu-stroke-width) solid var(--biu-color-border)}
.ins-panes button{height:34px;border:0;background:transparent;color:#8e8e93;font:600 12.5px/1 ui-sans-serif,system-ui,sans-serif;padding:0 12px;cursor:pointer}
.ins-panes button[data-on=true]{color:#1c1c1e;box-shadow:inset 0 -2px 0 #1c1c1e}
.kv{width:100%;border-collapse:collapse;font-size:12.5px}
.kv th{text-align:left;font-size:11px;color:#8e8e93;font-weight:var(--biu-font-weight-semibold);padding:8px 8px 6px;border-bottom:var(--biu-stroke-width) solid var(--biu-color-border)}
.kv td{padding:4px 6px;border-bottom:var(--biu-stroke-width) solid #f3f3f3;vertical-align:middle}
.kv input[type=text]{width:100%;border:0;background:transparent;height:28px;font:12.5px/28px ui-sans-serif,system-ui,sans-serif;outline:none}
.kv input[type=checkbox]{width:14px;height:14px;accent-color:#1c1c1e}
.ins-body{padding:10px 12px;min-height:180px;flex:1;overflow:auto}
.ins-empty{padding:28px 16px;color:#8e8e93;font-size:var(--biu-font-size-3)}
.m-GET{color:#2d8a4e;font-weight:var(--biu-font-weight-bold);font-size:11px}
.m-POST{color:#c47b17;font-weight:var(--biu-font-weight-bold);font-size:11px}
.m-PUT{color:#2b6cb0;font-weight:var(--biu-font-weight-bold);font-size:11px}
.m-PATCH{color:#6b4ea1;font-weight:var(--biu-font-weight-bold);font-size:11px}
.m-DELETE{color:#c53030;font-weight:var(--biu-font-weight-bold);font-size:11px}
.m-HEAD,.m-OPTIONS{color:#6b7280;font-weight:var(--biu-font-weight-bold);font-size:11px}
.ins-status{display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:var(--biu-stroke-width) solid var(--biu-color-border);font-size:12.5px}
@media (max-width:860px){.ins-shell{grid-template-columns:1fr}}
.toc-shell{background:#fff;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:12px;padding:14px 8px 12px 14px;max-width:320px}
.toc-kicker{font-size:11px;font-weight:var(--biu-font-weight-semibold);letter-spacing:.08em;text-transform:uppercase;color:#8e8e93;margin:0 8px 6px}
.toc-shell h2{margin:0 8px 10px;font-size:15px;font-weight:var(--biu-font-weight-semibold)}
.toc-shell .rui-tree{margin-top:0}
.toc-shell .rui-tree-item[data-selected=true] .rui-tree-label{background:#f0f0f0;font-weight:var(--biu-font-weight-semibold)}
.rg-shell{background:#fff;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:12px;overflow:hidden}
.rg-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 16px 8px}
.rg-head h2{margin:0;font-size:16px;font-weight:var(--biu-font-weight-semibold)}
.rg-head p{margin:4px 0 0;color:#6d6d72;font-size:12.5px}
.rg-stats{display:flex;gap:16px;padding:0 16px 12px;font-variant-numeric:tabular-nums}
.rg-stats b{font-size:20px;font-weight:var(--biu-font-weight-semibold);letter-spacing:-.03em}
.rg-stats em{display:block;font-style:normal;font-size:11px;color:#6d6d72;margin-top:2px}
.rg-runs{display:flex;gap:6px;padding:0 16px 10px;flex-wrap:wrap}
.rg-run{height:var(--biu-size-control-md);padding:0 10px;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:6px;background:#fff;font:600 11px/26px ui-sans-serif,system-ui,sans-serif;cursor:pointer;color:#3a3a3c}
.rg-run[data-on=true]{border-color:#1c1c1e;background:#1c1c1e;color:var(--biu-color-on-emphasis)}
.rg-filters{display:flex;gap:0;padding:0 8px;border-top:var(--biu-stroke-width) solid var(--biu-color-border);border-bottom:var(--biu-stroke-width) solid var(--biu-color-border);background:#fafafa}
.rg-filters button{height:34px;padding:0 12px;border:0;background:transparent;color:#6d6d72;font:600 12px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer}
.rg-filters button[data-on=true]{color:#1c1c1e;box-shadow:inset 0 -2px 0 #1c1c1e}
.rg-test{display:grid;grid-template-columns:18px minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:10px 16px;border-bottom:var(--biu-stroke-width) solid #f3f3f3;cursor:pointer}
.rg-test:hover{background:#fafafa}
.rg-test[data-open=true]{background:#f7f8fa}
.rg-dot{width:10px;height:10px;border-radius:99px;flex:0 0 auto}
.rg-name{font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold);min-width:0}
.rg-file{color:#6d6d72;font-family:ui-monospace,monospace;font-size:var(--biu-font-size-2);margin-top:2px}
.rg-ms{font-variant-numeric:tabular-nums;color:#6d6d72;font-size:var(--biu-font-size-2)}
.rg-out{padding:0 16px 12px 44px;color:#6d6d72;font-size:12.5px;border-bottom:var(--biu-stroke-width) solid #f3f3f3}
.cmp-shell{background:#fff;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:12px;overflow:hidden}
.cmp-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 18px 6px}
.cmp-head h2{margin:0;font-size:22px;font-weight:var(--biu-font-weight-semibold);letter-spacing:-.03em}
.cmp-head p{margin:6px 0 0;color:#6d6d72;font-size:var(--biu-font-size-3)}
.cmp-picks{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;padding:12px 18px 16px}
.cmp-pick{border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:12px;padding:14px 14px 12px;background:#fff;min-width:0}
.cmp-pick[data-rank="1"]{border-color:#1d1d1f;box-shadow:0 0 0 1px #1d1d1f}
.cmp-badge{display:inline-block;font:700 10px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;padding:4px 7px;border-radius:4px;margin-bottom:8px}
.cmp-pick[data-rank="1"] .cmp-badge{background:#1d1d1f;color:var(--biu-color-on-emphasis)}
.cmp-pick[data-rank="2"] .cmp-badge{background:#e8f8ee;color:#0f7a4a}
.cmp-pick[data-rank="3"] .cmp-badge,.cmp-pick[data-rank="n"] .cmp-badge{background:#f3f3f3;color:#6d6d72}
.cmp-pick h3{margin:0 0 6px;font-size:16px;font-weight:var(--biu-font-weight-semibold);letter-spacing:-.02em}
.cmp-score{font-size:28px;font-weight:var(--biu-font-weight-semibold);letter-spacing:-.04em;font-variant-numeric:tabular-nums;line-height:1}
.cmp-pick .rui-muted{margin-top:4px}
.cmp-table{width:100%;border-collapse:collapse}
.cmp-table th,.cmp-table td{padding:11px 16px;border-bottom:var(--biu-stroke-width) solid #ececec;text-align:center;vertical-align:middle;font-size:13.5px}
.cmp-table th{font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-semibold);color:#1d1d1f;background:#fafafa}
.cmp-table th:first-child,.cmp-table td:first-child{text-align:left;width:28%;color:#6d6d72;font-weight:var(--biu-font-weight-medium);background:#fafafa}
.cmp-bar{display:inline-flex;gap:3px;vertical-align:middle;margin-left:8px}
.cmp-bar i{width:14px;height:6px;border-radius:2px;background:#e8e8ed}
.cmp-bar i[data-on=true]{background:#1d1d1f}
.cmp-win{background:rgba(255,196,0,.22)}
.cmp-why{margin:0;padding:14px 18px 16px;font-size:13.5px;line-height:1.55;color:#3a3a3c;border-top:var(--biu-stroke-width) solid #ececec}
.cmp-edit{padding:12px 18px 16px;border-top:var(--biu-stroke-width) solid #ececec;background:#fafafa}
.en-shell{background:var(--biu-color-bg);border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:12px;overflow:hidden;color:var(--biu-color-text)}
.en-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 16px 8px}
.en-head h2{margin:0;font-size:16px;font-weight:var(--biu-font-weight-semibold);letter-spacing:-.02em;color:var(--biu-color-text)}
.en-head p{margin:4px 0 0;font-size:12.5px;color:var(--biu-color-text-subtle)}
.en-split{display:grid;grid-template-columns:minmax(240px,1.1fr) minmax(240px,1fr);min-height:320px}
.en-pane{padding:14px 16px;overflow:auto;min-width:0}
.en-pane+.en-pane{border-left:var(--biu-stroke-width) solid var(--biu-color-border)}
.en-passage{font-size:15px;line-height:1.75;color:var(--biu-color-text);white-space:pre-wrap}
.en-q{padding:12px 0;border-bottom:var(--biu-stroke-width) solid var(--biu-color-border)}
.en-q:last-child{border-bottom:0}
.en-opt{display:flex;align-items:flex-start;gap:8px;padding:6px 0;cursor:pointer;font-size:var(--biu-font-size-4)}
.en-opt[data-on=true]{font-weight:var(--biu-font-weight-semibold)}
.en-opt[data-ok=true]{color:var(--biu-color-ok)}
.en-opt[data-bad=true]{color:var(--biu-color-danger)}
.en-blank{display:inline-block;min-width:72px;margin:0 4px;border:0;border-bottom:1.5px solid var(--biu-color-text);background:transparent;text-align:center;color:var(--biu-color-text);font:650 14px/1.4 ui-sans-serif,system-ui,sans-serif}
.en-blank[data-ok=true]{border-color:var(--biu-color-ok);color:var(--biu-color-ok)}
.en-blank[data-bad=true]{border-color:var(--biu-color-danger);color:var(--biu-color-danger)}
.en-bank{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 12px}
.en-chip{height:28px;padding:0 10px;border-radius:99px;border:var(--biu-stroke-width) solid var(--biu-color-border);background:var(--biu-color-bg-subtle);color:var(--biu-color-text);font:600 12px/28px ui-sans-serif,system-ui,sans-serif}
.en-card{margin:12px 16px;padding:16px;border-radius:10px;background:var(--biu-color-bg-muted);border:var(--biu-stroke-width) solid var(--biu-color-border);min-height:140px;color:var(--biu-color-text)}
.en-card h3{margin:0 0 8px;font-size:15px}
.en-timer{font-variant-numeric:tabular-nums;font-weight:var(--biu-font-weight-semibold);font-size:20px;letter-spacing:-.03em}
.en-count{font-size:var(--biu-font-size-2);color:var(--biu-color-text-subtle)}
.en-row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;border-top:var(--biu-stroke-width) solid var(--biu-color-border)}
.en-col{padding:12px;min-width:0}
.en-col+.en-col{border-left:var(--biu-stroke-width) solid var(--biu-color-border)}
.en-col h4{margin:0 0 8px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--biu-color-text-subtle)}
.en-speaker{width:72px;height:72px;border-radius:50%;border:0;background:#1cb0f6;color:var(--biu-color-on-emphasis);font:700 28px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer}
.en-turtle{width:48px;height:48px;border-radius:50%;border:2px solid var(--biu-color-border);background:var(--biu-color-bg);color:var(--biu-color-text);font-size:22px;cursor:pointer}
.en-diff-eq{background:transparent}
.en-diff-add{background:#d1fae5;color:#065f46}
.en-diff-del{background:#fee2e2;color:#991b1b;text-decoration:line-through}
.en-sq{display:inline-block;width:14px;height:14px;margin:0 4px;background:#111;vertical-align:middle;cursor:pointer}
.en-sq[data-on=true]{background:#1cb0f6}
.en-para[data-on=true]{background:color-mix(in srgb,#e8c547 28%,transparent)}
.en-word{cursor:pointer;border-bottom:var(--biu-stroke-width) dotted var(--biu-color-text-subtle)}
.en-word[data-saved=true]{background:color-mix(in srgb,#1cb0f6 22%,transparent)}
.en-lock{padding:24px;text-align:center;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-3)}
.en-warn{color:var(--biu-color-danger);font-weight:var(--biu-font-weight-semibold)}
.en-hist{width:100%;border-collapse:collapse;font-size:var(--biu-font-size-2);margin-top:10px}
.en-hist th,.en-hist td{padding:6px 8px;border-bottom:var(--biu-stroke-width) solid var(--biu-color-border);text-align:left;color:var(--biu-color-text)}
.en-mark{display:inline-flex;gap:6px;flex-wrap:wrap}
.en-mark button[data-on=true]{background:#111;color:var(--biu-color-on-emphasis);border-color:#111}
.en-rubric{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}
.en-rubric b{display:block;font-size:22px;letter-spacing:-.04em;font-variant-numeric:tabular-nums}
.en-rubric>div{border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:10px;padding:10px 12px;background:var(--biu-color-bg-subtle)}
.en-rubric small{display:block;margin-top:6px;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);line-height:1.4}
.en-mark-g{border-bottom:2px solid #e32219;cursor:pointer;background:rgba(227,34,25,.08)}
.en-mark-s{border-bottom:2px dashed #e32219;cursor:pointer;background:rgba(227,34,25,.06)}
.en-mark-l{border-bottom:2px solid #1cb0f6;cursor:pointer;background:rgba(28,176,246,.1)}
.en-mark-y{border-bottom:2px solid #c9a227;cursor:pointer;background:rgba(201,162,39,.12)}
.en-pop{margin:8px 0 12px;padding:10px 12px;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:10px;background:var(--biu-color-bg);box-shadow:0 8px 24px rgba(0,0,0,.06)}
.en-pop .en-to{color:var(--biu-color-ok);font-weight:var(--biu-font-weight-semibold)}
.en-fix{display:grid;grid-template-columns:1fr 1fr;gap:0;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:10px;overflow:hidden;margin-top:10px}
.en-fix .en-col{min-height:80px}
@media (max-width:820px){.en-split,.en-row3,.en-rubric,.en-fix{grid-template-columns:1fr}}
html.dark .rui-root .rui-group,html.dark .rui-root .rui-cell,html.dark .rui-root .fit-tile,html.dark .rui-root .hv-ex,html.dark .rui-root .lc-shell,html.dark .rui-root .lc-desc,html.dark .rui-root .lc-code,html.dark .rui-root .lc-console,html.dark .rui-root .doc-shell,html.dark .rui-root .doc-stat,html.dark .rui-root .doc-filters,html.dark .rui-root .doc-list,html.dark .rui-root .doc-table th,html.dark .rui-root .ins-shell,html.dark .rui-root .ins-hit[data-on=true],html.dark .rui-root .toc-shell,html.dark .rui-root .rg-shell,html.dark .rui-root .rg-run,html.dark .rui-root .cmp-shell,html.dark .rui-root .cmp-pick,html.dark .rui-root .en-rubric>div{background:var(--biu-color-bg);color:var(--biu-color-text);border-color:var(--biu-color-border)}
html.dark .rui-root .rui-ios,html.dark .rui-root .ins-side,html.dark .rui-root .lc-codebar,html.dark .rui-root .doc-head p,html.dark .rui-root .rg-filters,html.dark .rui-root .cmp-edit,html.dark .rui-root .cmp-table th,html.dark .rui-root .cmp-table th:first-child,html.dark .rui-root .cmp-table td:first-child{background:var(--biu-color-bg-subtle);color:var(--biu-color-text-subtle)}
html.dark .rui-root .rui-sub,html.dark .rui-root .rui-section,html.dark .rui-root .rui-cell-meta,html.dark .rui-root .fit-tile em,html.dark .rui-root .hv-stats em,html.dark .rui-root .doc-stat em,html.dark .rui-root .doc-title,html.dark .rui-root .lc-title,html.dark .rui-root .lc-h,html.dark .rui-root .lc-p,html.dark .rui-root .rg-head p,html.dark .rui-root .cmp-head p,html.dark .rui-root .cmp-why{color:var(--biu-color-text)}
html.dark .rui-root .lc-topic,html.dark .rui-root .lc-ex,html.dark .rui-root .doc-bar,html.dark .rui-root .rui-chrome,html.dark .rui-root .rui-addr{background:var(--biu-color-bg-muted);color:var(--biu-color-text)}
html.dark .rui-root .doc-filter[data-on=true],html.dark .rui-root .ins-panes button[data-on=true],html.dark .rui-root .rg-filters button[data-on=true],html.dark .rui-root .lc-console-tabs [data-on=true]{color:var(--biu-color-text);box-shadow:inset 0 -2px 0 var(--biu-color-text)}
html.dark .rui-root .rg-run[data-on=true],html.dark .rui-root .cmp-pick[data-rank="1"],html.dark .rui-root .cmp-pick[data-rank="1"] .cmp-badge{background:var(--biu-color-text);color:var(--biu-color-bg);border-color:var(--biu-color-text)}
html.dark .rui-root .en-diff-add{background:color-mix(in srgb,var(--biu-color-ok) 22%,transparent);color:#86efac}
html.dark .rui-root .en-diff-del{background:color-mix(in srgb,var(--biu-color-danger) 22%,transparent);color:#fca5a5}
html.dark .rui-root .en-sq{background:var(--biu-color-text)}
`


function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function installReUIStyles() {
  if (typeof document === 'undefined') return
  let el = document.querySelector('style[data-reui]') as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.setAttribute('data-reui', '')
    document.head.appendChild(el)
  }
  if (el.textContent !== CSS) el.textContent = CSS
}

export function ReUI({ children, className }: { children?: unknown; className?: string }) {
  installReUIStyles()
  return <div className={cx('rui-root', className)}>{children as never}</div>
}

export function Card({ className, ...rest }: Record<string, unknown>) {
  return <div className={cx('rui-card', className as string)} {...rest} />
}
export function CardHeader({ className, ...rest }: Record<string, unknown>) {
  return <div className={cx('rui-card-head', className as string)} {...rest} />
}
export function CardActions({ className, ...rest }: Record<string, unknown>) {
  return <div className={cx('rui-actions', className as string)} {...rest} />
}
export function CardTitle({ className, ...rest }: Record<string, unknown>) {
  return <h3 className={cx('rui-card-title', className as string)} {...rest} />
}
export function CardDescription({ className, ...rest }: Record<string, unknown>) {
  return <p className={cx('rui-card-desc', className as string)} {...rest} />
}
export function CardContent({ className, ...rest }: Record<string, unknown>) {
  return <div className={className as string} {...rest} />
}

export function Button({
  className,
  variant = 'default',
  size,
  danger,
  type = 'button',
  ...rest
}: Record<string, unknown> & { variant?: string; size?: string; danger?: boolean }) {
  const v = danger ? 'destructive' : variant
  return (
    <button
      type={type as 'button'}
      className={cx(
        'rui-btn',
        v === 'secondary' && 'rui-btn-secondary',
        v === 'outline' && 'rui-btn-outline',
        v === 'ghost' && 'rui-btn-ghost',
        (v === 'destructive' || danger) && 'rui-btn-destructive',
        size === 'sm' && 'rui-btn-sm',
        size === 'icon' && 'rui-btn-icon',
        className as string,
      )}
      {...rest}
    />
  )
}

function grow(className?: unknown) {
  return typeof className === 'string' && /(flex-1|rui-grow|rui-fill|w-full|min-w-0 flex)/.test(className)
}
export function Input({ className, type = 'text', ...rest }: Record<string, unknown>) {
  return <input type={type as string} className={cx('rui-input', grow(className) && 'rui-grow', className as string)} {...rest} />
}
export function Textarea({ className, ...rest }: Record<string, unknown>) {
  return <textarea className={cx('rui-textarea', className as string)} {...rest} />
}
export function Select({ className, ...rest }: Record<string, unknown>) {
  return <select className={cx('rui-select', grow(className) && 'rui-grow', className as string)} {...rest} />
}
export function Label({ className, ...rest }: Record<string, unknown>) {
  return <label className={cx('rui-label', className as string)} {...rest} />
}
export function Badge({ className, variant = 'default', ...rest }: Record<string, unknown> & { variant?: string }) {
  return (
    <span
      className={cx(
        'rui-badge',
        variant === 'on' && 'rui-badge-on',
        variant === 'destructive' && 'rui-badge-destructive',
        className as string,
      )}
      {...rest}
    />
  )
}
export function TagChip({ id, label, className }: { id?: string; label: string; className?: string }) {
  const variant = id === 'ok' || id === 'on' ? 'on' : id === 'fail' || id === 'err' ? 'destructive' : 'default'
  return <Badge variant={variant} className={className}>{label}</Badge>
}
export function Table({ className, children, ...rest }: Record<string, unknown>) {
  return (
    <div className="rui-table-wrap">
      <table className={cx('rui-table', className as string)} {...rest}>
        {children as never}
      </table>
    </div>
  )
}
export function TableHeader(props: Record<string, unknown>) {
  return <thead {...props} />
}
export function TableBody(props: Record<string, unknown>) {
  return <tbody {...props} />
}
export function TableRow(props: Record<string, unknown>) {
  return <tr {...props} />
}
export function TableHead({ className, ...rest }: Record<string, unknown>) {
  return <th className={className as string} {...rest} />
}
export function TableCell({ className, ...rest }: Record<string, unknown>) {
  return <td className={className as string} {...rest} />
}
export function Tabs({ className, ...rest }: Record<string, unknown>) {
  return <div className={cx('rui-tabs', className as string)} {...rest} />
}
export function TabsTrigger({ active, className, ...rest }: Record<string, unknown> & { active?: boolean }) {
  return <Button type="button" variant={active ? 'secondary' : 'ghost'} size="sm" className={className as string} {...rest} />
}
export function Checkbox({ className, ...rest }: Record<string, unknown>) {
  return <input type="checkbox" className={cx('rui-check', className as string)} {...rest} />
}
export function Progress({ value = 0, className }: { value?: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value <= 1 ? value * 100 : value))
  return (
    <div className={cx('rui-progress', className)}>
      <i style={{ width: `${pct}%` }} />
    </div>
  )
}
export function Separator({ className }: { className?: string }) {
  return <hr className={cx('rui-sep', className)} />
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  danger,
  onConfirm,
  onCancel,
  testId = 'confirm-dialog',
}: {
  title: string
  message: unknown
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
  testId?: string
}) {
  return (
    <div className="rui-dialog-mask" role="presentation" onMouseDown={onCancel}>
      <section className="rui-dialog" role="alertdialog" data-testid={testId} onMouseDown={(e: { stopPropagation: () => void }) => e.stopPropagation()}>
        <h2>{title}</h2>
        <div>{message as never}</div>
        <div className="rui-dialog-actions">
          <Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button>
          <Button danger={danger} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </section>
    </div>
  )
}

/** ReUI Tree (reui.io/components/tree)：缩进参考线 + chevron 文件夹。 */
export type TreeNodeItem = {
  getItemMeta: () => { level: number }
  isFolder: () => boolean
  isExpanded: () => boolean
  getItemName: () => string
  getProps?: () => Record<string, unknown>
}

const TreeCtx = React.createContext({
  indent: 16,
  currentItem: null as TreeNodeItem | null,
  onToggle: undefined as undefined | ((item: TreeNodeItem) => void),
})

export function Tree({
  indent = 16,
  className,
  children,
  ...rest
}: Record<string, unknown> & { indent?: number }) {
  return (
    <TreeCtx.Provider value={{ indent, currentItem: null, onToggle: undefined }}>
      <div
        data-slot="tree"
        role="tree"
        className={cx('rui-tree', className as string)}
        style={{ ['--tree-indent' as string]: `${indent}px` }}
        {...rest}
      >
        {children as never}
      </div>
    </TreeCtx.Provider>
  )
}

export function TreeItem({
  item,
  className,
  children,
  ...rest
}: Record<string, unknown> & { item: TreeNodeItem }) {
  const parent = React.useContext(TreeCtx)
  const level = item.getItemMeta().level
  const folder = item.isFolder()
  const extra = item.getProps?.() ?? {}
  return (
    <TreeCtx.Provider value={{ ...parent, currentItem: item }}>
      <button
        type="button"
        role="treeitem"
        data-slot="tree-item"
        data-folder={folder}
        data-level={level}
        aria-expanded={folder ? item.isExpanded() : undefined}
        className={cx('rui-tree-item', className as string)}
        style={{ ['--tree-padding' as string]: `${level * parent.indent}px` }}
        {...extra}
        {...rest}
      >
        {children as never}
      </button>
    </TreeCtx.Provider>
  )
}

export function TreeItemLabel({
  item: propItem,
  children,
  className,
  onToggle,
  ...rest
}: Record<string, unknown> & { item?: TreeNodeItem; onToggle?: () => void }) {
  const { currentItem } = React.useContext(TreeCtx)
  const item = propItem || currentItem
  if (!item) return null
  const folder = item.isFolder()
  return (
    <span data-slot="tree-item-label" className={cx('rui-tree-label', className as string)} {...rest}>
      {folder ? (
        <svg
          className="rui-tree-chevron"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          onClick={(event: { stopPropagation: () => void }) => {
            event.stopPropagation()
            onToggle?.()
          }}
        >
          <path d="M4.5 6.5 8 10l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <i className="rui-tree-dot" />
      )}
      {children ?? item.getItemName()}
    </span>
  )
}

/** Apple Activity 同心环。value 0–1。 */
export function ActivityRings({
  rings,
  size = 148,
}: {
  rings: Array<{ value: number; color: string }>
  size?: number
}) {
  const stroke = 12
  const gap = 4
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {rings.map((ring, i) => {
        const r = size / 2 - stroke / 2 - i * (stroke + gap)
        const c = 2 * Math.PI * r
        const pct = Math.min(1, Math.max(0, ring.value))
        return (
          <g key={i}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ring.color} strokeOpacity={0.2} strokeWidth={stroke} />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={ring.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - pct)}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </g>
        )
      })}
    </svg>
  )
}

export function Group({ className, ...rest }: Record<string, unknown>) {
  return <div className={cx('rui-group', className as string)} {...rest} />
}
export function Cell({ className, ...rest }: Record<string, unknown>) {
  return <div className={cx('rui-cell', className as string)} {...rest} />
}
export function Chrome({ className, ...rest }: Record<string, unknown>) {
  return <div className={cx('rui-chrome', className as string)} {...rest} />
}
export function Traffic() {
  return (
    <span className="rui-traffic" aria-hidden>
      <i className="r" />
      <i className="y" />
      <i className="g" />
    </span>
  )
}
