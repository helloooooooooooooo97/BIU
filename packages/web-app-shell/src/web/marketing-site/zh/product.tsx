import { SiteChrome, SiteFaq, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'
import { asset } from './site-base.ts'

type Block = {
  id: string
  index: string
  title: string
  lead: string
  points: string[]
  image: string
  alt: string
}

const BLOCKS: Block[] = [
  {
    id: 'pages',
    index: '01',
    title: '页面',
    lead: '统一逻辑、数据、环境与交付的唯一边界。',
    points: [
      '自由正文与结构化插件块同存一页，支持组合内置软件、外部系统切片与智能体定制模块，告别彼此隔绝的 iframe 窗口。',
      '页面属性即为页内所有插件的共享运行环境——同一份插件代码放进不同客户页，自动隔离状态并呈现对应币种、规则与视图。',
      '所有块通过响应式属性总线共享同一份底层数据，一处修改几十毫秒内全页收敛。',
    ],
    image: '/site/shot-page.webp',
    alt: '一个页面里放着刊头、Excalidraw 画板和算法题卡片，各是一个插件',
  },
  {
    id: 'plugins',
    index: '02',
    title: '插件与应用切片',
    lead: '双模式后端：既可运行本地受控沙箱，也可切片对接外部独立服务。',
    points: [
      '块类型不由平台写死。宿主受控运行时支持代码沙箱、真实终端与本地文件索引，断网同样可用。',
      '插件的后端不必迁入 BIU——可直接对接 Apifox、GitHub、企业内网 API 或独立微服务，前端只切出当前任务所需的 5% 交互面，并将每次运行结果持久化为文档快照。',
      '散落在几十个页面中的同类插件块自动汇聚为跨页结构化表，支持按字段筛选与跨项目汇总。',
    ],
    image: '/site/shot-plugins.webp',
    alt: '插件表：每个插件一行，安装、启用、停止都在这里',
  },
  {
    id: 'share',
    index: '03',
    title: '分发与条件权限',
    lead: '分享一个链接，即完成一次完整的软件发布。',
    points: [
      '以单页为根节点解析依赖闭包，将正文、附件与所用插件源码一并打包，接收方在浏览器打开链接即可真实运行交互。',
      '不再维护容易漏配的静态 ACL 名单，而是通过「数据视图 × 成员视图」动态计算权限，人员与内容变动时自动生效。',
      '同一套条件权限同时约束人类用户与代表其行动的智能体，访问与变更全程可追溯。',
    ],
    image: '/site/shot-share.webp',
    alt: '分享出去的页面：对方打开链接，画板和算法题卡片照样能用',
  },
  {
    id: 'agent',
    index: '04',
    title: '智能体与上下文工程',
    lead: '更少的工具、更硬的结构：人与智能体读写同一份真相。',
    points: [
      '全工作区统一 5 个核心原语（db_list / db_read / db_update / db_create / db_action）配合表级自描述 Blurb，无论接入多少行业插件，智能体工具面始终保持恒定 O(1)。',
      '通过 @ 显式挂载当前轮次所需的页面、表与技能规范，直接基于结构化记录与插件快照执行，不再截屏猜坐标或硬塞整段聊天历史。',
      '缺少特定能力时，智能体可直接面向页面真实数据构建新插件，或在已有插件与开源仓库之上做增量衍生。',
    ],
    image: '/site/shot-agent.webp',
    alt: '输入框里输入 @，页面和任务直接成为智能体的上下文',
  },
  {
    id: 'tasks',
    index: '05',
    title: '任务看板与审批流',
    lead: '多智能体依托任务图谱分工协作，关键动作由人工审批门兜底。',
    points: [
      '每张任务卡明确负责人、上下游依赖与执行上下文，上游完成后自动流转至下游，过程与产出并排查阅。',
      '涉及对外发送、合同锁定或生产变更的敏感操作自动暂停在审批门，经人工确认后方可执行。',
      '所有关键状态迁移按时间顺序落入只追加事件日志（events.log），随时可回放与审计。',
    ],
    image: '/site/shot-tasks.webp',
    alt: '任务表：每条任务有状态、优先级和难度，可以派给某个智能体',
  },
  {
    id: 'spaces',
    index: '06',
    title: '本机与云端',
    lead: '数据存放于本机目录还是云端服务器，创建空间时由你决定。',
    points: [
      '本机空间：页面、结构化表与附件直接落盘为标准 SQLite（.biu/biu.sqlite）与原始文件，断网可用，模型请求直连你自行配置的端点。',
      '云端空间：面向多设备同步、团队协作与条件权限管理，支持私有自部署（官方云端即将上线）。',
      '全栈以 Apache 2.0 开源，数据结构透明可查，随时完整导出，不存在平台锁定。',
    ],
    image: '/site/shot-spaces.webp',
    alt: '空间切换菜单：在不同空间之间切换，或创建新空间',
  },
]

const PAGE_FLOW = [
  { step: '01', title: '数据先行', body: '以真实业务记录与页面属性起一页' },
  { step: '02', title: '重组切片', body: '同页组合内置插件与外部系统切片' },
  { step: '03', title: '智能体共建', body: '精确读写状态，缺什么现场构建' },
  { step: '04', title: '一链交付', body: '打包分享运行，同类块自动跨页成表' },
] as const

/** 三种扩展层：能力块、工作流规范、外部数据源。 */
const ECOSYSTEM = [
  {
    name: '插件 · Plugin',
    title: '扩展页面交互与后端能力',
    body: '编写内置沙箱插件或外部 SaaS 应用切片，一处定义即可在任意页面复用，并随页面自动打包分发。',
    file: '页面块声明',
    code: ':::editorBlock {kind=api-slice plugin=apifox-runner}\n{ "endpoint": "POST /v2/orders/checkout", "env": "prod-canary" }\n:::',
  },
  {
    name: '技能 · Skill',
    title: '沉淀判断标准与工作流',
    body: '将评审清单、合规红线与操作步骤写成磁盘可读的 Markdown 规范，智能体在每轮任务中稳定遵循。',
    file: 'SKILL.md',
    code: '---\nname: release-check\ndescription: 上线前按标准核对接口快照与错误率\n---\n先核对主链路断言快照，再检查近 10 分钟错误率，异常立即暂停放行。',
  },
  {
    name: 'MCP',
    title: '直连外部系统上下文',
    body: '接入标准 MCP 服务器，让智能体按需读取外部代码库、工单与数据库，无需人工搬运资料。',
    file: 'MCP 配置',
    code: '{\n  "name": "github",\n  "command": "npx",\n  "args": ["-y", "@modelcontextprotocol/server-github"]\n}',
  },
] as const

const PRODUCT_FAQ = [
  ['页面与文档的区别', '文档只承载文字。页面中的每一块都是插件提供的软件，多个块读写同一份数据，合起来构成一套服务。'],
  ['插件来源', '工作区带有一批常用插件，例如表格、画板、代码运行。也可以自行编写，或由智能体编写。新插件先在沙箱中试用，确认后再打包。'],
  ['分享页面中的插件', '分享时，正文、附件和页面所用插件的源码一并打包。接收方打开即可使用，无需另行安装。'],
  ['可用模型', '任意模型均可，使用用户自己的密钥。'],
  ['本机空间与云端空间', '两种空间可以并存：私人资料放在本机，协作内容放在云端。'],
] as const

export function MarketingProduct({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: '产品',
    description: '页面把插件组合成服务：页面、插件、分享、智能体、任务看板、本机与云端 —— 逐个说明 BIU 怎么做到 All in One。',
    path: '/product',
  })

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero" data-reveal>
          <p className="site-section-label">产品</p>
          <h1>页面是容器，插件是软件</h1>
          <p className="site-page-lead">
            BIU 的 All in One 不是把功能堆在一个应用里，而是让一个页面装下多个软件，并让它们共用同一份数据。
            下面逐个说明它是怎么做到的。
          </p>
        </section>

        <section className="site-block-list">
          {BLOCKS.map((block) => (
            <article key={block.id} id={block.id} className="site-block" data-reveal>
              <div className="site-block-copy">
                <span className="site-block-index">{block.index}</span>
                <h2>{block.title}</h2>
                <p className="site-block-lead">{block.lead}</p>
                <ul>
                  {block.points.map((point) => <li key={point}>{point}</li>)}
                </ul>
              </div>
              <figure className="site-block-media">
                <img src={asset(block.image)} alt={block.alt} loading="lazy" decoding="async" />
              </figure>
            </article>
          ))}
        </section>

        <section className="site-continuity">
          <div className="site-continuity-heading" data-reveal>
            <p className="site-section-label">页面即服务</p>
            <h2>四步，把几个软件<br />组合成一页</h2>
          </div>
          <div className="site-context-flow" data-reveal aria-label="页面即服务">
            {PAGE_FLOW.map((item, index) => (
              <span key={item.step} className="site-context-item">
                <div>
                  <span>{item.step}</span>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                </div>
                {index < PAGE_FLOW.length - 1 ? <i aria-hidden>→</i> : null}
              </span>
            ))}
          </div>
        </section>

        <section className="site-ecosystem" id="ecosystem">
          <div className="site-ecosystem-heading" data-reveal>
            <p className="site-section-label">扩展架构</p>
            <h2>三层开放扩展：插件、技能与 MCP</h2>
          </div>
          <div className="site-ecosystem-grid">
            {ECOSYSTEM.map((item) => (
              <article key={item.name} data-reveal>
                <p>{item.name}</p>
                <h3>{item.title}</h3>
                <span>{item.body}</span>
                <figure className="site-ecosystem-code">
                  <figcaption>{item.file}</figcaption>
                  <pre><code>{item.code}</code></pre>
                </figure>
              </article>
            ))}
          </div>
        </section>

        <SiteFaq title="关于产品" items={PRODUCT_FAQ} />

        <SiteFinalCta title="创建你的第一页" />
    </SiteChrome>
  )
}
