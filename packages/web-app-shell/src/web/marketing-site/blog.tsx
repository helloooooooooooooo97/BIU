import { Link, useParams } from 'react-router-dom'
import { SiteChrome, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'
import { BLOG_AUTHOR, BLOG_POSTS, readingMinutes, type Paragraph } from './blog-posts.ts'

export { BLOG_AUTHOR, BLOG_POSTS, readingMinutes }
export type { BlogPost } from './blog-posts.ts'

function PostDate({ date }: { date: string }) {
  return <time dateTime={date}>{date.replace(/-/g, '.')}</time>
}

const DIAGRAM_TEXT = { fill: '#fff', fontSize: 14, textAnchor: 'middle' as const }
const DIAGRAM_DIM = { fill: 'rgba(255,255,255,.6)', fontSize: 12, textAnchor: 'middle' as const }
const DIAGRAM_BOX = { fill: '#0f0f0f', stroke: 'rgba(255,255,255,.28)', rx: 12 }

function PageEnvDiagram() {
  return (
    <svg viewBox="0 0 640 260" role="img" aria-label="一个插件挂在页 A 和页 B 上，读到不同的属性">
      <rect x="230" y="16" width="180" height="56" {...DIAGRAM_BOX} />
      <text x="320" y="41" {...DIAGRAM_TEXT}>算法题卡片</text>
      <text x="320" y="60" {...DIAGRAM_DIM}>一份插件代码</text>
      <path d="M290 72 160 140M350 72 480 140" stroke="rgba(255,255,255,.4)" fill="none" />
      <rect x="40" y="140" width="240" height="96" {...DIAGRAM_BOX} />
      <text x="160" y="168" {...DIAGRAM_TEXT}>页 A · 入门练习</text>
      <text x="160" y="192" {...DIAGRAM_DIM}>tags: easy, python</text>
      <text x="160" y="216" {...DIAGRAM_DIM}>→ 出简单题，Python 模板</text>
      <rect x="360" y="140" width="240" height="96" {...DIAGRAM_BOX} />
      <text x="480" y="168" {...DIAGRAM_TEXT}>页 B · 算法冲刺</text>
      <text x="480" y="192" {...DIAGRAM_DIM}>tags: hard, rust</text>
      <text x="480" y="216" {...DIAGRAM_DIM}>→ 出难题，Rust 模板</text>
    </svg>
  )
}

const ATOMS = ['路径', '表', '记录', 'schema', '操作', 'blurb'] as const
const ENTITIES = ['任务', '页面', '插件', '会话', '技能', '合集'] as const

function AtomsDiagram() {
  return (
    <svg viewBox="0 0 640 220" role="img" aria-label="六种原子组合出任务、页面、插件、会话、技能、合集">
      {ATOMS.map((atom, i) => (
        <g key={atom}>
          <rect x={20 + i * 102} y="20" width="88" height="44" {...DIAGRAM_BOX} />
          <text x={64 + i * 102} y="47" {...DIAGRAM_TEXT}>{atom}</text>
        </g>
      ))}
      <path d="M320 72v44" stroke="rgba(255,255,255,.4)" />
      <text x="336" y="100" {...DIAGRAM_DIM} textAnchor="start">组合</text>
      {ENTITIES.map((entity, i) => (
        <g key={entity}>
          <rect x={20 + i * 102} y="124" width="88" height="44" rx="12" fill="rgba(255,255,255,.06)" />
          <text x={64 + i * 102} y="151" {...DIAGRAM_TEXT}>{entity}</text>
        </g>
      ))}
      <text x="320" y="200" {...DIAGRAM_DIM}>同一套 db_list / db_read / db_update / db_create</text>
    </svg>
  )
}

function ArticleParagraph({ paragraph }: { paragraph: Paragraph }) {
  if (typeof paragraph === 'string') return <p>{paragraph}</p>
  if ('code' in paragraph) return <pre><code>{paragraph.code}</code></pre>
  if ('image' in paragraph) {
    return (
      <figure className="site-article-figure">
        <img src={paragraph.image} alt={paragraph.alt} loading="lazy" decoding="async" />
        <figcaption>{paragraph.caption}</figcaption>
      </figure>
    )
  }
  return (
    <figure className="site-article-figure site-article-diagram">
      {paragraph.diagram === 'page-env' ? <PageEnvDiagram /> : <AtomsDiagram />}
      <figcaption>{paragraph.caption}</figcaption>
    </figure>
  )
}

/** 博客总览 */
export function MarketingBlog({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: '博客',
    description: 'BIU 的设计理念：用页面组合软件、页面即边界、更少的原子、让工作留下来、开源与透明。',
    path: '/blog',
  })
  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
      <section className="site-page-hero" data-reveal>
        <p className="site-section-label">博客</p>
        <h1>BIU 是怎么想的</h1>
        <p className="site-page-lead">关于 All in One、页面与插件、智能体和开源的几篇长文。先读第一篇，就知道 BIU 为什么长成现在这样。</p>
      </section>

      <section className="site-blog-list" aria-label="文章">
        {BLOG_POSTS.map((post, index) => (
          <Link key={post.slug} to={`/blog/${post.slug}`} className="site-blog-item" data-reveal>
            <span className="site-blog-index">{String(index + 1).padStart(2, '0')}</span>
            <div>
              <h2>{post.title}</h2>
              <p>{post.summary}</p>
            </div>
            <PostDate date={post.date} />
          </Link>
        ))}
      </section>

      <SiteFinalCta title="读完了，亲手试一页" />
    </SiteChrome>
  )
}

/** 博客文章页 */
export function MarketingBlogPost({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  const { slug } = useParams<{ slug: string }>()
  const index = BLOG_POSTS.findIndex((item) => item.slug === slug)
  const post = BLOG_POSTS[index]
  usePageMeta({
    title: post?.title ?? '博客',
    description: post?.summary ?? 'BIU 的设计理念。',
    path: `/blog/${slug ?? ''}`,
  })

  if (!post) {
    return (
      <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero">
          <p className="site-section-label">博客</p>
          <h1>没有这篇文章</h1>
          <p className="site-page-lead"><Link to="/blog">返回博客</Link></p>
        </section>
      </SiteChrome>
    )
  }

  const next = BLOG_POSTS[(index + 1) % BLOG_POSTS.length]!

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
      <article className="site-article">
        <header className="site-article-head" data-reveal>
          <p className="site-section-label"><Link to="/blog">博客</Link> · <PostDate date={post.date} /></p>
          <h1>{post.title}</h1>
          <p className="site-page-lead">{post.summary}</p>
          <p className="site-article-byline">
            <span className="site-article-avatar" aria-hidden>B</span>
            <span>{BLOG_AUTHOR.name}</span>
            <span>约 {readingMinutes(post)} 分钟读完</span>
            <a href={`mailto:${BLOG_AUTHOR.email}`}>写信给我们</a>
          </p>
        </header>
        <div className="site-article-body">
          {post.sections.map((section, i) => (
            <section key={section.heading ?? i}>
              {section.heading ? <h2>{section.heading}</h2> : null}
              {section.body.map((paragraph, j) => <ArticleParagraph key={j} paragraph={paragraph} />)}
            </section>
          ))}
        </div>
        <nav className="site-article-next" aria-label="下一篇">
          <span>下一篇</span>
          <Link to={`/blog/${next.slug}`}>{next.title} →</Link>
        </nav>
      </article>

      <SiteFinalCta title="读完了，亲手试一页" />
    </SiteChrome>
  )
}
