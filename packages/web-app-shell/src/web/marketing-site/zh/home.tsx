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
    label: '页面',
    video: { webm: '/site/demo-allinone.webm', mp4: '/site/demo-allinone.mp4' },
    image: '/site/demo-allinone.webp',
    size: [3840, 2400],
    lead: '在 BIU 里，页面上的每一块都是一个真正能用的软件 —— 表格、画板、代码练习、视频剪辑，都来自插件。把它们放进同一页，就是一套为你的客户准备好的服务：刊头、画板、算法题、代码运行、offer 对比放在一起，就是交给学员的一整套算法面试陪跑服务。',
    alt: 'BIU 页面：一份算法面试陪跑，刊头、Excalidraw 画板、算法题卡片、代码运行块和 offer 对比矩阵放在同一页',
  },
  {
    id: 'plugins',
    label: '插件',
    image: '/site/shot-plugins.webp',
    size: [3840, 2400],
    lead: '页面上的每一块都来自一个插件。装一个插件，就多一种块；缺的那一种，让智能体写一个。',
    alt: 'BIU 插件表：Excalidraw 画板、算法题卡片、代码运行块等插件，一键安装、启用',
  },
  {
    id: 'share',
    label: '分享',
    image: '/site/shot-share.webp',
    size: [3840, 2400],
    lead: '插件跟着页面走。分享时正文、附件和用到的插件一起打包，对方打开链接，画板和算法题照样能用。',
    alt: 'BIU 分享页：对方打开链接，页面里的画板和算法题卡片照样能用',
  },
  {
    id: 'component',
    label: '组件',
    image: '/site/demo-component.webp',
    size: [3840, 2160],
    lead: '页面多了，同一种插件会散落在各处。组件把它们重新收集起来，按类型结构化成表，每一个都能单独打开、编辑。',
    alt: 'BIU 组件：散落在各个页面里的视频编排块被收集成一张表，同一个组件在专属编辑器里打开',
  },
  {
    id: 'data',
    label: '数据',
    image: '/site/demo-file-system.webp',
    size: [3840, 2160],
    lead: '不只是组件。代理、页面、任务、插件，工作区里的一切都是表，用同一套筛选、视图和地址，还能分栏并排看。',
    alt: 'BIU 数据：代理表和页面表在同一个工作区里分栏并排打开',
  },
  {
    id: 'reference',
    label: '引用',
    image: '/site/demo-context.webp',
    size: [3840, 2160],
    lead: '都是结构化的数据，就能被直接引用。把页面、代理、组件加进输入框，智能体读的就是你选中的这些，不多也不少。',
    alt: 'BIU 引用：页面、代理、插件作为可移除的标签放进输入框，交给智能体',
  },
] as const

/** 工作区里现成的插件，每张卡一句话说清它在页面里做什么。 */
const PLUGIN_WALL = [
  { glyph: '✎', name: 'Excalidraw 画板', body: '手绘风白板，放大就能画，源文件跟着页面走。' },
  { glyph: '{}', name: '算法题卡片', body: '左边题面，右边代码，LeetCode 风的练习块。' },
  { glyph: '▶', name: '代码运行块', body: 'Python、Go、Java 等十几种语言，页面里直接跑。' },
  { glyph: '⚖', name: '方案对比块', body: '多方案 × 多维度加权打分，自动给出推荐。' },
  { glyph: '◧', name: '视频编排', body: '用时间线脚本剪辑，前端实时合成预览。' },
  { glyph: '</>', name: 'HTML', body: '静态卡片或能跑脚本的小应用，放映模式一键全屏。' },
  { glyph: '$_', name: '页面终端', body: '真实交互终端，每个块一个独立代理。' },
  { glyph: '⇄', name: 'API 调试块', body: '填好请求点发送，响应和历史都留在页面里。' },
  { glyph: '◎', name: '浏览器', body: '网页卡片，点开就是侧栏里的真浏览器。' },
  { glyph: '✓', name: '页面回归检查', body: '写一组断言，点一下逐条跑，对比上一次结果。' },
  { glyph: '≡', name: '页面目录', body: '列出这一页的标题，点击跳转。' },
  { glyph: '✦', name: '枪火', body: '2D 小游戏。连游戏都能是一个插件。' },
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
    title: '块就是软件',
    body: '页面里的每一块都是一个真正能用的小软件：表格、画板、代码练习、视频剪辑……它们来自可安装的插件，不是平台写死的几种格式。',
    to: '/product#plugins',
  },
  {
    title: '页面把软件组合起来',
    body: '一页里放几个插件，就组合出一套服务。它们读写同一份数据，页面上的属性就是它们共同的运行环境。',
    to: '/product#pages',
  },
  {
    title: '分享的是一页能用的软件',
    body: '分享页面时，正文、附件和用到的插件源码一起打包。对方打开就能用，而不是收到一份截图或一个链接。',
    to: '/product#share',
  },
] as const

