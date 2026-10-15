import { Link } from 'react-router-dom'
import { CONTACT_EMAIL, SiteChrome, SiteFaq, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'

export const INVEST_MAIL = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('BIU 投资洽谈')}`

/** 每一行的数字出自对应文章的参考资料。 */
const VISION_ROWS = [
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
] as const

export function VisionTable() {
  return (
    <div className="site-vision-table" role="table" aria-label="五个动词" data-reveal>
      <div className="site-vision-row site-vision-head" role="row">
        <span role="columnheader">动词</span>
        <span role="columnheader">Agent 的上下文</span>
        <span role="columnheader">经济规模</span>
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
] as const

const TODAY = [
  ['开源桌面应用', '以 Apache 2.0 开源，桌面版免费下载，代码可审计，也可自部署。', '/download'],
  ['插件即软件', '页面里的每一块都由插件提供：表格、画板、代码练习、视频剪辑，写好就能和其他块一起工作。', '/product'],
  ['整页分享', '一个链接交付整套服务，接收方打开即可使用，无需安装与上架。', '/use-cases'],
  ['条件匹配的权限', '数据视图与成员视图两边都是条件，访问时计算可见范围，继承关系可追溯。', '/security'],
] as const

const BUSINESS = [
  ['开源免费 · 获取用户', '桌面版、自部署版本与源代码保持免费。开源带来信任与口碑，是用户增长的入口。'],
  ['BIU Cloud · 订阅收入', '多设备访问、成员与权限、在线协作。面向个人与团队按席位订阅，定价在上线时公布。'],
  ['企业与生态 · 扩展收入', '企业私有部署的支持与服务；插件生态的分发与开发者分成。'],
] as const

const ROADMAP = [
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
] as const

const FUNDS = [
  ['研发', '智能体能力与云端基础设施。'],
  ['生态', '插件开发者、模板与社区。'],
  ['增长', '开源社区、内容与早期客户。'],
  ['团队', '工程、产品与设计人才。'],
] as const

const INVEST_FAQ = [
  ['怎样联系你们', `请发送邮件至 ${CONTACT_EMAIL}，注明机构、关注方向与联系方式。`],
  ['怎样获取商业计划书', `请发送邮件至 ${CONTACT_EMAIL}，我们会回复商业计划书与融资细节。`],
  ['可以先看产品吗', 'BIU 开源，桌面版可直接下载试用；代码全部在 GitHub 上公开。'],
  ['数据的出处在哪里', '页面中的市场数据出自 Gartner、IDC、麦肯锡、哈佛商学院等机构，五篇动词文章末尾列有完整的参考资料。'],
] as const

export function MarketingInvest({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: '投资',
    description: 'BIU 是一家 AI 原生的软件公司，用一个页面完成软件的构建、存储、组合、分发与衍生，这五个环节各自对应一个万亿美元量级的市场。',
    path: '/invest',
  })

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
      <section className="site-page-hero" data-reveal>
        <p className="site-section-label">投资</p>
        <h1>投资下一家万亿美元 AI 公司</h1>
        <p className="site-page-lead">
          BIU 是一家 AI 原生的软件公司，做的是人与智能体协作的媒介：用一个页面完成软件的构建、存储、组合、分发与衍生。这五个环节各自对应一个万亿美元量级的市场，智能体正在重写它们。我们正在寻找认同这一判断的投资人。
        </p>
        <div className="site-cta-actions site-invest-actions">
          <a className="site-cta-primary" href={INVEST_MAIL}>
            联系我们
          </a>
          <Link className="site-cta-secondary" to="/product">
            了解产品
          </Link>
        </div>
      </section>

      <section className="site-security-blocks site-invest-thesis" aria-label="判断">
        {THESIS.map((item) => (
          <article key={item.index} data-reveal>
            <span className="site-solution-index">{item.index}</span>
            <h2>{item.title}</h2>
            <p>{item.body}</p>
          </article>
        ))}
      </section>

      <section className="site-home-entry site-vision" aria-label="五个市场">
        <div className="site-home-entry-heading" data-reveal>
          <p className="site-section-label">市场</p>
          <h2>五个动词，五个万亿美元市场</h2>
          <p>每个动词链到一篇完整的论证，数据出处列在文章末尾的参考资料里。</p>
        </div>
        <VisionTable />
      </section>

      <section className="site-home-entry site-invest-today" aria-label="已经做到的">
        <div className="site-home-entry-heading" data-reveal>
          <p className="site-section-label">产品</p>
          <h2>今天已经可以用</h2>
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

      <section className="site-home-entry" aria-label="商业模式">
        <div className="site-home-entry-heading" data-reveal>
          <p className="site-section-label">商业模式</p>
          <h2>开源获取用户，云端与企业带来收入</h2>
          <p>与多数成功的开源公司一样，核心产品免费开放，收入来自托管服务、团队协作与企业支持。</p>
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

      <section className="site-home-entry" aria-label="融资后的计划">
        <div className="site-home-entry-heading" data-reveal>
          <p className="site-section-label">计划</p>
          <h2>融资之后的三步</h2>
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

      <section className="site-home-entry" aria-label="资金用途">
        <div className="site-home-entry-heading" data-reveal>
          <p className="site-section-label">本轮融资</p>
          <h2>资金用在哪里</h2>
          <p>融资金额、估值与财务预测写在商业计划书里，欢迎来信索取。</p>
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

      <section className="site-home-entry" aria-label="联系">
        <div className="site-vision-invest" data-reveal>
          <div>
            <h2>和我们聊聊</h2>
            <p>欢迎来信交流产品路线与融资计划。来信请注明机构与关注方向。</p>
            <p className="site-vision-note">{CONTACT_EMAIL}</p>
          </div>
          <a className="site-cta-primary" href={INVEST_MAIL}>
            联系我们
          </a>
        </div>
      </section>

      <SiteFaq title="关于投资" items={INVEST_FAQ} />

      <SiteFinalCta title="先亲手试一页" />
    </SiteChrome>
  )
}
