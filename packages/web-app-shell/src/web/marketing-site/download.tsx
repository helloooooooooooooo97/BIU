import { useEffect, useState } from 'react'
import { GITHUB_URL, SiteChrome, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'

const RELEASE_API = 'https://api.github.com/repos/helloooooooooooooo97/biu/releases/latest'
const RELEASES_PAGE = 'https://github.com/helloooooooooooooo97/biu/releases/latest'

const PACKAGES = [
  {
    id: 'mac-arm64',
    os: 'macOS',
    name: 'Apple 芯片',
    file: /-mac-arm64\.dmg$/,
    steps: ['下载 .dmg', '拖入「应用程序」', '首次打开若提示「已损坏」，在终端执行：xattr -dr com.apple.quarantine /Applications/Biu.app'],
  },
  {
    id: 'mac-intel',
    os: 'macOS',
    name: 'Intel',
    file: /-mac-x64\.dmg$/,
    steps: ['下载 .dmg', '拖入「应用程序」', '首次打开若提示「已损坏」，在终端执行：xattr -dr com.apple.quarantine /Applications/Biu.app'],
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
    description: '免费下载 BIU 桌面版：macOS 与 Windows 安装包，或在 Linux 上从源码运行。',
    path: '/download',
  })

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero" data-reveal>
          <p className="site-section-label">下载</p>
          <h1>在你的设备上运行</h1>
          <p className="site-page-lead">
            免费下载，开箱即用{tag ? `，当前版本 ${tag}` : ''}。macOS 分 Apple 芯片和 Intel，Windows 是 x64 安装程序；Linux 可以从源码运行。
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
          <p className="site-section-label">从源码运行</p>
          <h2>Linux 或想自己改代码</h2>
          <p>需要 Node.js 20 或更高版本和 npm。执行完会同时启动服务和界面，浏览器打开 http://127.0.0.1:5173 即可。</p>
          <pre className="site-source-steps"><code>{SOURCE_STEPS.join('\n')}</code></pre>
          <p>
            为什么 macOS 会提示「已损坏」：安装包还没有做苹果公证，系统会拦下来自网络的未公证应用。
            安装步骤里那行 xattr 命令只是去掉这个下载标记，代码全部开源，可以在 <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a> 上核对。
          </p>
        </section>
    </SiteChrome>
  )
}
