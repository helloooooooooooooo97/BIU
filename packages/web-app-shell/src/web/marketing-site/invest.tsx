import { Link } from 'react-router-dom'
import { CONTACT_EMAIL, SiteChrome, SiteFaq, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'

export const INVEST_MAIL = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Investing in BIU')}`

/** 每一行的数字出自对应文章的参考资料。 */
const VISION_ROWS = [
  {
    verb: 'Build',
    slug: 'build-software',
    context: 'Agents build against real data, and every change takes effect immediately in a live service.',
    economy: '$1.468 trillion in global software spending (2026); the pool of builders expands from 48.4 million developers to 1.14 billion knowledge workers.',
  },
  {
    verb: 'Store',
    slug: 'store-software',
    context: 'Structured properties and free-form text coexist on one page, letting agents retrieve exact fields instead of guessing from long passages.',
    economy: 'Public-cloud spending reaches $1.49 trillion in 2029; nearly 90% of global data is unstructured, and knowledge workers spend 19% of their time finding information.',
  },
  {
    verb: 'Compose',
    slug: 'compose-software',
    context: 'A project’s data, rules, and history live together, giving agents complete and precise context.',
    economy: 'Generative AI’s $2.6–4.4 trillion in annual value depends on context; enterprises use 897 applications on average, and only 29% are integrated.',
  },
  {
    verb: 'Distribute',
    slug: 'distribute-software',
    context: 'Permissions are computed with the page, clearly bounding whom an agent represents, what it can see, and what it can do.',
    economy: 'The App Store ecosystem facilitated about $1.3 trillion in commerce in 2024; one link delivers the product without packaging, store review, or a 30% commission.',
  },
  {
    verb: 'Derive',
    slug: 'derive-software',
    context: 'Agents reference existing plugins, repositories, and pages, extending and layering them so capabilities keep accumulating.',
    economy: 'Open-source software has roughly $8.8 trillion in demand-side value; 630 million GitHub repositories are waiting to be reused more broadly.',
  },
] as const

export function VisionTable() {
  return (
    <div className="site-vision-table" role="table" aria-label="Five verbs" data-reveal>
      <div className="site-vision-row site-vision-head" role="row">
        <span role="columnheader">Verb</span>
        <span role="columnheader">Agent context</span>
        <span role="columnheader">Economic scale</span>
      </div>
      {VISION_ROWS.map((row, index) => (
        <div className="site-vision-row" role="row" key={row.slug}>
          <span role="rowheader">
            <Link to={`/blog/${row.slug}`}>
              <sup aria-hidden>{String(index + 1).padStart(2, '0')}</sup>
              {row.verb}
            </Link>
          </span>
          <span role="cell">{row.context}</span>
          <span role="cell">{row.economy}</span>
        </div>
      ))}
    </div>
  )
}

const THESIS = [
  {
    index: '01',
    title: 'How software is produced is changing',
    body: 'Gartner forecasts global software spending of $1.468 trillion in 2026. By 2028, 33% of enterprise software applications will include agentic capabilities, up from less than 1% in 2024. The pool of software builders is expanding from 48.4 million developers to 1.14 billion knowledge workers.',
  },
  {
    index: '02',
    title: 'Agents need a new medium',
    body: 'Enterprises use 897 applications on average, yet only 29% are integrated; 95% of IT leaders see integration as a barrier to deploying AI effectively. McKinsey estimates that generative AI could create $2.6–4.4 trillion in value each year—but realizing it requires giving agents complete context.',
  },
  {
    index: '03',
    title: 'The page is that medium',
    body: 'In BIU, one page brings together software, data, and people. Building, storing, composing, distributing, and deriving all happen on that page, where agents and users collaborate in the same workspace.',
  },
] as const

const TODAY = [
  ['Open-source desktop app', 'Released under Apache 2.0, the desktop app is free to download, auditable, and self-hostable.', '/download'],
  ['Plugins are software', 'Every block on a page comes from a plugin: tables, whiteboards, coding exercises, video editors. Once written, each works alongside every other block.', '/product'],
  ['Share the whole page', 'One link delivers the complete service. Recipients can open and use it immediately, with no installation or app-store listing.', '/use-cases'],
  ['Condition-based permissions', 'Both data and member views are conditions. Visibility is computed at access time, and inherited permissions remain traceable.', '/security'],
] as const

const BUSINESS = [
  ['Open source · Acquisition', 'The desktop app, self-hosted version, and source code remain free. Open source builds trust and word of mouth, and drives user growth.'],
  ['BIU Cloud · Subscriptions', 'Multi-device access, members and permissions, and online collaboration, sold per seat to individuals and teams. Pricing will be announced at launch.'],
  ['Enterprise & ecosystem · Expansion', 'Support and services for private enterprise deployments, plus plugin distribution with developer revenue sharing.'],
] as const

const ROADMAP = [
  {
    index: '01',
    title: 'Launch BIU Cloud and start subscription revenue',
    body: 'Bring multi-device access, members and permissions, and online collaboration to the cloud. Local and cloud spaces coexist, and data can be exported at any time.',
  },
  {
    index: '02',
    title: 'Build the plugin ecosystem so software keeps deriving',
    body: 'Open plugin development, distribution, and referencing, so agents can turn VS Code extensions, GitHub repositories, and existing pages into new capabilities, backed by developer revenue sharing.',
  },
  {
    index: '03',
    title: 'Expand into teams and enterprises',
    body: 'Offer teams member management and traceable permissions, and offer enterprises private deployment and support, growing page-by-page services into a company’s system of work.',
  },
] as const

const FUNDS = [
  ['R&D', 'Agent capabilities and cloud infrastructure.'],
  ['Ecosystem', 'Plugin developers, templates, and community.'],
  ['Growth', 'Open-source community, content, and early customers.'],
  ['Team', 'Engineering, product, and design talent.'],
] as const

const INVEST_FAQ = [
  ['How can I contact you?', `Email ${CONTACT_EMAIL} and include your organization, areas of interest, and contact details.`],
  ['How can I get the business plan?', `Email ${CONTACT_EMAIL} and we will reply with our business plan and round details.`],
  ['Can I see the product first?', 'BIU is open source. You can download and try the desktop app directly, and all code is public on GitHub.'],
  ['Where does the data come from?', 'The market data comes from Gartner, IDC, McKinsey, Harvard Business School, and other institutions. Full references appear at the end of the five verb articles.'],
] as const

export function MarketingInvest({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: 'Invest',
    description: 'BIU is an AI-native software company that brings software building, storage, composition, distribution, and derivation onto one page—five markets worth trillions of dollars each.',
    path: '/invest',
  })

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
      <section className="site-page-hero" data-reveal>
        <p className="site-section-label">Invest</p>
        <h1>Invest in the next trillion-dollar AI company</h1>
        <p className="site-page-lead">
          BIU is an AI-native software company building the medium for human–agent collaboration. One page brings
          together software building, storage, composition, distribution, and derivation—five markets worth trillions
          of dollars each. Agents are rewriting all five, and we are looking for investors who share this conviction.
        </p>
        <div className="site-cta-actions site-invest-actions">
          <a className="site-cta-primary" href={INVEST_MAIL}>
            Contact us
          </a>
          <Link className="site-cta-secondary" to="/product">
            Explore the product
          </Link>
        </div>
      </section>

      <section className="site-security-blocks site-invest-thesis" aria-label="Investment thesis">
        {THESIS.map((item) => (
          <article key={item.index} data-reveal>
            <span className="site-solution-index">{item.index}</span>
            <h2>{item.title}</h2>
            <p>{item.body}</p>
          </article>
        ))}
      </section>

      <section className="site-home-entry site-vision" aria-label="Five markets">
        <div className="site-home-entry-heading" data-reveal>
          <p className="site-section-label">Markets</p>
          <h2>Five verbs, five trillion-dollar markets</h2>
          <p>Each verb links to the full case, with sources listed in the references at the end.</p>
        </div>
        <VisionTable />
      </section>

      <section className="site-home-entry site-invest-today" aria-label="Available today">
        <div className="site-home-entry-heading" data-reveal>
          <p className="site-section-label">Product</p>
          <h2>Ready to use today</h2>
        </div>
        <div className="site-invest-today-grid" data-reveal>
          {TODAY.map(([title, body, to]) => (
            <Link key={title} to={to}>
              <h3>{title}</h3>
              <p>{body}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="site-home-entry" aria-label="Business model">
        <div className="site-home-entry-heading" data-reveal>
          <p className="site-section-label">Business model</p>
          <h2>Open source drives adoption. Cloud and enterprise drive revenue.</h2>
          <p>Like most successful open-source companies, the core product is free. Revenue comes from hosted services, team collaboration, and enterprise support.</p>
        </div>
        <div className="site-invest-today-grid is-three" data-reveal>
          {BUSINESS.map(([title, body]) => (
            <div key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="site-home-entry" aria-label="Plan after funding">
        <div className="site-home-entry-heading" data-reveal>
          <p className="site-section-label">Plan</p>
          <h2>Three steps after this round</h2>
        </div>
        <div className="site-security-blocks site-invest-roadmap">
          {ROADMAP.map((item) => (
            <article key={item.index} data-reveal>
              <span className="site-solution-index">{item.index}</span>
              <h2>{item.title}</h2>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="site-home-entry" aria-label="Use of funds">
        <div className="site-home-entry-heading" data-reveal>
          <p className="site-section-label">This round</p>
          <h2>Where the funds go</h2>
          <p>The round size, valuation, and financial projections are in our business plan. Email us to request it.</p>
        </div>
        <div className="site-invest-today-grid" data-reveal>
          {FUNDS.map(([title, body]) => (
            <div key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="site-home-entry" aria-label="Contact">
        <div className="site-vision-invest" data-reveal>
          <div>
            <h2>Let’s talk</h2>
            <p>We welcome conversations about our product roadmap and fundraising plans. Please include your organization and areas of interest.</p>
            <p className="site-vision-note">{CONTACT_EMAIL}</p>
          </div>
          <a className="site-cta-primary" href={INVEST_MAIL}>
            Contact us
          </a>
        </div>
      </section>

      <SiteFaq title="About investing" items={INVEST_FAQ} />

      <SiteFinalCta title="Try a page for yourself first" />
    </SiteChrome>
  )
}