const AGENT_POINTS = [
  {
    title: '读得到你的页面',
    body: '智能体和你操作的是同一份数据，不用把资料复制粘贴给它。',
  },
  {
    title: '产出直接落成页面',
    body: '结果写成页面、表格或任务，不会沉在聊天记录里，下一轮接着用。',
  },
  {
    title: '自己能造插件',
    body: '缺一个工具，就让智能体写一个插件挂进页面。扩展不再只属于开发者。',
  },
] as const

/**
 * 首页只放三个最常被拿来问的对手。一句话是给卡片的，
 * 长对照表留在对比页 —— Notion 的 biuWhen 太长，不能直接贴上来。
 */
const HOME_COMPARE_LINE = {
  'vs-notion': '块的种类由插件决定，一页可以装下几个软件。',
  'vs-obsidian': '同样可以留在本机，插件块读写的是结构化数据。',
  'vs-chatgpt': '结果落成页面，下一轮接着用，不沉在聊天记录里。',
} as const

const HOME_COMPARES = COMPARE_FEATURED.flatMap((slug) => {
  const page = COMPARE_PAGES.find((item) => item.slug === slug)
  const line = HOME_COMPARE_LINE[slug]
  return page && line ? [{ page, line }] : []
})

const HERO_VERBS = [
  ['构建', 'build-software'],
  ['存储', 'store-software'],
  ['组合', 'compose-software'],
  ['分发', 'distribute-software'],
  ['衍生', 'derive-software'],
] as const

/** 日期相同则保持稿序，取最前面两篇作为首页入口。 */
const HOME_POSTS = BLOG_POSTS
  .map((post, index) => ({ post, index }))
  .sort((a, b) => (a.post.date < b.post.date ? 1 : a.post.date > b.post.date ? -1 : a.index - b.index))
  .slice(0, 2)
  .map(({ post }) => post)

const HOME_FAQ = [
  ['BIU 是什么', 'BIU 是桌面应用：用页面把若干软件组合成一套服务，智能体与用户在同一工作区中工作。页面可以整页分享，接收方打开即可使用。'],
  ['定价', 'BIU 开源且免费，桌面版与自部署不收费。智能体调用的是用户自行配置的模型服务，费用由模型服务商收取。'],
  ['数据存放位置', '创建空间时由用户选择：本机空间存放在用户自己的电脑上，云端空间存放在用户部署的服务器上。'],
  ['是否需要编程', '日常使用页面、表格和现成插件即可。需要新的块时，可以由智能体编写。'],
] as const

