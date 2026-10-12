import { useEffect, useRef } from 'react'

export function MarketingHome({ onLogin, onStart }: { onLogin: () => void; onStart: () => void }) {
  const siteRef = useRef<HTMLDivElement>(null)

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

  return (
    <div ref={siteRef} className="site" data-testid="auth-gate">
      <header className="site-nav">
        <a className="site-brand" href="/">BIU</a>
        <nav className="site-nav-links" aria-label="官网">
          <a href="#product">产品</a>
          <a href="#spaces">空间</a>
          <a href="#agents">智能体</a>
          <a href="#about">关于 BIU</a>
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
            <h1>让想法持续发生。</h1>
            <p className="site-hero-lead">页面、数据、会话与智能体，在一个空间里共同生长。</p>
            <button type="button" className="site-hero-cta" onClick={onStart}>开始使用 BIU <span>↗</span></button>
          </div>
          <p className="site-scroll-note">向下探索</p>
        </section>

        <section className="site-intro" id="product" data-reveal>
          <p className="site-section-label">产品</p>
          <h2>工作不是在应用之间切换。<br />工作是在思考中向前。</h2>
          <p className="site-intro-copy">BIU 把分散的页面、资料和对话收进同一个上下文。智能体看得见你正在做的事，也能在你允许的范围内继续完成它。</p>
        </section>

        <section className="site-feature-grid">
          <article className="site-feature site-feature-primary" data-reveal>
            <div className="site-feature-visual site-canvas" aria-hidden>
              <span className="site-canvas-nav" />
              <span className="site-canvas-page" />
              <span className="site-canvas-chat" />
            </div>
            <div className="site-feature-copy">
              <p>统一工作台</p>
              <h3>写下、组织、讨论，然后交给智能体。</h3>
              <span>页面、数据库和会话不再是孤岛。</span>
            </div>
          </article>
          <article className="site-feature site-feature-secondary" id="agents" data-reveal>
            <div className="site-feature-visual site-agent-visual" aria-hidden>
              <span />
              <span />
              <span />
            </div>
            <div className="site-feature-copy">
              <p>智能体</p>
              <h3>理解空间，也理解正在发生的工作。</h3>
              <span>上下文跟随空间，而不是散落在每次对话里。</span>
            </div>
          </article>
        </section>

        <section className="site-space-section" id="spaces">
          <div className="site-space-heading" data-reveal>
            <p className="site-section-label">空间</p>
            <h2>数据在哪里，<br />由你决定。</h2>
          </div>
          <div className="site-space-options">
            <article data-reveal>
              <span className="site-space-index">01</span>
              <h3>云端空间</h3>
              <p>随时访问，与团队一起工作。成员、权限与在线协作都在空间中管理。</p>
            </article>
            <article data-reveal>
              <span className="site-space-index">02</span>
              <h3>本机空间</h3>
              <p>数据留在当前设备。适合私人资料、离线工作和需要完全本地控制的内容。</p>
            </article>
          </div>
        </section>

        <section className="site-manifesto" id="about">
          <div className="site-manifesto-mark" aria-hidden data-reveal>B</div>
          <div className="site-manifesto-copy" data-reveal>
            <p className="site-section-label">我们的想法</p>
            <blockquote>真正有用的智能，不应该打断工作。它应该住在工作发生的地方。</blockquote>
            <p>BIU 不是另一个聊天窗口。它是一套让人、知识与智能体共同工作的空间系统。</p>
          </div>
        </section>

        <section className="site-use-cases">
          <div className="site-use-heading" data-reveal>
            <p className="site-section-label">为真实工作而生</p>
            <h2>从一个想法，<br />到完整的工作流。</h2>
          </div>
          <div className="site-use-list">
            <article data-reveal><span>01</span><h3>知识与研究</h3><p>沉淀资料、建立关联，让智能体沿着你的知识继续探索。</p></article>
            <article data-reveal><span>02</span><h3>项目与协作</h3><p>把任务、决策和讨论留在同一个项目上下文中。</p></article>
            <article data-reveal><span>03</span><h3>创作与构建</h3><p>从草稿到交付，保留每一步思考与执行过程。</p></article>
          </div>
        </section>

        <section className="site-final-cta" data-reveal>
          <p className="site-section-label">开始使用 BIU</p>
          <h2>给想法一个<br />可以生长的空间。</h2>
          <button type="button" onClick={onStart}>创建你的空间 <span>↗</span></button>
        </section>
      </main>
      <footer className="site-footer">
        <a className="site-footer-brand" href="/">BIU</a>
        <div className="site-footer-links">
          <a href="#product">产品</a>
          <a href="#spaces">空间</a>
          <a href="#agents">智能体</a>
        </div>
        <p>让想法持续发生。</p>
      </footer>
    </div>
  )
}
