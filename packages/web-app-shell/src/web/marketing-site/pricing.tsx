import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DownloadIcon, GITHUB_URL, GitHubIcon, SiteChrome, SiteFaq, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'

/** 常见工具单价（每用户每月，美元）——源自 Notion 定价页的思路：让用户自己算。 */
const TOOL_COSTS = [
  { id: 'knowledge', label: 'Knowledge base', price: 10 },
  { id: 'project', label: 'Project management', price: 24 },
  { id: 'ai', label: 'AI assistant', price: 20 },
  { id: 'meeting', label: 'Meeting notes', price: 18 },
  { id: 'search', label: 'Search', price: 35 },
  { id: 'calendar', label: 'Calendar', price: 15 },
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
] as const

const PRICING_FAQ = [
  ['Why is BIU free?', 'BIU is open source under the Apache 2.0 license. The desktop app and self-hosted version are free, so anyone can compose software with pages.'],
  ['Can I use BIU commercially?', 'Yes. Apache 2.0 permits commercial use, modification, and redistribution. You must retain the license and NOTICE files and identify modified files.'],
  ['What do model calls cost?', 'BIU does not charge for model usage. Agents call the model provider you configure, and that provider bills you at its standard rates.'],
  ['Will BIU charge in the future?', 'The source code, desktop app, and self-hosted version will remain free. Pricing for BIU Cloud will be announced at launch. You can export all your data at any time.'],
  ['How can I get in touch?', 'Open an issue on GitHub or email 348876414@qq.com.'],
] as const

export function MarketingPricing({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: 'Pricing',
    description: 'BIU is free and open source. The desktop app and self-hosted version cost nothing, and BIU Cloud is coming soon.',
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
          <p className="site-section-label">Pricing</p>
          <h1>Free and open source</h1>
          <p className="site-page-lead">
            BIU is open source under Apache 2.0. The desktop app and self-hosted version are free—you only pay
            your chosen model provider. BIU Cloud is coming soon.
          </p>
        </section>

        <section className="site-plans" aria-label="Ways to use BIU">
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

        <section className="site-roi" data-reveal aria-label="Cost comparison">
          <h2>What do these tools cost today?</h2>
          <div className="site-roi-body">
            <fieldset className="site-roi-tools">
              <legend className="sr-only">Tools you currently use</legend>
              {TOOL_COSTS.map((tool) => (
                <label key={tool.id} className={selected.includes(tool.id) ? 'is-on' : ''}>
                  <input
                    type="checkbox"
                    checked={selected.includes(tool.id)}
                    onChange={() => toggleTool(tool.id)}
                  />
                  <span>{tool.label}</span>
                  <em>${tool.price}/user</em>
                </label>
              ))}
            </fieldset>
            <div className="site-roi-result">
              <label className="site-roi-seats">
                Team size
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={seats}
                  onChange={(event) => setSeats(Math.max(1, Math.min(5000, Number(event.target.value) || 1)))}
                />
              </label>
              <p className="site-roi-number">
                <strong>${monthly}</strong><span>/user/month</span>
              </p>
              <p className="site-roi-total">About <strong>${yearly.toLocaleString('en-US')}</strong> / year in total. BIU is <strong>$0</strong>.</p>
              <p className="site-roi-note">
                In BIU, these capabilities can live as plugin blocks on one page. Model usage is billed separately
                by your chosen provider.
              </p>
            </div>
          </div>
        </section>

        <section className="site-space-compare" data-reveal>
          <h2>Local spaces vs. cloud spaces</h2>
          <table>
            <thead>
              <tr><th>Category</th><th>Local space</th><th>Cloud space</th></tr>
            </thead>
            <tbody>
              <tr><td>Data location</td><td>Your computer</td><td>Cloud-hosted</td></tr>
              <tr><td>Offline access</td><td>Available</td><td>Internet required</td></tr>
              <tr><td>Multiple devices</td><td>—</td><td>Supported</td></tr>
              <tr><td>Team collaboration</td><td>—</td><td>Permission controls</td></tr>
              <tr><td>Price</td><td>Free</td><td>Free to self-host; BIU Cloud coming soon</td></tr>
            </tbody>
          </table>
        </section>

        <SiteFaq title="Pricing FAQ" items={PRICING_FAQ} />

        <SiteFinalCta title="Start using BIU for free" />
    </SiteChrome>
  )
}
