import { Link } from 'react-router-dom'
import type { SiteAction } from './site-chrome.tsx'
import { SiteChrome } from './site-chrome.tsx'
import { BrandMark, BrandStudio, useBrandConfig } from './brand-mark.tsx'
import { usePageMeta } from './use-page-meta.ts'

const ANATOMY = [
  {
    title: '一个圆',
    body: '闭合的圆，是空间本身 —— 知识与工作发生的地方，边界清楚。',
  },
  {
    title: '两条弦',
    body: '两条弦切进圆里，把一个整体分成可命名的块。结构不是外加的框，是从内容里切出来的。',
  },
  {
    title: '三个块',
    body: '切开后得到三个块：右上、右下两个小的，和下方一个大的。它们刚好拼成 B、I、U 三个字母 —— 标记本身就是名字。',
  },
  {
    title: '三生万物',
    body: '三块是固定的，颜色和线条不是。同一个标记可以长成每个人自己的样子 —— 一千个人有一千个自己的 BIU。',
  },
]

/**
 * 三块各是什么。
 * 方位按实际几何：B 在右上、I 在右下、U 占下方半圆。
 * 「本地 / 云端 / 底座」是产品上的约定，不是形状自带的含义 ——
 * 文案里要说明这一点，别把它讲成「图形天然如此」。
 */
const FACETS = [
  {
    letter: 'B',
    where: '右上',
    title: '本地空间',
    body: '数据躺在你自己的机器上。离线也能读写，不经过任何服务器。',
  },
  {
    letter: 'I',
    where: '右下',
    title: '云端空间',
    body: '同一套接口，数据放在云端。协作、共享、跨设备都在这里发生。',
  },
  {
    letter: 'U',
    where: '下方',
    title: '公共底座',
    body: '最大的一块，托住上面两块。无论数据在哪，都在同一套接口与权限之下 —— 这是标记真正的主张。',
  },
]

const RULES = [
  '最小尺寸：正文里不小于 24px，导航与图标位不小于 20px。',
  '留白：四周至少留出圆半径 1/4 的空白，不要把别的元素贴上去。',
  '单色场景：三块可以取同一颜色的不同明度，但不要用渐变替代分块。',
  '不要旋转、不要拉伸。圆的形状本身承载识别度。',
  '底色深时用白色描边；底色浅时需要提高描边对比（见下方调节器）。',
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
        <h1>一个圆、两条弦、三个块。</h1>
        <p className="site-page-lead">
          标记不是装饰。它说明 BIU 是什么：一个整体的空间，被结构切成可命名的部分，
          但每一部分都还在同一个圆里。下面的颜色和线条都可以调 —— 这是你的空间，不是我们的。
        </p>
      </section>

      <section className="site-brand-hero" data-reveal>
        <BrandMark
          colors={[brand.c0, brand.c1, brand.c2]}
          stroke={brand.stroke}
          strokeWidth={brand.strokeWidth}
          lineWidth={brand.lineWidth}
          background={brand.background}
          showBackground={brand.showBackground}
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

      <section className="site-brand-facets" data-reveal>
        <h2>三块，三个字母，三层意思</h2>
        <p className="site-brand-note">
          形状上它们是 B、I、U 三个字母；产品上它们各是一层空间。
          字母是三块拼出来的，寓意是我们给这三块的分工 —— 前者是形状，后者是约定。
        </p>
        <div className="site-brand-facet-grid">
          {FACETS.map((facet) => (
            <article key={facet.letter}>
              <p className="site-brand-facet-letter" aria-hidden>
                {facet.letter}
              </p>
              <h3>
                {facet.title}
                <span className="site-brand-facet-where">{facet.where}</span>
              </h3>
              <p>{facet.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="site-brand-studio" data-reveal>
        <h2>定义我的 BIU</h2>
        <p className="site-brand-note">
          三块各一个颜色，线条粗细可以单独控制。改完的样子可以直接拿去用。
        </p>
        <BrandStudio />
      </section>

      <section className="site-brand-rules" data-reveal>
        <h2>使用规则</h2>
        <ul>
          {RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        <p className="site-brand-back">
          <Link to="/product">看看产品怎么用这套标记 →</Link>
        </p>
      </section>
    </SiteChrome>
  )
}
