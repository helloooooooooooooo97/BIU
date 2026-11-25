import { Link } from 'react-router-dom'
import { SiteChrome, SiteFaq, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'
import { useSiteLocale, type SiteLocale } from './locale.tsx'

type SecurityCopy = {
  metaTitle: string
  metaDescription: string
  label: string
  heading: string
  lead: string
  sections: ReadonlyArray<{ index: string; title: string; body: string }>
  permissionLabel: string
  permissionHeading: string
  permissionLeadBefore: string
  permissionLeadStrong: string
  permissionAriaLabel: string
  matchSteps: ReadonlyArray<{ step: string; detail: string; body: string }>
  flexPoints: ReadonlyArray<readonly [string, string]>
  compareHeading: string
  compareColProduct: string
  compareColDetail: string
  competitors: ReadonlyArray<readonly [string, string]>
  noteBefore: string
  noteLink: string
  faqTitle: string
  faq: ReadonlyArray<readonly [string, string]>
  ctaTitle: string
}

/**
 * 权限模型：数据视图 × 成员视图。
 *
 * 这里刻意不写「所有者 / 管理者 / 编辑者 / 查看者」那一套 —— 那是空间里的成员角色，
 * 只是模型的一层输入。真正决定「谁能看到什么」的是两个视图的匹配。
 * 依据：authorization.ts 的 viewGrantRole / recordMatchesGrantedView / effectiveDataScope。
 */
const COPY: Record<SiteLocale, SecurityCopy> = {
  en: {
    metaTitle: 'Security',
    metaDescription: 'Keep local-space data on your computer, use your own model keys, and audit the open-source code. BIU permissions match data scopes with member scopes.',
    label: 'Security',
    heading: 'You decide where your data lives',
    lead: 'BIU is open source, so you can verify where data is stored and where it goes. Local-space boundaries are built into the product architecture, not controlled by a preference.',
    sections: [
      {
        index: '01',
        title: 'Local spaces',
        body: 'Your data stays on your computer: pages and tables live in a local database, and attachments remain in a local asset directory. Local spaces do not upload data to our servers.',
      },
      {
        index: '02',
        title: 'Cloud spaces',
        body: 'Use a cloud space for multi-device access and team collaboration. You can deploy it on your own server, with BIU Cloud coming soon. Account authentication protects workspace actions, and sensitive operations require confirmation instead of running silently.',
      },
      {
        index: '03',
        title: 'Model calls',
        body: 'When an agent runs, it sends only the content needed for that run to your configured model provider, such as DeepSeek, OpenAI, or Anthropic, using your own API key. In a local space, requests go directly from your computer to the provider.',
      },
      {
        index: '04',
        title: 'Open and auditable',
        body: 'All code is open source under Apache 2.0. You can inspect the source to verify where data is stored and where it is sent. Every key state transition appends chronologically to events.log for deterministic review. To report a security issue, email 348876414@qq.com.',
      },
      {
        index: '05',
        title: 'Plugin isolation & sandboxes',
        body: 'Built-in and AI-authored plugins mount inside isolated Render Boundaries and a controlled host bridge—so a faulty block degrades on its own without crashing the page. Host actions stay bounded by workspace sandboxes, while external application slices keep credentials and heavy backends on your own services.',
      },
      {
        index: '06',
        title: 'Agents share the same permission engine',
        body: 'Agents never bypass authorization. Any agent acting on behalf of a user is constrained by the exact same Data View × Member View evaluator, and sensitive actions (external delivery, locking contracts, production writes) pause at an explicit human approval gate.',
      },
    ],
    permissionLabel: 'Permission model',
    permissionHeading: 'Access is the result of a match',
    permissionLeadBefore: 'Most systems maintain access lists that map people to content one by one. BIU works differently: ',
    permissionLeadStrong: 'both sides are conditions, and access applies only when they match.',
    permissionAriaLabel: 'Permission model',
    matchSteps: [
      {
        step: 'Data view',
        detail: 'Which records',
        body: 'Permissions apply to any view saved in the interface, not to a whole table or a specific row. A view is a set of filters—also persisted as data—and record membership is evaluated dynamically.',
      },
      {
        step: 'Member view',
        detail: 'Which people',
        body: 'Access does not have to be granted to a specific person. It can target a dynamic member view such as workspace members, external members, or temporary guests. Anyone who meets the conditions is included automatically.',
      },
      {
        step: 'Match grants access',
        detail: 'Role + visibility',
        body: 'When the two views match, they determine the person’s role and the record’s visibility. If someone receives access from multiple sources, the highest level applies without conflict.',
      },
    ],
    flexPoints: [
      ['Conditions, not access lists', 'New members enter the workspace members view and automatically receive every permission attached to it. If they become external members, they move to that view and their access narrows automatically.'],
      ['Access scopes are filters', 'Because views are already defined by filters, permission groups need no separate abstraction. Any view saved in the interface can become an access scope.'],
      ['Visibility is computed, not stored', 'Whether content is private, workspace-wide, or shared depends on which authorized views include it—not on a fixed label attached to the content.'],
      ['Inheritance with a clear audit trail', 'Content can inherit permissions instead of defining each one separately. You can trace access back through every level—to the creator, a view grant, or inheritance from a parent.'],
    ],
    compareHeading: 'Why this model is more flexible',
    compareColProduct: 'Product',
    compareColDetail: 'How access is defined',
    competitors: [
      ['Notion', 'Page-level access, with groups maintained as lists'],
      ['Lark', 'Collaborators are people, groups, or departments added to each document'],
      ['BIU', 'Both recipients and data scopes are conditions; access applies only when they match'],
    ],
    noteBefore: 'Curious how rule-based permissions work under the hood? Read our philosophy essay: ',
    noteLink: 'Distribute: One page is a release →',
    faqTitle: 'About your data',
    faq: [
      ['Can BIU access my data?', 'Data in local spaces is never uploaded to BIU servers. If you deploy a cloud space on your own server, you retain control of that data as well.'],
      ['What content is sent to model providers?', 'Only content required for the agent’s current run is sent to your configured model provider using your own API key. Other workspace data is not sent.'],
      ['What can agents modify?', 'Sensitive operations require your confirmation before they run. Every action is written to an append-only event log that you can review later.'],
      ['How do new members receive access?', 'Access can target a member view such as workspace members. New members automatically receive the permissions attached to that view, with no individual grants required.'],
      ['How do I report a security issue?', 'Email 348876414@qq.com.'],
    ],
    ctaTitle: 'Stay in control of your boundaries',
  },
  zh: {
    metaTitle: '安全',
    metaDescription: '本机空间数据存在自己电脑上，模型用你自己的密钥，代码开源可审计。权限不是一张名单，是数据范围与成员范围的一次匹配。',
    label: '安全',
    heading: '你的数据在哪里，由你决定',
    lead: 'BIU 开源，数据的存放位置与流向都可以核对。本机空间的边界由产品结构决定，不是一项设置。',
    sections: [
      {
        index: '01',
        title: '本机空间',
        body: '数据直接存在你自己的电脑上：页面、表格和附件都在本地目录里，断网也能用，不会上传到我们的服务器。',
      },
      {
        index: '02',
        title: '云端空间',
        body: '面向多设备同步与团队协作，支持部署在自有服务器上（官方云端即将上线）。涉及数据变更的敏感操作将进入待确认状态，不会静默执行。',
      },
      {
        index: '03',
        title: 'AI 模型调用',
        body: '用 AI 时，只把这一轮你选中的内容发给你自己配置的模型服务（DeepSeek、OpenAI、Anthropic 等），用你自己的密钥。在本机空间里，请求从你电脑直连模型服务商。',
      },
      {
        index: '04',
        title: '开源与事件溯源',
        body: '全部代码以 Apache 2.0 开源。数据存在哪、发给谁，都可以直接看源码核对；所有关键状态变更按时间顺序写入只追加事件日志（events.log），事后逐条可查。发现安全问题，请发邮件至 348876414@qq.com。',
      },
      {
        index: '05',
        title: '插件沙箱与容错边界',
        body: '内置插件与 AI 现场构建的插件均运行在独立的 Render Boundary 与受控宿主桥接层内：前端异常仅降级当前块，绝不拖垮整页；宿主侧后端动作受目录边界与工作区沙箱约束。外部应用切片直接对接你的独立后端，密钥与重逻辑无需迁入 BIU。',
      },
      {
        index: '06',
        title: '智能体受同一套权限约束',
        body: '智能体不是绕过权限的超级管理员。代表某位成员执行读写时，系统使用完全相同的「数据视图 × 成员视图」引擎动态裁剪可见范围，并强制敏感操作（对外发送、合同锁定、生产变更）经过人工审批门确认。',
      },
    ],
    permissionLabel: '权限模型',
    permissionHeading: '谁能看到什么，是一次匹配的结果',
    permissionLeadBefore: '常见做法是维护一张名单：把人和内容一个个对应起来。BIU 不这么做 —— ',
    permissionLeadStrong: '两边都是条件，匹配上了才生效。',
    permissionAriaLabel: '权限模型',
    matchSteps: [
      {
        step: '定好内容范围',
        detail: '哪些资料',
        body: '不用一页一页勾选授权。你在界面上保存的任意筛选视图（比如「对外方案」「Q3 需求」），都可以直接作为授权范围，新内容符合条件就自动纳入。',
      },
      {
        step: '定好人员范围',
        detail: '哪些人',
        body: '也不用逐个加人名。直接选「团队成员」「外部合作方」或「临时访客」这样的动态分组，人员变动时权限自动跟着变。',
      },
      {
        step: '规则自动生效',
        detail: '谁能看、谁能改',
        body: '内容范围和人员范围一对应，就自动算出每个人的查看或编辑权限。同一个人命中多条规则时取最高权限，不会冲突。',
      },
    ],
    flexPoints: [
      ['按规则管人，不用反复改名单', '新人入职加入空间，自动拿到团队资料权限，不用一页页补授权；成员转为外部合作方后，内部权限自动收回。'],
      ['平时怎么筛选，就怎么授权', '不用学一套复杂的权限系统。你平时整理资料保存下来的筛选视图，直接就能用来给团队或客户授权。'],
      ['新内容自动落进对应权限', '只要规则设好了，以后新建的页面或记录只要符合条件，对应的人就能立刻看到，不用每次手动分享。'],
      ['权限来路清清楚楚', '随时能点开查看“为什么这个人能看这一页”——是创建者、规则授权，还是继承自上级页面，一目了然。'],
    ],
    compareHeading: '为什么这样更灵活',
    compareColProduct: '产品',
    compareColDetail: '授权是怎么表达的',
    competitors: [
      ['Notion', '按页面逐个加人，群组是一份静态名单'],
      ['飞书', '按文档逐个添加人、群或部门'],
      ['BIU', '按规则自动匹配：定好“哪类人看哪类内容”，人员和内容变动时自动生效'],
    ],
    noteBefore: '想了解这套按规则计算的权限底层设计？可阅读「理念」专栏深度文章：',
    noteLink: '分发：一个页面，就是一次发布 →',
    faqTitle: '关于数据',
    faq: [
      ['官方能看到我的数据吗？', '看不到。本机空间的数据不会上传到 BIU 服务器；云端空间部署在你自己的服务器上时，数据也完全由你自己掌握。'],
      ['用 AI 时会把整个工作区发出去吗？', '不会。只有这一轮你选中的相关内容会发给你自己配置的模型服务商，空间里的其他资料不会发出去。'],
      ['智能体会擅自修改资料吗？', '敏感操作将先进入待确认状态，经您确认后才会执行；每一步操作均有完整记录，事后可逐条追溯。'],
      ['新同事加入怎么给权限？', '如果提前把权限授给了「团队成员」这样的规则分组，新同事加入空间就会自动获得对应权限，不用逐页手动加。'],
      ['发现安全问题怎么联系？', '请发送邮件至 348876414@qq.com。'],
    ],
    ctaTitle: '让数据与边界尽在掌控',
  },
}

export function MarketingSecurity({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  const { locale } = useSiteLocale()
  const copy = COPY[locale]
  usePageMeta({
    title: copy.metaTitle,
    description: copy.metaDescription,
    path: '/security',
  })

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero" data-reveal>
          <p className="site-section-label">{copy.label}</p>
          <h1>{copy.heading}</h1>
          <p className="site-page-lead">{copy.lead}</p>
        </section>

        <section className="site-security-blocks">
          {copy.sections.map((section) => (
            <article key={section.index} data-reveal>
              <span className="site-solution-index">{section.index}</span>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </section>

        <section className="site-permission" data-reveal>
          <p className="site-section-label">{copy.permissionLabel}</p>
          <h2>{copy.permissionHeading}</h2>
          <p className="site-permission-lead">
            {copy.permissionLeadBefore}
            <strong>{copy.permissionLeadStrong}</strong>
          </p>

          <div className="site-permission-formula" aria-label={copy.permissionAriaLabel}>
            {copy.matchSteps.map((item, index) => (
              <div key={item.step} className="site-permission-term">
                <span className="site-permission-step">{item.step}</span>
                <strong>{item.detail}</strong>
                <p>{item.body}</p>
                {index < copy.matchSteps.length - 1 ? <i aria-hidden>{index === 0 ? '×' : '='}</i> : null}
              </div>
            ))}
          </div>

          <div className="site-permission-points">
            {copy.flexPoints.map(([title, body]) => (
              <article key={title} data-reveal>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="site-role-table" data-reveal>
          <h2>{copy.compareHeading}</h2>
          <table>
            <thead>
              <tr><th>{copy.compareColProduct}</th><th>{copy.compareColDetail}</th></tr>
            </thead>
            <tbody>
              {copy.competitors.map(([name, detail]) => (
                <tr key={name} className={name === 'BIU' ? 'is-biu' : ''}>
                  <th>{name}</th>
                  <td>{detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="site-permission-note">
            {copy.noteBefore}
            <Link to="/blog/distribute-software">{copy.noteLink}</Link>
          </p>
        </section>

        <SiteFaq title={copy.faqTitle} items={copy.faq} />

        <SiteFinalCta title={copy.ctaTitle} />
    </SiteChrome>
  )
}
