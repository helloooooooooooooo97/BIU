import { SiteChrome, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'

const SECTIONS = [
  {
    index: '01',
    title: '本机空间',
    body: '数据保存在你自己的电脑上：页面和表格在本地数据库，附件在同一台电脑的资源目录里。使用本机空间不会把数据上传到我们的服务器。',
  },
  {
    index: '02',
    title: '云端空间',
    body: '需要多设备访问和成员协作时使用，可以部署在你自己的服务器上（官方云端服务即将上线）。空间内的操作受账号鉴权保护，敏感操作进入待确认状态，不会静默执行。',
  },
  {
    index: '03',
    title: '模型调用',
    body: '智能体工作时，会把这一轮需要的内容发给你配置的模型服务（DeepSeek、OpenAI、Anthropic 等），用的是你自己的密钥。在本机空间里，请求从你的电脑直接发往模型服务。',
  },
  {
    index: '04',
    title: '开源可审计',
    body: '全部代码以 Apache 2.0 开源。数据存在哪、发给了谁，可以直接读源码核对；动作写进只追加的事件记录，事后也查得到。发现安全问题，请发邮件到 348876414@qq.com。',
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
    step: '数据视图',
    detail: '谁的范围',
    body: '被授权的不是一张表或某一行，而是你在界面上存的任意视图。视图就是一串筛选条件（条件也持久化为数据），记录落不落在里面当场算。',
  },
  {
    step: '成员视图',
    detail: '谁在里面',
    body: '授权对象也不必须是某个人，可以是一个动态成员视图 —— 比如「空间成员」「外部成员」「临时访客」。条件满足就自动进入授权范围。',
  },
  {
    step: '匹配即授权',
    detail: '角色 + 可见性',
    body: '两个视图一匹配，就得到这个人的角色和这条记录的可见范围。同一个人被多处授权时取较高的那一级，不冲突。',
  },
] as const

const FLEX_POINTS = [
  ['授权对象是条件，不是名单', '新人加入空间就落进「空间成员」视图，自动获得该视图上挂着的全部授权，不必逐条加人；成员转为外部后落进「外部成员」视图，权限自动收缩。'],
  ['授权范围和筛选是同一件事', '视图本来就是筛选条件，所以「权限分组」不需要另建一套概念。你在界面上存下的那个视图，可以直接当授权范围用。'],
  ['可见性是算出来的，不是存下来的', '一条内容是私人、空间还是共享，取决于它落在哪些被授权的视图里，而不是它自己带的一个标签。'],
  ['继承，且能把来路说清', '内容之间可以继承权限，不必每条自己定义。查看时能逐级展开你的权限是怎么来的 —— 创建者、视图授权，还是继承自上一级。'],
] as const

const COMPETITORS = [
  ['Notion', '页面级授权，群组是一份名单'],
  ['飞书', '协作者是人、群或部门，按文档逐个添加'],
  ['BIU', '授权对象和数据范围都是条件，两边都对得上才生效'],
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
            BIU 开源，数据存在哪、流向哪里都能核对。本机空间的边界由产品结构决定，不是一个设置项。
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
            这不是单独做出来的一套权限功能。因为视图本身是数据、成员本身也是数据，
            「用条件当授权对象」才有可能 —— 权限模型是 File System 的一个投影。
          </p>
        </section>

        <SiteFinalCta title="把边界握在自己手里" />
    </SiteChrome>
  )
}
