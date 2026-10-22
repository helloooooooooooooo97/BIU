import { SiteChrome, SiteFaq, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'

const SECTIONS = [
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
    body: 'All code is open source under Apache 2.0. You can inspect the source to verify where data is stored and where it is sent. Actions are recorded in an append-only event log for later review. To report a security issue, email 348876414@qq.com.',
  },
] as const

/**
 * 权限模型：数据视图 × 成员视图。
 *
 * 这里刻意不写「所有者 / 管理者 / 编辑者 / 查看者」那一套 —— 那是空间里的成员角色，
 * 只是模型的一层输入。真正决定「谁能看到什么」的是两个视图的匹配。
 * 依据：authorization.ts 的 viewGrantRole / recordMatchesGrantedView / effectiveDataScope。
 */
const MATCH_STEPS = [
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
] as const

const FLEX_POINTS = [
  ['Conditions, not access lists', 'New members enter the workspace members view and automatically receive every permission attached to it. If they become external members, they move to that view and their access narrows automatically.'],
  ['Access scopes are filters', 'Because views are already defined by filters, permission groups need no separate abstraction. Any view saved in the interface can become an access scope.'],
  ['Visibility is computed, not stored', 'Whether content is private, workspace-wide, or shared depends on which authorized views include it—not on a fixed label attached to the content.'],
  ['Inheritance with a clear audit trail', 'Content can inherit permissions instead of defining each one separately. You can trace access back through every level—to the creator, a view grant, or inheritance from a parent.'],
] as const

const COMPETITORS = [
  ['Notion', 'Page-level access, with groups maintained as lists'],
  ['Lark', 'Collaborators are people, groups, or departments added to each document'],
  ['BIU', 'Both recipients and data scopes are conditions; access applies only when they match'],
] as const

const SECURITY_FAQ = [
  ['Can BIU access my data?', 'Data in local spaces is never uploaded to BIU servers. If you deploy a cloud space on your own server, you retain control of that data as well.'],
  ['What content is sent to model providers?', 'Only content required for the agent’s current run is sent to your configured model provider using your own API key. Other workspace data is not sent.'],
  ['What can agents modify?', 'Sensitive operations require your confirmation before they run. Every action is written to an append-only event log that you can review later.'],
  ['How do new members receive access?', 'Access can target a member view such as workspace members. New members automatically receive the permissions attached to that view, with no individual grants required.'],
  ['How do I report a security issue?', 'Email 348876414@qq.com.'],
] as const

export function MarketingSecurity({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: 'Security',
    description: 'Keep local-space data on your computer, use your own model keys, and audit the open-source code. BIU permissions match data scopes with member scopes.',
    path: '/security',
  })

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero" data-reveal>
          <p className="site-section-label">Security</p>
          <h1>You decide where your data lives</h1>
          <p className="site-page-lead">
            BIU is open source, so you can verify where data is stored and where it goes. Local-space boundaries are
            built into the product architecture, not controlled by a preference.
          </p>
        </section>

        <section className="site-security-blocks">
          {SECTIONS.map((section) => (
            <article key={section.index} data-reveal>
              <span className="site-solution-index">{section.index}</span>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </section>

        <section className="site-permission" data-reveal>
          <p className="site-section-label">Permission model</p>
          <h2>Access is the result of a match</h2>
          <p className="site-permission-lead">
            Most systems maintain access lists that map people to content one by one. BIU works differently:
            <strong> both sides are conditions, and access applies only when they match.</strong>
          </p>

          <div className="site-permission-formula" aria-label="Permission model">
            {MATCH_STEPS.map((item, index) => (
              <div key={item.step} className="site-permission-term">
                <span className="site-permission-step">{item.step}</span>
                <strong>{item.detail}</strong>
                <p>{item.body}</p>
                {index < MATCH_STEPS.length - 1 ? <i aria-hidden>{index === 0 ? '×' : '='}</i> : null}
              </div>
            ))}
          </div>

          <div className="site-permission-points">
            {FLEX_POINTS.map(([title, body]) => (
              <article key={title} data-reveal>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="site-role-table" data-reveal>
          <h2>Why this model is more flexible</h2>
          <table>
            <thead>
              <tr><th>Product</th><th>How access is defined</th></tr>
            </thead>
            <tbody>
              {COMPETITORS.map(([name, detail]) => (
                <tr key={name} className={name === 'BIU' ? 'is-biu' : ''}>
                  <th>{name}</th>
                  <td>{detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="site-permission-note">
            This is not a separate permission layer. Views are data, and members are data, which makes conditions
            viable access targets. The permission model is a projection of the File System.
          </p>
        </section>

        <SiteFaq title="About your data" items={SECURITY_FAQ} />

        <SiteFinalCta title="Stay in control of your boundaries" />
    </SiteChrome>
  )
}
