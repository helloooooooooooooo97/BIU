import { useState, type ReactNode } from 'react'
import { useReveal } from './use-reveal.ts'
import { Link, NavLink, useLocation } from 'react-router-dom'

export type SiteAction = () => void

export type SiteChromeProps = {
  children: ReactNode
  onLogin: SiteAction
  onStart: SiteAction
}

const NAV_PRIMARY = [
  { label: '产品', to: '/product' },
  { label: '场景', to: '/use-cases' },
  { label: '定价', to: '/pricing' },
  { label: '安全', to: '/security' },
  { label: '对比', to: '/compare' },
] as const

const PRODUCT_SUB = [
  { label: 'File System', to: '/product#file-system' },
  { label: 'Agent 工作台', to: '/product#agent' },
  { label: '任务看板', to: '/product#tasks' },
  { label: '页面与数据库', to: '/product#pages' },
  { label: '插件系统', to: '/product#plugins' },
  { label: '本机与云端', to: '/product#spaces' },
] as const

const FOOTER_COLUMNS = [
  {
    title: '产品',
    links: [
      { label: '产品总览', to: '/product' },
      { label: '定价', to: '/pricing' },
      { label: '下载', to: '/download' },
      { label: '本机与云端', to: '/product#spaces' },
    ],
  },
  {
    title: '资源',
    links: [
      { label: '文档', to: '/docs' },
      { label: '更新日志', to: '/changelog' },
      { label: '帮助中心', to: '/help' },
      { label: '对比', to: '/compare' },
    ],
  },
  {
    title: '公司',
    links: [
      { label: '关于', to: '/about' },
      { label: '博客', to: '/blog' },
      { label: '客户案例', to: '/customers' },
      { label: '安全', to: '/security' },
    ],
  },
] as const

export function SiteHeader({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  const { pathname } = useLocation()
  const productActive = pathname.startsWith('/product')
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="site-nav" data-menu-open={menuOpen ? '1' : '0'}>
      <Link className="site-brand" to="/" onClick={() => setMenuOpen(false)}>BIU</Link>
      {/* 移动端汉堡按钮 */}
      <button
        type="button"
        className="site-menu-toggle"
        aria-label={menuOpen ? '关闭菜单' : '打开菜单'}
        aria-expanded={menuOpen}
        data-testid="site-menu-toggle"
        onClick={() => setMenuOpen((current) => !current)}
      >
        <span aria-hidden>{menuOpen ? '✕' : '☰'}</span>
      </button>
      <nav className="site-nav-links" aria-label="官网" onClick={() => setMenuOpen(false)}>
        <div className="site-nav-group">
          <NavLink
            to="/product"
            className={({ isActive }) => (isActive || productActive ? 'is-active' : '')}
          >
            产品
          </NavLink>
          <div className="site-nav-menu" role="menu" aria-label="产品">
            {PRODUCT_SUB.map((item) => (
              <Link key={item.to} to={item.to} role="menuitem">{item.label}</Link>
            ))}
          </div>
        </div>
        {NAV_PRIMARY.slice(1).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => (isActive ? 'is-active' : '')}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="site-nav-actions">
        <button type="button" className="site-login" data-testid="site-login" onClick={onLogin}>登录</button>
        <button type="button" className="site-start" data-testid="site-start" onClick={onStart}>立即使用</button>
      </div>
    </header>
  )
}

export function SiteFooter({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  return (
    <footer className="site-footer">
      <div className="site-footer-columns">
        {FOOTER_COLUMNS.map((column) => (
          <div key={column.title}>
            <strong>{column.title}</strong>
            {column.links.map((link) => (
              <Link key={`${column.title}:${link.to}`} to={link.to}>{link.label}</Link>
            ))}
          </div>
        ))}
        <div>
          <strong>开始</strong>
          <button type="button" onClick={onLogin}>登录</button>
          <button type="button" onClick={onStart}>创建空间</button>
        </div>
      </div>
      <div className="site-footer-base">
        <p className="site-footer-tagline">BIU · 让知识留下，让工作继续。</p>
        <p className="site-footer-legal">
          <Link to="/security">安全</Link> · <Link to="/terms">隐私</Link> · <Link to="/terms">条款</Link> · © 2026 BIU
        </p>
      </div>
    </footer>
  )
}

/** 站内页共用的外壳：顶部导航 + 正文 + 页脚。 */
export function SiteChrome({ children, onLogin, onStart }: SiteChromeProps) {
  // .site 是页面唯一的滚动容器（见 style.css）。
  // ref 挂在这里，页面组件不必再套一层无样式的 div —— 那层 div 会让
  // .site 的 height:100% 失去参照，进而使 overflow 失效、整页滚不动。
  const ref = useReveal<HTMLDivElement>()
  return (
    <div className="site" ref={ref}>
      <SiteHeader onLogin={onLogin} onStart={onStart} />
      <main>{children}</main>
      <SiteFooter onLogin={onLogin} onStart={onStart} />
    </div>
  )
}
