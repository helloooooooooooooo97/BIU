import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { GITHUB_URL, SiteChrome, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { formatDate, loadReleases, type Release } from './github.ts'
import { usePageMeta } from './use-page-meta.ts'

const REPO_FILE = `${GITHUB_URL}/blob/main`

const DOCS = [
  { title: '快速开始', body: '三行命令从源码跑起来，或者直接下载桌面版。', href: `${REPO_FILE}/README.zh-CN.md#快速开始` },
  { title: '桌面版安装', body: 'macOS 未公证安装包怎么打开、Windows SmartScreen 怎么放行、数据目录在哪。', href: `${REPO_FILE}/docs/desktop-install.md` },
  { title: '为什么是 File System', body: '路径、表、记录、schema、操作、blurb —— 六个原子怎么组合出所有东西。', href: `${REPO_FILE}/README.zh-CN.md#为什么是-file-system` },
  { title: '架构', body: 'Host 与 Web 两侧的插件、事件流和存储各在哪一层。', href: `${REPO_FILE}/README.zh-CN.md#架构` },
  { title: '插件包与热插拔', body: '插件怎么声明、怎么在沙箱里写、怎么打包装进工作区。', href: `${REPO_FILE}/docs/plugin-packages.md` },
  { title: 'English README', body: 'The same overview in English.', href: `${REPO_FILE}/README.md` },
] as const

export function MarketingDocs({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: '文档',
    description: 'BIU 的文档目前放在 GitHub 仓库里：快速开始、桌面版安装、File System 设计、架构与插件开发。',
    path: '/docs',
  })
  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
      <section className="site-page-hero" data-reveal>
        <p className="site-section-label">文档</p>
        <h1>把 BIU 用起来</h1>
        <p className="site-page-lead">文档和代码放在一起维护，都在 GitHub 仓库里。下面是最常用的几篇。</p>
      </section>
      <section className="site-doc-grid" aria-label="文档">
        {DOCS.map((doc) => (
          <a key={doc.title} className="site-doc-card" href={doc.href} target="_blank" rel="noreferrer" data-reveal>
            <h2>{doc.title}</h2>
            <p>{doc.body}</p>
            <span>在 GitHub 阅读 →</span>
          </a>
        ))}
      </section>
      <SiteFinalCta title="先把 BIU 用起来" />
    </SiteChrome>
  )
}

/** GitHub Releases 的正文是 Markdown，这里只取纯文本行，标题和列表符号去掉。 */
export function releaseLines(body: string, limit = 12) {
  return body
    .split(/\r?\n/)
    .filter((line) => !/^\s*```/.test(line))
    .map((line) => line
      .replace(/^#+\s*|^[-*]\s+/, '')
      .replace(/\*\*|`/g, '')
      .replace(/\s+by @\S+ in https:\/\/github\.com\/\S+\/pull\/(\d+)/, '（#$1）')
      .trim())
    .filter((line) => line && !/^(What's Changed|Full Changelog)/i.test(line))
    .slice(0, limit)
}

export function MarketingChangelog({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: '更新日志',
    description: 'BIU 每个版本的更新说明，直接读自 GitHub Releases。',
    path: '/changelog',
  })
  const [releases, setReleases] = useState<Release[] | null>(null)
  useEffect(() => {
    let cancelled = false
    void loadReleases().then((list) => {
      if (!cancelled) setReleases(list)
    })
    return () => { cancelled = true }
  }, [])

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
      <section className="site-page-hero" data-reveal>
        <p className="site-section-label">更新日志</p>
        <h1>BIU 在变</h1>
        <p className="site-page-lead">每个版本的说明直接读自 GitHub Releases，和安装包同一处发布。</p>
      </section>
      <section className="site-changelog" aria-label="版本">
        {releases === null ? <p className="site-changelog-empty">正在从 GitHub 读取版本…</p> : null}
        {releases?.length === 0 ? (
          <p className="site-changelog-empty">
            暂时读不到 GitHub，可以直接去 <a href={`${GITHUB_URL}/releases`} target="_blank" rel="noreferrer">GitHub Releases</a> 查看。
          </p>
        ) : null}
        {releases?.map((release) => {
          const lines = releaseLines(release.body)
          return (
            <article key={release.tag} className="site-release" data-reveal>
              <div className="site-release-head">
                <h2>{release.tag}</h2>
                {release.publishedAt ? <time dateTime={release.publishedAt}>{formatDate(release.publishedAt)}</time> : null}
              </div>
              {lines.length ? (
                <ul>{lines.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}</ul>
              ) : (
                <p>这个版本没有写说明。</p>
              )}
              <a href={release.url} target="_blank" rel="noreferrer">完整说明与安装包 →</a>
            </article>
          )
        })}
        <p className="site-changelog-foot">想第一时间拿到新版本？<Link to="/download">下载页</Link>永远指向最新版。</p>
      </section>
    </SiteChrome>
  )
}
