import type { Context } from 'cordis'
import { ShareIcon } from '@heroicons/react/16/solid'
import type { DatabaseUi } from '@biu/type-file-system/ui'
import { tasksChrome } from './chrome.tsx'
import { TaskDepGraph } from './graph-view.tsx'

export const name = 'core-task-system-ui'
export const inject = ['databaseUi']

export function apply(ctx: Context) {
  const ui = ctx.get('databaseUi') as DatabaseUi
  ctx.effect(() => ui.decorate('/tasks', tasksChrome).dispose)
  ctx.effect(() =>
    ui
      .registerView('/tasks', {
        id: 'graph',
        label: '依赖图',
        plugin: name,
        Icon: ShareIcon,
        View: TaskDepGraph,
      })
      .dispose,
  )
}

if (typeof document !== 'undefined') {
  const id = 'biu-task-system-ui-style'
  const style = document.getElementById(id) ?? document.createElement('style')
  style.id = id
  style.textContent = `
.tasks2-title{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%}
.tasks2-title.is-done{text-decoration:line-through;color:var(--biu-color-text-subtle)}
.tasks-queue-chain{color:var(--biu-color-text-subtle);font-weight:var(--biu-font-weight-medium)}
.tasks-queue-lock{flex:none;display:inline-flex;color:var(--biu-color-warning)}
.tasks-queue-pill{flex:none;display:inline-flex;align-items:center;gap:3px;border-radius:999px;padding:1px 6px;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-bold);white-space:nowrap}
.tasks-queue-pill.is-p-high{color:var(--biu-color-danger);background:color-mix(in srgb,var(--biu-color-danger) 12%,transparent)}
.tasks-queue-pill.is-p-med{color:var(--biu-color-text);background:color-mix(in srgb,var(--biu-color-text) 12%,transparent)}
.tasks-queue-pill.is-p-low{color:var(--biu-color-text-subtle);background:color-mix(in srgb,var(--biu-color-text-subtle) 12%,transparent)}
.tasks-queue-overdue{flex:none;display:inline-flex;align-items:center;gap:3px;border-radius:999px;padding:1px 6px;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-bold);white-space:nowrap;color:var(--biu-color-danger);background:color-mix(in srgb,var(--biu-color-danger) 12%,transparent)}
.tasks-queue-assignee{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;color:var(--biu-color-text-muted)}
.tasks-graph-status{font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-semibold);color:var(--biu-color-text-subtle)}
.tasks-graph-status.is-todo{color:var(--biu-color-text-subtle)}
.tasks-graph-status.is-doing{color:var(--biu-color-text)}
.tasks-graph-status.is-done{color:var(--biu-color-ok)}
.tasks-graph-status.is-failed{color:var(--biu-color-danger)}
.tasks-proj-tag{display:inline-block;padding:1px 8px;border-radius:999px;font-size:var(--biu-font-size-4);font-weight:var(--biu-font-weight-semibold);color:var(--biu-color-text-muted);background:color-mix(in srgb,var(--biu-color-border) 55%,transparent);white-space:nowrap}
.tasks-queue-assignee{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;color:var(--biu-color-text-muted)}
.tasks-field-input, .tasks-field-textarea { width:100%; border:var(--biu-stroke-width) solid color-mix(in srgb, var(--biu-color-border) 85%, transparent); border-radius:7px; padding:7px 10px; background:var(--biu-color-bg-input); color:var(--biu-color-text); font:inherit; font-size:var(--biu-font-size-4); outline:none; resize:vertical; transition:border-color .12s, box-shadow .12s; }
.tasks-field-input:focus, .tasks-field-textarea:focus { border-color:color-mix(in srgb, var(--biu-color-text) 55%, transparent); box-shadow:0 0 0 3px color-mix(in srgb, var(--biu-color-text) 12%, transparent); }
.tasks-detail-pane { flex:1; min-height:0; overflow:auto; padding:16px 18px 20px; }
.tasks-detail-pane .tasks-automation { border:0; background:transparent; padding:0; }
.tasks-prop { display:grid; grid-template-columns:108px minmax(0,1fr); align-items:center; gap:8px; min-height:32px; font-size:var(--biu-font-size-4); color:var(--biu-color-text-subtle); }
.tasks-prop > span { font-size:var(--biu-font-size-4); font-weight:var(--biu-font-weight-semibold); color:var(--biu-color-text-subtle); display:inline-flex; align-items:center; gap:6px; min-width:0; }
.tasks-prop > span svg { flex:none; opacity:.85; }
.tasks-prop.is-stack { align-items:start; padding-top:8px; }
.tasks-prop .tasks-field-input { padding:4px 0; font-size:var(--biu-font-size-4); background:transparent; border:0; border-radius:0; box-shadow:none; }
.tasks-prop .tasks-field-input:focus { border:0; box-shadow:none; }
.tasks-detail-title-input { width:100%; border:0; background:transparent; color:var(--biu-color-text); font:inherit; font-size:22px; font-weight:var(--biu-font-weight-bold); line-height:1.35; outline:none; padding:0; resize:none; }
.tasks-detail-id { font-size:var(--biu-font-size-4); font-weight:var(--biu-font-weight-regular); color:var(--biu-color-text-muted); font-family:var(--font-mono); letter-spacing:.01em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tasks-detail-doc { width:100%; flex:none; min-height:180px; field-sizing:content; border:0; background:transparent; color:var(--biu-color-text); font:inherit; font-size:16px; line-height:1.65; outline:none; resize:none; overflow:hidden; padding:8px 0 0; }
@media (max-width: 720px) {
  .tasks-detail-modal { width:min(94vw, 880px); height:min(90vh, 720px); }
}
.tasks-field { display:flex; flex-direction:column; gap:5px; font-size:11px; color:var(--biu-color-text-subtle); }
.tasks-field > span { display:inline-flex; align-items:center; gap:5px; font-weight:var(--biu-font-weight-semibold); font-size:10.5px; letter-spacing:.02em; }
.tasks-field-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.tasks-field-input, .tasks-field-textarea { width:100%; border:var(--biu-stroke-width) solid color-mix(in srgb, var(--biu-color-border) 85%, transparent); border-radius:7px; padding:7px 10px; background:var(--biu-color-bg-input); color:var(--biu-color-text); font:inherit; font-size:var(--biu-font-size-4); outline:none; resize:vertical; transition:border-color .12s, box-shadow .12s; }
.tasks-field-input:focus, .tasks-field-textarea:focus { border-color:color-mix(in srgb, var(--biu-color-text) 55%, transparent); box-shadow:0 0 0 3px color-mix(in srgb, var(--biu-color-text) 12%, transparent); }
.tasks-field-textarea { min-height:80px; line-height:1.55; }
.tasks-detail-actor { display:flex; flex-direction:column; gap:6px; }
.tasks-detail-meta { display:flex; flex-direction:column; gap:14px; }
/* 键值 stat 列表 */
.tasks-exec-stats { display:flex; flex-direction:column; gap:8px; }
.tasks-exec-stat { display:flex; align-items:flex-start; gap:12px; font-size:var(--biu-font-size-4); color:var(--biu-color-text-muted); }
.tasks-exec-stat-label { flex:none; width:88px; display:inline-flex; align-items:center; gap:5px; color:var(--biu-color-text-subtle); font-size:var(--biu-font-size-4); font-weight:var(--biu-font-weight-semibold); padding-top:1px; }
.tasks-exec-stat-value { flex:1; min-width:0; display:flex; flex-direction:column; gap:6px; font-size:var(--biu-font-size-4); }
.tasks-exec-stat .tasks-time { display:inline-flex; align-items:center; gap:4px; font-size:var(--biu-font-size-4); color:var(--biu-color-text-muted); }
.tasks-exec-stat .traj-usage { font-size:var(--biu-font-size-4); }
.tasks-detail-usage-total-capsule { display:inline-flex; align-items:center; gap:6px; border-radius:999px; padding:2px 10px; background:color-mix(in srgb, var(--biu-color-text) 12%, transparent); color:var(--biu-color-text); font-weight:var(--biu-font-weight-semibold); white-space:nowrap; width:fit-content; }
.tasks-detail-usage-total-capsule svg { color:var(--biu-color-text); }
.tasks-detail-usage-breakdown { color:var(--biu-color-text-subtle); font-weight:var(--biu-font-weight-medium); }
.tasks-blocked-head { display:flex; align-items:center; gap:6px; font-size:11px; font-weight:var(--biu-font-weight-semibold); color:var(--biu-color-warning); }
.tasks-blocked-list { margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:5px; border:var(--biu-stroke-width) solid color-mix(in srgb, var(--biu-color-warning) 26%, transparent); border-radius:8px; padding:8px 10px; background:color-mix(in srgb, var(--biu-color-warning) 5%, transparent); }
.tasks-blocked-item { display:flex; align-items:center; gap:7px; font-size:11px; color:var(--biu-color-text-muted); line-height:1.4; }
.tasks-blocked-dot { flex:none; width:6px; height:6px; border-radius:50%; background:var(--biu-color-warning); }
/* 报告 timeline */
.tasks-exec-timeline-head { display:flex; align-items:center; gap:6px; margin-top:2px; padding-top:12px; border-top:var(--biu-stroke-width) solid var(--biu-color-border); font-size:10.5px; font-weight:var(--biu-font-weight-bold); letter-spacing:.08em; text-transform:uppercase; color:var(--biu-color-text-subtle); }
.tasks-report-timeline { margin:8px 0 0; padding:0; list-style:none; display:flex; flex-direction:column; }
.tasks-report-item { position:relative; display:flex; gap:12px; padding-bottom:16px; }
.tasks-report-item:last-child { padding-bottom:0; }
.tasks-report-node { flex:none; position:relative; z-index:1; width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; }
.tasks-report-item.is-done .tasks-report-node { color:var(--biu-color-ok); background:color-mix(in srgb, var(--biu-color-ok) 18%, transparent); box-shadow:0 0 0 1px color-mix(in srgb, var(--biu-color-ok) 32%, transparent); }
.tasks-report-item.is-doing .tasks-report-node { color:var(--biu-color-text); background:color-mix(in srgb, var(--biu-color-text) 16%, transparent); box-shadow:0 0 0 1px color-mix(in srgb, var(--biu-color-text) 30%, transparent); }
.tasks-report-rail { position:absolute; left:9px; top:22px; bottom:-2px; width:2px; background:var(--biu-color-border); }
.tasks-report-item:last-child .tasks-report-rail { display:none; }
.tasks-report-content { flex:1; min-width:0; display:flex; flex-direction:column; gap:6px; }
.tasks-report-head { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
.tasks-report-status { display:inline-flex; align-items:center; gap:4px; font-weight:var(--biu-font-weight-semibold); font-size:11px; color:var(--biu-color-text); }
.tasks-report-item.is-done .tasks-report-status { color:var(--biu-color-ok); }
.tasks-report-item.is-doing .tasks-report-status { color:var(--biu-color-text); }
.tasks-report-turn { color:var(--biu-color-text-muted); font-weight:var(--biu-font-weight-semibold); font-size:10.5px; }
.tasks-report-stats { color:var(--biu-color-text-subtle); font-size:10.5px; }
.tasks-report-time { color:var(--biu-color-text-subtle); font-size:var(--biu-font-size-2); white-space:nowrap; font-variant-numeric:tabular-nums; }
.tasks-report-note { color:var(--biu-color-text-muted); font-size:11px; line-height:1.5; white-space:normal; word-break:break-word; padding:8px 10px; border:var(--biu-stroke-width) solid var(--biu-color-border); border-radius:8px; background:color-mix(in srgb, var(--biu-color-bg-faint) 50%, transparent); }
.tasks-report-usage { display:flex; align-items:center; justify-content:space-between; gap:12px; color:var(--biu-color-text-subtle); font-size:var(--biu-font-size-2); font-variant-numeric:tabular-nums; }
.tasks-report-usage .traj-usage, .tasks-report-usage .traj-usage-empty { font-size:var(--biu-font-size-2); }

.tasks-dep-graph{flex:1;min-width:0;min-height:0;width:100%;height:100%;border-radius:10px;overflow:hidden}
.tasks-dep-graph .react-flow{background:transparent}
.tasks-dep-graph .react-flow__node{border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:10px;padding:8px 10px;background:var(--biu-color-bg-subtle);color:var(--biu-color-text);font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold);box-shadow:none}
.tasks-dep-graph .react-flow__node.tasks-graph-node.is-doing{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--biu-color-text) 45%,transparent)}
.tasks-dep-graph .react-flow__node.tasks-graph-node.is-done{opacity:.8}
.tasks-dep-graph .react-flow__controls{box-shadow:none;border:var(--biu-stroke-width) solid var(--biu-color-border);overflow:hidden;border-radius:8px}
.tasks-dep-graph .react-flow__controls-button{background:var(--biu-color-bg-subtle);border-color:var(--biu-color-border);fill:var(--biu-color-text)}
.tasks-dep-graph .react-flow__minimap{background:color-mix(in srgb,var(--biu-color-bg-subtle) 80%,transparent)}

/* ---- 依赖（DAG）视图 ---- */
/* ---- DAG 依赖图（自绘 SVG + 缩放）---- */

/* ---- 队列视图（清单风格：只展示叶节点，按状态分组）---- */
.tasks-queue { display:flex; flex-direction:column; gap:14px; margin-top:10px; overflow:auto; flex:1; min-width:0; width:100%; max-width:100%; min-height:0; padding-bottom:4px; }
.tasks-queue.is-compact { gap:10px; margin-top:6px; }
.tasks-queue-group { display:flex; flex-direction:column; gap:6px; }
.tasks-queue-ghead { display:flex; align-items:center; gap:6px; padding:4px 6px; color:var(--biu-color-text-muted); font-size:var(--biu-font-size-4); font-weight:var(--biu-font-weight-semibold); letter-spacing:.01em; }
.tasks-queue-ghead.is-overdue { color:var(--biu-color-danger); font-weight:var(--biu-font-weight-bold); }
.tasks-queue-ghead.is-doing { color:var(--biu-color-text); }
.tasks-queue-ghead.is-blocked { color:var(--biu-color-warning); }
.tasks-queue-ghead.is-done { color:var(--biu-color-ok); }
.tasks-queue-glabel { font-weight:var(--biu-font-weight-semibold); }
.tasks-queue-count { margin-left:auto; color:var(--biu-color-text-subtle); font-size:var(--biu-font-size-4); font-weight:var(--biu-font-weight-semibold); background:var(--biu-color-bg-faint); border-radius:8px; padding:1px 7px; }
.tasks-queue-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:4px; }
.tasks-queue-item { display:flex; min-width:0; border:0; border-radius:0; }
.tasks-queue-item-main { display:flex; align-items:center; gap:8px; width:100%; min-width:0; box-sizing:border-box; overflow:hidden; text-align:left; border:0; border-radius:6px; padding:7px 8px; background:transparent; color:var(--biu-color-text); font:inherit; cursor:pointer; box-shadow:none; }
.tasks-queue-item-main:hover { background:var(--biu-color-bg-hover); }
.tasks-queue-item.is-active .tasks-queue-item-main { background:color-mix(in srgb, var(--biu-color-bg-hover) 85%, transparent); }
.tasks-queue-item-title { flex:1; min-width:0; font-size:var(--biu-font-size-4); font-weight:var(--biu-font-weight-semibold); line-height:1.4; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tasks-queue-chain { color:var(--biu-color-text-subtle); font-weight:var(--biu-font-weight-medium); }
.tasks-queue-item.is-done .tasks-queue-item-title { text-decoration:line-through; color:var(--biu-color-text-subtle); }
.tasks-queue-pill { flex:none; display:inline-flex; align-items:center; gap:3px; border-radius:999px; padding:1px 6px; font-size:var(--biu-font-size-4); font-weight:var(--biu-font-weight-bold); white-space:nowrap; }
.tasks-queue-pill.is-p-high { color:var(--biu-color-danger); background:color-mix(in srgb, var(--biu-color-danger) 12%, transparent); }
.tasks-queue-pill.is-p-med { color:var(--biu-color-text); background:color-mix(in srgb, var(--biu-color-text) 12%, transparent); }
.tasks-queue-pill.is-p-low { color:var(--biu-color-text-subtle); background:color-mix(in srgb, var(--biu-color-text-subtle) 12%, transparent); }
.tasks-queue-lock { flex:none; display:inline-flex; color:var(--biu-color-warning); }
.tasks-queue-overdue { flex:none; display:inline-flex; align-items:center; gap:3px; border-radius:999px; padding:1px 6px; font-size:var(--biu-font-size-4); font-weight:var(--biu-font-weight-bold); white-space:nowrap; color:var(--biu-color-danger); background:color-mix(in srgb, var(--biu-color-danger) 12%, transparent); }
.tasks-queue-meta { flex:none; display:flex; align-items:center; gap:8px; color:var(--biu-color-text-subtle); font-size:var(--biu-font-size-4); min-width:0; overflow:hidden; }
.tasks-queue-assignee { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:120px; color:var(--biu-color-text-muted); }
.tasks-queue-meta .tasks-time { font-size:var(--biu-font-size-4); }
.tasks-queue-item-main .traj-usage { font-size:var(--biu-font-size-4); }
/* ---- Trigger 自动触发 ---- */
.tasks-status-cell { display:flex; align-items:center; gap:5px; min-width:0; }
.tasks-trigger-mark { flex:none; display:inline-flex; align-items:center; gap:3px; border-radius:999px; padding:1px 6px; font-size:var(--biu-font-size-4); font-weight:var(--biu-font-weight-bold); white-space:nowrap; color:var(--biu-color-text); background:color-mix(in srgb, var(--biu-color-text) 12%, transparent); }
.tasks-trigger-mark.is-pending { color:var(--biu-color-warning); background:color-mix(in srgb, var(--biu-color-warning) 14%, transparent); }
.tasks-trigger-mark.is-delivered { color:var(--biu-color-ok); background:color-mix(in srgb, var(--biu-color-ok) 14%, transparent); }
.tasks-trigger-mark.is-done { color:var(--biu-color-ok); background:color-mix(in srgb, var(--biu-color-ok) 12%, transparent); }
.tasks-trigger-mark.is-cancelled { color:var(--biu-color-text-subtle); background:var(--biu-color-bg-faint); }
/* 未启用但有配置 → 弱化灰 */
.tasks-trigger-mark.is-off { color:var(--biu-color-text-subtle); background:var(--biu-color-bg-faint); border:1px dashed color-mix(in srgb, var(--biu-color-border) 70%, transparent); }
.tasks-trigger-mark-state { line-height:1; }
.tasks-trigger-count { display:inline-flex; align-items:center; justify-content:center; min-width:13px; height:13px; padding:0 3px; border-radius:999px; font-size:8.5px; font-weight:var(--biu-font-weight-bold); line-height:1; color:var(--biu-color-on-emphasis); background:color-mix(in srgb, var(--biu-color-warning) 78%, transparent); }
.tasks-trigger-mark.is-off .tasks-trigger-count { background:var(--biu-color-text-subtle); }
/* ---- 自动触发开关（紧凑 Notion 风格，icon + 触发源数量）---- */
.tasks-trigger-toggle { flex:none; display:inline-flex; align-items:center; gap:2px; border-radius:999px; padding:2px 6px; border:0; cursor:pointer; white-space:nowrap; line-height:1.3; font-family:inherit; color:var(--biu-color-text-subtle); background:var(--biu-color-bg-faint); box-shadow:inset 0 0 0 1px var(--biu-color-border); transition:background .15s ease, color .15s ease; }
.tasks-trigger-toggle:hover { background:var(--biu-color-bg-hover); }
.tasks-trigger-toggle.is-on { color:var(--biu-color-ok); background:color-mix(in srgb, var(--biu-color-ok) 18%, transparent); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--biu-color-ok) 30%, transparent); }
.tasks-trigger-toggle.is-on:hover { background:color-mix(in srgb, var(--biu-color-ok) 28%, transparent); }
.tasks-trigger-toggle .tasks-trigger-count { min-width:15px; height:14px; padding:0 4px; font-size:9.5px; background:transparent; color:var(--biu-color-text-subtle); }
.tasks-trigger-toggle.is-on .tasks-trigger-count { color:var(--biu-color-ok); }
.tasks-status-cell .tasks-trigger-toggle { margin-left:4px; }
.tasks-trigger-field { display:flex; flex-direction:column; gap:4px; font-size:10.5px; color:var(--biu-color-text-subtle); font-weight:var(--biu-font-weight-semibold); }
.tasks-trigger-field > span { color:var(--biu-color-text-subtle); letter-spacing:.02em; }
.tasks-trigger-status { display:flex; flex-direction:column; gap:8px; border-top:var(--biu-stroke-width) solid var(--biu-color-border); padding-top:10px; }
.tasks-trigger-state-pill { align-self:flex-start; display:inline-flex; align-items:center; gap:6px; border-radius:999px; padding:3px 10px; font-size:10.5px; font-weight:var(--biu-font-weight-semibold); background:var(--biu-color-bg-faint); color:var(--biu-color-text-muted); box-shadow:inset 0 0 0 1px var(--biu-color-border); }
.tasks-trigger-state-dot { width:7px; height:7px; border-radius:50%; background:var(--biu-color-text-subtle); }
.tasks-trigger-state-pill.is-pending .tasks-trigger-state-dot { background:var(--biu-color-warning); }
.tasks-trigger-state-pill.is-delivered .tasks-trigger-state-dot { background:var(--biu-color-ok); }
.tasks-trigger-state-pill.is-done .tasks-trigger-state-dot { background:var(--biu-color-ok); }
.tasks-trigger-state-pill.is-pending { color:var(--biu-color-warning); }
.tasks-trigger-state-pill.is-delivered { color:var(--biu-color-ok); }
.tasks-trigger-state-pill.is-done { color:var(--biu-color-ok); }
.tasks-trigger-times { display:flex; flex-direction:column; gap:4px; }
.tasks-trigger-next, .tasks-trigger-last { display:flex; align-items:baseline; gap:8px; font-size:10.5px; color:var(--biu-color-text-muted); }
.tasks-trigger-tk { flex:none; width:48px; color:var(--biu-color-text-subtle); font-weight:var(--biu-font-weight-semibold); }
.tasks-trigger-tv { font-variant-numeric:tabular-nums; font-weight:var(--biu-font-weight-semibold); color:var(--biu-color-text); }
.tasks-trigger-ts { color:var(--biu-color-text-subtle); font-variant-numeric:tabular-nums; font-weight:var(--biu-font-weight-regular); margin-left:auto; }

/* ---- Notion Automation 风格规则卡片 ---- */
.tasks-automation { flex:none; width:100%; box-sizing:border-box; display:flex; flex-direction:column; gap:10px; padding:12px; border:var(--biu-stroke-width) solid var(--biu-color-border); border-radius:10px; background:var(--biu-color-surface); }
.tasks-auto-head { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.tasks-auto-title { display:inline-flex; align-items:center; gap:6px; font-weight:var(--biu-font-weight-semibold); font-size:11.5px; color:var(--biu-color-text); letter-spacing:.01em; }
.tasks-auto-switch { flex:none; position:relative; display:inline-flex; align-items:center; height:22px; cursor:pointer; }
.tasks-auto-switch input { position:absolute; opacity:0; width:100%; height:100%; margin:0; cursor:pointer; }
.tasks-auto-switch-track { position:relative; width:34px; height:20px; border-radius:999px; background:color-mix(in srgb, var(--biu-color-text-subtle) 24%, transparent); box-shadow:inset 0 0 0 1px var(--biu-color-border); transition:background .2s ease; pointer-events:none; }
.tasks-auto-switch-knob { position:absolute; top:3px; left:3px; width:14px; height:14px; border-radius:50%; background:#fff; box-shadow:var(--biu-shadow-md); transition:left .2s cubic-bezier(.4,0,.2,1); }
.tasks-auto-switch.is-on .tasks-auto-switch-track { background:var(--biu-color-ok); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--biu-color-ok) 30%, transparent); }
.tasks-auto-switch.is-on .tasks-auto-switch-knob { left:17px; }
.tasks-auto-summary { display:flex; align-items:flex-start; gap:7px; padding:8px 10px; border-radius:8px; background:color-mix(in srgb, var(--biu-color-bg-faint) 60%, transparent); border:var(--biu-stroke-width) solid var(--biu-color-border); font-size:11.5px; line-height:1.5; color:var(--biu-color-text); font-weight:var(--biu-font-weight-medium); }
.tasks-auto-summary-dot { flex:none; margin-top:5px; width:6px; height:6px; border-radius:50%; background:var(--biu-color-text); box-shadow:0 0 0 2px color-mix(in srgb, var(--biu-color-text) 22%, transparent); }
.tasks-auto-sec-head { display:flex; align-items:center; gap:6px; font-size:10px; font-weight:var(--biu-font-weight-bold); letter-spacing:.1em; text-transform:uppercase; color:var(--biu-color-text-subtle); margin-top:2px; }
.tasks-auto-sec { display:flex; flex-direction:column; gap:9px; padding:10px 11px; border:var(--biu-stroke-width) solid var(--biu-color-border); border-radius:8px; background:color-mix(in srgb, var(--biu-color-bg-faint) 35%, transparent); }
.tasks-auto-seg { display:inline-flex; gap:2px; padding:2px; border-radius:8px; background:color-mix(in srgb, var(--biu-color-bg-faint) 70%, transparent); box-shadow:inset 0 0 0 1px var(--biu-color-border); }
.tasks-auto-seg button { border:0; background:transparent; color:var(--biu-color-text-subtle); padding:4px 10px; border-radius:6px; font-size:11px; font-weight:var(--biu-font-weight-semibold); cursor:pointer; display:inline-flex; align-items:center; gap:5px; font-family:inherit; transition:background .15s ease, color .15s ease; }
.tasks-auto-seg button:hover { color:var(--biu-color-text); }
.tasks-auto-seg button.is-active { background:var(--biu-color-surface); color:var(--biu-color-text); box-shadow:var(--biu-shadow-md); }
.tasks-auto-preset { flex-wrap:wrap; }
.tasks-auto-then { flex-direction:row; align-items:center; gap:8px; }
.tasks-auto-then-arrow { display:inline-flex; color:var(--biu-color-ok); }
.tasks-auto-then-text { font-size:11.5px; color:var(--biu-color-text-muted); font-weight:var(--biu-font-weight-medium); }

/* ---- 触发条件列表（每条件一行，可删除）---- */
.tasks-auto-cond-list { display:flex; flex-direction:column; gap:8px; }
.tasks-auto-cond { border:var(--biu-stroke-width) solid var(--biu-color-border); border-radius:8px; background:color-mix(in srgb, var(--biu-color-bg-faint) 45%, transparent); overflow:hidden; }
.tasks-auto-cond-head { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 10px; background:color-mix(in srgb, var(--biu-color-bg-faint) 60%, transparent); }
.tasks-auto-cond-type { display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:var(--biu-font-weight-semibold); color:var(--biu-color-text); }
.tasks-auto-cond-del { flex:none; display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:6px; border:0; cursor:pointer; color:var(--biu-color-text-subtle); background:transparent; transition:background .12s ease, color .12s ease; }
.tasks-auto-cond-del:hover { background:color-mix(in srgb, var(--biu-color-danger) 16%, transparent); color:var(--biu-color-danger); }
.tasks-auto-cond-body { display:flex; flex-direction:column; gap:8px; padding:8px 10px; }
.tasks-auto-add { margin-top:2px; }
.tasks-auto-add-btn { display:inline-flex; align-items:center; gap:5px; border:1px dashed var(--biu-color-border); border-radius:8px; padding:5px 10px; background:transparent; color:var(--biu-color-text-subtle); font-size:11px; font-weight:var(--biu-font-weight-semibold); cursor:pointer; font-family:inherit; transition:background .12s ease, color .12s ease, border-color .12s ease; }
.tasks-auto-add-btn:hover { color:var(--biu-color-text); border-color:color-mix(in srgb, var(--biu-color-border) 160%, transparent); background:var(--biu-color-bg-hover); }



/* ---- Notion 风格 trigger 友好配置 ---- */
.tasks-trigger-mode, .tasks-cron-week { appearance:none; -webkit-appearance:none; border:var(--biu-stroke-width) solid var(--biu-color-border); border-radius:6px; padding:4px 8px; font-size:var(--biu-font-size-2); color:var(--biu-color-text); background:var(--biu-color-bg-faint); cursor:pointer; width:auto; max-width:100%; font-family:inherit; }
.tasks-trigger-mode:hover, .tasks-cron-week:hover { background:var(--biu-color-bg-hover); }
.tasks-cron-num { width:72px; }
.tasks-trigger-time { display:flex; align-items:center; gap:4px; }
.tasks-trigger-time .tasks-cron-num { width:56px; }
.tasks-trigger-time-sep { color:var(--biu-color-text-subtle); font-weight:var(--biu-font-weight-bold); font-size:var(--biu-font-size-3); }
.tasks-trigger-preview-wrap { gap:6px; }
.tasks-trigger-preview { color:var(--biu-color-text-muted); font-size:11.5px; font-weight:var(--biu-font-weight-semibold); font-variant-numeric:tabular-nums; padding:3px 8px; border-radius:6px; background:color-mix(in srgb, var(--biu-color-text) 8%, transparent); border:var(--biu-stroke-width) solid color-mix(in srgb, var(--biu-color-border) 60%, transparent); display:inline-flex; align-items:center; gap:4px; }
.tasks-trigger-cronfield { display:flex; gap:6px; flex-wrap:wrap; }
.tasks-cron-field { display:flex; flex-direction:column; gap:3px; }
.tasks-cron-field > span { font-size:10px; color:var(--biu-color-text-subtle); font-weight:var(--biu-font-weight-semibold); }
.tasks-cron-field .tasks-field-input { width:44px; padding:3px 5px; text-align:center; font-size:11.5px; font-variant-numeric:tabular-nums; }
.tasks-cron-field:hover .tasks-field-input { border-color:var(--biu-color-text); }
.tasks-cron-field.is-invalid .tasks-field-input { border-color:var(--biu-color-danger); box-shadow:0 0 0 1px color-mix(in srgb, var(--biu-color-danger) 30%, transparent); }
`
  if (!document.getElementById(id)) document.head.appendChild(style)
}
