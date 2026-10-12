import { useEffect, useRef, useState, type FormEvent } from 'react'

const PRODUCT_SURFACES = [
  { id: 'page', label: '页面', path: '/pages?landingPreview=1' },
  { id: 'database', label: '数据库', path: '/database?landingPreview=1' },
  { id: 'chat', label: '会话', path: '/?landingPreview=1' },
] as const

const SOLUTIONS = [
  { index: '01', title: '研究与分析', body: '收集资料、建立关系、生成对比表，并把结论留在可继续追问的研究空间。', output: '研究报告 · 数据库 · 对比矩阵' },
  { index: '02', title: '产品与项目', body: '从用户反馈和项目资料中整理需求、任务、决策与版本计划。', output: 'PRD · 项目计划 · 任务数据库' },
  { index: '03', title: '内容与创作', body: '让素材、草稿、反馈和不同发布版本共享同一份创作上下文。', output: '文章 · 脚本 · 发布计划' },
  { index: '04', title: '团队知识', body: '把文档、流程和讨论变成团队可以查询、维护并继续使用的知识。', output: '团队 Wiki · 流程库 · 决策记录' },
  { index: '05', title: '私人工作', body: '把个人资料与工作流留在本机，保持离线可用和清晰的数据边界。', output: '本机页面 · 私人资料 · 离线空间' },
  { index: '06', title: '团队协作', body: '让成员围绕同一个云端空间共享页面、数据、会话和智能体。', output: '成员权限 · 协作空间 · 共享上下文' },
] as const

