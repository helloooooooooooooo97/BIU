import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DownloadIcon, GitHubButton, SiteChrome, SiteFaq, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'
import { asset } from './site-base.ts'
import { USE_CASES } from './use-cases.tsx'
import { COMPARE_FEATURED, COMPARE_PAGES } from './compare.tsx'
import { BLOG_POSTS, readingMinutes } from './blog-posts.ts'
import { BrandMark, useBrandConfig } from './brand-mark.tsx'

/**
 * 真实界面：BIU 的截图 / 录屏（public/site/），按 2–3 倍像素拍摄，2 倍屏上也清楚。
 */
const PRODUCT_SURFACES = [
  {
    id: 'page',
    label: '页面',
    video: { webm: '/site/demo-allinone.webm', mp4: '/site/demo-allinone.mp4' },
    image: '/site/demo-allinone.webp',
    size: [3840, 2400],
    lead: '页面中的每一个块都是可运行的全栈软件——既可以是内置插件与智能体现场构建的模块，也可以是对接外部系统的应用切片。同一页内的所有块共享底层数据，一链分享即可完整交付。',
    alt: 'BIU 页面：一份算法面试辅导，刊头、Excalidraw 画板、算法题卡片、代码运行块和 offer 对比矩阵放在同一页',
  },
  {
    id: 'plugins',
    label: '插件',
    image: '/site/shot-plugins.webp',
    size: [3840, 2400],
    lead: '插件的后端既可以运行在本地受控沙箱，也可以留在外部独立服务与既有 SaaS 中，由前端切出当前任务所需的交互层并持久化调用快照；缺的能力还可由智能体基于真实数据现场构建。',
    alt: 'BIU 插件表：Excalidraw 画板、算法题卡片、代码运行块等插件，一键安装、启用',
  },
  {
    id: 'share',
    label: '分享',
    image: '/site/shot-share.webp',
    size: [3840, 2400],
    lead: '分享页面时，正文、附件与所用插件将一并打包。接收方在浏览器中打开链接即可直接操作画板与代码练习，无需额外安装。',
    alt: 'BIU 分享页：对方打开链接，页面里的画板和算法题卡片照样能用',
  },
  {
    id: 'component',
    label: '组件',
    image: '/site/demo-component.webp',
    size: [3840, 2160],
    lead: '当页面数量增加，分散在不同页面中的同类模块（例如多期视频编排块）会自动汇总为结构化表格，支持统一筛选与独立编辑。',
    alt: 'BIU 组件：散落在各个页面里的视频编排块被收集成一张表，同一个组件在专属编辑器里打开',
  },
  {
    id: 'data',
    label: '数据',
    image: '/site/demo-file-system.webp',
    size: [3840, 2160],
    lead: '页面、对话、任务与插件均在同一工作区内统一管理，共用一致的筛选与视图体系，并支持分栏并排查阅。',
    alt: 'BIU 数据：对话表和页面表在同一个工作区里分栏并排打开',
  },
  {
    id: 'reference',
    label: '引用',
    image: '/site/demo-context.webp',
    size: [3840, 2160],
    lead: '需要智能体协助时，无需反复复制粘贴资料。将页面、对话或插件直接添加至输入框，智能体即精准读取所选范围。',
    alt: 'BIU 引用：页面、对话、插件作为可移除的标签放进输入框，交给智能体',
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

/** 第一层：为什么 All in One 以页面为单位（数据互通 → 结构融合 → 单链发布） */
const PILLARS = [
  {
    title: '跨软件同源联动，支持外部应用切片',
    body: '同一页面内的内置插件与外部系统切片读写同一份页面属性，一处变动全页收敛；外部服务调用结果直接写回页面块作为快照持久化，告别多应用切换与胶水集成。',
    to: '/blog/application-slicing',
  },
  {
    title: '自由正文与结构化数据合一',
    body: '正文保留自由书写的表达力，插件块与页面属性保持严格结构化。人阅读的是完整页面，系统自动把同类块汇聚成可按字段查询的跨页数据表。',
    to: '/blog/store-software',
  },
  {
    title: '一页即独立边界，单链即完成发布',
    body: '同一份插件置于不同页面自动隔离各自的数据与运行环境；分享一个链接即打包正文、附件与插件源码，配合条件权限精确控制可见范围。',
    to: '/product#share',
  },
] as const

/** 第二层：正因所有软件都在同一结构化页面内，它们天然是 AI 原生的（操作 → 生长 → 衍生） */
const AGENT_POINTS = [
  {
    title: '直接读取与操作页面内的每一款软件',
    body: '传统软件对 AI 而言是孤立黑盒。在 BIU 中，页面、表格与插件共享统一结构，智能体通过 @ 精确引用即可直接读写并操作每款软件，无需截图猜测或人工转述。',
  },
  {
    title: '面向真实数据，边服务边生长',
    body: '无需先耗时开发再投入使用。从第一行数据即可开始交付服务；业务推进中出现新需求，智能体可直接基于页面里的真实数据构建新插件并即时生效。',
  },
  {
    title: '基于已有软件持续衍生与沉淀',
    body: '智能体不必每次从零重写代码，可引用已有插件、复用页面乃至引入开源项目做增量叠加；每一轮产出都直接沉淀为页面、表格与技能。',
  },
] as const

const HOME_COMPARE_LINE = {
  'vs-notion': '块不再由平台写死：页面可组合全栈插件与外部 SaaS 切片，共享实时状态，一链交付运行。',
  'vs-obsidian': '同样支持本地 SQLite 与离线使用，同时原生提供跨页结构化表、全栈插件与智能体读写。',
  'vs-chatgpt': '产出直接沉淀为结构化页面、可复用插件与技能规范，而非沉没在一次性对话历史中。',
} as const

const HOME_COMPARES = COMPARE_FEATURED.flatMap((slug) => {
  const page = COMPARE_PAGES.find((item) => item.slug === slug)
  const line = HOME_COMPARE_LINE[slug]
  return page && line ? [{ page, line }] : []
})

const HERO_VERBS = [
  { word: '构建', slug: 'build-software', plain: '缺少特定工具时，由智能体按需编写插件并嵌入页面' },
  { word: '存储', slug: 'store-software', plain: '文档、表格与工具数据统一存储，智能体可直接引用' },
  { word: '组合', slug: 'compose-software', plain: '将画板、代码、剪辑等模块组合于同一页面，适配不同行业与角色' },
  { word: '分发', slug: 'distribute-software', plain: '通过单个链接交付完整页面，接收方打开即可使用，无需配置环境' },
  { word: '衍生', slug: 'derive-software', plain: '基于已有页面与插件持续扩展，沉淀属于自己的软件能力' },
] as const

/** 日期相同则保持稿序，取最前面两篇作为首页入口。 */
const HOME_POSTS = BLOG_POSTS
  .map((post, index) => ({ post, index }))
  .sort((a, b) => (a.post.date < b.post.date ? 1 : a.post.date > b.post.date ? -1 : a.index - b.index))
  .slice(0, 2)
  .map(({ post }) => post)

const HOME_FAQ = [
  ['BIU 是什么？', 'BIU 是一款开源、免费的下一代人机协作软件媒介。页面中的每一块都是共享数据的全栈插件——既可运行本地沙箱，也可作为外部系统的应用切片，人与智能体同页协作，一链交付使用。'],
  ['如何收费？', 'BIU 开源且免费，桌面端与自部署版本均不收费。智能体功能使用您自行配置的模型密钥，费用由所选模型服务商收取。'],
  ['数据存放在哪里？', '创建空间时由您自主选择：本机空间将数据保存于个人电脑（标准 SQLite 与原始文件）并支持离线使用；云端空间面向多设备同步与团队协作（支持自部署，官方云端即将上线）。'],
  ['需要具备编程基础吗？', '日常使用内置页面、表格与现成插件无需编程。若需要特定业务能力或外部接口切片，直接描述流程即可由智能体基于当前页面真实数据现场构建。'],
] as const

export function MarketingHome({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: 'BIU · 用一个页面，组合所有软件',
    description: '定义下一代人与 AI 协作的软件媒介：在同一页面组合全栈插件、结构化数据与外部应用切片，人与智能体共享状态，一链完成交付。开源、免费。',
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
            <h1 aria-label="改变世界构建、存储、组合、分发、衍生软件的方式">
              <span>改变世界</span>
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
              <span>软件的方式</span>
            </h1>
            <p className="site-hero-sub">定义下一代人与 AI 协作的媒介</p>
          </div>
          <div className="site-hero-band site-container" data-reveal>
            <div className="site-hero-band-inner">
              <div>
                <p className="site-eyebrow">开源 · 免费 · All in One</p>
                <h2>一个页面，组合所有软件</h2>
              </div>
              <div className="site-cta-actions">
                <Link className="site-cta-primary" to="/download"><DownloadIcon />下载</Link>
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
            <p className="site-section-label">真实界面</p>
            <h2>一页，就是一套能用的工具</h2>
            <div className="site-demo-tabs" role="tablist" aria-label="产品演示">
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

        <section className="site-role-showcase" aria-label="按行业与角色定制插件">
          <div className="site-role-showcase-heading" data-reveal>
            <p className="site-section-label">行业、角色与定制插件</p>
            <h2>不同行业与角色，组合各自的专属插件</h2>
            <p>
              工作区内置画板、算法题、代码运行、视频编排、终端与 HTML 等插件；不同行业下的各个角色，均可按需由智能体补充专属插件。选择行业查看内部各角色的页面方案：
            </p>
            <div className="site-demo-tabs" role="tablist" aria-label="选择行业">
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
                <small>行业常用内置插件</small>
                <ul className="site-block-chips" aria-label="内置插件">
                  {roleScene.blocks.map((block) => <li key={block}>{block}</li>)}
                </ul>
              </div>
              <Link className="site-role-panel-link" to={`/use-cases/${roleScene.slug}`}>
                进入该行业查看各角色仿真页面 Demo →
              </Link>
            </div>
            <div className="site-role-panel-plugins">
              <div className="site-role-plugin-group">
                <small>该行业下的典型角色与定制页面</small>
                <div className="site-role-custom-list">
                  {roleScene.roles.map((role) => (
                    <article key={role.id}>
                      <strong>{role.role} · {role.pageTitle}</strong>
                      <p>{role.summary}</p>
                      <small className="site-role-custom-tags">
                        定制插件：{role.customPlugins.map((p) => p.name).join(' · ')}
                      </small>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <p className="site-plugin-wall-note" data-reveal>
            甚至连 2D 小游戏亦可作为插件嵌入页面。
            <Link to="/product#plugins">了解插件机制与定制方式 →</Link>
          </p>
        </section>

        <section className="site-capabilities" aria-label="All in One">
          <div className="site-capabilities-heading" data-reveal>
            <p className="site-section-label">为什么是一页</p>
            <h2>不是把功能堆在一起，<br />是让页面装下软件</h2>
          </div>
          <div className="site-capability-grid">
            {PILLARS.map((item) => (
              <article key={item.title} data-reveal>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <Link to={item.to}>了解更多 →</Link>
              </article>
            ))}
          </div>
          <p className="site-capabilities-note" data-reveal>
            普通文档工具能放什么块是平台定死的，嵌进来的网页也读不到你的数据。BIU 的块由插件提供，谁都能写，写好就能和页面里的其他块一起用。
            <Link to="/compare/vs-notion">看和 Notion 的对比 →</Link>
          </p>
        </section>

        <section className="site-agent" aria-label="智能体">
          <div className="site-agent-heading" data-reveal>
            <p className="site-section-label">天然 AI 原生</p>
            <h2>当软件都在同一页里，<br />它们天然就是 AI 原生的</h2>
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
              <p className="site-section-label">数据归你</p>
              <h2>数据放本机还是云端，<br />由你决定</h2>
            </div>
            <div className="site-space-options">
              <article data-reveal>
                <span className="site-space-index">01</span>
                <h3>本机空间</h3>
                <p>页面、表格和附件直接存在你自己的电脑上，断网也能用。只有调用 AI 时，当前选中的内容才会发给你配置的模型服务。</p>
                <small>本地保存 · 离线可用 · 自带模型密钥</small>
              </article>
              <article data-reveal>
                <span className="site-space-index">02</span>
                <h3>云端空间</h3>
                <p>需要多设备同步、和团队一起协作时使用。成员、权限和在线协作都在空间里管理。官方云端即将上线，现在可以先部署在自己的服务器上。</p>
                <small>多设备 · 成员权限 · 在线协作 · 即将上线</small>
              </article>
            </div>
          </div>
        </section>

        <section className="site-home-entry" aria-label="用例">
          <div className="site-home-entry-heading" data-reveal>
            <p className="site-section-label">行业与用例</p>
            <h2>覆盖不同行业的真实工作流</h2>
            <p>每个行业均包含细分角色的仿真页面示例与定制插件方案，点击查看详情。</p>
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
            <Link to="/use-cases">全部行业与用例 →</Link>
          </p>
        </section>

        <section className="site-home-entry" aria-label="差异">
          <div className="site-home-entry-heading" data-reveal>
            <p className="site-section-label">差异</p>
            <h2>与现有工具的本质差异</h2>
            <p>三个最常被问到的参照对象。完整差异对照（包括我们尚未做到的部分）均列于差异页。</p>
          </div>
          <div className="site-home-compare-grid">
            {HOME_COMPARES.map(({ page, line }) => (
              <Link key={page.slug} className="site-home-compare-card" to={`/compare/${page.slug}`} data-reveal>
                <small>{page.category}</small>
                <h3>{page.columns[0]}</h3>
                <p>{line}</p>
                <span>查看差异 →</span>
              </Link>
            ))}
          </div>
          <p className="site-home-entry-more" data-reveal>
            <Link to="/compare">全部差异 →</Link>
          </p>
        </section>

        <section className="site-home-entry" aria-label="想法">
          <div className="site-home-entry-heading" data-reveal>
            <p className="site-section-label">理念</p>
            <h2>理念与深度写作</h2>
            <p>关于软件的构建、存储、组合、分发与衍生，以及从 SaaS 到 PaaS 的完整架构思考，均收录于「理念」专栏。</p>
          </div>
          <div className="site-idea-posts">
            {HOME_POSTS.map((post) => (
              <Link key={post.slug} className="site-idea-post" to={`/blog/${post.slug}`} data-reveal>
                <span className="site-idea-meta">
                  <time dateTime={post.date}>{post.date.replace(/-/g, '.')}</time>
                  <span>约 {readingMinutes(post)} 分钟读完</span>
                </span>
                <h3>{post.title}</h3>
                <p>{post.summary}</p>
                <span className="site-idea-go">阅读 →</span>
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
                <h3>一个圆、两条线、三个块</h3>
                <p>标记本身就是名字：右上的两个小块是 B，贯穿的斜线是 I，左下的半圆是 U，三个字母刚好拼成这个圆。</p>
                <span className="site-idea-go">看品牌 →</span>
              </span>
            </Link>
          </div>
          <p className="site-home-entry-more" data-reveal>
            <Link to="/blog">全部文章 →</Link>
          </p>
        </section>

        <SiteFaq title="常见问题" items={HOME_FAQ} />

        <SiteFinalCta title="开始使用 BIU" />
    </SiteChrome>
  )
}
