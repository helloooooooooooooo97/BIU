import { htmlBlockKey, stampHtmlPickSurfaces, stampHtmlSource } from './stamp-picks.ts'

const React = globalThis.React
const { useEffect, useMemo, useRef, useState } = React

export const name = 'page-html-blocks'
export const inject = ['pageEditor']

type BlockProps = {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  writable: boolean
}

/* ---------------- shared bits ---------------- */

const field = {
  width: '100%',
  boxSizing: 'border-box' as const,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
}

/** 源码编辑区（仅编辑态出现，是编辑器本身，不算内容外框） */
function SourceEditor({ html, onChange }: { html: string; onChange: (v: string) => void }) {
  return (
    <textarea
      data-testid="html-source"
      data-biu-ignore
      spellCheck={false}
      value={html}
      onChange={(e) => onChange(e.target.value)}
      placeholder={'<div style="...">…</div>'}
      style={{
        ...field,
        width: '100%',
        minHeight: 160,
        padding: '26px 10px 10px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 12,
        lineHeight: 1.55,
        color: '#d4d4d4',
        background: '#0d1117',
        border: '1px dashed #3b3b54',
        borderRadius: 8,
        resize: 'vertical',
      }}
    />
  )
}

/** 右上角悬浮工具条：只有 hover / 编辑时才浮出，不占内容、不包外框 */
function FloatBar({
  editing,
  setEditing,
  ro,
  accent,
  children,
}: {
  editing: boolean
  setEditing: (v: boolean) => void
  ro: boolean
  accent: string
  children?: unknown
}) {
  if (ro) return null
  const seg = (active: boolean, onClick: () => void, label: string) => (
    <button
      onClick={onClick}
      style={{
        cursor: 'pointer',
        border: 'none',
        borderRadius: 6,
        padding: '3px 10px',
        background: active ? accent : 'transparent',
        color: active ? '#0d1117' : '#c9cdd6',
        fontWeight: 700,
        fontSize: 11,
        lineHeight: '16px',
      }}
    >
      {label}
    </button>
  )
  return (
    <div
      data-testid="html-floatbar"
      data-biu-ignore
      style={{
        position: 'absolute',
        top: 6,
        right: 6,
        zIndex: 20,
        display: 'flex',
        gap: 2,
        alignItems: 'center',
        padding: 3,
        borderRadius: 10,
        background: 'rgba(20,20,28,.88)',
        border: '1px solid #3b3b54',
        boxShadow: '0 4px 16px rgba(0,0,0,.4)',
        font: '12px/1.4 ui-sans-serif, system-ui, sans-serif',
        backdropFilter: 'blur(6px)',
      }}
    >
      {children}
      {seg(!editing, () => setEditing(false), '预览')}
      {seg(editing, () => setEditing(true), '编辑')}
    </div>
  )
}

/* ============================================================
   1) kind=html：直接渲染（无 iframe，无脚本）——内容裸渲染，无外框
   ============================================================ */

const HTML_DIRECT_SAMPLE = `<div style="font-family:ui-sans-serif,system-ui;border-radius:12px;overflow:hidden;border:1px solid #30363d;background:linear-gradient(135deg,#1e1e1e,#27203f);color:#e6edf3;padding:18px 20px">
  <div style="font-size:11px;letter-spacing:.14em;color:#a78bfa;font-weight:700;text-transform:uppercase">html · 直接渲染</div>
  <div style="font-size:20px;font-weight:700;margin:8px 0 4px">静态富排版，不跑脚本</div>
  <div style="color:#9ca3af;font-size:13px;line-height:1.75">HTML / CSS 原样呈现，适合做卡片、表格、配色版式、嵌入图片与幻灯片排版。脚本会被忽略。</div>
  <div style="display:flex;gap:8px;margin-top:14px">
    <span style="background:#7c5cfc;color:#0d1117;font-weight:700;border-radius:999px;padding:2px 12px;font-size:12px">静态内容</span>
    <span style="background:#3b82f6;color:#0d1117;font-weight:700;border-radius:999px;padding:2px 12px;font-size:12px">直接进文档</span>
    <span style="border:1px solid #30363d;color:#8b949e;border-radius:999px;padding:2px 12px;font-size:12px">无脚本</span>
  </div>
</div>`

