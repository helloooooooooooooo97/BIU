import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DownloadIcon, GITHUB_URL, GitHubIcon, SiteChrome, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'

/**
 * 产品截图。
 * P0-13：原先这里嵌 3 个 iframe，每个都会完整加载一次 BIU web 应用 —— 首屏 LCP 被拖死。
 * 换成 docs/demo 里的真实产品截图（已拷到 public/site/），首屏不再发 3 个应用。
 * 长期目标（P2-30）：换成不注册就能跑的受限沙盒。
 */
const PRODUCT_SURFACES = [
  {
    id: 'component',
    label: '组件',
    image: '/site/demo-component.png',
    alt: 'BIU 组件：页面里放着一个视频剪辑块，同一个组件也能在专属编辑器里打开',
  },
  {
    id: 'file-system',
    label: '页面与数据',
    image: '/site/demo-file-system.png',
    alt: 'BIU 页面与数据：会话、页面、表格在同一个工作区里并排打开',
  },
  {
    id: 'context',
    label: '会话上下文',
    image: '/site/demo-context.png',
    alt: 'BIU 会话上下文：页面、插件等工作区里的东西直接作为上下文交给智能体',
  },
] as const

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
              <a className="site-cta-secondary" href={GITHUB_URL} target="_blank" rel="noreferrer"><GitHubIcon />GitHub</a>
            </div>
          </div>
          <p className="site-scroll-note">向下探索</p>
        </section>

        <section className="site-product-demo" data-reveal>
          <div className="site-demo-heading">
            <p className="site-section-label">真实界面</p>
            <h2>页面里放的是软件，不是截图</h2>
            <p className="site-demo-lead">视频剪辑块就嵌在页面里，也能在专属编辑器里打开。页面、表格、会话都在同一个工作区，智能体看到的和你看到的是同一份东西。</p>
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
          <div className="site-demo-real-frame">
            <img
              key={surface.id}
              className="site-demo-shot"
              src={surface.image}
              alt={surface.alt}
              width={1920}
              height={1080}
              loading="lazy"
              decoding="async"
            />
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
