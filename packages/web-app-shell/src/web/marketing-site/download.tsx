import { Fragment, useEffect, useState } from 'react'
import { DownloadIcon, GITHUB_URL, SiteChrome, type SiteAction } from './site-chrome.tsx'
import { formatDate, formatStars, useGitHubStats } from './github.ts'
import { usePageMeta } from './use-page-meta.ts'

const RELEASES_PAGE = `${GITHUB_URL}/releases/latest`
const QUARANTINE_FIX = 'xattr -dr com.apple.quarantine /Applications/Biu.app'

type Platform = 'mac' | 'windows' | 'linux'

const PACKAGES = {
  'mac-arm64': { label: 'Apple 芯片', file: /-mac-arm64\.dmg$/ },
  'mac-intel': { label: 'Intel 芯片', file: /-mac-x64\.dmg$/ },
  windows: { label: 'Windows x64', file: /-win-x64\.exe$/ },
} as const

type PackageId = keyof typeof PACKAGES

const REQUIREMENTS = [
  ['系统', 'macOS（Apple 芯片 / Intel）、Windows 10 及以上'],
  ['内存', '建议 8 GB 以上'],
  ['模型', '自带密钥：DeepSeek / OpenAI / Anthropic 任选其一'],
  ['网络', '平时可离线；调用模型时需要联网'],
] as const

const SOURCE_STEPS = [
  'git clone https://github.com/helloooooooooooooo97/biu.git',
  'cd biu',
  'make',
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
      <button type="button" onClick={copy} aria-label={copied ? '已复制' : '复制命令'}>{copied ? '已复制' : '复制'}</button>
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
    release ? `最新版本 ${release.tag}` : null,
    release?.publishedAt ? `更新于 ${formatDate(release.publishedAt)}` : null,
    stars !== undefined ? <>GitHub <span className="site-gh-star" aria-hidden>★</span> {formatStars(stars)}</> : null,
  ].filter((item) => item !== null)

  usePageMeta({
    title: '下载',
    description: '免费下载 BIU 桌面版：macOS 与 Windows 安装包，或在 Linux 上从源码运行。',
    path: '/download',
  })

  const primary = platform === 'windows'
    ? { href: urlOf('windows'), label: '下载 Windows 版' }
    : platform === 'linux'
      ? { href: '#source', label: '在 Linux 上从源码运行' }
      : { href: urlOf('mac-arm64'), label: '下载 macOS 版（Apple 芯片）' }

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero" data-reveal>
          <p className="site-section-label">下载</p>
          <h1>在你的设备上运行</h1>
          <p className="site-page-lead">免费下载，开箱即用。数据存在你自己的电脑上，模型用你自己的密钥。</p>
          <div className="site-download-primary">
            <a className="site-cta-primary" href={primary.href}><DownloadIcon />{primary.label}</a>
            {platform === 'mac' || platform === null ? (
              <a className="site-download-alt" href={urlOf('mac-intel')}>Intel 芯片的 Mac →</a>
            ) : null}
          </div>
          {meta.length ? (
            <p className="site-download-meta">
              {meta.map((item, index) => <Fragment key={index}>{index ? ' · ' : null}{item}</Fragment>)}
            </p>
          ) : null}
        </section>

        <section className="site-platforms" aria-label="平台">
          <div className="site-platform-grid">
            <article data-reveal className={platform === 'mac' ? 'is-current' : ''}>
              <h2>macOS</h2>
              <p className="site-platform-detail">Apple 芯片与 Intel 各一个安装包{platform === 'mac' ? ' · 你的系统' : ''}</p>
              <ol>
                <li>下载 .dmg，拖入「应用程序」</li>
                <li>首次打开若提示「已损坏」，在终端执行：</li>
              </ol>
              <CopyCommand command={QUARANTINE_FIX} />
              <div className="site-platform-actions">
                <a href={urlOf('mac-arm64')}>Apple 芯片</a>
                <a href={urlOf('mac-intel')}>Intel 芯片</a>
              </div>
            </article>
            <article data-reveal className={platform === 'windows' ? 'is-current' : ''}>
              <h2>Windows</h2>
              <p className="site-platform-detail">Windows 10 及以上 · x64{platform === 'windows' ? ' · 你的系统' : ''}</p>
              <ol>
                <li>下载 .exe，运行安装程序</li>
                <li>SmartScreen 拦截时，选「更多信息」→「仍要运行」</li>
              </ol>
              <div className="site-platform-actions">
                <a href={urlOf('windows')}>下载 Windows 版</a>
              </div>
            </article>
            <article data-reveal className={platform === 'linux' ? 'is-current' : ''}>
              <h2>Linux</h2>
              <p className="site-platform-detail">从源码运行{platform === 'linux' ? ' · 你的系统' : ''}</p>
              <ol>
                <li>需要 Node.js 20 或更高版本和 npm</li>
                <li>三行命令，浏览器打开 http://127.0.0.1:5173</li>
              </ol>
              <div className="site-platform-actions">
                <a href="#source">查看命令</a>
              </div>
            </article>
          </div>
        </section>

        <section className="site-requirements" data-reveal>
          <h2>系统要求</h2>
          <table>
            <tbody>
              {REQUIREMENTS.map(([item, detail]) => (
                <tr key={item}><th>{item}</th><td>{detail}</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="site-local-note" id="source" data-reveal>
          <p className="site-section-label">从源码运行</p>
          <h2>Linux 或想自己改代码</h2>
          <p>执行完会同时启动服务和界面，浏览器打开 http://127.0.0.1:5173 即可。</p>
          <CopyCommand command={SOURCE_STEPS.join('\n')} />
          <p>
            为什么 macOS 会提示「已损坏」：安装包还没有做苹果公证，系统会拦下来自网络的未公证应用。
            那行 xattr 命令只是去掉这个下载标记，代码全部开源，可以在 <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a> 上核对。
            所有历史版本见 <a href={`${GITHUB_URL}/releases`} target="_blank" rel="noreferrer">版本发布</a>。
          </p>
        </section>
    </SiteChrome>
  )
}
