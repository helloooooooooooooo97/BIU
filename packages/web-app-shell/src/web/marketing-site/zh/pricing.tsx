import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DownloadIcon, GITHUB_URL, GitHubIcon, SiteChrome, SiteFaq, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'

/** 常见工具单价（每用户每月，美元）——源自 Notion 定价页的思路：让用户自己算。 */
const TOOL_COSTS = [
  { id: 'knowledge', label: '知识库', price: 10 },
  { id: 'project', label: '项目管理', price: 24 },
  { id: 'ai', label: 'AI 助手', price: 20 },
  { id: 'meeting', label: '会议记录', price: 18 },
  { id: 'search', label: '搜索', price: 35 },
  { id: 'calendar', label: '日程', price: 15 },
] as const

type Plan = {
  name: string
  price: string
  cadence: string
  features: readonly string[]
  cta: { label: string; kind: 'download' | 'github' | 'soon' }
  featured: boolean
}

const PLANS: readonly Plan[] = [
  {
    name: '桌面版',
    price: '$0',
    cadence: 'macOS / Windows',
    featured: true,
    features: ['本机空间，数据存在自己电脑上', '页面、表格、插件、智能体全部功能', '自带模型密钥，任意模型'],
    cta: { label: '下载', kind: 'download' },
  },
  {
    name: '自部署',
    price: '$0',
    cadence: 'Apache 2.0 开源',
    featured: false,
    features: ['完整源码，可审计、可修改', '部署在自己的服务器上', '可商用，保留许可与 NOTICE 即可'],
    cta: { label: '查看源码', kind: 'github' },
  },
  {
    name: '官方云端',
    price: '即将上线',
    cadence: '价格上线时公布',
    featured: false,
    features: ['多设备访问', '成员与权限', '在线协作', '上线前可以先自部署，功能相同'],
    cta: { label: '即将上线', kind: 'soon' },
  },
] as const

const PRICING_FAQ = [
  ['为何免费', 'BIU 是开源项目，代码以 Apache 2.0 许可发布。桌面版与自部署不收费，以便用页面组合软件。'],
  ['商用许可', 'Apache 2.0 允许商用、修改和再分发。使用时须保留许可文本与 NOTICE，并标明修改过的文件。'],
  ['模型调用费用', 'BIU 本身不收费。智能体调用的是用户自行配置的模型服务，费用由模型服务商按其价格收取。'],
  ['后续收费安排', '开源代码、桌面版和自部署持续免费。官方云端服务尚在准备，上线时另行公布价格。数据可随时完整导出。'],
  ['联系方式', '可在 GitHub 提交 issue，或发送邮件至 348876414@qq.com。'],
] as const

export function MarketingPricing({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: '定价',
    description: 'BIU 开源、免费：桌面版和自部署不收费，官方云端即将上线。用计算器看看把这些工具收进一个页面能省多少。',
    path: '/pricing',
  })
  const [selected, setSelected] = useState<string[]>(['knowledge', 'project', 'ai'])
  const [seats, setSeats] = useState(10)

  const toggleTool = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  const monthly = useMemo(
    () => TOOL_COSTS.filter((tool) => selected.includes(tool.id)).reduce((sum, tool) => sum + tool.price, 0),
    [selected],
  )
  const yearly = monthly * 12 * Math.max(1, seats)

  const renderCta = (plan: Plan) => {
    if (plan.cta.kind === 'download') return <Link className="site-plan-cta" to="/download"><DownloadIcon />{plan.cta.label}</Link>
    if (plan.cta.kind === 'github') {
      return <a className="site-plan-cta" href={GITHUB_URL} target="_blank" rel="noreferrer"><GitHubIcon />{plan.cta.label}</a>
    }
    return <button type="button" className="site-plan-cta" disabled>{plan.cta.label}</button>
  }

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero" data-reveal>
          <p className="site-section-label">定价</p>
          <h1>免费，而且开源</h1>
          <p className="site-page-lead">
            BIU 以 Apache 2.0 开源。桌面版和自部署都不收费，你只需要为自己选的模型付费；官方云端服务即将上线。
          </p>
        </section>

        <section className="site-plans" aria-label="使用方式">
          <div className="site-plans-grid">
            {PLANS.map((plan) => (
              <article key={plan.name} className={plan.featured ? 'is-featured' : ''} data-reveal>
                <h3>{plan.name}</h3>
                <p className="site-plan-price">{plan.price}<span>{plan.cadence}</span></p>
                <ul>
                  {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
                </ul>
                {renderCta(plan)}
              </article>
            ))}
          </div>
        </section>

        <section className="site-roi" data-reveal aria-label="成本对比">
          <h2>这些工具，现在每月花多少</h2>
          <div className="site-roi-body">
            <fieldset className="site-roi-tools">
              <legend className="sr-only">正在使用的工具</legend>
              {TOOL_COSTS.map((tool) => (
                <label key={tool.id} className={selected.includes(tool.id) ? 'is-on' : ''}>
                  <input
                    type="checkbox"
                    checked={selected.includes(tool.id)}
                    onChange={() => toggleTool(tool.id)}
                  />
                  <span>{tool.label}</span>
                  <em>${tool.price}/人</em>
                </label>
              ))}
            </fieldset>
            <div className="site-roi-result">
              <label className="site-roi-seats">
                团队人数
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={seats}
                  onChange={(event) => setSeats(Math.max(1, Math.min(5000, Number(event.target.value) || 1)))}
                />
              </label>
              <p className="site-roi-number">
                <strong>${monthly}</strong><span>/人/月</span>
              </p>
              <p className="site-roi-total">合计约 <strong>${yearly.toLocaleString('en-US')}</strong> / 年，BIU 是 <strong>$0</strong></p>
              <p className="site-roi-note">
                在 BIU 里，这些能力可以是同一个页面里的几个插件块。模型调用费用另算，取决于你选的服务商。
              </p>
            </div>
          </div>
        </section>

        <section className="site-space-compare" data-reveal>
          <h2>本机空间 vs 云端空间</h2>
          <table>
            <thead>
              <tr><th>维度</th><th>本机空间</th><th>云端空间</th></tr>
            </thead>
            <tbody>
              <tr><td>数据位置</td><td>你自己的电脑</td><td>云端托管</td></tr>
              <tr><td>离线</td><td>可用</td><td>需要网络</td></tr>
              <tr><td>多设备</td><td>—</td><td>支持</td></tr>
              <tr><td>成员协作</td><td>—</td><td>支持权限管理</td></tr>
              <tr><td>价格</td><td>免费</td><td>自部署免费；官方云端即将上线</td></tr>
            </tbody>
          </table>
        </section>

        <SiteFaq title="定价说明" items={PRICING_FAQ} />

        <SiteFinalCta title="现在就免费用起来" />
    </SiteChrome>
  )
}
