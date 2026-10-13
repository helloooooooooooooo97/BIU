import { Link, useParams } from 'react-router-dom'
import { SiteChrome, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'

export type UseCase = {
  slug: string
  index: string
  title: string
  /** 首页卡片上的一句话 */
  summary: string
  /** 交付物（首页卡片显示，也是子页的产出清单） */
  output: string
  /** 子页：真实痛点 */
  pain: string[]
  /** 子页：BIU 怎么做 */
  how: { title: string; body: string }[]
  /** 子页：常见问题 */
  faq: [string, string][]
}

export const USE_CASES: UseCase[] = [
  {
    slug: 'research',
    index: '01',
    title: '研究与分析',
    summary: '收集资料、建立关系、生成对比表，并把结论留在可继续追问的研究空间。',
    output: '研究报告 · 数据库 · 对比矩阵',
    pain: [
      '资料散在几十个标签页和文档里，换个问题就要重新找一遍。',
      '让 AI 帮忙查一遍，结论落在聊天记录里，过两天要用还得再问。',
      '对比表做在临时文档里，数据一更新就全散了。',
    ],
    how: [
      { title: '资料进得来', body: '把网页、文档、笔记都收进同一个空间，页面和表共享同一条寻址体系。' },
      { title: '结论留得住', body: '智能体的产出沉降成页面、数据库、对比矩阵，不是一个会被刷掉的回答。' },
      { title: '对比可维护', body: '对比表就是一张真表，加一列维度不需要改代码，也不用重做。' },
    ],
    faq: [
      ['能存多少资料？', '资料存在你的空间里（本机或云端，创建时选择），容量取决于空间的存储配置。'],
      ['智能体会自己找资料吗？', '可以。它能读取空间里的页面与数据，也能通过 MCP 调用外部服务。'],
    ],
  },
  {
    slug: 'product',
    index: '02',
    title: '产品与项目',
    summary: '从用户反馈和项目资料中整理需求、任务、决策与版本计划。',
    output: 'PRD · 项目计划 · 任务数据库',
    pain: [
      '反馈在表格里，需求在文档里，任务在另一个看板里 —— 三处各有一份，对不齐。',
      '决策当时讨论了，过一个月谁也说不清为什么这么定。',
      '版本计划靠人肉同步，改一次要通知一圈。',
    ],
    how: [
      { title: '需求是记录，不是文档片段', body: '每条反馈、需求、任务都是可寻址的记录，能互相引用。' },
      { title: '决策留痕', body: '动作写入只追加的事件流 —— 状态和「它是怎么变成这样的」都查得到。' },
      { title: '智能体是协作者', body: '任务卡带 assignee 与 dependsOn，多智能体靠看板协作，不靠群聊。' },
    ],
    faq: [
      ['能做多人协作吗？', '云端空间支持成员与权限（所有者 / 管理者 / 编辑者 / 查看者）。'],
      ['和现有项目管理工具什么关系？', '可以并行使用。BIU 的价值是把需求、任务、决策与上下文放在同一处，不需要三份同步。'],
    ],
  },
  {
    slug: 'content',
    index: '03',
    title: '内容与创作',
    summary: '让素材、草稿、反馈和不同发布版本共享同一份创作上下文。',
    output: '文章 · 脚本 · 发布计划',
    pain: [
      '素材在一个盘里，草稿在另一个工具里，反馈在聊天记录里。',
      '同一篇内容的多个版本散落各处，改到哪一版说不清。',
      '发布计划靠脑子记。',
    ],
    how: [
      { title: '素材与草稿同源', body: '素材作为附件进空间，草稿就是页面，二者共享同一套寻址。' },
      { title: '组件可复用', body: '页面里的块来自插件，可聚合、可复用 —— 写一次多处引用。' },
      { title: '分享的是可运行单元', body: '分享一个页面时，正文、附件和它引用的插件源码一起走，对方得到的是能跑的东西。' },
    ],
    faq: [
      ['支持哪些内容格式？', '页面是 Markdown；图片、音视频、文件作为附件；复杂内容用插件块渲染。'],
      ['能发布到外部平台吗？', '可以通过 MCP 连接外部服务，把内容推送到目标平台。'],
    ],
  },
  {
    slug: 'team-knowledge',
    index: '04',
    title: '团队知识',
    summary: '把文档、流程和讨论变成团队可以查询、维护并继续使用的知识。',
    output: '团队 Wiki · 流程库 · 决策记录',
    pain: [
      'Wiki 建了没人维护，半年后就过期了。',
      '新人问的问题，答案在某个人的聊天记录里。',
      '流程文档和实际执行对不上。',
    ],
    how: [
      { title: '知识和执行在同一处', body: '文档、任务、会话共享一个空间上下文 —— 不是两套系统各自演进。' },
      { title: '智能体读得到', body: '智能体与人在同一地址空间，读的是同一份知识，回答有据可查。' },
      { title: '维护成本低', body: '加一个维度、加一条记录都是写数据，不需要改代码或做迁移。' },
    ],
    faq: [
      ['和现有 Wiki 的区别？', 'BIU 里知识不是静态文本：它能被智能体读取、能被任务引用、能随维度演进。'],
      ['权限怎么控制？', '云端空间按成员角色划分；本机空间数据不出设备。'],
    ],
  },
  {
    slug: 'personal',
    index: '05',
    title: '私人工作',
    summary: '把个人资料与工作流留在本机，保持离线可用和清晰的数据边界。',
    output: '本机页面 · 私人资料 · 离线空间',
    pain: [
      '个人笔记和工作资料混在一个云端账号里，边界模糊。',
      '断网就什么都做不了。',
      '不放心把私人资料交给第三方托管。',
    ],
    how: [
      { title: '本机空间', body: '数据保存在当前设备，离线可用 —— 不是「先上传再同步下来」。' },
      { title: '两栖透明', body: '可以用接口读写，也可以直接读盘。抽象是便利，不是牢笼。' },
      { title: '智能体也在本机', body: '本机空间里智能体照样工作，不需要为了用 AI 把数据交出去。' },
    ],
    faq: [
      ['本机空间要联网吗？', '不需要联网即可使用；调用模型时需要网络，但数据仍留在本机。'],
      ['以后能改成云端吗？', '两种空间各自成立，按工作内容选择；迁移能力见文档。'],
    ],
  },
  {
    slug: 'collaboration',
    index: '06',
    title: '团队协作',
    summary: '让成员围绕同一个云端空间共享页面、数据、会话和智能体。',
    output: '成员权限 · 协作空间 · 共享上下文',
    pain: [
      '每个人用自己的 AI 助手，产出进不了团队的知识库。',
      '讨论在一个工具，产出在另一个工具，上下文来回搬。',
      '新人接手要花很久搞清来龙去脉。',
    ],
    how: [
      { title: '共享上下文', body: '页面、数据、会话与智能体都在同一个云端空间，成员围绕同一份数据工作。' },
      { title: '成员与权限', body: '所有者 / 管理者 / 编辑者 / 查看者四档角色，敏感操作进入待确认状态。' },
      { title: '可追溯', body: '只追加的事件流记录每个动作，界面是它的投影 —— 状态和来历都清楚。' },
    ],
    faq: [
      ['和普通协作文档的区别？', 'BIU 的成员不只是编辑文本：共享的是页面、数据、会话和智能体的完整上下文。'],
      ['能审计吗？', '动作写入只追加的事件流，可追溯。企业版提供审计与 SSO。'],
    ],
  },
]

export const USE_CASE_CATEGORIES = USE_CASES

/** 用例总览页 */
export function MarketingUseCases({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: '场景',
    description: '研究与分析、产品与项目、内容与创作、团队知识、私人工作、团队协作 —— 六个真实场景下 BIU 怎么用。',
    path: '/use-cases',
  })

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
      <section className="site-page-hero" data-reveal>
        <p className="site-section-label">场景</p>
        <h1>为真实工作而生。</h1>
        <p className="site-page-lead">
          从一个问题开始，交付可以继续使用的页面、数据和空间。选一个场景看具体怎么做。
        </p>
      </section>

      <section className="site-usecase-grid" aria-label="场景">
        {USE_CASES.map((useCase) => (
          <Link key={useCase.slug} to={`/use-cases/${useCase.slug}`} className="site-usecase-card">
            <span className="site-solution-index">{useCase.index}</span>
            <h2>{useCase.title}</h2>
            <p>{useCase.summary}</p>
            <small>{useCase.output}</small>
            <span className="site-usecase-more">查看做法 →</span>
          </Link>
        ))}
      </section>

      <section className="site-final-cta" data-reveal>
        <div className="site-container">
          <p className="site-section-label">开始使用 BIU</p>
          <h2>从你的场景开始。</h2>
          <button type="button" onClick={onStart}>创建你的空间 <span>↗</span></button>
        </div>
      </section>
    </SiteChrome>
  )
}

