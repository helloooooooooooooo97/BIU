import { SiteChrome, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'

type Block = {
  id: string
  index: string
  title: string
  lead: string
  points: string[]
}

const BLOCKS: Block[] = [
  {
    id: 'file-system',
    index: '01',
    title: 'File System',
    lead: '一切皆可寻址。',
    points: [
      '页面、表格、任务、技能、插件，都是同一个空间里带路径的对象。',
      '人用界面操作，智能体用同一套接口读写 —— 没有第二份副本要同步。',
      '底层是真数据：可以用接口读，也可以直接读盘。',
    ],
  },
  {
    id: 'agent',
    index: '02',
    title: 'Agent 工作台',
    lead: '人和智能体操作同一份数据。',
    points: [
      '上下文不是猜出来的：智能体读得到你在页面上留下的改动。',
      '产出会沉淀成页面、表、技能，下一轮直接接着用。',
      '智能体本身也是数据，可以被创建、复制、分享。',
    ],
  },
  {
    id: 'tasks',
    index: '03',
    title: '任务看板',
    lead: '多智能体靠看板协作，不靠群聊。',
    points: [
      '任务卡带 assignee、dependsOn，依赖关系就是一张图。',
      '上游完成后可以自动触发下游，状态机统一：idle → pending → delivered → done。',
      '执行轨迹和任务卡在同一个面板里对照查看。',
    ],
  },
  {
    id: 'pages',
    index: '04',
    title: '页面与数据库',
    lead: '富文本和结构化数据在同一个空间。',
    points: [
      '页面正文、附件、表记录共享同一条寻址体系。',
      '页面里可以嵌组件块，块来自插件，可以聚合、复用。',
      '维度（facet）不需要改代码：加一个维度就是写一条记录，零迁移。',
    ],
  },
  {
    id: 'plugins',
    index: '05',
    title: '插件系统',
    lead: '一切即插件。',
    points: [
      '新能力就是新插件：沙箱里写代码，打包，挂载。',
      '插件和数据是对等的一等公民 —— 所以内容能带着依赖一起走。',
      '人和智能体都能创建插件，扩展不再专属开发者。',
    ],
  },
  {
    id: 'spaces',
    index: '06',
    title: '本机与云端',
    lead: '两种空间，创建时由你决定。',
    points: [
      '本机空间：数据保存在当前设备，离线可用，边界清晰。',
      '云端空间：多设备访问、成员权限、在线协作。',
      '不是「先本地再同步」，是两种各自成立的空间形态。',
    ],
  },
]

const CONTEXT_FLOW = [
  { step: '01', title: '页面', body: '背景、资料与想法' },
  { step: '02', title: '数据', body: '任务、关系与状态' },
  { step: '03', title: '会话', body: '讨论、执行与结果' },
  { step: '04', title: '空间', body: '持续积累的上下文' },
] as const

const ECOSYSTEM = [
  { symbol: '＋', name: 'Plugins', title: '为 BIU 增加新的产品能力。', body: '页面模块、工作台工具和领域功能都可以成为插件。' },
  { symbol: '／', name: 'Skills', title: '把专业方法变成可重复的工作流。', body: '让智能体发现并使用团队已有的知识与规范。' },
  { symbol: '⌁', name: 'MCP', title: '连接外部服务、工具与数据。', body: '在清晰的权限边界内调用空间之外的能力。' },
] as const

export function MarketingProduct({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: '产品',
    description: 'File System、Agent 工作台、任务看板、页面与数据库、插件系统、本机与云端 —— 逐个说明 BIU 是什么。',
    path: '/product',
  })

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero" data-reveal>
          <p className="site-section-label">产品</p>
          <h1>一套内核，支撑全部工作</h1>
          <p className="site-page-lead">
            BIU 不是把功能堆在一起，而是让页面、数据、会话、任务和智能体共享同一条寻址体系。
            下面逐个说明它是什么。
          </p>
        </section>

        <section className="site-block-list">
          {BLOCKS.map((block) => (
            <article key={block.id} id={block.id} className="site-block" data-reveal>
              <span className="site-block-index">{block.index}</span>
              <div>
                <h2>{block.title}</h2>
                <p className="site-block-lead">{block.lead}</p>
                <ul>
                  {block.points.map((point) => <li key={point}>{point}</li>)}
                </ul>
              </div>
            </article>
          ))}
        </section>

        <section className="site-continuity">
          <div className="site-continuity-heading" data-reveal>
            <p className="site-section-label">持续上下文</p>
            <h2>不必每次重新解释<br />你正在做什么</h2>
          </div>
          <div className="site-context-flow" data-reveal aria-label="空间上下文">
            {CONTEXT_FLOW.map((item, index) => (
              <span key={item.step} className="site-context-item">
                <div>
                  <span>{item.step}</span>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                </div>
                {index < CONTEXT_FLOW.length - 1 ? <i aria-hidden>→</i> : null}
              </span>
            ))}
          </div>
        </section>

        <section className="site-ecosystem" id="ecosystem">
          <div className="site-ecosystem-heading" data-reveal>
            <p className="site-section-label">扩展 BIU</p>
            <h2>把你的工具与知识<br />带进空间</h2>
          </div>
          <div className="site-ecosystem-grid">
            {ECOSYSTEM.map((item) => (
              <article key={item.name} data-reveal>
                <div className="site-ecosystem-symbol">{item.symbol}</div>
                <p>{item.name}</p>
                <h3>{item.title}</h3>
                <span>{item.body}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="site-final-cta" data-reveal>
          <div className="site-container">
            <p className="site-section-label">开始使用 BIU</p>
            <h2>把工作放进一个空间</h2>
            <button type="button" onClick={onStart}>创建你的空间 <span>↗</span></button>
          </div>
        </section>
    </SiteChrome>
  )
}
