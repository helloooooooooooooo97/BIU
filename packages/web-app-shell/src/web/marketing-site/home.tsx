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

/** 还没有真实用户证言。这里写工作做完后空间里留下什么，不伪装成评价。 */
const OUTCOMES = [
  { title: '同一份数据', body: '智能体读的就是你写在空间里的页面和表，不用再复制粘贴一份给它。' },
  { title: '结果留得下', body: '讨论和生成的内容写回页面和表，下一轮从这里接着做。' },
  { title: '边界清楚', body: '私人资料放在本机空间；要一起改的内容再放到云端空间。' },
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
            <h1>让知识留下，<br />让工作继续。</h1>
            <p className="site-hero-lead">
              人和智能体共享同一个空间。页面、数据、会话和任务都在一处，数据留在你的设备上。
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
        </section>

        <section className="site-product-demo" data-reveal>
          <div className="site-demo-heading">
            <h2>打开空间，就是这样。</h2>
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
            <h2>页面、智能体、数据放在同一处。</h2>
          </div>
          <div className="site-capability-grid">
            {CAPABILITIES.map((item) => (
              <article key={item.index} data-reveal>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <Link to={item.to}>在产品页看细节</Link>
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
                <h3>云端空间</h3>
                <p>随时访问，和团队一起改。成员和权限在这个空间里管理。</p>
                <small>适合多设备和在线协作</small>
              </article>
              <article data-reveal>
                <h3>本机空间</h3>
                <p>数据留在当前设备。私人资料和离线工作放在这里。</p>
                <small>适合只在这台设备上保存</small>
              </article>
            </div>
          </div>
        </section>

        <section className="site-voices" aria-label="做完之后留下什么">
          <div className="site-voices-heading" data-reveal>
            <h2>做完之后，空间里留下这些。</h2>
          </div>
          <div className="site-voice-grid">
            {OUTCOMES.map((item) => (
              <article key={item.title} data-reveal>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="site-final-cta" data-reveal>
          <div className="site-container">
            <h2>给知识一个归处。<br />给工作一个继续的地方。</h2>
            <button type="button" onClick={onStart}>创建你的空间</button>
          </div>
        </section>
    </SiteChrome>
  )
}
