import { Fragment, useEffect, useState } from 'react'
import { DownloadIcon, GITHUB_URL, SiteChrome, SiteFaq, type SiteAction } from './site-chrome.tsx'
import { formatDate, formatStars, useGitHubStats } from './github.ts'
import { usePageMeta } from './use-page-meta.ts'

const RELEASES_PAGE = `${GITHUB_URL}/releases/latest`
const QUARANTINE_FIX = 'xattr -dr com.apple.quarantine /Applications/BIU.app'
const LINUX_RUN = 'chmod +x BIU-*-linux-x64.AppImage && ./BIU-*-linux-x64.AppImage'

type Platform = 'mac' | 'windows' | 'linux'

const PACKAGES = {
  'mac-arm64': { label: 'Apple silicon', file: /-mac-arm64\.dmg$/ },
  'mac-intel': { label: 'Intel processor', file: /-mac-x64\.dmg$/ },
  windows: { label: 'Windows x64', file: /-win-x64\.exe$/ },
  linux: { label: 'Linux x64', file: /-linux-x64\.AppImage$/ },
} as const

type PackageId = keyof typeof PACKAGES

const REQUIREMENTS = [
  ['System', 'macOS (Apple silicon / Intel), Windows 10 and later, or Linux x64'],
  ['Memory', '8 GB or more recommended'],
  ['Model', 'Bring your own key for any model'],
  ['Network', 'Works offline; model calls require an internet connection'],
] as const

const SOURCE_STEPS = [
  'git clone https://github.com/helloooooooooooooo97/biu.git',
  'cd biu',
  'make',
] as const

const DOWNLOAD_FAQ = [
  ['Which macOS installer should I choose?', 'Open About This Mac from the Apple menu. Choose Apple silicon for an Apple M-series chip, or Intel for an Intel processor.'],
  ['What if Windows SmartScreen blocks the installer?', 'Select More info, then Run anyway. The complete source code is available for review on GitHub.'],
  ['Can I use BIU without a model API key?', 'Pages, tables, and plugins work normally. Agents require a model API key; any model works.'],
  ['Is there a mobile app?', 'BIU is currently available for desktop. Installers are provided for macOS, Windows, and Linux.'],
] as const

/** 只用来决定先给哪个按钮；猜错了，下面三个平台都还在。 */
export function detectPlatform(nav: Pick<Navigator, 'userAgent'> & { userAgentData?: { platform?: string }; platform?: string }): Platform | null {
  const hint = `${nav.userAgentData?.platform ?? ''} ${nav.platform ?? ''} ${nav.userAgent}`.toLowerCase()
  if (/iphone|ipad|android/.test(hint)) return null
  if (/mac/.test(hint)) return 'mac'
  if (/win/.test(hint)) return 'windows'
  if (/linux|x11|cros/.test(hint)) return 'linux'
  return null
}

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])
  const copy = () => {
    void navigator.clipboard?.writeText(command).then(() => setCopied(true), () => undefined)
  }
  return (
    <div className="site-copy-cmd">
      <code>{command}</code>
      <button type="button" onClick={copy} aria-label={copied ? 'Copied' : 'Copy command'}>{copied ? 'Copied' : 'Copy'}</button>
    </div>
  )
}

