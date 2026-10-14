import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useReveal } from './use-reveal.ts'
import { BRAND_PRINT_TILE, BrandMark, BrandPrint, useBrandConfig } from './brand-mark.tsx'
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
          showBackground={false}
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

/** 印花比正文滚得慢，形成纵深。 */
const PRINT_PARALLAX = 0.35

/**
 * 页面往下滚时印花往上走。位移按格子取模，所以图案只需比视口多出一格高，
 * 而且只改 transform，不重绘 SVG。
 */
function usePrintParallax(rootRef: RefObject<HTMLElement | null>, printRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    const print = printRef.current
    if (!root || !print) return
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const apply = () => {
      frame = 0
      const shift = (root.scrollTop * PRINT_PARALLAX) % BRAND_PRINT_TILE
      print.style.setProperty('--print-shift', `${-shift}px`)
    }
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(apply)
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    apply()
    return () => {
      root.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [rootRef, printRef])
}

/**
 * 鼠标聚光：平时印花是同色系的灰，鼠标附近那一圈露出真实三色。
 * 只认鼠标（触屏没有悬停），坐标写进 CSS 变量，由彩色层的径向蒙版跟随。
 */
function usePrintSpotlight(rootRef: RefObject<HTMLElement | null>, printRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    const print = printRef.current
    if (!root || !print) return
    let frame = 0
    let x = 0
    let y = 0
    const apply = () => {
      frame = 0
      print.style.setProperty('--spot-x', `${x}px`)
      print.style.setProperty('--spot-y', `${y}px`)
    }
    const onMove = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== 'mouse') return
      x = event.clientX
      y = event.clientY
      print.dataset.spot = 'on'
      if (!frame) frame = requestAnimationFrame(apply)
    }
    const onLeave = () => {
      delete print.dataset.spot
    }
    root.addEventListener('pointermove', onMove, { passive: true })
    root.addEventListener('pointerleave', onLeave)
    return () => {
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerleave', onLeave)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [rootRef, printRef])
}

/** 站内页共用的外壳：顶部导航 + 正文 + 页脚。 */
export function SiteChrome({ children, onLogin, onStart }: SiteChromeProps) {
  // .site 是页面唯一的滚动容器（见 style.css）。
  // ref 挂在这里，页面组件不必再套一层无样式的 div —— 那层 div 会让
  // .site 的 height:100% 失去参照，进而使 overflow 失效、整页滚不动。
  const ref = useReveal<HTMLDivElement>()
  const printRef = useRef<HTMLDivElement>(null)
  usePrintParallax(ref, printRef)
  usePrintSpotlight(ref, printRef)
  const brand = useBrandConfig()
  return (
    <div className="site" ref={ref}>
      <div
        className="site-print"
        aria-hidden
        data-testid="site-print"
        ref={printRef}
        style={{ ['--print-tile' as string]: `${BRAND_PRINT_TILE}px` }}
      >
        <BrandPrint config={brand} tone="mono" layer="base" />
        <div className="site-print-spot" data-testid="site-print-spot">
          <BrandPrint config={brand} fade={false} layer="spot" />
        </div>
      </div>
      <SiteHeader onLogin={onLogin} onStart={onStart} />
      <main>{children}</main>
      <SiteFooter onLogin={onLogin} onStart={onStart} />
    </div>
  )
}
