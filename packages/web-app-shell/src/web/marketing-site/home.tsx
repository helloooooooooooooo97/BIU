import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DownloadIcon, GitHubButton, SiteChrome, SiteFaq, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'
import { asset } from './site-base.ts'
import { USE_CASES } from './use-cases.tsx'
import { COMPARE_PAGES } from './compare.tsx'
import { BLOG_POSTS, readingMinutes } from './blog-posts.ts'
import { BrandMark, useBrandConfig } from './brand-mark.tsx'

/**
 * Real interface captures (public/site/), shot at 2-3x resolution.
 */
const PRODUCT_SURFACES = [
  {
    id: 'page',
    label: 'Pages',
    video: { webm: '/site/demo-allinone.webm', mp4: '/site/demo-allinone.mp4' },
    image: '/site/demo-allinone.webp',
    size: [3840, 2400],
    lead: 'Every block on a BIU page is live, full-stack software—from built-in plugins and agent-authored tools to slices of external systems. All blocks share one underlying state, and sharing one link delivers the complete experience.',
    alt: 'A BIU page for technical interview coaching, with a header, Excalidraw whiteboard, coding challenge cards, a code runner, and an offer comparison matrix',
  },
  {
    id: 'plugins',
    label: 'Plugins',
    image: '/site/shot-plugins.webp',
    size: [3840, 2400],
    lead: 'Plugin backends can run inside a controlled local sandbox or stay in external services and existing SaaS—slicing only the task-specific frontend onto your page and persisting run snapshots. Missing capabilities can be built by an agent directly against live data.',
    alt: 'BIU plugin table with one-click installation and activation for Excalidraw whiteboards, coding challenge cards, code runners, and more',
  },
  {
    id: 'share',
    label: 'Share',
    image: '/site/shot-share.webp',
    size: [3840, 2400],
    lead: 'Plugins travel with the page. When you share a link, the text, attachments, and plugins are bundled together—so whiteboards and coding challenges work right away with zero setup.',
    alt: 'A shared BIU page where whiteboards and coding challenge cards remain fully interactive',
  },
  {
    id: 'component',
    label: 'Components',
    image: '/site/demo-component.webp',
    size: [3840, 2160],
    lead: 'As pages grow, instances of the same tool spread across your workspace. Components bring them back together in structured tables where each one can be filtered and edited on its own.',
    alt: 'BIU components collecting video editing blocks from multiple pages into a table, with one component open in its dedicated editor',
  },
  {
    id: 'data',
    label: 'Data',
    image: '/site/demo-file-system.webp',
    size: [3840, 2160],
    lead: 'Pages, conversations, tasks, and plugins all live in the same workspace with shared filters and views—and you can open them side by side.',
    alt: 'BIU data with conversation and page tables open side by side in the same workspace',
  },
  {
    id: 'reference',
    label: 'References',
    image: '/site/demo-context.webp',
    size: [3840, 2160],
    lead: 'Stop copying and pasting context into chat. Drop pages, conversations, or plugins straight into the prompt as tags, and the agent reads exactly what you picked.',
    alt: 'BIU references with pages, conversations, and plugins added to a prompt as removable tags for an agent',
  },
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

const PILLARS = [
  {
    title: 'Shared state and external application slices',
    body: 'Built-in plugins and slices of external SaaS read and write the same page properties—one change converges across the page, and external call results persist directly as structured snapshots.',
    to: '/blog/application-slicing',
  },
  {
    title: 'Freeform prose meets structured tables',
    body: 'Write freely in prose while plugin blocks and page properties stay strictly typed. People read a cohesive page; the workspace automatically indexes matching blocks across pages.',
    to: '/blog/store-software',
  },
  {
    title: 'One page is an isolated boundary and release',
    body: 'The same plugin placed on different pages automatically isolates each page’s data and runtime environment. Share one link to bundle prose, files, and plugin source with dynamic condition permissions.',
    to: '/product#share',
  },
] as const

const AGENT_POINTS = [
  {
    title: 'Agents operate every tool on the page directly',
    body: 'Conventional apps are black boxes to AI. In BIU, pages, tables, and plugins share one structured layer—reference items with @ so agents read and act on every tool without screenshots or copy-pasting.',
  },
  {
    title: 'Software grows alongside real data',
    body: 'Start delivering from the first line of data instead of waiting months to ship. When new needs emerge mid-workflow, agents build new plugins directly against live page data.',
  },
  {
    title: 'Derive from existing software and compound work',
    body: 'Agents do not rewrite from scratch each time: they extend existing plugins, adapt pages, or pull in open-source repositories, persisting every result as durable pages, tables, and skills.',
  },
] as const

const HOME_COMPARE_SPECS = [
  {
    verb: '01 Build',
    slug: 'vs-cursor',
    line: 'Cursor accelerates engineers inside code repos; BIU grows software alongside live business data—expanding builders from developers to a billion knowledge workers.',
  },
  {
    verb: '02 Store',
    slug: 'vs-supabase',
    line: 'Supabase isolates data in a cloud database while Office scatters unstructured files; BIU unites prose, structured blocks, and run snapshots on one auto-indexed page.',
  },
  {
    verb: '03 Compose',
    slug: 'vs-k8s',
    line: 'Kubernetes orchestrates containers with YAML; BIU declaratively composes full-stack plugins and external SaaS slices on one page sharing live state—zero glue code.',
  },
  {
    verb: '04 Distribute',
    slug: 'vs-app-stores',
    line: 'App Store and Google Play require packaging, review queues, and up to a 30% toll; BIU ships runnable software in a single link governed by dynamic condition permissions.',
  },
  {
    verb: '05 Derive',
    slug: 'vs-github',
    line: 'GitHub’s 630M repos sit behind git clone and deployment barriers; BIU lets agents layer incremental capabilities onto working plugins and open source for everyone.',
  },
] as const

const HOME_COMPARES = HOME_COMPARE_SPECS.flatMap((spec) => {
  const page = COMPARE_PAGES.find((item) => item.slug === spec.slug)
  return page ? [{ page, verb: spec.verb, line: spec.line }] : []
})

const HERO_VERBS = [
  { word: 'build', slug: 'build-software', plain: 'Missing a tool? Ask an agent to write a plugin right inside your page.' },
  { word: 'store', slug: 'store-software', plain: 'Docs, tables, and tool data live together so agents read them directly.' },
  { word: 'compose', slug: 'compose-software', plain: 'Combine whiteboards, code, and video tools on one page tailored to your role.' },
  { word: 'distribute', slug: 'distribute-software', plain: 'Share one link and anyone can use the page immediately—no installs or setup.' },
  { word: 'derive', slug: 'derive-software', plain: 'Fork an existing page or plugin and adapt it into your own tool.' },
] as const

/** Keep declaration order on ties; surface the top two essays on the homepage. */
const HOME_POSTS = BLOG_POSTS
  .map((post, index) => ({ post, index }))
  .sort((a, b) => (a.post.date < b.post.date ? 1 : a.post.date > b.post.date ? -1 : a.index - b.index))
  .slice(0, 2)
  .map(({ post }) => post)

const HOME_FAQ = [
  ['What is BIU?', 'BIU is an open-source, free software medium for human–agent collaboration. Every block on a page is a full-stack plugin sharing live state—running locally in sandboxes or slicing external services—delivered via a single link.'],
  ['How much does it cost?', 'BIU is open source and free for desktop and self-hosting. Agents use your own model API key, billed directly by your chosen provider.'],
  ['Where is my data stored?', 'You choose per workspace: Local Spaces keep everything on your own computer in standard SQLite and files offline; Cloud Spaces support multi-device sync and team permissions (self-host today, official cloud coming soon).'],
  ['Do I need to know how to code?', 'No. Use built-in pages, tables, and ready-made plugins every day. When you need a custom capability or an external API slice, describe the workflow to an agent on the page.'],
] as const

export function MarketingHome({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: 'BIU · Compose All Your Software on One Page',
    description: 'The next software medium for humans and agents: compose full-stack plugins, structured data, and external application slices on one page, then ship with a single link.',
    path: '/',
  })
  const [activeSurface, setActiveSurface] = useState(0)
  const [activeVerb, setActiveVerb] = useState(0)
  const [activeRole, setActiveRole] = useState(0)
  const surface = PRODUCT_SURFACES[activeSurface]!
  const roleScene = USE_CASES[activeRole]!
  const reducedMotion = usePrefersReducedMotion()
  const brand = useBrandConfig()

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-hero">
          <div className="site-hero-copy site-container" data-reveal>
            <h1 aria-label="Transform how the world builds, stores, composes, distributes, and derives software">
              <span>Transform how the world</span>
              <span className="site-hero-verbs">
                {HERO_VERBS.map((item, index) => (
                  <Link
                    key={item.slug}
                    to={`/blog/${item.slug}`}
                    className={activeVerb === index ? 'is-current' : ''}
                    onMouseEnter={() => setActiveVerb(index)}
                    onFocus={() => setActiveVerb(index)}
                  >
                    {item.word}
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
            <p className="site-section-label">Real Interface</p>
            <h2>One page, one working toolkit</h2>
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

        <section className="site-role-showcase" aria-label="Role-based plugins">
          <div className="site-role-showcase-heading" data-reveal>
            <p className="site-section-label">Industries, Roles & Custom Plugins</p>
            <h2>Different industries and roles, tailored plugins on one page</h2>
            <p>
              Start with built-in plugins like Excalidraw, code runners, video editing, terminals, and HTML—then let an agent craft the specialized blocks each role needs. Choose an industry to explore its role pages:
            </p>
            <div className="site-demo-tabs" role="tablist" aria-label="Choose an industry">
              {USE_CASES.map((item, index) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeRole === index}
                  className={activeRole === index ? 'is-active' : ''}
                  key={item.slug}
                  onClick={() => setActiveRole(index)}
                >
                  {item.title}
                </button>
              ))}
            </div>
          </div>

          <div className="site-role-panel" role="tabpanel" aria-live="polite" data-reveal>
            <div className="site-role-panel-main">
              <span className="site-solution-index">{roleScene.index} · {roleScene.roleLabels.join(' · ')}</span>
              <h3>{roleScene.title}</h3>
              <p className="site-role-panel-summary">{roleScene.summary}</p>
              <div className="site-role-plugin-group">
                <small>Common built-in plugins</small>
                <ul className="site-block-chips" aria-label="Built-in plugins">
                  {roleScene.blocks.map((block) => <li key={block}>{block}</li>)}
                </ul>
              </div>
              <Link className="site-role-panel-link" to={`/use-cases/${roleScene.slug}`}>
                Explore interactive role page previews →
              </Link>
            </div>
            <div className="site-role-panel-plugins">
              <div className="site-role-plugin-group">
                <small>Example roles and custom pages in this industry</small>
                <div className="site-role-custom-list">
                  {roleScene.roles.map((role) => (
                    <article key={role.id}>
                      <strong>{role.role} · {role.pageTitle}</strong>
                      <p>{role.summary}</p>
                      <small className="site-role-custom-tags">
                        Custom plugins: {role.customPlugins.map((p) => p.name).join(' · ')}
                      </small>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <p className="site-plugin-wall-note" data-reveal>
            Even a 2D mini-game can live on a page as a plugin.
            <Link to="/product#plugins">See how plugins work →</Link>
          </p>
        </section>

        <section className="site-capabilities" aria-label="All in One">
          <div className="site-capabilities-heading" data-reveal>
            <p className="site-section-label">Why One Page</p>
            <h2>Not features piled into an app—<br />software composed on a page</h2>
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
            Most document tools lock you into fixed block types, and embedded web pages cannot read your data. In BIU, blocks come from plugins anyone can write and compose together.
            <Link to="/compare/vs-notion">Compare with Notion →</Link>
          </p>
        </section>

        <section className="site-agent" aria-label="Agents">
          <div className="site-agent-heading" data-reveal>
            <p className="site-section-label">AI-Native by Design</p>
            <h2>When software lives on one page,<br />it is AI-native from the start</h2>
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
              <p className="site-section-label">Data Ownership</p>
              <h2>Local or cloud,<br />you decide</h2>
            </div>
            <div className="site-space-options">
              <article data-reveal>
                <span className="site-space-index">01</span>
                <h3>Local Space</h3>
                <p>Pages, tables, and attachments stay directly on your computer and work offline. Only the content you pick for a prompt is sent to your configured model provider.</p>
                <small>Saved locally · Works offline · Bring your own API key</small>
              </article>
              <article data-reveal>
                <span className="site-space-index">02</span>
                <h3>Cloud Space</h3>
                <p>Built for multi-device sync and team collaboration with member permissions. Official cloud hosting is coming soon—you can self-host today.</p>
                <small>Multi-device · Permissions · Online collaboration · Coming soon</small>
              </article>
            </div>
          </div>
        </section>

        <section className="site-home-entry" aria-label="Use cases">
          <div className="site-home-entry-heading" data-reveal>
            <p className="site-section-label">Industries & Workflows</p>
            <h2>Real workflows across industries</h2>
            <p>Each industry includes interactive page previews for multiple roles along with custom plugin setups.</p>
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
                  <small>{useCase.roleLabels.join(' · ')}</small>
                </span>
              </Link>
            ))}
          </div>
          <p className="site-home-entry-more" data-reveal>
            <Link to="/use-cases">All industries & use cases →</Link>
          </p>
        </section>

        <section className="site-home-entry" aria-label="Comparisons">
          <div className="site-home-entry-heading" data-reveal>
            <p className="site-section-label">Why BIU</p>
            <h2>Five stages, five category-defining benchmarks</h2>
            <p>Across building, storing, composing, distributing, and deriving software, see how BIU compares with the iconic tools at every layer—including where BIU falls short.</p>
          </div>
          <div className="site-home-compare-grid">
            {HOME_COMPARES.map(({ page, verb, line }) => (
              <Link key={page.slug} className="site-home-compare-card" to={`/compare/${page.slug}`} data-reveal>
                <small>{verb} · {page.category}</small>
                <h3>{page.title}</h3>
                <p>{line}</p>
                <span>See differences →</span>
              </Link>
            ))}
          </div>
          <p className="site-home-entry-more" data-reveal>
            <Link to="/compare">All 16 comparisons →</Link>
          </p>
        </section>

        <section className="site-home-entry" aria-label="Ideas">
          <div className="site-home-entry-heading" data-reveal>
            <p className="site-section-label">Philosophy</p>
            <h2>Ideas & long-form writing</h2>
            <p>Read the complete essays on how software is built, stored, composed, distributed, and derived—and the architecture behind BIU.</p>
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
                <p>The mark spells the name: two small blocks on the upper right form B, the diagonal line is I, and the lower-left semicircle is U.</p>
                <span className="site-idea-go">Explore brand →</span>
              </span>
            </Link>
          </div>
          <p className="site-home-entry-more" data-reveal>
            <Link to="/blog">All essays →</Link>
          </p>
        </section>

        <SiteFaq title="About BIU" items={HOME_FAQ} />

        <SiteFinalCta title="Start building with BIU" />
    </SiteChrome>
  )
}
