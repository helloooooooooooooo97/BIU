import type { SiteAction } from './site-chrome.tsx'
import { SiteChrome } from './site-chrome.tsx'
import { BrandMark, BrandStudio, useBrandConfig } from './brand-mark.tsx'
import { usePageMeta } from './use-page-meta.ts'

const ANATOMY = [
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
]

export function MarketingBrand({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  // 顶部这枚标记与下方调节器共用同一份配置：调什么，上面立刻跟着变。
  const brand = useBrandConfig()
  usePageMeta({
    title: 'Brand',
    description: 'The BIU brand mark, its construction rules, and an interactive color studio.',
    path: '/brand',
  })

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
      <section className="site-page-hero" data-reveal>
        <p className="site-section-label">Brand</p>
        <h1>One circle, two lines, three segments</h1>
        <p className="site-page-lead">
          The mark is the name itself: the two upper-right segments form the two bowls of B, the diagonal
          running through them is I, and the lower-left semicircle is U. Together, B, I, and U make this
          shape. Adjust the colors and lines below to create your own version.
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
        <h2>Construction</h2>
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
        <h2>Define my BIU</h2>
        <p className="site-brand-note">Give each segment its own color and control each line weight independently.</p>
        <BrandStudio />
      </section>
    </SiteChrome>
  )
}
