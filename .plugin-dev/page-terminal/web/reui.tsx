/**
 * ReUI / shadcn copy-source kit for page plugins.
 * Vendored into each plugin as web/reui.tsx — do not import @biu/biu-ui.
 */
const React = globalThis.React as typeof import('react')

const CSS = `
.rui-root{--rui-bg:#fff;--rui-fg:#171717;--rui-muted:#737373;--rui-border:#ececec;--rui-primary:#171717;--rui-primary-fg:#fff;--rui-accent:#f7f7f7;--rui-danger:#b42318;--rui-ok:#0f7a4a;--rui-radius:10px;color:var(--rui-fg);font:12.5px/1.45 ui-sans-serif,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
.rui-card{background:var(--rui-bg);border:1px solid var(--rui-border);border-radius:var(--rui-radius);padding:18px 20px}
.rui-card-head{display:flex;align-items:flex-start;gap:12px;margin:0 0 16px}
.rui-card-title{margin:0;font-size:13px;font-weight:600;letter-spacing:-.01em;line-height:1.3}
.rui-card-desc{margin:3px 0 0;color:var(--rui-muted);font-size:12px;line-height:1.4;font-weight:400}
.rui-actions{margin-left:auto;display:flex;gap:6px;flex-shrink:0;align-items:center}
.rui-row{display:flex;align-items:center;gap:8px;min-width:0}
.rui-stack{display:flex;flex-direction:column;gap:8px}
.rui-grow{flex:1 1 auto;min-width:0}
.rui-kicker{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#a3a3a3;font-weight:600}
.rui-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin:0 0 16px;border:1px solid var(--rui-border);border-radius:10px;overflow:hidden;background:#fafafa}
.rui-stat{padding:14px 16px;border-right:1px solid var(--rui-border);background:transparent}
.rui-stat:last-child{border-right:0}
.rui-stat-val{display:block;margin:8px 0 4px;font-size:22px;font-weight:560;letter-spacing:-.04em;font-variant-numeric:tabular-nums;color:#171717}
.rui-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;padding:0 11px;border-radius:6px;border:1px solid transparent;font:500 12px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer;background:var(--rui-primary);color:var(--rui-primary-fg);white-space:nowrap;flex:0 0 auto}
.rui-btn:hover{background:#0a0a0a}
.rui-btn:disabled{opacity:.4;cursor:default;pointer-events:none}
.rui-btn-secondary,.rui-btn-outline{background:#fff;color:#171717;border-color:#e5e5e5}
.rui-btn-secondary:hover,.rui-btn-outline:hover{background:#f7f7f7}
.rui-btn-ghost{background:transparent;color:#737373;border-color:transparent}
.rui-btn-ghost:hover{background:#f5f5f5;color:#171717}
.rui-btn-destructive{background:#fff;color:#b42318;border-color:#e5e5e5}
.rui-btn-sm{height:24px;padding:0 8px;font-size:11.5px}
.rui-btn-icon{width:24px;height:24px;padding:0}
.rui-input,.rui-select{display:inline-block;width:auto;max-width:100%;min-width:0;box-sizing:border-box;height:28px;border:1px solid #e5e5e5;border-radius:6px;background:#fff;color:#171717;padding:0 9px;font:12.5px/28px ui-sans-serif,system-ui,sans-serif;outline:none;flex:0 0 auto}
.rui-textarea{display:block;width:100%;min-height:80px;box-sizing:border-box;border:1px solid #e5e5e5;border-radius:6px;background:#fff;color:#171717;padding:8px 9px;font:12.5px/1.5 ui-sans-serif,system-ui,sans-serif;outline:none;resize:vertical}
.rui-grow.rui-input,.rui-grow.rui-select,.rui-fill{width:100%;flex:1 1 auto}
.rui-input:focus,.rui-select:focus,.rui-textarea:focus{border-color:#171717}
.rui-input:disabled,.rui-select:disabled,.rui-textarea:disabled{opacity:.5;background:#fafafa}
.rui-label{display:block;margin:0 0 6px;font-size:11px;font-weight:500;color:#737373}
.rui-badge{display:inline-flex;align-items:center;border-radius:4px;border:0;padding:1px 6px;font-size:11px;font-weight:500;background:#f5f5f5;color:#525252;white-space:nowrap}
.rui-badge-on{background:#171717;color:#fff}
.rui-badge-destructive{background:#fef2f2;color:#b42318}
.rui-table-wrap{width:100%;overflow:auto}
.rui-table{width:100%;border-collapse:collapse;font-size:12.5px}
.rui-table th{text-align:left;font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#a3a3a3;padding:0 10px 8px;border-bottom:1px solid var(--rui-border);white-space:nowrap}
.rui-table td{padding:10px;border-bottom:1px solid #f3f3f3;vertical-align:middle}
.rui-table tr:last-child td{border-bottom:0}
.rui-tabs{display:inline-flex;align-items:center;gap:0;padding:3px;background:#f5f5f5;border-radius:8px;width:fit-content}
.rui-tabs .rui-btn{height:22px;padding:0 10px;box-shadow:none}
.rui-tabs .rui-btn-secondary{background:#fff;border-color:transparent;color:#171717}
.rui-tabs .rui-btn-ghost{background:transparent}
.rui-progress{height:3px;border-radius:99px;background:#ececec;overflow:hidden;margin-top:8px}
.rui-progress>i{display:block;height:100%;background:#171717}
.rui-check{width:14px;height:14px;accent-color:#171717;flex:0 0 auto}
.rui-muted{color:#737373;font-size:12px}
.rui-sep{height:1px;background:var(--rui-border);border:0;margin:14px 0}
.rui-dialog-mask{position:fixed;inset:0;background:rgba(0,0,0,.4);display:grid;place-items:center;z-index:80}
.rui-dialog{width:min(400px,calc(100vw - 32px));background:#fff;border-radius:12px;padding:20px;border:1px solid #ececec}
.rui-dialog h2{margin:0 0 8px;font-size:14px;font-weight:600}
.rui-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
.rui-tree{display:flex;flex-direction:column;--tree-indent:16px;margin-top:10px;position:relative}
.rui-tree-item{position:relative;z-index:1;display:block;width:100%;box-sizing:border-box;border:0;background:transparent;padding:0 0 1px calc(var(--tree-padding,0px));color:inherit;font:inherit;text-align:left;cursor:pointer;outline:none}
.rui-tree-item::before{content:"";position:absolute;left:calc(var(--tree-padding) - 9px);top:0;bottom:0;width:1px;background:#ececec}
.rui-tree-item[data-level="0"]::before{display:none}
.rui-tree-label{display:flex;align-items:center;gap:6px;min-height:28px;padding:3px 8px;border-radius:6px;font-size:12.5px;line-height:1.35;color:#171717}
.rui-tree-item:hover .rui-tree-label,.rui-tree-item[data-selected=true] .rui-tree-label{background:#f5f5f5}
.rui-tree-item:focus-visible .rui-tree-label{box-shadow:inset 0 0 0 1px #171717}
.rui-tree-chevron{width:14px;height:14px;flex:0 0 auto;color:#a3a3a3;transition:transform .15s ease}
.rui-tree-item[aria-expanded=false] .rui-tree-chevron{transform:rotate(-90deg)}
.rui-tree-dot{width:5px;height:5px;border-radius:99px;background:#d4d4d4;flex:0 0 auto;margin-left:4.5px;margin-right:4.5px}
@media (max-width:720px){.rui-stats{grid-template-columns:1fr 1fr}.rui-stat:nth-child(2){border-right:0}.rui-stat:nth-child(n+3){border-top:1px solid var(--rui-border)}}
.rui-ios{background:#f2f2f7;border-radius:16px;padding:8px 0 16px}
.rui-large{margin:8px 20px 12px;font-size:28px;font-weight:700;letter-spacing:-.04em;line-height:1.1}
.rui-sub{margin:-8px 20px 14px;color:#6d6d72;font-size:13px}
.rui-group{margin:0 16px 18px;background:#fff;border-radius:12px;overflow:hidden}
.rui-section{margin:0 20px 6px;font-size:12px;color:#6d6d72;letter-spacing:.02em}
.rui-cell{display:flex;align-items:center;gap:10px;min-height:44px;padding:6px 14px;background:#fff;border-bottom:.5px solid rgba(60,60,67,.12);font-size:15px}
.rui-cell:last-child{border-bottom:0}
.rui-cell-main{flex:1 1 auto;min-width:0}
.rui-cell-meta{color:#8e8e93;font-size:15px;font-variant-numeric:tabular-nums;flex:0 0 auto}
.rui-activity{margin:0 16px 18px;background:#000;color:#fff;border-radius:18px;padding:22px 20px;display:flex;align-items:center;gap:22px}
.rui-legend{display:flex;flex-direction:column;gap:12px;min-width:0}
.rui-legend i{display:inline-block;width:8px;height:8px;border-radius:99px;margin-right:6px}
.rui-legend b{display:block;font-size:22px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1.15}
.rui-legend em{display:block;font-style:normal;font-size:12px;color:rgba(255,255,255,.5);margin-top:2px}
.rui-chrome{display:flex;align-items:center;gap:8px;height:44px;padding:0 10px;background:#f6f6f6;border-bottom:.5px solid rgba(0,0,0,.1)}
.rui-traffic{display:flex;gap:6px;padding:0 6px}
.rui-traffic i{width:10px;height:10px;border-radius:99px}
.rui-traffic .r{background:#ff5f57}
.rui-traffic .y{background:#febc2e}
.rui-traffic .g{background:#28c840}
.rui-addr{flex:1 1 auto;min-width:0;height:28px;border:0;border-radius:8px;background:#e8e8ed;padding:0 12px;text-align:center;font-size:13px}
.rui-split{display:grid;grid-template-columns:1fr 1fr;min-height:280px}
.rui-assert{padding:12px 14px;border-bottom:.5px solid rgba(60,60,67,.12)}
.rui-assert:last-child{border-bottom:0}
.rui-assert-top{display:flex;align-items:center;gap:8px}
.rui-assert-out{margin-top:6px;font-size:12px;color:#8e8e93;font-family:ui-monospace,monospace}
.rui-ok{color:#34c759}
.rui-bad{color:#ff3b30}
.rui-chip{width:22px;height:22px;border-radius:99px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex:0 0 auto}
.rui-chip-ok{background:#e8f8ee;color:#248a3d}
.rui-chip-bad{background:#ffece9;color:#d70015}
.rui-chip-wait{background:#f2f2f7;color:#8e8e93}
.lc-shell{display:grid;grid-template-columns:minmax(260px,1fr) minmax(280px,1.1fr);min-height:420px;background:#fff}
.lc-desc{padding:20px 22px 28px;overflow:auto;border-right:1px solid var(--rui-border);background:#fff;min-width:0}
.lc-title{display:block;width:100%;border:0;background:transparent;font-size:22px;font-weight:600;letter-spacing:-.03em;line-height:1.25;padding:0;margin:0 0 10px;color:#262626}
.lc-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.lc-diff{font-size:13px;font-weight:600}
.lc-topics{display:flex;flex-wrap:wrap;gap:6px}
.lc-topic{background:#f3f3f3;border-radius:99px;padding:3px 10px;font-size:12px;color:#5c5c5c}
.lc-h{font-size:15px;font-weight:600;margin:18px 0 8px;color:#262626}
.lc-p{font-size:14px;line-height:1.75;color:#373737;white-space:pre-wrap}
.lc-ex{background:#f5f5f5;border-radius:8px;padding:12px 14px;margin:8px 0 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.55;color:#262626}
.lc-ex strong{display:block;font-family:ui-sans-serif,system-ui,sans-serif;font-size:13px;margin:0 0 8px}
.lc-code{display:flex;flex-direction:column;min-width:0;min-height:0;background:#fff}
.lc-codebar{display:flex;align-items:center;gap:8px;height:42px;padding:0 12px;border-bottom:1px solid var(--rui-border);background:#fafafa}
.lc-codebar .rui-select{border:0;background:transparent;height:28px;font-weight:600}
.lc-run{height:28px;padding:0 14px;border:0;border-radius:6px;background:#2cbb5d;color:#fff;font:600 13px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer}
.lc-run:disabled{opacity:.45;cursor:default}
.lc-run-ghost{background:#fff;color:#262626;border:1px solid #e5e5e5}
.lc-console{border-top:1px solid var(--rui-border);background:#fff}
.lc-console-tabs{display:flex;align-items:center;gap:14px;padding:8px 14px;border-bottom:1px solid var(--rui-border);font-size:13px;color:#8c8c8c}
.lc-console-tabs [data-on=true]{color:#262626;font-weight:600;border-bottom:2px solid #262626;padding-bottom:6px;margin-bottom:-9px}
.lc-console-body{padding:12px 14px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;line-height:1.65;min-height:72px;color:#262626;white-space:pre-wrap}
.lc-empty{color:#8c8c8c}
@media (max-width:820px){.lc-shell{grid-template-columns:1fr}}
.doc-shell{background:#fafafa;border:1px solid var(--rui-border);border-radius:12px;overflow:hidden}
.doc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 18px 8px}
.doc-head h2{margin:0;font-size:18px;font-weight:650;letter-spacing:-.02em}
.doc-head p{margin:4px 0 0;font-size:12.5px;color:#6d6d72}
.doc-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:8px 18px 14px}
.doc-stat{background:#fff;border:1px solid var(--rui-border);border-radius:10px;padding:12px 14px}
.doc-stat b{display:block;font-size:26px;font-weight:650;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1.1}
.doc-stat em{display:block;margin-top:4px;font-style:normal;font-size:12px;color:#6d6d72}
.doc-bar{display:flex;height:8px;margin:0 18px 14px;border-radius:99px;overflow:hidden;background:#ececef}
.doc-bar i{display:block;height:100%}
.doc-filters{display:flex;gap:0;padding:0 10px;border-bottom:1px solid var(--rui-border);background:#fff}
.doc-filter{height:36px;padding:0 12px;border:0;border-radius:0;background:transparent;color:#6d6d72;font:600 12.5px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer}
.doc-filter[data-on=true]{color:#1c1c1e;box-shadow:inset 0 -2px 0 #1c1c1e}
.doc-issue{cursor:pointer}
.doc-issue[data-open=true]{background:#f7f7f7}
.doc-dot{width:8px;height:8px;border-radius:99px;flex:0 0 auto}
.doc-list{padding:10px 10px 14px}
.ins-shell{display:grid;grid-template-columns:220px minmax(0,1fr);min-height:460px;background:#fff}
.ins-side{border-right:1px solid var(--rui-border);background:#f7f7f7;display:flex;flex-direction:column;min-width:0}
.ins-side h4{margin:12px 12px 6px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8e8e93}
.ins-hit{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;text-align:left;padding:8px 12px;cursor:pointer;font:12.5px/1.3 ui-sans-serif,system-ui,sans-serif;color:#1c1c1e}
.ins-hit[data-on=true]{background:#fff}
.ins-main{display:flex;flex-direction:column;min-width:0}
.ins-urlbar{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--rui-border)}
.ins-panes{display:flex;gap:0;padding:0 12px;border-bottom:1px solid var(--rui-border)}
.ins-panes button{height:34px;border:0;background:transparent;color:#8e8e93;font:600 12.5px/1 ui-sans-serif,system-ui,sans-serif;padding:0 12px;cursor:pointer}
.ins-panes button[data-on=true]{color:#1c1c1e;box-shadow:inset 0 -2px 0 #1c1c1e}
.kv{width:100%;border-collapse:collapse;font-size:12.5px}
.kv th{text-align:left;font-size:11px;color:#8e8e93;font-weight:600;padding:8px 8px 6px;border-bottom:1px solid var(--rui-border)}
.kv td{padding:4px 6px;border-bottom:1px solid #f3f3f3;vertical-align:middle}
.kv input[type=text]{width:100%;border:0;background:transparent;height:28px;font:12.5px/28px ui-sans-serif,system-ui,sans-serif;outline:none}
.kv input[type=checkbox]{width:14px;height:14px;accent-color:#1c1c1e}
.ins-body{padding:10px 12px;min-height:180px;flex:1;overflow:auto}
.ins-empty{padding:28px 16px;color:#8e8e93;font-size:13px}
.m-GET{color:#2d8a4e;font-weight:700;font-size:11px}
.m-POST{color:#c47b17;font-weight:700;font-size:11px}
.m-PUT{color:#2b6cb0;font-weight:700;font-size:11px}
.m-PATCH{color:#6b4ea1;font-weight:700;font-size:11px}
.m-DELETE{color:#c53030;font-weight:700;font-size:11px}
.m-HEAD,.m-OPTIONS{color:#6b7280;font-weight:700;font-size:11px}
.ins-status{display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--rui-border);font-size:12.5px}
@media (max-width:860px){.ins-shell{grid-template-columns:1fr}}
`

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function ReUI({ children, className }: { children?: unknown; className?: string }) {
  if (typeof document !== 'undefined') {
    let el = document.querySelector('style[data-reui]') as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.setAttribute('data-reui', '')
      document.head.appendChild(el)
    }
    if (el.textContent !== CSS) el.textContent = CSS
  }
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
