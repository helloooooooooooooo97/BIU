import { Link, useParams } from 'react-router-dom'
import { SiteChrome, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'
import { BLOG_AUTHOR, BLOG_POSTS, readingMinutes, type Paragraph } from './blog-posts.ts'
import { asset } from './site-base.ts'

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
    <svg viewBox="0 0 640 260" role="img" aria-label="One plugin attached to pages A and B reads different properties">
      <rect x="230" y="16" width="180" height="56" {...DIAGRAM_BOX} />
      <text x="320" y="41" {...DIAGRAM_TEXT}>Coding challenge card</text>
      <text x="320" y="60" {...DIAGRAM_DIM}>One plugin codebase</text>
      <path d="M290 72 160 140M350 72 480 140" stroke="rgba(255,255,255,.4)" fill="none" />
      <rect x="40" y="140" width="240" height="96" {...DIAGRAM_BOX} />
      <text x="160" y="168" {...DIAGRAM_TEXT}>Page A · Beginner practice</text>
      <text x="160" y="192" {...DIAGRAM_DIM}>tags: easy, python</text>
      <text x="160" y="216" {...DIAGRAM_DIM}>→ Easy problems, Python template</text>
      <rect x="360" y="140" width="240" height="96" {...DIAGRAM_BOX} />
      <text x="480" y="168" {...DIAGRAM_TEXT}>Page B · Algorithm sprint</text>
      <text x="480" y="192" {...DIAGRAM_DIM}>tags: hard, rust</text>
      <text x="480" y="216" {...DIAGRAM_DIM}>→ Hard problems, Rust template</text>
    </svg>
  )
}

const ATOMS = ['path', 'table', 'record', 'schema', 'operation', 'blurb'] as const
const ENTITIES = ['task', 'page', 'plugin', 'session', 'skill', 'collection'] as const

function AtomsDiagram() {
  return (
    <svg viewBox="0 0 640 220" role="img" aria-label="Six atoms combine into tasks, pages, plugins, sessions, skills, and collections">
      {ATOMS.map((atom, i) => (
        <g key={atom}>
          <rect x={20 + i * 102} y="20" width="88" height="44" {...DIAGRAM_BOX} />
          <text x={64 + i * 102} y="47" {...DIAGRAM_TEXT}>{atom}</text>
        </g>
      ))}
      <path d="M320 72v44" stroke="rgba(255,255,255,.4)" />
      <text x="336" y="100" {...DIAGRAM_DIM} textAnchor="start">combine</text>
      {ENTITIES.map((entity, i) => (
        <g key={entity}>
          <rect x={20 + i * 102} y="124" width="88" height="44" rx="12" fill="rgba(255,255,255,.06)" />
          <text x={64 + i * 102} y="151" {...DIAGRAM_TEXT}>{entity}</text>
        </g>
      ))}
      <text x="320" y="200" {...DIAGRAM_DIM}>One set: db_list / db_read / db_update / db_create</text>
    </svg>
  )
}

function ArticleParagraph({ paragraph }: { paragraph: Paragraph }) {
  if (typeof paragraph === 'string') return <p>{paragraph}</p>
  if ('code' in paragraph) return <pre><code>{paragraph.code}</code></pre>
  if ('image' in paragraph) {
    return (
      <figure className="site-article-figure">
        <img src={asset(paragraph.image)} alt={paragraph.alt} loading="lazy" decoding="async" />
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
    title: 'Blog',
    description: 'How BIU thinks about composing software with pages, page boundaries, fewer primitives, durable work, open source, and transparency.',
    path: '/blog',
  })
  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
      <section className="site-page-hero" data-reveal>
        <p className="site-section-label">Blog</p>
        <h1>How BIU thinks</h1>
        <p className="site-page-lead">Long-form essays on All in One, pages and plugins, agents, and open source. Start with the first to understand why BIU took its present shape.</p>
      </section>

      <section className="site-blog-list" aria-label="Articles">
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

      <SiteFinalCta title="Finished reading? Try a page yourself" />
    </SiteChrome>
  )
}

/** 博客文章页 */
export function MarketingBlogPost({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  const { slug } = useParams<{ slug: string }>()
  const index = BLOG_POSTS.findIndex((item) => item.slug === slug)
  const post = BLOG_POSTS[index]
  usePageMeta({
    title: post?.title ?? 'Blog',
    description: post?.summary ?? 'The design philosophy behind BIU.',
    path: `/blog/${slug ?? ''}`,
  })

  if (!post) {
    return (
      <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero">
          <p className="site-section-label">Blog</p>
          <h1>Article not found</h1>
          <p className="site-page-lead"><Link to="/blog">Back to the blog</Link></p>
        </section>
      </SiteChrome>
    )
  }

  const next = BLOG_POSTS[(index + 1) % BLOG_POSTS.length]!

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
      <article className="site-article">
        <header className="site-article-head" data-reveal>
          <p className="site-section-label"><Link to="/blog">Blog</Link> · <PostDate date={post.date} /></p>
          <h1>{post.title}</h1>
          <p className="site-page-lead">{post.summary}</p>
          <p className="site-article-byline">
            <span className="site-article-avatar" aria-hidden>B</span>
            <span>{BLOG_AUTHOR.name}</span>
            <span>{readingMinutes(post)} min read</span>
            <a href={`mailto:${BLOG_AUTHOR.email}`}>Email us</a>
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
        {post.references?.length ? (
          <section className="site-article-refs" aria-label="References">
            <h2>References</h2>
            <ol>
              {post.references.map((ref) => (
                <li key={ref.url}>
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
        <nav className="site-article-next" aria-label="Next article">
          <span>Next article</span>
          <Link to={`/blog/${next.slug}`}>{next.title} →</Link>
        </nav>
      </article>

      <SiteFinalCta title="Finished reading? Try a page yourself" />
    </SiteChrome>
  )
}
