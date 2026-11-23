import { Link } from 'react-router-dom'
import { SiteChrome, SiteFaq, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'

const SECTIONS = [
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
    title: '开源可核对',
    body: '全部代码以 Apache 2.0 开源。数据存在哪、发给谁，都可以直接看源码核对；每一步操作都有完整留痕，事后随时可查。发现安全问题，请发邮件至 348876414@qq.com。',
  },
] as const

const MATCH_STEPS = [
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
] as const

const FLEX_POINTS = [
  ['按规则管人，不用反复改名单', '新人入职加入空间，自动拿到团队资料权限，不用一页页补授权；成员转为外部合作方后，内部权限自动收回。'],
  ['平时怎么筛选，就怎么授权', '不用学一套复杂的权限系统。你平时整理资料保存下来的筛选视图，直接就能用来给团队或客户授权。'],
  ['新内容自动落进对应权限', '只要规则设好了，以后新建的页面或记录只要符合条件，对应的人就能立刻看到，不用每次手动分享。'],
  ['权限来路清清楚楚', '随时能点开查看“为什么这个人能看这一页”——是创建者、规则授权，还是继承自上级页面，一目了然。'],
] as const

const COMPETITORS = [
  ['Notion', '按页面逐个加人，群组是一份静态名单'],
  ['飞书', '按文档逐个添加人、群或部门'],
  ['BIU', '按规则自动匹配：定好“哪类人看哪类内容”，人员和内容变动时自动生效'],
] as const

const SECURITY_FAQ = [
  ['官方能看到我的数据吗？', '看不到。本机空间的数据不会上传到 BIU 服务器；云端空间部署在你自己的服务器上时，数据也完全由你自己掌握。'],
  ['用 AI 时会把整个工作区发出去吗？', '不会。只有这一轮你选中的相关内容会发给你自己配置的模型服务商，空间里的其他资料不会发出去。'],
  ['智能体会擅自修改资料吗？', '敏感操作将先进入待确认状态，经您确认后才会执行；每一步操作均有完整记录，事后可逐条追溯。'],
  ['新同事加入怎么给权限？', '如果提前把权限授给了「团队成员」这样的规则分组，新同事加入空间就会自动获得对应权限，不用逐页手动加。'],
  ['发现安全问题怎么联系？', '请发送邮件至 348876414@qq.com。'],
] as const

export function MarketingSecurity({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: '安全',
    description: '本机空间数据存在自己电脑上，模型用你自己的密钥，代码开源可审计。权限不是一张名单，是数据范围与成员范围的一次匹配。',
    path: '/security',
  })

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero" data-reveal>
          <p className="site-section-label">安全</p>
          <h1>你的数据在哪里，由你决定</h1>
          <p className="site-page-lead">
            BIU 开源，数据的存放位置与流向都可以核对。本机空间的边界由产品结构决定，不是一项设置。
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
          <p className="site-section-label">权限模型</p>
          <h2>谁能看到什么，是一次匹配的结果</h2>
          <p className="site-permission-lead">
            常见做法是维护一张名单：把人和内容一个个对应起来。BIU 不这么做 ——
            <strong>两边都是条件，匹配上了才生效。</strong>
          </p>

          <div className="site-permission-formula" aria-label="权限模型">
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
          <h2>为什么这样更灵活</h2>
          <table>
            <thead>
              <tr><th>产品</th><th>授权是怎么表达的</th></tr>
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
            想了解这套按规则计算的权限底层设计？可阅读「理念」专栏深度文章：
            <Link to="/blog/distribute-software">分发：一个页面，就是一次发布 →</Link>
          </p>
        </section>

        <SiteFaq title="关于数据" items={SECURITY_FAQ} />

        <SiteFinalCta title="让数据与边界尽在掌控" />
    </SiteChrome>
  )
}