export function MarketingDownload({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  const { release, stars } = useGitHubStats()
  const [platform, setPlatform] = useState<Platform | null>(null)
  useEffect(() => {
    if (typeof navigator !== 'undefined') setPlatform(detectPlatform(navigator))
  }, [])

  const urlOf = (id: PackageId) => release?.assets.find((asset) => PACKAGES[id].file.test(asset.name))?.url ?? RELEASES_PAGE
  const meta = [
    release ? `Latest release ${release.tag}` : null,
    release?.publishedAt ? `Updated ${formatDate(release.publishedAt)}` : null,
    stars !== undefined ? <>GitHub <span className="site-gh-star" aria-hidden>★</span> {formatStars(stars)}</> : null,
  ].filter((item) => item !== null)

  usePageMeta({
    title: 'Download',
    description: 'Download BIU for macOS, Windows, or Linux.',
    path: '/download',
  })

  const primary = platform === 'windows'
    ? { href: urlOf('windows'), label: 'Download for Windows' }
    : platform === 'linux'
      ? { href: urlOf('linux'), label: 'Download for Linux' }
      : { href: urlOf('mac-arm64'), label: 'Download for macOS (Apple silicon)' }

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero" data-reveal>
          <p className="site-section-label">Download</p>
          <h1>Run BIU on your device</h1>
          <p className="site-page-lead">Ready to use after installation. Your data stays on your computer, and your models use your own API keys.</p>
          <div className="site-download-primary">
            <a className="site-cta-primary" href={primary.href}><DownloadIcon />{primary.label}</a>
            {platform === 'mac' || platform === null ? (
              <a className="site-download-alt" href={urlOf('mac-intel')}>Mac with an Intel processor →</a>
            ) : null}
          </div>
          {meta.length ? (
            <p className="site-download-meta">
              {meta.map((item, index) => <Fragment key={index}>{index ? ' · ' : null}{item}</Fragment>)}
            </p>
          ) : null}
        </section>

        <section className="site-platforms" aria-label="Platforms">
          <div className="site-platform-grid">
            <article data-reveal className={platform === 'mac' ? 'is-current' : ''}>
              <h2>macOS</h2>
              <p className="site-platform-detail">Separate installers for Apple silicon and Intel{platform === 'mac' ? ' · Your system' : ''}</p>
              <ol>
                <li>Download the .dmg and drag BIU into Applications</li>
                <li>If macOS says the app is damaged when first opened, run this command in Terminal:</li>
              </ol>
              <CopyCommand command={QUARANTINE_FIX} />
              <div className="site-platform-actions">
                <a href={urlOf('mac-arm64')}>Apple silicon</a>
                <a href={urlOf('mac-intel')}>Intel processor</a>
              </div>
            </article>
            <article data-reveal className={platform === 'windows' ? 'is-current' : ''}>
              <h2>Windows</h2>
              <p className="site-platform-detail">Windows 10 or later · x64{platform === 'windows' ? ' · Your system' : ''}</p>
              <ol>
                <li>Download the .exe and run the installer</li>
                <li>If SmartScreen blocks it, select More info → Run anyway</li>
              </ol>
              <div className="site-platform-actions">
                <a href={urlOf('windows')}>Download for Windows</a>
              </div>
            </article>
            <article data-reveal className={platform === 'linux' ? 'is-current' : ''}>
              <h2>Linux</h2>
              <p className="site-platform-detail">x64 AppImage{platform === 'linux' ? ' · Your system' : ''}</p>
              <ol>
                <li>Download the AppImage</li>
                <li>Make it executable and run:</li>
              </ol>
              <CopyCommand command={LINUX_RUN} />
              <div className="site-platform-actions">
                <a href={urlOf('linux')}>Download for Linux</a>
              </div>
            </article>
          </div>
        </section>

        <section className="site-requirements" data-reveal>
          <h2>System requirements</h2>
          <table>
            <tbody>
              {REQUIREMENTS.map(([item, detail]) => (
                <tr key={item}><th>{item}</th><td>{detail}</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="site-local-note" id="source" data-reveal>
          <p className="site-section-label">Run from source</p>
          <h2>Build from source</h2>
          <p>These commands start both the service and the interface. Open http://127.0.0.1:5173 in your browser.</p>
          <CopyCommand command={SOURCE_STEPS.join('\n')} />
          <p>
            Why macOS may say the app is damaged: the installer has not yet been notarized by Apple, so macOS blocks
            the downloaded app. The xattr command only removes that download quarantine flag. The complete source code
            is available for review on <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>.
            See <a href={`${GITHUB_URL}/releases`} target="_blank" rel="noreferrer">all releases</a>.
          </p>
        </section>

        <SiteFaq title="Installation FAQ" items={DOWNLOAD_FAQ} />
    </SiteChrome>
  )
}
