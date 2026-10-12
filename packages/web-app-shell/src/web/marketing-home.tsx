export function MarketingHome({ onLogin, onStart }: { onLogin: () => void; onStart: () => void }) {
  return (
    <div className="site" data-testid="auth-gate">
      <header className="site-nav">
        <a className="site-brand" href="/">BIU</a>
        <nav className="site-nav-links" aria-label="官网">
          <a href="#stories">产品</a>
          <a href="#stories">空间</a>
          <a href="#stories">智能体</a>
        </nav>
        <div className="site-nav-actions">
          <button type="button" className="site-login" data-testid="site-login" onClick={onLogin}>登录</button>
          <button type="button" className="site-start" data-testid="site-start" onClick={onStart}>开始使用</button>
        </div>
      </header>
      <main>
        <section className="site-hero">
          <div className="site-hero-copy">
            <p>产品</p>
            <h1>让页面、会话和智能体待在同一个空间里。</h1>
          </div>
        </section>
        <section className="site-stories" id="stories">
          <article className="site-story">
            <div className="site-story-media" />
            <p>空间</p>
            <h2>云端空间给团队，本机空间留在这台设备。</h2>
          </article>
          <article className="site-story">
            <div className="site-story-media site-story-media-alt" />
            <p>智能体</p>
            <h2>换一个空间，就换一套页面和对话。</h2>
          </article>
        </section>
      </main>
    </div>
  )
}
