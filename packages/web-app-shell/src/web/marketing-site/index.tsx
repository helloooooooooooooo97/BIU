import { Route, Routes, useLocation } from 'react-router-dom'
import type { SiteAction } from './site-chrome.tsx'
import { SiteChrome, SiteFinalCta } from './site-chrome.tsx'
import { MarketingHome } from './home.tsx'
import { MarketingProduct } from './product.tsx'
import { MarketingPricing } from './pricing.tsx'
import { MarketingDownload } from './download.tsx'
import { MarketingSecurity } from './security.tsx'
import { MarketingCompareDetail, MarketingCompareIndex } from './compare.tsx'
import { MarketingUseCaseDetail, MarketingUseCases } from './use-cases.tsx'
import { MarketingBrand } from './brand.tsx'
import { type AuthMode, MarketingAuth } from './auth.tsx'
import { usePageMeta } from './use-page-meta.ts'

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
        <SiteFinalCta title="先把 BIU 用起来" />
    </SiteChrome>
  )
}

const PLACEHOLDERS: Record<string, { label: string; title: string; body: string }> = {
  '/enterprise': {
    label: '企业',
    title: '在自己的服务器上运行',
    body: 'BIU 以 Apache 2.0 开源，可以直接自部署。部署指南正在整理中，有问题欢迎在 GitHub 提 issue。',
  },
  '/changelog': {
    label: '更新日志',
    title: 'BIU 在变',
    body: '每个版本的更新说明目前发布在 GitHub Releases，官网的更新日志页正在整理中。',
  },
  '/about': {
    label: '关于',
    title: '用一个页面，组合所有软件',
    body: 'BIU 是一个开源的 All in One 工作空间：页面里的每一块都是插件提供的软件。团队与理念页面正在编写中。',
  },
  '/blog': {
    label: '博客',
    title: '设计与实现',
    body: '页面如何组合插件、多智能体协作、本机优先架构、插件开发实践。首批文章正在撰写中。',
  },
  '/customers': {
    label: '客户案例',
    title: '他们怎么用 BIU',
    body: '真实案例正在征集中。在此之前，场景页有详细的工作流演示。',
  },
  '/help': {
    label: '帮助中心',
    title: '开始之前，你可能想知道',
    body: '快速开始、分主题文档、常见问题与教程正在整理中。',
  },
  '/docs': {
    label: '文档',
    title: '把 BIU 用起来',
    body: '安装、配置模型密钥、File System 接口与插件开发的文档正在整理中。',
  },
  '/terms': {
    label: '法务',
    title: '条款与隐私',
    body: '服务条款与隐私政策的正式文本正在准备中。',
  },
}

/**
 * 官网路由。
 * 挂在 BrowserRouter 内，登录态判断由外层 Shell 负责 —— 这里只管路径。
 */
export function MarketingSite({ onLogin, onStart, auth }: MarketingSiteProps) {
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
    <Routes>
      <Route path="/" element={<MarketingHome onLogin={onLogin} onStart={onStart} />} />
      <Route path="/product" element={<MarketingProduct onLogin={onLogin} onStart={onStart} />} />
      <Route path="/pricing" element={<MarketingPricing onLogin={onLogin} onStart={onStart} />} />
      <Route path="/download" element={<MarketingDownload onLogin={onLogin} onStart={onStart} />} />
      <Route path="/security" element={<MarketingSecurity onLogin={onLogin} onStart={onStart} />} />
      <Route path="/compare" element={<MarketingCompareIndex onLogin={onLogin} onStart={onStart} />} />
      <Route path="/login" element={authElement} />
      <Route path="/register" element={authElement} />
      <Route path="/signup" element={authElement} />
      <Route path="/compare/:slug" element={<MarketingCompareDetail onLogin={onLogin} onStart={onStart} />} />
      <Route path="/brand" element={<MarketingBrand onLogin={onLogin} onStart={onStart} />} />
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
            title="这一页还没建"
            body="这个地址暂时没有内容，回到首页看看已有的页面吧。"
            onLogin={onLogin}
            onStart={onStart}
          />
        }
      />
    </Routes>
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
