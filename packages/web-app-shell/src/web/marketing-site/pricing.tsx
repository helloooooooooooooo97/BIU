import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DownloadIcon, GITHUB_URL, GitHubIcon, SiteChrome, SiteFaq, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'
import { useSiteLocale, type SiteLocale } from './locale.tsx'

type Plan = {
  name: string
  price: string
  cadence: string
  features: readonly string[]
  cta: { label: string; kind: 'download' | 'github' | 'soon' }
  featured: boolean
}

type PricingCopy = {
  metaTitle: string
  metaDescription: string
  label: string
  heading: string
  lead: string
  plansAriaLabel: string
  plans: readonly Plan[]
  roiAriaLabel: string
  roiHeading: string
  roiLegend: string
  toolCosts: ReadonlyArray<{ id: string; label: string; price: number }>
  perUserUnit: string
  teamSizeLabel: string
  perUserMonthUnit: string
  totalBefore: string
  totalMid: string
  totalAfter: string
  roiNote: string
  spaceHeading: string
  spaceHeaders: readonly [string, string, string]
  spaceRows: ReadonlyArray<readonly [string, string, string]>
  faqTitle: string
  faq: ReadonlyArray<readonly [string, string]>
  ctaTitle: string
}

/** 常见工具单价（每用户每月，美元）——源自 Notion 定价页的思路：让用户自己算。 */
const COPY: Record<SiteLocale, PricingCopy> = {
  en: {
    metaTitle: 'Pricing',
    metaDescription: 'BIU is free and open source. The desktop app and self-hosted version cost nothing, and BIU Cloud is coming soon.',
    label: 'Pricing',
    heading: 'Free and open source',
    lead: 'BIU is open source under Apache 2.0. The desktop app and self-hosted version are free—you only pay your chosen model provider. BIU Cloud is coming soon.',
    plansAriaLabel: 'Ways to use BIU',
    plans: [
      {
        name: 'Desktop',
        price: '$0',
        cadence: 'macOS / Windows',
        featured: true,
        features: ['Local spaces keep data on your computer', 'Full access to pages, tables, plugins, and agents', 'Bring your own key for any model'],
        cta: { label: 'Download', kind: 'download' },
      },
      {
        name: 'Self-hosted',
        price: '$0',
        cadence: 'Apache 2.0 open source',
        featured: false,
        features: ['Complete source code to audit and modify', 'Deploy on your own servers', 'Commercial use allowed with the license and NOTICE retained'],
        cta: { label: 'View source', kind: 'github' },
      },
      {
        name: 'BIU Cloud',
        price: 'Coming soon',
        cadence: 'Pricing to be announced',
        featured: false,
        features: ['Multi-device access', 'Members and permissions', 'Online collaboration', 'Self-host the same features today'],
        cta: { label: 'Coming soon', kind: 'soon' },
      },
    ],
    roiAriaLabel: 'Cost comparison',
    roiHeading: 'What do these tools cost today?',
    roiLegend: 'Tools you currently use',
    toolCosts: [
      { id: 'knowledge', label: 'Knowledge base', price: 10 },
      { id: 'project', label: 'Project management', price: 24 },
      { id: 'ai', label: 'AI assistant', price: 20 },
      { id: 'meeting', label: 'Meeting notes', price: 18 },
      { id: 'search', label: 'Search', price: 35 },
      { id: 'calendar', label: 'Calendar', price: 15 },
    ],
    perUserUnit: '/user',
    teamSizeLabel: 'Team size',
    perUserMonthUnit: '/user/month',
    totalBefore: 'About ',
    totalMid: ' / year in total. BIU is ',
    totalAfter: '.',
    roiNote: 'In BIU, these capabilities can live as plugin blocks on one page. Model usage is billed separately by your chosen provider.',
    spaceHeading: 'Local spaces vs. cloud spaces',
    spaceHeaders: ['Category', 'Local space', 'Cloud space'],
    spaceRows: [
      ['Data location', 'Your computer', 'Cloud-hosted'],
      ['Offline access', 'Available', 'Internet required'],
      ['Multiple devices', '—', 'Supported'],
      ['Team collaboration', '—', 'Permission controls'],
      ['Price', 'Free', 'Free to self-host; BIU Cloud coming soon'],
    ],
    faqTitle: 'Pricing FAQ',
    faq: [
      ['Why is BIU free?', 'BIU is open source under the Apache 2.0 license. The desktop app and self-hosted version are free, so anyone can compose software with pages.'],
      ['Can I use BIU commercially?', 'Yes. Apache 2.0 permits commercial use, modification, and redistribution. You must retain the license and NOTICE files and identify modified files.'],
      ['What do model calls cost?', 'BIU does not charge for model usage. Agents call the model provider you configure, and that provider bills you at its standard rates.'],
      ['Will BIU charge in the future?', 'The source code, desktop app, and self-hosted version will remain free. Pricing for BIU Cloud will be announced at launch. You can export all your data at any time.'],
      ['How can I get in touch?', 'Open an issue on GitHub or email 348876414@qq.com.'],
    ],
    ctaTitle: 'Download BIU for free',
  },
  zh: {
    metaTitle: '定价',
    metaDescription: 'BIU 开源、免费：桌面版和自部署不收费，官方云端即将上线。用计算器看看把这些工具收进一个页面能省多少。',
    label: '定价',
    heading: '免费，而且开源',
    lead: 'BIU 以 Apache 2.0 开源。桌面版和自部署都不收费，你只需要为自己选的模型付费；官方云端服务即将上线。',
    plansAriaLabel: '使用方式',
    plans: [
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
    ],
    roiAriaLabel: '成本对比',
    roiHeading: '这些工具，现在每月花多少',
    roiLegend: '正在使用的工具',
    toolCosts: [
      { id: 'knowledge', label: '知识库', price: 10 },
      { id: 'project', label: '项目管理', price: 24 },
      { id: 'ai', label: 'AI 助手', price: 20 },
      { id: 'meeting', label: '会议记录', price: 18 },
      { id: 'search', label: '搜索', price: 35 },
      { id: 'calendar', label: '日程', price: 15 },
    ],
    perUserUnit: '/人',
    teamSizeLabel: '团队人数',
    perUserMonthUnit: '/人/月',
    totalBefore: '合计约 ',
    totalMid: ' / 年，BIU 是 ',
    totalAfter: '',
    roiNote: '在 BIU 里，这些能力可以是同一个页面里的几个插件块。模型调用费用另算，取决于你选的服务商。',
    spaceHeading: '本机空间 vs 云端空间',
    spaceHeaders: ['维度', '本机空间', '云端空间'],
    spaceRows: [
      ['数据位置', '你自己的电脑', '云端托管'],
      ['离线', '可用', '需要网络'],
      ['多设备', '—', '支持'],
      ['成员协作', '—', '支持权限管理'],
      ['价格', '免费', '自部署免费；官方云端即将上线'],
    ],
    faqTitle: '定价说明',
    faq: [
      ['为何免费', 'BIU 是开源项目，代码以 Apache 2.0 许可发布。桌面版与自部署不收费，以便用页面组合软件。'],
      ['商用许可', 'Apache 2.0 允许商用、修改和再分发。使用时须保留许可文本与 NOTICE，并标明修改过的文件。'],
      ['模型调用费用', 'BIU 本身不收费。智能体调用的是用户自行配置的模型服务，费用由模型服务商按其价格收取。'],
      ['后续收费安排', '开源代码、桌面版和自部署持续免费。官方云端服务尚在准备，上线时另行公布价格。数据可随时完整导出。'],
      ['联系方式', '可在 GitHub 提交 issue，或发送邮件至 348876414@qq.com。'],
    ],
    ctaTitle: '免费下载，立即开始',
  },
}