export function MarketingHome({ onLogin, onStart }: { onLogin: () => void; onStart: () => void }) {
  const siteRef = useRef<HTMLDivElement>(null)
  const [task, setTask] = useState('')
  const [activeSurface, setActiveSurface] = useState(0)
  const surface = PRODUCT_SURFACES[activeSurface]!

  useEffect(() => {
    const root = siteRef.current
    if (!root) return
    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))
    if (typeof IntersectionObserver === 'undefined') {
      for (const item of items) item.classList.add('is-visible')
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
        }
      },
      { root, rootMargin: '0px 0px -10% 0px', threshold: 0.12 },
    )
    for (const item of items) observer.observe(item)
    return () => observer.disconnect()
  }, [])

  const submitTask = (event: FormEvent) => {
    event.preventDefault()
    onStart()
  }

  return (
    <div ref={siteRef} className="site" data-testid="auth-gate">
      <header className="site-nav">
        <a className="site-brand" href="/">BIU</a>
        <nav className="site-nav-links" aria-label="官网">
          <a href="#product">产品</a>
          <a href="#solutions">解决方案</a>
          <a href="#spaces">本机与云端</a>
          <a href="#ecosystem">扩展</a>
        </nav>
        <div className="site-nav-actions">
          <button type="button" className="site-login" data-testid="site-login" onClick={onLogin}>登录</button>
          <button type="button" className="site-start" data-testid="site-start" onClick={onStart}>开始使用</button>
        </div>
      </header>
      <main>
        <section className="site-hero">
          <div className="site-hero-art" aria-hidden>
            <span className="site-hero-orb site-hero-orb-one" />
            <span className="site-hero-orb site-hero-orb-two" />
            <span className="site-hero-line site-hero-line-one" />
            <span className="site-hero-line site-hero-line-two" />
          </div>
          <div className="site-hero-copy" data-reveal>
            <p className="site-eyebrow">BIU · 智能工作空间</p>
            <h1>让知识留下，<br />让工作继续。</h1>
            <p className="site-hero-lead">页面、数据、会话与智能体，共享同一个空间上下文。</p>
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

        <section className="site-intro" id="product" data-reveal>
          <p className="site-section-label">产品</p>
          <h2>不只是回答问题。<br />而是交付完整工作。</h2>
          <p className="site-intro-copy">BIU 把资料、页面、数据库和对话收进同一个上下文。智能体可以理解工作、使用工具，并把结果写回空间。</p>
        </section>

        <section className="site-product-demo" data-reveal>
          <div className="site-demo-heading">
            <p className="site-section-label">从任务到结果</p>
            <h2>看见 BIU 如何工作。</h2>
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
            <div className="site-demo-browser-bar" aria-hidden>
              <i /><i /><i />
              <span>BIU · {surface.label}</span>
              <em>真实产品界面 · 无用户数据</em>
            </div>
            <iframe
              key={surface.id}
              src={surface.path}
              title={`BIU ${surface.label}界面预览`}
              tabIndex={-1}
            />
          </div>
        </section>

        <section className="site-solutions" id="solutions">
          <div className="site-solutions-heading" data-reveal>
            <p className="site-section-label">解决方案</p>
            <h2>为真实工作而生。</h2>
            <p>从一个问题开始，交付可以继续使用的页面、数据和空间。</p>
          </div>
          <div className="site-solution-grid">
            {SOLUTIONS.map((item) => (
              <article key={item.index} data-reveal>
                <span className="site-solution-index">{item.index}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <small>{item.output}</small>
                <button type="button" onClick={onStart} aria-label={`开始${item.title}`}>↗</button>
              </article>
            ))}
          </div>
        </section>

        <section className="site-continuity">
          <div className="site-continuity-heading" data-reveal>
            <p className="site-section-label">持续上下文</p>
            <h2>不必每次重新解释<br />你正在做什么。</h2>
          </div>
          <div className="site-context-flow" data-reveal aria-label="空间上下文">
            <div><span>01</span><strong>页面</strong><p>背景、资料与想法</p></div>
            <i>→</i>
            <div><span>02</span><strong>数据</strong><p>任务、关系与状态</p></div>
            <i>→</i>
            <div><span>03</span><strong>会话</strong><p>讨论、执行与结果</p></div>
            <i>→</i>
            <div><span>04</span><strong>空间</strong><p>持续积累的上下文</p></div>
          </div>
        </section>

        <section className="site-space-section" id="spaces">
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
        </section>

        <section className="site-ecosystem" id="ecosystem">
          <div className="site-ecosystem-heading" data-reveal>
            <p className="site-section-label">扩展 BIU</p>
            <h2>把你的工具与知识<br />带进空间。</h2>
          </div>
          <div className="site-ecosystem-grid">
            <article data-reveal>
              <div className="site-ecosystem-symbol">＋</div>
              <p>Plugins</p>
              <h3>为 BIU 增加新的产品能力。</h3>
              <span>页面模块、工作台工具和领域功能都可以成为插件。</span>
            </article>
            <article data-reveal>
              <div className="site-ecosystem-symbol">／</div>
              <p>Skills</p>
              <h3>把专业方法变成可重复的工作流。</h3>
              <span>让智能体发现并使用团队已有的知识与规范。</span>
            </article>
            <article data-reveal>
              <div className="site-ecosystem-symbol">⌁</div>
              <p>MCP</p>
              <h3>连接外部服务、工具与数据。</h3>
              <span>在清晰的权限边界内调用空间之外的能力。</span>
            </article>
          </div>
        </section>

        <section className="site-manifesto" id="about">
          <div className="site-manifesto-mark" aria-hidden data-reveal>B</div>
          <div className="site-manifesto-copy" data-reveal>
            <p className="site-section-label">我们的想法</p>
            <blockquote>真正有用的智能，不应该打断工作。它应该住在工作发生的地方。</blockquote>
            <p>BIU 不是另一个临时聊天窗口。它是一套让人、知识与智能体共同工作的空间系统。</p>
          </div>
        </section>

        <section className="site-faq">
          <div className="site-faq-heading" data-reveal>
            <p className="site-section-label">常见问题</p>
            <h2>开始之前，<br />你可能想知道。</h2>
          </div>
          <div className="site-faq-list" data-reveal>
            <details><summary>BIU 和普通 AI 聊天产品有什么不同？</summary><p>BIU 的上下文属于空间。页面、数据库、会话和智能体共享同一份工作背景，结果也会留在空间中继续使用。</p></details>
            <details><summary>本机空间和云端空间有什么区别？</summary><p>本机空间的数据保存在当前设备；云端空间支持多设备访问、成员权限与在线协作。创建空间时由你决定。</p></details>
            <details><summary>BIU 可以连接其他工具吗？</summary><p>可以。BIU 通过 Plugins、Skills 和 MCP 扩展产品功能、专业工作流与外部服务。</p></details>
            <details><summary>智能体可以在空间里做什么？</summary><p>智能体可以读取页面、查询和更新数据库、使用技能与工具，并将完成的结果写回当前空间。</p></details>
          </div>
        </section>

        <section className="site-final-cta" data-reveal>
          <p className="site-section-label">开始使用 BIU</p>
          <h2>给知识一个归处。<br />给工作一个继续的地方。</h2>
          <button type="button" onClick={onStart}>创建你的空间 <span>↗</span></button>
        </section>
      </main>
      <footer className="site-footer">
        <a className="site-footer-brand" href="/">BIU</a>
        <div className="site-footer-columns">
          <div><strong>产品</strong><a href="#product">产品演示</a><a href="#spaces">本机与云端</a><a href="#ecosystem">扩展能力</a></div>
          <div><strong>解决方案</strong><a href="#solutions">研究与分析</a><a href="#solutions">产品与项目</a><a href="#solutions">内容与创作</a></div>
          <div><strong>开始</strong><button type="button" onClick={onLogin}>登录</button><button type="button" onClick={onStart}>创建空间</button></div>
        </div>
        <p>让知识留下，让工作继续。</p>
      </footer>
    </div>
  )
}
