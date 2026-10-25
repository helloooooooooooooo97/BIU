/**
 * ReUI / shadcn copy-source kit for page plugins.
 * Vendored into each plugin as web/reui.tsx — do not import @biu/biu-ui.
 */
const React = globalThis.React as typeof import('react')

const CSS = `
.rui-root{--rui-bg:#fff;--rui-fg:#0f172a;--rui-muted:#64748b;--rui-border:#e2e8f0;--rui-primary:#2563eb;--rui-primary-fg:#fff;--rui-accent:#f1f5f9;--rui-danger:#dc2626;--rui-ok:#16a34a;--rui-radius:0.625rem;--rui-shadow:0 1px 2px rgba(15,23,42,.06);color:var(--rui-fg);font:13px/1.45 ui-sans-serif,system-ui,sans-serif}
.rui-card{background:var(--rui-bg);border:1px solid var(--rui-border);border-radius:var(--rui-radius);box-shadow:var(--rui-shadow);padding:16px}
.rui-card-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:12px}
.rui-card-title{margin:0;font-size:15px;font-weight:650;letter-spacing:-.01em}
.rui-card-desc{margin:0;color:var(--rui-muted);font-size:12px}
.rui-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 14px;border-radius:calc(var(--rui-radius) - 2px);border:1px solid transparent;font:600 13px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer;background:var(--rui-primary);color:var(--rui-primary-fg);box-shadow:var(--rui-shadow)}
.rui-btn:hover{filter:brightness(.96)}
.rui-btn:disabled{opacity:.5;cursor:default;pointer-events:none}
.rui-btn-secondary{background:var(--rui-bg);color:var(--rui-fg);border-color:var(--rui-border)}
.rui-btn-outline{background:transparent;color:var(--rui-fg);border-color:var(--rui-border);box-shadow:none}
.rui-btn-ghost{background:transparent;color:var(--rui-muted);border-color:transparent;box-shadow:none}
.rui-btn-ghost:hover{background:var(--rui-accent);color:var(--rui-fg)}
.rui-btn-destructive{background:var(--rui-danger);color:#fff}
.rui-btn-sm{height:32px;padding:0 10px;font-size:12px}
.rui-btn-icon{width:32px;height:32px;padding:0}
.rui-input,.rui-select,.rui-textarea{width:100%;min-width:0;box-sizing:border-box;border:1px solid var(--rui-border);border-radius:calc(var(--rui-radius) - 2px);background:var(--rui-bg);color:var(--rui-fg);padding:8px 10px;font:13px/1.4 ui-sans-serif,system-ui,sans-serif;outline:none}
.rui-input,.rui-select{height:36px}
.rui-textarea{min-height:88px;resize:vertical}
.rui-input:focus,.rui-select:focus,.rui-textarea:focus{border-color:var(--rui-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--rui-primary) 18%,transparent)}
.rui-input:disabled,.rui-select:disabled,.rui-textarea:disabled{opacity:.55}
.rui-label{display:block;margin:0 0 4px;font-size:12px;font-weight:600;color:var(--rui-muted)}
.rui-badge{display:inline-flex;align-items:center;border-radius:999px;border:1px solid var(--rui-border);padding:2px 8px;font-size:11px;font-weight:650;background:var(--rui-accent);color:var(--rui-muted)}
.rui-badge-on{background:color-mix(in srgb,var(--rui-ok) 14%,#fff);color:var(--rui-ok);border-color:transparent}
.rui-badge-destructive{background:color-mix(in srgb,var(--rui-danger) 12%,#fff);color:var(--rui-danger);border-color:transparent}
.rui-table-wrap{width:100%;overflow:auto}
.rui-table{width:100%;border-collapse:collapse;font-size:13px}
.rui-table th{text-align:left;font-weight:650;color:var(--rui-muted);padding:8px 10px;border-bottom:1px solid var(--rui-border)}
.rui-table td{padding:10px;border-bottom:1px solid var(--rui-border);vertical-align:top}
.rui-table tr:hover td{background:var(--rui-accent)}
.rui-tabs{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:3px;background:var(--rui-accent);border-radius:var(--rui-radius)}
.rui-progress{height:8px;border-radius:999px;background:var(--rui-accent);overflow:hidden}
.rui-progress>i{display:block;height:100%;background:var(--rui-primary)}
.rui-check{width:16px;height:16px;accent-color:var(--rui-primary)}
.rui-muted{color:var(--rui-muted);font-size:12px}
.rui-sep{height:1px;background:var(--rui-border);border:0;margin:12px 0}
.rui-dialog-mask{position:fixed;inset:0;background:rgba(15,23,42,.45);display:grid;place-items:center;z-index:80}
.rui-dialog{width:min(420px,calc(100vw - 32px));background:var(--rui-bg);border-radius:var(--rui-radius);padding:20px;box-shadow:0 16px 40px rgba(15,23,42,.18)}
.rui-dialog h2{margin:0 0 8px;font-size:16px}
.rui-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
`

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

let injected = false
export function ReUI({ children, className }: { children?: unknown; className?: string }) {
  if (!injected && typeof document !== 'undefined') {
    const el = document.createElement('style')
    el.setAttribute('data-reui', '')
    el.textContent = CSS
    document.head.appendChild(el)
    injected = true
  }
  return <div className={cx('rui-root', className)}>{children as never}</div>
}

export function Card({ className, ...rest }: Record<string, unknown>) {
  return <div className={cx('rui-card', className as string)} {...rest} />
}
export function CardHeader({ className, ...rest }: Record<string, unknown>) {
  return <div className={cx('rui-card-head', className as string)} {...rest} />
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

export function Input({ className, type = 'text', ...rest }: Record<string, unknown>) {
  return <input type={type as string} className={cx('rui-input', className as string)} {...rest} />
}
export function Textarea({ className, ...rest }: Record<string, unknown>) {
  return <textarea className={cx('rui-textarea', className as string)} {...rest} />
}
export function Select({ className, ...rest }: Record<string, unknown>) {
  return <select className={cx('rui-select', className as string)} {...rest} />
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
