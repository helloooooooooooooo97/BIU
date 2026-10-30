import { Link, useParams } from 'react-router-dom'
import { SiteChrome, SiteFaq, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
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
  /** 这一页里组合了哪些块（插件或内置的表格、任务） */
  blocks: string[]
  /** 如实说明的限制，例如官方云端还没上线 */
  note?: string
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
      { title: '结论留得住', body: '智能体的产出沉淀成页面、数据库、对比矩阵，不是一个会被刷掉的回答。' },
      { title: '对比可维护', body: '对比表就是一张真表，加一列维度不需要改代码，也不用重做。' },
    ],
    blocks: ['浏览器', '表格', '方案对比块', 'Excalidraw 画板'],
    faq: [
      ['资料容量', '资料存放在所选空间（本机或云端）中，容量取决于该空间的存储配置。'],
      ['智能体如何获取资料', '智能体可以读取空间中的页面与数据，也可以通过 MCP 调用外部服务。'],
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
    blocks: ['表格', '任务', '方案对比块', 'API 调试块'],
    faq: [
      ['多人协作', '云端空间提供成员与权限，角色分为查看者、编辑者、管理者、所有者。'],
      ['与现有项目管理工具的关系', '可以并行使用。BIU 把需求、任务、决策与上下文放在同一处，无需在多套系统之间同步。'],
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
      { title: '一页装下整套工具', body: '文稿、素材板、剪辑、排期表都是同一页里的插件块，不用在几个软件之间来回切。' },
      { title: '分享的是可运行单元', body: '分享一个页面时，正文、附件和它引用的插件源码一起走，对方得到的是能跑的东西。' },
    ],
    blocks: ['视频编排', 'HTML', 'Excalidraw 画板', '页面目录'],
    faq: [
      ['支持的内容格式', '页面为 Markdown。图片、音视频和文件作为附件。复杂内容由插件块渲染。'],
      ['向外部平台发布', '可以通过 MCP 连接外部服务，将内容推送到目标平台。'],
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
      { title: '知识和执行在同一处', body: '文档、任务、代理共享一个空间上下文 —— 不是两套系统各自演进。' },
      { title: '智能体读得到', body: '智能体与人在同一地址空间，读的是同一份知识，回答有据可查。' },
      { title: '维护成本低', body: '加一个维度、加一条记录都是写数据，不需要改代码或做迁移。' },
    ],
    blocks: ['页面目录', '代码运行块', '页面终端', '表格'],
    faq: [
      ['与现有 Wiki 的区别', 'BIU 中的知识不是静态文本：可以被智能体读取，被任务引用，并随维度演进。'],
      ['权限如何控制', '云端空间按成员角色和视图授权。本机空间的数据存放在用户自己的电脑上。'],
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
      { title: '本机空间', body: '数据存在你自己的电脑上，离线可用 —— 不是「先上传再同步下来」。' },
      { title: '两栖透明', body: '可以用接口读写，也可以直接读盘。抽象是便利，不是牢笼。' },
      { title: '模型用你自己的', body: '智能体用你配置的模型密钥工作，只有这一轮需要的内容会发给模型服务，空间里的其他数据不动。' },
    ],
    blocks: ['表格', 'Excalidraw 画板', '代码运行块', '算法题卡片'],
    faq: [
      ['本机空间的网络要求', '日常使用无需联网。调用模型时需要网络，仅当前这一轮的相关内容会发送至所配置的模型服务，其余数据仍只在本机。'],
      ['本机与云端并用', '两种空间可以并存。私人资料放在本机，协作内容放在云端。'],
    ],
  },
  {
    slug: 'collaboration',
    index: '06',
    title: '团队协作',
    summary: '让成员围绕同一个云端空间共享页面、数据和代理。',
    output: '成员权限 · 协作空间 · 共享上下文',
    pain: [
      '每个人用自己的 AI 助手，产出进不了团队的知识库。',
      '讨论在一个工具，产出在另一个工具，上下文来回搬。',
      '新人接手要花很久搞清来龙去脉。',
    ],
    how: [
      { title: '共享上下文', body: '页面、数据和代理都在同一个云端空间，成员围绕同一份数据工作。' },
      { title: '成员与权限', body: '查看者 / 编辑者 / 管理者 / 所有者四档角色，还能按视图授权；敏感操作进入待确认状态。' },
      { title: '可追溯', body: '只追加的事件流记录每个动作，界面是它的投影 —— 状态和来历都清楚。' },
    ],
    blocks: ['任务', '表格', '方案对比块', '页面目录'],
    note: '云端空间现在可以部署在你自己的服务器上；官方云端服务即将上线。',
    faq: [
      ['与普通协作文档的区别', '成员共享的不只是文本，还包括页面、数据和代理的完整上下文。'],
      ['审计', '每个动作都写入只追加的事件记录，事后可以逐条追溯。'],
    ],
  },
]

export const USE_CASE_CATEGORIES = USE_CASES

function BlockChips({ blocks }: { blocks: string[] }) {
  return (
    <ul className="site-block-chips" aria-label="组合的块">
      {blocks.map((name) => <li key={name}>{name}</li>)}
    </ul>
  )
}

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
        <h1>为真实工作而生</h1>
        <p className="site-page-lead">
          每个场景的交付物都是一页：页面里组合好这件事需要的软件，交给自己、团队或客户直接用。选一个场景看具体怎么做。
        </p>
      </section>

      <section className="site-usecase-grid" aria-label="场景">
        {USE_CASES.map((useCase) => (
          <Link key={useCase.slug} to={`/use-cases/${useCase.slug}`} className="site-usecase-card">
            <span className="site-solution-index">{useCase.index}</span>
            <h2>{useCase.title}</h2>
            <p>{useCase.summary}</p>
            <div className="site-usecase-card-blocks">
              <BlockChips blocks={useCase.blocks} />
            </div>
          </Link>
        ))}
      </section>

      <SiteFinalCta title="从你的场景开始" />
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
          <h1>没有这个场景</h1>
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
        {useCase.note ? <p className="site-usecase-note">{useCase.note}</p> : null}
      </section>

      <section className="site-usecase-blocks" data-reveal>
        <h2>这一页里组合了哪些块</h2>
        <BlockChips blocks={useCase.blocks} />
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

      <SiteFaq title="关于此场景" items={useCase.faq} />

      <section className="site-usecase-more" data-reveal>
        <h2>其他场景</h2>
        <div className="site-usecase-more-links">
          {others.map((item) => (
            <Link key={item.slug} to={`/use-cases/${item.slug}`}>{item.title} →</Link>
          ))}
        </div>
      </section>

      <SiteFinalCta title="试试你自己的场景" />
    </SiteChrome>
  )
}
