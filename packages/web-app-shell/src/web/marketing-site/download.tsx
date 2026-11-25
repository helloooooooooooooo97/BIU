import { Fragment, useEffect, useState } from 'react'
import { DownloadIcon, GITHUB_URL, SiteChrome, SiteFaq, type SiteAction } from './site-chrome.tsx'
import { formatDate, formatStars, useGitHubStats } from './github.ts'
import { usePageMeta } from './use-page-meta.ts'
import { useSiteLocale, type SiteLocale } from './locale.tsx'

const RELEASES_PAGE = `${GITHUB_URL}/releases/latest`
const QUARANTINE_FIX = 'xattr -dr com.apple.quarantine /Applications/BIU.app'
const LINUX_RUN = 'chmod +x BIU-*-linux-x64.AppImage && ./BIU-*-linux-x64.AppImage'

type Platform = 'mac' | 'windows' | 'linux'

const PACKAGES = {
  'mac-arm64': { file: /-mac-arm64\.dmg$/ },
  'mac-intel': { file: /-mac-x64\.dmg$/ },
  windows: { file: /-win-x64\.exe$/ },
  linux: { file: /-linux-x64\.AppImage$/ },
} as const

type PackageId = keyof typeof PACKAGES

const SOURCE_STEPS = [
  'git clone https://github.com/helloooooooooooooo97/biu.git',
  'cd biu',
  'make',
] as const

type DownloadCopy = {
  metaTitle: string
  metaDescription: string
  label: string
  heading: string
  lead: string
  primaryWindows: string
  primaryLinux: string
  primaryMac: string
  macIntelAlt: string
  latestRelease: (tag: string) => string
  updatedAt: (date: string) => string
  platformsAriaLabel: string
  yourSystemSuffix: string
  macDetail: string
  macSteps: readonly [string, string]
  macArmLabel: string
  macIntelLabel: string
  winDetail: string
  winSteps: readonly [string, string]
  winDownloadLabel: string
  linuxDetail: string
  linuxSteps: readonly [string, string]
  linuxDownloadLabel: string
  copied: string
  copy: string
  copyAriaLabel: string
  requirementsHeading: string
  requirements: ReadonlyArray<readonly [string, string]>
  sourceLabel: string
  sourceHeading: string
  sourceIntro: string
  quarantineBefore: string
  quarantineMid: string
  releasesLinkText: string
  quarantineAfter: string
  faqTitle: string
  faq: ReadonlyArray<readonly [string, string]>
}