/** 用例子页 */
export function MarketingUseCaseDetail({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  const { slug } = useParams<{ slug: string }>()
  const useCase = USE_CASES.find((item) => item.slug === slug)

  usePageMeta({
    title: useCase ? useCase.title : '场景',
    description: useCase ? useCase.summary : 'BIU 的真实工作场景。',
    path: `/use-cases/${slug ?? ''}`,
  })

  if (!useCase) {
    return (
      <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero">
          <p className="site-section-label">场景</p>
          <h1>没有这个场景。</h1>
          <p className="site-page-lead"><Link to="/use-cases">返回场景总览</Link></p>
        </section>
      </SiteChrome>
    )
  }

  const others = USE_CASES.filter((item) => item.slug !== useCase.slug)

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
      <section className="site-page-hero" data-reveal>
        <p className="site-section-label">场景 · {useCase.index}</p>
        <h1>{useCase.title}</h1>
        <p className="site-page-lead">{useCase.summary}</p>
        <p className="site-usecase-output">交付物：{useCase.output}</p>
      </section>

      <section className="site-usecase-pain" data-reveal>
        <h2>现在的麻烦</h2>
        <ul>
          {useCase.pain.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>

      <section className="site-usecase-how">
        <h2 data-reveal>BIU 怎么做</h2>
        <div className="site-usecase-how-grid">
          {useCase.how.map((item) => (
            <article key={item.title} data-reveal>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="site-faq">
        <div className="site-faq-heading" data-reveal>
          <p className="site-section-label">常见问题</p>
          <h2>你可能想知道。</h2>
        </div>
        <div className="site-faq-list" data-reveal>
          {useCase.faq.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="site-usecase-more" data-reveal>
        <h2>其他场景</h2>
        <div className="site-usecase-more-links">
          {others.map((item) => (
            <Link key={item.slug} to={`/use-cases/${item.slug}`}>{item.title} →</Link>
          ))}
        </div>
      </section>

      <section className="site-final-cta" data-reveal>
        <div className="site-container">
          <p className="site-section-label">开始使用 BIU</p>
          <h2>试试你自己的场景。</h2>
          <button type="button" onClick={onStart}>创建你的空间 <span>↗</span></button>
        </div>
      </section>
    </SiteChrome>
  )
}
