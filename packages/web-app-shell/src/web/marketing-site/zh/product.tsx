import { SiteChrome, SiteFaq, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'
import { asset } from './site-base.ts'
import { HighlightedCode } from '../blog-format.tsx'

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
    lead: '一个边界，装下文档、数据与可运行的软件。',
    points: [
      '自由正文与交互式插件块同存一页，告别互不相通的 iframe 嵌框。',
      '同一份插件放进不同客户页，自动隔离状态并读取各自的币种、规则与属性。',
      '页内所有工具共享同一份实时数据，改一处，整页同步更新。',
    ],
    image: '/site/shot-page.webp',
    alt: '一个页面里放着刊头、Excalidraw 画板和算法题卡片，各是一个插件',
  },
  {
    id: 'plugins',
    index: '02',
    title: '插件与应用切片',
    lead: '既能在本地沙箱运行，也能切片对接外部系统。',
    points: [
      '能力不由平台写死：按需安装插件，或直接让智能体基于当前页面数据现场构建。',
      '外部 SaaS 与企业后端不必迁入 BIU——只切出当前任务所需的交互层，并将每次运行结果留存为文档快照。',
      '分散在几十个页面里的同类插件块自动汇总成表，支持跨页筛选与统计。',
    ],
    image: '/site/shot-plugins.webp',
    alt: '插件表：每个插件一行，安装、启用、停止都在这里',
  },
  {
    id: 'share',
    index: '03',
    title: '分发与条件权限',
    lead: '分享一个链接，就是发布一套可运行的软件。',
    points: [
      '正文、附件与所用插件源码随链接一并打包，接收方点开浏览器即可直接使用，免安装、免配环境。',
      '用「数据视图 × 成员视图」动态计算权限，告别容易漏配的手工名单。',
      '同一套权限边界同时约束人类成员与智能体，访问记录全程可追溯。',
    ],
    image: '/site/shot-share.webp',
    alt: '分享出去的页面：对方打开链接，画板和算法题卡片照样能用',
  },
  {
    id: 'agent',
    index: '04',
    title: '智能体协作',
    lead: '人与智能体读写同一份结构化数据，告别截屏与复制粘贴。',
    points: [
      '在输入框用 @ 精确挂载页面、表格或技能规范，智能体只读取你选中的上下文。',
      '智能体直接读写页面记录并触发插件动作，产出沉淀为可复用的页面、表格与技能。',
      '缺的工具当场基于真实字段构建，或在已有插件与开源项目之上增量衍生。',
    ],
    image: '/site/shot-agent.webp',
    alt: '输入框里输入 @，页面和任务直接成为智能体的上下文',
  },
  {
    id: 'tasks',
    index: '05',
    title: '任务看板与审批流',
    lead: '多智能体按任务图谱协作，关键动作由人工审批确认。',
    points: [
      '每张任务卡明确负责人与上下游依赖，上游完成后自动流转至下游，过程与结果并排查阅。',
      '涉及对外发送、锁定合同或生产变更的敏感操作自动暂停，经人工批准后方可执行。',
      '关键写入按时间顺序落入只追加事件日志，事后随时可回放与核查。',
    ],
    image: '/site/shot-tasks.webp',
    alt: '任务表：每条任务有状态、优先级和难度，可以派给某个智能体',
  },
  {
    id: 'spaces',
    index: '06',
    title: '本机与云端',
    lead: '数据存在本地电脑还是自有服务器，建空间时由你决定。',
    points: [
      '本机空间直接落盘为标准 SQLite 与原始文件，断网可用，模型请求直连你自己的端点。',
      '云端空间支持多设备同步、团队协作与条件权限，支持私有自部署（官方云端即将上线）。',
      '全栈 Apache 2.0 开源，数据结构透明可查，随时完整带走。',
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
  ['页面与文档的区别', '文档只承载静态文字；BIU 页面里的每一块都是共享数据的全栈软件，多个块同页联动，合起来构成可直接交付的完整服务。'],
  ['插件从哪里来？能否对接现有系统？', '既可使用工作区内置与社区插件，也可由智能体基于真实页面数据现场构建；同时支持作为外部 SaaS 或企业内网 API 的应用切片，重后端留在原地，前端只切出所需交互并落盘快照。'],
  ['分享出去的页面，接收方需要安装环境吗？', '不需要。分享时正文、附件与所用插件源码一并打包为一个链接，接收方在浏览器打开即可直接交互运行。'],
  ['支持哪些大模型？请求会经过 BIU 服务器吗？', '支持任意兼容接口的模型服务（DeepSeek、OpenAI、Anthropic 或本地部署模型），使用你自己的 API 密钥；在本机空间里，请求从你的电脑直连模型端点，不经第三方中转。'],
  ['本机空间与云端空间可以同时用吗？', '可以并存。敏感的个人与尽调资料保留在本机离线空间，需要多人协作与对外交付的内容放在云端空间。'],
] as const

export function MarketingProduct({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: '产品',
    description: '页面是容器，插件是软件：了解 BIU 如何以页面统一共享状态、应用切片、智能体协作、条件权限与本地优先架构。',
    path: '/product',
  })

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero" data-reveal>
          <p className="site-section-label">产品</p>
          <h1>页面是容器，插件是软件</h1>
          <p className="site-page-lead">
            BIU 不靠往单一应用里堆砌功能实现 All in One，而是让一个页面承载多款共享实时数据的全栈软件与外部系统切片，供人与智能体共同操作。
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
            <h2>从数据到交付，四步闭环</h2>
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
                  <HighlightedCode code={item.code} />
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
