import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DownloadIcon, GitHubButton, SiteChrome, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'

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
    lead: '先有一页。刊头、画板、算法题、代码运行、offer 对比放在一起，就是交给学员的一整套算法面试陪跑服务。',
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
    lead: '不只是组件。会话、页面、任务、插件，工作区里的一切都是表，用同一套筛选、视图和地址，还能分栏并排看。',
    alt: 'BIU 数据：会话表和页面表在同一个工作区里分栏并排打开',
  },
  {
    id: 'reference',
    label: '引用',
    image: '/site/demo-context.webp',
    size: [3840, 2160],
    lead: '都是结构化的数据，就能被直接引用。把页面、会话、组件加进输入框，智能体读的就是你选中的这些，不多也不少。',
    alt: 'BIU 引用：页面、会话、插件作为可移除的标签放进输入框，交给智能体',
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
  { glyph: '$_', name: '页面终端', body: '真实交互终端，每个块一个独立会话。' },
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

export function MarketingHome({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: 'BIU · 用一个页面，组合所有软件',
    description: '开源、免费的 All in One 工作空间：页面里的每一块都是一个插件提供的真软件，一个页面就能把它们组合成服务。',
    path: '/',
  })
  const [activeSurface, setActiveSurface] = useState(0)
  const surface = PRODUCT_SURFACES[activeSurface]!
  const reducedMotion = usePrefersReducedMotion()

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-hero">
          <div className="site-hero-copy site-container" data-reveal>
            <p className="site-eyebrow">开源 · 免费 · All in One</p>
            <h1>一个页面，<br />组合所有软件</h1>
            <p className="site-hero-lead">
              在 BIU 里，页面上的每一块都是一个真正能用的软件 —— 表格、画板、代码练习、视频剪辑，都来自插件。
              把它们放进同一页，就是一套为你的客户准备好的服务。
            </p>
            <div className="site-cta-actions">
              <Link className="site-cta-primary" to="/download"><DownloadIcon />免费下载</Link>
              <GitHubButton label="GitHub" />
            </div>
            <img
              className="site-hero-shot"
              src="/site/shot-page.webp"
              alt=""
              width={1600}
              height={1000}
              loading="lazy"
              decoding="async"
            />
          </div>
          <p className="site-scroll-note">向下探索</p>
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
                poster={surface.image}
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
                <source src={surface.video.webm} type="video/webm" />
                <source src={surface.video.mp4} type="video/mp4" />
              </video>
            ) : (
              <img
                key={surface.id}
                className="site-demo-shot"
                src={surface.image}
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

        <SiteFinalCta title={<>开源，免费，<br />现在就能用</>} />
    </SiteChrome>
  )
}
