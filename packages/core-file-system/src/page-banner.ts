export type PageBannerKind = 'html' | 'htmlframe'

export type PageBanner = {
  kind: PageBannerKind
  html: string
}

export const PAGE_BANNER_STATIC_SAMPLE = `<div style="box-sizing:border-box;height:100%;display:flex;align-items:flex-end;padding:28px 48px;background:linear-gradient(120deg,#161616 0%,#243044 55%,#1a1a1a 100%);color:#F0EFED;font:600 28px/1.15 ui-sans-serif,system-ui,sans-serif">页面背景</div>`

export const PAGE_BANNER_LIVE_SAMPLE = `<div id="fsdb-banner-live" style="height:100%;background:#141414"></div>
<script>
(function () {
  var el = document.getElementById('fsdb-banner-live');
  if (!el) return;
  var t = 0;
  function tick() {
    t += 0.01;
    el.style.background = 'linear-gradient(' + (t * 28) + 'deg,#121212,hsl(' + ((t * 40) % 360) + ' 28% 18%),#1c1c1c)';
    requestAnimationFrame(tick);
  }
  tick();
})();
</script>`

export function parsePageBanner(raw: unknown): PageBanner | null {
  if (raw == null || raw === false || raw === '') return null
  if (typeof raw === 'string') {
    const html = raw.trim()
    return html ? { kind: 'html', html } : null
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  const kind: PageBannerKind = rec.kind === 'htmlframe' ? 'htmlframe' : 'html'
  const html = typeof rec.html === 'string' ? rec.html : typeof rec.source === 'string' ? rec.source : ''
  if (!html.trim()) return null
  return { kind, html }
}

export function bannerSrcDoc(html: string) {
  const trimmed = html.trim()
  if (/^\s*<(!doctype|html[\s>])/i.test(trimmed)) return trimmed
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;height:100%;overflow:hidden;background:transparent}</style></head><body>${html}</body></html>`
}
