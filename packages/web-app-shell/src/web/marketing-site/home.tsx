import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DownloadIcon, GitHubButton, SiteChrome, SiteFaq, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'
import { asset } from './site-base.ts'
import { USE_CASES } from './use-cases.tsx'
import { COMPARE_FEATURED, COMPARE_PAGES } from './compare.tsx'
import { BLOG_POSTS, readingMinutes } from './blog-posts.ts'
import { BrandMark, useBrandConfig } from './brand-mark.tsx'
import { INVEST_MAIL, VisionTable } from './invest.tsx'

/**
 * 真实界面：BIU 的截图 / 录屏（public/site/），按 2–3 倍像素拍摄，2 倍屏上也清楚。
 * 不嵌 iframe —— 每个 iframe 都会完整加载一次 web 应用，首屏会被拖死。
 */
const PRODUCT_SURFACES = [
  {
    id: 'page',
    label: 'Pages',
    video: { webm: '/site/demo-allinone.webm', mp4: '/site/demo-allinone.mp4' },
    image: '/site/demo-allinone.webp',
    size: [3840, 2400],
    lead: 'In BIU, every block is fully functional software—from tables and whiteboards to coding exercises and video editing—all powered by plugins. Combine them on one page to create a complete service for your customers. For example, a header, whiteboard, coding challenges, code runner, and offer comparison become an end-to-end technical interview coaching experience.',
    alt: 'A BIU page for technical interview coaching, with a header, Excalidraw whiteboard, coding challenge cards, a code runner, and an offer comparison matrix',
  },
  {
    id: 'plugins',
    label: 'Plugins',
    image: '/site/shot-plugins.webp',
    size: [3840, 2400],
    lead: 'Every block on a page comes from a plugin. Install a plugin to add a new block type—or ask an agent to build the one you need.',
    alt: 'BIU plugin table with one-click installation and activation for Excalidraw whiteboards, coding challenge cards, code runners, and more',
  },
  {
    id: 'share',
    label: 'Share',
    image: '/site/shot-share.webp',
    size: [3840, 2400],
    lead: 'Plugins travel with the page. When you share, the content, attachments, and plugins are bundled together, so whiteboards and coding challenges still work for anyone who opens the link.',
    alt: 'A shared BIU page where whiteboards and coding challenge cards remain fully interactive',
  },
  {
    id: 'component',
    label: 'Components',
    image: '/site/demo-component.webp',
    size: [3840, 2160],
    lead: 'As pages multiply, instances of the same plugin spread across your workspace. Components bring them back together in structured tables, where each one can be opened and edited independently.',
    alt: 'BIU components collecting video editing blocks from multiple pages into a table, with one component open in its dedicated editor',
  },
  {
    id: 'data',
    label: 'Data',
    image: '/site/demo-file-system.webp',
    size: [3840, 2160],
    lead: 'It goes beyond components. Conversations, pages, tasks, and plugins are all tables, with shared filters, views, and URLs—and you can open them side by side.',
    alt: 'BIU data with conversation and page tables open side by side in the same workspace',
  },
  {
    id: 'reference',
    label: 'References',
    image: '/site/demo-context.webp',
    size: [3840, 2160],
    lead: 'Structured data can be referenced directly. Add pages, conversations, or components to the prompt, and the agent reads exactly what you selected—nothing more, nothing less.',
    alt: 'BIU references with pages, conversations, and plugins added to a prompt as removable tags for an agent',
  },
] as const

