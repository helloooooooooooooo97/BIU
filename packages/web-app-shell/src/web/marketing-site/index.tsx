import { useEffect, useMemo, useState } from 'react'
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
import { readSiteLocale, saveSiteLocale, SiteLocaleContext, useSiteLocale, type SiteLocale } from './locale.tsx'

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

type PlaceholderEntry = { label: string; title: string; body: string }

type PlaceholderProps = PlaceholderEntry & {
  onLogin: SiteAction
  onStart: SiteAction
}

/** 规划中已登记、尚未开发的页面：先给一个诚实的占位，不留 404。 */
function Placeholder({ label, title, body, onLogin, onStart }: PlaceholderProps) {
  const { locale } = useSiteLocale()
  usePageMeta({ title, description: body, path: typeof window === 'undefined' ? '/' : window.location.pathname })
  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero" data-reveal>
          <p className="site-section-label">{label}</p>
          <h1>{title}</h1>
          <p className="site-page-lead">{body}</p>
        </section>
        <SiteFinalCta title={locale === 'zh' ? '开始使用 BIU' : 'Start using BIU today'} />
    </SiteChrome>
  )
}

const PLACEHOLDERS: Record<SiteLocale, Record<string, PlaceholderEntry>> = {
  en: {
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
  },
  zh: {
    '/enterprise': {
      label: '企业',
      title: '在自己的服务器上运行',
      body: 'BIU 以 Apache 2.0 开源，可以直接自部署。部署指南正在整理中，有问题欢迎在 GitHub 提 issue。',
    },
    '/about': {
      label: '关于',
      title: '用一个页面，组合所有软件',
      body: 'BIU 是一个开源的 All in One 工作空间：页面里的每一块都是插件提供的软件。理念可以先看博客，联系我们：348876414@qq.com。',
    },
    '/customers': {
      label: '客户案例',
      title: '他们怎么用 BIU',
      body: '真实案例正在征集中。在此之前，场景页有详细的工作流演示。',
    },
    '/help': {
      label: '帮助中心',
      title: '帮助文档正在整理',
      body: '快速开始、分主题文档、常见问题与教程正在整理中。',
    },
    '/terms': {
      label: '法务',
      title: '条款与隐私',
      body: '服务条款与隐私政策的正式文本正在准备中。有疑问请发邮件到 348876414@qq.com。',
    },
  },
}

const NOT_FOUND: Record<SiteLocale, PlaceholderEntry> = {
  en: {
    label: '404',
    title: 'Page not found',
    body: 'There is no page at this address. Please return to the home page.',
  },
  zh: {
    label: '404',
    title: '页面不存在',
    body: '这个地址没有对应的页面，请返回首页。',
  },
}

/**
 * 官网路由。
 * 挂在 BrowserRouter 内，登录态判断由外层 Shell 负责 —— 这里只管路径。
 */
export function MarketingSite({ onLogin, onStart, auth, login = true }: MarketingSiteProps) {
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
    <SiteLocaleContext.Provider value={localeValue}>
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
          {Object.entries(PLACEHOLDERS[locale]).map(([path, content]) => (
            <Route
              key={path}
              path={path}
              element={<Placeholder {...content} onLogin={onLogin} onStart={onStart} />}
            />
          ))}
          <Route
            path="*"
            element={<Placeholder {...NOT_FOUND[locale]} onLogin={onLogin} onStart={onStart} />}
          />
        </Routes>
      </SiteLoginContext.Provider>
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

