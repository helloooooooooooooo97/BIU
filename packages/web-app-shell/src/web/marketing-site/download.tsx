import { SiteChrome, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'

const PLATFORMS = [
  {
    id: 'macos',
    name: 'macOS',
    detail: 'Apple Silicon / Intel',
    steps: ['下载 .dmg', '拖入「应用程序」', '首次打开若提示已损坏，执行 xattr -dr com.apple.quarantine /Applications/Biu.app'],
  },
  {
    id: 'windows',
    name: 'Windows',
    detail: 'Windows 10 及以上',
    steps: ['下载安装包', '运行安装程序', '按向导完成安装'],
  },
  {
    id: 'linux',
    name: 'Linux',
    detail: '需要 Node.js 20+',
    steps: ['git clone 仓库', '执行 make', '访问 http://127.0.0.1:5173'],
  },
] as const

const REQUIREMENTS = [
  ['Node.js', '20 或更高（源码运行）'],
  ['系统', 'macOS / Windows 10+ / 主流 Linux'],
  ['内存', '建议 8 GB 以上'],
  ['网络', '配置模型密钥后需要联网调用模型'],
] as const

export function MarketingDownload({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: '下载',
    description: 'macOS / Windows / Linux 安装说明。本机空间的数据保存在当前设备，不需要上传。',
    path: '/download',
  })

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero" data-reveal>
          <p className="site-section-label">下载</p>
          <h1>在你的设备上运行。</h1>
          <p className="site-page-lead">
            本机空间的数据保存在当前设备，不需要上传。选一个平台开始。
          </p>
        </section>

        <section className="site-platforms" aria-label="平台">
          <div className="site-platform-grid">
            {PLATFORMS.map((platform) => (
              <article key={platform.id} data-reveal>
                <h2>{platform.name}</h2>
                <p className="site-platform-detail">{platform.detail}</p>
                <ol>
                  {platform.steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
                <button type="button" onClick={onStart}>获取 {platform.name} 版本</button>
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
          <p className="site-section-label">开始使用 BIU</p>
          <h2>先在本机跑起来。</h2>
          <button type="button" onClick={onStart}>创建你的空间 <span>↗</span></button>
        </section>
    </SiteChrome>
  )
}