/** 工作区里现成的插件，每张卡一句话说清它在页面里做什么。 */
const PLUGIN_WALL = [
  { glyph: '✎', name: 'Excalidraw Whiteboard', body: 'A hand-drawn whiteboard. Zoom in and start drawing; the source file stays with the page.' },
  { glyph: '{}', name: 'Coding Challenge', body: 'The prompt on the left, code on the right—a LeetCode-style practice block.' },
  { glyph: '▶', name: 'Code Runner', body: 'Run Python, Go, Java, and more than a dozen other languages right on the page.' },
  { glyph: '⚖', name: 'Option Comparison', body: 'Score multiple options across weighted criteria and get an automatic recommendation.' },
  { glyph: '◧', name: 'Video Editor', body: 'Edit with timeline scripts and preview the composition in real time.' },
  { glyph: '</>', name: 'HTML', body: 'Build a static card or a scriptable mini app, then present it full-screen in one click.' },
  { glyph: '$_', name: 'Page Terminal', body: 'A real interactive terminal, with an independent session for every block.' },
  { glyph: '⇄', name: 'API Client', body: 'Configure a request and send it; responses and history stay on the page.' },
  { glyph: '◎', name: 'Browser', body: 'A web card that opens into a real browser in the sidebar.' },
  { glyph: '✓', name: 'Page Regression Tests', body: 'Write assertions, run them one by one, and compare results with the previous run.' },
  { glyph: '≡', name: 'Table of Contents', body: 'List every heading on the page and jump to any section.' },
  { glyph: '✦', name: 'Gunfire', body: 'A 2D mini game—because even a game can be a plugin.' },
] as const

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined
    if (!query) return
    setReduced(query.matches)
    const onChange = () => setReduced(query.matches)
    query.addEventListener?.('change', onChange)
    return () => query.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}

/** All in One 的三层意思，每条指向产品页对应锚点。 */
const PILLARS = [
  {
    title: 'Blocks are software',
    body: 'Every block on a page is fully functional software: a table, whiteboard, coding exercise, video editor, and more. Blocks come from installable plugins, not a fixed set of platform-defined formats.',
    to: '/product#plugins',
  },
  {
    title: 'Pages compose software',
    body: 'Combine plugins on a page to create a complete service. They read and write the same data, while page properties provide their shared runtime environment.',
    to: '/product#pages',
  },
  {
    title: 'Share working software',
    body: 'When you share a page, its content, attachments, and plugin source code are bundled together. Recipients can use it immediately—not just view a screenshot or follow another link.',
    to: '/product#share',
  },
] as const

const AGENT_POINTS = [
  {
    title: 'Understands your pages',
    body: 'Agents work with the same data you do, so there is no need to copy and paste context.',
  },
  {
    title: 'Turns output into pages',
    body: 'Results become pages, tables, or tasks instead of disappearing into chat history, ready for the next step.',
  },
  {
    title: 'Builds its own plugins',
    body: 'Missing a tool? Ask an agent to build a plugin and add it to the page. Extensibility is no longer just for developers.',
  },
] as const

/**
 * 首页只放三个最常被拿来问的对手。一句话是给卡片的，
 * 长对照表留在对比页 —— Notion 的 biuWhen 太长，不能直接贴上来。
 */
const HOME_COMPARE_LINE = {
  'vs-notion': 'Plugins define your block types, so one page can contain multiple kinds of software.',
  'vs-obsidian': 'Keep your data local while plugin blocks read and write structured data.',
  'vs-chatgpt': 'Results become reusable pages instead of getting buried in chat history.',
} as const

const HOME_COMPARES = COMPARE_FEATURED.flatMap((slug) => {
  const page = COMPARE_PAGES.find((item) => item.slug === slug)
  const line = HOME_COMPARE_LINE[slug]
  return page && line ? [{ page, line }] : []
})

const HERO_VERBS = [
  ['build', 'build-software'],
  ['store', 'store-software'],
  ['compose', 'compose-software'],
  ['distribute', 'distribute-software'],
  ['derive', 'derive-software'],
] as const

/** 日期相同则保持稿序，取最前面两篇作为首页入口。 */
const HOME_POSTS = BLOG_POSTS
  .map((post, index) => ({ post, index }))
  .sort((a, b) => (a.post.date < b.post.date ? 1 : a.post.date > b.post.date ? -1 : a.index - b.index))
  .slice(0, 2)
  .map(({ post }) => post)

