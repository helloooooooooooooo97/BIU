import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import type { SiteAction } from './site-chrome.tsx'
import { SiteChrome, SiteFinalCta, SiteLoginContext } from './site-chrome.tsx'
import { MarketingHome } from './home.tsx'
import { MarketingProduct } from './product.tsx'
import { MarketingPricing } from './pricing.tsx'
import { MarketingDownload } from './download.tsx'
import { MarketingSecurity } from './security.tsx'
import { MarketingCompareDetail, MarketingCompareIndex } from './compare.tsx'
import { MarketingUseCaseDetail, MarketingUseCases } from './use-cases.tsx'
import { MarketingBrand } from './brand.tsx'
import { MarketingInvest } from './invest.tsx'
import { MarketingBlog, MarketingBlogPost } from './blog.tsx'
import { MarketingChangelog, MarketingDocs } from './resources.tsx'
import { type AuthMode, MarketingAuth } from './auth.tsx'
import { usePageMeta } from './use-page-meta.ts'
import { readSiteLocale, saveSiteLocale, SiteLocaleContext, type SiteLocale } from './locale.tsx'

const ChineseMarketingSite = lazy(async () => {
  const module = await import('./zh/index.tsx')
  return { default: module.MarketingSite }
})

export type MarketingSiteProps = {
  onLogin: SiteAction
  onStart: SiteAction
  /** 可选：由外层 Shell 提供的真实登录/注册提交（内部解析 token 与 workspaceId） */
  auth?: {
    mode: AuthMode
    onModeChange: (mode: AuthMode) => void
    onSubmit: (credentials: { email: string; password: string }) => Promise<void>
    workspaceInvite?: boolean
  }
  /** false：独立部署的静态官网，没有登录入口和登录页。 */
  login?: boolean
}

type PlaceholderProps = {
  label: string
  title: string
  body: string
  onLogin: SiteAction
  onStart: SiteAction
}

/** 规划中已登记、尚未开发的页面：先给一个诚实的占位，不留 404。 */
function Placeholder({ label, title, body, onLogin, onStart }: PlaceholderProps) {
  usePageMeta({ title, description: body, path: typeof window === 'undefined' ? '/' : window.location.pathname })
  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero" data-reveal>
          <p className="site-section-label">{label}</p>
          <h1>{title}</h1>
          <p className="site-page-lead">{body}</p>
        </section>
        <SiteFinalCta title="Start using BIU today" />
    </SiteChrome>
  )
}

const PLACEHOLDERS: Record<string, { label: string; title: string; body: string }> = {
  '/enterprise': {
    label: 'Enterprise',
    title: 'Run BIU on your own infrastructure',
    body: 'BIU is open source under Apache 2.0 and ready to self-host. Our deployment guide is in progress; in the meantime, open an issue on GitHub if you need help.',
  },
  '/about': {
    label: 'About',
    title: 'Compose all your software on one page',
    body: 'BIU is an open-source All in One workspace where every block is software powered by a plugin. Read our blog to learn more about the vision, or contact us at 348876414@qq.com.',
  },
  '/customers': {
    label: 'Customer Stories',
    title: 'How teams use BIU',
    body: 'We are currently collecting customer stories. In the meantime, explore detailed workflow demos on our use case pages.',
  },
  '/help': {
    label: 'Help Center',
    title: 'Documentation is on the way',
    body: 'Quickstarts, topic guides, FAQs, and tutorials are currently in development.',
  },
  '/terms': {
    label: 'Legal',
    title: 'Terms & Privacy',
    body: 'Our formal Terms of Service and Privacy Policy are in preparation. For questions, email 348876414@qq.com.',
  },
}

/**
 * 官网路由。
 * 挂在 BrowserRouter 内，登录态判断由外层 Shell 负责 —— 这里只管路径。
 */
