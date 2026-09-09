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

export const BANNER_PRESETS: BannerPreset[] = [
  {
    id: 'jp-ink',
    kind: 'html',
    style: 'jp',
    title: '墨色',
    html: wrap(
      `background:linear-gradient(165deg,#1c1916 0%,#3a332c 42%,#8a6a3a 100%);color:#f3ead8;display:flex;align-items:flex-end;padding:28px 40px;font:700 22px/1.2 'Songti SC',serif"><span style="letter-spacing:.4em">和</span></div>`,
    ),
  },
  {
    id: 'jp-wave',
    kind: 'html',
    style: 'jp',
    title: '青海波',
    html: wrap(
      `background:#14222c;background-image:repeating-radial-gradient(circle at 0 80%,transparent 0 10px,#1e3a48 10px 12px);color:#d7efe8;display:flex;align-items:flex-end;padding:24px 36px;font:600 15px/1 ui-sans-serif,sans-serif;letter-spacing:.35em">SEIGAIHA</div>`,
    ),
  },
  {
    id: 'us-blue',
    kind: 'html',
    style: 'us',
    title: '刊头蓝',
    html: wrap(
      `display:flex;flex-direction:column;background:#0a0a0a;color:#fff;font-family:Helvetica Neue,Arial,sans-serif"><div style="background:#1c7cff;flex:1;display:flex;align-items:flex-end;padding:18px 28px;font-weight:900;font-size:28px;letter-spacing:-.03em">MASTHEAD</div><div style="height:8px;background:#ffd400"></div></div>`,
    ),
  },
  {
    id: 'us-stripe',
    kind: 'html',
    style: 'us',
    title: '条纹',
    html: wrap(
      `background:repeating-linear-gradient(90deg,#1a1a1a 0 28px,#222 28px 32px,#1c7cff 32px 36px);color:#f0efed;display:flex;align-items:flex-end;padding:24px 32px;font:800 18px/1 Helvetica Neue,Arial,sans-serif;letter-spacing:.2em">GRID</div>`,
    ),
  },
  {
    id: 'eu-wine',
    kind: 'html',
    style: 'eu',
    title: '酒红',
    html: wrap(
      `background:linear-gradient(180deg,#2a1218 0%,#5c2430 55%,#c4a574 100%);color:#f6ead4;display:flex;align-items:flex-end;justify-content:space-between;padding:28px 40px;font:italic 700 22px/1 Georgia,serif"><span>Atelier</span><span style="font-size:11px;letter-spacing:.28em;font-style:normal">EUROPE</span></div>`,
    ),
  },
  {
    id: 'eu-bauhaus',
    kind: 'html',
    style: 'eu',
    title: '构成',
    html: wrap(
      `background:#ece7dc;display:grid;grid-template-columns:1.4fr .8fr .6fr;height:100%"><div style="background:#111"></div><div style="background:#c43c1c"></div><div style="background:#1c4a9e"></div></div>`,
    ),
  },
  {
    id: 'cn-seal',
    kind: 'html',
    style: 'cn',
    title: '朱墨',
    html: wrap(
      `background:linear-gradient(120deg,#1a120e 0%,#4a1c16 50%,#c45a32 100%);color:#f6e6c8;display:flex;align-items:flex-end;padding:26px 36px;font:700 24px/1 'Songti SC',serif;letter-spacing:.5em">章</div>`,
    ),
  },
  {
    id: 'cn-window',
    kind: 'html',
    style: 'cn',
    title: '窗格',
    html: wrap(
      `background:#1b1410;background-image:linear-gradient(#7a2a1a 1px,transparent 1px),linear-gradient(90deg,#7a2a1a 1px,transparent 1px);background-size:28px 28px;color:#f0d9a8;display:flex;align-items:flex-end;padding:24px 32px;font:600 14px/1 ui-sans-serif,sans-serif;letter-spacing:.42em">窗</div>`,
    ),
  },
  {
    id: 'jp-live',
    kind: 'htmlframe',
    style: 'jp',
    title: '涟漪',
    html: `<div id="b" style="height:100%;background:#141a22"></div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.012;if(e)e.style.background='radial-gradient('+ (40+Math.sin(t)*12)+'% 80% at 20% 80%, #3d6a78, #141a22 '+ (42+Math.cos(t)*8)+'%)';requestAnimationFrame(f);}f();})()</script>`,
  },
  {
    id: 'jp-live-2',
    kind: 'htmlframe',
    style: 'jp',
    title: '岚',
    html: `<div id="b" style="height:100%;background:#1a1612"></div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.02;if(e)e.style.background='linear-gradient('+(t*18)+'deg,#1a1612,#5a4630,#1a1612)';requestAnimationFrame(f);}f();})()</script>`,
  },
  {
    id: 'us-live',
    kind: 'htmlframe',
    style: 'us',
    title: '脉冲',
    html: `<div id="b" style="height:100%;display:flex;align-items:flex-end;padding:20px 28px;color:#fff;font:900 26px Helvetica Neue,Arial,sans-serif;background:#1c7cff">LIVE</div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.04;if(e)e.style.filter='brightness('+(1+Math.sin(t)*0.12)+')';requestAnimationFrame(f);}f();})()</script>`,
  },
  {
    id: 'us-live-2',
    kind: 'htmlframe',
    style: 'us',
    title: '走带',
    html: `<div style="height:100%;overflow:hidden;background:#111;color:#ffd400;font:800 13px/240px Helvetica Neue,Arial,sans-serif;letter-spacing:.4em;white-space:nowrap"><div style="display:inline-block;animation:m 12s linear infinite">NEW YORK GRID · NIGHT ISSUE · NEW YORK GRID · NIGHT ISSUE · </div></div><style>@keyframes m{from{transform:translateX(0)}to{transform:translateX(-50%)}}</style>`,
  },
  {
    id: 'eu-live',
    kind: 'htmlframe',
    style: 'eu',
    title: '暮光',
    html: `<div id="b" style="height:100%;background:#2a1218"></div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.008;if(e)e.style.background='linear-gradient(180deg,#2a1218,'+('hsl('+(12+Math.sin(t)*8)+' 42% '+(28+Math.sin(t*1.3)*6)+'%)')+',#c4a574)';requestAnimationFrame(f);}f();})()</script>`,
  },
  {
    id: 'eu-live-2',
    kind: 'htmlframe',
    style: 'eu',
    title: '色块',
    html: `<div id="b" style="height:100%;display:grid;grid-template-columns:1fr 1fr 1fr"><i></i><i></i><i></i></div><style>#b i{display:block}#b i:nth-child(1){background:#111}#b i:nth-child(2){background:#c43c1c}#b i:nth-child(3){background:#1c4a9e}</style><script>(function(){var n=0,els=document.querySelectorAll('#b i');setInterval(function(){n=(n+1)%3;els.forEach(function(el,i){el.style.opacity=i===n?1:.55});},900);})()</script>`,
  },
  {
    id: 'cn-live',
    kind: 'htmlframe',
    style: 'cn',
    title: '朱砂',
    html: `<div id="b" style="height:100%;background:#4a1c16"></div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.015;if(e)e.style.background='radial-gradient(circle at '+ (50+Math.sin(t)*18)+'% 70%, #c45a32, #1a120e 62%)';requestAnimationFrame(f);}f();})()</script>`,
  },
  {
    id: 'cn-live-2',
    kind: 'htmlframe',
    style: 'cn',
    title: '墨晕',
    html: `<div id="b" style="height:100%;background:#1b1410"></div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.01;if(e)e.style.boxShadow='inset 0 0 '+(80+Math.sin(t)*40)+'px rgba(196,90,50,.35)';requestAnimationFrame(f);}f();})()</script>`,
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