const HOME_FAQ = [
  ['What is BIU?', 'BIU is a desktop app that combines software into complete services using pages. Agents and users work in the same workspace, and entire pages can be shared as ready-to-use experiences.'],
  ['How much does BIU cost?', 'BIU is open source and free. The desktop app and self-hosted edition have no license fee. Agents use model services that you configure, and those providers bill you directly.'],
  ['Where is my data stored?', 'You choose when creating a space. Local spaces stay on your computer; cloud spaces live on a server you deploy.'],
  ['Do I need to know how to code?', 'No. You can work with pages, tables, and ready-made plugins. When you need a new block, an agent can build it for you.'],
] as const

export function MarketingHome({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: 'BIU · Compose All Your Software on One Page',
    description: 'Transform how the world builds, stores, composes, distributes, and derives software. The next medium for human–AI collaboration.',
    path: '/',
  })
  const [activeSurface, setActiveSurface] = useState(0)
  const surface = PRODUCT_SURFACES[activeSurface]!
  const reducedMotion = usePrefersReducedMotion()
  const brand = useBrandConfig()

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-hero">
          <div className="site-hero-copy site-container" data-reveal>
            <p className="site-hero-epigraph">
              <span>The medium is the message</span>
              <cite>Marshall McLuhan</cite>
            </p>
            <h1 aria-label="Transform how the world builds, stores, composes, distributes, and derives software">
              <span>Transform how the world</span>
              <span className="site-hero-verbs">
                {HERO_VERBS.map(([word, slug], index) => (
                  <Link key={slug} to={`/blog/${slug}`}>
                    {word}
                    <sup aria-hidden>{String(index + 1).padStart(2, '0')}</sup>
                  </Link>
                ))}
              </span>
              <span>software</span>
            </h1>
            <p className="site-hero-sub">The next medium for human–AI collaboration</p>
          </div>
          <div className="site-hero-band site-container" data-reveal>
            <div className="site-hero-band-inner">
              <div>
                <p className="site-eyebrow">Open Source · Free · All in One</p>
                <h2>Compose all your software on one page</h2>
              </div>
              <div className="site-cta-actions">
                <Link className="site-cta-primary" to="/download"><DownloadIcon />Download</Link>
                <GitHubButton label="GitHub" />
              </div>
              <img
                className="site-hero-shot"
                src={asset('/site/shot-page.webp')}
                alt=""
                width={1600}
                height={1000}
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </section>

        <section className="site-product-demo" data-reveal>
          <div className="site-demo-heading">
            <p className="site-section-label">See It in Action</p>
            <h2>One page. One complete service.</h2>
            <div className="site-demo-tabs" role="tablist" aria-label="Product demo">
              {PRODUCT_SURFACES.map((item, index) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeSurface === index}
                  className={activeSurface === index ? 'is-active' : ''}
                  key={item.id}
                  onClick={() => setActiveSurface(index)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="site-demo-caption" role="tabpanel" aria-live="polite">
            <p className="site-demo-lead">{surface.lead}</p>
          </div>
          <div className="site-demo-real-frame">
            {'video' in surface ? (
              <video
                key={surface.id}
                className="site-demo-shot"
                poster={asset(surface.image)}
                aria-label={surface.alt}
                width={surface.size[0]}
                height={surface.size[1]}
                autoPlay={!reducedMotion}
                controls={reducedMotion}
                muted
                loop
                playsInline
                preload="metadata"
              >
                <source src={asset(surface.video.webm)} type="video/webm" />
                <source src={asset(surface.video.mp4)} type="video/mp4" />
              </video>
            ) : (
              <img
                key={surface.id}
                className="site-demo-shot"
                src={asset(surface.image)}
                alt={surface.alt}
                width={surface.size[0]}
                height={surface.size[1]}
                loading="lazy"
                decoding="async"
              />
            )}
          </div>
        </section>

        <section className="site-capabilities" aria-label="All in One">
          <div className="site-capabilities-heading" data-reveal>
            <p className="site-section-label">All in One</p>
            <h2>More than bundled features.<br />Pages that run software.</h2>
          </div>
          <div className="site-capability-grid">
            {PILLARS.map((item) => (
              <article key={item.title} data-reveal>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <Link to={item.to}>Learn more →</Link>
              </article>
            ))}
          </div>
          <p className="site-capabilities-note" data-reveal>
            Most document tools offer a fixed set of blocks, and embedded web pages cannot access your data. BIU blocks come from plugins anyone can build, and every plugin can work with the other blocks on the page.
            <Link to="/compare/vs-notion">Compare BIU with Notion →</Link>
          </p>
        </section>

        <section className="site-plugin-wall" aria-label="Plugins">
          <div className="site-plugin-wall-heading" data-reveal>
            <p className="site-section-label">Plugins</p>
            <h2>Software you can add today</h2>
            <p>These plugins are ready for your workspace. Install one to add a new block type, or ask an agent to build what is missing.</p>
          </div>
          <div className="site-plugin-grid">
            {PLUGIN_WALL.map((item) => (
              <article key={item.name} data-reveal>
                <span className="site-plugin-glyph" aria-hidden>{item.glyph}</span>
                <h3>{item.name}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
          <p className="site-plugin-wall-note" data-reveal>
            <Link to="/product#plugins">Build and install plugins →</Link>
          </p>
        </section>

        <section className="site-agent" aria-label="Agents">
          <div className="site-agent-heading" data-reveal>
            <p className="site-section-label">Agents</p>
            <h2>Agents live on the page, too</h2>
          </div>
          <div className="site-agent-grid">
            {AGENT_POINTS.map((item) => (
              <article key={item.title} data-reveal>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="site-space-section" id="spaces">
          <div className="site-space-inner site-container">
            <div className="site-space-heading" data-reveal>
              <p className="site-section-label">Data Control</p>
              <h2>Your data lives<br />where you choose</h2>
            </div>
            <div className="site-space-options">
              <article data-reveal>
                <span className="site-space-index">01</span>
                <h3>Local Space</h3>
                <p>Pages, tables, and attachments stay on your computer and work offline. Relevant content is sent to your configured model service only when you invoke a model.</p>
                <small>Local storage · Offline access · Bring your own model key</small>
              </article>
              <article data-reveal>
                <span className="site-space-index">02</span>
                <h3>Cloud Space</h3>
                <p>Use a cloud space for access across devices and team collaboration. Manage members, permissions, and real-time work in one place. BIU Cloud is coming soon; self-hosting is available now.</p>
                <small>Multiple devices · Member permissions · Online collaboration · Coming soon</small>
              </article>
            </div>
          </div>
        </section>

        <section className="site-home-entry" aria-label="Use cases">
          <div className="site-home-entry-heading" data-reveal>
            <p className="site-section-label">Use Cases</p>
            <h2>Bring the whole workflow onto one page</h2>
            <p>Choose what you are working on. Each page covers the deliverables, challenges, and workflow in detail.</p>
          </div>
          <div className="site-scene-grid">
            {USE_CASES.map((useCase) => (
              <Link key={useCase.slug} className="site-scene-row" to={`/use-cases/${useCase.slug}`} data-reveal>
                <span className="site-scene-index">{useCase.index}</span>
                <span className="site-scene-copy">
                  <span className="site-scene-title">
                    <h3>{useCase.title}</h3>
                    <span aria-hidden>→</span>
                  </span>
                  <p>{useCase.summary}</p>
                  <small>{useCase.output}</small>
                </span>
              </Link>
            ))}
          </div>
          <p className="site-home-entry-more" data-reveal>
            <Link to="/use-cases">View all use cases →</Link>
          </p>
        </section>

        <section className="site-home-entry" aria-label="Comparisons">
          <div className="site-home-entry-heading" data-reveal>
            <p className="site-section-label">Compare</p>
            <h2>See how BIU compares</h2>
            <p>Explore our three most requested comparisons. Full breakdowns—including where BIU falls short—are available on each comparison page.</p>
          </div>
          <div className="site-home-compare-grid">
            {HOME_COMPARES.map(({ page, line }) => (
              <Link key={page.slug} className="site-home-compare-card" to={`/compare/${page.slug}`} data-reveal>
                <small>{page.category}</small>
                <h3>{page.columns[0]}</h3>
                <p>{line}</p>
                <span>View comparison →</span>
              </Link>
            ))}
          </div>
          <p className="site-home-entry-more" data-reveal>
            <Link to="/compare">View all comparisons →</Link>
          </p>
        </section>

        <section className="site-home-entry" aria-label="Ideas">
          <div className="site-home-entry-heading" data-reveal>
            <p className="site-section-label">Ideas</p>
            <h2>Why BIU works this way</h2>
            <p>The product page explains how BIU works. These articles explain why—and the mark tells a story of its own.</p>
          </div>
          <div className="site-idea-posts">
            {HOME_POSTS.map((post) => (
              <Link key={post.slug} className="site-idea-post" to={`/blog/${post.slug}`} data-reveal>
                <span className="site-idea-meta">
                  <time dateTime={post.date}>{post.date.replace(/-/g, '.')}</time>
                  <span>{readingMinutes(post)} min read</span>
                </span>
                <h3>{post.title}</h3>
                <p>{post.summary}</p>
                <span className="site-idea-go">Read →</span>
              </Link>
            ))}
          </div>
          <div className="site-idea-brand-wrap" data-reveal>
            <Link className="site-idea-brand" to="/brand">
              <BrandMark
                className="site-idea-mark"
                colors={[brand.c0, brand.c1, brand.c2]}
                stroke={brand.stroke}
                strokeWidth={brand.strokeWidth}
                lineWidth={brand.lineWidth}
                background={brand.background}
                showBackground={false}
                circleRatio={brand.circleRatio}
                displayWidth={96}
                title="BIU"
              />
              <span className="site-idea-brand-copy">
                <h3>One circle, two lines, three blocks</h3>
                <p>The mark spells the name: two blocks in the upper right form the B, the diagonal line forms the I, and the semicircle in the lower left forms the U. Together, the three letters complete the circle.</p>
                <span className="site-idea-go">Explore the brand →</span>
              </span>
            </Link>
          </div>
          <p className="site-home-entry-more" data-reveal>
            <Link to="/blog">View all articles →</Link>
          </p>
        </section>

        <section className="site-home-entry site-vision" aria-label="Vision">
          <div className="site-home-entry-heading" data-reveal>
            <p className="site-section-label">Vision</p>
            <h2>Five verbs. Five trillion-dollar markets.</h2>
            <p>
              Building, storing, composing, distributing, and deriving software each represent a trillion-dollar market. Agents are reshaping all five, and BIU brings them together on one page. We are looking for investors who share this conviction.
            </p>
          </div>
          <VisionTable />
          <div className="site-vision-invest" data-reveal>
            <div>
              <h3>Invest in the next trillion-dollar AI company</h3>
              <p>Contact us to discuss our product roadmap and fundraising plans. Please include your organization and areas of interest.</p>
              <p className="site-vision-note">Table data is sourced from Gartner, IDC, McKinsey, Harvard Business School, and other institutions. Full references appear at the end of each article.</p>
            </div>
            <a className="site-cta-primary" href={INVEST_MAIL}>
              Contact us
            </a>
          </div>
          <p className="site-home-entry-more" data-reveal>
            <Link to="/invest">Read the full investment thesis →</Link>
          </p>
        </section>

        <SiteFaq title="About BIU" items={HOME_FAQ} />

        <SiteFinalCta title={<>Open source. Free.<br />Ready today.</>} />
    </SiteChrome>
  )
}
