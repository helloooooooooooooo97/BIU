import { useState, type ReactNode } from 'react'
import { useReveal } from './use-reveal.ts'
import { BrandMark, BrandPrint, useBrandConfig } from './brand-mark.tsx'
import { Link, NavLink } from 'react-router-dom'

export type SiteAction = () => void

export type SiteChromeProps = {
  children: ReactNode
  onLogin: SiteAction
  onStart: SiteAction
}

/** 导航栏品牌标记的显示尺寸（与 style.css 的 .site-brand-mark 保持一致）。 */
const NAV_BRAND_PX = 24

const NAV_PRIMARY = [
  { label: '产品', to: '/product' },
  { label: '场景', to: '/use-cases' },
  { label: '定价', to: '/pricing' },
  { label: '安全', to: '/security' },
  { label: '对比', to: '/compare' },
  { label: '品牌', to: '/brand' },
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
  const [menuOpen, setMenuOpen] = useState(false)
  // 用户在品牌页调好的配置会推到这里，导航栏标记随之更新。
  const brand = useBrandConfig()

  return (
    <header className="site-nav" data-menu-open={menuOpen ? '1' : '0'}>
      <Link className="site-brand" to="/" onClick={() => setMenuOpen(false)}>
        <BrandMark
          className="site-brand-mark"
          colors={[brand.c0, brand.c1, brand.c2]}
          stroke={brand.stroke}
          // 颜色、粗细、圆的比例全部跟随用户在品牌页的设定 ——
          // 导航栏是同一枚标记的另一处呈现，不该有自己的一套参数。
          strokeWidth={brand.strokeWidth}
          lineWidth={brand.lineWidth}
          background={brand.background}
          showBackground={brand.showBackground}
          circleRatio={brand.circleRatio}
          scene="icon"
          // 24px 是 CSS 里定死的显示尺寸；组件靠它保证线条不缩成亚像素。
          displayWidth={NAV_BRAND_PX}
          title="BIU"
        />
        <span className="site-brand-text">BIU</span>
      </Link>
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
        {NAV_PRIMARY.map((item) => (
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
        <Link className="site-start" data-testid="site-start" to="/download">下载</Link>
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
  const brand = useBrandConfig()
  return (
    <div className="site" ref={ref}>
      <div className="site-print" aria-hidden data-testid="site-print">
        <BrandPrint config={brand} />
      </div>
      <SiteHeader onLogin={onLogin} onStart={onStart} />
      <main>{children}</main>
      <SiteFooter onLogin={onLogin} onStart={onStart} />
    </div>
  )
}
