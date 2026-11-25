import { Link, useParams } from 'react-router-dom'
import { SiteChrome, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'
import { BLOG_AUTHOR, BLOG_POSTS, BLOG_SERIES, readingMinutes, type Paragraph } from './blog-posts.ts'
import { ZH_BLOG_AUTHOR, ZH_BLOG_POSTS, ZH_BLOG_SERIES } from './zh/blog-posts.ts'
import { HighlightedCode, renderInlineText } from './blog-format.tsx'
import { VisionTable } from './invest.tsx'
import { asset } from './site-base.ts'
import { useSiteLocale, type SiteLocale } from './locale.tsx'

export { BLOG_AUTHOR, BLOG_POSTS, readingMinutes }
export type { BlogPost } from './blog-posts.ts'

function PostDate({ date }: { date: string }) {
  return <time dateTime={date}>{date.replace(/-/g, '.')}</time>
}

const DIAGRAM_TEXT = { fill: '#fff', fontSize: 14, textAnchor: 'middle' as const }
const DIAGRAM_DIM = { fill: 'rgba(255,255,255,.6)', fontSize: 12, textAnchor: 'middle' as const }
const DIAGRAM_BOX = { fill: '#0f0f0f', stroke: 'rgba(255,255,255,.28)', rx: 12 }

const PAGE_ENV_COPY: Record<
  SiteLocale,
  {
    ariaLabel: string
    pluginTitle: string
    pluginSub: string
    pageATitle: string
    pageADesc: string
    pageBTitle: string
    pageBDesc: string
  }
> = {
  en: {
    ariaLabel: 'One plugin attached to pages A and B reads different properties',
    pluginTitle: 'Coding challenge card',
    pluginSub: 'One plugin codebase',
    pageATitle: 'Page A · Beginner practice',
    pageADesc: '→ Easy problems, Python template',
    pageBTitle: 'Page B · Algorithm sprint',
    pageBDesc: '→ Hard problems, Rust template',
  },
  zh: {
    ariaLabel: '一个插件挂在页 A 和页 B 上，读到不同的属性',
    pluginTitle: '算法题卡片',
    pluginSub: '一份插件代码',
    pageATitle: '页 A · 入门练习',
    pageADesc: '→ 出简单题，Python 模板',
    pageBTitle: '页 B · 算法冲刺',
    pageBDesc: '→ 出难题，Rust 模板',
  },
}

function PageEnvDiagram({ locale }: { locale: SiteLocale }) {
  const c = PAGE_ENV_COPY[locale]
  return (
    <svg viewBox="0 0 640 260" role="img" aria-label={c.ariaLabel}>
      <rect x="230" y="16" width="180" height="56" {...DIAGRAM_BOX} />
      <text x="320" y="41" {...DIAGRAM_TEXT}>{c.pluginTitle}</text>
      <text x="320" y="60" {...DIAGRAM_DIM}>{c.pluginSub}</text>
      <path d="M290 72 160 140M350 72 480 140" stroke="rgba(255,255,255,.4)" fill="none" />
      <rect x="40" y="140" width="240" height="96" {...DIAGRAM_BOX} />
      <text x="160" y="168" {...DIAGRAM_TEXT}>{c.pageATitle}</text>
      <text x="160" y="192" {...DIAGRAM_DIM}>tags: easy, python</text>
      <text x="160" y="216" {...DIAGRAM_DIM}>{c.pageADesc}</text>
      <rect x="360" y="140" width="240" height="96" {...DIAGRAM_BOX} />
      <text x="480" y="168" {...DIAGRAM_TEXT}>{c.pageBTitle}</text>
      <text x="480" y="192" {...DIAGRAM_DIM}>tags: hard, rust</text>
      <text x="480" y="216" {...DIAGRAM_DIM}>{c.pageBDesc}</text>
    </svg>
  )
}

const ATOMS_COPY: Record<
  SiteLocale,
  {
    ariaLabel: string
    atoms: readonly string[]
    entities: readonly string[]
    combine: string
    footer: string
  }
> = {
  en: {
    ariaLabel: 'Six atoms combine into tasks, pages, plugins, sessions, skills, and collections',
    atoms: ['path', 'table', 'record', 'schema', 'operation', 'blurb'],
    entities: ['task', 'page', 'plugin', 'session', 'skill', 'collection'],
    combine: 'combine',
    footer: 'One set: db_list / db_read / db_update / db_create',
  },
  zh: {
    ariaLabel: '六种原子组合出任务、页面、插件、代理、技能、标签',
    atoms: ['路径', '表', '记录', 'schema', '操作', 'blurb'],
    entities: ['任务', '页面', '插件', '代理', '技能', '标签'],
    combine: '组合',
    footer: '同一套 db_list / db_read / db_update / db_create',
  },
}

function AtomsDiagram({ locale }: { locale: SiteLocale }) {
  const c = ATOMS_COPY[locale]
  return (
    <svg viewBox="0 0 640 220" role="img" aria-label={c.ariaLabel}>
      {c.atoms.map((atom, i) => (
        <g key={atom}>
          <rect x={20 + i * 102} y="20" width="88" height="44" {...DIAGRAM_BOX} />
          <text x={64 + i * 102} y="47" {...DIAGRAM_TEXT}>{atom}</text>
        </g>
      ))}
      <path d="M320 72v44" stroke="rgba(255,255,255,.4)" />
      <text x="336" y="100" {...DIAGRAM_DIM} textAnchor="start">{c.combine}</text>
      {c.entities.map((entity, i) => (
        <g key={entity}>
          <rect x={20 + i * 102} y="124" width="88" height="44" rx="12" fill="rgba(255,255,255,.06)" />
          <text x={64 + i * 102} y="151" {...DIAGRAM_TEXT}>{entity}</text>
        </g>
      ))}
      <text x="320" y="200" {...DIAGRAM_DIM}>{c.footer}</text>
    </svg>
  )
}

function ArticleParagraph({ paragraph, locale }: { paragraph: Paragraph; locale: SiteLocale }) {
  if (typeof paragraph === 'string') return <p>{renderInlineText(paragraph)}</p>
  if ('code' in paragraph) return <HighlightedCode code={paragraph.code} />
  if ('image' in paragraph) {
    return (
      <figure className="site-article-figure">
        <img src={asset(paragraph.image)} alt={paragraph.alt} loading="lazy" decoding="async" />
        <figcaption>{paragraph.caption}</figcaption>
      </figure>
    )
  }
  if (paragraph.diagram === 'vision-table') {
    return (
      <figure className="site-article-figure">
        <VisionTable />
        <figcaption>{paragraph.caption}</figcaption>
      </figure>
    )
  }
  return (
    <figure className="site-article-figure site-article-diagram">
      {paragraph.diagram === 'page-env' ? <PageEnvDiagram locale={locale} /> : <AtomsDiagram locale={locale} />}
      <figcaption>{paragraph.caption}</figcaption>
    </figure>
  )
}

const BLOG_COPY: Record<
  SiteLocale,
  {
    label: string
    listMetaDescription: string
    listHeading: string
    epigraph: string
    epigraphCite: string
    listLead: string
    listAriaLabel: string
    listMinutes: (mins: number) => string
    ctaTitle: string
    fallbackDescription: string
    notFoundTitle: string
    notFoundBack: string
    postMinutes: (mins: number) => string
    emailUs: string
    refsHeading: string
    nextArticle: string
  }
> = {
  en: {
    label: 'Philosophy',
    listMetaDescription: 'How BIU thinks about composing software with pages, page boundaries, fewer primitives, durable work, open source, and transparency.',
    listHeading: 'On the next medium for software',
    epigraph: 'The medium is the message',
    epigraphCite: 'Marshall McLuhan',
    listLead: 'From All in One and page boundaries to how software is built, stored, composed, distributed, and derived—long-form essays on BIU’s product and architectural principles.',
    listAriaLabel: 'Articles',
    listMinutes: (mins) => `${mins} min read`,
    ctaTitle: 'Start with BIU',
    fallbackDescription: 'The design philosophy behind BIU.',
    notFoundTitle: 'Article not found',
    notFoundBack: 'Back to philosophy',
    postMinutes: (mins) => `${mins} min read`,
    emailUs: 'Email us',
    refsHeading: 'References',
    nextArticle: 'Next article',
  },
  zh: {
    label: '理念',
    listMetaDescription: 'BIU 的设计理念：用页面组合软件、页面即边界、更少的原子、让工作留下来、开源与透明。',
    listHeading: '关于下一代软件媒介的思考',
    epigraph: '媒介即讯息',
    epigraphCite: '马歇尔·麦克卢汉',
    listLead: '从 All in One、页面边界，到软件的构建、存储、组合、分发与衍生，系统阐述 BIU 背后的产品判断与架构演进。',
    listAriaLabel: '文章',
    listMinutes: (mins) => `约 ${mins} 分钟`,
    ctaTitle: '开始使用 BIU',
    fallbackDescription: 'BIU 的设计理念。',
    notFoundTitle: '没有这篇文章',
    notFoundBack: '返回理念总览',
    postMinutes: (mins) => `约 ${mins} 分钟读完`,
    emailUs: '写信给我们',
    refsHeading: '参考资料',
    nextArticle: '下一篇',
  },
}

/** 博客总览 */
export function MarketingBlog({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  const { locale } = useSiteLocale()
  const copy = BLOG_COPY[locale]
  const seriesList = locale === 'zh' ? ZH_BLOG_SERIES : BLOG_SERIES
  const posts = locale === 'zh' ? ZH_BLOG_POSTS : BLOG_POSTS

  usePageMeta({
    title: copy.label,
    description: copy.listMetaDescription,
    path: '/blog',
  })
  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
      <section className="site-page-hero" data-reveal>
        <p className="site-section-label">{copy.label}</p>
        <h1>{copy.listHeading}</h1>
        <p className="site-hero-epigraph">
          <span>{copy.epigraph}</span>
          <cite>{copy.epigraphCite}</cite>
        </p>
        <p className="site-page-lead">{copy.listLead}</p>
      </section>

      <section className="site-blog-list" aria-label={copy.listAriaLabel}>
        {seriesList.map((series) => {
          const items = posts.filter((post) => post.series === series.id)
          return (
            <div key={series.id} className="site-blog-group" data-reveal>
              <div className="site-blog-group-head">
                <h2>{series.title}</h2>
                <p>{series.lead}</p>
              </div>
              {items.map((post, index) => (
                <Link key={post.slug} to={`/blog/${post.slug}`} className="site-blog-item">
                  <span className="site-blog-index">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <h3>{post.title}</h3>
                    <p>{post.summary}</p>
                  </div>
                  <span className="site-blog-meta">
                    <PostDate date={post.date} />
                    <small>{copy.listMinutes(readingMinutes(post, locale))}</small>
                  </span>
                </Link>
              ))}
            </div>
          )
        })}
      </section>

      <SiteFinalCta title={copy.ctaTitle} />
    </SiteChrome>
  )
}

/** 博客文章页 */
export function MarketingBlogPost({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  const { locale } = useSiteLocale()
  const copy = BLOG_COPY[locale]
  const posts = locale === 'zh' ? ZH_BLOG_POSTS : BLOG_POSTS
  const author = locale === 'zh' ? ZH_BLOG_AUTHOR : BLOG_AUTHOR
  const { slug } = useParams<{ slug: string }>()
  const index = posts.findIndex((item) => item.slug === slug)
  const post = posts[index]
  usePageMeta({
    title: post?.title ?? copy.label,
    description: post?.summary ?? copy.fallbackDescription,
    path: `/blog/${slug ?? ''}`,
  })

  if (!post) {
    return (
      <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero">
          <p className="site-section-label">{copy.label}</p>
          <h1>{copy.notFoundTitle}</h1>
          <p className="site-page-lead"><Link to="/blog">{copy.notFoundBack}</Link></p>
        </section>
      </SiteChrome>
    )
  }

  const next = posts[(index + 1) % posts.length]!

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
      <article className="site-article">
        <header className="site-article-head" data-reveal>
          <p className="site-section-label"><Link to="/blog">{copy.label}</Link> · <PostDate date={post.date} /></p>
          <h1>{post.title}</h1>
          <p className="site-page-lead">{post.summary}</p>
          <p className="site-article-byline">
            <span className="site-article-avatar" aria-hidden>B</span>
            <span>{author.name}</span>
            <span>{copy.postMinutes(readingMinutes(post, locale))}</span>
            <a href={`mailto:${author.email}`}>{copy.emailUs}</a>
          </p>
        </header>
        <div className="site-article-body">
          {post.sections.map((section, i) => (
            <section key={section.heading ?? i}>
              {section.heading ? <h2>{renderInlineText(section.heading)}</h2> : null}
              {section.body.map((paragraph, j) => <ArticleParagraph key={j} paragraph={paragraph} locale={locale} />)}
            </section>
          ))}
        </div>
        {post.references?.length ? (
          <section className="site-article-refs" aria-label={copy.refsHeading}>
            <h2>{copy.refsHeading}</h2>
            <ol>
              {post.references.map((ref, i) => (
                <li key={ref.url} id={`ref-${i + 1}`}>
                  <a href={ref.url} target="_blank" rel="noreferrer">
                    {ref.title}
                  </a>
                  <span>
                    {ref.publisher} · {ref.year}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        <nav className="site-article-next" aria-label={copy.nextArticle}>
          <span>{copy.nextArticle}</span>
          <Link to={`/blog/${next.slug}`}>{next.title} →</Link>
        </nav>
      </article>

      <SiteFinalCta title={copy.ctaTitle} />
    </SiteChrome>
  )
}
