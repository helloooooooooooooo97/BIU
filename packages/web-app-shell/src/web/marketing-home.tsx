export function MarketingHome({ onLogin, onStart }: { onLogin: () => void; onStart: () => void }) {
  return (
    <div className="site" data-testid="auth-gate">
      <header className="site-nav">
        <a className="site-brand" href="/">BIU</a>
        <nav className="site-nav-links" aria-label="官网">
          <a href="#product">产品</a>
          <a href="#spaces">空间</a>
          <a href="#agents">智能体</a>
        </nav>
        <div className="site-nav-actions">
          <button type="button" className="site-login" data-testid="site-login" onClick={onLogin}>登录</button>
          <button type="button" className="site-start" data-testid="site-start" onClick={onStart}>开始使用</button>
        </div>
      </header>
      <main>
        <section className="site-hero">
          <h1>想法、数据和智能体，<br />在同一个空间里运转。</h1>
          <p>BIU 把页面、会话和协作放在一起。云端空间给团队共用，本机空间只留在这台设备上。</p>
          <div className="site-hero-actions">
            <button type="button" className="site-start" onClick={onStart}>开始使用</button>
            <button type="button" className="site-login site-login-hero" onClick={onLogin}>登录</button>
          </div>
        </section>
        <section className="site-grid" id="product">
          <article>
            <h2>页面</h2>
            <p>正文、附件和引用留在同一个库里，打开就能接着写。</p>
          </article>
          <article id="spaces">
            <h2>空间</h2>
            <p>云端空间保存在云上。本机空间保存在这台设备上，互不混用。</p>
          </article>
          <article id="agents">
            <h2>智能体</h2>
            <p>会话跟着空间走。换一个空间，就进入那一套页面和对话。</p>
          </article>
        </section>
      </main>
      <footer className="site-foot">
        <span>BIU</span>
        <span>工作空间</span>
      </footer>
    </div>
  )
}