function EnglishMarketingSite({ onLogin, onStart, auth, login = true }: MarketingSiteProps) {
  const authElement = auth ? (
    <MarketingAuth
      mode={auth.mode}
      onModeChange={auth.onModeChange}
      onSubmit={auth.onSubmit}
      onLogin={onLogin}
      onStart={onStart}
      workspaceInvite={auth.workspaceInvite}
    />
  ) : null
  return (
    <SiteLoginContext.Provider value={login}>
    <Routes>
      <Route path="/" element={<MarketingHome onLogin={onLogin} onStart={onStart} />} />
      <Route path="/product" element={<MarketingProduct onLogin={onLogin} onStart={onStart} />} />
      <Route path="/pricing" element={<MarketingPricing onLogin={onLogin} onStart={onStart} />} />
      <Route path="/download" element={<MarketingDownload onLogin={onLogin} onStart={onStart} />} />
      <Route path="/security" element={<MarketingSecurity onLogin={onLogin} onStart={onStart} />} />
      <Route path="/compare" element={<MarketingCompareIndex onLogin={onLogin} onStart={onStart} />} />
      {login ? (
        <>
          <Route path="/login" element={authElement} />
          <Route path="/register" element={authElement} />
          <Route path="/signup" element={authElement} />
        </>
      ) : null}
      <Route path="/compare/:slug" element={<MarketingCompareDetail onLogin={onLogin} onStart={onStart} />} />
      <Route path="/blog" element={<MarketingBlog onLogin={onLogin} onStart={onStart} />} />
      <Route path="/blog/:slug" element={<MarketingBlogPost onLogin={onLogin} onStart={onStart} />} />
      <Route path="/docs" element={<MarketingDocs onLogin={onLogin} onStart={onStart} />} />
      <Route path="/changelog" element={<MarketingChangelog onLogin={onLogin} onStart={onStart} />} />
      <Route path="/brand" element={<MarketingBrand onLogin={onLogin} onStart={onStart} />} />
      <Route path="/invest" element={<MarketingInvest onLogin={onLogin} onStart={onStart} />} />
      <Route path="/use-cases" element={<MarketingUseCases onLogin={onLogin} onStart={onStart} />} />
      <Route path="/use-cases/:slug" element={<MarketingUseCaseDetail onLogin={onLogin} onStart={onStart} />} />
      {Object.entries(PLACEHOLDERS).map(([path, content]) => (
        <Route
          key={path}
          path={path}
          element={<Placeholder {...content} onLogin={onLogin} onStart={onStart} />}
        />
      ))}
      <Route
        path="*"
        element={
          <Placeholder
            label="404"
            title="Page not found"
            body="There is no page at this address. Please return to the home page."
            onLogin={onLogin}
            onStart={onStart}
          />
        }
      />
    </Routes>
    </SiteLoginContext.Provider>
  )
}

export function MarketingSite(props: MarketingSiteProps) {
  const [locale, setLocaleState] = useState<SiteLocale>(readSiteLocale)
  const localeValue = useMemo(() => ({
    locale,
    setLocale: (next: SiteLocale) => {
      saveSiteLocale(next)
      setLocaleState(next)
    },
    toggleLocale: () => {
      const next = locale === 'en' ? 'zh' : 'en'
      saveSiteLocale(next)
      setLocaleState(next)
    },
  }), [locale])

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  }, [locale])

  return (
    <SiteLocaleContext.Provider value={localeValue}>
      <Suspense fallback={<div className="site" aria-busy="true" />}>
        {locale === 'zh' ? <ChineseMarketingSite {...props} /> : <EnglishMarketingSite {...props} />}
      </Suspense>
    </SiteLocaleContext.Provider>
  )
}

/** 供外层判断当前是否处于官网路径。 */
export const SITE_PATHS = [
  '/',
  '/product',
  '/pricing',
  '/download',
  '/security',
  '/compare',
  '/use-cases',
  '/brand',
  '/invest',
  '/enterprise',
  '/changelog',
  '/about',
  '/blog',
  '/customers',
  '/help',
  '/docs',
  '/terms',
] as const

export function useIsSitePath(): boolean {
  const { pathname } = useLocation()
  if (pathname === '/') return true
  return SITE_PATHS.some((prefix) => prefix !== '/' && pathname.startsWith(prefix))
}
