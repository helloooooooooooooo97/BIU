import type { PageBanner, PageBannerKind } from './page-banner.ts'

export const BANNER_STYLE_IDS = ['jp', 'us', 'eu', 'cn'] as const
export type BannerStyleId = (typeof BANNER_STYLE_IDS)[number]

export const BANNER_STYLE_LABEL: Record<BannerStyleId, string> = {
  jp: '日式',
  us: '美式',
  eu: '欧式',
  cn: '中式',
}

export type BannerPreset = {
  id: string
  kind: PageBannerKind
  style: BannerStyleId
  title: string
  html: string
}

const wrap = (body: string) =>
  `<div style="box-sizing:border-box;height:100%;width:100%;overflow:hidden;${body}`

const tint = (tone: string, pct = 16) => `color-mix(in srgb,${tone} ${pct}%,#fff)`

export const BANNER_PRESETS: BannerPreset[] = [
  {
    id: 'jp-ink',
    kind: 'html',
    style: 'jp',
    title: '墨色',
    html: wrap(
      `background:linear-gradient(165deg,${tint('#8a6a3a', 10)} 0%,${tint('#8a6a3a', 22)} 100%);color:#6a5640;display:flex;align-items:flex-end;padding:28px 40px;font:700 22px/1.2 'Songti SC',serif"><span style="letter-spacing:.4em">和</span></div>`,
    ),
  },
  {
    id: 'jp-wave',
    kind: 'html',
    style: 'jp',
    title: '青海波',
    html: wrap(
      `background:${tint('#3d6a78', 12)};background-image:repeating-radial-gradient(circle at 0 80%,transparent 0 10px,${tint('#3d6a78', 22)} 10px 12px);color:#4a6a72;display:flex;align-items:flex-end;padding:24px 36px;font:600 15px/1 ui-sans-serif,sans-serif;letter-spacing:.35em">SEIGAIHA</div>`,
    ),
  },
  {
    id: 'us-blue',
    kind: 'html',
    style: 'us',
    title: '刊头蓝',
    html: wrap(
      `display:flex;flex-direction:column;background:${tint('#1c7cff', 8)};color:#3a6bb0;font-family:Helvetica Neue,Arial,sans-serif"><div style="background:${tint('#1c7cff', 18)};flex:1;display:flex;align-items:flex-end;padding:18px 28px;font-weight:900;font-size:28px;letter-spacing:-.03em">MASTHEAD</div><div style="height:8px;background:${tint('#d9730d', 22)}"></div></div>`,
    ),
  },
  {
    id: 'us-stripe',
    kind: 'html',
    style: 'us',
    title: '条纹',
    html: wrap(
      `background:repeating-linear-gradient(90deg,${tint('#5b9fd6', 10)} 0 28px,#fff 28px 32px,${tint('#1c7cff', 20)} 32px 36px);color:#3a6bb0;display:flex;align-items:flex-end;padding:24px 32px;font:800 18px/1 Helvetica Neue,Arial,sans-serif;letter-spacing:.2em">GRID</div>`,
    ),
  },
  {
    id: 'eu-wine',
    kind: 'html',
    style: 'eu',
    title: '酒红',
    html: wrap(
      `background:linear-gradient(180deg,${tint('#c4554d', 10)} 0%,${tint('#c4554d', 22)} 100%);color:#8a4540;display:flex;align-items:flex-end;justify-content:space-between;padding:28px 40px;font:italic 700 22px/1 Georgia,serif"><span>Atelier</span><span style="font-size:11px;letter-spacing:.28em;font-style:normal">EUROPE</span></div>`,
    ),
  },
  {
    id: 'eu-bauhaus',
    kind: 'html',
    style: 'eu',
    title: '构成',
    html: wrap(
      `background:#fff;display:grid;grid-template-columns:1.4fr .8fr .6fr;height:100%"><div style="background:${tint('#787774', 14)}"></div><div style="background:${tint('#c4554d', 20)}"></div><div style="background:${tint('#5b9fd6', 20)}"></div></div>`,
    ),
  },
  {
    id: 'cn-seal',
    kind: 'html',
    style: 'cn',
    title: '朱墨',
    html: wrap(
      `background:linear-gradient(120deg,${tint('#c45a32', 10)} 0%,${tint('#c45a32', 22)} 100%);color:#a04832;display:flex;align-items:flex-end;padding:26px 36px;font:700 24px/1 'Songti SC',serif;letter-spacing:.5em">章</div>`,
    ),
  },
  {
    id: 'cn-window',
    kind: 'html',
    style: 'cn',
    title: '窗格',
    html: wrap(
      `background:${tint('#c45a32', 8)};background-image:linear-gradient(${tint('#c45a32', 28)} 1px,transparent 1px),linear-gradient(90deg,${tint('#c45a32', 28)} 1px,transparent 1px);background-size:28px 28px;color:#a04832;display:flex;align-items:flex-end;padding:24px 32px;font:600 14px/1 ui-sans-serif,sans-serif;letter-spacing:.42em">窗</div>`,
    ),
  },
  {
    id: 'jp-live',
    kind: 'htmlframe',
    style: 'jp',
    title: '涟漪',
    html: `<div id="b" style="height:100%;background:${tint('#3d6a78', 10)}"></div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.012;if(e)e.style.background='radial-gradient('+(40+Math.sin(t)*12)+'% 80% at 20% 80%, color-mix(in srgb,#3d6a78 22%,#fff), color-mix(in srgb,#3d6a78 10%,#fff) '+(42+Math.cos(t)*8)+'%)';requestAnimationFrame(f);}f();})()</script>`,
  },
  {
    id: 'jp-live-2',
    kind: 'htmlframe',
    style: 'jp',
    title: '岚',
    html: `<div id="b" style="height:100%;background:${tint('#8a6a3a', 12)}"></div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.02;if(e)e.style.background='linear-gradient('+(t*18)+'deg,color-mix(in srgb,#8a6a3a 10%,#fff),color-mix(in srgb,#8a6a3a 22%,#fff),color-mix(in srgb,#8a6a3a 10%,#fff))';requestAnimationFrame(f);}f();})()</script>`,
  },
  {
    id: 'us-live',
    kind: 'htmlframe',
    style: 'us',
    title: '脉冲',
    html: `<div id="b" style="height:100%;display:flex;align-items:flex-end;padding:20px 28px;color:#3a6bb0;font:900 26px Helvetica Neue,Arial,sans-serif;background:${tint('#1c7cff', 16)}">LIVE</div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.04;if(e)e.style.background='color-mix(in srgb,#1c7cff '+(14+Math.sin(t)*6)+'%,#fff)';requestAnimationFrame(f);}f();})()</script>`,
  },
  {
    id: 'us-live-2',
    kind: 'htmlframe',
    style: 'us',
    title: '走带',
    html: `<div style="height:100%;overflow:hidden;background:${tint('#d9730d', 12)};color:#c07a20;font:800 13px/240px Helvetica Neue,Arial,sans-serif;letter-spacing:.4em;white-space:nowrap"><div style="display:inline-block;animation:m 12s linear infinite">NEW YORK GRID · NIGHT ISSUE · NEW YORK GRID · NIGHT ISSUE · </div></div><style>@keyframes m{from{transform:translateX(0)}to{transform:translateX(-50%)}}</style>`,
  },
  {
    id: 'eu-live',
    kind: 'htmlframe',
    style: 'eu',
    title: '暮光',
    html: `<div id="b" style="height:100%;background:${tint('#c4554d', 12)}"></div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.008;if(e)e.style.background='linear-gradient(180deg,color-mix(in srgb,#c4554d 10%,#fff),color-mix(in srgb,#c4554d '+(16+Math.sin(t)*6)+'%,#fff))';requestAnimationFrame(f);}f();})()</script>`,
  },
  {
    id: 'eu-live-2',
    kind: 'htmlframe',
    style: 'eu',
    title: '色块',
    html: `<div id="b" style="height:100%;display:grid;grid-template-columns:1fr 1fr 1fr"><i></i><i></i><i></i></div><style>#b i{display:block}#b i:nth-child(1){background:color-mix(in srgb,#787774 14%,#fff)}#b i:nth-child(2){background:color-mix(in srgb,#c4554d 20%,#fff)}#b i:nth-child(3){background:color-mix(in srgb,#5b9fd6 20%,#fff)}</style><script>(function(){var n=0,els=document.querySelectorAll('#b i');setInterval(function(){n=(n+1)%3;els.forEach(function(el,i){el.style.opacity=i===n?1:.7});},900);})()</script>`,
  },
  {
    id: 'cn-live',
    kind: 'htmlframe',
    style: 'cn',
    title: '朱砂',
    html: `<div id="b" style="height:100%;background:${tint('#c45a32', 12)}"></div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.015;if(e)e.style.background='radial-gradient(circle at '+(50+Math.sin(t)*18)+'% 70%, color-mix(in srgb,#c45a32 22%,#fff), color-mix(in srgb,#c45a32 8%,#fff) 62%)';requestAnimationFrame(f);}f();})()</script>`,
  },
  {
    id: 'cn-live-2',
    kind: 'htmlframe',
    style: 'cn',
    title: '墨晕',
    html: `<div id="b" style="height:100%;background:${tint('#c45a32', 10)}"></div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.01;if(e)e.style.boxShadow='inset 0 0 '+(80+Math.sin(t)*40)+'px color-mix(in srgb,#c45a32 28%,#fff)';requestAnimationFrame(f);}f();})()</script>`,
  },
]

export function bannerGalleryId(kind: string, html: string) {
  let hash = 2166136261
  const key = `${kind}\n${html}`
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `g-${(hash >>> 0).toString(16)}`
}

export function isBannerPreset(banner: PageBanner) {
  return BANNER_PRESETS.some((item) => item.kind === banner.kind && item.html === banner.html)
}

export function presetsOf(kind: PageBannerKind) {
  return BANNER_PRESETS.filter((item) => item.kind === kind)
}
