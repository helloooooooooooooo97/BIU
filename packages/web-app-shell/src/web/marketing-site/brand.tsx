import type { SiteAction } from './site-chrome.tsx'
import { SiteChrome } from './site-chrome.tsx'
import { BrandMark, BrandStudio, useBrandConfig } from './brand-mark.tsx'
import { usePageMeta } from './use-page-meta.ts'
import { useSiteLocale, type SiteLocale } from './locale.tsx'

const COPY: Record<
  SiteLocale,
  {
    metaTitle: string
    metaDescription: string
    label: string
    heading: string
    lead: string
    anatomyHeading: string
    anatomy: Array<{ title: string; body: string }>
    studioHeading: string
    studioNote: string
  }
> = {
  en: {
    metaTitle: 'Brand',
    metaDescription: 'The BIU brand mark, its construction rules, and an interactive color studio.',
    label: 'Brand',
    heading: 'One circle, two lines, three segments',
    lead: 'The mark is the name itself: the two upper-right segments form the two bowls of B, the diagonal running through them is I, and the lower-left semicircle is U. Together, B, I, and U make this shape. Adjust the colors and lines below to create your own version.',
    anatomyHeading: 'Construction',
    anatomy: [
      {
        title: 'One circle',
        body: 'The closed circle is a page—software, data, and people all live inside it, within a clear boundary.',
      },
      {
        title: 'Two lines',
        body: 'One diagonal crosses the center and divides the circle in two; a shorter line reaches toward the upper right and splits that half again. The structure is not an imposed frame—it is carved from the content itself.',
      },
      {
        title: 'Three segments',
        body: 'The two upper segments of the B represent a private space and a public space; the U below is the foundation that supports them both.',
      },
      {
        title: 'Three give rise to everything',
        body: 'The three segments are fixed; their colors and lines are not. The same mark can become uniquely yours—a thousand people can have a thousand versions of BIU.',
      },
    ],
    studioHeading: 'Define my BIU',
    studioNote: 'Give each segment its own color and control each line weight independently.',
  },
  zh: {
    metaTitle: '品牌',
    metaDescription: 'BIU 的品牌标记、构成规则与可交互的颜色调节器。',
    label: '品牌',
    heading: '一个圆、两条线、三个块',
    lead: '标记本身就是名字：右上的两个小块是 B 的两个弧，贯穿的斜线是 I，左下的半圆是 U，B、I、U 三个字母刚好拼成这个形状。下面的颜色和线条都可以调，调成你自己的版本。',
    anatomyHeading: '构成',
    anatomy: [
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
    ],
    studioHeading: '定义我的 BIU',
    studioNote: '三块各一个颜色，线条粗细可以单独控制。',
  },
}

export function MarketingBrand({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  const { locale } = useSiteLocale()
  const copy = COPY[locale]
  // 顶部这枚标记与下方调节器共用同一份配置：调什么，上面立刻跟着变。
  const brand = useBrandConfig()
  usePageMeta({
    title: copy.metaTitle,
    description: copy.metaDescription,
    path: '/brand',
  })

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
      <section className="site-page-hero" data-reveal>
        <p className="site-section-label">{copy.label}</p>
        <h1>{copy.heading}</h1>
        <p className="site-page-lead">{copy.lead}</p>
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
        <h2>{copy.anatomyHeading}</h2>
        <div className="site-brand-grid">
          {copy.anatomy.map((item) => (
            <article key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="site-brand-studio" data-reveal>
        <h2>{copy.studioHeading}</h2>
        <p className="site-brand-note">{copy.studioNote}</p>
        <BrandStudio />
      </section>
    </SiteChrome>
  )
}