const COPY: Record<SiteLocale, DownloadCopy> = {
  en: {
    metaTitle: 'Download',
    metaDescription: 'Download BIU for macOS, Windows, or Linux.',
    label: 'Download',
    heading: 'Run BIU on your device',
    lead: 'Ready to use after installation. Your data stays on your computer, and your models use your own API keys.',
    primaryWindows: 'Download for Windows',
    primaryLinux: 'Download for Linux',
    primaryMac: 'Download for macOS (Apple silicon)',
    macIntelAlt: 'Mac with an Intel processor →',
    latestRelease: (tag) => `Latest release ${tag}`,
    updatedAt: (date) => `Updated ${date}`,
    platformsAriaLabel: 'Platforms',
    yourSystemSuffix: ' · Your system',
    macDetail: 'Separate installers for Apple silicon and Intel',
    macSteps: [
      'Download the .dmg and drag BIU into Applications',
      'If macOS says the app is damaged when first opened, run this command in Terminal:',
    ],
    macArmLabel: 'Apple silicon',
    macIntelLabel: 'Intel processor',
    winDetail: 'Windows 10 or later · x64',
    winSteps: [
      'Download the .exe and run the installer',
      'If SmartScreen blocks it, select More info → Run anyway',
    ],
    winDownloadLabel: 'Download for Windows',
    linuxDetail: 'x64 AppImage',
    linuxSteps: [
      'Download the AppImage',
      'Make it executable and run:',
    ],
    linuxDownloadLabel: 'Download for Linux',
    copied: 'Copied',
    copy: 'Copy',
    copyAriaLabel: 'Copy command',
    requirementsHeading: 'System requirements',
    requirements: [
      ['System', 'macOS (Apple silicon / Intel), Windows 10 and later, or Linux x64'],
      ['Memory', '8 GB or more recommended'],
      ['Model', 'Bring your own key for any model'],
      ['Network', 'Works offline; model calls require an internet connection'],
    ],
    sourceLabel: 'Run from source',
    sourceHeading: 'Build from source',
    sourceIntro: 'These commands start both the service and the interface. Open http://127.0.0.1:5173 in your browser.',
    quarantineBefore: 'Why macOS may say the app is damaged: the installer has not yet been notarized by Apple, so macOS blocks the downloaded app. The xattr command only removes that download quarantine flag. The complete source code is available for review on ',
    quarantineMid: '. See ',
    releasesLinkText: 'all releases',
    quarantineAfter: '.',
    faqTitle: 'Installation FAQ',
    faq: [
      ['Which macOS installer should I choose?', 'Open About This Mac from the Apple menu. Choose Apple silicon for an Apple M-series chip, or Intel for an Intel processor.'],
      ['What if Windows SmartScreen blocks the installer?', 'Select More info, then Run anyway. The complete source code is available for review on GitHub.'],
      ['Can I use BIU without a model API key?', 'Pages, tables, and plugins work normally. Agents require a model API key; any model works.'],
      ['Is there a mobile app?', 'BIU is currently available for desktop. Installers are provided for macOS, Windows, and Linux.'],
    ],
  },
  zh: {
    metaTitle: '下载',
    metaDescription: '下载 BIU 桌面版：macOS、Windows 与 Linux 安装包。',
    label: '下载',
    heading: '在你的设备上运行',
    lead: '下载后开箱即用。数据存在你自己的电脑上，模型用你自己的密钥。',
    primaryWindows: '下载 Windows 版',
    primaryLinux: '下载 Linux 版',
    primaryMac: '下载 macOS 版（Apple 芯片）',
    macIntelAlt: 'Intel 芯片的 Mac →',
    latestRelease: (tag) => `最新版本 ${tag}`,
    updatedAt: (date) => `更新于 ${date}`,
    platformsAriaLabel: '平台',
    yourSystemSuffix: ' · 你的系统',
    macDetail: 'Apple 芯片与 Intel 各一个安装包',
    macSteps: [
      '下载 .dmg，拖入「应用程序」',
      '首次打开若提示「已损坏」，在终端执行：',
    ],
    macArmLabel: 'Apple 芯片',
    macIntelLabel: 'Intel 芯片',
    winDetail: 'Windows 10 及以上 · x64',
    winSteps: [
      '下载 .exe，运行安装程序',
      'SmartScreen 拦截时，选「更多信息」→「仍要运行」',
    ],
    winDownloadLabel: '下载 Windows 版',
    linuxDetail: 'x64 AppImage',
    linuxSteps: [
      '下载 AppImage',
      '加上可执行权限后运行：',
    ],
    linuxDownloadLabel: '下载 Linux 版',
    copied: '已复制',
    copy: '复制',
    copyAriaLabel: '复制命令',
    requirementsHeading: '系统要求',
    requirements: [
      ['系统', 'macOS（Apple 芯片 / Intel）、Windows 10 及以上、Linux x64'],
      ['内存', '建议 8 GB 以上'],
      ['模型', '自带密钥，任意模型'],
      ['网络', '平时可离线；调用模型时需要联网'],
    ],
    sourceLabel: '从源码运行',
    sourceHeading: '想自己改代码',
    sourceIntro: '执行完会同时启动服务和界面，浏览器打开 http://127.0.0.1:5173 即可。',
    quarantineBefore: '为什么 macOS 会提示「已损坏」：安装包还没有做苹果公证，系统会拦下来自网络的未公证应用。那行 xattr 命令只是去掉这个下载标记，代码全部开源，可以在 ',
    quarantineMid: ' 上核对。所有历史版本见 ',
    releasesLinkText: '版本发布',
    quarantineAfter: '。',
    faqTitle: '安装说明',
    faq: [
      ['如何选择 macOS 安装包', '打开苹果菜单中的「关于本机」。芯片一栏为 Apple M 系列时选择 Apple 芯片，为 Intel 时选择 Intel 芯片。'],
      ['Windows SmartScreen 拦截', '选择「更多信息」，再选择「仍要运行」。代码全部开源，可在 GitHub 核对。'],
      ['未配置模型密钥', '页面、表格和插件可以正常使用。智能体需要配置模型密钥，任意模型均可。'],
      ['移动端', '目前提供桌面版。macOS、Windows 与 Linux 均提供安装包。'],
    ],
  },
}

/** 只用来决定先给哪个按钮；猜错了，下面三个平台都还在。 */
export function detectPlatform(nav: Pick<Navigator, 'userAgent'> & { userAgentData?: { platform?: string }; platform?: string }): Platform | null {
  const hint = `${nav.userAgentData?.platform ?? ''} ${nav.platform ?? ''} ${nav.userAgent}`.toLowerCase()
  if (/iphone|ipad|android/.test(hint)) return null
  if (/mac/.test(hint)) return 'mac'
  if (/win/.test(hint)) return 'windows'
  if (/linux|x11|cros/.test(hint)) return 'linux'
  return null
}

function CopyCommand({ command, copy }: { command: string; copy: DownloadCopy }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])
  const handleCopy = () => {
    void navigator.clipboard?.writeText(command).then(() => setCopied(true), () => undefined)
  }
  return (
    <div className="site-copy-cmd">
      <code>{command}</code>
      <button type="button" onClick={handleCopy} aria-label={copied ? copy.copied : copy.copyAriaLabel}>
        {copied ? copy.copied : copy.copy}
      </button>
    </div>
  )
}