export function MarketingPricing({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  const { locale } = useSiteLocale()
  const copy = COPY[locale]
  usePageMeta({
    title: copy.metaTitle,
    description: copy.metaDescription,
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
    () => copy.toolCosts.filter((tool) => selected.includes(tool.id)).reduce((sum, tool) => sum + tool.price, 0),
    [copy.toolCosts, selected],
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
          <p className="site-section-label">{copy.label}</p>
          <h1>{copy.heading}</h1>
          <p className="site-page-lead">{copy.lead}</p>
        </section>

        <section className="site-plans" aria-label={copy.plansAriaLabel}>
          <div className="site-plans-grid">
            {copy.plans.map((plan) => (
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

        <section className="site-roi" data-reveal aria-label={copy.roiAriaLabel}>
          <h2>{copy.roiHeading}</h2>
          <div className="site-roi-body">
            <fieldset className="site-roi-tools">
              <legend className="sr-only">{copy.roiLegend}</legend>
              {copy.toolCosts.map((tool) => (
                <label key={tool.id} className={selected.includes(tool.id) ? 'is-on' : ''}>
                  <input
                    type="checkbox"
                    checked={selected.includes(tool.id)}
                    onChange={() => toggleTool(tool.id)}
                  />
                  <span>{tool.label}</span>
                  <em>${tool.price}{copy.perUserUnit}</em>
                </label>
              ))}
            </fieldset>
            <div className="site-roi-result">
              <label className="site-roi-seats">
                {copy.teamSizeLabel}
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={seats}
                  onChange={(event) => setSeats(Math.max(1, Math.min(5000, Number(event.target.value) || 1)))}
                />
              </label>
              <p className="site-roi-number">
                <strong>${monthly}</strong><span>{copy.perUserMonthUnit}</span>
              </p>
              <p className="site-roi-total">
                {copy.totalBefore}<strong>${yearly.toLocaleString('en-US')}</strong>{copy.totalMid}<strong>$0</strong>{copy.totalAfter}
              </p>
              <p className="site-roi-note">{copy.roiNote}</p>
            </div>
          </div>
        </section>

        <section className="site-space-compare" data-reveal>
          <h2>{copy.spaceHeading}</h2>
          <table>
            <thead>
              <tr>
                <th>{copy.spaceHeaders[0]}</th>
                <th>{copy.spaceHeaders[1]}</th>
                <th>{copy.spaceHeaders[2]}</th>
              </tr>
            </thead>
            <tbody>
              {copy.spaceRows.map(([cat, local, cloud]) => (
                <tr key={cat}>
                  <td>{cat}</td>
                  <td>{local}</td>
                  <td>{cloud}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <SiteFaq title={copy.faqTitle} items={copy.faq} />

        <SiteFinalCta title={copy.ctaTitle} />
    </SiteChrome>
  )
}
