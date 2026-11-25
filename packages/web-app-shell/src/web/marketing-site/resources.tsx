import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { GITHUB_URL, SiteChrome, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { formatDate, loadReleases, type Release } from './github.ts'
import { usePageMeta } from './use-page-meta.ts'
import { useSiteLocale, type SiteLocale } from './locale.tsx'

const REPO_FILE = `${GITHUB_URL}/blob/main`

const DOCS_COPY: Record<
  SiteLocale,
  {
    metaTitle: string
    metaDescription: string
    label: string
    heading: string
    lead: string
    ariaLabel: string
    readOnGithub: string
    ctaTitle: string
    docs: ReadonlyArray<{ title: string; body: string; href: string }>
  }
> = {
  en: {
    metaTitle: 'Documentation',
    metaDescription: 'Explore BIU documentation on GitHub, including quick start, desktop installation, File System design, architecture, and plugin development.',
    label: 'Documentation',
    heading: 'Get started with BIU',
    lead: 'Documentation is maintained alongside the code in the GitHub repository. Start with these popular guides.',
    ariaLabel: 'Documentation',
    readOnGithub: 'Read on GitHub →',
    ctaTitle: 'Start building with BIU',
    docs: [
      { title: 'Quick start', body: 'Run BIU from source with three commands, or download the desktop app.', href: `${REPO_FILE}/README.zh-CN.md#快速开始` },
      { title: 'Desktop installation', body: 'Open an unnotarized macOS build, allow the app through Windows SmartScreen, and find your local data directory.', href: `${REPO_FILE}/docs/desktop-install.md` },
      { title: 'Why a File System?', body: 'See how six primitives—paths, tables, records, schemas, operations, and blurbs—compose everything in BIU.', href: `${REPO_FILE}/README.zh-CN.md#为什么是-file-system` },
      { title: 'Architecture', body: 'Learn where plugins, event flows, and storage live across the Host and Web layers.', href: `${REPO_FILE}/README.zh-CN.md#架构` },
      { title: 'Plugin packages and hot swapping', body: 'Learn how to declare plugins, build them in the sandbox, and package them for a workspace.', href: `${REPO_FILE}/docs/plugin-packages.md` },
      { title: 'English README', body: 'The same overview in English.', href: `${REPO_FILE}/README.md` },
    ],
  },
  zh: {
    metaTitle: '文档',
    metaDescription: 'BIU 的文档目前放在 GitHub 仓库里：快速开始、桌面版安装、File System 设计、架构与插件开发。',
    label: '文档',
    heading: '把 BIU 用起来',
    lead: '文档和代码放在一起维护，都在 GitHub 仓库里。下面是最常用的几篇。',
    ariaLabel: '文档',
    readOnGithub: '在 GitHub 阅读 →',
    ctaTitle: '立即下载 BIU',
    docs: [
      { title: '快速开始', body: '三行命令从源码跑起来，或者直接下载桌面版。', href: `${REPO_FILE}/README.zh-CN.md#快速开始` },
      { title: '桌面版安装', body: 'macOS 未公证安装包的打开方式、Windows SmartScreen 的放行步骤，以及数据目录位置。', href: `${REPO_FILE}/docs/desktop-install.md` },
      { title: '为什么是 File System', body: '路径、表、记录、schema、操作、blurb —— 六个原子怎么组合出所有东西。', href: `${REPO_FILE}/README.zh-CN.md#为什么是-file-system` },
      { title: '架构', body: 'Host 与 Web 两侧的插件、事件流和存储各在哪一层。', href: `${REPO_FILE}/README.zh-CN.md#架构` },
      { title: '插件包与热插拔', body: '插件怎么声明、怎么在沙箱里写、怎么打包装进工作区。', href: `${REPO_FILE}/docs/plugin-packages.md` },
      { title: 'English README', body: 'The same overview in English.', href: `${REPO_FILE}/README.md` },
    ],
  },
}

const CHANGELOG_COPY: Record<
  SiteLocale,
  {
    metaTitle: string
    metaDescription: string
    label: string
    heading: string
    lead: string
    ariaLabel: string
    loading: string
    unavailableBefore: string
    unavailableAfter: string
    noNotes: string
    fullNotes: string
    footBefore: string
    footLink: string
    footAfter: string
  }
> = {
  en: {
    metaTitle: 'Changelog',
    metaDescription: 'Read the release notes for every BIU version, sourced directly from GitHub Releases.',
    label: 'Changelog',
    heading: 'What’s new in BIU',
    lead: 'Release notes come directly from GitHub Releases, where each installer is published.',
    ariaLabel: 'Releases',
    loading: 'Loading releases from GitHub…',
    unavailableBefore: 'GitHub is temporarily unavailable. View releases directly on ',
    unavailableAfter: '.',
    noNotes: 'No release notes were provided for this version.',
    fullNotes: 'Full release notes and installers →',
    footBefore: 'Want the latest version? The ',
    footLink: 'download page',
    footAfter: ' always points to the newest release.',
  },
  zh: {
    metaTitle: '更新日志',
    metaDescription: 'BIU 每个版本的更新说明，直接读自 GitHub Releases。',
    label: '更新日志',
    heading: '版本演进与更新日志',
    lead: '每个版本的说明直接读自 GitHub Releases，和安装包同一处发布。',
    ariaLabel: '版本',
    loading: '正在从 GitHub 读取版本…',
    unavailableBefore: '暂时读不到 GitHub，可以直接去 ',
    unavailableAfter: ' 查看。',
    noNotes: '这个版本没有写说明。',
    fullNotes: '完整说明与安装包 →',
    footBefore: '想第一时间拿到新版本？',
    footLink: '下载页',
    footAfter: '永远指向最新版。',
  },
}

export function MarketingDocs({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  const { locale } = useSiteLocale()
  const copy = DOCS_COPY[locale]
  usePageMeta({
    title: copy.metaTitle,
    description: copy.metaDescription,
    path: '/docs',
  })
  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
      <section className="site-page-hero" data-reveal>
        <p className="site-section-label">{copy.label}</p>
        <h1>{copy.heading}</h1>
        <p className="site-page-lead">{copy.lead}</p>
      </section>
      <section className="site-doc-grid" aria-label={copy.ariaLabel}>
        {copy.docs.map((doc) => (
          <a key={doc.title} className="site-doc-card" href={doc.href} target="_blank" rel="noreferrer" data-reveal>
            <h2>{doc.title}</h2>
            <p>{doc.body}</p>
            <span>{copy.readOnGithub}</span>
          </a>
        ))}
      </section>
      <SiteFinalCta title={copy.ctaTitle} />
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
  const { locale } = useSiteLocale()
  const copy = CHANGELOG_COPY[locale]
  usePageMeta({
    title: copy.metaTitle,
    description: copy.metaDescription,
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
        <p className="site-section-label">{copy.label}</p>
        <h1>{copy.heading}</h1>
        <p className="site-page-lead">{copy.lead}</p>
      </section>
      <section className="site-changelog" aria-label={copy.ariaLabel}>
        {releases === null ? <p className="site-changelog-empty">{copy.loading}</p> : null}
        {releases?.length === 0 ? (
          <p className="site-changelog-empty">
            {copy.unavailableBefore}
            <a href={`${GITHUB_URL}/releases`} target="_blank" rel="noreferrer">GitHub Releases</a>
            {copy.unavailableAfter}
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
                <p>{copy.noNotes}</p>
              )}
              <a href={release.url} target="_blank" rel="noreferrer">{copy.fullNotes}</a>
            </article>
          )
        })}
        <p className="site-changelog-foot">
          {copy.footBefore}
          <Link to="/download">{copy.footLink}</Link>
          {copy.footAfter}
        </p>
      </section>
    </SiteChrome>
  )
}
