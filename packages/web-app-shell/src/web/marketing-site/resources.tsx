import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { GITHUB_URL, SiteChrome, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { formatDate, loadReleases, type Release } from './github.ts'
import { usePageMeta } from './use-page-meta.ts'

const REPO_FILE = `${GITHUB_URL}/blob/main`

const DOCS = [
  { title: 'Quick start', body: 'Run BIU from source with three commands, or download the desktop app.', href: `${REPO_FILE}/README.zh-CN.md#快速开始` },
  { title: 'Desktop installation', body: 'Open an unnotarized macOS build, allow the app through Windows SmartScreen, and find your local data directory.', href: `${REPO_FILE}/docs/desktop-install.md` },
  { title: 'Why a File System?', body: 'See how six primitives—paths, tables, records, schemas, operations, and blurbs—compose everything in BIU.', href: `${REPO_FILE}/README.zh-CN.md#为什么是-file-system` },
  { title: 'Architecture', body: 'Learn where plugins, event flows, and storage live across the Host and Web layers.', href: `${REPO_FILE}/README.zh-CN.md#架构` },
  { title: 'Plugin packages and hot swapping', body: 'Learn how to declare plugins, build them in the sandbox, and package them for a workspace.', href: `${REPO_FILE}/docs/plugin-packages.md` },
  { title: 'English README', body: 'The same overview in English.', href: `${REPO_FILE}/README.md` },
] as const

export function MarketingDocs({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: 'Documentation',
    description: 'Explore BIU documentation on GitHub, including quick start, desktop installation, File System design, architecture, and plugin development.',
    path: '/docs',
  })
  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
      <section className="site-page-hero" data-reveal>
        <p className="site-section-label">Documentation</p>
        <h1>Get started with BIU</h1>
        <p className="site-page-lead">Documentation is maintained alongside the code in the GitHub repository. Start with these popular guides.</p>
      </section>
      <section className="site-doc-grid" aria-label="Documentation">
        {DOCS.map((doc) => (
          <a key={doc.title} className="site-doc-card" href={doc.href} target="_blank" rel="noreferrer" data-reveal>
            <h2>{doc.title}</h2>
            <p>{doc.body}</p>
            <span>Read on GitHub →</span>
          </a>
        ))}
      </section>
      <SiteFinalCta title="Start building with BIU" />
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
    title: 'Changelog',
    description: 'Read the release notes for every BIU version, sourced directly from GitHub Releases.',
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
        <p className="site-section-label">Changelog</p>
        <h1>What’s new in BIU</h1>
        <p className="site-page-lead">Release notes come directly from GitHub Releases, where each installer is published.</p>
      </section>
      <section className="site-changelog" aria-label="Releases">
        {releases === null ? <p className="site-changelog-empty">Loading releases from GitHub…</p> : null}
        {releases?.length === 0 ? (
          <p className="site-changelog-empty">
            GitHub is temporarily unavailable. View releases directly on <a href={`${GITHUB_URL}/releases`} target="_blank" rel="noreferrer">GitHub Releases</a>.
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
                <p>No release notes were provided for this version.</p>
              )}
              <a href={release.url} target="_blank" rel="noreferrer">Full release notes and installers →</a>
            </article>
          )
        })}
        <p className="site-changelog-foot">Want the latest version? The <Link to="/download">download page</Link> always points to the newest release.</p>
      </section>
    </SiteChrome>
  )
}
