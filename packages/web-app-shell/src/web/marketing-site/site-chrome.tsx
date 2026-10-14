import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useReveal } from './use-reveal.ts'
import { BRAND_PRINT_TILE, BrandMark, BrandPrint, useBrandConfig } from './brand-mark.tsx'
import { Link, NavLink } from 'react-router-dom'
import { formatStars, useGitHubStats } from './github.ts'
import { downloadPageLongImage } from './page-shot.ts'

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
  { label: '博客', to: '/blog' },
  { label: '品牌', to: '/brand' },
] as const

export const GITHUB_URL = 'https://github.com/helloooooooooooooo97/biu'
export const CONTACT_EMAIL = '348876414@qq.com'

/** GitHub 官方标记（Octicons mark-github）。 */
export function GitHubIcon() {
  return (
    <svg className="site-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden fill="currentColor">
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  )
}

export function DownloadIcon() {
  return (
    <svg className="site-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2.5v7.5M4.75 6.75 8 10l3.25-3.25M3 13.25h10" />
    </svg>
  )
}

/** GitHub 按钮：拿到星标数就跟在后面显示，拿不到就只是一个按钮。 */
export function GitHubButton({ label, className = 'site-cta-secondary' }: { label: string; className?: string }) {
  const { stars } = useGitHubStats()
  return (
    <a className={className} href={GITHUB_URL} target="_blank" rel="noreferrer">
      <GitHubIcon />{label}
      {stars !== undefined ? <span className="site-gh-stars" aria-label={`${stars} 个星标`}><span className="site-gh-star" aria-hidden>★</span>{formatStars(stars)}</span> : null}
    </a>
  )
}

type FooterLink = { label: string; to: string } | { label: string; href: string }

const FOOTER_COLUMNS: ReadonlyArray<{ title: string; links: readonly FooterLink[] }> = [
  {
    title: '产品',
    links: [
      { label: '产品总览', to: '/product' },
      { label: '场景', to: '/use-cases' },
      { label: '定价', to: '/pricing' },
      { label: '下载', to: '/download' },
    ],
  },
  {
    title: '开源',
    links: [
      { label: 'GitHub', href: GITHUB_URL },
      { label: '更新日志', to: '/changelog' },
      { label: '问题反馈', href: `${GITHUB_URL}/issues` },
      { label: 'Apache 2.0 许可', href: `${GITHUB_URL}/blob/main/LICENSE` },
    ],
  },
  {
    title: '了解',
    links: [
      { label: '对比', to: '/compare' },
      { label: '安全', to: '/security' },
      { label: '文档', to: '/docs' },
      { label: '博客', to: '/blog' },
      { label: '品牌', to: '/brand' },
    ],
  },
]

/** 每页底部的收尾行动：开源项目的入口只有两个 —— 下载，或者去看源码。 */
export function SiteFinalCta({ title, label = '开源 · 免费' }: { title: ReactNode; label?: string }) {
  return (
    <section className="site-final-cta" data-reveal>
      <div className="site-container">
        <p className="site-section-label">{label}</p>
        <h2>{title}</h2>
        <div className="site-cta-actions">
          <Link className="site-cta-primary" to="/download"><DownloadIcon />免费下载</Link>
          <GitHubButton label="GitHub" />
        </div>
      </div>
    </section>
  )
}

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
        <Link className="site-start" data-testid="site-start" to="/download"><DownloadIcon />免费下载</Link>
      </div>
    </header>
  )
}

function DownloadPageButton() {
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle')
  const label = state === 'busy' ? '正在生成…' : state === 'error' ? '生成失败，再试一次' : '下载本页'
  return (
    <button
      type="button"
      disabled={state === 'busy'}
      onClick={() => {
        setState('busy')
        void downloadPageLongImage()
          .then(() => setState('idle'))
          .catch(() => setState('error'))
      }}
    >
      {label}
    </button>
  )
}

export function SiteFooter({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  return (
    <footer className="site-footer">
      <div className="site-footer-columns">
        {FOOTER_COLUMNS.map((column) => (
          <div key={column.title}>
            <strong>{column.title}</strong>
            {column.links.map((link) => ('to' in link
              ? <Link key={link.label} to={link.to}>{link.label}</Link>
              : <a key={link.label} href={link.href} target="_blank" rel="noreferrer">{link.label}</a>
            ))}
          </div>
        ))}
        <div>
          <strong>分享</strong>
          <DownloadPageButton />
        </div>
        <div>
          <strong>开始</strong>
          <button type="button" onClick={onLogin}>登录</button>
          <Link to="/download">免费下载</Link>
          <a href={`mailto:${CONTACT_EMAIL}`}>联系我们</a>
        </div>
      </div>
      <div className="site-footer-base">
        <p className="site-footer-tagline">BIU · 用一个页面，组合所有软件</p>
        <p className="site-footer-legal">
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> · <Link to="/terms">隐私与条款</Link> · Apache 2.0 · © 2026 BIU
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
