import { Link } from 'react-router-dom'
import { CONTACT_EMAIL, SiteChrome, SiteFaq, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'
import { useSiteLocale, type SiteLocale } from './locale.tsx'

export const INVEST_MAIL = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Investing in BIU')}`
const ZH_INVEST_MAIL = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('BIU 投资洽谈')}`

type VisionRow = {
  verb: string
  slug: string
  context: string
  economy: string
}

const VISION_COPY: Record<
  SiteLocale,
  {
    ariaLabel: string
    headers: readonly [string, string, string]
    rows: readonly VisionRow[]
  }
> = {
  en: {
    ariaLabel: 'Five verbs',
    headers: ['Verb', 'Agent context', 'Economic scale'],
    rows: [
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
    ],
  },
  zh: {
    ariaLabel: '五个动词',
    headers: ['动词', 'Agent 的上下文', '经济规模'],
    rows: [
      {
        verb: '构建',
        slug: 'build-software',
        context: '智能体在真实数据上构建，每一次修改都立即作用于正在运行的服务。',
        economy: '全球软件支出 1.468 万亿美元（2026）；构建者从 4840 万开发者扩展到 11.4 亿知识工作者。',
      },
      {
        verb: '存储',
        slug: 'store-software',
        context: '结构化属性与自由正文同存一页，智能体按字段精确检索，减少整段文本的猜测。',
        economy: '公有云支出 2029 年达 1.49 万亿美元；全球近九成数据为非结构化，知识工作者 19% 的时间用于找信息。',
      },
      {
        verb: '组合',
        slug: 'compose-software',
        context: '一项工作的数据、规则与历史集中在一处，智能体拿到的是完整而精准的上下文。',
        economy: '生成式 AI 每年 2.6–4.4 万亿美元的价值，取决于上下文；企业平均 897 款应用，仅 29% 互通。',
      },
      {
        verb: '分发',
        slug: 'distribute-software',
        context: '权限随页面计算，智能体代表谁、能看到什么、能做什么，都有明确的边界。',
        economy: 'App Store 生态 2024 年促成约 1.3 万亿美元交易；一个链接即可交付，无需打包、上架与 30% 佣金。',
      },
      {
        verb: '衍生',
        slug: 'derive-software',
        context: '智能体引用已有的插件、仓库与页面，在其上扩展和叠加，能力持续累积。',
        economy: '开源软件的需求侧价值约 8.8 万亿美元；GitHub 6.3 亿个仓库，等待被更多人复用。',
      },
    ],
  },
}

export function VisionTable() {
  const { locale } = useSiteLocale()
  const table = VISION_COPY[locale]
  return (
    <div className="site-vision-table" role="table" aria-label={table.ariaLabel} data-reveal>
      <div className="site-vision-row site-vision-head" role="row">
        <span role="columnheader">{table.headers[0]}</span>
        <span role="columnheader">{table.headers[1]}</span>
        <span role="columnheader">{table.headers[2]}</span>
      </div>
      {table.rows.map((row, index) => (
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

type InvestCopy = {
  metaTitle: string
  metaDescription: string
  mailHref: string
  label: string
  heading: string
  lead: string
  contactCta: string
  productCta: string
  thesisAriaLabel: string
  thesis: ReadonlyArray<{ index: string; title: string; body: string }>
  marketsAriaLabel: string
  marketsLabel: string
  marketsHeading: string
  marketsLead: string
  todayAriaLabel: string
  todayLabel: string
  todayHeading: string
  today: ReadonlyArray<readonly [string, string, string]>
  businessAriaLabel: string
  businessLabel: string
  businessHeading: string
  businessLead: string
  business: ReadonlyArray<readonly [string, string]>
  planAriaLabel: string
  planLabel: string
  planHeading: string
  roadmap: ReadonlyArray<{ index: string; title: string; body: string }>
  fundsAriaLabel: string
  fundsLabel: string
  fundsHeading: string
  fundsLead: string
  funds: ReadonlyArray<readonly [string, string]>
  contactAriaLabel: string
  talkHeading: string
  talkBody: string
  faqTitle: string
  faq: ReadonlyArray<readonly [string, string]>
  ctaTitle: string
}

const COPY: Record<SiteLocale, InvestCopy> = {
  en: {
    metaTitle: 'Invest',
    metaDescription: 'BIU is an AI-native software company that brings software building, storage, composition, distribution, and derivation onto one page—five markets worth trillions of dollars each.',
    mailHref: INVEST_MAIL,
    label: 'Invest',
    heading: 'Invest in the next trillion-dollar AI company',
    lead: 'BIU is an AI-native software company building the medium for human–agent collaboration. One page brings together software building, storage, composition, distribution, and derivation—five markets worth trillions of dollars each. Agents are rewriting all five, and we are looking for investors who share this conviction.',
    contactCta: 'Contact us',
    productCta: 'Explore the product',
    thesisAriaLabel: 'Investment thesis',
    thesis: [
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
    ],
    marketsAriaLabel: 'Five markets',
    marketsLabel: 'Markets',
    marketsHeading: 'Five verbs, five trillion-dollar markets',
    marketsLead: 'Each verb links to the full case, with sources listed in the references at the end.',
    todayAriaLabel: 'Available today',
    todayLabel: 'Product',
    todayHeading: 'Ready to use today',
    today: [
      ['Open-source desktop app', 'Released under Apache 2.0, the desktop app is free to download, auditable, and self-hostable.', '/download'],
      ['Plugins are software', 'Every block on a page comes from a plugin: tables, whiteboards, coding exercises, video editors. Once written, each works alongside every other block.', '/product'],
      ['Share the whole page', 'One link delivers the complete service. Recipients can open and use it immediately, with no installation or app-store listing.', '/use-cases'],
      ['Condition-based permissions', 'Both data and member views are conditions. Visibility is computed at access time, and inherited permissions remain traceable.', '/security'],
    ],
    businessAriaLabel: 'Business model',
    businessLabel: 'Business model',
    businessHeading: 'Open source drives adoption. Cloud and enterprise drive revenue.',
    businessLead: 'Like most successful open-source companies, the core product is free. Revenue comes from hosted services, team collaboration, and enterprise support.',
    business: [
      ['Open source · Acquisition', 'The desktop app, self-hosted version, and source code remain free. Open source builds trust and word of mouth, and drives user growth.'],
      ['BIU Cloud · Subscriptions', 'Multi-device access, members and permissions, and online collaboration, sold per seat to individuals and teams. Pricing will be announced at launch.'],
      ['Enterprise & ecosystem · Expansion', 'Support and services for private enterprise deployments, plus plugin distribution with developer revenue sharing.'],
    ],
    planAriaLabel: 'Plan after funding',
    planLabel: 'Plan',
    planHeading: 'Three steps after this round',
    roadmap: [
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
    ],
    fundsAriaLabel: 'Use of funds',
    fundsLabel: 'This round',
    fundsHeading: 'Where the funds go',
    fundsLead: 'The round size, valuation, and financial projections are in our business plan. Email us to request it.',
    funds: [
      ['R&D', 'Agent capabilities and cloud infrastructure.'],
      ['Ecosystem', 'Plugin developers, templates, and community.'],
      ['Growth', 'Open-source community, content, and early customers.'],
      ['Team', 'Engineering, product, and design talent.'],
    ],
    contactAriaLabel: 'Contact',
    talkHeading: 'Let’s talk',
    talkBody: 'We welcome conversations about our product roadmap and fundraising plans. Please include your organization and areas of interest.',
    faqTitle: 'About investing',
    faq: [
      ['How can I contact you?', `Email ${CONTACT_EMAIL} and include your organization, areas of interest, and contact details.`],
      ['How can I get the business plan?', `Email ${CONTACT_EMAIL} and we will reply with our business plan and round details.`],
      ['Can I see the product first?', 'BIU is open source. You can download and try the desktop app directly, and all code is public on GitHub.'],
      ['Where does the data come from?', 'The market data comes from Gartner, IDC, McKinsey, Harvard Business School, and other institutions. Full references appear at the end of the five verb articles.'],
    ],
    ctaTitle: 'Try BIU for yourself',
  },
  zh: {
    metaTitle: '投资',
    metaDescription: 'BIU 是一家 AI 原生的软件公司，用一个页面完成软件的构建、存储、组合、分发与衍生，这五个环节各自对应一个万亿美元量级的市场。',
    mailHref: ZH_INVEST_MAIL,
    label: '投资',
    heading: '投资下一家万亿美元 AI 公司',
    lead: 'BIU 是一家 AI 原生的软件公司，做的是人与智能体协作的媒介：用一个页面完成软件的构建、存储、组合、分发与衍生。这五个环节各自对应一个万亿美元量级的市场，智能体正在重写它们。我们正在寻找认同这一判断的投资人。',
    contactCta: '联系我们',
    productCta: '了解产品',
    thesisAriaLabel: '判断',
    thesis: [
      {
        index: '01',
        title: '软件的生产方式正在改变',
        body: 'Gartner 预测，2026 年全球软件支出达到 1.468 万亿美元；到 2028 年，33% 的企业软件应用将内置智能体能力，2024 年这一比例不到 1%。软件的构建者，正在从 4840 万开发者扩展到 11.4 亿知识工作者。',
      },
      {
        index: '02',
        title: '智能体需要一种新的媒介',
        body: '企业平均使用 897 款应用，只有 29% 彼此集成；95% 的 IT 负责人认为集成是落地 AI 的障碍。麦肯锡估算生成式 AI 每年可创造 2.6–4.4 万亿美元的价值，兑现它的前提，是智能体拿到完整的上下文。',
      },
      {
        index: '03',
        title: '页面就是这种媒介',
        body: '在 BIU 里，一个页面装下软件、数据和人。构建、存储、组合、分发、衍生，五个环节在同一页里完成，智能体与用户在同一个工作区中协作。',
      },
    ],
    marketsAriaLabel: '五个市场',
    marketsLabel: '市场',
    marketsHeading: '五个动词，五个万亿美元市场',
    marketsLead: '每个动词链到一篇完整的论证，数据出处列在文章末尾的参考资料里。',
    todayAriaLabel: '已经做到的',
    todayLabel: '产品',
    todayHeading: '今天已经可以用',
    today: [
      ['开源桌面应用', '以 Apache 2.0 开源，桌面版免费下载，代码可审计，也可自部署。', '/download'],
      ['插件即软件', '页面里的每一块都由插件提供：表格、画板、代码练习、视频剪辑，写好就能和其他块一起工作。', '/product'],
      ['整页分享', '一个链接交付整套服务，接收方打开即可使用，无需安装与上架。', '/use-cases'],
      ['条件匹配的权限', '数据视图与成员视图两边都是条件，访问时计算可见范围，继承关系可追溯。', '/security'],
    ],
    businessAriaLabel: '商业模式',
    businessLabel: '商业模式',
    businessHeading: '开源获取用户，云端与企业带来收入',
    businessLead: '与多数成功的开源公司一样，核心产品免费开放，收入来自托管服务、团队协作与企业支持。',
    business: [
      ['开源免费 · 获取用户', '桌面版、自部署版本与源代码保持免费。开源带来信任与口碑，是用户增长的入口。'],
      ['BIU Cloud · 订阅收入', '多设备访问、成员与权限、在线协作。面向个人与团队按席位订阅，定价在上线时公布。'],
      ['企业与生态 · 扩展收入', '企业私有部署的支持与服务；插件生态的分发与开发者分成。'],
    ],
    planAriaLabel: '融资后的计划',
    planLabel: '计划',
    planHeading: '融资之后的三步',
    roadmap: [
      {
        index: '01',
        title: '上线 BIU Cloud，开启订阅收入',
        body: '把多设备访问、成员与权限、在线协作带到云端。本机空间与云端空间并存，数据随时可以导出。',
      },
      {
        index: '02',
        title: '建设插件生态，让软件持续衍生',
        body: '开放插件的开发、分发与引用，让智能体把 VS Code 插件、GitHub 仓库与已有页面接入为新的能力，并建立开发者分成机制。',
      },
      {
        index: '03',
        title: '进入团队与企业',
        body: '面向团队提供成员管理与可追溯的权限，面向企业提供私有部署与支持服务，把一页一页的服务扩展为一家公司的工作系统。',
      },
    ],
    fundsAriaLabel: '资金用途',
    fundsLabel: '本轮融资',
    fundsHeading: '资金用在哪里',
    fundsLead: '融资金额、估值与财务预测写在商业计划书里，欢迎来信索取。',
    funds: [
      ['研发', '智能体能力与云端基础设施。'],
      ['生态', '插件开发者、模板与社区。'],
      ['增长', '开源社区、内容与早期客户。'],
      ['团队', '工程、产品与设计人才。'],
    ],
    contactAriaLabel: '联系',
    talkHeading: '和我们聊聊',
    talkBody: '欢迎来信交流产品路线与融资计划。来信请注明机构与关注方向。',
    faqTitle: '关于投资',
    faq: [
      ['怎样联系你们', `请发送邮件至 ${CONTACT_EMAIL}，注明机构、关注方向与联系方式。`],
      ['怎样获取商业计划书', `请发送邮件至 ${CONTACT_EMAIL}，我们会回复商业计划书与融资细节。`],
      ['可以先看产品吗', 'BIU 开源，桌面版可直接下载试用；代码全部在 GitHub 上公开。'],
      ['数据的出处在哪里', '页面中的市场数据出自 Gartner、IDC、麦肯锡、哈佛商学院等机构，五篇动词文章末尾列有完整的参考资料。'],
    ],
    ctaTitle: '下载产品，亲身体验',
  },
}

export function MarketingInvest({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  const { locale } = useSiteLocale()
  const copy = COPY[locale]
  usePageMeta({
    title: copy.metaTitle,
    description: copy.metaDescription,
    path: '/invest',
  })

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
      <section className="site-page-hero" data-reveal>
        <p className="site-section-label">{copy.label}</p>
        <h1>{copy.heading}</h1>
        <p className="site-page-lead">{copy.lead}</p>
        <div className="site-cta-actions site-invest-actions">
          <a className="site-cta-primary" href={copy.mailHref}>
            {copy.contactCta}
          </a>
          <Link className="site-cta-secondary" to="/product">
            {copy.productCta}
          </Link>
        </div>
      </section>

      <section className="site-security-blocks site-invest-thesis" aria-label={copy.thesisAriaLabel}>
        {copy.thesis.map((item) => (
          <article key={item.index} data-reveal>
            <span className="site-solution-index">{item.index}</span>
            <h2>{item.title}</h2>
            <p>{item.body}</p>
          </article>
        ))}
      </section>

      <section className="site-home-entry site-vision" aria-label={copy.marketsAriaLabel}>
        <div className="site-home-entry-heading" data-reveal>
          <p className="site-section-label">{copy.marketsLabel}</p>
          <h2>{copy.marketsHeading}</h2>
          <p>{copy.marketsLead}</p>
        </div>
        <VisionTable />
      </section>

      <section className="site-home-entry site-invest-today" aria-label={copy.todayAriaLabel}>
        <div className="site-home-entry-heading" data-reveal>
          <p className="site-section-label">{copy.todayLabel}</p>
          <h2>{copy.todayHeading}</h2>
        </div>
        <div className="site-invest-today-grid" data-reveal>
          {copy.today.map(([title, body, to]) => (
            <Link key={title} to={to}>
              <h3>{title}</h3>
              <p>{body}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="site-home-entry" aria-label={copy.businessAriaLabel}>
        <div className="site-home-entry-heading" data-reveal>
          <p className="site-section-label">{copy.businessLabel}</p>
          <h2>{copy.businessHeading}</h2>
          <p>{copy.businessLead}</p>
        </div>
        <div className="site-invest-today-grid is-three" data-reveal>
          {copy.business.map(([title, body]) => (
            <div key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="site-home-entry" aria-label={copy.planAriaLabel}>
        <div className="site-home-entry-heading" data-reveal>
          <p className="site-section-label">{copy.planLabel}</p>
          <h2>{copy.planHeading}</h2>
        </div>
        <div className="site-security-blocks site-invest-roadmap">
          {copy.roadmap.map((item) => (
            <article key={item.index} data-reveal>
              <span className="site-solution-index">{item.index}</span>
              <h2>{item.title}</h2>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="site-home-entry" aria-label={copy.fundsAriaLabel}>
        <div className="site-home-entry-heading" data-reveal>
          <p className="site-section-label">{copy.fundsLabel}</p>
          <h2>{copy.fundsHeading}</h2>
          <p>{copy.fundsLead}</p>
        </div>
        <div className="site-invest-today-grid" data-reveal>
          {copy.funds.map(([title, body]) => (
            <div key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="site-home-entry" aria-label={copy.contactAriaLabel}>
        <div className="site-vision-invest" data-reveal>
          <div>
            <h2>{copy.talkHeading}</h2>
            <p>{copy.talkBody}</p>
            <p className="site-vision-note">{CONTACT_EMAIL}</p>
          </div>
          <a className="site-cta-primary" href={copy.mailHref}>
            {copy.contactCta}
          </a>
        </div>
      </section>

      <SiteFaq title={copy.faqTitle} items={copy.faq} />

      <SiteFinalCta title={copy.ctaTitle} />
    </SiteChrome>
  )
}