export function MarketingHome({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: 'BIU · 用一个页面，组合所有软件',
    description: '改变世界构建、存储、组合、分发、衍生软件的方式，定义下一代人与 AI 协作的媒介。一个页面，组合所有软件。',
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
              <span>媒介即讯息</span>
              <cite>马歇尔·麦克卢汉</cite>
            </p>
            <h1 aria-label="改变世界构建、存储、组合、分发、衍生软件的方式">
              <span>改变世界</span>
              <span className="site-hero-verbs">
                {HERO_VERBS.map(([word, slug], index) => (
                  <Link key={slug} to={`/blog/${slug}`}>
                    {word}
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
            <h2>一页，就是一套服务</h2>
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

        <section className="site-capabilities" aria-label="All in One">
          <div className="site-capabilities-heading" data-reveal>
            <p className="site-section-label">All in One</p>
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
            多数文档工具的块类型是固定的，嵌进来的网页也读不到你的数据。BIU 的块由插件提供，谁都能写，写好就能和页面里的其他块一起工作。
            <Link to="/compare/vs-notion">看和 Notion 的对比 →</Link>
          </p>
        </section>

        <section className="site-plugin-wall" aria-label="插件">
          <div className="site-plugin-wall-heading" data-reveal>
            <p className="site-section-label">插件</p>
            <h2>今天就能放进页面的软件</h2>
            <p>下面这些都是工作区里现成的插件，装上就多一种块。缺的那一个，可以让智能体写一个。</p>
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
            <Link to="/product#plugins">插件怎么写、怎么装 →</Link>
          </p>
        </section>

        <section className="site-agent" aria-label="智能体">
          <div className="site-agent-heading" data-reveal>
            <p className="site-section-label">智能体</p>
            <h2>智能体也住在页面里</h2>
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
              <p className="site-section-label">数据控制</p>
              <h2>数据在哪里，<br />由你决定</h2>
            </div>
            <div className="site-space-options">
              <article data-reveal>
                <span className="site-space-index">01</span>
                <h3>本机空间</h3>
                <p>页面、表格和附件都存在你自己的电脑上，离线也能用。只有调用模型时，相关内容才会发给你配置的模型服务。</p>
                <small>本地保存 · 离线可用 · 自带模型密钥</small>
              </article>
              <article data-reveal>
                <span className="site-space-index">02</span>
                <h3>云端空间</h3>
                <p>需要多设备访问、和团队一起工作时使用。成员、权限与在线协作都在空间里管理。官方云端服务即将上线，现在可以先自部署。</p>
                <small>多设备 · 成员权限 · 在线协作 · 即将上线</small>
              </article>
            </div>
          </div>
        </section>

        <section className="site-home-entry" aria-label="场景">
          <div className="site-home-entry-heading" data-reveal>
            <p className="site-section-label">场景</p>
            <h2>这些工作，都能装进一页</h2>
            <p>选一个你正在做的事。交付物、痛点和做法都在对应的那一页，这里只留一句话。</p>
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
            <Link to="/use-cases">全部场景 →</Link>
          </p>
        </section>

        <section className="site-home-entry" aria-label="对比">
          <div className="site-home-entry-heading" data-reveal>
            <p className="site-section-label">对比</p>
            <h2>和你已经在用的工具比</h2>
            <p>三个最常被拿来问的。完整对照表，包括我们做不到的地方，都在对比页。</p>
          </div>
          <div className="site-home-compare-grid">
            {HOME_COMPARES.map(({ page, line }) => (
              <Link key={page.slug} className="site-home-compare-card" to={`/compare/${page.slug}`} data-reveal>
                <small>{page.category}</small>
                <h3>{page.columns[0]}</h3>
                <p>{line}</p>
                <span>看对比 →</span>
              </Link>
            ))}
          </div>
          <p className="site-home-entry-more" data-reveal>
            <Link to="/compare">全部对比 →</Link>
          </p>
        </section>

        <section className="site-home-entry" aria-label="想法">
          <div className="site-home-entry-heading" data-reveal>
            <p className="site-section-label">想法</p>
            <h2>BIU 为什么长成这样</h2>
            <p>产品页讲怎么用。这里是两篇把理由讲完的文章，以及标记本身在说的那句话。</p>
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

        <section className="site-home-entry site-vision" aria-label="愿景">
          <div className="site-home-entry-heading" data-reveal>
            <p className="site-section-label">愿景</p>
            <h2>五个动词，五个万亿美元市场</h2>
            <p>
              软件的构建、存储、组合、分发与衍生，各自对应一个万亿美元量级的市场。智能体正在重写这五个环节，BIU 让它们在同一个页面里完成。我们正在寻找相信这一判断的投资人。
            </p>
          </div>
          <VisionTable />
          <div className="site-vision-invest" data-reveal>
            <div>
              <h3>投资下一家万亿美元 AI 公司</h3>
              <p>欢迎来信交流产品路线与融资计划。来信请注明机构与关注方向。</p>
              <p className="site-vision-note">表中数据出自 Gartner、IDC、麦肯锡、哈佛商学院等机构，每篇文章末尾列有完整的参考资料。</p>
            </div>
            <a className="site-cta-primary" href={INVEST_MAIL}>
              联系我们
            </a>
          </div>
          <p className="site-home-entry-more" data-reveal>
            <Link to="/invest">完整的投资逻辑 →</Link>
          </p>
        </section>

        <SiteFaq title="关于 BIU" items={HOME_FAQ} />

        <SiteFinalCta title={<>开源，免费，<br />现在就能用</>} />
    </SiteChrome>
  )
}
