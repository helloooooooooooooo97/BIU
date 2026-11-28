/** File System 页面样式：主界面挂载时注入一次。 */
const STYLE_ID = 'biu-core-file-system-ui-style'

const CSS = `

.fsdb-data-overview{display:flex;min-width:0;min-height:0;flex:1;flex-direction:column;overflow:hidden}
.fsdb-source-table{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%;margin:0;padding:0;border:0;background:transparent;color:inherit;cursor:pointer;font:inherit;text-align:left}
.fsdb-source-table .fsdb-title-text{color:var(--biu-color-text);font-weight:var(--biu-font-weight-medium)}
.fsdb-page{display:flex;min-width:0;min-height:0;flex:1;flex-direction:row;overflow:hidden;background:var(--biu-color-bg);color:var(--biu-color-text);font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,sans-serif,"Apple Color Emoji","Segoe UI Emoji";font-size:var(--biu-font-size-4);letter-spacing:-.011em}
.fsdb-right{display:flex;min-width:0;min-height:0;flex:1;flex-direction:column;overflow:hidden}
.fsdb-right .chat-view-header{flex:none}
.chat-view-header:has(.fsdb-share-panel),.fsdb-right .chat-view-header:has(.fsdb-share-panel),.chat-view-header:has(.fsdb-layout-menu){z-index:var(--biu-z-dropdown)}
.fsdb-crumbs{display:flex;min-width:0;align-items:center;gap:0}
.fsdb-crumbs.is-leaf-only .fsdb-crumb:not(:last-child){display:none}
.fsdb-crumb{display:inline-flex;min-width:0;align-items:center;gap:0}
.fsdb-crumb-sep{flex:none;padding:0 8px;color:var(--biu-color-text-muted);opacity:.5;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium)}
.fsdb-crumb-btn{display:inline-flex;min-width:0;max-width:180px;align-items:center;gap:6px;height:var(--biu-size-control-md);border:0;border-radius:6px;background:transparent;padding:0 4px;color:var(--biu-color-text);font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);cursor:pointer}
.fsdb-crumb-btn *,.fsdb-crumb-option *,.fsdb-crumb-create *{cursor:inherit}
.fsdb-crumb-btn svg,.fsdb-crumb-option svg,.fsdb-crumb-create svg,.fsdb-record-mark svg{pointer-events:none}
.fsdb-page .tasks-table .fsdb-cellselect-trigger *,.fsdb-page .tasks-table .db-cell-select-trigger *,.fsdb-page .tasks-table .db-cell-multi-box *,.fsdb-page .tasks-table .fsdb-boolbtn *,.fsdb-page .tasks-table .fsdb-scope-tag *,.fsdb-page .tasks-table .biu-tag *,.fsdb-page .tasks-table .tasks-icon-btn *,.fsdb-page .tasks-table .tasks-title-open *,.fsdb-page .tasks-table .tasks-tree-toggle *{cursor:inherit}
.fsdb-page .tasks-table svg{pointer-events:none}
.fsdb-page .tasks-table tr.is-link{cursor:pointer}
.fsdb-crumb-btn:hover,.fsdb-crumb-btn.is-open{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-crumb .fsdb-crumb-btn,.fsdb-crumb:last-child .fsdb-crumb-btn,.fsdb-crumb:last-child .fsdb-crumb-btn:hover,.fsdb-crumb:last-child .fsdb-crumb-btn.is-open{color:var(--biu-color-text)}
.fsdb-crumb-btn.is-open{anchor-name:--fsdb-crumb}
.fsdb-crumb svg,.fsdb-crumb-btn svg,.fsdb-crumb .chat-view-project-icon,.fsdb-crumb .fsdb-record-mark{color:var(--biu-color-icon)}
.chat-view-header .fsdb-crumb svg,.chat-view-header .fsdb-crumb-btn svg,.chat-view-header .fsdb-crumb .chat-view-project-icon,.chat-view-header .fsdb-crumb .fsdb-record-mark{color:var(--biu-color-icon-active)}
.inspector-crumb-tab.is-active .fsdb-crumb svg,.inspector-crumb-tab.is-active .fsdb-crumb-btn svg,.inspector-crumb-tab.is-active .fsdb-crumb .chat-view-project-icon,.inspector-crumb-tab.is-active .fsdb-crumb .fsdb-record-mark{color:var(--biu-color-icon-active)}
.fsdb-crumb-btn .chat-view-project-name,.fsdb-crumb-option .chat-view-project-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);color:inherit}
.fsdb-crumb-btn>svg,.fsdb-crumb-btn>.fsdb-record-mark,.fsdb-crumb-btn>.fsdb-record-emoji,.fsdb-crumb-option>svg,.fsdb-crumb-option>.fsdb-record-mark,.fsdb-crumb-option>.fsdb-record-emoji{flex:none}
.fsdb-crumb-pick{position:relative;flex:none}
.fsdb-crumb-menu{position:absolute;left:0;top:calc(100% + 4px);z-index:var(--biu-z-float);display:flex;flex-direction:column;gap:var(--biu-gap-flyout);min-width:220px;max-width:280px;max-height:280px;overflow:hidden;border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);background:var(--biu-color-bg-popover);padding:var(--biu-pad-flyout);box-shadow:var(--biu-shadow-popover)}
.fsdb-crumb-menu.is-fixed{position:fixed;z-index:140;left:anchor(--fsdb-crumb left);top:calc(anchor(--fsdb-crumb bottom) + 4px)}
.fsdb-crumb-search{display:flex;flex:none;align-items:center;gap:6px;margin:0;border:0;border-radius:6px;padding:var(--biu-pad-flyout-item);color:var(--biu-color-icon);background:transparent}
.fsdb-crumb-search input{flex:1;min-width:0;border:0;background:transparent;color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-4);outline:none}
.fsdb-crumb-search input::placeholder{color:var(--biu-color-text-placeholder)}
.fsdb-crumb-menu-list{display:flex;flex-direction:column;gap:var(--biu-gap-flyout);min-height:0;flex:1;overflow:auto}
.fsdb-crumb-empty{padding:8px;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-3)}
.fsdb-crumb-menu-foot{flex:none;border-top:var(--biu-stroke-width) solid color-mix(in srgb,var(--biu-color-text) 12%,transparent);margin-top:2px;padding-top:4px}
.fsdb-crumb-create{display:flex;width:100%;min-width:0;align-items:center;gap:6px;border:0;border-radius:6px;background:transparent;padding:var(--biu-pad-flyout-item);color:var(--biu-color-text-muted);font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);text-align:left;cursor:pointer}
.fsdb-crumb-create:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-crumb-option{display:flex;width:100%;min-width:0;align-items:center;gap:6px;border:0;border-radius:6px;background:transparent;padding:var(--biu-pad-flyout-item);color:var(--biu-color-text-muted);font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);text-align:left;cursor:pointer}
.fsdb-crumb-option:hover,.fsdb-crumb-option.is-active{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-crumb-option svg,.fsdb-crumb-option .chat-view-project-icon,.fsdb-crumb-option .fsdb-record-mark,.fsdb-crumb-create svg{color:var(--biu-color-icon)}
.fsdb-crumb-option:hover svg,.fsdb-crumb-option.is-active svg,.fsdb-crumb-option:hover .chat-view-project-icon,.fsdb-crumb-option.is-active .chat-view-project-icon,.fsdb-crumb-option:hover .fsdb-record-mark,.fsdb-crumb-option.is-active .fsdb-record-mark,.fsdb-crumb-create:hover svg{color:var(--biu-color-icon-active)}
.fsdb-right-body{display:flex;min-width:0;min-height:0;flex:1;flex-direction:column;overflow:auto}
.fsdb-right-body:has(.tasks-table-wrap){overflow-anchor:none}
.fsdb-right-body .app-pane-in{display:flex;flex-direction:column;min-width:0;min-height:0;flex:1}
.fsdb-right-body:has(.fsdb-detail-stage) .app-pane-in,.fsdb-right-body:has(.fsdb-main) .app-pane-in{flex:none;width:100%;align-self:stretch;min-height:min-content;height:auto;overflow:visible}
.fsdb-right-body:has(> * > .fsdb-workspace > .fsdb-pager){overflow:auto}
.fsdb-right-body:has(> * > .fsdb-workspace > .fsdb-pager)>*,.fsdb-right-body:has(> * > .fsdb-workspace > .fsdb-pager) .fsdb-main{display:flex;flex-direction:column;min-height:min-content;flex:none;height:auto;overflow:visible}
.inspector-database-page .fsdb-right-body{overflow:auto}
.inspector-database-page .fsdb-right-body>*,.inspector-database-page .fsdb-main{display:flex;flex-direction:column;min-height:min-content;flex:none;height:auto;overflow:visible}
.fsdb-page:has(.fsdb-query-menu),.fsdb-page:has(.tasks-sort-menu),.fsdb-page:has(.tasks-filter-menu),.fsdb-page:has(.tasks-viewdd-menu){position:relative;z-index:var(--biu-z-dropdown);overflow:visible}
.fsdb-page:has(.fsdb-query-menu) .fsdb-main,.fsdb-page:has(.tasks-sort-menu) .fsdb-main,.fsdb-page:has(.tasks-filter-menu) .fsdb-main,.fsdb-page:has(.tasks-viewdd-menu) .fsdb-main{overflow:visible}
.fsdb-page:has(.fsdb-query-menu) .fsdb-right,.fsdb-page:has(.fsdb-query-menu) .fsdb-right-body,.fsdb-page:has(.tasks-sort-menu) .fsdb-right,.fsdb-page:has(.tasks-sort-menu) .fsdb-right-body,.fsdb-page:has(.tasks-filter-menu) .fsdb-right,.fsdb-page:has(.tasks-filter-menu) .fsdb-right-body,.fsdb-page:has(.tasks-viewdd-menu) .fsdb-right,.fsdb-page:has(.tasks-viewdd-menu) .fsdb-right-body{overflow:auto}
.fsdb-page:has(.fsdb-query-menu) .fsdb-workspace,.fsdb-page:has(.tasks-sort-menu) .fsdb-workspace,.fsdb-page:has(.tasks-filter-menu) .fsdb-workspace,.fsdb-page:has(.tasks-viewdd-menu) .fsdb-workspace{min-height:0;overflow:hidden}
.fsdb-right-body:has(.fsdb-detail-stage){overflow:auto;scroll-padding-bottom:72px}
.fsdb-views{display:flex;width:100%;max-width:none;min-width:0;flex:1;flex-direction:column;min-height:0;overflow:hidden;box-sizing:border-box;color:var(--biu-color-text-muted);font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);line-height:1.2;letter-spacing:normal}
.fsdb-page>.fsdb-views{width:var(--sidebar-col,var(--biu-sidebar-min,160px));max-width:var(--biu-sidebar-max,360px);flex:none}
.fsdb-views .chat-session-row-main{border:0;background:transparent;color:inherit;cursor:default}
.fsdb-views .chat-session-row-main button{cursor:default}
.fsdb-views .chat-session-row:hover,.fsdb-views .sidebar-group-head:hover{color:var(--biu-color-text)}
.fsdb-views .chat-session-row-delete,.fsdb-views .chat-session-row-star{cursor:pointer}
.fsdb-main{box-sizing:border-box;width:100%;max-width:none;margin-inline:0;display:flex;min-width:0;min-height:min-content;flex:none;flex-direction:column;gap:10px;padding:0 0 16px;overflow:visible}
.fsdb-main > :not(.fsdb-page-banner){box-sizing:border-box;width:100%;max-width:var(--biu-chat-max-width);margin-inline:auto;padding-right:var(--biu-pad-page);padding-left:var(--biu-pad-page)}
.fsdb-main:not(:has(> .fsdb-page-banner)){padding-top:80px}
.fsdb-page.is-full-width .fsdb-main > :not(.fsdb-page-banner),.fsdb-page.is-full-width .fsdb-detail-main > :not(.fsdb-page-banner){max-width:none}
.fsdb-page{--fsdb-pager-lift:calc(1rem + 44px + 25px + 25px - 30px);--fsdb-check-gutter:26px;--fsdb-row-tools-w:72px}
.fsdb-page:not(.inspector-database-page) .fsdb-main{padding-bottom:var(--fsdb-pager-lift)}
.inspector-database-page .fsdb-main{padding-bottom:0}
.fsdb-agent-follow{display:flex;min-width:0;min-height:0;flex:1;flex-direction:column;overflow:hidden}
.fsdb-agent-follow.is-working{box-shadow:inset 0 2px 0 var(--biu-color-emphasis)}
.fsdb-main > .fsdb-detail-title-row,.fsdb-main > .fsdb-detail-icon-slot{flex:none}
.fsdb-page:not(.is-sheet) .fsdb-main > .fsdb-detail-title-row,.fsdb-page:not(.is-sheet) .fsdb-main > .fsdb-detail-icon-slot,.fsdb-page:not(.is-sheet) .fsdb-main > .tasks-toolbar{padding-left:var(--biu-pad-page);box-sizing:border-box}
.fsdb-page .tasks-toolbar{position:relative;z-index:50;display:flex;gap:12px;align-items:center;justify-content:space-between;min-width:0;flex:none;flex-wrap:nowrap;height:var(--biu-size-control-md);min-height:var(--biu-size-control-md)}
.fsdb-page .fsdb-main > .tasks-toolbar,.fsdb-page .fsdb-detail-main > .tasks-toolbar{box-sizing:border-box;height:calc(var(--biu-size-control-md) + 10px);min-height:calc(var(--biu-size-control-md) + 10px);padding-top:10px}
.fsdb-page .tasks-toolbar:has(.fsdb-query-menu),.fsdb-page .tasks-toolbar:has(.tasks-sort-menu),.fsdb-page .tasks-toolbar:has(.tasks-filter-menu),.fsdb-page .tasks-toolbar:has(.tasks-viewdd-menu){z-index:var(--biu-z-dropdown)}
.fsdb-page .tasks-toolbar-left{position:relative;z-index:2;display:flex;align-items:center;gap:6px;flex:0 0 auto;min-width:0}
.fsdb-page .tasks-toolbar:has(.fsdb-query-menu) .tasks-toolbar-left,.fsdb-page .tasks-toolbar:has(.tasks-sort-menu) .tasks-toolbar-left,.fsdb-page .tasks-toolbar:has(.tasks-filter-menu) .tasks-toolbar-left{z-index:0}
.fsdb-locked-filter{display:inline-flex;align-items:center;height:var(--biu-size-control-md);padding:0 8px;border-radius:8px;background:color-mix(in srgb,var(--biu-color-text) 12%,transparent);color:var(--biu-color-text);font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold);cursor:default}
.fsdb-page .tasks-toolbar-right{position:relative;z-index:1;display:flex;align-items:center;gap:2px;flex:0 1 auto;min-width:0;flex-wrap:nowrap;margin-left:auto;height:var(--biu-size-control-md)}
.fsdb-page .tasks-toolbar-right > *{flex-shrink:0}
.fsdb-page .tasks-toolbar-right > [data-toolbar-hidden]{display:none}
.fsdb-page .tasks-toolbar-left .tasks-viewdd-wrap,.fsdb-page .tasks-toolbar-left .tasks-viewtabs,.fsdb-page .tasks-toolbar-left .tasks-viewdd-btn{min-width:0;max-width:100%}
.fsdb-views-error{display:inline-flex;align-items:center;gap:8px;max-width:min(420px,46vw);margin-right:6px;padding:4px 8px;border-radius:8px;background:color-mix(in srgb,var(--biu-color-danger) 12%,transparent);color:var(--biu-color-danger);font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-semibold);line-height:1.35}
.fsdb-views-error button{flex:none;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;text-decoration:underline}
.fsdb-page .tasks-toolbar-right:has(.fsdb-query-menu),.fsdb-page .tasks-toolbar-right:has(.tasks-sort-menu),.fsdb-page .tasks-toolbar-right:has(.tasks-filter-menu){z-index:var(--biu-z-float)}
.fsdb-page .tasks-sort-wrap:has(.fsdb-query-menu),.fsdb-page .tasks-sort-wrap:has(.tasks-sort-menu),.fsdb-page .tasks-filter-btn-wrap:has(.fsdb-query-menu),.fsdb-page .tasks-filter-btn-wrap:has(.tasks-filter-menu){z-index:var(--biu-z-float)}
.fsdb-bulk-slot{position:relative;z-index:3;display:inline-flex;flex:none;align-items:center}
.fsdb-bulk{display:inline-flex;align-items:center;gap:2px;height:var(--biu-size-control-md);margin:0;padding:0 4px 0 8px;border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-sm);background:var(--biu-color-bg-popover);box-shadow:var(--biu-shadow-popover);color:var(--biu-color-text)}
.fsdb-bulk-count{min-width:1.25em;padding:0 6px 0 0;color:var(--biu-color-emphasis);font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold);white-space:nowrap;cursor:pointer}
.fsdb-bulk .tasks-icon-btn{color:var(--biu-color-icon)}
.fsdb-bulk-more{position:relative;display:inline-flex}
.fsdb-bulk-menu{position:absolute;top:calc(100% + 6px);left:0;z-index:40;min-width:160px;width:max-content;padding:var(--biu-pad-flyout);background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);box-shadow:var(--biu-shadow-popover);display:flex;flex-direction:column;gap:var(--biu-gap-flyout);font-weight:var(--biu-font-weight-medium)}
.fsdb-bulk-menu.is-fixed{position:fixed;right:auto;margin:0;min-width:160px;width:max-content}
.fsdb-tool-flyout .tasks-sort-item,.fsdb-bulk-menu .tasks-sort-item{display:flex;align-items:center;justify-content:flex-start;width:100%;border:0;background:transparent;color:var(--biu-color-text-muted);cursor:pointer;text-align:left}
.fsdb-tool-flyout .tasks-sort-item-label,.fsdb-bulk-menu .tasks-sort-item-label{display:inline-flex;align-items:center;gap:6px;min-width:0}
.fsdb-tool-flyout .tasks-sort-item-label svg,.fsdb-bulk-menu .tasks-sort-item-label svg{flex:none;display:block;color:var(--biu-color-icon)}
.fsdb-bulk-form{display:flex;flex-direction:column;gap:8px}
.fsdb-bulk-label{display:flex;flex-direction:column;gap:4px;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-medium);color:var(--biu-color-text-muted)}
.fsdb-layout-wrap{position:relative;display:inline-flex}
.fsdb-layout-menu{position:absolute;top:calc(100% + 6px);right:0;z-index:var(--biu-z-dropdown);display:flex;flex-direction:column;gap:var(--biu-gap-flyout);min-width:280px;padding:var(--biu-pad-flyout);background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);box-shadow:var(--biu-shadow-popover)}
.fsdb-layout-menu.is-anchored{position:static;top:auto;right:auto;z-index:auto;min-width:0;width:100%;margin:0;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none}
.fsdb-layout-row{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;margin:0;border:0;border-radius:7px;padding:6px 8px;background:transparent;color:var(--biu-color-text-muted);font-family:inherit;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-medium);cursor:pointer;text-align:left}
.fsdb-layout-row:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-layout-row.is-on{color:var(--biu-color-text)}
.fsdb-layout-row .fsdb-group-switch{flex:none}
.fsdb-layout-label{display:inline-flex;align-items:center;gap:8px;min-width:0}
.fsdb-layout-row svg,.fsdb-layout-scale svg{flex:none;display:block;width:16px;height:16px;color:var(--biu-color-icon)}
.fsdb-layout-row:hover svg,.fsdb-layout-row.is-on svg{color:var(--biu-color-icon-active)}
.fsdb-layout-scale{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;box-sizing:border-box;min-height:var(--biu-size-control-lg);padding:6px 8px;border-radius:7px;color:var(--biu-color-text-muted);font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium)}
.fsdb-layout-scale .fsdb-layout-label{color:inherit;font-size:inherit;font-weight:inherit}
.fsdb-layout-pills{display:flex;gap:2px;flex:none}
.fsdb-layout-opt{display:grid;place-items:center;min-width:28px;height:24px;padding:0 8px;border:0;border-radius:7px;background:transparent;color:var(--biu-color-text);font-family:inherit;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-medium);cursor:pointer}
.fsdb-layout-opt:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-layout-opt.is-active{color:var(--biu-color-text);background:var(--biu-color-bg-hover)}
.fsdb-create-group{position:relative;display:inline-flex;align-items:stretch;margin-left:var(--biu-space-2);border-radius:var(--biu-radius-sm);background:var(--biu-color-emphasis)}
.fsdb-create-btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--biu-space-1);height:var(--biu-size-control-md);margin:0;padding:0 var(--biu-space-2);border:0;border-radius:var(--biu-radius-sm) 0 0 var(--biu-radius-sm);background:transparent;color:var(--biu-color-on-emphasis);cursor:pointer;font:inherit;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);white-space:nowrap}
.fsdb-create-group:not(:has(.fsdb-create-scope-wrap)) .fsdb-create-btn{border-radius:var(--biu-radius-sm)}
.fsdb-create-btn:hover{background:color-mix(in srgb,#000 8%,var(--biu-color-emphasis))}
.fsdb-create-scope-wrap{display:inline-flex;align-items:stretch;position:relative}
.fsdb-create-scope{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:var(--biu-size-control-md);height:var(--biu-size-control-md);margin:0;padding:0;border:0;border-radius:0 var(--biu-radius-sm) var(--biu-radius-sm) 0;background:color-mix(in srgb,#000 8%,var(--biu-color-emphasis));color:var(--biu-color-on-emphasis);cursor:pointer}
.fsdb-create-scope:hover{background:color-mix(in srgb,#000 14%,var(--biu-color-emphasis))}
.fsdb-page .fsdb-create-btn,.fsdb-page .fsdb-create-scope,.fsdb-page .fsdb-create-scope .fsdb-ui-glyph{color:var(--biu-color-on-emphasis);-webkit-text-fill-color:var(--biu-color-on-emphasis)}
.fsdb-page .fsdb-create-scope .fsdb-ui-glyph{background:var(--biu-color-on-emphasis)}
.fsdb-create-scope-menu{position:absolute;top:calc(100% + 4px);right:0;z-index:40;display:flex;flex-direction:column;gap:2px;min-width:120px;padding:6px;background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);box-shadow:var(--biu-shadow-popover)}
.fsdb-create-scope-menu button{display:inline-flex;align-items:center;gap:6px;width:100%;border:0;border-radius:7px;padding:6px 8px;background:transparent;color:var(--biu-color-text-muted);font:inherit;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);cursor:pointer;text-align:left}
.fsdb-create-scope-menu button:hover,.fsdb-create-scope-menu button.is-on{background:var(--biu-color-bg-hover)}
.fsdb-page .tasks-search-wrap{position:relative;z-index:4;display:inline-flex;align-items:center;gap:0;flex:none;min-width:0;height:var(--biu-size-control-md);min-height:var(--biu-size-control-md);max-height:var(--biu-size-control-md);padding:0;border:0;border-radius:8px;background:transparent;color:var(--biu-color-icon)}
.fsdb-page .tasks-search-wrap.is-open{flex:none;color:var(--biu-color-icon-active)}
.fsdb-page .tasks-search-wrap.is-open .tasks-sort-btn{position:relative;z-index:2}
.fsdb-page .tasks-search-wrap.is-open .tasks-sort-btn,.fsdb-page .tasks-search-wrap:hover .tasks-sort-btn{color:var(--biu-color-icon-active)}
.fsdb-page .tasks-search{flex:none;box-sizing:border-box;border:0;background:transparent;color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);line-height:var(--biu-size-control-md);outline:none;min-width:0;height:var(--biu-size-control-md);padding:0 4px 0 0}
.fsdb-page .tasks-search-wrap.is-open .tasks-search{position:absolute;top:0;right:100%;width:140px;padding:0 8px;border-radius:8px;background:var(--biu-color-bg)}
.fsdb-page .tasks-toolbar-right.is-searching{flex:1;min-width:0}
.fsdb-page .tasks-toolbar-right.is-searching .tasks-search-wrap{flex:1}
.fsdb-page .tasks-toolbar-right.is-searching .tasks-search{position:static;flex:1;order:-1;width:0;padding:0 8px}

.fsdb-page .tasks-search-wrap.is-open.is-find .tasks-search{width:168px}
.fsdb-page .tasks-search-wrap.is-open.is-find .page-find-count,.fsdb-page .tasks-search-wrap.is-open.is-find .page-find-btn{position:absolute;top:0;height:var(--biu-size-control-md)}
.fsdb-page .tasks-search-wrap.is-open.is-find .page-find-count{right:calc(100% + 44px);display:inline-flex;align-items:center}
.fsdb-page .tasks-search-wrap.is-open.is-find .page-find-btn:nth-of-type(2){right:calc(100% + 22px)}
.fsdb-page .tasks-search-wrap.is-open.is-find .page-find-btn:nth-of-type(3){right:100%}
.fsdb-page .tasks-search-wrap.is-open.is-find .tasks-search{right:calc(100% + 70px)}
.fsdb-page .tasks-toolbar-right.is-searching .tasks-search-wrap.is-find .tasks-search{position:static;right:auto;width:0;flex:1}
.fsdb-page .tasks-toolbar-right.is-searching .tasks-search-wrap.is-find > .page-find-count,.fsdb-page .tasks-toolbar-right.is-searching .tasks-search-wrap.is-find > .page-find-btn{position:static;flex:none}

.fsdb-page .tasks-refresh,.fsdb-page .tasks-sort-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:28px;height:var(--biu-size-control-md);padding:0;border:0;border-radius:8px;background:transparent;color:var(--biu-color-icon);cursor:pointer;font:inherit;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-semibold)}
.fsdb-page .tasks-refresh:hover,.fsdb-page .tasks-sort-btn:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-icon-active)}
.fsdb-page .tasks-refresh:disabled{cursor:default;opacity:1}
.fsdb-refresh-wrap{position:relative;display:inline-flex}
.fsdb-spin{animation:fsdb-spin .7s linear infinite}
@keyframes fsdb-spin{to{transform:rotate(360deg)}}
.fsdb-refresh-toast{position:absolute;top:calc(100% + 8px);right:0;z-index:50;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;border-radius:8px;padding:7px 10px;background:var(--biu-color-bg-subtle);border:var(--biu-stroke-width) solid var(--biu-color-border);box-shadow:var(--biu-shadow-md);color:var(--biu-color-text);font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-semibold)}
.fsdb-refresh-toast svg{color:var(--biu-color-ok)}
.fsdb-page .tasks-sort-btn.is-active,.fsdb-page .tasks-refresh.is-active{color:var(--biu-color-icon-active)}
.fsdb-page .tasks-sort-btn.is-custom{color:var(--biu-color-icon-active)}
.fsdb-page .tasks-sort-dot{position:absolute;top:4px;right:4px;width:5px;height:5px;border-radius:50%;background:var(--biu-color-icon-dot)}
.fsdb-page .tasks-viewdd-wrap,.fsdb-page .tasks-sort-wrap,.fsdb-page .tasks-filter-btn-wrap{position:relative;display:inline-flex}
.fsdb-page .tasks-viewdd-wrap{flex:none;min-width:min-content;align-items:center;gap:2px}
.fsdb-page .tasks-viewdd-wrap:has(.tasks-viewdd-menu){z-index:var(--biu-z-float)}
.fsdb-page .tasks-viewtabs{display:flex;align-items:center;gap:2px;overflow:visible;flex:none;min-width:min-content}
.fsdb-page .tasks-viewdd-btn{display:inline-flex;box-sizing:border-box;align-items:center;gap:6px;height:var(--biu-size-control-md);border:0;border-radius:6px;padding:0 8px;background:transparent;color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);cursor:pointer;flex:none}
.fsdb-page .tasks-viewdd-btn svg,.fsdb-page .tasks-viewdd-btn .fsdb-ui-glyph{color:var(--biu-color-icon)}
.fsdb-page .tasks-viewtab.is-active svg,.fsdb-page .tasks-viewdd-btn.is-active svg{color:var(--biu-color-icon-active)}
.fsdb-page .tasks-viewtab.is-active{background:var(--biu-color-bg-hover)}
.fsdb-page .tasks-viewdd-btn:hover,.fsdb-page .tasks-viewdd-btn.is-active{background:var(--biu-color-bg-hover)}
.fsdb-page .tasks-viewdd-name{max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-page .tasks-viewdd-menu,.fsdb-page .tasks-sort-menu,.fsdb-page .tasks-filter-menu,.fsdb-page .fsdb-query-menu{position:absolute;top:calc(100% + 6px);z-index:40;min-width:180px;padding:var(--biu-pad-flyout);background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);box-shadow:var(--biu-shadow-popover);display:flex;flex-direction:column;gap:var(--biu-gap-flyout);color:var(--biu-color-text-muted);font-weight:var(--biu-font-weight-medium)}
.fsdb-page .fsdb-query-menu,.fsdb-page .tasks-sort-menu,.fsdb-page .tasks-filter-menu,.fsdb-page .tasks-viewdd-menu{z-index:120}
.fsdb-query-flyout.fsdb-page{position:relative;display:flex;flex:none;flex-direction:column;align-items:flex-end;overflow:visible;background:transparent;min-width:0;min-height:0;width:max-content;max-width:min(calc(100vw - 16px),var(--radix-popover-content-available-width,100vw))}
.fsdb-query-flyout.fsdb-page.is-start{align-items:flex-start}
.fsdb-query-flyout .fsdb-query-menu,.fsdb-query-flyout .tasks-sort-menu,.fsdb-query-flyout .tasks-filter-menu,.fsdb-query-flyout .tasks-viewdd-menu{position:relative;top:auto;left:auto;right:auto;z-index:1}
.fsdb-page .tasks-viewdd-menu{left:0;min-width:320px;overflow:hidden}
.fsdb-page .tasks-sort-menu,.fsdb-page .tasks-filter-menu,.fsdb-page .fsdb-query-menu{right:0}
.fsdb-page .fsdb-query-menu{box-sizing:border-box;overflow-x:hidden;overflow-y:auto;width:min(92vw,280px);min-width:min(92vw,240px);max-width:min(92vw,calc(100vw - 24px));max-height:min(70vh,520px)}
.fsdb-page .fsdb-query-menu.is-sort{width:min(92vw,380px);min-width:min(92vw,320px)}
.fsdb-page .fsdb-query-menu.is-filter{width:min(92vw,560px);min-width:min(92vw,360px)}
.fsdb-page .fsdb-query-menu.is-group{width:min(92vw,272px);min-width:252px;padding:10px 8px 8px;gap:2px}
.fsdb-page .fsdb-query-menu.is-group-pick{width:min(92vw,240px);min-width:200px}
.fsdb-page .fsdb-group-panel-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:30px;padding:2px 6px;border-radius:6px}
.fsdb-page .fsdb-group-panel-row:hover{background:color-mix(in srgb,var(--biu-color-bg-hover) 55%,transparent)}
.fsdb-page .fsdb-group-panel-label{flex:none;font-size:13px;color:var(--biu-color-text)}
.fsdb-page .fsdb-group-panel-row .db-cell-select{width:auto;max-width:168px;flex:0 1 auto}
.fsdb-page .fsdb-group-panel-row .db-cell-select.is-field{display:inline-flex;width:auto}
.fsdb-page .fsdb-group-panel-row .db-cell-select .db-cell-select-trigger{display:inline-flex;align-items:center;justify-content:flex-end;gap:4px;width:auto;min-height:26px;height:26px;padding:0 4px 0 6px;border:0;border-radius:6px;background:transparent;color:var(--biu-color-text-muted);font-weight:var(--biu-font-weight-normal)}
.fsdb-page .fsdb-group-panel-row .db-cell-select .db-cell-select-trigger:hover,.fsdb-page .fsdb-group-panel-row .db-cell-select .db-cell-select-trigger[data-open]{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-page .fsdb-group-panel-row .db-cell-select .db-cell-select-caret{opacity:.65}
.fsdb-page .fsdb-group-switch{position:relative;width:30px;height:18px;flex:none;padding:0;border:0;border-radius:999px;background:color-mix(in srgb,var(--biu-color-text-muted) 34%,transparent);cursor:pointer;transition:background .16s ease}
.fsdb-page .fsdb-group-switch.is-on{background:var(--biu-color-emphasis)}
.fsdb-page .fsdb-group-switch-thumb{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:999px;background:var(--biu-color-on-emphasis,#fff);box-shadow:0 1px 2px rgba(0,0,0,.28);transition:transform .16s ease}
.fsdb-page .fsdb-group-switch.is-on .fsdb-group-switch-thumb{transform:translateX(12px)}
.fsdb-page .fsdb-group-panel-section{display:flex;flex-direction:column;gap:2px;margin-top:6px;padding-top:8px;border-top:var(--biu-stroke-width) solid var(--biu-color-border-subtle)}
.fsdb-page .fsdb-group-panel-sec-head{display:flex;align-items:center;justify-content:space-between;padding:0 6px 4px;font-size:12px;color:var(--biu-color-text-muted)}
.fsdb-page .fsdb-group-panel-link{border:0;padding:0;background:transparent;color:var(--biu-color-emphasis);font:inherit;font-size:12px;font-weight:var(--biu-font-weight-medium);cursor:pointer}
.fsdb-page .fsdb-group-panel-link:hover{opacity:.85}
.fsdb-page .fsdb-group-panel-list{display:flex;flex-direction:column;gap:1px;max-height:220px;overflow-y:auto}
.fsdb-page .fsdb-group-panel-item{display:flex;align-items:center;gap:6px;min-height:30px;padding:3px 6px;border-radius:6px;color:var(--biu-color-text);font-size:13px;font-weight:var(--biu-font-weight-medium)}
.fsdb-page .fsdb-group-panel-item:hover{background:var(--biu-color-bg-hover)}
.fsdb-page .fsdb-group-panel-item.is-dragging{opacity:.65;background:var(--biu-color-bg-hover)}
.fsdb-page .fsdb-group-panel-item.is-hidden{color:var(--biu-color-text-muted);font-weight:var(--biu-font-weight-normal)}
.fsdb-page .fsdb-group-panel-grip{display:inline-flex;align-items:center;justify-content:center;width:14px;height:16px;padding:0;border:0;background:transparent;color:var(--biu-color-text-muted);opacity:.5;cursor:grab;flex:none}
.fsdb-page .fsdb-group-panel-item:hover .fsdb-group-panel-grip{opacity:.9}
.fsdb-page .fsdb-group-panel-grip:active{cursor:grabbing}
.fsdb-page .fsdb-group-panel-item-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-page .fsdb-group-panel-eye{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--biu-color-text-muted);opacity:.7;cursor:pointer;flex:none}
.fsdb-page .fsdb-group-panel-item:hover .fsdb-group-panel-eye{opacity:1}
.fsdb-page .fsdb-group-panel-eye:hover{background:var(--biu-color-bg-hover-strong,var(--biu-color-bg-subtle));color:var(--biu-color-text)}
.fsdb-page .fsdb-group-panel-empty{padding:4px 6px;font-size:12px;color:var(--biu-color-text-muted)}
.fsdb-page .fsdb-group-panel-clear{display:flex;align-items:center;gap:6px;width:100%;margin-top:6px;padding:6px;border:0;border-top:var(--biu-stroke-width) solid var(--biu-color-border-subtle);border-radius:0 0 6px 6px;background:transparent;color:var(--biu-color-text-muted);font:inherit;font-size:12.5px;cursor:pointer}
.fsdb-page .fsdb-group-panel-clear:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-danger)}
.fsdb-page .fsdb-vset{width:400px;max-width:min(460px,calc(100vw - 16px));padding:10px 12px 12px;display:flex;flex-direction:column;gap:10px;background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);box-shadow:var(--biu-shadow-popover);font-size:14px}
.fsdb-page .fsdb-vset-tabs{display:flex;align-items:center;gap:4px;padding-bottom:10px;border-bottom:var(--biu-stroke-width) solid var(--biu-color-border-subtle);overflow-x:auto;scrollbar-width:none}
.fsdb-page .fsdb-vset-tabs::-webkit-scrollbar{display:none}
.fsdb-page .fsdb-vset-tab{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:5px;height:30px;padding:0 10px;border:0;border-radius:7px;background:transparent;color:var(--biu-color-text-muted);font:inherit;font-size:14px;font-weight:var(--biu-font-weight-medium);white-space:nowrap;cursor:pointer;flex:none;transition:background 120ms ease,color 120ms ease}
.fsdb-page .fsdb-vset-tab:hover{background:color-mix(in srgb,var(--biu-color-bg-hover) 65%,transparent);color:var(--biu-color-text)}
.fsdb-page .fsdb-vset-tab.is-active{background:var(--biu-color-bg-hover);color:var(--biu-color-text);font-weight:var(--biu-font-weight-semibold)}
.fsdb-page .fsdb-vset-tab-dot{width:5px;height:5px;border-radius:999px;background:var(--biu-color-emphasis);flex:none}
.fsdb-page .fsdb-vset-body{display:flex;flex-direction:column;gap:4px;min-width:0;max-height:min(64vh,460px);overflow-y:auto;overflow-x:hidden;font-size:14px}
.fsdb-page .fsdb-vset-body > .fsdb-tool-flyout,.fsdb-page .fsdb-vset-body > .fsdb-query-menu,.fsdb-page .fsdb-vset-body .fsdb-group-panel-section > .fsdb-tool-flyout{position:static;top:auto;left:auto;right:auto;width:100%;min-width:0;max-width:none;max-height:none;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;overflow:visible;font-size:14px}
.fsdb-page .fsdb-vset .fsdb-group-panel-row,.fsdb-page .fsdb-vset .fsdb-group-acc-btn{min-height:34px;padding:4px 8px;border-radius:7px}
.fsdb-page .fsdb-vset .fsdb-group-acc-btn{color:var(--biu-color-text)}
.fsdb-page .fsdb-vset .fsdb-group-acc-val{color:var(--biu-color-text-muted)}
.fsdb-page .fsdb-vset .fsdb-group-panel-row .db-cell-select .db-cell-select-trigger{border:0;background:transparent;height:28px;min-height:28px;padding:0 6px;font-size:14px;color:var(--biu-color-text-muted)}
.fsdb-page .fsdb-vset .fsdb-group-panel-row .db-cell-select .db-cell-select-trigger:hover,.fsdb-page .fsdb-vset .fsdb-group-panel-row .db-cell-select .db-cell-select-trigger[data-open]{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-page .fsdb-vset .fsdb-query-head{min-height:32px;padding:0 8px 8px;margin-bottom:2px;border-bottom:var(--biu-stroke-width) solid var(--biu-color-border-subtle)}
.fsdb-page .fsdb-vset .fsdb-query-foot{margin-top:8px;padding-top:8px;gap:6px}
.fsdb-page .fsdb-vset .fsdb-col-menu .tasks-sort-search{height:34px;margin-bottom:6px;padding:0 10px}
.fsdb-page .fsdb-vset .fsdb-col-menu .fsdb-checkrow{min-height:34px;padding:4px 8px}
.fsdb-page .fsdb-vset .fsdb-group-panel-clear{margin-top:8px;padding:8px 8px 2px}
.fsdb-page .fsdb-layout-menu.is-inline{position:static;top:auto;left:auto;right:auto;width:100%;min-width:0;max-width:none;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;gap:2px}
.fsdb-page .fsdb-layout-menu.is-inline .fsdb-layout-row,.fsdb-page .fsdb-layout-menu.is-inline .fsdb-layout-scale{min-height:34px;padding:4px 8px;border-radius:7px;font-size:14px;background:transparent}
.fsdb-page .fsdb-layout-menu.is-inline .fsdb-layout-row:hover{background:var(--biu-color-bg-hover)}
.fsdb-page .fsdb-layout-menu.is-inline .fsdb-layout-label{font-size:14px;color:var(--biu-color-text)}
.fsdb-collection-sandbox{display:flex;flex-direction:column;width:100%;min-width:0;min-height:360px;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:10px;background:var(--biu-color-bg);overflow:hidden}
.fsdb-collection-sandbox.is-expanded{position:fixed;inset:16px;z-index:260;height:calc(100vh - 32px);max-height:none;box-shadow:var(--biu-shadow-popover)}
.fsdb-collection-sandbox-stage{display:flex;flex:1;min-width:0;min-height:320px;overflow:hidden}
.fsdb-collection-sandbox-stage.is-split{flex-direction:row;align-items:stretch}
.fsdb-collection-sandbox-pane{flex:1 1 50%;min-width:240px;min-height:320px;display:flex;flex-direction:column;overflow:auto}
.fsdb-collection-sandbox-pane.is-code{border-left:var(--biu-stroke-width) solid var(--biu-color-border);background:var(--biu-color-surface)}
.fsdb-collection-sandbox-preview{flex:1;min-width:0;padding:12px 14px;overflow:auto}
.fsdb-collection-sandbox-editor{flex:1;min-width:0;min-height:320px;padding:10px 12px;overflow:auto}
.fsdb-page .fsdb-vset .fsdb-group-panel-label,.fsdb-page .fsdb-vset .fsdb-group-acc-btn,.fsdb-page .fsdb-vset .fsdb-group-acc-val,.fsdb-page .fsdb-vset .fsdb-group-acc-opt,.fsdb-page .fsdb-vset .fsdb-group-panel-item,.fsdb-page .fsdb-vset .fsdb-group-panel-clear,.fsdb-page .fsdb-vset .fsdb-group-panel-sec-head,.fsdb-page .fsdb-vset .fsdb-group-panel-link,.fsdb-page .fsdb-vset .fsdb-checkrow,.fsdb-page .fsdb-vset .tasks-sort-search,.fsdb-page .fsdb-vset .tasks-sort-item,.fsdb-page .fsdb-vset .fsdb-vset-mode-add{font-size:14px}
.fsdb-page .fsdb-checkrow-right{display:inline-flex;align-items:center;gap:8px;margin-left:auto;flex:none}
.fsdb-page .fsdb-col-pack-head{display:flex;align-items:center;flex:1;min-width:0;gap:6px;padding-right:6px;border-radius:6px}
.fsdb-page .fsdb-col-pack-head:hover{background:var(--biu-color-bg-hover)}
.fsdb-page .fsdb-col-pack-head .fsdb-col-pack-trigger{flex:1;min-width:0;padding-right:4px;background:transparent!important}
.fsdb-page .fsdb-col-pack-switch{flex:none}
.fsdb-page .fsdb-group-switch.is-locked{opacity:.42}
.fsdb-page .fsdb-vset-name-input{box-sizing:border-box;flex:none;width:100%;height:34px;min-height:34px;padding:0 10px;margin-bottom:4px;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:7px;background:transparent;color:var(--biu-color-text);font:inherit;font-size:14px;font-weight:var(--biu-font-weight-medium);outline:none;transition:border-color 120ms ease}
.fsdb-page .fsdb-vset-name-input:focus{border-color:var(--biu-color-emphasis)}
.fsdb-page .fsdb-vset-mode-add{display:flex;align-items:center;gap:6px;width:100%;min-height:30px;margin-top:2px;padding:4px 8px;border:0;border-radius:6px;background:transparent;color:var(--biu-color-text-muted);font:inherit;font-size:14px;text-align:left;cursor:pointer}
.fsdb-page .fsdb-vset-mode-add:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-page .tasks-table th.fsdb-rownum-th,.fsdb-page .tasks-table td.fsdb-rownum-td{text-align:center;color:var(--biu-color-text-subtle);font-variant-numeric:tabular-nums;user-select:none}
.fsdb-page .tasks-table th.fsdb-rownum-th .fsdb-rownum-head,.fsdb-page .tasks-table td.fsdb-rownum-td .fsdb-cell{justify-content:center;color:var(--biu-color-text-subtle)}
.fsdb-page .fsdb-query-row,.fsdb-page .fsdb-query-rule{display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:4px;min-width:0;max-width:100%;width:100%}
.fsdb-page .fsdb-query-row.is-drag{opacity:0}
.fsdb-page .fsdb-query-grip{display:inline-flex;align-items:center;justify-content:center;width:18px;height:22px;flex:none;padding:0;border:0;border-radius:6px;background:transparent;color:var(--biu-color-icon);cursor:grab;touch-action:none}
.fsdb-page .fsdb-query-grip:active{cursor:grabbing}
.fsdb-query-drag-overlay{min-width:320px;padding:8px;background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);box-shadow:var(--biu-shadow-popover);pointer-events:none}
.fsdb-page .fsdb-query-row .fsdb-cellselect,.fsdb-page .fsdb-query-rule .fsdb-cellselect{flex:0 1 108px;min-width:0;max-width:32%}
.fsdb-page .fsdb-query-menu.is-sort .fsdb-query-row .fsdb-cellselect.is-field{flex:1 1 160px;max-width:none}
.fsdb-page .fsdb-query-menu.is-sort .fsdb-query-row .fsdb-cellselect:not(.is-field){flex:0 0 88px;max-width:none}
.fsdb-page .fsdb-query-rule > .fsdb-cellselect:nth-last-child(2),.fsdb-page .fsdb-query-rule > .fsdb-query-input{flex:1 1 140px;min-width:0;max-width:none}
.fsdb-page .fsdb-query-rule .fsdb-cellselect.is-field .fsdb-cellselect-trigger{min-width:0;max-width:100%;overflow:hidden}
.fsdb-page .fsdb-query-stack,.fsdb-page .fsdb-query-group{display:flex;flex-direction:column;gap:4px;min-width:0;max-width:100%}
.fsdb-page .fsdb-query-group{padding:6px;border-radius:7px;background:color-mix(in srgb,var(--biu-color-bg-hover) 70%,transparent)}
.fsdb-page .fsdb-query-line{display:flex;flex-direction:row;flex-wrap:nowrap;align-items:flex-start;gap:4px;min-width:0;max-width:100%;width:100%}
.fsdb-page .fsdb-query-line>.fsdb-query-rule{flex:1;min-width:0}
.fsdb-page .fsdb-query-join{flex:none;width:36px;height:28px;padding:0;display:inline-flex;align-items:center;justify-content:center;color:var(--biu-color-text-muted);font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium)}
.fsdb-page .fsdb-query-join.is-btn{border:0;border-radius:7px;background:transparent;color:var(--biu-color-text);cursor:pointer}
.fsdb-page .fsdb-query-join.is-btn:hover{background:var(--biu-color-bg-hover)}
.fsdb-page .fsdb-query-nested{flex:1;min-width:0;display:flex;flex-direction:row;gap:4px;align-items:flex-start}
.fsdb-page .fsdb-query-nested>.fsdb-query-group{flex:1}
.fsdb-page .fsdb-query-x{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex:none;border:0;border-radius:7px;padding:0;background:transparent;color:var(--biu-color-icon);cursor:pointer}
.fsdb-page .fsdb-query-x:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-icon-active)}
.fsdb-page .fsdb-query-add,.fsdb-page .fsdb-query-clear{display:inline-flex;align-items:center;gap:6px;box-sizing:border-box;height:28px;border:0;border-radius:7px;padding:0 8px;background:transparent;color:var(--biu-color-text-muted);font:inherit;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);cursor:pointer;text-align:left}
.fsdb-page .fsdb-query-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:28px;padding:0 4px 6px}
.fsdb-page .fsdb-query-head-title{font-size:14px;font-weight:var(--biu-font-weight-semibold);color:var(--biu-color-text)}
.fsdb-page .fsdb-query-head-toggle{display:inline-flex;align-items:center;gap:8px;flex:none}
.fsdb-page .fsdb-query-toggle-label{font-size:13px;color:var(--biu-color-text-muted)}
.fsdb-page .fsdb-query-rules-body{display:flex;flex-direction:column;gap:6px;min-width:0}
.fsdb-page .fsdb-query-rules-body.is-paused{opacity:.52}
.fsdb-page .fsdb-query-foot{display:flex;align-items:center;margin-top:6px;padding-top:6px;border-top:var(--biu-stroke-width) solid var(--biu-color-border-subtle)}
.fsdb-page .fsdb-query-add:hover,.fsdb-page .fsdb-query-clear:hover{background:var(--biu-color-bg-hover)}
.fsdb-page .fsdb-query-input{flex:1;min-width:0;height:28px;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:7px;padding:0 8px;background:transparent;color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);outline:none}
.fsdb-page .fsdb-query-spacer{flex:1;min-width:0}
.fsdb-page .fsdb-query-menu .fsdb-query-grip{width:28px;height:28px;border-radius:7px}
.fsdb-page .fsdb-query-menu .tasks-viewdd-empty{box-sizing:border-box;height:28px;padding:0 8px;display:flex;align-items:center}
.fsdb-page .fsdb-query-menu .fsdb-cellselect-trigger,.fsdb-page .fsdb-query-menu .db-cell-select-trigger{background:transparent}
.fsdb-page .fsdb-query-menu .fsdb-cellselect-trigger:hover,.fsdb-page .fsdb-query-menu .db-cell-select-trigger:hover{background:var(--biu-color-bg-hover)}
.fsdb-page .fsdb-query-menu .fsdb-cellselect.is-field .fsdb-cellselect-trigger,.fsdb-page .fsdb-query-menu .db-cell-select.is-field .db-cell-select-trigger{box-sizing:border-box;height:28px;min-height:28px;padding:0 8px;border-radius:7px;background:transparent}
.fsdb-page .fsdb-query-menu .fsdb-cellselect.is-field .fsdb-cellselect-trigger:hover,.fsdb-page .fsdb-query-menu .fsdb-cellselect.is-field .fsdb-cellselect-trigger[data-open],.fsdb-page .fsdb-query-menu .db-cell-select.is-field .db-cell-select-trigger:hover,.fsdb-page .fsdb-query-menu .db-cell-select.is-field .db-cell-select-trigger[data-open]{background:var(--biu-color-bg-hover)}
.fsdb-page .fsdb-col-drag-row{display:flex;align-items:center;gap:0;min-width:0;border-radius:7px}
.fsdb-page .fsdb-col-drag-row .fsdb-checkrow{flex:1;min-width:0}
.fsdb-page .fsdb-col-drag-row.is-drag{opacity:0}
.fsdb-page .fsdb-col-drag-row:hover{background:var(--biu-color-bg-hover)}
.fsdb-page .fsdb-col-drag-row.is-tag:hover{background:var(--biu-color-bg-hover)}
.fsdb-col-menu .fsdb-checkrow:hover,.fsdb-page .fsdb-col-menu .fsdb-checkrow.is-on{background:transparent}
.fsdb-page .fsdb-col-menu .fsdb-checkrow:has(.fsdb-col-tag-ico):hover{background:var(--biu-color-bg-hover)}
.fsdb-page .fsdb-col-menu .fsdb-inline-sub .fsdb-checkrow:hover{background:var(--biu-color-bg-hover)}
.fsdb-page .fsdb-col-drag-row.is-tag .fsdb-checkrow:hover,.fsdb-page .fsdb-col-drag-row.is-tag .fsdb-checkrow.is-on{background:transparent}
.fsdb-page .fsdb-query-grip.is-locked{cursor:default}
.fsdb-page .fsdb-col-menu{max-height:min(72vh,520px,var(--radix-popover-content-available-height,520px));overflow:hidden}
.fsdb-page .fsdb-col-menu-list{min-height:0;overflow:auto;display:flex;flex-direction:column;gap:4px}
.fsdb-page .tasks-viewdd-head,.fsdb-page .tasks-sort-head{font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);color:var(--biu-color-text-muted)}
.fsdb-page .tasks-sort-search,.fsdb-tool-flyout .tasks-sort-search{box-sizing:border-box;width:100%;min-width:0;min-height:var(--biu-size-control-lg);height:auto;border:0;border-radius:7px;padding:6px 8px;background:transparent;color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);line-height:1.4;outline:none}
.fsdb-page .tasks-sort-list{display:flex;flex-direction:column;gap:var(--biu-gap-flyout);min-height:0;overflow:auto}
.fsdb-page .tasks-viewdd-item{position:relative;display:flex;align-items:center;gap:2px;min-width:0;width:100%;border-radius:7px}
.fsdb-page .tasks-viewdd-item.is-drag{opacity:0}
.fsdb-page .tasks-viewdd-item::before{content:"";position:absolute;inset:0;z-index:0;border-radius:inherit;pointer-events:none;background:transparent}
.fsdb-page .tasks-viewdd-item>*{position:relative;z-index:1}
.fsdb-page .tasks-viewdd-item:hover:not(.is-active)::before,.fsdb-page .tasks-viewdd-item.is-cursor:not(.is-active)::before{background:var(--biu-color-bg-hover)}
.fsdb-page .tasks-viewdd-item.is-active::before{background:var(--biu-color-bg-hover)}
.fsdb-page .tasks-viewdd-item.is-active{color:var(--biu-color-text)}
.fsdb-page .tasks-viewdd-item-main,.fsdb-page .tasks-sort-item,.fsdb-page .tasks-viewdd-saveas{display:inline-flex;flex-direction:row;flex-wrap:nowrap;align-items:center;justify-content:space-between;gap:4px;width:100%;border:0;border-radius:7px;padding:var(--biu-pad-flyout-item);background:transparent;color:var(--biu-color-text-muted);font-family:inherit;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);cursor:pointer;text-align:left}
.fsdb-page .tasks-sort-item-label{display:inline-flex;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:6px;min-width:0}
.fsdb-page .tasks-viewdd-saveas{justify-content:flex-start}
.fsdb-page .tasks-sort-item-label svg,.fsdb-page .tasks-mode-item-ico,.fsdb-page .fsdb-checkrow-icon svg{flex:none;display:block;color:var(--biu-color-icon)}
.fsdb-page .tasks-sort-item.is-active .tasks-sort-item-label svg,.fsdb-page .tasks-sort-item:hover .tasks-sort-item-label svg,.fsdb-page .fsdb-checkrow.is-on .fsdb-checkrow-icon svg,.fsdb-page .fsdb-checkrow:hover .fsdb-checkrow-icon svg{color:var(--biu-color-icon-active)}
.fsdb-page .tasks-viewdd-item-main{width:auto;flex:1;min-width:0;justify-content:flex-start;gap:8px;padding:4px 6px}
.tasks-viewdd-item-ico{flex:none;width:14px;height:14px;color:var(--biu-color-icon)}
.fsdb-tool-flyout .tasks-viewdd-item-main:hover .tasks-viewdd-item-ico,.fsdb-tool-flyout .tasks-viewdd-item.is-active .tasks-viewdd-item-ico,.fsdb-page .fsdb-vset .tasks-viewdd-item-main:hover .tasks-viewdd-item-ico,.fsdb-page .fsdb-vset .tasks-viewdd-item.is-active .tasks-viewdd-item-ico{color:var(--biu-color-icon-active)}
.fsdb-page .tasks-viewdd-item-name,.fsdb-tool-flyout .tasks-viewdd-item-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:var(--biu-font-weight-medium,500)}
.fsdb-viewcat{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%;color:var(--biu-color-text);font-weight:var(--biu-font-weight-medium)}
.fsdb-viewcat .tasks-viewdd-item-ico{flex:none;color:var(--biu-color-icon)}
.fsdb-page input.tasks-viewdd-item-name,.fsdb-tool-flyout input.tasks-viewdd-item-name{flex:1;width:100%;margin:0;padding:0;border:0;outline:none;box-shadow:none;background:transparent;color:inherit;font:inherit;overflow:visible;text-overflow:clip}
.fsdb-page .tasks-sort-item:hover,.fsdb-page .tasks-sort-item.is-active,.fsdb-page .tasks-sort-item.is-cursor,.fsdb-page .tasks-viewdd-item.is-active .tasks-viewdd-item-main,.fsdb-page .tasks-viewdd-item-main.is-active{background:var(--biu-color-bg-hover);color:var(--biu-color-text);font-weight:var(--biu-font-weight-medium)}
.fsdb-page .tasks-viewdd-item-actions{display:inline-flex;align-items:center;gap:0;flex:none;margin-left:auto}
.fsdb-page .tasks-viewdd-act{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;flex:none;padding:0;border:0;border-radius:6px;background:transparent;color:var(--biu-color-icon);cursor:pointer}
.fsdb-page .tasks-viewdd-act:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-icon-active)}
.fsdb-page .tasks-viewdd-act.is-danger:hover{background:color-mix(in srgb,var(--biu-color-danger) 16%,transparent);color:var(--biu-color-danger)}
.fsdb-page .tasks-viewdd-foot,.fsdb-tool-flyout .tasks-viewdd-foot{border-top:var(--biu-stroke-width) solid color-mix(in srgb,var(--biu-color-text) 12%,transparent);margin-top:4px;padding-top:4px}
.fsdb-page .tasks-filter{width:100%;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:7px;padding:5px 7px;background:var(--biu-color-bg-input);color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium)}
.fsdb-page .tasks-viewdd-empty{padding:6px 8px;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);color:var(--biu-color-text-muted)}
.fsdb-page .fsdb-col-tag-name{font-weight:var(--biu-font-weight-medium)}
.fsdb-page .fsdb-col-tag-count{margin-left:auto;flex:none;color:var(--biu-color-text-subtle);font-variant-numeric:tabular-nums;font-weight:var(--biu-font-weight-medium)}
.fsdb-page .fsdb-checkrow .fsdb-col-tag-ico,
.fsdb-page .fsdb-checkrow .fsdb-col-tag-ico svg,
.fsdb-page .fsdb-checkrow:hover .fsdb-col-tag-ico,
.fsdb-page .fsdb-checkrow:hover .fsdb-col-tag-ico svg,
.fsdb-page .fsdb-checkrow.is-on .fsdb-col-tag-ico,
.fsdb-page .fsdb-checkrow.is-on .fsdb-col-tag-ico svg{color:inherit}
.fsdb-page .fsdb-col-tag-ico svg,
.fsdb-page .fsdb-col-tag-ico .fsdb-record-emoji{width:14px;height:14px;flex:none;font-size:14px}
.fsdb-col-tag-flyout{position:relative;z-index:280;min-width:200px;max-height:min(60vh,360px);overflow:auto;padding:var(--biu-pad-flyout);background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);box-shadow:var(--biu-shadow-popover);display:flex;flex-direction:column;gap:var(--biu-gap-flyout);color:var(--biu-color-text-muted);font-weight:var(--biu-font-weight-medium)}
/* 工具浮窗外壳 */
.fsdb-tool-flyout,.fsdb-page .tasks-viewdd-menu,.fsdb-page .tasks-sort-menu,.fsdb-page .tasks-filter-menu,.fsdb-page .fsdb-col-menu,.fsdb-bulk-menu,.fsdb-col-tag-flyout,.fsdb-layout-menu{
  box-sizing:border-box;
  isolation:isolate;
  padding:var(--biu-pad-flyout);
  border-radius:var(--biu-radius-popover);
  border:var(--biu-stroke-width) solid var(--biu-color-border-popover);
  background:var(--biu-color-bg-popover);
  box-shadow:var(--biu-shadow-popover);
  min-width:200px;
  max-width:min(92vw,560px);
  max-height:min(70vh,520px);
  overflow:hidden;
  font-weight:var(--biu-font-weight-medium,500);
  animation:fsdb-tool-flyout-in 120ms ease;
}
.fsdb-tool-flyout button,.fsdb-tool-flyout input,.fsdb-tool-flyout .tasks-viewdd-item-name,.fsdb-tool-flyout .tasks-viewdd-empty,.fsdb-tool-flyout .tasks-viewdd-saveas,.fsdb-tool-flyout .fsdb-checkrow-label,.fsdb-tool-flyout .fsdb-layout-row,.fsdb-tool-flyout .fsdb-mode-plus{
  font-weight:var(--biu-font-weight-medium,500);
}
.fsdb-page .tasks-viewdd-menu{left:0;right:auto;min-width:320px;overflow:auto}
.fsdb-page .fsdb-col-menu,.fsdb-tool-flyout.fsdb-col-menu{min-width:260px;max-height:min(72vh,520px,var(--radix-popover-content-available-height,520px));overflow:hidden;display:flex;flex-direction:column}
.fsdb-page .tasks-sort-menu,.fsdb-tool-flyout.tasks-sort-menu{max-height:min(72vh,520px,var(--radix-popover-content-available-height,520px));overflow:hidden;display:flex;flex-direction:column}
.fsdb-page .tasks-sort-menu,.fsdb-page .tasks-filter-menu,.fsdb-page .fsdb-query-menu,.fsdb-bulk-menu,.fsdb-layout-menu{right:0;left:auto}
.fsdb-tool-flyout.fsdb-layout-menu:not(.is-anchored):not(.is-inline){min-width:240px}
.fsdb-tool-flyout .tasks-sort-list,.fsdb-tool-flyout .fsdb-col-menu-list,.fsdb-page .fsdb-col-menu-list{min-height:0;overflow:auto;display:flex;flex-direction:column;gap:var(--biu-gap-flyout)}
.fsdb-tool-flyout.fsdb-query-menu,.fsdb-page .fsdb-query-menu.fsdb-tool-flyout{overflow:auto}
.fsdb-query-flyout.fsdb-page > .fsdb-tool-flyout{min-width:0;max-width:min(calc(100vw - 16px),var(--radix-popover-content-available-width,100vw));max-height:min(70vh,520px,var(--radix-popover-content-available-height,520px));overflow:auto}
.fsdb-query-flyout.fsdb-page > .fsdb-tool-flyout.tasks-viewdd-menu{min-width:min(320px,calc(100vw - 16px))}
.fsdb-tool-flyout .fsdb-query-menu:not(.fsdb-tool-flyout){padding:0;border:0;background:transparent;box-shadow:none;min-width:0;max-width:none;width:auto;max-height:none;overflow:visible;animation:none}
.fsdb-tool-flyout .db-search-menu,.fsdb-query-menu .db-search-menu{box-shadow:none;border:0;background:transparent}
.fsdb-tool-flyout .tasks-sort-search,.fsdb-tool-flyout .db-search-field,.fsdb-tool-flyout .db-search-field input,.fsdb-query-menu .db-search-field,.fsdb-query-menu .db-search-field input{background:transparent}
.fsdb-tool-flyout .fsdb-tool-head,.fsdb-tool-flyout .tasks-viewdd-head,.fsdb-tool-flyout .tasks-sort-head{padding:4px 8px 6px;margin:0 0 2px;font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-medium);color:var(--biu-color-text-subtle);line-height:1.4}
.fsdb-tool-flyout .fsdb-tool-row,.fsdb-tool-flyout .fsdb-checkrow,.fsdb-tool-flyout .tasks-sort-item,.fsdb-tool-flyout .fsdb-layout-row,.fsdb-tool-flyout .fsdb-layout-scale,.fsdb-tool-flyout .tasks-viewdd-item-main,.fsdb-tool-flyout .tasks-viewdd-saveas,.fsdb-tool-flyout .fsdb-query-add,.fsdb-tool-flyout .fsdb-query-clear,.fsdb-tool-flyout .fsdb-mode-plus{
  box-sizing:border-box;min-height:var(--biu-size-control-lg);height:auto;padding:var(--biu-pad-flyout-item);border-radius:7px;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);line-height:1.4
}
.fsdb-tool-flyout .fsdb-tool-row:hover,.fsdb-tool-flyout .fsdb-checkrow:hover,.fsdb-tool-flyout .tasks-sort-item:hover,.fsdb-tool-flyout .fsdb-layout-row:hover,.fsdb-tool-flyout .tasks-viewdd-saveas:hover,.fsdb-tool-flyout .fsdb-query-add:hover,.fsdb-tool-flyout .fsdb-mode-plus:hover{background:var(--biu-color-bg-hover)}
.fsdb-tool-flyout .fsdb-checkrow.is-on,.fsdb-tool-flyout .tasks-sort-item.is-active,.fsdb-tool-flyout .tasks-viewdd-item.is-active .tasks-viewdd-item-main{color:var(--biu-color-text)}
.fsdb-tool-flyout .fsdb-query-clear,.fsdb-tool-flyout .tasks-viewdd-act.is-danger{color:var(--biu-color-danger)}
.fsdb-tool-flyout .fsdb-query-clear:hover,.fsdb-tool-flyout .tasks-viewdd-act.is-danger:hover{background:color-mix(in srgb,var(--biu-color-danger) 11%,transparent)}
@keyframes fsdb-tool-flyout-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.fsdb-tool-flyout,.fsdb-page .tasks-viewdd-menu,.fsdb-page .tasks-sort-menu,.fsdb-page .tasks-filter-menu,.fsdb-page .fsdb-col-menu,.fsdb-bulk-menu,.fsdb-col-tag-flyout,.fsdb-layout-menu{animation:none}}
.fsdb-page .tasks-filter-dot{position:absolute;top:4px;right:4px;width:5px;height:5px;border-radius:50%;background:var(--biu-color-icon-dot)}
.fsdb-page .tasks-error{margin:0;color:var(--biu-color-danger);font-size:var(--biu-font-size-4)}
.fsdb-page .tasks-table-wrap{box-sizing:border-box;position:relative;z-index:0;min-width:0;max-width:100%;min-height:min-content;height:auto;max-height:none;flex:none;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:none;overflow-anchor:none;scrollbar-gutter:auto;width:100%;margin-left:0;padding-left:0;border:0;border-radius:0;background:transparent;container-type:inline-size;container-name:fsdb-table}
.fsdb-page .tasks-table-shell{position:relative;width:100%;min-width:0;overflow:visible}
.fsdb-page .tasks-table-stage{display:flex;flex-direction:row;align-items:stretch;width:max-content;min-width:100%}
.fsdb-page .fsdb-check-rail{position:absolute;top:0;bottom:0;left:calc(-1 * var(--fsdb-check-gutter));width:var(--fsdb-check-gutter);z-index:9;overflow:visible;pointer-events:none;background:transparent}
.fsdb-page.is-sheet .fsdb-check-rail,.fsdb-share-page .fsdb-check-rail{display:none}
.fsdb-page .fsdb-check-stack{position:absolute;inset:0;width:var(--fsdb-check-gutter);transform:none;pointer-events:none}
.fsdb-page .fsdb-check-slot{position:absolute;left:0;display:flex;align-items:center;justify-content:center;width:var(--fsdb-check-gutter);pointer-events:none;box-sizing:border-box}
.fsdb-page .fsdb-check-slot.is-head{position:sticky;top:0;z-index:9;background:var(--biu-color-bg)}
.fsdb-page .fsdb-check-slot:has(.fsdb-row-check){pointer-events:auto}
.fsdb-page .tasks-table{box-sizing:border-box;width:max-content;min-width:100%;border-collapse:separate;border-spacing:0;table-layout:auto;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);color:var(--biu-color-text);white-space:nowrap;border:0;border-top:var(--biu-stroke-width) solid var(--biu-color-border);border-bottom:var(--biu-stroke-width) solid var(--biu-color-border);background:var(--biu-color-surface)}
.fsdb-page .tasks-table th,.fsdb-page .tasks-table td{padding:4px 6px;border-bottom:var(--biu-stroke-width) solid color-mix(in srgb,var(--biu-color-border) 80%,transparent);border-right:var(--biu-stroke-width) solid color-mix(in srgb,var(--biu-color-border) 80%,transparent);text-align:left;vertical-align:middle}
.fsdb-page .tasks-table td{color:var(--biu-color-text);font-weight:var(--biu-font-weight-medium)}
.fsdb-page .tasks-table td .fsdb-plain-input,.fsdb-page .tasks-table td .fsdb-cellselect-trigger,.fsdb-page .tasks-table td .fsdb-cellselect-label,.fsdb-page .tasks-table td .fsdb-token,.fsdb-page .tasks-table td .biu-tag,.fsdb-page .tasks-table td .fsdb-boolbtn,.fsdb-page .tasks-table td .fsdb-file-name{color:var(--biu-color-text);font-weight:var(--biu-font-weight-medium)}
.fsdb-page .tasks-table td .fsdb-title-text,.fsdb-page .tasks-table td .fsdb-person-name{color:var(--biu-color-text);font-weight:var(--biu-font-weight-medium)}
.fsdb-page .tasks-table td .biu-tag{color:var(--biu-tag,var(--biu-color-emphasis));background:color-mix(in srgb,var(--biu-tag,var(--biu-color-emphasis)) 22%,transparent)}
.fsdb-page .tasks-table td .fsdb-scope-tag,.fsdb-page .tasks-table td .fsdb-scope-pill,.fsdb-page .tasks-table td .fsdb-scope-tag.is-personal,.fsdb-page .tasks-table td .fsdb-scope-tag.is-workspace,.fsdb-page .tasks-table td .fsdb-scope-tag.is-manage,.fsdb-page .tasks-table td .fsdb-scope-tag.is-read,.fsdb-page .tasks-table td .fsdb-scope-pill.is-personal,.fsdb-page .tasks-table td .fsdb-scope-pill.is-workspace,.fsdb-page .tasks-table td .fsdb-scope-pill.is-manage,.fsdb-page .tasks-table td .fsdb-scope-pill.is-read{color:var(--biu-tag);font-weight:var(--biu-font-weight-medium)}
.fsdb-page .tasks-table td .fsdb-scope-tag svg,.fsdb-page .tasks-table td .fsdb-scope-pill svg{color:var(--biu-tag)}
.fsdb-page .tasks-table td .fsdb-action-btn,.fsdb-page .fsdb-proprow-v .fsdb-action-btn{color:var(--biu-tag);font-weight:var(--biu-font-weight-medium)}
.fsdb-page .tasks-table td .fsdb-action-btn svg,.fsdb-page .fsdb-proprow-v .fsdb-action-btn svg{color:var(--biu-tag)}
.fsdb-page .tasks-table td .fsdb-person-avatar,.fsdb-page .tasks-table td .fsdb-person.is-empty svg,.fsdb-page .tasks-table td .fsdb-file svg,.fsdb-page .tasks-table td .fsdb-cellselect-trigger svg{color:var(--biu-color-icon-fixed)}
.fsdb-page .tasks-table td .fsdb-cellselect-trigger.is-empty,.fsdb-page .tasks-table td .fsdb-plain-input::placeholder{color:var(--biu-color-text-subtle)}
.fsdb-page .tasks-table th:last-child,.fsdb-page .tasks-table td:last-child{border-right:0}
.fsdb-page .tasks-table col.fsdb-col-fill{width:auto}
.fsdb-page .tasks-table th.fsdb-col-fill,.fsdb-page .tasks-table td.fsdb-col-fill{padding:0;border:0;border-bottom:var(--biu-stroke-width) solid color-mix(in srgb,var(--biu-color-border) 80%,transparent);min-width:0}
.fsdb-page .tasks-table:not(.is-grid) tbody tr:last-child:not(.fsdb-table-pad) td,.fsdb-page .tasks-table:not(.is-grid) tbody tr:last-child:not(.fsdb-table-pad) th{border-bottom:0}
.fsdb-page .tasks-table:not(.is-wrap) td{white-space:nowrap}
.fsdb-page .tasks-table.is-wrap{width:100%;max-width:100%;white-space:normal}
.fsdb-page .tasks-table.is-wrap td{white-space:normal;vertical-align:top;max-width:none}
.fsdb-page .tasks-table th,.fsdb-page .tasks-table.is-wrap th{white-space:nowrap}
.fsdb-page .tasks-table td .fsdb-cell{width:100%;box-sizing:border-box}
@keyframes fsdb-cell-in{from{opacity:.15}to{opacity:1}}
.fsdb-page .tasks-table tbody tr[data-record-id].is-row-enter td > .fsdb-cell{animation:fsdb-cell-in 100ms ease-out var(--fsdb-row-delay,0ms) backwards}
@media (prefers-reduced-motion:reduce){.fsdb-page .tasks-table tbody tr[data-record-id].is-row-enter td > .fsdb-cell{animation:none}}
.fsdb-page .tasks-table th.fsdb-col-pad,.fsdb-page .tasks-table td.fsdb-col-pad{padding:0;border:0;background:transparent}
.fsdb-cell{display:flex;align-items:center;min-width:0;max-width:100%;min-height:18px;overflow:hidden;font-weight:var(--biu-font-weight-medium)}
.fsdb-page .tasks-table:not(.is-wrap) .fsdb-cell > span:not(.fsdb-ref-chips):not(.biu-tags):not(.fsdb-person-list):not(.fsdb-files){min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-page .fsdb-proprow-v,.fsdb-page .fsdb-detail-aside .fsdb-prop-val,.fsdb-page .fsdb-detail-aside .fsdb-detail-id{color:var(--biu-color-text);font-weight:var(--biu-font-weight-medium)}
.fsdb-page .fsdb-proprow-v .fsdb-plain-input,.fsdb-page .fsdb-proprow-v .fsdb-cellselect-trigger,.fsdb-page .fsdb-proprow-v .fsdb-cellselect-label,.fsdb-page .fsdb-proprow-v .fsdb-token,.fsdb-page .fsdb-proprow-v .biu-tag,.fsdb-page .fsdb-proprow-v .fsdb-boolbtn,.fsdb-page .fsdb-proprow-v .fsdb-file-name{color:var(--biu-color-text);font-weight:var(--biu-font-weight-medium)}
.fsdb-page .fsdb-proprow-v .fsdb-title-text,.fsdb-page .fsdb-proprow-v .fsdb-person-name{color:var(--biu-color-text);font-weight:var(--biu-font-weight-medium)}
.fsdb-page .fsdb-proprow-v .biu-tag{color:var(--biu-tag,var(--biu-color-emphasis));background:color-mix(in srgb,var(--biu-tag,var(--biu-color-emphasis)) 22%,transparent)}
.fsdb-page .fsdb-proprow-v .fsdb-scope-tag,.fsdb-page .fsdb-proprow-v .fsdb-scope-pill,.fsdb-page .fsdb-proprow-v .fsdb-scope-tag.is-personal,.fsdb-page .fsdb-proprow-v .fsdb-scope-tag.is-workspace,.fsdb-page .fsdb-proprow-v .fsdb-scope-tag.is-manage,.fsdb-page .fsdb-proprow-v .fsdb-scope-tag.is-read,.fsdb-page .fsdb-proprow-v .fsdb-scope-pill.is-personal,.fsdb-page .fsdb-proprow-v .fsdb-scope-pill.is-workspace,.fsdb-page .fsdb-proprow-v .fsdb-scope-pill.is-manage,.fsdb-page .fsdb-proprow-v .fsdb-scope-pill.is-read{color:var(--biu-tag);font-weight:var(--biu-font-weight-medium)}
.fsdb-page .fsdb-proprow-v .fsdb-scope-tag svg,.fsdb-page .fsdb-proprow-v .fsdb-scope-pill svg{color:var(--biu-tag)}
.fsdb-page .fsdb-proprow-v .fsdb-person-avatar,.fsdb-page .fsdb-proprow-v .fsdb-person.is-empty svg,.fsdb-page .fsdb-proprow-v .fsdb-file svg,.fsdb-page .fsdb-proprow-v .fsdb-cellselect-trigger svg{color:var(--biu-color-icon-fixed)}
.fsdb-page .fsdb-cell .traj-usage,.fsdb-page .fsdb-cell .traj-usage-empty,.fsdb-page .tasks-table .traj-usage,.fsdb-page .tasks-table .traj-usage-empty{font-size:var(--biu-font-size-4);line-height:inherit}
.fsdb-page .chat-pane .traj-usage,.fsdb-page .chat-pane .traj-usage-empty{font-size:var(--biu-chat-ui-font-size);line-height:1;font-weight:var(--biu-font-weight-regular);color:var(--biu-color-text-muted)}
.fsdb-link{color:inherit;text-underline-offset:2px;overflow-wrap:anywhere}
.fsdb-link:hover{text-decoration:underline}
.fsdb-thumb-btn{display:inline-flex;align-items:center;justify-content:center;line-height:0;border:0;padding:0;background:transparent;cursor:zoom-in;vertical-align:middle}
.fsdb-thumb-btn .biu-image{display:inline-flex;line-height:0}
.fsdb-thumb{display:block;width:28px;height:18px;object-fit:cover;border-radius:3px;background:var(--biu-color-bg-hover);flex:none;box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--biu-color-border) 70%, transparent)}
.fsdb-thumb-btn .biu-image img{display:block;width:28px;height:18px;object-fit:cover;border-radius:3px}
.fsdb-file{display:inline-flex;align-items:center;gap:6px;min-width:0;width:100%;color:inherit;text-underline-offset:2px}
.fsdb-file.is-chip{flex:0 1 auto;width:auto;max-width:100%;min-width:0;height:var(--biu-space-5);gap:var(--biu-space-1);padding:0 var(--biu-pad-chip-x);border-radius:var(--biu-radius-sm);background:color-mix(in srgb,var(--biu-color-ink-gray) 22%,transparent);color:var(--biu-color-ink-gray);font-size:var(--biu-chat-chip-font-size,var(--biu-font-size-3));font-weight:var(--biu-font-weight-medium);line-height:var(--biu-space-5)}
.fsdb-file.is-chip svg{flex:none;display:block;width:14px;height:14px;color:inherit;fill:currentColor}
.fsdb-file:hover{text-decoration:none}
.fsdb-file-name{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-file.is-chip .fsdb-file-name{flex:1 1 auto;min-width:0;max-width:8em}
.fsdb-file-tools{display:inline-flex;align-items:center;gap:2px;flex:none;margin-left:auto}
.fsdb-file.is-chip .fsdb-file-tools{flex:none;flex-shrink:0;margin-left:0;gap:var(--biu-space-1)}
.fsdb-file-act{display:inline-flex;align-items:center;justify-content:center;flex:none;margin:0;border:0;padding:0;background:transparent;color:inherit;opacity:.7;cursor:pointer;line-height:0}
.fsdb-file-act:hover{opacity:1}
.fsdb-file-tools .tasks-icon-btn{border:0;border-radius:5px;padding:3px;background:transparent;color:var(--biu-color-icon);cursor:pointer;font:inherit;display:inline-flex;align-items:center;justify-content:center;flex:none}
.fsdb-file-tools .tasks-icon-btn:hover,.fsdb-file-tools .tasks-icon-btn.is-active{background:var(--biu-color-bg-hover);color:var(--biu-color-icon-active)}
.fsdb-file-tools .tasks-icon-btn.is-danger:hover{background:var(--biu-color-danger-muted);color:var(--biu-color-danger)}
.fsdb-files{display:inline-flex;flex-direction:row;flex-wrap:wrap;align-items:center;align-content:center;gap:var(--biu-space-1);min-width:0;width:auto;max-width:100%}
.fsdb-fileview{min-width:0;flex:none;height:auto;min-height:0;max-height:none;overflow:visible}
.fsdb-fileview:empty{display:none}
.fsdb-content-loading{display:flex;align-items:center;justify-content:center;flex:1;min-height:120px;min-width:0;user-select:none;pointer-events:none;color:var(--biu-color-icon)}
.fsdb-content-loading-icon,.fsdb-content-loading svg{display:block;flex:none;box-sizing:border-box;width:22px;height:22px;max-width:22px;max-height:22px;overflow:hidden;opacity:0;animation:fsdb-spin .7s linear infinite,fsdb-content-load-in 0s 150ms forwards}
@keyframes fsdb-content-load-in{to{opacity:1}}
.fsdb-content-failed{display:flex;flex-direction:column;align-items:flex-start;gap:10px;min-height:120px;padding:16px 0;color:var(--biu-color-text-muted);font-size:var(--biu-font-size-3);user-select:none}
.fsdb-content-failed p{margin:0}
.fsdb-content-retry{margin:0;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:8px;padding:6px 10px;background:transparent;color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold);cursor:pointer}
.fsdb-content-retry:hover{background:var(--biu-color-bg-hover)}
.fsdb-fileview-pre{margin:0;padding:10px 12px;border-radius:8px;background:var(--biu-color-bg-input);color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-4);font-family:var(--font-mono);white-space:pre-wrap;overflow:visible;height:auto;min-height:0;max-height:none}
.fsdb-fileview-img{display:block;width:auto;max-width:100%;height:auto;max-height:none;object-fit:contain;border-radius:8px;background:var(--biu-color-bg-hover)}
.fsdb-fileview-img .biu-image img{display:block;width:auto;max-width:100%;height:auto;max-height:none;object-fit:contain;border-radius:8px}
.fsdb-page .tasks-table th.is-pin-col,.fsdb-page .tasks-table td.is-pin-col{position:sticky;left:var(--fsdb-pin-left,0px);z-index:7;background:var(--biu-color-surface)}
.fsdb-page .tasks-table th.is-pin-col{z-index:12}
.fsdb-page .tasks-table th.is-pin-edge,.fsdb-page .tasks-table td.is-pin-edge{box-shadow:inset -1px 0 0 0 color-mix(in srgb,var(--biu-color-border) 90%,transparent)}
.fsdb-page .tasks-table tr.is-active td.is-pin-col{background:color-mix(in srgb,var(--biu-color-text) 8%,var(--biu-color-surface))}
.fsdb-page .tasks-tree-toggle{width:20px;height:20px;flex:none;display:inline-flex;align-items:center;justify-content:center;align-self:center;border:0;background:transparent;color:var(--biu-color-text-subtle);border-radius:4px;cursor:pointer;padding:0;line-height:0}
.fsdb-page .tasks-tree-toggle:hover{background:var(--biu-color-bg-hover)}
.fsdb-page .tasks-tree-toggle.is-empty{cursor:default;pointer-events:none;visibility:hidden}
.fsdb-page .tasks-tree-toggle.is-empty:hover{background:transparent}
.fsdb-page .fsdb-title-text{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:var(--biu-font-weight-medium)}
.fsdb-page .fsdb-title-host{position:relative;display:flex;align-items:center;gap:6px;min-width:0;width:100%;max-width:100%;min-height:22px;flex:1;overflow:hidden}
.fsdb-page .fsdb-table-record-icon{position:relative;flex:none;display:inline-flex;align-items:center}
.fsdb-page .fsdb-record-mark,.fsdb-page .fsdb-record-mark svg,.fsdb-page .fsdb-title-host>svg,.fsdb-page .fsdb-table-record-icon svg{color:var(--biu-color-icon)}
.fsdb-page .fsdb-record-mark .sidebar-mascot,.fsdb-page .fsdb-record-mark .sidebar-mascot svg,.fsdb-page .fsdb-table-record-icon .sidebar-mascot,.fsdb-page .fsdb-table-record-icon .sidebar-mascot svg{color:unset}
.fsdb-page .fsdb-title-host:has([data-plugin-enabled]) .fsdb-record-mark,.fsdb-page .fsdb-title-host:has([data-plugin-enabled]) .fsdb-record-mark svg,.fsdb-page .fsdb-title-host:has([data-plugin-enabled]) .fsdb-table-record-icon svg{color:var(--biu-color-ink-green)}
.fsdb-page .fsdb-table-emoji-btn{display:inline-flex;align-items:center;justify-content:center;margin:0;border:0;padding:0;background:transparent;color:var(--biu-color-icon);font:inherit;line-height:1;cursor:pointer}
.fsdb-page .tasks-table.is-wrap .fsdb-title-text{white-space:normal}
.fsdb-page .tasks-title-aside{position:relative;display:inline-flex;align-items:center;gap:2px;pointer-events:none}
.fsdb-page .tasks-title-zoom{position:relative;display:grid;place-items:center}
.fsdb-page .tasks-title-zoom .tasks-tree-count,.fsdb-page .tasks-title-zoom .tasks-title-open{grid-area:1/1}
.fsdb-page .tasks-title-open{flex:none;color:var(--biu-color-icon);opacity:0;z-index:1;pointer-events:none}
.fsdb-page .tasks-table td:has(.tasks-row-tools-slot):not(.is-pin-col){position:relative}
.fsdb-page .tasks-row-tools-slot{position:absolute;top:50%;right:8px;z-index:2;display:inline-flex;align-items:center;gap:2px;width:auto;transform:translateY(-50%);overflow:visible;pointer-events:none}
.fsdb-page .tasks-table td:has(.fsdb-title-host) .tasks-row-tools,.fsdb-page .tasks-table td:has(.fsdb-title-host) .tasks-row-actions{opacity:0;pointer-events:none}
.fsdb-page .tasks-table tr:hover td:has(.fsdb-title-host) .tasks-title-open,.fsdb-page .tasks-title-open:focus-visible,.fsdb-page .tasks-table tr:hover td:has(.fsdb-title-host) .tasks-row-actions,.fsdb-page .tasks-table tr:hover td:has(.fsdb-title-host) .tasks-row-tools{opacity:1;pointer-events:auto}
.fsdb-page .tasks-table tr:hover td:has(.fsdb-title-host) .tasks-title-open,.fsdb-page .tasks-title-open:focus-visible,.fsdb-page .tasks-table tr:hover td:has(.fsdb-title-host) .tasks-row-tools .tasks-icon-btn,.fsdb-page .tasks-table tr:hover td:has(.fsdb-title-host) .tasks-row-actions .tasks-icon-btn{background:var(--biu-color-bg-hover)}
.fsdb-page .tasks-row-tools{display:inline-flex;align-items:center;gap:2px;flex:none}
.fsdb-page .tasks-row-tools-slot .tasks-row-tools{position:static;background:transparent}
.fsdb-page .tasks-table td:has(.fsdb-title-host:focus-within) .tasks-row-tools-slot,.fsdb-page .tasks-table td:has(.fsdb-plain-input:focus) .tasks-row-tools-slot,.fsdb-page .tasks-queue-item:has(.fsdb-title-host:focus-within) .tasks-row-tools,.fsdb-page .tasks-minicard:has(.fsdb-title-host:focus-within) .tasks-row-tools{opacity:0;pointer-events:none}
.fsdb-page .tasks-table tr:hover .tasks-tree-count,.fsdb-page .tasks-title-zoom:has(.tasks-title-open:focus-visible) .tasks-tree-count{opacity:0}
.fsdb-page .tasks-title-open:hover{opacity:1;color:var(--biu-color-icon-active);background:var(--biu-color-bg-hover)}
.fsdb-page .tasks-tree-count{pointer-events:none}
.fsdb-page .tasks-table.is-truncate:not(.is-wrap) .fsdb-cell{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-page .tasks-table.is-truncate:not(.is-wrap) td:has(.biu-tags) .fsdb-cell,.fsdb-page .tasks-table.is-truncate:not(.is-wrap) .fsdb-cell:has(.biu-tags),.fsdb-page .tasks-table.is-truncate:not(.is-wrap) td:has(.fsdb-person-list) .fsdb-cell,.fsdb-page .tasks-table.is-truncate:not(.is-wrap) .fsdb-cell:has(.fsdb-person-list),.fsdb-page .tasks-table.is-truncate:not(.is-wrap) td:has(.fsdb-ref-chips) .fsdb-cell,.fsdb-page .tasks-table.is-truncate:not(.is-wrap) .fsdb-cell:has(.fsdb-ref-chips),.fsdb-page .tasks-table.is-truncate:not(.is-wrap) td:has(.fsdb-files) .fsdb-cell,.fsdb-page .tasks-table.is-truncate:not(.is-wrap) .fsdb-cell:has(.fsdb-files){max-width:100%;overflow:hidden}
.fsdb-page .tasks-table .fsdb-cell:has(.tasks-tags),.fsdb-page .tasks-table .fsdb-cell:has(.biu-tags),.fsdb-page .tasks-table .fsdb-cell:has(.fsdb-cellselect),.fsdb-page .tasks-table .fsdb-cell:has(.db-cell-select),.fsdb-page .tasks-table .fsdb-cell:has(.db-datetime),.fsdb-page .tasks-table .fsdb-cell:has(.fsdb-tokens),.fsdb-page .tasks-table .fsdb-cell:has(.fsdb-ref-chips),.fsdb-page .tasks-table .fsdb-cell:has(.fsdb-person-list),.fsdb-page .tasks-table .fsdb-cell:has(.fsdb-files),.fsdb-page .tasks-table .fsdb-cell:has(.fsdb-boolbtn),.fsdb-page .tasks-table .fsdb-cell:has(.fsdb-plain-input),.fsdb-page .tasks-table .fsdb-cell:has(.fsdb-thumb-btn),.fsdb-page .fsdb-proprow-v:has(.fsdb-cellselect),.fsdb-page .fsdb-proprow-v:has(.fsdb-tokens),.fsdb-page .fsdb-proprow-v:has(.fsdb-boolbtn){overflow:visible;max-height:none}
.fsdb-page .tasks-table.is-wrap .fsdb-cell{white-space:normal;overflow-wrap:anywhere;word-break:break-word;max-width:100%;align-items:flex-start}
.fsdb-page .tasks-table.is-wrap .fsdb-cell:has(.fsdb-ref-chips),.fsdb-page .tasks-table.is-wrap .fsdb-cell:has(.biu-tags),.fsdb-page .tasks-table.is-wrap .fsdb-cell:has(.fsdb-person-list),.fsdb-page .tasks-table.is-wrap .fsdb-cell:has(.fsdb-files),.fsdb-page .tasks-table.is-wrap .fsdb-cell:has(.fsdb-tokens-box),.fsdb-page .tasks-table.is-wrap .fsdb-cell:has(.db-cell-multi-box){display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;overflow-wrap:normal;word-break:normal;white-space:normal}
.fsdb-page .tasks-table.is-wrap.is-truncate .fsdb-cell{overflow:hidden;max-width:100%;max-height:2.8em}
.fsdb-page .tasks-table.is-wrap.is-truncate .fsdb-title-text{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;white-space:normal}
.fsdb-page .tasks-table td{overflow:visible}
.fsdb-page .tasks-table td:has(.fsdb-title-host),.fsdb-page .tasks-table th{overflow:visible}
.fsdb-page .tasks-table tbody tr:hover{position:relative;z-index:6}
.fsdb-page [data-dock-tip]::after{content:none;display:none}
@keyframes fsdb-tip-in{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:none}}
.fsdb-dock-tip{position:fixed;width:max-content;max-width:min(280px,calc(100vw - 24px));white-space:normal;overflow-wrap:anywhere;word-break:break-word;padding:5px 10px;border:var(--biu-stroke-width) solid color-mix(in srgb,var(--biu-color-border) 92%,transparent);border-radius:8px;background:color-mix(in srgb,var(--biu-color-bg-elevated,var(--biu-color-bg-subtle)) 96%,transparent);backdrop-filter:blur(8px);color:var(--biu-color-text);font-size:12px;font-weight:var(--biu-font-weight-medium,500);line-height:1.5;letter-spacing:.01em;pointer-events:none;box-shadow:0 6px 20px rgba(0,0,0,.24),0 1px 3px rgba(0,0,0,.14);animation:fsdb-tip-in 110ms cubic-bezier(.22,1,.36,1) both}
.fsdb-page .tasks-table th{padding:6px 6px;color:var(--biu-color-text-muted);font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);position:sticky;top:0;background:var(--biu-color-surface);z-index:5;white-space:nowrap}
.fsdb-main .tasks-table-wrap .tasks-table thead th{top:auto}
.fsdb-main .tasks-table-wrap .tasks-table thead.is-pinned{position:relative;z-index:8}
.fsdb-main .tasks-table-wrap .fsdb-check-slot.is-head.is-pinned{z-index:10}
.fsdb-page .tasks-table tbody{position:relative;z-index:0}
.fsdb-page .tasks-table thead{position:relative;z-index:8}
.fsdb-page .tasks-toolbar > .fsdb-pinned-head-host{position:absolute;top:calc(100% + 10px);left:0;z-index:49;width:100%;height:0;overflow:visible;pointer-events:none}
.fsdb-pinned-head-shell{position:relative;margin-left:var(--fsdb-docked-left,0px);overflow:visible;pointer-events:none}
.fsdb-pinned-head-viewport{position:relative;overflow:hidden;pointer-events:auto;background:var(--biu-color-bg);overscroll-behavior-x:none}
.fsdb-pinned-head-stage{display:flex;align-items:stretch}
.fsdb-pinned-head-check{position:absolute;top:0;bottom:0;left:calc(-1 * var(--fsdb-check-gutter));z-index:30;display:flex;align-items:center;justify-content:center;width:var(--fsdb-check-gutter);pointer-events:auto;background:transparent}
.fsdb-pinned-head-check .fsdb-row-check{opacity:1}
.fsdb-page .tasks-table.fsdb-pinned-head-table{flex:none;min-width:0;max-width:none;margin:0;border-top:0;border-bottom:0}
.fsdb-main .tasks-table-wrap.has-docked-head .tasks-table thead,.fsdb-main .tasks-table-shell:has(> .tasks-table-wrap.has-docked-head) > .fsdb-check-rail .fsdb-check-slot.is-head{visibility:hidden}

.fsdb-page .tasks-table th.is-tag-col{color:var(--biu-color-text-muted);background:var(--biu-color-surface);box-shadow:inset 0 -2px 0 color-mix(in srgb,var(--biu-tag) 72%,transparent)}
.fsdb-page .tasks-table.is-cols-fixed{table-layout:fixed;width:100%;min-width:0;max-width:none}
.fsdb-page .tasks-table.is-cols-fixed.is-wrap{width:100%;max-width:none;min-width:0}
.fsdb-page .tasks-table-stage > .tasks-table{flex:1 0 auto;width:auto;min-width:100cqw;max-width:none}
.fsdb-page .tasks-table-stage > .tasks-table.is-cols-fixed{table-layout:fixed;width:max(var(--fsdb-table-px,0px),100cqw);min-width:max(var(--fsdb-table-px,0px),100cqw);max-width:none}
.fsdb-page .tasks-table.is-cols-fixed col,.fsdb-page .tasks-table.is-cols-fixed th,.fsdb-page .tasks-table.is-cols-fixed td{box-sizing:border-box}
.fsdb-page .tasks-table.is-cols-fixed th,.fsdb-page .tasks-table.is-cols-fixed td{max-width:none;min-width:0}
.fsdb-page .tasks-table.is-cols-fixed td{overflow:hidden}
.fsdb-page .tasks-table.is-cols-fixed td .fsdb-cell{max-width:100%}
.fsdb-page .tasks-table .fsdb-col-resizer{position:absolute;top:0;bottom:0;right:-5px;z-index:9;width:9px;height:auto;cursor:col-resize;user-select:none;touch-action:none;pointer-events:auto}
.fsdb-page .tasks-table .fsdb-col-resizer::after{content:"";position:absolute;top:0;bottom:0;left:50%;width:4px;transform:translateX(-50%);background:transparent;pointer-events:none}
.fsdb-page .tasks-table .fsdb-col-resizer:hover::after,.fsdb-page .tasks-table .fsdb-col-resizer.is-active::after{background:var(--biu-color-emphasis)}
.fsdb-page .tasks-table.is-col-resize{cursor:col-resize;user-select:none}
.fsdb-row-check{position:relative;top:auto;left:auto;z-index:12;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;margin:0;transform:none;opacity:0;pointer-events:auto;transition:none}
.fsdb-check-slot.is-hover .fsdb-row-check,.fsdb-check-slot:hover .fsdb-row-check,.fsdb-row-check.is-on,.fsdb-row-check:hover,.fsdb-row-check:focus-visible{opacity:1}
.fsdb-page .tasks-th{display:inline-flex;align-items:center;gap:5px;min-width:0;max-width:100%;overflow:hidden;font-weight:var(--biu-font-weight-medium);white-space:nowrap;flex-wrap:nowrap}
.fsdb-page .tasks-th-ico{display:inline-flex;align-items:center;flex:none;line-height:0}
.fsdb-page .tasks-th svg,.fsdb-page .tasks-th .fsdb-field-glyph{color:var(--biu-color-icon)}
.fsdb-page .tasks-th.is-on svg{color:var(--biu-color-icon-active)}
.fsdb-page .tasks-table tr{cursor:default}
.fsdb-page .tasks-table tbody tr[data-record-id]{height:32px}
.fsdb-page .tasks-table tbody tr[data-record-id] td{padding-top:3px;padding-bottom:3px}
.fsdb-page .tasks-table tr.is-active td{background:color-mix(in srgb,var(--biu-color-text) 8%,var(--biu-color-surface))}
.fsdb-page .tasks-table tr.fsdb-group-row td{padding:6px 0;vertical-align:middle;background:transparent;border-right:0;cursor:default}
.fsdb-page .tasks-table tr.fsdb-group-row:hover td{background:transparent}
.fsdb-page .tasks-table tr.fsdb-group-row .tasks-queue-ghead{min-height:20px;padding:0 6px;gap:6px;align-items:center}
.fsdb-page .tasks-table tr.fsdb-group-pager{height:32px}
.fsdb-page .tasks-table tr.fsdb-group-pager td{padding:0;height:32px;background:transparent;border-right:0;vertical-align:middle}
.fsdb-page .tasks-table tr.fsdb-group-pager:hover td{background:transparent}
.fsdb-page .tasks-table tr.fsdb-group-pager .fsdb-pager{margin-top:0;height:32px;min-height:32px;padding:0 6px;color:var(--biu-color-text)}
.fsdb-page .tasks-table tr.fsdb-group-pager .fsdb-pager-meta{color:var(--biu-color-text)}
/* Group labels must use the horizontal table viewport, not an overflow-clipped colspan cell. */
.fsdb-page .tasks-table.is-cols-fixed tr.fsdb-group-row td,.fsdb-page .tasks-table.is-cols-fixed tr.fsdb-group-pager td{overflow:visible}
/* Allow device-pixel rounding at the trailing sticky boundary. */
.fsdb-page .tasks-table tr.fsdb-group-row .tasks-queue-ghead,.fsdb-page .tasks-table tr.fsdb-group-pager .fsdb-pager{position:sticky;left:0;z-index:4;box-sizing:border-box;margin-right:-1px;width:100cqw;max-width:100cqw;background:var(--biu-color-bg)}
.fsdb-page .tasks-table tr.fsdb-table-pad{box-sizing:border-box;font-size:0;line-height:0;overflow:hidden;pointer-events:none}
.fsdb-page .tasks-table tr.fsdb-table-pad td,.fsdb-page .tasks-table tr.fsdb-table-pad:hover td{padding:0;border:0;background:transparent;line-height:0;font-size:0;height:inherit;box-sizing:border-box;overflow:hidden;vertical-align:top}
.fsdb-page .tasks-table tr.fsdb-table-pad td > div{--fsdb-pad-line:color-mix(in srgb,var(--biu-color-border) 80%,transparent);display:block;box-sizing:border-box;overflow:hidden;contain:layout paint style;line-height:0;font-size:0;background-image:linear-gradient(to bottom,transparent calc(100% - var(--biu-stroke-width)),var(--fsdb-pad-line) 0),var(--fsdb-pad-cols,none);background-size:100% var(--fsdb-pad-row,32px),auto;background-repeat:repeat-y,no-repeat}
.fsdb-page .tasks-table.is-grid{display:block;position:relative;width:max-content;min-width:100%;border-bottom:0}
.fsdb-page .tasks-table.is-grid colgroup{display:none}
.fsdb-page .tasks-table.is-grid thead{display:block;width:100%}
.fsdb-page .tasks-table.is-grid thead tr{display:flex;align-items:stretch;width:100%}
.fsdb-page .tasks-table.is-grid tbody.fsdb-grid-body{display:block;position:relative;width:100%;min-height:1px;--fsdb-pad-line:color-mix(in srgb,var(--biu-color-border) 80%,transparent);background-image:linear-gradient(to bottom,transparent calc(100% - var(--biu-stroke-width)),var(--fsdb-pad-line) 0),var(--fsdb-pad-cols,none);background-size:100% var(--fsdb-pad-row,32px),auto;background-repeat:repeat-y,no-repeat;contain:layout style}
.fsdb-page .tasks-table.is-grid tbody.fsdb-grid-body.is-empty{background-image:none}
.fsdb-page .tasks-table.is-grid tbody.fsdb-grid-body > tr{position:absolute;top:0;left:0;width:100%;display:flex;align-items:stretch;box-sizing:border-box;background:var(--biu-color-surface);contain:layout style}
.fsdb-page .tasks-table.is-grid tbody.fsdb-grid-body.is-empty > tr{position:static;transform:none}
.fsdb-page .tasks-table.is-grid tbody.fsdb-grid-overlay{display:block;position:absolute;top:0;left:0;width:100%;height:0;overflow:visible;pointer-events:none}
.fsdb-page .tasks-table.is-grid tbody.fsdb-grid-overlay > tr{position:absolute;top:0;left:0;width:100%;display:flex;align-items:stretch;box-sizing:border-box;pointer-events:auto;contain:layout style}
.fsdb-page .tasks-table.is-grid.is-wrap tbody.fsdb-grid-body > tr[data-record-id]{height:auto;min-height:32px}
.fsdb-page .tasks-table.is-grid th,.fsdb-page .tasks-table.is-grid td{display:flex;align-items:center;flex:0 0 auto;box-sizing:border-box;min-width:0}
.fsdb-page .tasks-table.is-grid.is-wrap td{align-items:flex-start}
.fsdb-page .tasks-table.is-grid th.fsdb-col-fill,.fsdb-page .tasks-table.is-grid td.fsdb-col-fill{flex:1 1 0;width:auto!important;min-width:0;max-width:none;border-right:0}
.fsdb-page .tasks-table.is-grid th.fsdb-col-pad,.fsdb-page .tasks-table.is-grid td.fsdb-col-pad{flex:0 0 auto;border:0;padding:0}
.fsdb-page .tasks-table.is-grid tbody tr.fsdb-group-row,.fsdb-page .tasks-table.is-grid tbody tr.fsdb-group-pager{background:var(--biu-color-bg)}
.fsdb-page .tasks-table.is-grid tbody tr.fsdb-group-row td,.fsdb-page .tasks-table.is-grid tbody tr.fsdb-group-pager td,.fsdb-page .tasks-table.is-grid tbody tr > td.fsdb-empty{flex:1 1 100%;width:100%;max-width:none}
.fsdb-page .tasks-table.is-grid tbody tr.fsdb-summary-row{height:32px;background:var(--biu-color-surface)}
.fsdb-page .tasks-table.is-grid tbody tr.fsdb-summary-row td{height:32px;padding:0}
.fsdb-page .tasks-minicard{display:flex;flex-direction:column;gap:8px;position:relative;width:100%;min-width:0;height:auto;min-height:min-content;margin:0;overflow:visible;text-align:left;border:0;border-radius:8px;padding:10px 11px;background:var(--biu-color-bg-subtle);color:var(--biu-color-text);font:inherit;box-shadow:none;transition:background .12s ease}
.fsdb-page .tasks-minicard:hover{background:var(--biu-color-bg-hover)}
.fsdb-page .tasks-minicard.is-active{background:var(--biu-color-bg-hover)}
.fsdb-page .tasks-minicard-title{position:relative;display:flex;align-items:center;gap:6px;min-width:0;width:100%;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);line-height:1.25}
.fsdb-page .tasks-minicard-title .fsdb-title-text,.fsdb-page .tasks-minicard-title .fsdb-plain-input{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:var(--biu-font-weight-medium)}
.fsdb-page .tasks-minicard-title .fsdb-plain-input{width:100%;padding:0}
.fsdb-page .tasks-minicard .tasks-row-tools,.fsdb-page .tasks-minicard .tasks-title-open,.fsdb-page .tasks-minicard .tasks-row-actions{opacity:0;pointer-events:none}
.fsdb-page .tasks-minicard:hover .tasks-title-open,.fsdb-page .tasks-minicard:hover .tasks-row-actions,.fsdb-page .tasks-minicard:hover .tasks-row-tools,.fsdb-page .tasks-minicard:focus-within .tasks-title-open,.fsdb-page .tasks-minicard:focus-within .tasks-row-tools{opacity:1;pointer-events:auto}
.fsdb-page .tasks-queue-item .tasks-row-tools,.fsdb-page .tasks-queue-item .tasks-title-open,.fsdb-page .tasks-queue-item .tasks-row-actions{opacity:0;pointer-events:none}
.fsdb-page .tasks-queue-item:hover .tasks-row-tools,.fsdb-page .tasks-queue-item:hover .tasks-title-open,.fsdb-page .tasks-queue-item:hover .tasks-row-actions,.fsdb-page .tasks-queue-item:focus-within .tasks-row-tools,.fsdb-page .tasks-queue-item:focus-within .tasks-title-open{opacity:1;pointer-events:auto}
.fsdb-page .tasks-row-actions{display:inline-flex;align-items:center;gap:2px;flex:none}
.fsdb-page .tasks-icon-btn{border:0;border-radius:5px;padding:3px;background:transparent;color:var(--biu-color-icon);cursor:pointer;font:inherit;display:inline-flex;align-items:center;justify-content:center}
.fsdb-page .tasks-row-tools .tasks-icon-btn,.fsdb-page .tasks-row-actions .tasks-icon-btn{color:var(--biu-color-icon)}
.fsdb-page .tasks-table td[data-col-key="actions"].is-cell-on .tasks-icon-btn:focus-visible{background:var(--biu-color-bg-hover);color:var(--biu-color-icon-active);outline:none}
.fsdb-page .tasks-table td[data-col-key="actions"].is-cell-on .fsdb-action-btn:focus-visible{background:color-mix(in srgb,var(--biu-tag) 34%,transparent);color:var(--biu-tag);outline:none}
.fsdb-page .tasks-icon-btn:hover:not(:disabled),.fsdb-page .tasks-icon-btn.is-active{background:var(--biu-color-bg-hover);color:var(--biu-color-icon-active)}
.fsdb-page .tasks-row-tools .tasks-icon-btn:hover,.fsdb-page .tasks-row-tools .tasks-icon-btn.is-active,.fsdb-page .tasks-row-actions .tasks-icon-btn:hover,.fsdb-page .tasks-row-actions .tasks-icon-btn.is-active{color:var(--biu-color-icon-active)}
.fsdb-page .tasks-icon-btn.is-danger:hover{background:var(--biu-color-danger-muted);color:var(--biu-color-danger)}
.fsdb-page .tasks-icon-btn:disabled{opacity:.4;cursor:default}
.fsdb-page .tasks-icon-btn.tasks-title-open{color:var(--biu-color-icon)}
.fsdb-page .tasks-icon-btn.tasks-title-open:hover,.fsdb-page .tasks-icon-btn.tasks-title-open.is-active{color:var(--biu-color-icon-active)}
.fsdb-page .tasks-queue{display:flex;flex-direction:column;gap:18px;overflow:auto;box-sizing:border-box;width:100%;margin-left:0;padding:2px 0 12px 0;flex:1;min-width:0;min-height:0}
.fsdb-page .tasks-queue-group{display:flex;flex-direction:column;gap:2px}
.fsdb-page .tasks-queue-ghead{display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;padding:4px 8px;color:var(--biu-color-text);font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);letter-spacing:.01em;cursor:default}
.fsdb-page .tasks-group-fold{display:grid;width:16px;min-width:16px;height:16px;flex:none;place-items:center;border:0;border-radius:4px;padding:0;background:transparent;color:var(--biu-color-icon);cursor:pointer}
.fsdb-page .tasks-group-fold .sidebar-group-fold{position:relative;display:grid;width:16px;height:16px;place-items:center}
.fsdb-page .tasks-group-fold .sidebar-group-fold-face,.fsdb-page .tasks-group-fold .sidebar-group-fold-chevron{position:absolute;inset:0;display:grid;place-items:center;width:16px;height:16px;transition:opacity 140ms ease}
.fsdb-page .tasks-group-fold .sidebar-group-fold-chevron{opacity:0;pointer-events:none}
.fsdb-page .tasks-group-fold:hover .sidebar-group-fold-face,.fsdb-page .tasks-group-fold:focus-visible .sidebar-group-fold-face{opacity:0}
.fsdb-page .tasks-group-fold:hover .sidebar-group-fold-chevron,.fsdb-page .tasks-group-fold:focus-visible .sidebar-group-fold-chevron{opacity:1}
.fsdb-page .tasks-queue-glabel{font-weight:var(--biu-font-weight-medium);line-height:20px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-page .tasks-group-create{margin-left:auto;flex:none}
.fsdb-page .tasks-queue-gshare{color:var(--biu-color-icon-fixed)}
.fsdb-page .tasks-queue-count{margin-left:0;color:var(--biu-color-text);font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);background:var(--biu-color-bg-faint);border-radius:4px;padding:1px 7px}
.fsdb-page .tasks-queue-list{display:flex;flex-direction:column;margin:0;padding:0;list-style:none;gap:6px}
.fsdb-page .tasks-queue-item{display:block;min-width:0;width:100%}
.fsdb-page .tasks-queue-item-main{display:flex;align-items:center;gap:10px;flex:none;width:auto;min-width:0;box-sizing:border-box;overflow:visible;text-align:left;border:0;border-radius:6px;padding:2px 8px;background:transparent;color:var(--biu-color-text);font:inherit;cursor:default;box-shadow:none}
.fsdb-page .tasks-queue-item .tasks-row-actions{flex:none;padding:2px}
.fsdb-page .tasks-queue-item-title{position:relative;flex:1;min-width:0;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);line-height:1.4;overflow:hidden}
.fsdb-page .fsdb-proplist{display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;gap:4px 10px;min-width:0;max-width:100%;overflow:visible;height:auto}
.fsdb-page .fsdb-proplist .fsdb-proprow{display:inline-flex;width:auto;max-width:100%;min-width:0;min-height:20px;align-items:center;gap:4px;grid-template-columns:none}
.fsdb-page .tasks-minicard .fsdb-proplist .fsdb-proprow{min-height:18px}
.fsdb-page .fsdb-proplist .fsdb-proprow-v{min-width:0;overflow:hidden}
.fsdb-page .fsdb-proplist .fsdb-proprow-v:has(.fsdb-boolbox){overflow:visible;flex:none}
.fsdb-workspace{display:flex;flex-direction:column;min-width:0;min-height:min-content;flex:none;overflow:visible}
.fsdb-pager{display:flex;align-items:center;gap:8px;flex:none;box-sizing:border-box;margin-top:auto;height:32px;min-height:32px;padding:0;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-medium)}
.fsdb-page:not(.is-sheet) .fsdb-pager{padding-left:0}
/* 检查器底部分页与中间页、输入胶囊对齐。只加在工作区那一条上，分组里的分页器跟左侧一样贴着组走。 */
.inspector-database-page .fsdb-workspace > .fsdb-pager{margin-bottom:calc(var(--fsdb-pager-lift) - var(--brand-corner-clearance,1.25rem))}
.fsdb-pager-meta{display:inline-flex;align-items:center;gap:4px;min-width:0;flex:1;overflow:hidden;white-space:nowrap;color:var(--biu-color-text-subtle)}
.fsdb-pager-meta svg{flex:none}
.fsdb-pager-nav{display:inline-flex;align-items:center;gap:2px;flex:none;margin-left:auto}
.fsdb-pager-size{position:relative;display:inline-flex;align-items:center}
.fsdb-pager-size-btn{gap:4px;width:auto;min-width:0;height:var(--biu-size-control-md);padding:0 6px;border-radius:6px;font-variant-numeric:tabular-nums}
.fsdb-pager-size-menu{z-index:130;min-width:96px;padding:6px;background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);box-shadow:var(--biu-shadow-popover);display:flex;flex-direction:column;gap:2px}
.fsdb-pager-size-option{display:inline-flex;align-items:center;justify-content:space-between;gap:8px;width:100%;border:0;border-radius:7px;padding:6px 8px;background:transparent;color:var(--biu-color-text-muted);font:inherit;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);cursor:pointer;text-align:left}
.fsdb-pager-size-option:hover{background:var(--biu-color-bg-hover)}
.fsdb-pager-size-option.is-active{background:var(--biu-color-bg-hover);color:var(--biu-color-text);font-weight:var(--biu-font-weight-medium)}
.fsdb-pager .tasks-icon-btn{color:var(--biu-color-icon);width:var(--biu-size-control-md);height:var(--biu-size-control-md)}
.fsdb-pager .tasks-icon-btn:disabled{opacity:.4;cursor:default;color:var(--biu-color-icon)}
.fsdb-pager .fsdb-pager-size-btn{width:auto}
.fsdb-stage{display:flex;min-width:0;min-height:min-content;flex:none;flex-direction:column;overflow:visible}
.fsdb-plugin-surface{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.fsdb-rows-view{display:flex;flex-direction:column;gap:10px;overflow:auto;flex:1;min-width:0;min-height:0;padding:8px 12px 24px}
.fsdb-rows-view-item{min-width:0}
.fsdb-row-card{display:flex;flex-direction:column;gap:6px;width:100%;margin:0;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:10px;padding:10px 12px;background:var(--biu-color-surface);color:inherit;font:inherit;text-align:left;cursor:pointer}
.fsdb-row-card:hover{background:var(--biu-color-bg-hover)}
.fsdb-row-card-field{display:flex;align-items:baseline;justify-content:space-between;gap:12px;min-width:0}
.fsdb-row-card-k{flex:none;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-semibold)}
.fsdb-row-card-v{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium)}
.fsdb-mode-plus{display:flex;align-items:center;justify-content:flex-start;gap:6px;width:100%;margin:0;border:0;border-radius:7px;padding:6px 8px;background:transparent;color:var(--biu-color-text-muted);font-family:inherit;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);cursor:pointer;text-align:left}
.fsdb-mode-plus:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-mode-plus svg{color:var(--biu-color-icon)}
.fsdb-mode-plus:hover svg{color:var(--biu-color-icon-active)}
.fsdb-bool{display:inline-flex;align-items:center;flex:none;line-height:0;vertical-align:middle}
.fsdb-boolbtn{border:0;background:transparent;padding:0;cursor:pointer;display:inline-flex;align-items:center;flex:none;line-height:0;vertical-align:middle}
.fsdb-boolbox{width:16px;height:16px;border-radius:4px;border:1.5px solid var(--biu-color-border);display:inline-flex;align-items:center;justify-content:center;background:transparent;color:var(--biu-color-bg);box-sizing:border-box}
.fsdb-boolbox.is-on{background:var(--biu-color-emphasis);border-color:transparent;color:var(--biu-color-bg)}
.fsdb-boolbox.is-locked{cursor:default;opacity:.9}
.fsdb-boolbox.is-locked.is-on{background:var(--biu-color-emphasis);border-color:transparent;color:var(--biu-color-bg)}
.fsdb-boolbtn:hover .fsdb-boolbox:not(.is-on){border-color:var(--biu-color-text-muted)}
.fsdb-detail-stage{position:relative;display:flex;min-width:0;width:100%;min-height:min-content;flex:none;flex-direction:row;overflow:visible;background:var(--biu-color-bg)}
.heading-outline-host{position:absolute;inset:0 auto 0 0;width:12px;z-index:60;pointer-events:none;overflow:visible}
.fsdb-right:has(.heading-outline-host),.fsdb-right-body:has(.heading-outline-host),.fsdb-detail-stage:has(.heading-outline-host),.fsdb-right:has(.fsdb-detail-float-host),.fsdb-right-body:has(.fsdb-detail-float-host){position:relative}
.heading-outline-host .chat-outline{left:8px;top:50%}
.heading-outline-host .chat-outline::before{inset:0 auto 0 -8px;width:12px}
.fsdb-detail-main .fsdb-detail-title-row,.fsdb-detail-main .fsdb-detail-title,.fsdb-detail-main .ProseMirror > *,.fsdb-detail-main .page-find-hit{scroll-margin-top:calc(var(--biu-size-control-md) + 20px)}
.fsdb-detail-screen{display:flex;min-width:0;width:auto;min-height:min-content;flex:1;flex-direction:column;overflow:visible}
.fsdb-detail-screen .fsdb-detail-split,.fsdb-detail-screen > :not(header){flex:none;width:100%;min-height:min-content;overflow:visible}
.fsdb-detail-screen > .fsdb-detail-actionbar{height:0;min-height:0}
.fsdb-detail-float-host{position:absolute;inset:0 0 0 auto;width:12px;z-index:24;pointer-events:none;overflow:visible}
.fsdb-detail-float-nav{box-sizing:border-box;position:absolute;right:8px;top:50%;z-index:24;display:flex;flex-direction:column;gap:4px;width:auto;min-width:0;margin:0;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;overflow:visible;transform:translateY(-50%);opacity:1;pointer-events:none}
.fsdb-detail-float-nav::before{content:'';position:absolute;z-index:0;top:-120px;bottom:-120px;right:0;width:12px;pointer-events:auto}
.fsdb-detail-float-nav:hover,.fsdb-detail-float-nav:focus-within,.fsdb-detail-float-nav:has([aria-expanded=true]),html[data-nav-pin="1"] .fsdb-detail-float-nav{opacity:1}
.inspector-database-page .fsdb-detail-float-nav.has-share{opacity:1}
.fsdb-detail-float-btn{position:relative;z-index:1;display:flex;width:24px;height:24px;align-items:center;justify-content:center;margin:0;border:0;border-radius:6px;padding:0;background:transparent;color:var(--biu-color-icon);cursor:pointer;pointer-events:auto}
.fsdb-detail-float-btn svg{width:16px;height:16px}
.fsdb-detail-float-btn:hover:not(:disabled){background:var(--biu-color-bg-hover);color:var(--biu-color-icon-active)}
.fsdb-detail-float-btn:disabled{opacity:.35;cursor:default;color:var(--biu-color-icon)}
.fsdb-detail-more-menu{min-width:168px;padding:4px;display:flex;flex-direction:column;gap:1px;background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);box-shadow:var(--biu-shadow-popover)}
.fsdb-detail-more-menu.has-share{padding:0;overflow:auto;max-height:min(70vh,640px)}
.fsdb-detail-more-menu .fsdb-share-panel.is-embedded{position:static;top:auto;right:auto;z-index:auto;width:100%;max-height:none;box-shadow:none;border:0;border-radius:10px}
.fsdb-detail-more-item{display:flex;align-items:center;gap:8px;width:100%;margin:0;border:0;border-radius:6px;padding:7px 8px;background:transparent;color:var(--biu-color-text-muted);font:inherit;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-medium);text-align:left;cursor:pointer}
.fsdb-detail-more-item:hover,.fsdb-detail-more-item[aria-pressed=true],.fsdb-detail-more-item[aria-checked=true]{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-detail-more-item.is-danger{color:var(--biu-color-danger)}
.fsdb-detail-more-item.is-danger:hover{background:color-mix(in srgb,var(--biu-color-danger) 16%,transparent)}
.fsdb-detail-more-item svg{flex:none;width:16px;height:16px;color:var(--biu-color-icon)}
.fsdb-detail-more-item:hover svg,.fsdb-detail-more-item[aria-checked=true] svg{color:var(--biu-color-icon-active)}
.fsdb-detail-more-item svg.is-starred{color:var(--biu-color-warning-on-surface)}
.fsdb-detail-more-item .fsdb-detail-more-caret{margin-left:auto}
.fsdb-detail-main .tasks-filter-menu .fsdb-detail-more-item{width:100%}
.fsdb-detail-more-item.is-danger svg{color:var(--biu-color-danger)}
.fsdb-detail-split{display:flex;flex-direction:column;flex:none;width:100%;min-height:min-content;overflow:visible}
.fsdb-detail-main{box-sizing:border-box;width:100%;max-width:none;margin-inline:0;display:flex;flex-direction:column;gap:10px;padding:0 0 16px;min-width:0}
.fsdb-detail-main > :not(.fsdb-page-banner){box-sizing:border-box;width:100%;max-width:var(--biu-chat-max-width);margin-inline:auto;padding-left:var(--biu-pad-page);padding-right:var(--biu-pad-page)}
.fsdb-detail-main > .fsdb-tag-collect{max-width:none;margin-inline:0;padding-left:0;padding-right:0}
.fsdb-detail-main:not(:has(> .fsdb-page-banner)){padding-top:80px}
.fsdb-page-banner{position:relative;flex:none;box-sizing:border-box;width:100%;margin:0;height:240px;overflow:visible;background:var(--biu-color-bg-muted);border-radius:0;z-index:2}
.fsdb-page-banner.is-empty{height:80px;margin-bottom:0;background:transparent}
.fsdb-page-banner iframe{position:absolute;inset:0;display:block;width:100%;height:100%;border:0;pointer-events:none;background:transparent}
.fsdb-banner-right{position:absolute;left:auto;right:80px;top:16px;z-index:4;display:flex;flex-direction:column;align-items:flex-end;gap:8px;max-width:min(36rem,calc(100% - 160px));pointer-events:none}
.fsdb-page-banner:not(.is-empty) .fsdb-banner-right{top:auto;bottom:16px;transform:none}
.fsdb-banner-story{position:relative;left:auto;right:auto;top:auto;bottom:auto;z-index:3;max-width:100%;padding:10px 12px;border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);background:var(--biu-color-bg-popover);color:var(--biu-color-text);box-shadow:var(--biu-shadow-popover);opacity:0;transform:translateY(6px);pointer-events:none;transition:opacity .18s ease,transform .18s ease}
.fsdb-page-banner:hover .fsdb-banner-story,.fsdb-page-banner:focus-within .fsdb-banner-story{opacity:1;transform:none;pointer-events:auto}
.fsdb-banner-story-head,.fsdb-banner-fly-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.fsdb-banner-story-title{font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-bold);letter-spacing:.04em}
.fsdb-banner-story-note{margin-top:4px;font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-medium);line-height:1.5;color:var(--biu-color-text-muted)}
.fsdb-banner-title-actions{position:relative;left:auto;right:auto;top:auto;z-index:4;display:flex;align-items:center;margin:0;height:auto;opacity:0;pointer-events:none}
.fsdb-page-banner:hover .fsdb-banner-title-actions,.fsdb-page-banner:focus-within .fsdb-banner-title-actions,.fsdb-banner-title-actions:has([data-state=open]){opacity:1;pointer-events:auto}
.fsdb-banner-ico{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;margin:0;border:var(--biu-stroke-width) solid transparent;border-radius:6px;padding:0 8px;background:transparent;color:var(--biu-color-text-muted);font:inherit;font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-semibold);cursor:pointer}
.fsdb-banner-ico svg{color:var(--biu-color-icon)}
.fsdb-banner-ico:hover,.fsdb-banner-ico[data-state=open]{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-banner-ico:hover svg,.fsdb-banner-ico[data-state=open] svg{color:var(--biu-color-icon-active)}
.fsdb-page-banner:not(.is-empty) .fsdb-banner-ico{background:var(--biu-color-bg-elevated);border-color:var(--biu-color-border);box-shadow:var(--biu-shadow-md);color:var(--biu-color-text-muted)}
.fsdb-page-banner:not(.is-empty) .fsdb-banner-ico svg{color:var(--biu-color-icon)}
.fsdb-page-banner:not(.is-empty) .fsdb-banner-ico:hover,.fsdb-page-banner:not(.is-empty) .fsdb-banner-ico[data-state=open]{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-page-banner:not(.is-empty) .fsdb-banner-ico:hover svg,.fsdb-page-banner:not(.is-empty) .fsdb-banner-ico[data-state=open] svg{color:var(--biu-color-icon-active)}
.fsdb-banner-pop{width:min(520px,calc(100vw - 32px));max-height:min(560px,76vh);display:flex;flex-direction:column;background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);box-shadow:var(--biu-shadow-popover);overflow:hidden;z-index:var(--biu-z-float)}
.fsdb-banner-pop-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-bottom:var(--biu-stroke-width) solid var(--biu-color-border)}
.fsdb-banner-pop-tabs{display:flex;gap:2px}
.fsdb-banner-pop-tabs button,.fsdb-banner-pop-remove,.fsdb-banner-create{margin:0;border:0;border-radius:6px;padding:4px 8px;background:transparent;color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-semibold);cursor:pointer}
.fsdb-banner-pop-tabs button[aria-pressed=true]{background:var(--biu-color-bg-hover-strong)}
.fsdb-banner-pop-remove{color:var(--biu-color-text-muted)}
.fsdb-banner-pop-remove:hover,.fsdb-banner-pop-tabs button:hover,.fsdb-banner-create:hover{background:var(--biu-color-bg-hover)}
.fsdb-banner-pop-body{flex:1;min-height:0;overflow:auto;padding:10px 12px 14px;display:flex;flex-direction:column;gap:14px}
.fsdb-banner-pop-sec h3{margin:0 0 8px;color:var(--biu-color-text-muted);font-size:11px;font-weight:var(--biu-font-weight-semibold);letter-spacing:.04em}
.fsdb-banner-pop-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.fsdb-banner-card{display:flex;flex-direction:column;gap:5px;margin:0;border:0;padding:0;background:transparent;color:var(--biu-color-text);text-align:left;cursor:pointer;width:100%;min-width:0}
.fsdb-banner-thumb{position:relative;display:block;height:64px;margin:0;border:0;border-radius:6px;padding:0;overflow:hidden;background:var(--biu-color-bg-muted);width:100%}
.fsdb-banner-thumb iframe{display:block;width:200%;height:200%;border:0;pointer-events:none;transform:scale(.5);transform-origin:top left}
.fsdb-banner-caption{font-size:11px;font-weight:var(--biu-font-weight-bold);line-height:1.25;color:var(--biu-color-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-banner-fly{position:fixed;z-index:120;width:min(280px,calc(100vw - 24px));transform:translate(-50%,calc(-100% - 10px));padding:10px 12px;border-radius:var(--biu-radius-popover);background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);box-shadow:var(--biu-shadow-popover);pointer-events:auto;color:var(--biu-color-text)}
.fsdb-banner-fly-title{font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-bold);min-width:0;flex:1}
.fsdb-banner-fly-note{margin-top:5px;font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-medium);line-height:1.5;color:var(--biu-color-text-muted)}
.fsdb-banner-remix{display:inline-flex;align-items:center;gap:4px;flex:none;margin:0;border:0;border-radius:6px;padding:2px 6px;background:var(--biu-color-bg-hover);color:var(--biu-color-text-muted);font:inherit;font-size:11px;font-weight:var(--biu-font-weight-semibold);cursor:pointer;pointer-events:auto}
.fsdb-banner-remix svg{color:var(--biu-color-icon)}
.fsdb-banner-remix:hover{background:var(--biu-color-bg-hover-strong);color:var(--biu-color-text)}
.fsdb-banner-remix:hover svg{color:var(--biu-color-icon-active)}
.fsdb-banner-mine{position:relative;min-width:0}
.fsdb-banner-mine-del{position:absolute;top:4px;right:4px;z-index:2;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;margin:0;border:0;border-radius:6px;padding:0;background:rgba(0,0,0,.55);color:var(--biu-color-on-emphasis);opacity:0;cursor:pointer}
.fsdb-banner-mine:hover .fsdb-banner-mine-del,.fsdb-banner-mine:focus-within .fsdb-banner-mine-del{opacity:1}
.fsdb-banner-mine-del:hover{background:rgba(0,0,0,.78)}
.fsdb-banner-create{display:flex;align-items:center;justify-content:center;height:56px;border:1px dashed var(--biu-color-border)!important;color:var(--biu-color-text-muted)!important;text-align:center;line-height:1.3}
.fsdb-tag-collect{display:flex;flex:none;min-width:0;width:100%;min-height:320px}
.fsdb-tag-collect>.fsdb-page{flex:1;min-width:0;min-height:320px;background:transparent}
.fsdb-page-db-block{display:flex;flex:none;min-width:0;width:100%;min-height:120px;overflow:visible}
.fsdb-page-db-block>.fsdb-page{flex:1;min-width:0;min-height:120px;background:transparent;overflow:visible}
.fsdb-page-db-block .fsdb-right,.fsdb-page-db-block .fsdb-page.is-sheet .fsdb-right-body{overflow:visible}
.fsdb-page-db-block .fsdb-page.is-sheet .fsdb-check-rail{display:block}
.fsdb-page-db-block .fsdb-page .fsdb-main{padding:0}
.fsdb-page-db-block .fsdb-page .fsdb-main > :not(.fsdb-page-banner){max-width:none;margin-inline:0;padding-left:0;padding-right:0}
.fsdb-page-db-block .fsdb-page .fsdb-main > .tasks-toolbar{position:static;max-width:none;height:var(--biu-size-control-md);min-height:var(--biu-size-control-md);padding-top:0;padding-left:0;padding-right:0;background:transparent}
.fsdb-page-db-block .fsdb-page .fsdb-main > .tasks-toolbar::before,.fsdb-page-db-block .fsdb-page .fsdb-main > .tasks-toolbar::after{display:none}
.fsdb-page.is-sheet .tasks-main{padding:0;gap:10px;max-width:none}
.fsdb-page.is-sheet .fsdb-right-body{overflow:visible}
.fsdb-page.is-sheet .tasks-table-wrap{width:100%;margin-left:0;padding-left:0}
.fsdb-detail-aside{display:flex;flex-direction:column;gap:0;min-width:0;padding:0 0 12px;overflow-x:hidden}
.fsdb-page .fsdb-detail-aside .tasks-table{box-sizing:border-box;table-layout:fixed;width:100%;min-width:0;max-width:100%;border-right:0}
.fsdb-page .fsdb-detail-aside .tasks-table.is-wrap th,.fsdb-page .fsdb-detail-aside .tasks-table.is-wrap td{vertical-align:middle}
.fsdb-detail-aside .tasks-table th:first-child,.fsdb-detail-aside .tasks-table td:first-child{width:12rem;min-width:0;max-width:12rem;white-space:nowrap}
.fsdb-page .fsdb-detail-aside .tasks-table th:last-child,.fsdb-page .fsdb-detail-aside .tasks-table td:last-child{min-width:0;overflow:hidden;border-right:0}
.fsdb-page .fsdb-detail-aside .tasks-table.is-wrap .fsdb-prop-tr.is-tag-fold.is-open:has(.fsdb-schema-pack) td{vertical-align:top}
.fsdb-page .tasks-table .fsdb-prop-tr td{box-sizing:border-box;height:32px}
.fsdb-page .tasks-table .fsdb-prop-tr.is-open:has(.fsdb-schema-pack) td{height:auto;min-height:32px}
.fsdb-page .fsdb-detail-aside .tasks-table .fsdb-prop-tr.is-tag-fold td:last-child{vertical-align:top;padding:0}
.fsdb-page .tasks-table .fsdb-prop-tr.is-tag-fold td:first-child{vertical-align:top;padding-top:4px}
.fsdb-detail-aside .fsdb-prop-tr.is-tag-fold .fsdb-proprow-k{display:flex;align-items:center;min-height:22px;padding-top:0}
.fsdb-detail-aside .fsdb-prop-tr.is-tag-fold .fsdb-proprow-v,.fsdb-detail-aside .fsdb-prop-tr.is-tag-fold .fsdb-prop-val.is-schema{display:flex;flex-direction:column;align-items:stretch;min-height:22px;padding-top:0}
.fsdb-detail-aside .fsdb-prop-tr.is-tag-fold .fsdb-schema>:first-child,.fsdb-detail-aside .fsdb-prop-tr.is-tag-fold .fsdb-prop-val.is-schema>.fsdb-pop-host,.fsdb-detail-aside .fsdb-prop-tr.is-tag-fold .fsdb-schema>.fsdb-pop-host,.fsdb-detail-aside .fsdb-prop-tr.is-tag-fold .fsdb-prop-val.is-schema>:not(.fsdb-schema){flex:none;display:flex;align-items:center;align-content:center;box-sizing:border-box;min-height:calc(32px - var(--biu-stroke-width));padding:4px 6px;margin:0}
.fsdb-detail-aside .fsdb-prop-tr.is-tag-fold .fsdb-schema{gap:0}
.fsdb-detail-aside .fsdb-prop-tr.is-tag-fold.is-open .fsdb-schema-pack{padding-top:0}
.fsdb-detail-aside .fsdb-prop-tr.is-tag-fold.is-open:has(.fsdb-schema-pack) .fsdb-schema>:first-child,
.fsdb-detail-aside .fsdb-prop-tr.is-tag-fold.is-open:has(.fsdb-schema-pack) .fsdb-schema>.fsdb-pop-host{display:flex;box-sizing:border-box;align-items:center;align-content:center;min-height:calc(32px - var(--biu-stroke-width));padding:4px 6px}
.fsdb-detail-aside .fsdb-prop,.fsdb-detail-aside .fsdb-prop-tr{display:table-row;grid-template-columns:none;min-height:0;gap:0}
.fsdb-detail-aside .fsdb-proprow-k,.fsdb-detail-aside .fsdb-prop>span:first-child,.fsdb-detail-aside .fsdb-proprow-label,.fsdb-detail-aside .fsdb-schema-prop-k,.fsdb-detail-aside .fsdb-schema-prop-k.is-rename{color:var(--biu-color-text)}
.fsdb-detail-aside .fsdb-proprow-k svg,.fsdb-detail-aside .fsdb-prop>span:first-child svg,.fsdb-detail-aside .fsdb-schema-prop-k svg,.fsdb-detail-aside .fsdb-schema-prop-k .fsdb-field-glyph{color:var(--biu-color-icon);opacity:1}
.fsdb-detail-aside .fsdb-proprow-v,.fsdb-detail-aside .fsdb-prop-val,.fsdb-detail-aside .fsdb-detail-id,.fsdb-detail-aside .fsdb-plain-input,.fsdb-detail-aside .fsdb-schema-prop-v,.fsdb-detail-aside .fsdb-schema-prop-v .fsdb-muted{color:var(--biu-color-text)}
.fsdb-proprow,.fsdb-prop{display:grid;grid-template-columns:108px minmax(0,1fr);align-items:center;gap:8px;min-height:32px;font-size:var(--biu-font-size-4);color:var(--biu-color-text)}
.fsdb-detail-aside .fsdb-proprow-k{display:flex;width:100%}
.fsdb-proprow-k,.fsdb-prop>span:first-child{font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);color:var(--biu-color-text);display:inline-flex;align-items:center;gap:6px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-proprow-k svg,.fsdb-prop>span:first-child svg,.fsdb-schema-prop-k svg{color:var(--biu-color-icon);opacity:1}
.fsdb-proprow-k .fsdb-field-glyph,.fsdb-prop>span:first-child .fsdb-field-glyph,.fsdb-schema-prop-k .fsdb-field-glyph,.fsdb-proprow-k .fsdb-field-hero,.fsdb-prop>span:first-child .fsdb-field-hero,.fsdb-schema-prop-k .fsdb-field-hero{color:var(--biu-color-icon)}
.fsdb-proprow-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--biu-color-text)}
.fsdb-prop-desc-btn{display:grid;place-items:center;flex:none;margin-left:auto;width:20px;height:20px;border:0;border-radius:4px;padding:0;background:transparent;color:var(--biu-color-text-subtle);cursor:pointer}
.fsdb-prop-desc-btn svg,.fsdb-detail-aside .fsdb-proprow-k .fsdb-prop-desc-btn svg,.fsdb-detail-aside .fsdb-schema-prop-k .fsdb-prop-desc-btn svg,.fsdb-page .tasks-table .fsdb-schema-prop-k .fsdb-prop-desc-btn svg{color:currentColor;opacity:.72}
.fsdb-prop-desc-btn:hover,.fsdb-prop-desc-btn.is-on{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-prop-desc-btn:hover svg,.fsdb-prop-desc-btn.is-on svg,.fsdb-detail-aside .fsdb-proprow-k .fsdb-prop-desc-btn:hover svg,.fsdb-detail-aside .fsdb-proprow-k .fsdb-prop-desc-btn.is-on svg,.fsdb-detail-aside .fsdb-schema-prop-k .fsdb-prop-desc-btn:hover svg,.fsdb-detail-aside .fsdb-schema-prop-k .fsdb-prop-desc-btn.is-on svg,.fsdb-page .tasks-table .fsdb-schema-prop-k .fsdb-prop-desc-btn:hover svg,.fsdb-page .tasks-table .fsdb-schema-prop-k .fsdb-prop-desc-btn.is-on svg{color:currentColor;opacity:1}
.fsdb-prop-desc-pop{max-width:min(280px,calc(100vw - 24px));white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;padding:8px 10px;border:var(--biu-stroke-width) solid var(--biu-color-border-popover,color-mix(in srgb,var(--biu-color-border) 92%,transparent));border-radius:var(--biu-radius-popover,8px);background:var(--biu-color-bg-popover,color-mix(in srgb,var(--biu-color-bg-elevated,var(--biu-color-bg-subtle)) 96%,transparent));backdrop-filter:blur(8px);color:var(--biu-color-text);font-size:12px;font-weight:var(--biu-font-weight-normal,400);line-height:1.5;letter-spacing:.01em;box-shadow:var(--biu-shadow-popover,0 6px 20px rgba(0,0,0,.24),0 1px 3px rgba(0,0,0,.14));user-select:text}
.fsdb-proprow-v,.fsdb-prop-val,.fsdb-detail-id{min-width:0;font-weight:var(--biu-font-weight-medium);color:var(--biu-color-text)}
.fsdb-proprow.is-stack,.fsdb-prop.is-stack{align-items:flex-start;flex-wrap:wrap}
.fsdb-proprow.is-stack .fsdb-proprow-k,.fsdb-prop.is-stack>span:first-child{padding-top:6px}
.fsdb-proprow-fold{position:relative;display:inline-grid;place-items:center;width:14px;height:14px;flex:none;margin:0;border:0;padding:0;background:transparent;color:inherit;cursor:pointer}
.fsdb-proprow-glyph,.fsdb-proprow-chevron{display:grid;place-items:center;width:14px;height:14px;transition:opacity 140ms ease}
.fsdb-proprow-chevron{position:absolute;inset:0;opacity:0;pointer-events:none}
.fsdb-proprow.is-tag-fold:hover .fsdb-proprow-glyph,.fsdb-prop-tr.is-tag-fold:hover .fsdb-proprow-glyph,.fsdb-proprow.is-tag-fold:focus-within .fsdb-proprow-glyph,.fsdb-prop-tr.is-tag-fold:focus-within .fsdb-proprow-glyph{opacity:0}
.fsdb-proprow.is-tag-fold:hover .fsdb-proprow-chevron,.fsdb-prop-tr.is-tag-fold:hover .fsdb-proprow-chevron,.fsdb-proprow.is-tag-fold:focus-within .fsdb-proprow-chevron,.fsdb-prop-tr.is-tag-fold:focus-within .fsdb-proprow-chevron{opacity:1}
.fsdb-proprow.is-tag-fold{align-items:start}
.fsdb-proprow.is-tag-fold:not(:has(.fsdb-schema)){align-items:center}
.fsdb-proprow.is-tag-fold .fsdb-proprow-k,.fsdb-prop-tr.is-tag-fold .fsdb-proprow-k{min-height:22px;padding-top:0}
.fsdb-proprow.is-tag-fold .fsdb-proprow-v,.fsdb-prop-tr.is-tag-fold .fsdb-proprow-v,.fsdb-proprow.is-tag-fold .fsdb-prop-val.is-schema,.fsdb-prop-tr.is-tag-fold .fsdb-prop-val.is-schema{min-height:22px;display:flex;align-items:center}
.fsdb-proprow.is-tag-fold.is-open:has(.fsdb-schema-pack) .fsdb-proprow-v,.fsdb-prop-tr.is-tag-fold.is-open:has(.fsdb-schema-pack) .fsdb-proprow-v,.fsdb-proprow.is-tag-fold.is-open:has(.fsdb-schema-pack) .fsdb-prop-val.is-schema,.fsdb-prop-tr.is-tag-fold.is-open:has(.fsdb-schema-pack) .fsdb-prop-val.is-schema{align-items:stretch}
.fsdb-proprow.is-tag-fold .fsdb-prop-val.is-schema>.fsdb-pop-host,.fsdb-prop-tr.is-tag-fold .fsdb-prop-val.is-schema>.fsdb-pop-host,.fsdb-proprow.is-tag-fold .fsdb-pop-host,.fsdb-prop-tr.is-tag-fold .fsdb-pop-host{min-height:22px;align-items:center;align-content:center}
.fsdb-proprow.is-tag-fold .fsdb-schema>:first-child,.fsdb-prop-tr.is-tag-fold .fsdb-schema>:first-child{min-height:22px;display:flex;align-items:center}
.fsdb-prop-val.is-schema{overflow:visible;white-space:normal;max-width:none}
.fsdb-schema{display:flex;flex-direction:column;gap:0;min-width:0;width:100%}
.fsdb-schema-pack{display:flex;flex-direction:column;gap:0;min-width:0;padding:0}
.fsdb-schema-pack-inner{display:flex;flex-direction:column;gap:0;min-width:0;min-height:0}
.fsdb-proprow.is-tag-fold .fsdb-schema-pack,.fsdb-prop-tr.is-tag-fold .fsdb-schema-pack{display:grid;grid-template-rows:0fr;transition:grid-template-rows 180ms cubic-bezier(.22,1,.36,1)}
.fsdb-proprow.is-tag-fold.is-open .fsdb-schema-pack,.fsdb-prop-tr.is-tag-fold.is-open .fsdb-schema-pack{grid-template-rows:1fr}
.fsdb-proprow.is-tag-fold .fsdb-schema-pack>.fsdb-schema-pack-inner,.fsdb-prop-tr.is-tag-fold .fsdb-schema-pack>.fsdb-schema-pack-inner{overflow:hidden;opacity:0;pointer-events:none;transition:opacity 140ms ease}
.fsdb-proprow.is-tag-fold.is-open .fsdb-schema-pack>.fsdb-schema-pack-inner,.fsdb-prop-tr.is-tag-fold.is-open .fsdb-schema-pack>.fsdb-schema-pack-inner{opacity:1;pointer-events:auto}
.fsdb-schema-pack-head{display:flex;align-items:center;box-sizing:border-box;min-height:32px;padding:4px 6px;box-shadow:0 var(--biu-stroke-width) 0 0 color-mix(in srgb,var(--biu-color-border) 80%,transparent)}
.fsdb-proprow.is-tag-fold .fsdb-schema:has(.fsdb-schema-pack)>.fsdb-pop-host,.fsdb-prop-tr.is-tag-fold .fsdb-schema:has(.fsdb-schema-pack)>.fsdb-pop-host{transition:box-shadow 140ms ease}
.fsdb-proprow.is-tag-fold.is-open .fsdb-schema:has(.fsdb-schema-pack)>.fsdb-pop-host,.fsdb-prop-tr.is-tag-fold.is-open .fsdb-schema:has(.fsdb-schema-pack)>.fsdb-pop-host{display:flex;box-sizing:border-box;align-items:center;align-content:center;min-height:32px;padding:4px 6px}
.fsdb-proprow.is-tag-fold.is-open .fsdb-schema:has(.fsdb-schema-pack)>.fsdb-pop-host,.fsdb-prop-tr.is-tag-fold.is-open .fsdb-schema:has(.fsdb-schema-pack)>.fsdb-pop-host{box-shadow:0 var(--biu-stroke-width) 0 0 color-mix(in srgb,var(--biu-color-border) 80%,transparent)}
.fsdb-schema-pack:last-child>:last-child{box-shadow:none}
.fsdb-schema-pack:last-child>.fsdb-schema-pack-inner>:last-child{box-shadow:none}
.fsdb-schema-prop{display:grid;grid-template-columns:108px minmax(0,1fr);align-items:center;gap:8px;box-sizing:border-box;min-width:0;width:100%;min-height:32px;border-radius:0;padding:4px 6px;box-shadow:0 var(--biu-stroke-width) 0 0 color-mix(in srgb,var(--biu-color-border) 80%,transparent)}
.fsdb-schema-prop:hover{background:var(--biu-color-bg-hover)}
.fsdb-schema-prop-k-row{display:flex;align-items:center;gap:4px;min-width:0;width:100%}
.fsdb-schema-prop-k{display:flex;width:100%;align-items:center;gap:6px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);color:var(--biu-color-text)}
.fsdb-schema-prop-k-row .fsdb-schema-prop-k.is-rename{flex:1 1 auto;width:auto}
.fsdb-schema-prop-k.is-rename{margin:0;border:0;padding:0;background:transparent;color:var(--biu-color-text);font:inherit;cursor:text;text-align:left}
.fsdb-schema-prop-k .fsdb-field-glyph,.fsdb-schema-prop-k .fsdb-field-hero{color:var(--biu-color-icon)}
.fsdb-page .tasks-table .fsdb-schema-prop-k svg,.fsdb-page .tasks-table .fsdb-schema-prop-k .fsdb-field-glyph,.fsdb-page .tasks-table .fsdb-schema-prop-k .fsdb-field-hero,.fsdb-page .tasks-table .fsdb-schema-prop-type svg,.fsdb-page .tasks-table .fsdb-schema-prop-type .fsdb-field-glyph,.fsdb-page .tasks-table .fsdb-schema-prop-type .fsdb-field-hero{color:var(--biu-color-icon)}
.fsdb-schema-prop-k.is-editing{flex-direction:column;align-items:stretch;gap:4px;overflow:visible;white-space:normal}
.fsdb-schema-prop-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-schema-prop-info{flex:none;width:13px;height:13px;color:var(--biu-color-text-subtle);opacity:.65}
.fsdb-schema-prop-edit-row{display:inline-flex;align-items:center;gap:4px;min-width:0;width:100%}
.fsdb-schema-prop-rename{flex:1;min-width:0;border:0;border-radius:4px;padding:2px 4px;background:var(--biu-color-bg-hover);color:var(--biu-color-text);font:inherit;font-size:inherit;outline:none}
.fsdb-schema-prop-info-btn{display:grid;place-items:center;flex:none;width:20px;height:20px;border:0;border-radius:4px;padding:0;background:transparent;color:var(--biu-color-text-subtle);cursor:pointer}
.fsdb-schema-prop-info-btn:hover,.fsdb-schema-prop-info-btn.is-on{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-schema-prop-desc{width:100%;box-sizing:border-box;border:1px solid var(--biu-color-border);border-radius:4px;padding:3px 6px;background:var(--biu-color-bg);color:var(--biu-color-text);font-size:var(--biu-font-size-3);font-weight:400;outline:none}
.fsdb-schema-prop-desc:focus{background:var(--biu-color-bg-hover)}
.fsdb-schema-prop-v{display:flex;align-items:center;gap:4px;min-width:0;width:100%;color:var(--biu-color-text-subtle)}
.fsdb-schema-prop-type{display:inline-flex;align-items:center;gap:6px;min-width:0;color:var(--biu-color-text)}
.fsdb-schema-prop-type .fsdb-field-glyph,.fsdb-schema-prop-type .fsdb-field-hero{color:var(--biu-color-icon)}
.fsdb-schema-prop-v .fsdb-plain-input,.fsdb-schema-prop-v .fsdb-cellselect,.fsdb-schema-prop-v>.fsdb-pop-host,.fsdb-schema-prop-v>:first-child{flex:1 1 auto;min-width:0;width:auto;max-width:100%}
.fsdb-detail-aside .fsdb-prop-tr.is-tag-fold .fsdb-schema-prop-v .fsdb-pop-host,.fsdb-page .fsdb-detail-aside .tasks-table.is-wrap .fsdb-schema-prop-v .fsdb-pop-host{flex:1 1 auto;width:auto;min-width:0;max-width:100%}
.fsdb-schema-prop-del{opacity:0;display:grid;place-items:center;flex:none;margin-left:auto;width:22px;height:22px;min-width:22px;border:0;border-radius:var(--biu-radius-sm);background:transparent;color:var(--biu-color-text-subtle);cursor:pointer}
.fsdb-schema-prop:hover .fsdb-schema-prop-del{opacity:1}
.fsdb-schema-prop-del:hover{color:var(--biu-color-danger);background:color-mix(in srgb,var(--biu-color-danger) 12%,transparent)}
.fsdb-schema-prop.is-orphan .fsdb-schema-prop-k{color:var(--biu-color-text-subtle);font-weight:var(--biu-font-weight-medium)}
.fsdb-schema-prop.is-orphan .fsdb-schema-prop-k svg{opacity:.45}
.fsdb-schema-prop.is-orphan .fsdb-schema-prop-v > :first-child{flex:1;min-width:0}
.fsdb-schema-prop-restore{opacity:1;display:grid;place-items:center;flex:none;width:22px;height:22px;min-width:22px;border:0;border-radius:var(--biu-radius-sm);background:transparent;color:var(--biu-color-text-subtle);cursor:pointer}
.fsdb-schema-prop-restore:hover{color:var(--biu-color-text);background:var(--biu-color-bg-hover)}
.fsdb-schema-addprop{display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;margin:0;min-height:32px;padding:4px 6px;border:0;border-radius:0;background:transparent;box-shadow:0 var(--biu-stroke-width) 0 0 color-mix(in srgb,var(--biu-color-border) 80%,transparent);color:var(--biu-color-text-subtle);font:inherit;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);cursor:pointer;text-align:left}
.fsdb-schema-addprop svg{width:14px;height:14px;flex:none;color:var(--biu-color-icon)}
.fsdb-schema-addprop:hover{background:var(--biu-color-bg-hover)}
.fsdb-schema-addprop-form{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0;min-width:0;width:100%;box-sizing:border-box;min-height:32px;padding:4px 6px;box-shadow:0 var(--biu-stroke-width) 0 0 color-mix(in srgb,var(--biu-color-border) 80%,transparent)}
.fsdb-schema-addprop-err{flex:1 1 100%;font-size:var(--biu-font-size-2);color:var(--biu-color-danger)}
.fsdb-schema-addprop-input{flex:1;min-width:0;border:0;border-radius:6px;padding:4px 6px;background:var(--biu-color-bg-hover);color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-4);outline:none}
.fsdb-schema-addprop-ok{border:0;border-radius:6px;padding:4px 8px;background:transparent;color:var(--biu-color-text-muted);font:inherit;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold);cursor:pointer}
.fsdb-schema-type{position:relative;flex:none}
.fsdb-schema-type-btn{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 6px;border:0;border-radius:6px;background:transparent;color:var(--biu-color-text-muted);font:inherit;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-medium);cursor:pointer}
.fsdb-schema-type-btn .fsdb-field-glyph,.fsdb-schema-type-btn .fsdb-field-hero{color:var(--biu-color-icon)}
.fsdb-schema-type-btn:hover,.fsdb-schema-type-btn[data-state=open]{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-schema-type-btn:hover .fsdb-field-glyph,.fsdb-schema-type-btn[data-state=open] .fsdb-field-glyph,.fsdb-schema-type-btn:hover .fsdb-field-hero,.fsdb-schema-type-btn[data-state=open] .fsdb-field-hero{color:var(--biu-color-icon-active)}
.fsdb-schema-type-caret{color:var(--biu-color-icon)}
.fsdb-schema-type-menu{z-index:70;display:flex;flex-direction:column;min-width:160px;max-height:240px;overflow:auto;padding:4px;background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);box-shadow:var(--biu-shadow-popover)}
.fsdb-schema-type-option{display:flex;align-items:center;gap:6px;width:100%;border:0;border-radius:6px;padding:6px 8px;background:transparent;color:var(--biu-color-text-muted);font:inherit;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);text-align:left;cursor:pointer}
.fsdb-schema-type-option .fsdb-field-glyph,.fsdb-schema-type-option .fsdb-field-hero{color:var(--biu-color-icon)}
.fsdb-schema-type-option:hover,.fsdb-schema-type-option.is-on{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-schema-type-option:hover .fsdb-field-glyph,.fsdb-schema-type-option.is-on .fsdb-field-glyph,.fsdb-schema-type-option:hover .fsdb-field-hero,.fsdb-schema-type-option.is-on .fsdb-field-hero{color:var(--biu-color-icon-active)}
.fsdb-prop-val{min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--biu-color-text-subtle)}
.fsdb-prop-val:not(.is-schema):not(.is-actions):not(.is-pane){display:flex;align-items:center;min-height:22px}
.fsdb-prop-val .biu-tags,.fsdb-prop-val .biu-tag,.fsdb-prop-val .fsdb-pop-host:has(.biu-tags){align-items:center;align-content:center}
.fsdb-prop-val .biu-tag-label{height:100%;line-height:inherit}
.fsdb-prop-val.is-actions{overflow:visible;white-space:normal;text-overflow:clip}
.fsdb-prop-val.is-actions .tasks-row-actions{flex-wrap:wrap}
.fsdb-prop-val .fsdb-plain-input,.fsdb-prop-val .fsdb-link,.fsdb-prop-val .fsdb-meta,.fsdb-prop-val .fsdb-file:not(.is-chip){max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-prop-val .fsdb-files,.fsdb-prop-val .fsdb-file.is-chip{align-items:center;align-content:center;overflow:visible;white-space:normal;text-overflow:clip}
.fsdb-prop-val .fsdb-file.is-chip .fsdb-file-name{max-width:8em}
.fsdb-prop-val .fsdb-plain-input{text-overflow:ellipsis}
.fsdb-prop-val .fsdb-plain-input:focus{text-overflow:clip}
.fsdb-prop-val .fsdb-link{display:block;overflow-wrap:normal}
.fsdb-detail-title-row{display:flex;align-items:flex-start;gap:12px;min-width:0;padding-bottom:6px}
.fsdb-detail-title-block{position:relative;display:flex;flex:1;min-width:0;flex-direction:column;gap:6px}
.fsdb-detail-actionbar{position:sticky;top:calc(100% - 35px);z-index:26;display:flex;justify-content:center;width:100%;height:0;min-height:0;overflow:visible;pointer-events:none}
.fsdb-page.is-plugins .fsdb-detail-actionbar{top:calc(100% - 55px)}
.fsdb-detail-title-icon-wrap{position:relative;flex:none}
.fsdb-detail-icon-slot{position:relative;z-index:24;width:100%;margin:-42px 0 8px;pointer-events:none}
.fsdb-detail-icon-slot > *{pointer-events:auto}
.fsdb-detail-title-icon{display:inline-flex;align-items:center;justify-content:center;width:78px;height:78px;margin:0;border:0;border-radius:18px;padding:0;background:transparent;color:var(--biu-color-icon);font-size:64px;line-height:1;overflow:visible}
.fsdb-detail-title-icon svg{width:78px;height:78px;color:var(--biu-color-icon)}
button.fsdb-detail-title-icon{cursor:pointer}
button.fsdb-detail-title-icon:hover{background:color-mix(in srgb,var(--biu-color-bg-hover) 80%,transparent);color:var(--biu-color-icon-active)}
.fsdb-detail-title-icon .fsdb-record-emoji{display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:58px;line-height:1}
.fsdb-detail-title-icon .fsdb-record-mark.is-lg{width:78px;height:78px;display:inline-flex;align-items:center;justify-content:center}
.fsdb-detail-title-icon .sidebar-mascot,
.fsdb-detail-title-icon .sidebar-mascot svg{width:78px!important;height:78px!important}
.fsdb-record-mark{display:inline-grid;place-items:center;flex:none;overflow:hidden;line-height:0}
.fsdb-page{--fsdb-glyph-check:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M8%2015A7%207%200%201%200%208%201a7%207%200%200%200%200%2014Zm3.844-8.791a.75.75%200%200%200-1.188-.918l-3.7%204.79-1.649-1.833a.75.75%200%201%200-1.114%201.004l2.25%202.5a.75.75%200%200%200%201.15-.043l4.25-5.5Z%22%20fill-rule%3D%22evenodd%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E");--fsdb-glyph-chat:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M1%208.849c0%201%20.738%201.851%201.734%201.947L3%2010.82v2.429a.75.75%200%200%200%201.28.53l1.82-1.82A3.484%203.484%200%200%201%205.5%2010V9A3.5%203.5%200%200%201%209%205.5h4V4.151c0-1-.739-1.851-1.734-1.947a44.539%2044.539%200%200%200-8.532%200C1.738%202.3%201%203.151%201%204.151V8.85Z%22%2F%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M7%209a2%202%200%200%201%202-2h4a2%202%200%200%201%202%202v1a2%202%200%200%201-2%202h-.25v1.25a.75.75%200%200%201-1.28.53L9.69%2012H9a2%202%200%200%201-2-2V9Z%22%2F%3E%3C%2Fsvg%3E");--fsdb-glyph-cursor:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M7.25%201.75a.75.75%200%200%201%201.5%200v1.5a.75.75%200%200%201-1.5%200v-1.5ZM11.536%202.904a.75.75%200%201%201%201.06%201.06l-1.06%201.061a.75.75%200%200%201-1.061-1.06l1.06-1.061ZM14.5%207.5a.75.75%200%200%200-.75-.75h-1.5a.75.75%200%200%200%200%201.5h1.5a.75.75%200%200%200%20.75-.75ZM4.464%209.975a.75.75%200%200%201%201.061%201.06l-1.06%201.061a.75.75%200%201%201-1.061-1.06l1.06-1.061ZM4.5%207.5a.75.75%200%200%200-.75-.75h-1.5a.75.75%200%200%200%200%201.5h1.5a.75.75%200%200%200%20.75-.75ZM5.525%203.964a.75.75%200%200%201-1.06%201.061l-1.061-1.06a.75.75%200%200%201%201.06-1.061l1.061%201.06ZM8.779%207.438a.75.75%200%200%200-1.368.366l-.396%205.283a.75.75%200%200%200%201.212.646l.602-.474.288%201.074a.75.75%200%201%200%201.449-.388l-.288-1.075.759.11a.75.75%200%200%200%20.726-1.165L8.78%207.438Z%22%2F%3E%3C%2Fsvg%3E");--fsdb-glyph-page:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M2.5%203.5A1.5%201.5%200%200%201%204%202h4.879a1.5%201.5%200%200%201%201.06.44l3.122%203.12a1.5%201.5%200%200%201%20.439%201.061V12.5A1.5%201.5%200%200%201%2012%2014H4a1.5%201.5%200%200%201-1.5-1.5v-9Z%22%2F%3E%3C%2Fsvg%3E");--fsdb-glyph-skill:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M7.702%201.368a.75.75%200%200%201%20.597%200c2.098.91%204.105%201.99%206.004%203.223a.75.75%200%200%201-.194%201.348A34.27%2034.27%200%200%200%208.341%208.25a.75.75%200%200%201-.682%200c-.625-.32-1.262-.62-1.909-.901v-.542a36.878%2036.878%200%200%201%202.568-1.33.75.75%200%200%200-.636-1.357%2038.39%2038.39%200%200%200-3.06%201.605.75.75%200%200%200-.372.648v.365c-.773-.294-1.56-.56-2.359-.8a.75.75%200%200%201-.194-1.347%2040.901%2040.901%200%200%201%206.005-3.223ZM4.25%208.348c-.53-.212-1.067-.411-1.611-.596a40.973%2040.973%200%200%200-.418%202.97.75.75%200%200%200%20.474.776c.175.068.35.138.524.21a5.544%205.544%200%200%201-.58.681.75.75%200%201%200%201.06%201.06c.35-.349.655-.726.915-1.124a29.282%2029.282%200%200%200-1.395-.617A5.483%205.483%200%200%200%204.25%208.5v-.152Z%22%2F%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M7.603%2013.96c-.96-.6-1.958-1.147-2.989-1.635a6.981%206.981%200%200%200%201.12-3.341c.419.192.834.393%201.244.602a2.25%202.25%200%200%200%202.045%200%2032.787%2032.787%200%200%201%204.338-1.834c.175.978.315%201.969.419%202.97a.75.75%200%200%201-.474.776%2029.385%2029.385%200%200%200-4.909%202.461.75.75%200%200%201-.794%200Z%22%2F%3E%3C%2Fsvg%3E");--fsdb-glyph-table:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M15%2011a2%202%200%200%201-2%202H3a2%202%200%200%201-2-2V5a2%202%200%200%201%202-2h10a2%202%200%200%201%202%202v6ZM7.25%207.5a.5.5%200%200%200-.5-.5H3a.5.5%200%200%200-.5.5V8a.5.5%200%200%200%20.5.5h3.75a.5.5%200%200%200%20.5-.5v-.5Zm1.5%203a.5.5%200%200%201%20.5-.5H13a.5.5%200%200%201%20.5.5v.5a.5.5%200%200%201-.5.5H9.25a.5.5%200%200%201-.5-.5v-.5ZM13.5%208v-.5A.5.5%200%200%200%2013%207H9.25a.5.5%200%200%200-.5.5V8a.5.5%200%200%200%20.5.5H13a.5.5%200%200%200%20.5-.5Zm-6.75%203.5a.5.5%200%200%200%20.5-.5v-.5a.5.5%200%200%200-.5-.5H3a.5.5%200%200%200-.5.5v.5a.5.5%200%200%200%20.5.5h3.75Z%22%20fill-rule%3D%22evenodd%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E")}
.fsdb-page .fsdb-record-mark[data-icon]{background-color:currentColor;-webkit-mask:var(--fsdb-glyph,var(--fsdb-glyph-table)) center/contain no-repeat;mask:var(--fsdb-glyph,var(--fsdb-glyph-table)) center/contain no-repeat}
.fsdb-page .fsdb-record-mark[data-icon="check"]{--fsdb-glyph:var(--fsdb-glyph-check)}
.fsdb-page .fsdb-record-mark[data-icon="chat"],.fsdb-page .fsdb-record-mark[data-icon="cursor"]{--fsdb-glyph:var(--fsdb-glyph-cursor)}
.fsdb-page .fsdb-record-mark[data-icon="page"]{--fsdb-glyph:var(--fsdb-glyph-page)}
.fsdb-page .fsdb-record-mark[data-icon="skill"]{--fsdb-glyph:var(--fsdb-glyph-skill)}
.fsdb-page .fsdb-record-mark[data-icon="table"]{--fsdb-glyph:var(--fsdb-glyph-table)}
.fsdb-page{--fsdb-glyph-data:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M8%207c3.314%200%206-1.343%206-3s-2.686-3-6-3-6%201.343-6%203%202.686%203%206%203Z%22%2F%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M8%208.5c1.84%200%203.577-.37%204.914-1.037A6.33%206.33%200%200%201%2014%208c0%201.657-2.686%203-6%203s-6-1.343-6-3c0-.542.4-1.057%201.086-1.537C4.423%208.13%206.16%208.5%208%208.5Z%22%2F%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M8%2012.5c1.84%200%203.577-.37%204.914-1.037A6.33%206.33%200%200%201%2014%2012c0%201.657-2.686%203-6%203s-6-1.343-6-3c0-.542.4-1.057%201.086-1.537C4.423%2012.13%206.16%2012.5%208%2012.5Z%22%2F%3E%3C%2Fsvg%3E")}
.fsdb-page .fsdb-record-mark[data-icon="data"]{--fsdb-glyph:var(--fsdb-glyph-data)}
.fsdb-page{--fsdb-glyph-tag:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M4.5%202A2.5%202.5%200%200%200%202%204.5v2.879a2.5%202.5%200%200%200%20.732%201.767l4.5%204.5a2.5%202.5%200%200%200%203.536%200l2.878-2.878a2.5%202.5%200%200%200%200-3.536l-4.5-4.5A2.5%202.5%200%200%200%207.38%202H4.5ZM5%206a1%201%200%201%200%200-2%201%201%200%200%200%200%202Z%22%20fill-rule%3D%22evenodd%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E")}
.fsdb-page .fsdb-record-mark[data-icon="tag"]{--fsdb-glyph:var(--fsdb-glyph-tag);color:var(--biu-color-icon-active)}
:root,.fsdb-page{--fsdb-field-person:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M8%208a3%203%200%201%200%200-6%203%203%200%200%200%200%206ZM12.735%2014c.618%200%201.093-.561.872-1.139a6.002%206.002%200%200%200-11.215%200c-.22.578.254%201.139.872%201.139h9.47Z%22%2F%3E%3C%2Fsvg%3E");--fsdb-field-play:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M3%203.732a1.5%201.5%200%200%201%202.305-1.265l6.706%204.267a1.5%201.5%200%200%201%200%202.531l-6.706%204.268A1.5%201.5%200%200%201%203%2012.267V3.732Z%22%2F%3E%3C%2Fsvg%3E");--fsdb-field-stack:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M5%203.5A1.5%201.5%200%200%201%206.5%202h3A1.5%201.5%200%200%201%2011%203.5H5ZM4.5%205A1.5%201.5%200%200%200%203%206.5v.041a3.02%203.02%200%200%201%20.5-.041h9c.17%200%20.337.014.5.041V6.5A1.5%201.5%200%200%200%2011.5%205h-7ZM12.5%208h-9A1.5%201.5%200%200%200%202%209.5v3A1.5%201.5%200%200%200%203.5%2014h9a1.5%201.5%200%200%200%201.5-1.5v-3A1.5%201.5%200%200%200%2012.5%208Z%22%2F%3E%3C%2Fsvg%3E");--fsdb-field-text:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M2%203.75A.75.75%200%200%201%202.75%203h10.5a.75.75%200%200%201%200%201.5H2.75A.75.75%200%200%201%202%203.75ZM2%208a.75.75%200%200%201%20.75-.75h10.5a.75.75%200%200%201%200%201.5H2.75A.75.75%200%200%201%202%208Zm0%204.25a.75.75%200%200%201%20.75-.75h4.5a.75.75%200%200%201%200%201.5h-4.5a.75.75%200%200%201-.75-.75Z%22%20fill-rule%3D%22evenodd%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E");--fsdb-field-num:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M7.487%202.89a.75.75%200%201%200-1.474-.28l-.455%202.388H3.61a.75.75%200%200%200%200%201.5h1.663l-.571%202.998H2.75a.75.75%200%200%200%200%201.5h1.666l-.403%202.114a.75.75%200%200%200%201.474.28l.456-2.394h2.973l-.403%202.114a.75.75%200%200%200%201.474.28l.456-2.394h1.947a.75.75%200%200%200%200-1.5h-1.661l.57-2.998h1.95a.75.75%200%200%200%200-1.5h-1.664l.402-2.108a.75.75%200%200%200-1.474-.28l-.455%202.388H7.085l.402-2.108ZM6.8%206.498l-.571%202.998h2.973l.57-2.998H6.8Z%22%20fill-rule%3D%22evenodd%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E");--fsdb-field-link:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M7.02%2010.22a.75.75%200%200%200%201.06%200l2.5-2.5a2.5%202.5%200%200%200-3.535-3.535L5.5%205.73a.75.75%200%200%200%201.06%201.061l1.546-1.546a1%201%200%201%201%201.414%201.414l-2.5%202.5a.75.75%200%200%200%200%201.061Zm1.96-4.44a.75.75%200%200%200-1.06%200l-2.5%202.5A2.5%202.5%200%201%200%208.955%2011.814L10.5%2010.27a.75.75%200%201%200-1.06-1.061L7.894%2010.754a1%201%200%201%201-1.414-1.414l2.5-2.5a.75.75%200%200%200%200-1.06Z%22%2F%3E%3C%2Fsvg%3E");--fsdb-field-file:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M2.5%203.5A1.5%201.5%200%200%201%204%202h4.879a1.5%201.5%200%200%201%201.06.44l3.122%203.12a1.5%201.5%200%200%201%20.439%201.061V12.5A1.5%201.5%200%200%201%2012%2014H4a1.5%201.5%200%200%201-1.5-1.5v-9Z%22%2F%3E%3C%2Fsvg%3E");--fsdb-field-date:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M4.75%201a.75.75%200%200%200-.75.75V3a2%202%200%200%200-2%202v7a2%202%200%200%200%202%202h8a2%202%200%200%200%202-2V5a2%202%200%200%200-2-2V1.75a.75.75%200%200%200-1.5%200V3h-5V1.75A.75.75%200%200%200%204.75%201ZM3.5%207a1%201%200%200%201%201-1h7a1%201%200%200%201%201%201v4.5a1%201%200%200%201-1%201h-7a1%201%200%200%201-1-1V7Z%22%20fill-rule%3D%22evenodd%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E")}
.fsdb-field-glyph{width:14px;height:14px;flex:none;display:inline-block;background:currentColor;-webkit-mask:var(--fsdb-field,var(--fsdb-field-text)) center/contain no-repeat;mask:var(--fsdb-field,var(--fsdb-field-text)) center/contain no-repeat}
.fsdb-field-hero{width:14px;height:14px;flex:none;color:var(--biu-color-icon)}
.fsdb-page .biu-tag .fsdb-field-glyph,.fsdb-page .biu-tag .fsdb-field-hero,.fsdb-page .biu-tag-icon svg{color:currentColor}
.fsdb-field-glyph[data-kind="person"]{--fsdb-field:var(--fsdb-field-person)}
.fsdb-field-glyph[data-kind="date"]{--fsdb-field:var(--fsdb-field-date)}
.fsdb-field-glyph[data-kind="num"]{--fsdb-field:var(--fsdb-field-num)}
.fsdb-field-glyph[data-kind="play"]{--fsdb-field:var(--fsdb-field-play)}
.fsdb-field-glyph[data-kind="stack"]{--fsdb-field:var(--fsdb-field-stack)}
:root,.fsdb-page{--fsdb-field-tag:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M4.5%202A2.5%202.5%200%200%200%202%204.5v2.879a2.5%202.5%200%200%200%20.732%201.767l4.5%204.5a2.5%202.5%200%200%200%203.536%200l2.878-2.878a2.5%202.5%200%200%200%200-3.536l-4.5-4.5A2.5%202.5%200%200%200%207.38%202H4.5ZM5%206a1%201%200%201%200%200-2%201%201%200%200%200%200%202Z%22%2F%3E%3C%2Fsvg%3E")}
.fsdb-field-glyph[data-kind="tag"]{--fsdb-field:var(--fsdb-field-tag)}
.fsdb-field-glyph[data-kind="link"]{--fsdb-field:var(--fsdb-field-link)}
.fsdb-field-glyph[data-kind="ref"]{--fsdb-field:var(--fsdb-ui-share)}
.fsdb-field-glyph[data-kind="file"]{--fsdb-field:var(--fsdb-field-file)}
.fsdb-field-glyph[data-kind="text"]{--fsdb-field:var(--fsdb-field-text)}
:root,.fsdb-page{--fsdb-ui-search:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M9.965%2011.026a5%205%200%201%201%201.06-1.06l2.755%202.754a.75.75%200%201%201-1.06%201.06l-2.755-2.754ZM10.5%207a3.5%203.5%200%201%201-7%200%203.5%203.5%200%200%201%207%200Z%22%20fill-rule%3D%22evenodd%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E");--fsdb-ui-sort:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M13.78%2010.47a.75.75%200%200%201%200%201.06l-2.25%202.25a.75.75%200%200%201-1.06%200l-2.25-2.25a.75.75%200%201%201%201.06-1.06l.97.97V5.75a.75.75%200%200%201%201.5%200v5.69l.97-.97a.75.75%200%200%201%201.06%200ZM2.22%205.53a.75.75%200%200%201%200-1.06l2.25-2.25a.75.75%200%200%201%201.06%200l2.25%202.25a.75.75%200%200%201-1.06%201.06l-.97-.97v5.69a.75.75%200%200%201-1.5%200V4.56l-.97.97a.75.75%200%200%201-1.06%200Z%22%20fill-rule%3D%22evenodd%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E");--fsdb-ui-filter:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M14%202a1%201%200%200%200-1-1H3a1%201%200%200%200-1%201v2.172a2%202%200%200%200%20.586%201.414l2.828%202.828A2%202%200%200%201%206%209.828v4.363a.5.5%200%200%200%20.724.447l2.17-1.085A2%202%200%200%200%2010%2011.763V9.829a2%202%200%200%201%20.586-1.414l2.828-2.828A2%202%200%200%200%2014%204.172V2Z%22%2F%3E%3C%2Fsvg%3E");--fsdb-ui-eye:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M8%209.5a1.5%201.5%200%201%200%200-3%201.5%201.5%200%200%200%200%203Z%22%2F%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M1.38%208.28a.87.87%200%200%201%200-.566%207.003%207.003%200%200%201%2013.238.006.87.87%200%200%201%200%20.566A7.003%207.003%200%200%201%201.379%208.28ZM11%208a3%203%200%201%201-6%200%203%203%200%200%201%206%200Z%22%20fill-rule%3D%22evenodd%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E");--fsdb-ui-sliders:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M6.5%202.25a.75.75%200%200%200-1.5%200v3a.75.75%200%200%200%201.5%200V4.5h6.75a.75.75%200%200%200%200-1.5H6.5v-.75ZM11%206.5a.75.75%200%200%200-1.5%200v3a.75.75%200%200%200%201.5%200v-.75h2.25a.75.75%200%200%200%200-1.5H11V6.5ZM5.75%2010a.75.75%200%200%201%20.75.75v.75h6.75a.75.75%200%200%201%200%201.5H6.5v.75a.75.75%200%200%201-1.5%200v-3a.75.75%200%200%201%20.75-.75ZM2.75%207.25H8.5v1.5H2.75a.75.75%200%200%201%200-1.5ZM4%203H2.75a.75.75%200%200%200%200%201.5H4V3ZM2.75%2011.5H4V13H2.75a.75.75%200%200%201%200-1.5Z%22%2F%3E%3C%2Fsvg%3E");--fsdb-ui-refresh:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M13.836%202.477a.75.75%200%200%201%20.75.75v3.182a.75.75%200%200%201-.75.75h-3.182a.75.75%200%200%201%200-1.5h1.37l-.84-.841a4.5%204.5%200%200%200-7.08.932.75.75%200%200%201-1.3-.75%206%206%200%200%201%209.44-1.242l.842.84V3.227a.75.75%200%200%201%20.75-.75Zm-.911%207.5A.75.75%200%200%201%2013.199%2011a6%206%200%200%201-9.44%201.241l-.84-.84v1.371a.75.75%200%200%201-1.5%200V9.591a.75.75%200%200%201%20.75-.75H5.35a.75.75%200%200%201%200%201.5H3.98l.841.841a4.5%204.5%200%200%200%207.08-.932.75.75%200%200%201%201.025-.273Z%22%20fill-rule%3D%22evenodd%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E");--fsdb-ui-users:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M8.5%204.5a2.5%202.5%200%201%201-5%200%202.5%202.5%200%200%201%205%200ZM10.9%2012.006c.11.542-.348.994-.9.994H2c-.553%200-1.01-.452-.902-.994a5.002%205.002%200%200%201%209.803%200ZM14.002%2012h-1.59a2.556%202.556%200%200%200-.04-.29%206.476%206.476%200%200%200-1.167-2.603%203.002%203.002%200%200%201%203.633%201.911c.18.522-.283.982-.836.982ZM12%208a2%202%200%201%200%200-4%202%202%200%200%200%200%204Z%22%2F%3E%3C%2Fsvg%3E");--fsdb-ui-user-group:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M8%208a2.5%202.5%200%201%200%200-5%202.5%202.5%200%200%200%200%205ZM3.156%2011.763c.16-.629.44-1.21.813-1.72a2.5%202.5%200%200%200-2.725%201.377c-.136.287.102.58.418.58h1.449c.01-.077.025-.156.045-.237ZM12.847%2011.763c.02.08.036.16.046.237h1.446c.316%200%20.554-.293.417-.579a2.5%202.5%200%200%200-2.722-1.378c.374.51.653%201.09.813%201.72ZM14%207.5a1.5%201.5%200%201%201-3%200%201.5%201.5%200%200%201%203%200ZM3.5%209a1.5%201.5%200%201%200%200-3%201.5%201.5%200%200%200%200%203ZM5%2013c-.552%200-1.013-.455-.876-.99a4.002%204.002%200%200%201%207.753%200c.136.535-.324.99-.877.99H5Z%22%2F%3E%3C%2Fsvg%3E");--fsdb-ui-globe:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M3.757%204.5c.18.217.376.42.586.608.153-.61.354-1.175.596-1.678A5.53%205.53%200%200%200%203.757%204.5ZM8%201a6.994%206.994%200%200%200-7%207%207%207%200%201%200%207-7Zm0%201.5c-.476%200-1.091.386-1.633%201.427-.293.564-.531%201.267-.683%202.063A5.48%205.48%200%200%200%208%206.5a5.48%205.48%200%200%200%202.316-.51c-.152-.796-.39-1.499-.683-2.063C9.09%202.886%208.476%202.5%208%202.5Zm3.657%202.608a8.823%208.823%200%200%200-.596-1.678c.444.298.842.659%201.182%201.07-.18.217-.376.42-.586.608Zm-1.166%202.436A6.983%206.983%200%200%201%208%208a6.983%206.983%200%200%201-2.49-.456%2010.703%2010.703%200%200%200%20.202%202.6c.72.231%201.49.356%202.288.356.798%200%201.568-.125%202.29-.356a10.705%2010.705%200%200%200%20.2-2.6Zm1.433%201.85a12.652%2012.652%200%200%200%20.018-2.609c.405-.276.78-.594%201.117-.947a5.48%205.48%200%200%201%20.44%202.262%207.536%207.536%200%200%201-1.575%201.293Zm-2.172%202.435a9.046%209.046%200%200%201-3.504%200c.039.084.078.166.12.244C6.907%2013.114%207.523%2013.5%208%2013.5s1.091-.386%201.633-1.427c.04-.078.08-.16.12-.244Zm1.31.74a8.5%208.5%200%200%200%20.492-1.298c.457-.197.893-.43%201.307-.696a5.526%205.526%200%200%201-1.8%201.995Zm-6.123%200a8.507%208.507%200%200%201-.493-1.298%208.985%208.985%200%200%201-1.307-.696%205.526%205.526%200%200%200%201.8%201.995ZM2.5%208.1c.463.5.993.935%201.575%201.293a12.652%2012.652%200%200%201-.018-2.608%207.037%207.037%200%200%201-1.117-.947%205.48%205.48%200%200%200-.44%202.262Z%22%20fill-rule%3D%22evenodd%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E");--fsdb-ui-chevron-down:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M4.22%206.22a.75.75%200%200%201%201.06%200L8%208.94l2.72-2.72a.75.75%200%201%201%201.06%201.06l-3.25%203.25a.75.75%200%200%201-1.06%200L4.22%207.28a.75.75%200%200%201%200-1.06Z%22%20fill-rule%3D%22evenodd%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E");--fsdb-ui-chevron-left:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M9.78%204.22a.75.75%200%200%201%200%201.06L7.06%208l2.72%202.72a.75.75%200%201%201-1.06%201.06L5.47%208.53a.75.75%200%200%201%200-1.06l3.25-3.25a.75.75%200%200%201%201.06%200Z%22%20fill-rule%3D%22evenodd%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E");--fsdb-ui-chevron-right:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M6.22%204.22a.75.75%200%200%201%201.06%200l3.25%203.25a.75.75%200%200%201%200%201.06l-3.25%203.25a.75.75%200%200%201-1.06-1.06L8.94%208%206.22%205.28a.75.75%200%200%201%200-1.06Z%22%20fill-rule%3D%22evenodd%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E");--fsdb-ui-share:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M12%206a2%202%200%201%200-1.994-1.842L5.323%206.5a2%202%200%201%200%200%203l4.683%202.342a2%202%200%201%200%20.67-1.342L5.995%208.158a2.03%202.03%200%200%200%200-.316L10.677%205.5c.353.311.816.5%201.323.5Z%22%2F%3E%3C%2Fsvg%3E");--fsdb-ui-squares:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M3.5%202A1.5%201.5%200%200%200%202%203.5v2A1.5%201.5%200%200%200%203.5%207h2A1.5%201.5%200%200%200%207%205.5v-2A1.5%201.5%200%200%200%205.5%202h-2ZM3.5%209A1.5%201.5%200%200%200%202%2010.5v2A1.5%201.5%200%200%200%203.5%2014h2A1.5%201.5%200%200%200%207%2012.5v-2A1.5%201.5%200%200%200%205.5%209h-2ZM9%203.5A1.5%201.5%200%200%201%2010.5%202h2A1.5%201.5%200%200%201%2014%203.5v2A1.5%201.5%200%200%201%2012.5%207h-2A1.5%201.5%200%200%201%209%205.5v-2ZM10.5%209A1.5%201.5%200%200%200%209%2010.5v2a1.5%201.5%200%200%200%201.5%201.5h2a1.5%201.5%200%200%200%201.5-1.5v-2A1.5%201.5%200%200%200%2012.5%209h-2Z%22%2F%3E%3C%2Fsvg%3E");--fsdb-ui-star:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M8%201.75a.75.75%200%200%201%20.692.462l1.41%203.393%203.664.293a.75.75%200%200%201%20.428%201.317l-2.791%202.39.853%203.575a.75.75%200%200%201-1.12.814L7.998%2012.08l-3.135%201.915a.75.75%200%200%201-1.12-.814l.852-3.574-2.79-2.39a.75.75%200%200%201%20.427-1.318l3.663-.293%201.41-3.393A.75.75%200%200%201%208%201.75Z%22%20fill-rule%3D%22evenodd%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E");--fsdb-ui-chevron-double-left:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M3.22%207.595a.75.75%200%200%200%200%201.06l3.25%203.25a.75.75%200%200%200%201.06-1.06l-2.72-2.72%202.72-2.72a.75.75%200%200%200-1.06-1.06l-3.25%203.25Zm8.25-3.25-3.25%203.25a.75.75%200%200%200%200%201.06l3.25%203.25a.75.75%200%201%200%201.06-1.06l-2.72-2.72%202.72-2.72a.75.75%200%200%200-1.06-1.06Z%22%20fill-rule%3D%22evenodd%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E");--fsdb-ui-chevron-double-right:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22black%22%20d%3D%22M12.78%207.595a.75.75%200%200%201%200%201.06l-3.25%203.25a.75.75%200%200%201-1.06-1.06l2.72-2.72-2.72-2.72a.75.75%200%200%201%201.06-1.06l3.25%203.25Zm-8.25-3.25%203.25%203.25a.75.75%200%200%201%200%201.06l-3.25%203.25a.75.75%200%200%201-1.06-1.06l2.72-2.72-2.72-2.72a.75.75%200%200%201%201.06-1.06Z%22%20fill-rule%3D%22evenodd%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E")}
.fsdb-page .fsdb-ui-glyph{width:14px;height:14px;flex:none;display:inline-block;background:currentColor;-webkit-mask:var(--fsdb-ui,var(--fsdb-glyph-table)) center/contain no-repeat;mask:var(--fsdb-ui,var(--fsdb-glyph-table)) center/contain no-repeat}
.fsdb-page .fsdb-ui-glyph[data-icon="table"]{--fsdb-ui:var(--fsdb-glyph-table)}
.fsdb-page .fsdb-ui-glyph[data-icon="stack"]{--fsdb-ui:var(--fsdb-field-stack)}
.fsdb-page .fsdb-ui-glyph[data-icon="user"]{--fsdb-ui:var(--fsdb-field-person)}
.fsdb-page .fsdb-ui-glyph[data-icon="search"]{--fsdb-ui:var(--fsdb-ui-search)}
.fsdb-page .fsdb-ui-glyph[data-icon="sort"]{--fsdb-ui:var(--fsdb-ui-sort)}
.fsdb-page .fsdb-ui-glyph[data-icon="filter"]{--fsdb-ui:var(--fsdb-ui-filter)}
.fsdb-page .fsdb-ui-glyph[data-icon="eye"]{--fsdb-ui:var(--fsdb-ui-eye)}
.fsdb-page .fsdb-ui-glyph[data-icon="sliders"]{--fsdb-ui:var(--fsdb-ui-sliders)}
.fsdb-page .fsdb-ui-glyph[data-icon="refresh"]{--fsdb-ui:var(--fsdb-ui-refresh)}
.fsdb-page .fsdb-ui-glyph[data-icon="users"]{--fsdb-ui:var(--fsdb-ui-users)}
.fsdb-page .fsdb-ui-glyph[data-icon="user-group"]{--fsdb-ui:var(--fsdb-ui-user-group)}
.fsdb-page .fsdb-ui-glyph[data-icon="globe"]{--fsdb-ui:var(--fsdb-ui-globe)}
.fsdb-page .fsdb-ui-glyph[data-icon="chevron-down"]{--fsdb-ui:var(--fsdb-ui-chevron-down)}
.fsdb-page .fsdb-ui-glyph[data-icon="chevron-left"]{--fsdb-ui:var(--fsdb-ui-chevron-left)}
.fsdb-page .fsdb-ui-glyph[data-icon="chevron-right"]{--fsdb-ui:var(--fsdb-ui-chevron-right)}
.fsdb-page .fsdb-ui-glyph[data-icon="share"]{--fsdb-ui:var(--fsdb-ui-share)}
.fsdb-page .fsdb-ui-glyph[data-icon="squares"]{--fsdb-ui:var(--fsdb-ui-squares)}
.fsdb-page .fsdb-ui-glyph[data-icon="star"]{--fsdb-ui:var(--fsdb-ui-star)}
.fsdb-page .fsdb-ui-glyph[data-icon="chevron-double-left"]{--fsdb-ui:var(--fsdb-ui-chevron-double-left)}
.fsdb-page .fsdb-ui-glyph[data-icon="chevron-double-right"]{--fsdb-ui:var(--fsdb-ui-chevron-double-right)}
.fsdb-page .chat-view-header .fsdb-ui-glyph{width:16px;height:16px}
.fsdb-record-mark.is-sm{width:16px;height:16px}
.fsdb-record-mark.is-lg{width:32px;height:32px}
.fsdb-crumbs .fsdb-record-mark.is-sm,.fsdb-crumb-option .fsdb-record-mark.is-sm{width:16px;height:16px}
.fsdb-crumbs .fsdb-record-mark.is-sm>svg,.fsdb-crumb-option .fsdb-record-mark.is-sm>svg{width:16px;height:16px;display:block}
.fsdb-record-mark .sidebar-mascot{display:block}
.fsdb-detail-title{min-width:0;height:auto;min-height:38px;max-height:none;overflow:visible;overflow-wrap:anywhere;word-break:break-word;margin:0;color:var(--biu-color-text);font-size:32px;font-weight:var(--biu-font-weight-bold);line-height:38px}
.fsdb-detail-title-input{display:block;box-sizing:border-box;width:100%;height:auto;min-height:38px;max-height:none;margin:0;border:0;background:transparent;color:inherit;font:inherit;font-size:inherit;font-weight:inherit;line-height:inherit;vertical-align:top;outline:none;padding:0;resize:none;overflow:hidden;overflow-wrap:anywhere;word-break:break-word;white-space:pre-wrap;field-sizing:content}
.fsdb-detail-title-row .fsdb-detail-title-input{flex:none}
.fsdb-page .tasks-icon-btn.is-danger:hover{background:color-mix(in srgb,var(--biu-color-danger) 16%,transparent);color:var(--biu-color-danger)}
.fsdb-detail-id{font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);font-family:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-detail-doc{width:100%;min-height:180px;border:0;background:transparent;color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-4);line-height:1.65;outline:none;resize:none;padding:8px 0 0;margin:0}
.fsdb-main > .tasks-toolbar,.fsdb-detail-main > .tasks-toolbar{position:sticky;top:0;z-index:50;margin-top:0;padding-bottom:0;overflow:visible;background:var(--biu-color-bg);max-width:var(--biu-chat-max-width);width:100%;transition:max-width .18s ease,padding .18s ease}
.fsdb-page:not(.is-sheet) .fsdb-main > .tasks-toolbar.is-stuck,.fsdb-page .fsdb-detail-main > .tasks-toolbar.is-stuck{max-width:100%;margin-inline:0;padding-left:12px;padding-right:12px}
.fsdb-main > .tasks-toolbar::before,.fsdb-detail-main > .tasks-toolbar::before{content:"";position:absolute;left:0;right:0;top:100%;height:10px;background:var(--biu-color-bg);pointer-events:none}
.fsdb-detail-main > .tasks-toolbar::before{background:linear-gradient(var(--biu-color-border),var(--biu-color-border)) var(--biu-pad-page) bottom/calc(100% - 2 * var(--biu-pad-page)) 1px no-repeat,var(--biu-color-bg)}
.fsdb-main > .tasks-toolbar.is-stuck::before,.fsdb-detail-main > .tasks-toolbar.is-stuck::before{background:linear-gradient(var(--biu-color-border),var(--biu-color-border)) 12px bottom/calc(100% - 24px) var(--biu-stroke-width) no-repeat,var(--biu-color-bg)}
@keyframes fsdb-page-read{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.fsdb-main > .tasks-toolbar::after,.fsdb-detail-main > .tasks-toolbar::after{content:"";position:absolute;left:var(--biu-pad-page);right:var(--biu-pad-page);top:0;height:2px;background:var(--biu-color-emphasis);transform-origin:left center;transform:scaleX(var(--page-read,0));will-change:transform;pointer-events:none;transition:left .18s ease,right .18s ease}
@supports (animation-timeline:scroll()){.fsdb-right-body{scroll-timeline-name:--fsdb-page-read;scroll-timeline-axis:block}.fsdb-main > .tasks-toolbar::after,.fsdb-detail-main > .tasks-toolbar::after{transform:scaleX(0);animation:fsdb-page-read linear both;animation-timeline:--fsdb-page-read}}
.fsdb-main > .tasks-toolbar.is-stuck::after,.fsdb-detail-main > .tasks-toolbar.is-stuck::after{left:12px;right:12px}
@media (prefers-reduced-motion:reduce){.fsdb-main > .tasks-toolbar,.fsdb-detail-main > .tasks-toolbar,.fsdb-main > .tasks-toolbar::after,.fsdb-detail-main > .tasks-toolbar::after{transition:none}}
.fsdb-detail-main > .fsdb-detail-aside{padding-top:0}
.fsdb-detail-aside .tasks-table{border-top:0;border-right:0}
.fsdb-detail-extras{display:flex;flex-direction:column;gap:20px;margin-top:8px;padding-top:16px;border-top:var(--biu-stroke-width) solid var(--biu-color-border)}
.fsdb-prop-tr:not(.is-open):has(.fsdb-prop-val.is-pane) td{vertical-align:middle;height:32px}
.fsdb-prop-tr:not(.is-open) .fsdb-prop-val.is-pane{display:flex;align-items:center;min-width:0;height:22px;overflow:hidden;white-space:nowrap}
.fsdb-prop-tr:not(.is-open) .fsdb-prop-val.is-pane .tasks-detail-pane{flex:none;width:100%;min-height:0;height:22px;padding:0;overflow:hidden}
.fsdb-prop-tr:not(.is-open) .fsdb-prop-val.is-pane .tasks-automation{display:flex;align-items:center;min-height:0}
.fsdb-prop-tr:not(.is-open) .fsdb-prop-val.is-pane .tasks-auto-head{width:100%;margin:0}
.fsdb-prop-tr:not(.is-open) .fsdb-prop-val.is-pane .tasks-auto-summary,.fsdb-prop-tr:not(.is-open) .fsdb-prop-val.is-pane .tasks-auto-sec,.fsdb-prop-tr:not(.is-open) .fsdb-prop-val.is-pane .tasks-auto-sec-head,.fsdb-prop-tr:not(.is-open) .fsdb-prop-val.is-pane .tasks-trigger-status,.fsdb-prop-tr:not(.is-open) .fsdb-prop-val.is-pane .tasks-exec-timeline-head,.fsdb-prop-tr:not(.is-open) .fsdb-prop-val.is-pane .tasks-report-timeline{display:none}
.fsdb-prop-tr:not(.is-open) .fsdb-prop-val.is-pane .tasks-detail-meta{display:block;margin:0}
.fsdb-prop-tr:not(.is-open) .fsdb-prop-val.is-pane .tasks-auto-then-text{margin:0;line-height:22px}
.fsdb-prop-tr.is-open:has(.fsdb-prop-val.is-pane) td{vertical-align:top;height:auto}
.fsdb-prop-tr.is-open .fsdb-prop-val.is-pane{display:block;min-width:0;height:auto;overflow:visible;white-space:normal}
@keyframes fsdb-fold-reveal{from{opacity:0;transform:translate3d(0,-4px,0)}to{opacity:1;transform:translate3d(0,0,0)}}
.fsdb-prop-tr.is-open .fsdb-prop-val.is-pane .tasks-detail-pane{flex:none;width:100%;height:auto;min-height:0;padding:4px 0 8px;overflow:visible;animation:fsdb-fold-reveal 180ms cubic-bezier(.22,1,.36,1)}
@media (prefers-reduced-motion:reduce){.fsdb-proprow.is-tag-fold .fsdb-schema-pack,.fsdb-prop-tr.is-tag-fold .fsdb-schema-pack,.fsdb-proprow.is-tag-fold .fsdb-schema-pack>.fsdb-schema-pack-inner,.fsdb-prop-tr.is-tag-fold .fsdb-schema-pack>.fsdb-schema-pack-inner,.fsdb-proprow-glyph,.fsdb-proprow-chevron,.fsdb-page .tasks-group-fold .sidebar-group-fold-face,.fsdb-page .tasks-group-fold .sidebar-group-fold-chevron{transition:none}.fsdb-prop-tr.is-open .fsdb-prop-val.is-pane .tasks-detail-pane{animation:none}}
.fsdb-detail-extra-title{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-bold);color:var(--biu-color-text)}
.fsdb-detail-extra-count{font-size:11px;font-weight:var(--biu-font-weight-bold);color:var(--biu-color-text-subtle)}
.fsdb-plain-input{width:100%;border:0;border-radius:6px;padding:4px 6px;background:transparent;color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);outline:none}
.fsdb-plain-input::placeholder{color:var(--biu-color-text-placeholder)}
.fsdb-plain-input:hover,.fsdb-plain-input:focus{background:var(--biu-color-bg-hover)}
.fsdb-cellselect{display:inline-flex;position:relative;min-width:0;max-width:100%;box-sizing:border-box;vertical-align:middle}
.fsdb-cellselect-trigger{display:inline-flex;align-items:center;max-width:none;height:22px;border:0;border-radius:4px;padding:0 6px;background:transparent;color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);line-height:22px;cursor:pointer;text-align:left}
.fsdb-cellselect-trigger:hover,.fsdb-cellselect-trigger[data-open]{background:transparent}
.fsdb-cellselect-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-cellselect-trigger.is-empty{max-width:none;color:var(--biu-color-text-subtle);background:transparent;font-weight:var(--biu-font-weight-medium)}
.fsdb-cellselect.is-field{display:block;width:100%}
.fsdb-cellselect.is-field .fsdb-cellselect-trigger{display:flex;justify-content:space-between;gap:6px;width:100%;max-width:none;min-height:28px;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:7px;padding:5px 8px;background:var(--biu-color-bg-input);color:var(--biu-color-text)}
.fsdb-page .fsdb-query-menu .fsdb-cellselect.is-field .fsdb-cellselect-trigger{max-width:100%;overflow:hidden}
.fsdb-page .fsdb-query-menu .fsdb-cellselect-trigger .biu-tag{max-width:100%;min-width:0}
.fsdb-cellselect.is-field .fsdb-cellselect-trigger:hover,.fsdb-cellselect.is-field .fsdb-cellselect-trigger[data-open]{background:var(--biu-color-bg-hover);filter:none}
.fsdb-cellselect.is-field .fsdb-cellselect-trigger.is-empty{color:var(--biu-color-text-subtle)}
.fsdb-cellselect-menu{box-sizing:border-box;padding:var(--biu-pad-flyout);background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);box-shadow:var(--biu-shadow-popover);display:flex;flex-direction:column;gap:var(--biu-gap-flyout)}
.fsdb-tokens{position:relative;display:flex;min-width:0;width:100%;max-width:100%;vertical-align:middle}
.fsdb-tokens.is-empty{display:flex;width:100%;min-width:0;align-self:stretch}
.fsdb-page .tasks-table td:has(.db-cell-multi.is-empty),.fsdb-page .tasks-table td:has(.fsdb-tokens.is-empty){position:relative}
.fsdb-page .tasks-table td:has(.db-cell-multi.is-empty) .fsdb-cell,.fsdb-page .tasks-table td:has(.fsdb-tokens.is-empty) .fsdb-cell{display:flex;width:100%;min-height:100%;align-self:stretch}
.fsdb-page .tasks-table td:has(.db-cell-multi.is-empty) .db-cell-multi.is-empty,.fsdb-page .tasks-table td:has(.fsdb-tokens.is-empty) .fsdb-tokens.is-empty{position:absolute;inset:0;width:auto;height:auto;max-width:none}
.fsdb-page .tasks-table td:has(.db-cell-multi.is-empty) .db-cell-multi-box,.fsdb-page .tasks-table td:has(.fsdb-tokens.is-empty) .fsdb-tokens-box{width:100%;height:100%;min-height:100%;box-sizing:border-box}
.fsdb-tokens-box{display:flex;flex-wrap:wrap;align-items:center;gap:4px;width:100%;min-height:20px;border-radius:6px;padding:0;cursor:pointer}
.fsdb-tokens-box.is-empty{display:flex;width:100%;min-height:22px}
.fsdb-tokens-box:hover{background:var(--biu-color-bg-hover)}
.fsdb-token{display:inline-flex;align-items:center;gap:2px;height:22px;border-radius:4px;padding:0 6px;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-regular);line-height:22px;color:var(--biu-color-text);background:rgba(255,255,255,.08);white-space:nowrap}
.fsdb-checkrow{display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;justify-content:flex-start;gap:8px;width:100%;border:0;border-radius:7px;padding:6px 8px;background:transparent;color:var(--biu-color-text-muted);font-family:inherit;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);cursor:pointer;text-align:left}
.fsdb-checkrow:hover,.fsdb-checkrow.is-on{background:var(--biu-color-bg-hover)}
.fsdb-checkrow.is-on{color:var(--biu-color-text);font-weight:var(--biu-font-weight-medium)}
.fsdb-checkrow.is-locked{cursor:default;opacity:.72}
.fsdb-checkrow.is-locked:hover{background:transparent}
.fsdb-checkrow-label{display:inline-flex;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:6px;min-width:0;font-weight:var(--biu-font-weight-medium)}
.fsdb-checkrow-icon{display:inline-flex;flex:none;align-items:center;color:var(--biu-color-icon)}
.fsdb-checkrow.is-on .fsdb-checkrow-icon,.fsdb-checkrow:hover .fsdb-checkrow-icon{color:var(--biu-color-icon-active)}
.fsdb-checkrow>svg{color:var(--biu-color-icon)}
.fsdb-checkrow.is-on>svg,.fsdb-checkrow:hover>svg{color:var(--biu-color-icon-active)}
.fsdb-dlg-backdrop{position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35)}
.fsdb-dlg{width:min(360px,calc(100vw - 32px));background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);box-shadow:var(--biu-shadow-popover);padding:16px;display:flex;flex-direction:column;gap:12px}
.fsdb-dlg-title{font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-bold);color:var(--biu-color-text)}
.fsdb-dlg-body{display:flex;flex-direction:column;gap:8px}
.fsdb-dlg-body p{margin:0;font-size:var(--biu-font-size-4);line-height:1.6;color:var(--biu-color-text-muted)}
.fsdb-dlg-input{width:100%;box-sizing:border-box;border:0;border-radius:8px;padding:8px 10px;background:transparent;color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-4);outline:none}
.fsdb-dlg-error{font-size:var(--biu-font-size-4);color:var(--biu-color-danger)}
.fsdb-dlg-actions{display:flex;justify-content:flex-end;gap:8px}
.fsdb-dlg-cancel,.fsdb-dlg-ok{border-radius:8px;padding:6px 14px;background:transparent;color:var(--biu-color-text-muted);font:inherit;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-semibold);cursor:pointer}
.fsdb-dlg-cancel{border:none}
.fsdb-dlg-cancel:hover{background:var(--biu-color-bg-hover)}
.fsdb-dlg-ok{border:var(--biu-stroke-width) solid var(--biu-color-text);background:var(--biu-color-text);color:var(--biu-color-bg)}
.fsdb-dlg-ok.is-danger{border-color:var(--biu-color-danger);background:var(--biu-color-danger);color:var(--biu-color-bg)}
.fsdb-dlg-ok:disabled,.fsdb-dlg-cancel:disabled{opacity:.6;cursor:default}
.fsdb-empty,.fsdb-muted,.fsdb-meta,.fsdb-inspector-empty{color:var(--biu-color-text-muted)}
.fsdb-action-btn{--biu-tag:var(--biu-color-ink-gray);display:inline-flex;flex:none;align-items:center;justify-content:center;gap:3px;height:var(--biu-space-5);margin:0;border:0;border-radius:var(--biu-radius-full);padding:0 9px 0 7px;background:color-mix(in srgb,var(--biu-tag) 22%,transparent);color:var(--biu-tag);font:inherit;font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-medium);line-height:1;white-space:nowrap;cursor:pointer;transition:background 120ms ease}
.fsdb-action-btn:not(:has(svg)){padding:0 9px}
.fsdb-action-btn svg{width:12px;height:12px;flex:none;display:block;color:var(--biu-tag)}
.fsdb-action-btn:hover:not(:disabled){background:color-mix(in srgb,var(--biu-tag) 34%,transparent);color:var(--biu-tag)}
.fsdb-action-btn.is-danger{--biu-tag:var(--biu-color-ink-red)}
.fsdb-action-btn:disabled{opacity:.4;cursor:default}
.fsdb-page .tasks-table td.is-cell-on{box-shadow:inset 0 0 0 2px var(--biu-color-emphasis)}
.fsdb-page .tasks-table td.is-cell-on:not(.is-pin-col){position:relative;z-index:6}
.fsdb-page .tasks-table td.is-cell-on.is-cell-ro{box-shadow:inset 0 0 0 2px var(--biu-color-text-subtle)}
.fsdb-page .tasks-table td.is-cell-range{background:color-mix(in srgb,var(--biu-color-emphasis) 16%,var(--biu-color-surface))}
.fsdb-page .tasks-table.is-cell-drag{user-select:none}
.fsdb-page .tasks-table td:has(.db-cell-select),.fsdb-page .tasks-table td:has(.db-cell-multi),.fsdb-page .tasks-table td:has(.fsdb-cellselect),.fsdb-page .tasks-table td:has(.fsdb-tokens),.fsdb-page .tasks-table td:has(.fsdb-ref-chips),.fsdb-page .tasks-table td:has(.biu-tags),.fsdb-page .tasks-table td:has(.fsdb-person-list),.fsdb-page .tasks-table td:has(.fsdb-files){min-width:0;white-space:normal}
.fsdb-page .tasks-table td:has(.db-cell-select) .fsdb-cell,.fsdb-page .tasks-table td:has(.db-cell-multi) .fsdb-cell,.fsdb-page .tasks-table td:has(.fsdb-cellselect) .fsdb-cell,.fsdb-page .tasks-table td:has(.fsdb-tokens) .fsdb-cell,.fsdb-page .tasks-table td:has(.fsdb-ref-chips) .fsdb-cell,.fsdb-page .tasks-table td:has(.fsdb-person-list) .fsdb-cell,.fsdb-page .tasks-table td:has(.biu-tags) .fsdb-cell,.fsdb-page .tasks-table td:has(.fsdb-files) .fsdb-cell{display:flex;flex-direction:row;flex-wrap:wrap;width:100%;max-width:100%;min-height:100%;align-self:stretch;align-items:center}
.fsdb-page .tasks-table td .db-cell-select,.fsdb-page .tasks-table td .db-cell-multi,.fsdb-page .tasks-table td .fsdb-cellselect,.fsdb-page .tasks-table td .fsdb-tokens{display:flex;width:100%;max-width:none;min-width:0}
.fsdb-page .tasks-table td .db-cell-select-trigger,.fsdb-page .tasks-table td .fsdb-cellselect-trigger{width:100%;max-width:none;justify-content:space-between;background:transparent}
.fsdb-page .tasks-table td .db-cell-multi-box,.fsdb-page .tasks-table td .fsdb-tokens-box{width:100%;max-width:none;background:transparent}
.fsdb-page .tasks-table td .db-cell-multi-box:hover,.fsdb-page .tasks-table td .db-cell-multi-box[aria-expanded="true"]{background:transparent}
.fsdb-page .tasks-table:not(.is-wrap) .biu-tags,.fsdb-page .tasks-table:not(.is-wrap) .fsdb-tokens-box,.fsdb-page .tasks-table:not(.is-wrap) .db-cell-multi-box,.fsdb-page .tasks-table:not(.is-wrap) .fsdb-person-list,.fsdb-page .tasks-table:not(.is-wrap) .fsdb-files,.fsdb-page .tasks-table:not(.is-wrap) .fsdb-pop-host:has(.biu-tags),.fsdb-page .tasks-table:not(.is-wrap) .fsdb-pop-host:has(.fsdb-person-list){display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;align-content:center;width:100%;max-width:100%;min-width:0}
.fsdb-page .tasks-table.is-wrap .biu-tags,.fsdb-page .tasks-table.is-wrap .fsdb-tokens-box,.fsdb-page .tasks-table.is-wrap .db-cell-multi-box,.fsdb-page .tasks-table.is-wrap .fsdb-person-list,.fsdb-page .tasks-table.is-wrap .fsdb-files,.fsdb-page .tasks-table.is-wrap .fsdb-pop-host:has(.biu-tags),.fsdb-page .tasks-table.is-wrap .fsdb-pop-host:has(.fsdb-person-list){display:inline-flex;flex-direction:row;flex-wrap:wrap;align-items:center;align-content:center;width:auto;max-width:100%;overflow-wrap:normal;word-break:normal;white-space:normal}
.fsdb-page .fsdb-detail-aside .tasks-table.is-wrap .fsdb-pop-host,.fsdb-page .fsdb-detail-aside .tasks-table.is-wrap .fsdb-pop-host:has(.biu-tags),.fsdb-page .fsdb-detail-aside .tasks-table.is-wrap .fsdb-schema>.fsdb-pop-host{display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;align-content:center;width:100%;max-width:100%;min-width:0}
.fsdb-thumbs{display:inline-flex;align-items:center;gap:2px;min-width:0;max-width:100%}
.fsdb-fileview-imgs{display:flex;flex-wrap:wrap;gap:8px}
.fsdb-cell-pop{box-sizing:border-box;padding:8px;background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);box-shadow:var(--biu-shadow-popover);display:flex;flex-direction:column;gap:8px;max-height:min(70vh,480px);overflow:auto;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium)}
.fsdb-cell-pop.is-json{min-width:420px;max-height:min(70vh,420px);overflow:hidden}
.fsdb-cell-pop.is-json .page-source{display:flex;flex-direction:column;min-height:160px;height:min(60vh,360px);max-height:min(60vh,360px);overflow:hidden}
.fsdb-cell-pop.is-json .page-source .cm-editor{flex:1;min-height:0;height:100%;overflow:hidden}
.fsdb-cell-pop.is-json .page-source .cm-scroller{overflow:auto}
.fsdb-cell-pop.is-select,.fsdb-cell-pop.is-multi-select,.fsdb-cell-pop.is-tag,.fsdb-cell-pop.is-attachment,.fsdb-cell-pop.is-document,.fsdb-cell-pop.is-image,.fsdb-cell-pop.is-person,.fsdb-cell-pop.is-record-link,.fsdb-cell-pop.is-ref,.fsdb-cell-pop.is-multi-ref{min-width:280px;padding:8px}
.fsdb-cell-pop.is-string,.fsdb-cell-pop.is-title,.fsdb-cell-pop.is-number{padding:6px 8px}
.fsdb-cell-pop-tags{display:flex;flex-direction:column;gap:8px;min-width:0}
.fsdb-viewcat-pick{display:flex;flex-direction:column;gap:6px;min-width:0;width:100%}
.fsdb-viewcat-pick .db-search-field,.fsdb-viewcat-pick .db-search-field input,.fsdb-viewcat-pick input{border:0;outline:none;box-shadow:none;background:transparent;appearance:none}
.fsdb-viewcat-pick-list{display:flex;flex-direction:column;gap:var(--biu-gap-flyout);min-width:0}
.fsdb-viewcat-pick-row{display:flex !important;flex-direction:row !important;flex-wrap:nowrap !important;align-items:center;gap:2px;width:100%;min-width:0;border-radius:7px}
.fsdb-viewcat-pick-row.is-active,.fsdb-viewcat-pick-row.is-cursor,.fsdb-viewcat-pick-row:hover{background:var(--biu-color-bg-hover)}
.fsdb-viewcat-pick-main{display:flex !important;flex-direction:row !important;flex-wrap:nowrap !important;align-items:center;justify-content:flex-start;gap:8px;flex:1;min-width:0;width:auto;margin:0;border:0;border-radius:7px;padding:4px 6px;background:transparent;color:var(--biu-color-text-muted);font:inherit;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);cursor:pointer;text-align:left}
.fsdb-viewcat-pick-row.is-active .fsdb-viewcat-pick-main{color:var(--biu-color-text)}
.fsdb-viewcat-pick-ico{display:block !important;flex:none;width:14px;height:14px;color:var(--biu-color-icon)}
.fsdb-viewcat-pick-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-viewcat-pick-actions{display:inline-flex !important;flex-direction:row !important;align-items:center;flex:none;margin-left:auto}
.fsdb-viewcat-pick .tasks-viewdd-act{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;flex:none;padding:0;border:0;border-radius:6px;background:transparent;color:var(--biu-color-icon);cursor:pointer}
.fsdb-viewcat-pick .tasks-viewdd-act:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-icon-active)}
.fsdb-viewcat-pick .tasks-viewdd-act.is-danger:hover{background:color-mix(in srgb,var(--biu-color-danger) 16%,transparent);color:var(--biu-color-danger)}
.fsdb-cell-pop-text{box-sizing:border-box;width:100%;min-height:72px;margin:0;border:0;border-radius:6px;padding:4px 2px;background:transparent;color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);line-height:1.45;resize:none;outline:none}
.fsdb-cell-pop-url{box-sizing:border-box;width:100%;margin:0;border:0;border-radius:6px;padding:4px 2px;background:transparent;color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);line-height:1.45;outline:none}
.fsdb-media-field{display:flex;flex-direction:column;flex-wrap:nowrap;align-items:stretch;gap:8px;min-width:0;width:100%;max-width:100%;min-height:22px;height:auto}
.fsdb-media-field.is-files{flex-direction:row;flex-wrap:wrap;align-items:center;align-content:center;gap:var(--biu-space-1)}
.fsdb-media-field.is-files:not(.is-compact){flex-direction:column;flex-wrap:nowrap;align-items:stretch;align-content:stretch;gap:8px}
.fsdb-media-preview{display:block;width:56px;height:56px;flex:none;object-fit:cover;border-radius:8px;background:var(--biu-color-bg-hover)}
.fsdb-media-thumb .biu-image img{display:block;width:56px;height:56px;object-fit:cover;border-radius:8px}
.fsdb-media-thumbs{display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px;min-width:0}
.fsdb-media-thumb{position:relative;flex:none;line-height:0}
.fsdb-media-remove{position:absolute;top:-4px;right:-4px;display:grid;place-items:center;width:16px;height:16px;margin:0;border:0;border-radius:8px;padding:0;background:var(--biu-color-bg-subtle);color:var(--biu-color-text);cursor:pointer;box-shadow:0 0 0 1px var(--biu-color-border)}
.fsdb-media-drop{display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:100%;min-height:72px;margin:0;border:1px dashed var(--biu-color-border);border-radius:8px;padding:12px;background:transparent;color:var(--biu-color-text-muted);cursor:pointer}
.fsdb-media-drop.is-files{min-height:88px}
.fsdb-media-field.is-compact .fsdb-media-drop,.fsdb-media-field.is-compact .fsdb-media-drop.is-files{width:auto;min-height:var(--biu-space-5);min-width:var(--biu-space-5);padding:0;border:0;border-radius:var(--biu-radius-sm)}
.fsdb-media-field.is-compact .fsdb-media-pick,.fsdb-media-field.is-compact .fsdb-media-pick.is-upload{width:var(--biu-space-5);height:var(--biu-space-5);border-radius:var(--biu-radius-sm)}
.fsdb-media-drop:hover,.fsdb-media-drop.is-over{border-color:var(--biu-color-text-muted);background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-media-pick{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;margin:0;border:0;border-radius:8px;padding:0;background:color-mix(in srgb,var(--biu-color-bg-hover) 80%,transparent);color:inherit;pointer-events:none}
.fsdb-media-pick.is-upload{width:32px;padding:0;justify-content:center}
.fsdb-media-error{display:none}
.fsdb-person{display:inline-flex;flex-direction:row;align-items:center;gap:6px;flex:0 0 auto;width:auto;min-width:0;max-width:100%;white-space:nowrap}
a.fsdb-person.is-link,button.fsdb-person.is-link{color:inherit;text-decoration:none}
button.fsdb-person.is-link{margin:0;border:0;padding:0;background:transparent;font:inherit;cursor:pointer}
a.fsdb-person.is-link:hover .fsdb-person-name,button.fsdb-person.is-link:hover .fsdb-person-name{text-decoration:underline}
.fsdb-person-list{display:inline-flex;flex-direction:row;flex-wrap:wrap;align-items:center;align-content:flex-start;gap:6px;min-width:0;width:auto;max-width:100%}
.fsdb-person.is-empty{color:var(--biu-color-text-subtle)}
.fsdb-person-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:var(--biu-font-weight-medium)}
.fsdb-person-face{display:inline-flex;flex:none;line-height:0}
.fsdb-person-avatar{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;flex:none;border-radius:50%;background:var(--biu-color-bg-hover);color:var(--biu-color-icon-fixed)}
.fsdb-person-pick{display:flex;flex-direction:column;gap:6px;min-width:0}
.fsdb-person-options{display:flex;flex-direction:column;gap:2px;min-width:0;max-height:calc(10 * 28px + 9 * 2px);overflow:auto}
.fsdb-person-option{display:flex;align-items:center;gap:6px;box-sizing:border-box;width:100%;min-height:28px;margin:0;border:0;border-radius:5px;padding:5px 6px;background:transparent;color:var(--biu-color-text);font:inherit;cursor:pointer;text-align:left}
.fsdb-person-option:hover{background:var(--biu-color-bg-hover)}
.fsdb-person-option.is-selected{background:color-mix(in srgb,var(--biu-color-emphasis) 14%,transparent)}
.fsdb-person-loading{display:flex;align-items:center;gap:6px;padding:6px;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2)}
.fsdb-pop-host,.fsdb-ref-host{display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;align-content:center;gap:4px;min-width:0;width:100%;min-height:22px;cursor:pointer}
.fsdb-pop-empty,.fsdb-detail-aside .fsdb-pop-empty{color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-semibold);user-select:none}
.fsdb-ref-chips{display:inline-flex;flex-direction:row;flex-wrap:wrap;align-items:center;align-content:flex-start;gap:4px;min-width:0;width:auto;max-width:100%}
.fsdb-page .tasks-table:not(.is-wrap) td:has(.fsdb-ref-chips),.fsdb-page .tasks-table:not(.is-wrap) td:has(.biu-tags),.fsdb-page .tasks-table:not(.is-wrap) td:has(.fsdb-person-list),.fsdb-page .tasks-table:not(.is-wrap) td:has(.fsdb-files){overflow:hidden}
.fsdb-page .tasks-table:not(.is-wrap) .fsdb-cell:has(.fsdb-ref-chips),.fsdb-page .tasks-table:not(.is-wrap) .fsdb-ref-host:has(.fsdb-ref-chips),.fsdb-page .tasks-table:not(.is-wrap) .fsdb-cell:has(.biu-tags),.fsdb-page .tasks-table:not(.is-wrap) .fsdb-cell:has(.fsdb-person-list),.fsdb-page .tasks-table:not(.is-wrap) .fsdb-cell:has(.fsdb-files),.fsdb-page .tasks-table:not(.is-wrap) .fsdb-pop-host:has(.biu-tags),.fsdb-page .tasks-table:not(.is-wrap) .fsdb-pop-host:has(.fsdb-person-list){min-width:0;width:100%;max-width:100%;overflow:hidden;flex-wrap:nowrap}
.fsdb-page .tasks-table:not(.is-wrap) .fsdb-ref-chips,.fsdb-page .tasks-table:not(.is-wrap) .biu-tags,.fsdb-page .tasks-table:not(.is-wrap) .fsdb-person-list,.fsdb-page .tasks-table:not(.is-wrap) .fsdb-files{display:flex;flex-wrap:nowrap;width:100%;min-width:0;max-width:100%}
.fsdb-page .tasks-table:not(.is-wrap) .fsdb-ref-chip,.fsdb-page .tasks-table:not(.is-wrap) .biu-tag,.fsdb-page .tasks-table:not(.is-wrap) .fsdb-person{flex:0 1 auto;min-width:0;max-width:100%;overflow:hidden}
.fsdb-page .tasks-table:not(.is-wrap) .biu-tags{flex:none;width:max-content;max-width:none}
.fsdb-page .tasks-table:not(.is-wrap) .biu-tag,.fsdb-page .tasks-table:not(.is-wrap) .biu-tag-wrap{flex:none;width:max-content;max-width:none;overflow:visible}
.fsdb-page .tasks-table:not(.is-wrap) .biu-tag-label{flex:none;overflow:visible;text-overflow:clip}
.fsdb-page .tasks-table:not(.is-wrap) .fsdb-person-name,.fsdb-page .tasks-table:not(.is-wrap) .fsdb-ref-chip-title{overflow:hidden;text-overflow:clip}
.fsdb-page .tasks-table:not(.is-wrap) .fsdb-person-list{flex:none;width:max-content;max-width:none}
.fsdb-page .tasks-table:not(.is-wrap) .fsdb-person{flex:none;max-width:none;overflow:visible}
.fsdb-page .tasks-table:not(.is-wrap) .fsdb-person-name{flex:none;overflow:visible;text-overflow:clip}

.fsdb-page .tasks-table.is-wrap .fsdb-ref-chips{display:inline-flex;flex-direction:row;flex-wrap:wrap;width:auto;max-width:100%;overflow-wrap:normal;word-break:normal;white-space:normal}
.fsdb-ref-chip{display:inline-flex;flex-direction:row;align-items:center;gap:4px;flex:0 0 auto;width:auto;max-width:100%;margin:0;border:0;border-radius:4px;padding:1px 6px 1px 7px;background:var(--biu-color-bg-hover);color:var(--biu-color-text);font:inherit;font-size:var(--biu-chat-chip-font-size);line-height:var(--biu-space-5);cursor:pointer;text-align:left;white-space:nowrap;overflow-wrap:normal;word-break:keep-all}
.fsdb-ref-chip-title{min-width:0;overflow:visible;text-overflow:clip;white-space:nowrap}
.fsdb-ref-pick{display:flex;flex-direction:column;gap:6px;min-width:0}
.fsdb-ref-picked{display:flex;flex-wrap:wrap;gap:4px;align-items:center;align-content:flex-start;min-width:0;width:100%}
.fsdb-ref-picked-row{display:inline-flex;align-items:center;gap:2px;flex:none;width:auto;max-width:100%;min-width:0;border-radius:4px;padding:1px 2px 1px 4px;background:var(--biu-color-bg-hover)}
.fsdb-ref-picked-row .fsdb-ref-jump{flex:none;width:auto;max-width:100%;padding:2px 4px}
.fsdb-ref-row{display:flex;align-items:center;gap:4px;min-width:0;width:100%;border-radius:5px;padding:1px;color:var(--biu-color-text-muted)}
.fsdb-ref-row.is-on,.fsdb-ref-row:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-ref-jump{display:flex;align-items:center;gap:6px;min-width:0;flex:1;margin:0;border:0;border-radius:4px;padding:4px 4px;background:transparent;color:inherit;font:inherit;cursor:pointer;text-align:left}
.fsdb-ref-mark{display:inline-flex;flex:none;width:16px;height:16px;align-items:center;justify-content:center;color:var(--biu-color-icon)}
.fsdb-ref-mark .fsdb-record-mark,.fsdb-ref-mark .fsdb-record-mark svg,.fsdb-ref-mark svg{width:16px;height:16px;color:var(--biu-color-icon)}
.fsdb-ref-chip .fsdb-ref-mark,.fsdb-ref-picked-row .fsdb-ref-mark{width:var(--biu-size-icon);height:var(--biu-size-icon)}
.fsdb-ref-chip .fsdb-ref-mark svg,.fsdb-ref-chip .fsdb-ref-mark .fsdb-record-mark,.fsdb-ref-picked-row .fsdb-ref-mark svg,.fsdb-ref-picked-row .fsdb-ref-mark .fsdb-record-mark{width:var(--biu-size-icon);height:var(--biu-size-icon)}
.fsdb-ref-chip .fsdb-record-emoji,.fsdb-ref-picked-row .fsdb-record-emoji{width:var(--biu-size-icon);height:var(--biu-size-icon);font-size:var(--biu-chat-chip-font-size);line-height:var(--biu-size-icon)}
.fsdb-ref-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-ref-id{flex:none;color:var(--biu-color-text-subtle);font-size:11px;font-variant-numeric:tabular-nums}
.fsdb-ref-x{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;flex:none;margin:0;border:0;border-radius:4px;padding:0;background:transparent;color:var(--biu-color-text-subtle);font:inherit;cursor:pointer}
.fsdb-ref-x:hover{color:var(--biu-color-text);background:var(--biu-color-bg-hover)}
@media (max-width:900px){.fsdb-page{flex-direction:column}.fsdb-views{width:100%}}
.fsdb-share-wrap{position:relative;display:inline-flex}
.fsdb-share-panel{box-sizing:border-box;position:absolute;top:calc(100% + 6px);right:0;z-index:50;width:min(380px,calc(100vw - 16px));max-height:calc(100vh - 72px);overflow:auto;border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);background:var(--biu-color-bg-popover);color:var(--biu-color-text);box-shadow:var(--biu-shadow-popover)}
.fsdb-share-panel.is-embedded{position:static}
.fsdb-share-floating{display:flex;flex-direction:column}
.fsdb-share-floating>.fsdb-share-panel{max-height:100%}
.fsdb-share-panel *{box-sizing:border-box}
.fsdb-share-head{display:flex;align-items:baseline;gap:8px;padding:14px 16px 8px}
.fsdb-share-head strong{flex:none;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-bold);color:var(--biu-color-text)}
.fsdb-share-head span{min-width:0;overflow:hidden;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);text-overflow:ellipsis;white-space:nowrap}
.fsdb-share-tabs{display:flex;gap:18px;height:38px;margin:8px 16px 0;border-bottom:var(--biu-stroke-width) solid var(--biu-color-border)}
.fsdb-share-tabs button{position:relative;border:0;background:transparent;padding:0 1px;color:var(--biu-color-text-muted);font:inherit;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold);cursor:pointer}
.fsdb-share-tabs button.is-on{color:var(--biu-color-text);font-weight:var(--biu-font-weight-bold)}
.fsdb-share-tabs button.is-on::after{position:absolute;right:0;bottom:-1px;left:0;height:2px;border-radius:2px;background:var(--biu-color-emphasis);content:""}
.fsdb-share-collab-summary{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;color:var(--biu-color-text-muted);font-size:var(--biu-font-size-2)}
.fsdb-share-scope{display:inline-flex;align-items:center;gap:4px;flex:none;border-radius:999px;background:var(--biu-color-bg-hover);padding:4px 8px;color:var(--biu-color-text-muted);font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-bold)}
.fsdb-share-scope.is-workspace{background:color-mix(in srgb,var(--biu-color-ink-green) 16%,transparent);color:var(--biu-color-ink-green)}
.fsdb-share-scope.is-shared{background:var(--biu-color-emphasis-muted);color:var(--biu-color-emphasis)}
.fsdb-share-scope.is-external{background:color-mix(in srgb,var(--biu-color-warning,#d9730d) 16%,transparent);color:var(--biu-color-warning,#d9730d)}
.fsdb-scope-detail{position:relative;display:inline-flex}
.fsdb-scope-tag{--biu-tag:var(--biu-color-ink-gray);display:inline-flex;align-items:center;gap:var(--biu-space-1);height:var(--biu-space-5);border:0;border-radius:var(--biu-radius-sm);background:color-mix(in srgb,var(--biu-tag) 22%,transparent);padding:0 var(--biu-pad-chip-x);color:var(--biu-tag);font:inherit;font-size:var(--biu-chat-chip-font-size,var(--biu-font-size-3));font-weight:var(--biu-font-weight-medium);line-height:var(--biu-space-5);white-space:nowrap;cursor:pointer}
span.fsdb-scope-tag{cursor:default}
.fsdb-page .tasks-table th.fsdb-action-col,.fsdb-page .tasks-table td.fsdb-action-col,.fsdb-page .tasks-table th[data-col-key="actions"],.fsdb-page .tasks-table td[data-col-key="actions"]{width:1%;white-space:nowrap}
.fsdb-page .tasks-row-actions{display:inline-flex;flex-wrap:nowrap;align-items:center;gap:6px;width:max-content;max-width:100%}
.fsdb-scope-tag svg{width:var(--biu-size-icon,14px);height:var(--biu-size-icon,14px);flex:none;display:block}
.fsdb-scope-tag.is-personal,.fsdb-scope-pill.is-personal,.fsdb-scope-tag.is-read,.fsdb-scope-pill.is-read{--biu-tag:var(--biu-color-ink-gray)}
.fsdb-scope-tag.is-workspace,.fsdb-scope-pill.is-workspace,.fsdb-page .tasks-table td .fsdb-scope-tag.is-workspace,.fsdb-page .tasks-table td .fsdb-scope-pill.is-workspace,.fsdb-page .fsdb-proprow-v .fsdb-scope-tag.is-workspace,.fsdb-page .fsdb-proprow-v .fsdb-scope-pill.is-workspace{--biu-tag:var(--biu-color-ink-green)}
.fsdb-scope-tag.is-shared,.fsdb-scope-pill.is-shared,.fsdb-page .tasks-table td .fsdb-scope-tag.is-shared,.fsdb-page .tasks-table td .fsdb-scope-pill.is-shared,.fsdb-page .fsdb-proprow-v .fsdb-scope-tag.is-shared,.fsdb-page .fsdb-proprow-v .fsdb-scope-pill.is-shared{--biu-tag:var(--biu-color-ink-blue)}
.fsdb-scope-tag.is-external,.fsdb-scope-pill.is-external,.fsdb-page .tasks-table td .fsdb-scope-tag.is-external,.fsdb-page .tasks-table td .fsdb-scope-pill.is-external,.fsdb-page .fsdb-proprow-v .fsdb-scope-tag.is-external,.fsdb-page .fsdb-proprow-v .fsdb-scope-pill.is-external{--biu-tag:var(--biu-color-warning,#d9730d)}
.fsdb-scope-tag.is-manage,.fsdb-scope-pill.is-manage,.fsdb-page .tasks-table td .fsdb-scope-tag.is-manage,.fsdb-page .tasks-table td .fsdb-scope-pill.is-manage,.fsdb-page .fsdb-proprow-v .fsdb-scope-tag.is-manage,.fsdb-page .fsdb-proprow-v .fsdb-scope-pill.is-manage{--biu-tag:var(--biu-color-ink-purple)}
.fsdb-scope-tag.is-edit,.fsdb-scope-pill.is-edit,.fsdb-page .tasks-table td .fsdb-scope-tag.is-edit,.fsdb-page .tasks-table td .fsdb-scope-pill.is-edit,.fsdb-page .fsdb-proprow-v .fsdb-scope-tag.is-edit,.fsdb-page .fsdb-proprow-v .fsdb-scope-pill.is-edit{--biu-tag:var(--biu-color-ink-green)}
.fsdb-scope-tag.is-comment,.fsdb-scope-pill.is-comment,.fsdb-page .tasks-table td .fsdb-scope-tag.is-comment,.fsdb-page .tasks-table td .fsdb-scope-pill.is-comment,.fsdb-page .fsdb-proprow-v .fsdb-scope-tag.is-comment,.fsdb-page .fsdb-proprow-v .fsdb-scope-pill.is-comment{--biu-tag:var(--biu-color-ink-blue)}
.fsdb-page .tasks-table td:has(.fsdb-scope-detail) .fsdb-cell{overflow:visible}
.fsdb-scope-tag{position:relative;z-index:2;pointer-events:auto}
.fsdb-scope-panel{position:fixed;z-index:220;width:min(320px,82vw);padding:0;background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);box-shadow:var(--biu-shadow-popover);color:var(--biu-color-text-muted);overflow:hidden}
.fsdb-scope-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 12px 10px;border-bottom:var(--biu-stroke-width) solid var(--biu-color-border)}
.fsdb-scope-head>div{display:flex;min-width:0;flex-direction:column;gap:2px}
.fsdb-scope-head strong{color:var(--biu-color-text);font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold)}
.fsdb-scope-head em{color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);font-style:normal;line-height:1.35}
.fsdb-scope-pill{--biu-tag:var(--biu-color-ink-gray);display:inline-flex;flex:none;align-items:center;gap:var(--biu-space-1);height:var(--biu-space-5);border-radius:var(--biu-radius-sm);background:color-mix(in srgb,var(--biu-tag) 22%,transparent);padding:0 var(--biu-pad-chip-x);color:var(--biu-tag);font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-medium);line-height:var(--biu-space-5)}
.fsdb-scope-empty{margin:0;padding:12px;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);line-height:1.45}
.fsdb-scope-sections{display:flex;flex-direction:column}
.fsdb-scope-section{padding:10px 12px}
.fsdb-scope-section+.fsdb-scope-section{border-top:var(--biu-stroke-width) solid var(--biu-color-border)}
.fsdb-scope-section.is-secondary{opacity:.82}
.fsdb-scope-section h3{margin:0 0 6px;color:var(--biu-color-text-subtle);font-size:11px;font-weight:var(--biu-font-weight-semibold);letter-spacing:.02em}
.fsdb-scope-crumb{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin:0 0 8px;padding:6px 8px;border-radius:6px;background:color-mix(in srgb,var(--biu-color-border) 38%,transparent);font-size:var(--biu-font-size-2);line-height:1.35}
.fsdb-scope-crumb span{display:inline-flex;align-items:center;gap:4px;min-width:0}
.fsdb-scope-crumb strong{color:var(--biu-color-text);font-weight:var(--biu-font-weight-medium)}
.fsdb-scope-crumb i{color:var(--biu-color-text-subtle);font-style:normal}
.fsdb-scope-crumb span.is-current em{padding:0 5px;border-radius:4px;background:color-mix(in srgb,var(--biu-color-ink-blue) 14%,transparent);color:var(--biu-color-ink-blue);font-size:11px;font-style:normal}
.fsdb-scope-list{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}
.fsdb-scope-list li{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.fsdb-scope-list li>div{display:flex;min-width:0;flex-direction:column;gap:1px}
.fsdb-scope-list li strong{display:inline-flex;align-items:center;gap:6px;overflow:hidden;color:var(--biu-color-text);font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-medium);text-overflow:ellipsis;white-space:nowrap}
.fsdb-scope-list li em{overflow:hidden;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);font-style:normal;text-overflow:ellipsis;white-space:nowrap}
.fsdb-scope-list li>span{flex:none;color:var(--biu-color-text-muted);font-size:var(--biu-font-size-2);line-height:1.5}
.fsdb-scope-tree{display:flex;flex-direction:column;margin:0;padding:0;list-style:none}
.fsdb-scope-tree li{position:relative;display:grid;grid-template-columns:14px minmax(0,1fr) auto;align-items:start;gap:8px;padding:0 0 10px}
.fsdb-scope-tree li:last-child{padding-bottom:0}
.fsdb-scope-tree li:not(:last-child)::before{content:'';position:absolute;top:11px;bottom:0;left:6px;width:1px;background:var(--biu-color-border)}
.fsdb-scope-tree-dot{width:7px;height:7px;margin-top:5px;margin-left:3px;border-radius:999px;background:var(--biu-color-border-strong,var(--biu-color-text-subtle))}
.fsdb-scope-tree li.is-current .fsdb-scope-tree-dot{background:var(--biu-color-ink-blue)}
.fsdb-scope-tree-body{display:flex;min-width:0;flex-direction:column;gap:1px}
.fsdb-scope-tree-body strong{display:inline-flex;align-items:center;gap:6px;overflow:hidden;color:var(--biu-color-text);font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-medium);text-overflow:ellipsis;white-space:nowrap}
.fsdb-scope-tree-body em{overflow:hidden;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);font-style:normal;text-overflow:ellipsis;white-space:nowrap}
.fsdb-scope-tree-role{color:var(--biu-color-text-muted);font-size:var(--biu-font-size-2);line-height:1.5}
.fsdb-scope-badge{display:inline-flex;flex:none;align-items:center;height:16px;padding:0 5px;border-radius:4px;background:color-mix(in srgb,var(--biu-color-ink-blue) 14%,transparent);color:var(--biu-color-ink-blue);font-size:10px;font-weight:var(--biu-font-weight-semibold)}
.fsdb-share-section-head{display:flex;align-items:center;gap:6px;margin:0 0 8px}
.fsdb-share-collab-section h3{margin:0;color:var(--biu-color-text-muted);font-size:12px;font-weight:var(--biu-font-weight-semibold);letter-spacing:.01em}
.fsdb-share-section-count{display:inline-flex;min-width:18px;height:18px;align-items:center;justify-content:center;border-radius:999px;background:var(--biu-color-bg-hover);padding:0 5px;color:var(--biu-color-text-muted);font-size:11px;font-weight:var(--biu-font-weight-semibold)}
.fsdb-share-inherit-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px;padding:9px 11px;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:9px;background:color-mix(in srgb,var(--biu-color-bg-hover) 40%,transparent)}
.fsdb-share-inherit-row>span{display:flex;min-width:0;flex-direction:column;gap:2px}
.fsdb-share-inherit-row strong{color:var(--biu-color-text);font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-semibold)}
.fsdb-share-inherit-row em{color:var(--biu-color-text-subtle);font-size:11px;font-style:normal;line-height:1.35}
.fsdb-share-collab-section.is-inherited{margin-bottom:14px;border-bottom:var(--biu-stroke-width) solid color-mix(in srgb,var(--biu-color-border) 75%,transparent);padding-bottom:10px}
.fsdb-share-collab-section.is-external{margin-top:14px;border-top:var(--biu-stroke-width) solid color-mix(in srgb,var(--biu-color-border) 75%,transparent);padding-top:14px}
.fsdb-share-inherited-public{margin:0 0 14px;border:var(--biu-stroke-width) solid color-mix(in srgb,var(--biu-color-ink-green) 32%,var(--biu-color-border));border-radius:10px;background:color-mix(in srgb,var(--biu-color-ink-green) 7%,transparent);padding:10px 12px}
.fsdb-share-inherited-public .fsdb-share-public-state{margin-bottom:8px}
.fsdb-share-inherited-public .fsdb-share-copy-note{margin:8px 0 0}
.fsdb-share-subcrumbs{display:flex;align-items:center;gap:4px;min-width:0;overflow:hidden;font-size:var(--biu-font-size-3)}
.fsdb-share-subcrumb{display:inline-flex;align-items:center;gap:4px;min-width:0}
.fsdb-share-subcrumb button{border:0;background:transparent;padding:2px 4px;border-radius:6px;color:var(--biu-color-text-muted);font:inherit;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-share-subcrumb button:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-share-subcrumb .is-current{color:var(--biu-color-text);font-weight:var(--biu-font-weight-semibold);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-share-subcrumb-sep{flex:none;color:var(--biu-color-text-subtle)}
.fsdb-share-subpages{margin:24px auto 40px;max-width:var(--biu-page-max-width,760px);padding:16px 0 0;border-top:var(--biu-stroke-width) solid var(--biu-color-border)}
.fsdb-share-subpages h2{margin:0 0 10px;color:var(--biu-color-text-subtle);font-size:12px;font-weight:var(--biu-font-weight-semibold);letter-spacing:.02em}
.fsdb-share-subpages ul{display:flex;flex-direction:column;gap:4px;margin:0;padding:0;list-style:none}
.fsdb-share-subpage-item{display:flex;align-items:center;gap:8px;width:100%;border:var(--biu-stroke-width) solid transparent;border-radius:8px;background:transparent;padding:8px 10px;color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-3);text-align:left;cursor:pointer;transition:background-color 120ms ease,border-color 120ms ease}
.fsdb-share-subpage-item:hover{background:var(--biu-color-bg-hover-weak);border-color:var(--biu-color-border)}
.fsdb-share-subpage-icon{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;flex:none;color:var(--biu-color-icon)}
.fsdb-share-subpage-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:var(--biu-font-weight-medium)}
.fsdb-share-subpage-count{flex:none;border-radius:999px;background:var(--biu-color-bg-hover);padding:1px 6px;color:var(--biu-color-text-subtle);font-size:11px}
.fsdb-share-subpage-arrow{flex:none;color:var(--biu-color-text-subtle)}
.fsdb-share-collaborators{display:flex;flex-direction:column;gap:2px;margin:0 0 10px;padding:0;list-style:none}
.fsdb-share-collaborators li{display:grid;grid-template-columns:28px minmax(0,1fr) auto 24px;min-height:42px;align-items:center;gap:9px;margin:0 -6px;border-radius:8px;padding:5px 6px;font-size:var(--biu-font-size-2);transition:background-color 120ms ease}
.fsdb-share-collaborators li.is-inherited{grid-template-columns:28px minmax(0,1fr) auto}
.fsdb-share-collaborators li:not(.is-empty):hover{background:color-mix(in srgb,var(--biu-color-bg-hover) 72%,transparent)}
.fsdb-share-collaborators li.is-empty{display:flex;min-height:32px;margin:0;align-items:center;justify-content:flex-start;border:var(--biu-stroke-width) dashed color-mix(in srgb,var(--biu-color-border) 85%,transparent);border-radius:8px;padding:6px 10px;color:var(--biu-color-text-subtle);font-size:12px}
.fsdb-share-avatar{display:grid;width:28px;height:28px;place-items:center;overflow:hidden;border-radius:999px;background:color-mix(in srgb,var(--biu-color-emphasis) 16%,var(--biu-color-bg-hover));color:var(--biu-color-text);font-size:12px;font-weight:var(--biu-font-weight-bold);flex:none}
.fsdb-share-avatar.is-sm{width:26px;height:26px;font-size:11.5px}
.fsdb-share-avatar img{width:100%;height:100%;object-fit:cover;display:block}
.fsdb-share-avatar.is-view{background:color-mix(in srgb,var(--biu-color-emphasis) 18%,transparent);color:var(--biu-color-emphasis)}
.fsdb-share-avatar.is-external{background:color-mix(in srgb,#d97706 18%,transparent);color:#f59e0b}
.fsdb-share-collaborator-copy{display:flex;min-width:0;flex-direction:column;gap:1px}
.fsdb-share-collaborator-copy strong,.fsdb-share-collaborator-copy em{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-share-collaborator-copy strong{color:var(--biu-color-text);font-size:13px;font-weight:var(--biu-font-weight-semibold);line-height:1.25}
.fsdb-share-collaborator-copy em{color:var(--biu-color-text-subtle);font-size:11.5px;font-style:normal;line-height:1.25}
.fsdb-share-collaborator-role{display:inline-flex;align-items:center;height:22px;border-radius:6px;background:color-mix(in srgb,var(--biu-color-bg-hover) 90%,transparent);padding:0 7px;color:var(--biu-color-text-muted);font-size:11.5px;font-weight:var(--biu-font-weight-medium);white-space:nowrap}
.fsdb-share-remove{display:grid;width:24px;height:24px;place-items:center;border:0;border-radius:6px;background:transparent;padding:0;color:var(--biu-color-text-subtle);opacity:.72;cursor:pointer;transition:background-color 120ms ease,color 120ms ease,opacity 120ms ease}
.fsdb-share-remove:hover{opacity:1;color:var(--biu-color-danger);background:color-mix(in srgb,var(--biu-color-danger) 12%,transparent)}
.fsdb-share-link-section{padding:14px 16px}
.fsdb-share-empty{display:flex;align-items:center;justify-content:space-between;gap:12px}
.fsdb-share-empty>span{min-width:0}
.fsdb-share-empty-title{margin:0;color:var(--biu-color-text);font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold)}
.fsdb-share-empty-copy{margin:2px 0 0;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);line-height:1.4;font-weight:var(--biu-font-weight-medium)}
.fsdb-share-publish,.fsdb-share-panel .fsdb-share-copy{display:inline-flex;align-items:center;justify-content:center;gap:4px;height:34px;border:0;border-radius:7px;background:var(--biu-color-emphasis);padding:0 12px;color:var(--biu-color-on-emphasis);font:inherit;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold);cursor:pointer}
.fsdb-share-empty .fsdb-share-publish{width:auto;flex:none}
.fsdb-share-invite-row{display:grid;grid-template-columns:minmax(0,1fr) 78px 52px;gap:6px;align-items:center}
.fsdb-share-invite-row .fsdb-share-publish{width:52px;height:32px;padding:0;border-radius:8px;font-size:12.5px}
.fsdb-share-select-trigger{display:inline-flex;min-width:0;width:100%;height:32px;align-items:center;justify-content:space-between;gap:4px;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:8px;background:var(--biu-color-bg-input);padding:0 7px 0 9px;color:var(--biu-color-text);font:inherit;font-size:12px;font-weight:var(--biu-font-weight-medium);cursor:pointer;outline:0;transition:border-color 120ms ease,background-color 120ms ease,box-shadow 120ms ease}
.fsdb-share-select-trigger.is-inline{width:auto;height:24px;border-color:transparent;border-radius:6px;background:color-mix(in srgb,var(--biu-color-bg-hover) 90%,transparent);padding:0 6px 0 8px;color:var(--biu-color-text-muted);font-size:11.5px;gap:3px}
.fsdb-share-select-trigger.is-inline:hover,.fsdb-share-select-trigger.is-inline.is-open{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-share-select-trigger span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-share-select-trigger:hover{background:color-mix(in srgb,var(--biu-color-bg-hover) 70%,var(--biu-color-bg-input))}
.fsdb-share-select-trigger.is-open,.fsdb-share-select-trigger:focus-visible{border-color:color-mix(in srgb,var(--biu-color-emphasis) 70%,var(--biu-color-border));box-shadow:0 0 0 2px color-mix(in srgb,var(--biu-color-emphasis) 18%,transparent)}
.fsdb-share-select-chevron{flex:none;color:var(--biu-color-text-subtle);transition:transform 140ms ease}
.fsdb-share-select-trigger.is-open .fsdb-share-select-chevron{transform:rotate(180deg);color:var(--biu-color-text)}
.fsdb-share-select-menu{box-sizing:border-box;display:flex;flex-direction:column;gap:2px;overflow:auto;border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:10px;background:var(--biu-color-bg-popover);padding:4px;box-shadow:var(--biu-shadow-popover)}
.fsdb-share-select-option{display:flex;width:100%;align-items:center;justify-content:space-between;gap:10px;border:0;border-radius:7px;background:transparent;padding:6px 8px;color:var(--biu-color-text);font:inherit;text-align:left;cursor:pointer;transition:background-color 110ms ease}
.fsdb-share-select-option:hover{background:var(--biu-color-bg-hover)}
.fsdb-share-select-option.is-selected{background:color-mix(in srgb,var(--biu-color-emphasis) 14%,transparent)}
.fsdb-share-select-option-copy{display:flex;min-width:0;flex-direction:column;gap:1px}
.fsdb-share-select-option-copy strong{color:var(--biu-color-text);font-size:12.5px;font-weight:var(--biu-font-weight-semibold);line-height:1.25}
.fsdb-share-select-option-copy em{color:var(--biu-color-text-subtle);font-size:11px;font-style:normal;line-height:1.25}
.fsdb-share-select-check{flex:none;color:var(--biu-color-emphasis)}
.fsdb-share-link-field:focus-within,.fsdb-share-invite-row>input.fsdb-share-link-field:focus,.fsdb-share-member-picker>input.fsdb-share-link-field:focus{border-color:color-mix(in srgb,var(--biu-color-emphasis) 70%,var(--biu-color-border));box-shadow:0 0 0 2px color-mix(in srgb,var(--biu-color-emphasis) 18%,transparent)}
.fsdb-share-member-picker{position:relative;min-width:0}
.fsdb-share-member-picker>input.fsdb-share-link-field{width:100%;outline:0;color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-2)}
.fsdb-share-member-picker>input[type=search]::-webkit-search-cancel-button{display:none}
.fsdb-share-member-options{position:absolute;top:calc(100% + 4px);right:0;left:0;z-index:3;max-height:190px;overflow:auto;border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);background:var(--biu-color-bg-popover);padding:4px;box-shadow:var(--biu-shadow-popover)}
.fsdb-share-member-options button{display:grid;grid-template-columns:26px minmax(0,1fr);align-items:center;gap:8px;width:100%;min-width:0;border:0;border-radius:6px;background:transparent;padding:6px 7px;color:var(--biu-color-text);font:inherit;text-align:left;cursor:pointer}
.fsdb-share-member-options button:hover,.fsdb-share-member-options button[aria-selected=true]{background:var(--biu-color-bg-hover)}
.fsdb-share-member-option-copy{display:flex;min-width:0;flex-direction:column;gap:1px}
.fsdb-share-member-option-copy strong,.fsdb-share-member-option-copy em{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-share-member-option-copy strong{color:var(--biu-color-text);font-size:13px;font-weight:var(--biu-font-weight-semibold);line-height:1.25}
.fsdb-share-member-option-copy em{color:var(--biu-color-text-subtle);font-size:11.5px;font-style:normal;line-height:1.25}
.fsdb-share-member-options p{margin:0;padding:8px;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);text-align:center}
.fsdb-share-publish:hover,.fsdb-share-panel .fsdb-share-copy:hover{filter:brightness(.94)}
.fsdb-share-link-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}
.fsdb-share-link-field{display:flex;min-width:0;height:32px;align-items:center;gap:7px;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:8px;background:var(--biu-color-bg-input);padding:0 10px;transition:border-color 120ms ease,box-shadow 120ms ease}
.fsdb-share-invite-row>input.fsdb-share-link-field{width:100%;outline:0;color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-2)}
.fsdb-share-link-field svg{flex:none;color:var(--biu-color-icon)}
.fsdb-share-link-field input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-2);text-overflow:ellipsis}
.fsdb-share-panel .fsdb-share-copy{min-width:82px}
.fsdb-share-copy-note{margin:8px 0 0;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);line-height:1.4;font-weight:var(--biu-font-weight-medium)}
.fsdb-share-public-state{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;font-size:var(--biu-font-size-2)}
.fsdb-share-public-state span{display:flex;align-items:center;gap:6px;color:var(--biu-color-text-muted);font-weight:var(--biu-font-weight-semibold)}
.fsdb-share-public-state i{width:6px;height:6px;border-radius:50%;background:#36a269}
.fsdb-share-public-state button{border:0;background:transparent;padding:3px;color:var(--biu-color-text-subtle);font:inherit;font-size:var(--biu-font-size-2);cursor:pointer}
.fsdb-share-public-state button:hover{color:var(--biu-color-danger)}
.fsdb-share-settings{border-top:var(--biu-stroke-width) solid var(--biu-color-border);padding:2px 16px 8px}
.fsdb-share-setting{display:flex;min-height:40px;align-items:center;justify-content:space-between;gap:16px}
.fsdb-share-setting-copy{display:flex;min-width:0;flex-direction:column;gap:2px}
.fsdb-share-setting-copy strong{font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold)}
.fsdb-share-setting-copy em{color:var(--biu-color-text-muted);font-size:var(--biu-font-size-2);font-style:normal;font-weight:var(--biu-font-weight-medium);line-height:1.35}
.fsdb-share-toggle{position:relative;width:32px;height:18px;flex:none;border:0;border-radius:9px;background:var(--biu-color-border);padding:0;cursor:pointer}
.fsdb-share-toggle span{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:transform 120ms ease}
.fsdb-share-toggle.is-on{background:var(--biu-color-emphasis)}
.fsdb-share-toggle.is-on span{transform:translateX(14px)}
.fsdb-share-toggle:focus-visible{outline:2px solid var(--biu-color-emphasis);outline-offset:2px}
.fsdb-share-pin{display:flex;height:34px;align-items:center;justify-content:space-between;margin:0 0 8px;border-radius:7px;background:var(--biu-color-bg-input);padding:0 8px 0 10px;color:var(--biu-color-text-muted);font-size:var(--biu-font-size-2)}
.fsdb-share-pin.is-collapsed{display:none}
.fsdb-share-pin strong{margin-left:5px;color:var(--biu-color-text);font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-bold);letter-spacing:.12em}
.fsdb-share-pin button{display:inline-flex;align-items:center;gap:4px;border:0;border-radius:6px;background:transparent;padding:5px 7px;color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-semibold);cursor:pointer}
.fsdb-share-pin button:hover{background:var(--biu-color-bg-hover)}
.fsdb-share-guest-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;border:var(--biu-stroke-width) solid color-mix(in srgb,var(--biu-color-border) 85%,transparent);border-radius:9px;background:color-mix(in srgb,var(--biu-color-bg-hover) 45%,transparent);padding:9px 10px}
.fsdb-share-guest-info{display:flex;min-width:0;align-items:center;gap:9px}
.fsdb-share-guest-icon{display:grid;width:28px;height:28px;place-items:center;flex:none;border-radius:999px;background:var(--biu-color-bg-hover);color:var(--biu-color-text-muted)}
.fsdb-share-guest-info>span:last-child{display:flex;min-width:0;flex-direction:column;gap:1px}
.fsdb-share-guest-row strong{font-size:12.5px;font-weight:var(--biu-font-weight-semibold);line-height:1.25}
.fsdb-share-guest-row em{color:var(--biu-color-text-subtle);font-size:11.5px;font-style:normal;line-height:1.25}
.fsdb-share-guest-row button{flex:none;height:28px;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:7px;background:var(--biu-color-bg-popover);padding:0 10px;color:var(--biu-color-text);font:inherit;font-size:12px;font-weight:var(--biu-font-weight-semibold);cursor:pointer;transition:background-color 120ms ease,border-color 120ms ease}
.fsdb-share-guest-row button:hover{background:var(--biu-color-bg-hover);border-color:color-mix(in srgb,var(--biu-color-text-subtle) 45%,var(--biu-color-border))}
.fsdb-share-stop{width:100%;height:34px;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:7px;background:transparent;color:var(--biu-color-danger);font:inherit;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold);cursor:pointer}
.fsdb-share-stop:hover{border-color:var(--biu-color-danger);background:color-mix(in srgb,var(--biu-color-danger) 8%,transparent)}
.fsdb-share-publish:disabled,.fsdb-share-panel .fsdb-share-copy:disabled,.fsdb-share-stop:disabled{opacity:.5;cursor:default;filter:none}
.fsdb-share-error{margin:0 16px 12px;color:var(--biu-color-danger);font-size:var(--biu-font-size-2)}
.fsdb-share-error.is-inline{margin:7px 0 0}
.fsdb-share-copy{border:0;border-radius:8px;padding:7px 10px;font:inherit;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold);cursor:pointer;background:transparent;color:var(--biu-color-text)}
.fsdb-share-copy:hover{background:var(--biu-color-bg-hover)}
@media (max-width:360px){.fsdb-share-link-row,.fsdb-share-invite-row{grid-template-columns:1fr}.fsdb-share-panel .fsdb-share-copy,.fsdb-share-invite-row .fsdb-share-publish{width:100%}}
.fsdb-share-res-wrap{position:relative;display:inline-flex}
.fsdb-share-res-pop{position:absolute;top:calc(100% + 6px);right:0;z-index:60;min-width:200px;padding:8px;display:flex;flex-direction:column;gap:2px;background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);box-shadow:var(--biu-shadow-popover)}
.fsdb-share-dl-label{margin:8px 8px 2px;color:var(--biu-color-text-subtle);font-size:11px;font-weight:var(--biu-font-weight-semibold)}
.fsdb-share-dl-item{display:block;width:100%;margin:0;border:0;border-radius:7px;padding:7px 8px;background:transparent;color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold);text-align:left;cursor:pointer}
.fsdb-share-dl-item:hover{background:var(--biu-color-bg-hover)}
.fsdb-batch-dialog{width:min(480px,calc(100vw - 32px));max-height:82vh;display:flex;flex-direction:column;overflow:hidden;border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);background:var(--biu-color-bg-elevated);color:var(--biu-color-text);box-shadow:var(--biu-shadow-lg);font-family:var(--font-sans);font-size:var(--biu-font-size-3);line-height:var(--biu-leading-normal);letter-spacing:-.011em}
.fsdb-batch-dialog *{box-sizing:border-box}
.fsdb-batch-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 18px 10px}
.fsdb-batch-head-copy{min-width:0;display:flex;flex-direction:column;gap:2px}
.fsdb-batch-title{margin:0;color:var(--biu-color-text);font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-semibold);line-height:1.35}
.fsdb-batch-sub{color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-regular);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-batch-body{display:flex;flex:1;min-height:0;flex-direction:column;gap:12px;padding:0 18px 14px}
.fsdb-batch-preview{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:7px 10px;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:var(--biu-radius-lg);background:var(--biu-color-bg-subtle);color:var(--biu-color-text-muted);font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-regular)}
.fsdb-batch-preview strong{color:var(--biu-color-text);font-weight:var(--biu-font-weight-medium)}
.fsdb-batch-preview-warn{color:var(--biu-color-warning)}
.fsdb-batch-tabs{display:flex;gap:18px;height:34px;border-bottom:var(--biu-stroke-width) solid var(--biu-color-border)}
.fsdb-batch-tab{position:relative;border:0;background:transparent;padding:0 1px;color:var(--biu-color-text-muted);font:inherit;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-medium);cursor:pointer;transition:color 120ms ease}
.fsdb-batch-tab:hover{color:var(--biu-color-text)}
.fsdb-batch-tab.is-on{color:var(--biu-color-text);font-weight:var(--biu-font-weight-semibold)}
.fsdb-batch-tab.is-on::after{position:absolute;right:0;bottom:-1px;left:0;height:2px;border-radius:2px;background:var(--biu-color-emphasis);content:""}
.fsdb-batch-search-row{display:flex;align-items:center;gap:8px}
.fsdb-batch-search{flex:1;min-width:0;height:var(--biu-size-control-lg);padding:0 10px;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:var(--biu-radius-lg);background:var(--biu-color-bg-input);color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-2);outline:0;transition:border-color 120ms ease,box-shadow 120ms ease}
.fsdb-batch-search::placeholder{color:var(--biu-color-text-placeholder)}
.fsdb-batch-search:focus{border-color:color-mix(in srgb,var(--biu-color-emphasis) 70%,var(--biu-color-border));box-shadow:0 0 0 2px color-mix(in srgb,var(--biu-color-emphasis) 18%,transparent)}
.fsdb-batch-role-select{flex:none;width:104px}
.fsdb-batch-chips{display:flex;flex-wrap:wrap;gap:6px}
.fsdb-batch-chip{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 8px;border-radius:var(--biu-radius-full);background:var(--biu-color-bg-hover);color:var(--biu-color-text);font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-regular)}
.fsdb-batch-chip svg{color:var(--biu-color-icon)}
.fsdb-batch-chip button{border:0;background:transparent;padding:0;color:var(--biu-color-text-subtle);font:inherit;line-height:1;cursor:pointer}
.fsdb-batch-chip button:hover{color:var(--biu-color-text)}
.fsdb-batch-list{display:flex;flex-direction:column;gap:10px;max-height:260px;overflow-y:auto;margin:0 -4px;padding:0 4px}
.fsdb-batch-section-title{padding:0 8px 4px;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-medium)}
.fsdb-batch-rows{display:flex;flex-direction:column;gap:2px}
.fsdb-batch-row{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:6px 8px;border:0;border-radius:var(--biu-radius-md);background:transparent;color:var(--biu-color-text);font:inherit;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-regular);text-align:left;cursor:pointer;transition:background-color 110ms ease}
.fsdb-batch-row:hover{background:var(--biu-color-bg-hover-weak)}
.fsdb-batch-row.is-picked{background:color-mix(in srgb,var(--biu-color-emphasis) 10%,transparent)}
.fsdb-batch-row:disabled{opacity:.6;cursor:default}
.fsdb-batch-row-main{display:inline-flex;align-items:center;gap:8px;min-width:0}
.fsdb-batch-row-icon{flex:none;color:var(--biu-color-icon)}
.fsdb-batch-row-name{color:var(--biu-color-text);font-weight:var(--biu-font-weight-regular);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-batch-row-meta{flex:none;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-regular)}
.fsdb-batch-row-tag{flex:none;padding:1px 6px;border-radius:var(--biu-radius-full);background:var(--biu-color-bg-hover);color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-1);font-weight:var(--biu-font-weight-regular)}
.fsdb-batch-row-action{display:inline-flex;flex:none;align-items:center;gap:3px;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-regular)}
.fsdb-batch-row.is-picked .fsdb-batch-row-action{color:var(--biu-color-emphasis)}
.fsdb-batch-empty{padding:6px 8px;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2)}
.fsdb-batch-access-note{color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2)}
.fsdb-batch-access-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.fsdb-batch-access-card{padding:10px 12px;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:var(--biu-radius-lg);background:transparent;color:var(--biu-color-text);font:inherit;text-align:left;cursor:pointer;transition:border-color 120ms ease,background-color 120ms ease}
.fsdb-batch-access-card:hover{background:var(--biu-color-bg-hover-weak)}
.fsdb-batch-access-card.is-on{border-color:var(--biu-color-emphasis);background:color-mix(in srgb,var(--biu-color-emphasis) 7%,transparent)}
.fsdb-batch-access-card strong{display:block;color:var(--biu-color-text);font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-medium);line-height:1.35}
.fsdb-batch-access-card span{display:block;margin-top:2px;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-regular);line-height:1.4}
.fsdb-batch-default-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:2px;color:var(--biu-color-text-muted);font-size:var(--biu-font-size-2)}
.fsdb-batch-error{color:var(--biu-color-danger);font-size:var(--biu-font-size-2)}
.fsdb-batch-done{color:var(--biu-color-ok);font-size:var(--biu-font-size-2)}
.fsdb-batch-foot{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:var(--biu-stroke-width) solid var(--biu-color-border)}
.fsdb-batch-cancel{height:var(--biu-size-control-lg);padding:0 12px;border:0;border-radius:var(--biu-radius-lg);background:transparent;color:var(--biu-color-text-muted);font:inherit;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-medium);cursor:pointer;transition:background-color 120ms ease,color 120ms ease}
.fsdb-batch-cancel:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-batch-submit{display:inline-flex;align-items:center;gap:6px;height:var(--biu-size-control-lg);padding:0 14px;border:0;border-radius:var(--biu-radius-lg);background:var(--biu-color-emphasis);color:var(--biu-color-on-emphasis);font:inherit;font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-medium);cursor:pointer;transition:filter 120ms ease,opacity 120ms ease}
.fsdb-batch-submit:hover:not(:disabled){filter:brightness(.94)}
.fsdb-batch-submit:disabled{opacity:.45;cursor:default}
.fsdb-release-choices{display:flex;flex-direction:column;gap:8px;margin-top:4px}
.fsdb-release-choice{display:flex;flex-direction:column;gap:2px;width:100%;padding:9px 11px;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:var(--biu-radius-lg);background:transparent;color:var(--biu-color-text);font:inherit;text-align:left;cursor:pointer;transition:border-color 120ms ease,background-color 120ms ease}
.fsdb-release-choice:hover{background:var(--biu-color-bg-hover-weak)}
.fsdb-release-choice.is-on{border-color:var(--biu-color-emphasis);background:color-mix(in srgb,var(--biu-color-emphasis) 7%,transparent)}
.fsdb-release-choice strong{color:var(--biu-color-text);font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-medium)}
.fsdb-release-choice span{color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);line-height:1.4}
.fsdb-share-page{position:fixed;inset:0;z-index:220;display:flex;flex-direction:column;overflow:hidden;background:var(--biu-color-bg);color:var(--biu-color-text)}
html.share .fsdb-crumb-menu.is-fixed,html.share .fsdb-cellselect-menu,html.share .fsdb-query-drag-overlay,html.share .fsdb-cell-pop,html.share .fsdb-emoji-picker.is-fixed,html.share .fsdb-pager-size-menu,html.share .db-search-menu,html.share .fsdb-dlg-backdrop{z-index:360!important}
.fsdb-share-record-nav{display:none;align-items:center;gap:2px;flex:none}
.heading-outline-host.is-sheet{inset:auto auto 16px 16px;width:auto;height:auto;z-index:60;pointer-events:auto}
.fsdb-share-outline-toggle{display:flex;width:36px;height:36px;align-items:center;justify-content:center;margin:0;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:10px;background:var(--biu-color-bg-subtle);color:var(--biu-color-icon);box-shadow:var(--biu-shadow-md);cursor:pointer}
.fsdb-share-outline-toggle.is-open,.fsdb-share-outline-toggle:hover{color:var(--biu-color-icon-active);background:var(--biu-color-bg-hover)}
.heading-outline-host.is-sheet .chat-outline-panel{left:0;right:auto;top:auto;bottom:calc(100% + 8px);transform:none;min-width:200px;max-width:min(320px,calc(100vw - 32px));max-height:50vh}
.fsdb-share-page .fsdb-right{min-height:0;flex:1}
.fsdb-share-page .fsdb-right-body:has(.tasks-main .fsdb-workspace){overflow:auto}
.fsdb-share-page .fsdb-right-body:has(.tasks-main .fsdb-workspace)>*,.fsdb-share-page .fsdb-right-body:has(.tasks-main .fsdb-workspace) .fsdb-main{display:flex;flex-direction:column;min-height:min-content;flex:none;height:auto;overflow:visible}
.fsdb-share-page.fsdb-page{flex-direction:column;overflow:hidden}
.fsdb-share-page .chat-view-header{flex:none}
.fsdb-share-page .chat-view-header-left{min-width:0;flex:1;overflow:hidden}
.fsdb-share-page .chat-view-header-left .fsdb-crumbs{max-width:100%}
.fsdb-share-page .chat-view-header-left .chat-view-project{max-width:100%;color:var(--biu-color-text-muted)}
.fsdb-share-badge{margin-left:8px;border-radius:8px;padding:2px 8px;background:var(--biu-color-bg-hover);color:var(--biu-color-text-muted);font-size:11px;font-weight:var(--biu-font-weight-bold)}
.fsdb-person-photo{width:18px;height:18px;border-radius:50%;object-fit:cover;flex:none}
.fsdb-share-owner-corner{position:absolute;right:16px;bottom:16px;z-index:8}
.fsdb-share-owner-face{display:block;width:36px;height:36px;border-radius:50%;object-fit:cover}
.fsdb-share-owner-card{position:absolute;right:0;bottom:calc(100% + 10px);width:260px;padding:14px;display:flex;flex-direction:column;gap:10px;background:var(--biu-color-bg-popover);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);box-shadow:var(--biu-shadow-popover)}
.fsdb-share-owner-card-head{display:flex;align-items:center;gap:10px;min-width:0}
.fsdb-share-owner-card-photo,.fsdb-share-owner-card-initial{width:40px;height:40px;border-radius:50%;flex:none;object-fit:cover}
.fsdb-share-owner-card-initial{display:grid;place-items:center;background:var(--biu-color-bg-hover);color:var(--biu-color-text);font-size:16px;font-weight:var(--biu-font-weight-semibold)}
.fsdb-share-owner-card-copy{min-width:0}
.fsdb-share-owner-card-copy strong{display:block;color:var(--biu-color-text);font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-semibold)}
.fsdb-share-owner-card-copy p{margin:4px 0 0;color:var(--biu-color-text-muted);font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-medium);line-height:1.45}
.fsdb-share-owner-extras:empty{display:none}
.fsdb-share-page .fsdb-dlg{margin:auto}
.fsdb-share-body{min-width:0;min-height:0;flex:1;overflow:auto;-webkit-overflow-scrolling:touch}
.fsdb-share-page .fsdb-detail-stage{flex:none;height:auto;overflow:visible}
.fsdb-share-list{min-height:0;padding:24px 0}
.fsdb-share-page .fsdb-share-list .tasks-table,.fsdb-share-list .tasks-table{width:max-content;min-width:100%}
.fsdb-share-list tr{cursor:pointer}
.fsdb-share-page .tasks-table tr{cursor:pointer}
.fsdb-share-gate{margin:auto;text-align:center;color:var(--biu-color-text)}
.fsdb-share-gate h1{margin:0 0 8px;color:var(--biu-color-text);font-size:18px;font-weight:var(--biu-font-weight-semibold)}
.fsdb-share-gate p{margin:0;color:var(--biu-color-text-muted);font-size:var(--biu-font-size-4)}
.fsdb-share-loading{align-items:center;justify-content:center}
.fsdb-share-spinner{width:28px;height:28px;border:2px solid var(--biu-color-border);border-top-color:var(--biu-color-text);border-radius:50%;animation:fsdb-spin .7s linear infinite}
@media (max-width:720px){
.fsdb-share-page{--fsdb-share-pad:24px;--fsdb-check-gutter:0px}
.fsdb-share-page .fsdb-main > :not(.fsdb-page-banner),
.fsdb-share-page .fsdb-detail-main > :not(.fsdb-page-banner){padding-left:var(--fsdb-share-pad);padding-right:var(--fsdb-share-pad)}
.fsdb-share-page:not(.is-sheet) .fsdb-main > .fsdb-detail-title-row,
.fsdb-share-page:not(.is-sheet) .fsdb-main > .fsdb-detail-icon-slot,
.fsdb-share-page:not(.is-sheet) .fsdb-main > .tasks-toolbar{padding-left:var(--fsdb-share-pad);padding-right:var(--fsdb-share-pad)}
.fsdb-share-page .fsdb-main > .tasks-toolbar::after,.fsdb-share-page .fsdb-detail-main > .tasks-toolbar::after{left:var(--fsdb-share-pad);right:var(--fsdb-share-pad)}
.fsdb-share-list{padding:var(--fsdb-share-pad) 0}
.fsdb-share-page .fsdb-banner-right{right:var(--fsdb-share-pad);max-width:calc(100% - 2 * var(--fsdb-share-pad))}
.fsdb-share-page .fsdb-main:not(:has(> .fsdb-page-banner)),
.fsdb-share-page .fsdb-detail-main:not(:has(> .fsdb-page-banner)){padding-top:var(--fsdb-share-pad)}
.fsdb-share-record-nav{display:inline-flex}
.fsdb-share-page .fsdb-detail-float-host,.fsdb-share-page .fsdb-detail-float-nav{display:none}
.fsdb-share-page .heading-outline-host:not(.is-sheet){display:none}
.fsdb-share-page .fsdb-detail-float-nav::before{display:none}
}
.fsdb-page .tasks-toolbar-right .tasks-sort-btn:not(.is-active):not(.is-custom),
.fsdb-page .tasks-toolbar-right .tasks-refresh:not(.is-active){color:var(--biu-color-icon)}
.fsdb-page .tasks-toolbar-right .tasks-sort-btn.is-active,
.fsdb-page .tasks-toolbar-right .tasks-sort-btn.is-custom,
.fsdb-page .tasks-toolbar-right .tasks-refresh.is-active{color:var(--biu-color-icon-active)}
.fsdb-page .tasks-toolbar-right .tasks-sort-btn svg,
.fsdb-page .tasks-toolbar-right .tasks-refresh svg{color:inherit;fill:currentColor;background:transparent;opacity:1}
.fsdb-page .tasks-toolbar-right .tasks-sort-btn .fsdb-ui-glyph,
.fsdb-page .tasks-toolbar-right .tasks-refresh .fsdb-ui-glyph{color:inherit;fill:currentColor;background:currentColor;opacity:1}
.fsdb-page .tasks-viewdd-btn svg,.fsdb-page .tasks-viewdd-btn .fsdb-ui-glyph,.fsdb-page .tasks-viewtab svg,.fsdb-page .tasks-viewtab .fsdb-ui-glyph{color:var(--biu-color-icon)!important;fill:currentColor;opacity:1}
.fsdb-page .tasks-viewtab.is-active svg,.fsdb-page .tasks-viewtab.is-active .fsdb-ui-glyph,.fsdb-page .tasks-viewdd-btn.is-active svg,.fsdb-page .tasks-viewdd-btn.is-active .fsdb-ui-glyph{color:var(--biu-color-icon-active)!important}
.fsdb-page .tasks-viewdd-btn .tasks-viewdd-protection{display:inline-flex;align-items:center;justify-content:center;flex:none}
.fsdb-page .tasks-viewdd-btn .tasks-viewdd-protection.is-public svg,.fsdb-page .tasks-viewdd-btn .tasks-viewdd-protection.is-personal svg{color:var(--biu-color-icon-active)!important;opacity:1}
.fsdb-page .tasks-viewdd-btn .tasks-viewdd-protection.is-locked svg{color:var(--biu-color-emphasis)!important;opacity:1}
.fsdb-page .tasks-viewdd-act.is-locked,.fsdb-page .tasks-viewdd-act.is-locked svg,html:not(.dark) .tasks-viewdd-act.is-locked,html:not(.dark) .tasks-viewdd-act.is-locked svg{color:var(--biu-color-emphasis)}
.fsdb-page .tasks-table thead .tasks-th svg,.fsdb-page .tasks-table thead .fsdb-field-bool-glyph{color:var(--biu-color-icon)!important;fill:currentColor;opacity:1}
.fsdb-page .tasks-table thead .tasks-th.is-on svg,.fsdb-page .tasks-table thead .tasks-th.is-on .fsdb-field-bool-glyph{color:var(--biu-color-icon-active)!important}
html:not(.dark) .tasks-viewdd-menu,
html:not(.dark) .tasks-viewdd-head,
html:not(.dark) .tasks-viewdd-item-main,
html:not(.dark) .tasks-viewdd-item.is-active .tasks-viewdd-item-main,
html:not(.dark) .tasks-viewdd-saveas,
html:not(.dark) .tasks-viewdd-empty,
html:not(.dark) .fsdb-tool-flyout,
html:not(.dark) .tasks-sort-menu,
html:not(.dark) .tasks-sort-head,
html:not(.dark) .tasks-sort-search,
html:not(.dark) .tasks-sort-item,
html:not(.dark) .tasks-sort-item.is-active,
html:not(.dark) .tasks-filter-menu,
html:not(.dark) .fsdb-query-menu,
html:not(.dark) .fsdb-col-menu,
html:not(.dark) .fsdb-checkrow,
html:not(.dark) .fsdb-filter-row,
html:not(.dark) .tasks-filter-menu-label,
html:not(.dark) .fsdb-cellselect-menu,
html:not(.dark) .fsdb-share-dl-item{color:var(--biu-color-text-muted)}
html:not(.dark) .fsdb-checkrow:hover,
html:not(.dark) .fsdb-checkrow.is-on,
html:not(.dark) .tasks-sort-item:hover,
html:not(.dark) .tasks-sort-item.is-active,
html:not(.dark) .tasks-viewdd-item.is-active .tasks-viewdd-item-main{color:var(--biu-color-text)}
html:not(.dark) .tasks-viewdd-act,
html:not(.dark) .tasks-viewdd-act svg,
html:not(.dark) .tasks-viewdd-act:hover,
html:not(.dark) .tasks-viewdd-act:hover svg,
html:not(.dark) .tasks-viewdd-saveas svg,
html:not(.dark) .tasks-sort-item svg,
html:not(.dark) .tasks-sort-item:hover svg,
html:not(.dark) .tasks-sort-item.is-active svg,
html:not(.dark) .fsdb-query-menu svg,
html:not(.dark) .fsdb-query-grip,
html:not(.dark) .fsdb-checkrow-icon,
html:not(.dark) .fsdb-checkrow-icon svg,
html:not(.dark) .fsdb-checkrow>svg,
html:not(.dark) .fsdb-cellselect-menu svg{color:var(--biu-color-icon)}
.tasks-table th.is-col-clickable{cursor:pointer;transition:background 120ms ease}
.tasks-table th.is-col-clickable:hover,.tasks-table th.is-col-menu-open{background:var(--biu-color-bg-hover)}
.tasks-table th.is-col-draggable{user-select:none}
.tasks-table th.is-col-draggable:not(.is-col-clickable){cursor:grab;transition:background 120ms ease}
.tasks-table th.is-col-draggable:not(.is-col-clickable):hover{background:var(--biu-color-bg-hover)}
.tasks-table th.is-col-dragging{opacity:.42}
.tasks-table th.is-col-drop-before{box-shadow:inset 2px 0 0 0 var(--biu-color-emphasis,var(--biu-color-ink-blue,#3b82f6))}
.tasks-table th.is-col-drop-after{box-shadow:inset -2px 0 0 0 var(--biu-color-emphasis,var(--biu-color-ink-blue,#3b82f6))}
body.is-col-reordering,body.is-col-reordering *{cursor:grabbing!important;user-select:none!important}
.fsdb-col-drag-ghost{position:fixed;z-index:9999;pointer-events:none;display:flex;align-items:center;padding:0 10px;border:1px solid color-mix(in srgb,var(--biu-color-border) 90%,transparent);border-radius:4px;background:color-mix(in srgb,var(--biu-color-bg-elevated,var(--biu-color-bg)) 94%,transparent);box-shadow:0 6px 20px rgba(0,0,0,.22),0 1px 4px rgba(0,0,0,.1);color:var(--biu-color-text);font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-medium);overflow:hidden;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.fsdb-col-drag-ghost .tasks-th{display:inline-flex;align-items:center;gap:5px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-col-drag-ghost .tasks-th svg{width:14px;height:14px;flex:none;color:var(--biu-color-icon)}
.fsdb-col-menu{--biu-color-bg-hover:var(--biu-color-bg-popover-hover);width:236px;max-width:calc(100vw - 16px);max-height:min(76vh,620px);overflow-y:auto;padding:var(--biu-pad-flyout,6px);border:var(--biu-stroke-width) solid var(--biu-color-border-popover);border-radius:var(--biu-radius-popover);background:var(--biu-color-bg-popover);box-shadow:var(--biu-shadow-popover);color:var(--biu-color-text);font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-medium);user-select:none;transition:width 180ms cubic-bezier(.22,1,.36,1)}
.fsdb-col-menu.is-wide{width:420px}
.fsdb-col-menu [data-dock-tip]::after{content:none;display:none}
.fsdb-col-menu-head{display:flex;flex-direction:column;gap:6px;padding:2px 2px 4px}
.fsdb-col-menu-namebox{display:flex;align-items:center;gap:6px;min-width:0;min-height:30px;padding:2px 6px;border:1px solid var(--biu-color-border);border-radius:6px;background:transparent}
.fsdb-col-menu-namebox:focus-within{border-color:var(--biu-color-emphasis);background:transparent}
.fsdb-col-menu-glyph{display:inline-flex;align-items:center;justify-content:center;flex:none;color:var(--biu-color-icon)}
.fsdb-col-menu-nameinput{flex:1;min-width:0;border:0;padding:2px 0;background:transparent;color:var(--biu-color-text);font:inherit;font-weight:var(--biu-font-weight-medium);outline:none}
.fsdb-col-menu-nametext{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:var(--biu-font-weight-medium);color:var(--biu-color-text)}
.fsdb-col-menu-info{display:grid;place-items:center;flex:none;width:22px;height:22px;border:0;border-radius:5px;padding:0;background:transparent;color:var(--biu-color-text-subtle);cursor:pointer}
.fsdb-col-menu-info:hover,.fsdb-col-menu-info.is-on{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-col-menu-descinput{width:100%;box-sizing:border-box;border:1px solid var(--biu-color-border);border-radius:6px;padding:5px 7px;background:transparent;color:var(--biu-color-text);font-size:var(--biu-font-size-3);outline:none}
.fsdb-col-menu-descinput:focus{border-color:var(--biu-color-emphasis);background:transparent}
.fsdb-col-menu-desctext{padding:4px 6px;border-radius:6px;background:var(--biu-color-bg-hover);color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-3);line-height:1.45;word-break:break-word}
.fsdb-col-menu-err{padding:0 4px;color:var(--biu-color-danger);font-size:var(--biu-font-size-2)}
.fsdb-col-menu-sep{height:1px;margin:4px 2px;background:var(--biu-color-border)}
.fsdb-col-menu-list{display:flex;flex-direction:column;gap:1px}
.fsdb-col-menu-subhead{padding:4px 8px 6px;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-medium)}
.fsdb-col-menu-item{display:flex;align-items:center;gap:8px;width:100%;min-height:28px;padding:4px 8px;border:0;border-radius:6px;background:transparent;color:var(--biu-color-text-muted);font:inherit;text-align:left;cursor:pointer;transition:color 120ms ease,background 120ms ease}
.fsdb-col-menu-item:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-col-menu-item.is-on{color:var(--biu-color-text)}
.fsdb-col-menu-item:hover .fsdb-col-menu-ico,.fsdb-col-menu-item:hover .fsdb-col-menu-chev,.fsdb-col-menu-item.is-on .fsdb-col-menu-ico,.fsdb-col-menu-item.is-on .fsdb-col-menu-chev{color:var(--biu-color-icon-active,var(--biu-color-text))}
.fsdb-col-menu-item-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-col-menu-ico,.fsdb-col-menu-chev{flex:none;color:var(--biu-color-icon)}
.fsdb-col-menu-meta{flex:none;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);font-weight:var(--biu-font-weight-medium)}
.fsdb-col-menu-check{flex:none;color:var(--biu-color-accent)}
.fsdb-col-menu-sub{display:flex;flex-direction:column;gap:1px;margin:2px 0 4px 12px;padding-left:8px;border-left:1px solid var(--biu-color-border);max-height:200px;overflow-y:auto}
.fsdb-inline-fold{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows 180ms cubic-bezier(.22,1,.36,1),opacity 140ms ease}
.fsdb-inline-fold.is-open{grid-template-rows:1fr;opacity:1}
.fsdb-inline-fold-inner{min-height:0;overflow:hidden}
.fsdb-inline-sub{display:flex;flex-direction:column;gap:1px;margin:2px 0 4px 12px;padding-left:8px;border-left:1px solid var(--biu-color-border);max-height:220px;overflow-y:auto}
.fsdb-col-pack-group{display:flex;flex-direction:column;min-width:0}
.fsdb-col-pack-group .fsdb-inline-sub{margin:2px 0 4px 26px}
.fsdb-col-tag-right{display:inline-flex;align-items:center;gap:4px;flex:none;margin-left:auto}
.fsdb-group-acc-row{display:flex;flex-direction:column;flex:none;min-width:0}
.fsdb-group-acc-btn{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:28px;padding:4px 8px;border:0;border-radius:6px;background:transparent;color:var(--biu-color-text-muted);font:inherit;text-align:left;cursor:pointer;transition:color 120ms ease,background 120ms ease}
.fsdb-group-acc-btn:hover,.fsdb-group-acc-btn.is-open{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-group-acc-val{display:inline-flex;align-items:center;gap:4px;min-width:0;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-3)}
.fsdb-group-acc-val-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:128px}
.fsdb-group-acc-opt{display:flex;align-items:center;gap:6px;width:100%;min-height:26px;padding:3px 8px;border:0;border-radius:6px;background:transparent;color:var(--biu-color-text-muted);font:inherit;font-size:var(--biu-font-size-3);text-align:left;cursor:pointer;transition:color 120ms ease,background 120ms ease}
.fsdb-group-acc-opt:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-group-acc-opt.is-on{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-group-acc-opt-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tasks-table tbody tr.fsdb-summary-row{height:32px}
.tasks-table tr.fsdb-summary-row td{padding:0;height:32px;background:transparent}
.tasks-table tr.fsdb-summary-row:hover td{background:transparent}
.fsdb-summary-td{vertical-align:middle}
.fsdb-summary-btn{display:flex;align-items:center;justify-content:flex-end;gap:6px;width:100%;height:32px;padding:0 10px;border:0;background:transparent;color:var(--biu-color-text-muted);font:inherit;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fsdb-summary-btn:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-summary-hint{opacity:0;transition:opacity 120ms ease}
.fsdb-summary-td:hover .fsdb-summary-hint,.fsdb-summary-btn:focus-visible .fsdb-summary-hint{opacity:1}
.fsdb-summary-label{color:inherit;font:inherit}
.fsdb-summary-val{color:inherit;font:inherit;font-variant-numeric:tabular-nums}
.fsdb-col-view-sub{max-height:320px}
.fsdb-col-view-entry{display:flex;flex-direction:column;gap:4px}
.fsdb-col-view-row{display:flex;align-items:center;gap:2px;min-height:28px;border-radius:6px}
.fsdb-col-view-row:hover{background:var(--biu-color-bg-hover)}
.fsdb-col-view-pick{display:flex;align-items:center;gap:6px;flex:1;min-width:0;min-height:28px;padding:4px 8px;border:0;background:transparent;color:var(--biu-color-text-muted);font:inherit;text-align:left;cursor:pointer;transition:color 120ms ease}
.fsdb-col-view-row:hover .fsdb-col-view-pick,.fsdb-col-view-row.is-on .fsdb-col-view-pick{color:var(--biu-color-text)}
.fsdb-col-view-acts{display:inline-flex;align-items:center;gap:1px;flex:none;padding-right:4px}
.fsdb-col-view-act{display:grid;place-items:center;width:22px;height:22px;border:0;border-radius:5px;padding:0;background:transparent;color:var(--biu-color-text-subtle);cursor:pointer}
.fsdb-col-view-act:hover,.fsdb-col-view-act.is-on{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-col-view-act.is-danger:hover{color:var(--biu-color-danger)}
.fsdb-col-view-add{color:var(--biu-color-text-subtle)}
.fsdb-col-view-add:hover{color:var(--biu-color-text)}
.fsdb-col-view-editor{display:flex;flex-direction:column;gap:4px;padding:2px 4px 6px}
.fsdb-col-view-cm{width:100%;box-sizing:border-box;border:1px solid var(--biu-color-border);border-radius:6px;padding:6px 4px;background:var(--biu-color-bg);max-height:220px;overflow:auto;user-select:text}
.fsdb-col-view-cm .page-source,.fsdb-col-view-cm .cm-editor{height:auto;min-height:140px;font-size:12px;outline:none}
.fsdb-col-view-cm .cm-editor.cm-focused{outline:none}
.fsdb-col-view-cm .cm-scroller{line-height:1.5}
.fsdb-col-view-loading{padding:10px;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2)}
.fsdb-col-view-status{display:flex;align-items:center;font-size:11px;padding:0 2px}
.fsdb-col-view-ok{color:var(--biu-color-text-subtle)}
.fsdb-col-view-fail{color:var(--biu-color-danger);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-col-sandbox-err{display:inline-flex;align-items:center;padding:1px 6px;border-radius:4px;font-size:11px;color:var(--biu-color-danger);background:color-mix(in srgb,var(--biu-color-danger) 12%,transparent)}
.fsdb-member-panel{display:flex;flex-direction:column;gap:14px;margin-top:4px}
.fsdb-member-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
@media (max-width:640px){.fsdb-member-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
.fsdb-member-kpi{display:flex;flex-direction:column;gap:4px;padding:12px 14px;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:10px;background:color-mix(in srgb,var(--biu-color-bg-hover) 35%,transparent)}
.fsdb-member-kpi>span{color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2)}
.fsdb-member-kpi>strong{color:var(--biu-color-text);font-size:18px;font-weight:var(--biu-font-weight-semibold);font-variant-numeric:tabular-nums;line-height:1.25}
.fsdb-member-kpi>strong em{color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);font-style:normal;font-weight:400}
.fsdb-member-status{display:inline-flex;align-items:center;gap:6px;font-size:15px!important}
.fsdb-member-status i{width:8px;height:8px;border-radius:999px;background:var(--biu-color-ink-gray)}
.fsdb-member-status.is-online i{background:#22c55e;box-shadow:0 0 0 3px color-mix(in srgb,#22c55e 22%,transparent)}
.fsdb-member-status.is-active i{background:var(--biu-color-ink-blue)}
.fsdb-member-status.is-expired i{background:var(--biu-color-danger,#ef4444)}
.fsdb-member-card{display:flex;flex-direction:column;gap:12px;padding:14px 16px;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:10px}
.fsdb-member-card-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}
.fsdb-member-card-head h3{margin:0;color:var(--biu-color-text);font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-semibold)}
.fsdb-member-card-head em{display:block;margin-top:2px;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);font-style:normal}
.fsdb-member-legend{display:inline-flex;align-items:center;gap:4px;color:var(--biu-color-text-subtle);font-size:11px}
.fsdb-member-legend i{width:11px;height:11px;border-radius:2px;display:inline-block}
.fsdb-member-heatmap-wrap{display:flex;align-items:flex-end;gap:6px;min-width:0}
.fsdb-member-heatmap-weekdays{display:grid;grid-template-rows:repeat(7,12px);gap:3px;padding-bottom:2px;color:var(--biu-color-text-subtle);font-size:10px;line-height:12px}
.fsdb-member-heatmap-scroll{flex:1;min-width:0;overflow-x:auto;padding-bottom:2px}
.fsdb-member-heatmap-months{display:flex;gap:3px;height:16px;margin-bottom:4px;color:var(--biu-color-text-subtle);font-size:10px;line-height:16px}
.fsdb-member-heatmap-months span{width:12px;flex:none;white-space:nowrap;overflow:visible}
.fsdb-member-heatmap-grid{display:flex;gap:3px}
.fsdb-member-heatmap-col{display:grid;grid-template-rows:repeat(7,12px);gap:3px}
.fsdb-member-heatmap-cell,.fsdb-member-heatmap-pad{width:12px;height:12px;border-radius:2px}
.fsdb-member-heatmap-cell{border:0;padding:0;cursor:pointer;transition:transform 90ms ease,outline-color 90ms ease}
.fsdb-member-heatmap-cell:hover{transform:scale(1.18)}
.fsdb-member-heatmap-cell.is-selected{outline:2px solid var(--biu-color-text);outline-offset:1px}
.fsdb-member-heatmap-cell.is-l0,.fsdb-member-legend i.is-l0{background:color-mix(in srgb,var(--biu-color-border) 55%,transparent)}
.fsdb-member-heatmap-cell.is-l1,.fsdb-member-legend i.is-l1{background:color-mix(in srgb,#22c55e 28%,transparent)}
.fsdb-member-heatmap-cell.is-l2,.fsdb-member-legend i.is-l2{background:color-mix(in srgb,#22c55e 52%,transparent)}
.fsdb-member-heatmap-cell.is-l3,.fsdb-member-legend i.is-l3{background:color-mix(in srgb,#16a34a 78%,transparent)}
.fsdb-member-heatmap-cell.is-l4,.fsdb-member-legend i.is-l4{background:#15803d}
.fsdb-member-tabs{display:inline-flex;flex-wrap:wrap;gap:4px}
.fsdb-member-tabs button{height:24px;padding:0 9px;border:var(--biu-stroke-width) solid transparent;border-radius:6px;background:transparent;color:var(--biu-color-text-subtle);font:inherit;font-size:var(--biu-font-size-2);cursor:pointer}
.fsdb-member-tabs button:hover{background:var(--biu-color-bg-hover);color:var(--biu-color-text)}
.fsdb-member-tabs button.is-on{border-color:var(--biu-color-border);background:var(--biu-color-bg-hover);color:var(--biu-color-text);font-weight:var(--biu-font-weight-medium)}
.fsdb-member-day-filter{display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-radius:6px;background:color-mix(in srgb,var(--biu-color-ink-blue) 12%,transparent);color:var(--biu-color-ink-blue);font-size:var(--biu-font-size-2)}
.fsdb-member-day-filter button{border:0;background:transparent;color:inherit;font:inherit;text-decoration:underline;cursor:pointer}
.fsdb-member-empty{margin:0;padding:12px 0;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-3)}
.fsdb-member-feed{display:flex;flex-direction:column;gap:14px}
.fsdb-member-day h4{margin:0 0 6px;color:var(--biu-color-text-subtle);font-size:11px;font-weight:var(--biu-font-weight-semibold);letter-spacing:.02em}
.fsdb-member-day ul{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none}
.fsdb-member-day li{display:grid;grid-template-columns:10px minmax(0,1fr) auto;align-items:start;gap:8px;font-size:var(--biu-font-size-3)}
.fsdb-member-dot{width:7px;height:7px;margin-top:6px;border-radius:999px;background:var(--biu-color-ink-gray)}
.fsdb-member-dot.is-data{background:var(--biu-color-ink-blue)}
.fsdb-member-dot.is-access{background:var(--biu-color-ink-green)}
.fsdb-member-dot.is-automation{background:#a855f7}
.fsdb-member-dot.is-member{background:#f59e0b}
.fsdb-member-event-copy{display:flex;min-width:0;flex-direction:column;gap:2px}
.fsdb-member-event-main{display:flex;flex-wrap:wrap;align-items:center;gap:4px;color:var(--biu-color-text);line-height:1.45}
.fsdb-member-event-detail{color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);font-style:normal}
.fsdb-member-record-link{border:0;padding:0;background:transparent;color:var(--biu-color-ink-blue);font:inherit;font-weight:var(--biu-font-weight-medium);cursor:pointer;text-align:left}
.fsdb-member-record-link:hover{text-decoration:underline}
.fsdb-member-count{color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);font-style:normal}
.fsdb-member-via{display:inline-flex;align-items:center;height:16px;padding:0 5px;border-radius:4px;background:color-mix(in srgb,#a855f7 15%,transparent);color:#a855f7;font-size:10px;font-weight:var(--biu-font-weight-semibold)}
.fsdb-member-day li time{color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);font-variant-numeric:tabular-nums}
.fsdb-member-grants{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}
.fsdb-member-grants li{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:var(--biu-font-size-3)}
.fsdb-member-grant-main{display:inline-flex;align-items:center;gap:6px;min-width:0;overflow:hidden}
.fsdb-member-grant-main .fsdb-member-record-link,.fsdb-member-grant-main>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsdb-member-grant-col{flex:none;padding:0 5px;border-radius:4px;background:var(--biu-color-bg-hover);color:var(--biu-color-text-subtle);font-size:11px;line-height:18px}
.fsdb-member-grants li em{flex:none;color:var(--biu-color-text-subtle);font-size:var(--biu-font-size-2);font-style:normal}
`

export function ensureFsdbStyle() {
  if (typeof document === 'undefined') return
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  if (style.textContent !== CSS) style.textContent = CSS
}
