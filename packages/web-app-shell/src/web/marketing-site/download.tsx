import { useEffect, useState } from 'react'
import { SiteChrome, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'

const RELEASE_API = 'https://api.github.com/repos/helloooooooooooooo97/biu/releases/latest'
const RELEASES_PAGE = 'https://github.com/helloooooooooooooo97/biu/releases/latest'

const PACKAGES = [
  {
    id: 'mac-arm64',
    os: 'macOS',
    name: 'Apple 芯片',
    file: /-mac-arm64\.dmg$/,
    steps: ['下载 .dmg', '拖入「应用程序」', '若提示已损坏：xattr -dr com.apple.quarantine /Applications/Biu.app'],
  },
  {
    id: 'mac-intel',
    os: 'macOS',
    name: 'Intel',
    file: /-mac-x64\.dmg$/,
    steps: ['下载 .dmg', '拖入「应用程序」', '若提示已损坏：xattr -dr com.apple.quarantine /Applications/Biu.app'],
  },
  {
    id: 'windows',
    os: 'Windows',
    name: 'Windows 10 及以上',
    file: /-win-x64\.exe$/,
    steps: ['下载 .exe', '运行安装程序', 'SmartScreen 选「更多信息」→「仍要运行」'],
  },
] as const

const REQUIREMENTS = [
  ['Node.js', '20 或更高（源码运行）'],
  ['系统', 'macOS / Windows 10+ / 主流 Linux'],
  ['内存', '建议 8 GB 以上'],
  ['网络', '配置模型密钥后需要联网调用模型'],
] as const

export function MarketingDownload({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  const [tag, setTag] = useState('')
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    fetch(RELEASE_API)
      .then((response) => response.json())
      .then((release: { tag_name?: string; assets?: Array<{ name: string; browser_download_url: string }> }) => {
        if (cancelled) return
        const next: Record<string, string> = {}
        for (const item of PACKAGES) {
          const asset = release.assets?.find((entry) => item.file.test(entry.name))
          if (asset) next[item.id] = asset.browser_download_url
        }
        setTag(release.tag_name ?? '')
        setUrls(next)
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  usePageMeta({
    title: '下载',
    description: 'macOS 与 Windows 安装包，来自 GitHub Releases 的最新 tag。',
    path: '/download',
  })

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero" data-reveal>
          <p className="site-section-label">下载</p>
          <h1>在你的设备上运行。</h1>
          <p className="site-page-lead">
            安装包来自 GitHub 最新 tag{tag ? ` ${tag}` : ''}。macOS 分 Apple 芯片和 Intel，Windows 是 x64 安装程序。
          </p>
        </section>

        <section className="site-platforms" aria-label="平台">
          <div className="site-platform-grid">
            {PACKAGES.map((item) => (
              <article key={item.id} data-reveal>
                <h2>{item.os}</h2>
                <p className="site-platform-detail">{item.name}</p>
                <ol>
                  {item.steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
                <a href={urls[item.id] ?? RELEASES_PAGE}>
                  下载 {item.os}{item.id === 'mac-intel' ? ' Intel' : item.id === 'mac-arm64' ? '（Apple 芯片）' : ''}
                </a>
              </article>
            ))}
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

        <section className="site-local-note" data-reveal>
          <p className="site-section-label">本机空间</p>
          <h2>数据留在你的设备上。</h2>
          <p>
            本机空间把页面、数据库和附件保存在当前设备，离线可用。
            需要协作时再使用云端空间 —— 两种空间各自成立，创建时由你决定。
          </p>
        </section>

        <section className="site-final-cta" data-reveal>
          <div className="site-container">
            <p className="site-section-label">开始使用 BIU</p>
            <h2>先在本机跑起来。</h2>
            <button type="button" onClick={onStart}>创建你的空间 <span>↗</span></button>
          </div>
        </section>
    </SiteChrome>
  )
}
