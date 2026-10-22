import type { SiteAction } from './site-chrome.tsx'
import { SiteChrome } from './site-chrome.tsx'
import { BrandMark, BrandStudio, useBrandConfig } from './brand-mark.tsx'
import { usePageMeta } from './use-page-meta.ts'

const ANATOMY = [
  {
    title: '一个圆',
    body: '闭合的圆是一个页面 —— 软件、数据和人都在里面，边界清楚。',
  },
  {
    title: '两条线',
    body: '一条斜线贯穿圆心，把圆分成两半；一条短线从圆心伸向右上，把那一半再分成两块。结构不是外加的框，是从内容里切出来的。',
  },
  {
    title: '三个块',
    body: '上方 B 的两块，一块是私人空间，一块是公共空间；下方的 U 是底座，稳稳承托起这两个空间。',
  },
  {
    title: '三生万物',
    body: '三块是固定的，颜色和线条不是。同一个标记可以长成每个人自己的样子 —— 一千个人有一千个自己的 BIU。',
  },
]

export function MarketingBrand({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  // 顶部这枚标记与下方调节器共用同一份配置：调什么，上面立刻跟着变。
  const brand = useBrandConfig()
  usePageMeta({
    title: '品牌',
    description: 'BIU 的品牌标记、构成规则与可交互的颜色调节器。',
    path: '/brand',
  })

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
      <section className="site-page-hero" data-reveal>
        <p className="site-section-label">品牌</p>
        <h1>一个圆、两条线、三个块</h1>
        <p className="site-page-lead">
          标记本身就是名字：右上的两个小块是 B 的两个弧，贯穿的斜线是 I，左下的半圆是 U，
          B、I、U 三个字母刚好拼成这个形状。下面的颜色和线条都可以调，调成你自己的版本。
        </p>
      </section>

      <section className="site-brand-hero" data-reveal>
        <BrandMark
          colors={[brand.c0, brand.c1, brand.c2]}
          stroke={brand.stroke}
          strokeWidth={brand.strokeWidth}
          lineWidth={brand.lineWidth}
          background={brand.background}
          showBackground={false}
          circleRatio={brand.circleRatio}
          // 与 .site-brand-hero svg 的 min(420px, 70vw) 对应，供线条保底换算。
          displayWidth={420}
        />
      </section>

      <section className="site-brand-anatomy" data-reveal>
        <h2>构成</h2>
        <div className="site-brand-grid">
          {ANATOMY.map((item) => (
            <article key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="site-brand-studio" data-reveal>
        <h2>定义我的 BIU</h2>
        <p className="site-brand-note">三块各一个颜色，线条粗细可以单独控制。</p>
        <BrandStudio />
      </section>
    </SiteChrome>
  )
}