function HtmlDirectCard({ data, update, writable }: BlockProps) {
  const ro = !writable
  const html = String(data.html ?? '')
  const [editing, setEditing] = useState(false)
  const [hover, setHover] = useState(false)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const stamped = useMemo(
    () => stampHtmlSource(html, htmlBlockKey(hostRef.current?.closest('[data-page-block]') ?? null, html)),
    [html],
  )

  return (
    <div
      ref={hostRef}
      data-testid="page-html-direct"
      style={{ position: 'relative', width: '100%' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {(hover || editing) && (
        <FloatBar editing={editing} setEditing={setEditing} ro={ro} accent="#7c5cfc" />
      )}
      {editing ? (
        <SourceEditor html={html} onChange={(v) => update({ html: v })} />
      ) : (
        <div style={{ overflowX: 'auto' }} dangerouslySetInnerHTML={{ __html: stamped }} />
      )}
    </div>
  )
}

/* ============================================================
   2) kind=htmlframe：iframe 沙箱隔离渲染（可跑脚本）
   同样无外框，iframe 本身不再描边
   ============================================================ */

const HTML_FRAME_SAMPLE = `<div style="font-family:ui-sans-serif,system-ui;padding:14px 16px;background:linear-gradient(135deg,#0f172a,#1e3a5f);color:#e2e8f0;border-radius:10px">
  <div style="font-size:11px;letter-spacing:.14em;color:#7dd3fc;font-weight:700;text-transform:uppercase">htmlframe · iframe 沙箱</div>
  <div style="font-size:18px;font-weight:700;margin:8px 0 4px">隔离的小网页，可以跑脚本</div>
  <p style="color:#94a3b8;font-size:13px;line-height:1.6;margin:0 0 10px">下面的按钮和小时钟就是这个 iframe 里自己跑的 JS：</p>
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
    <button id="cnt" style="cursor:pointer;border:none;border-radius:8px;background:#38bdf8;color:#0f172a;font-weight:700;padding:6px 14px;font-size:13px">点我 +1</button>
    <span id="num" style="font-size:16px;font-weight:700;color:#fbbf24">0</span>
    <span id="clock" style="margin-left:auto;font-size:13px;color:#7dd3fc;font-variant-numeric:tabular-nums"></span>
  </div>
</div>
<script>
  var n = 0
  var num = document.getElementById('num')
  document.getElementById('cnt').addEventListener('click', function () {
    num.textContent = ++n
  })
  function tick() {
    document.getElementById('clock').textContent = new Date().toLocaleTimeString()
  }
  tick()
  setInterval(tick, 1000)
</script>`

function HtmlFrameCard({ data, update, writable }: BlockProps) {
  const ro = !writable
  const html = String(data.html ?? '')
  const height = Number(data.height) || 300
  const [editing, setEditing] = useState(false)
  const [hover, setHover] = useState(false)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<HTMLIFrameElement | null>(null)

  const stampFrame = () => {
    const frame = frameRef.current
    if (!frame) return
    const host = hostRef.current?.closest('[data-page-block]') ?? null
    const key = htmlBlockKey(host, html)
    stampHtmlPickSurfaces(frame, key)
    try {
      const body = frame.contentDocument?.body
      if (body) stampHtmlPickSurfaces(body, `${key}-doc`)
    } catch {
      /* srcdoc + sandbox 可能读不到 contentDocument */
    }
  }

  useEffect(() => {
    if (editing) return
    queueMicrotask(stampFrame)
  }, [editing, html, height])

  return (
    <div
      ref={hostRef}
      data-testid="page-html-frame"
      style={{ position: 'relative', width: '100%' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {(hover || editing) && (
        <FloatBar editing={editing} setEditing={setEditing} ro={ro} accent="#38bdf8">
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, paddingLeft: 6, color: '#8b93a7', fontSize: 11 }}>
            H
            <input
              type="number"
              min={80}
              value={height}
              onChange={(e) => update({ height: Number(e.target.value) || 300 })}
              style={{ width: 52, border: '1px solid #3b3b54', borderRadius: 6, background: 'rgba(255,255,255,.05)', color: '#e6e6f0', padding: '1px 6px', fontSize: 12 }}
            />
          </label>
        </FloatBar>
      )}
      {editing ? (
        <SourceEditor html={html} onChange={(v) => update({ html: v })} />
      ) : (
        <iframe
          ref={frameRef}
          data-testid="page-html-frame-preview"
          title="html-frame"
          srcDoc={html}
          sandbox="allow-scripts"
          onLoad={stampFrame}
          style={{ display: 'block', width: '100%', height, border: 'none', background: '#15151f' }}
        />
      )}
    </div>
  )
}

/* ---------------- apply ---------------- */

export function apply(ctx: {
  pageEditor: {
    registerBlock: (spec: {
      kind: string
      plugin: string
      label: string
      blockType?: string
      blockTypeLabel?: string
      hint?: string
      aliases?: string[]
      defaults?: Record<string, unknown> | (() => Record<string, unknown>)
      View: (props: BlockProps) => unknown
    }) => void
  }
}) {
  ctx.pageEditor.registerBlock({
    kind: 'html',
    plugin: name,
    label: 'HTML 直接渲染',
    blockType: 'html',
    blockTypeLabel: 'HTML',
    hint: 'HTML 直接渲染进文档，无外框（悬停浮出编辑/预览）',
    aliases: ['html', 'html直', '静态html'],
    defaults: { html: HTML_DIRECT_SAMPLE },
    View: HtmlDirectCard,
  })
  ctx.pageEditor.registerBlock({
    kind: 'htmlframe',
    plugin: name,
    label: 'HTML iframe 沙箱',
    blockType: 'html',
    blockTypeLabel: 'HTML',
    hint: 'iframe 隔离小网页，无外框，可跑脚本/幻灯片',
    aliases: ['iframe', 'htmlf', 'frame', '幻灯片', 'slide'],
    defaults: { html: HTML_FRAME_SAMPLE, height: 300 },
    View: HtmlFrameCard,
  })
}
