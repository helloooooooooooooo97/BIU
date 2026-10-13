import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { SiteChrome, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'

/**
 * 产品截图。
 * P0-13：原先这里嵌 3 个 iframe，每个都会完整加载一次 BIU web 应用 —— 首屏 LCP 被拖死。
 * 换成 docs/demo 里的真实产品截图（已拷到 public/site/），首屏不再发 3 个应用。
 * 长期目标（P2-30）：换成不注册就能跑的受限沙盒。
 */
const PRODUCT_SURFACES = [
  {
    id: 'file-system',
    label: '页面与数据',
    image: '/site/demo-file-system.png',
    alt: 'BIU File System：会话与页面是同一个工作区里并列打开的普通表',
  },
  {
    id: 'component',
    label: '组件',
    image: '/site/demo-component.png',
    alt: 'BIU 组件：页面里组合可复用的视频块，同一组件在专属编辑器中打开',
  },
  {
    id: 'context',
    label: '会话上下文',
    image: '/site/demo-context.png',
    alt: 'BIU 上下文：页面、会话、插件等工作区项目成为可移除的上下文标签',
  },
] as const

/** 首页核心能力：三条，每条指向产品页对应锚点。 */
const CAPABILITIES = [
  {
    index: '01',
    title: 'File System',
    body: '页面、表格、任务、插件都是同一个工作区里可寻址的对象。',
    to: '/product#file-system',
  },
  {
    index: '02',
    title: 'Agent 工作台',
    body: '人和智能体操作同一份数据，不是两套需要同步的副本。',
    to: '/product#agent',
  },
  {
    index: '03',
    title: '数据自主',
    body: '本机空间数据不出设备；云端空间按需协作。',
    to: '/product#spaces',
  },
] as const

// 用户证言：真实用户证言待 P3 补齐，这里先标注为「团队自述」。
const VOICES = [
  { quote: '智能体读的就是我写的那一份数据，不用再复制粘贴给它。', who: 'BIU 团队' },
  { quote: '产出会留下来变成页面和表，下一轮直接接着用。', who: 'BIU 团队' },
  { quote: '敏感资料放本机空间，边界是清楚的。', who: 'BIU 团队' },
] as const

export function MarketingHome({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: 'BIU · 智能工作空间',
    description: '人和智能体共享同一个空间：页面、数据、会话、任务都在一处，数据留在你的设备上。',
    path: '/',
  })
  const [task, setTask] = useState('')
  const [activeSurface, setActiveSurface] = useState(0)
  const surface = PRODUCT_SURFACES[activeSurface]!

  const submitTask = (event: FormEvent) => {
    event.preventDefault()
    // 冷启动阶段没有匿名沙盒，用户输入先转交注册流程。
    // TODO(P2-30)：首屏真能跑（不注册跑受限沙盒）后，改为透传首条消息。
    void task
    onStart()
  }

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-hero">
          <div className="site-hero-copy site-container" data-reveal>
            <p className="site-eyebrow">BIU · 智能工作空间</p>
            <h1>让知识留下，<br />让工作继续。</h1>
            <p className="site-hero-lead">
              人和智能体共享同一个空间：页面、数据、会话、任务都在一处，<strong>数据留在你的设备上</strong>。
            </p>
            <form className="site-task-box" onSubmit={submitTask}>
              <input
                value={task}
                onChange={(event) => setTask(event.target.value)}
                aria-label="你想完成什么"
                placeholder="你想在这个空间里完成什么？"
              />
              <button type="submit" aria-label="开始任务">↑</button>
            </form>
            <div className="site-task-suggestions" aria-label="任务示例">
              {['整理研究报告', '创建项目空间', '分析资料并生成表格'].map((item) => (
                <button type="button" key={item} onClick={() => setTask(item)}>{item}</button>
              ))}
            </div>
          </div>
          <p className="site-scroll-note">向下探索</p>
        </section>

        <section className="site-product-demo" data-reveal>
          <div className="site-demo-heading">
            <p className="site-section-label">从任务到结果</p>
            <h2>看见 BIU 如何工作。</h2>
            <p className="site-demo-lead">BIU 把资料、页面、数据库和对话收进同一个上下文。智能体可以理解工作、使用工具，并把结果写回空间。</p>
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

        <section className="site-capabilities" aria-label="核心能力">
          <div className="site-capabilities-heading" data-reveal>
            <p className="site-section-label">核心能力</p>
            <h2>三条，说清 BIU 是什么。</h2>
          </div>
          <div className="site-capability-grid">
            {CAPABILITIES.map((item) => (
              <article key={item.index} data-reveal>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <Link to={item.to}>了解更多 →</Link>
              </article>
            ))}
          </div>
        </section>

        <section className="site-space-section" id="spaces">
          <div className="site-space-inner site-container">
            <div className="site-space-heading" data-reveal>
              <p className="site-section-label">数据控制</p>
              <h2>数据在哪里，<br />由你决定。</h2>
            </div>
            <div className="site-space-options">
              <article data-reveal>
                <span className="site-space-index">01</span>
                <h3>云端空间</h3>
                <p>随时访问，与团队一起工作。成员、权限与在线协作都在空间中管理。</p>
                <small>多设备 · 成员权限 · 在线协作</small>
              </article>
              <article data-reveal>
                <span className="site-space-index">02</span>
                <h3>本机空间</h3>
                <p>数据留在当前设备。适合私人资料、离线工作和需要完全本地控制的内容。</p>
                <small>本地保存 · 离线可用 · 清晰边界</small>
              </article>
            </div>
          </div>
        </section>

        <section className="site-voices" aria-label="用户评价">
          <div className="site-voices-heading" data-reveal>
            <p className="site-section-label">使用感受</p>
            <h2>他们怎么用它。</h2>
          </div>
          <div className="site-voice-grid">
            {VOICES.map((voice) => (
              <blockquote key={voice.quote} data-reveal>
                <p>{voice.quote}</p>
                <cite>{voice.who}</cite>
              </blockquote>
            ))}
          </div>
        </section>

        <section className="site-final-cta" data-reveal>
          <div className="site-container">
            <p className="site-section-label">开始使用 BIU</p>
            <h2>给知识一个归处。<br />给工作一个继续的地方。</h2>
            <button type="button" onClick={onStart}>创建你的空间 <span>↗</span></button>
          </div>
        </section>
    </SiteChrome>
  )
}