export function MarketingDownload({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  const { locale } = useSiteLocale()
  const copy = COPY[locale]
  const { release, stars } = useGitHubStats()
  const [platform, setPlatform] = useState<Platform | null>(null)
  useEffect(() => {
    if (typeof navigator !== 'undefined') setPlatform(detectPlatform(navigator))
  }, [])

  const urlOf = (id: PackageId) => release?.assets.find((asset) => PACKAGES[id].file.test(asset.name))?.url ?? RELEASES_PAGE
  const meta = [
    release ? copy.latestRelease(release.tag) : null,
    release?.publishedAt ? copy.updatedAt(formatDate(release.publishedAt)) : null,
    stars !== undefined ? <>GitHub <span className="site-gh-star" aria-hidden>★</span> {formatStars(stars)}</> : null,
  ].filter((item) => item !== null)

  usePageMeta({
    title: copy.metaTitle,
    description: copy.metaDescription,
    path: '/download',
  })

  const primary = platform === 'windows'
    ? { href: urlOf('windows'), label: copy.primaryWindows }
    : platform === 'linux'
      ? { href: urlOf('linux'), label: copy.primaryLinux }
      : { href: urlOf('mac-arm64'), label: copy.primaryMac }

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero" data-reveal>
          <p className="site-section-label">{copy.label}</p>
          <h1>{copy.heading}</h1>
          <p className="site-page-lead">{copy.lead}</p>
          <div className="site-download-primary">
            <a className="site-cta-primary" href={primary.href}><DownloadIcon />{primary.label}</a>
            {platform === 'mac' || platform === null ? (
              <a className="site-download-alt" href={urlOf('mac-intel')}>{copy.macIntelAlt}</a>
            ) : null}
          </div>
          {meta.length ? (
            <p className="site-download-meta">
              {meta.map((item, index) => <Fragment key={index}>{index ? ' · ' : null}{item}</Fragment>)}
            </p>
          ) : null}
        </section>

        <section className="site-platforms" aria-label={copy.platformsAriaLabel}>
          <div className="site-platform-grid">
            <article data-reveal className={platform === 'mac' ? 'is-current' : ''}>
              <h2>macOS</h2>
              <p className="site-platform-detail">{copy.macDetail}{platform === 'mac' ? copy.yourSystemSuffix : ''}</p>
              <ol>
                <li>{copy.macSteps[0]}</li>
                <li>{copy.macSteps[1]}</li>
              </ol>
              <CopyCommand command={QUARANTINE_FIX} copy={copy} />
              <div className="site-platform-actions">
                <a href={urlOf('mac-arm64')}>{copy.macArmLabel}</a>
                <a href={urlOf('mac-intel')}>{copy.macIntelLabel}</a>
              </div>
            </article>
            <article data-reveal className={platform === 'windows' ? 'is-current' : ''}>
              <h2>Windows</h2>
              <p className="site-platform-detail">{copy.winDetail}{platform === 'windows' ? copy.yourSystemSuffix : ''}</p>
              <ol>
                <li>{copy.winSteps[0]}</li>
                <li>{copy.winSteps[1]}</li>
              </ol>
              <div className="site-platform-actions">
                <a href={urlOf('windows')}>{copy.winDownloadLabel}</a>
              </div>
            </article>
            <article data-reveal className={platform === 'linux' ? 'is-current' : ''}>
              <h2>Linux</h2>
              <p className="site-platform-detail">{copy.linuxDetail}{platform === 'linux' ? copy.yourSystemSuffix : ''}</p>
              <ol>
                <li>{copy.linuxSteps[0]}</li>
                <li>{copy.linuxSteps[1]}</li>
              </ol>
              <CopyCommand command={LINUX_RUN} copy={copy} />
              <div className="site-platform-actions">
                <a href={urlOf('linux')}>{copy.linuxDownloadLabel}</a>
              </div>
            </article>
          </div>
        </section>

        <section className="site-requirements" data-reveal>
          <h2>{copy.requirementsHeading}</h2>
          <table>
            <tbody>
              {copy.requirements.map(([item, detail]) => (
                <tr key={item}><th>{item}</th><td>{detail}</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="site-local-note" id="source" data-reveal>
          <p className="site-section-label">{copy.sourceLabel}</p>
          <h2>{copy.sourceHeading}</h2>
          <p>{copy.sourceIntro}</p>
          <CopyCommand command={SOURCE_STEPS.join('\n')} copy={copy} />
          <p>
            {copy.quarantineBefore}
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
            {copy.quarantineMid}
            <a href={`${GITHUB_URL}/releases`} target="_blank" rel="noreferrer">{copy.releasesLinkText}</a>
            {copy.quarantineAfter}
          </p>
        </section>

        <SiteFaq title={copy.faqTitle} items={copy.faq} />
    </SiteChrome>
  )
}
