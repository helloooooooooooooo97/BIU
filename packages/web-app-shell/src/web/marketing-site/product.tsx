import { SiteChrome, SiteFaq, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'
import { asset } from './site-base.ts'
import { HighlightedCode } from './blog-format.tsx'
import { useSiteLocale, type SiteLocale } from './locale.tsx'

type Block = {
  id: string
  index: string
  title: string
  lead: string
  points: string[]
  image: string
  alt: string
}

type ProductCopy = {
  metaTitle: string
  metaDescription: string
  label: string
  heading: string
  lead: string
  blocks: readonly Block[]
  flowLabel: string
  flowHeadingLines: readonly string[]
  flowSteps: ReadonlyArray<{ step: string; title: string; body: string }>
  ecoLabel: string
  ecoHeading: string
  ecosystem: ReadonlyArray<{ name: string; title: string; body: string; file: string; code: string }>
  faqTitle: string
  faq: ReadonlyArray<readonly [string, string]>
  ctaTitle: string
}

const COPY: Record<SiteLocale, ProductCopy> = {
  en: {
    metaTitle: 'Product',
    metaDescription: 'Pages are containers, plugins are software: see how BIU unifies shared state, application slicing, agents, condition permissions, and local-first storage.',
    label: 'Product',
    heading: 'Pages are containers. Plugins are software.',
    lead: 'BIU does not achieve All in One by packing features into one vendor app—it lets a single page host full-stack software and external system slices sharing live state for both humans and agents.',
    blocks: [
      {
        id: 'pages',
        index: '01',
        title: 'Pages',
        lead: 'One boundary holding docs, structured data, and live software.',
        points: [
          'Freeform prose and interactive plugin blocks coexist on one page—no isolated iframes.',
          'The same plugin placed on different client pages isolates its state and adapts to each page’s currency, SLA, and rules.',
          'Every tool on the page shares one live data layer—edit once and the whole page updates together.',
        ],
        image: '/site/shot-page.webp',
        alt: 'A page with a masthead, an Excalidraw whiteboard, and an algorithm exercise card, each powered by a plugin',
      },
      {
        id: 'plugins',
        index: '02',
        title: 'Plugins & Application Slices',
        lead: 'Run in a local sandbox, or slice external systems onto the page.',
        points: [
          'Block types are never hardcoded: install plugins or ask an agent to build one directly against live page data.',
          'External SaaS and enterprise backends stay where they live—slice only the task-specific UI onto your page and persist each run as a snapshot.',
          'Matching blocks across dozens of pages automatically aggregate into queryable cross-page tables.',
        ],
        image: '/site/shot-plugins.webp',
        alt: 'Plugin table with one plugin per row and controls to install, enable, or stop each one',
      },
      {
        id: 'share',
        index: '03',
        title: 'Distribution & Condition Permissions',
        lead: 'Sharing one link is shipping live software.',
        points: [
          'Prose, attachments, and referenced plugin source travel together—recipients open the link in any browser and run it immediately.',
          'Replace static ACL lists with dynamic Data View × Member View permissions that stay accurate as teams and records change.',
          'The exact same permission boundary governs both humans and agents, with full audit traceability.',
        ],
        image: '/site/shot-share.webp',
        alt: 'A shared page where the whiteboard and algorithm exercise card work directly from the link',
      },
      {
        id: 'agent',
        index: '04',
        title: 'Agents',
        lead: 'Humans and agents share the exact same structured records—no screenshots or copy-pasting.',
        points: [
          'Attach exact pages, tables, or skills with @ so agents read only the context you selected.',
          'Agents read and write records directly and trigger plugin actions—settling outputs into durable pages, tables, and skills.',
          'When a capability is missing, agents build it against live fields or derive incremental layers from existing plugins and open source.',
        ],
        image: '/site/shot-agent.webp',
        alt: 'Typing @ in the chat input adds pages and tasks directly to the agent context',
      },
      {
        id: 'tasks',
        index: '05',
        title: 'Task Graph & Approval Gates',
        lead: 'Multi-agent coordination on a structured board, guarded by human sign-off.',
        points: [
          'Each task card declares its owner and dependencies, passing work downstream automatically with execution traces beside the card.',
          'Sensitive actions—sending externally, locking contracts, or mutating production—pause for explicit human approval.',
          'Key state changes append chronologically to events.log for deterministic replay and review.',
        ],
        image: '/site/shot-tasks.webp',
        alt: 'Task table with status, priority, difficulty, and agent assignment for each task',
      },
      {
        id: 'spaces',
        index: '06',
        title: 'Local and Cloud',
        lead: 'Choose where your data lives when you create each space.',
        points: [
          'Local spaces store standard SQLite and plain files on disk—offline-ready with direct calls to your own model provider.',
          'Cloud spaces bring multi-device sync, team collaboration, and condition permissions—self-hostable today, with BIU Cloud coming soon.',
          'Open source under Apache 2.0: inspect the code and export everything in open formats with zero lock-in.',
        ],
        image: '/site/shot-spaces.webp',
        alt: 'Space switcher for moving between spaces or creating a new one',
      },
    ],
    flowLabel: 'Pages as services',
    flowHeadingLines: ['From live data to delivery', 'in four steps'],
    flowSteps: [
      { step: '01', title: 'Start with live data', body: 'Records and page properties from day one' },
      { step: '02', title: 'Compose slices', body: 'Built-in plugins and external service slices' },
      { step: '03', title: 'Build with agents', body: 'Read state directly and grow missing blocks' },
      { step: '04', title: 'Ship one link', body: 'Bundled runtime with cross-page aggregation' },
    ],
    ecoLabel: 'Extension Architecture',
    ecoHeading: 'Three open layers: Plugins, Skills, and MCP',
    ecosystem: [
      {
        name: 'Plugins',
        title: 'Extend interactive UI and backends',
        body: 'Build local sandbox plugins or thin frontend slices over external SaaS—reusable across pages and bundled automatically on share.',
        file: 'Page block declaration',
        code: ':::editorBlock {kind=api-slice plugin=apifox-runner}\n{ "endpoint": "POST /v2/orders/checkout", "env": "prod-canary" }\n:::',
      },
      {
        name: 'Skills',
        title: 'Codify standards and review playbooks',
        body: 'Store checklists, compliance rules, and workflows as readable Markdown files on disk so agents follow them reliably every round.',
        file: 'SKILL.md',
        code: '---\nname: release-check\ndescription: Verify API snapshots and error rates before rollout\n---\nCheck checkout assertion snapshots first, then 10-minute error rates; halt on anomaly.',
      },
      {
        name: 'MCP',
        title: 'Connect external system context',
        body: 'Attach standard MCP servers so agents query external repositories, trackers, and databases directly without manual copying.',
        file: 'MCP config',
        code: '{\n  "name": "github",\n  "command": "npx",\n  "args": ["-y", "@modelcontextprotocol/server-github"]\n}',
      },
    ],
    faqTitle: 'About the product',
    faq: [
      ['How are pages different from documents?', 'Documents hold static text. Every block on a BIU page is full-stack software sharing live state—composing into a complete service delivered in one link.'],
      ['Where do plugins come from? Can they connect to existing systems?', 'Use built-in or community plugins, or ask an agent to build one against live page data. Plugins can also slice external SaaS or internal APIs—keeping heavy backends where they live while persisting run snapshots right in the page.'],
      ['Do recipients need to install anything to use a shared page?', 'No. Sharing bundles prose, attachments, and referenced plugin source into one link that runs directly in the browser.'],
      ['Which models are supported? Do calls relay through BIU?', 'Any compatible provider works (DeepSeek, OpenAI, Anthropic, or local models) with your own API key. In local spaces, requests go directly from your machine to your chosen endpoint with no middleman relay.'],
      ['Can local and cloud spaces coexist?', 'Yes. Keep sensitive personal or diligence records offline in local spaces while running team collaboration and client delivery in cloud spaces.'],
    ],
    ctaTitle: 'Start with BIU',
  },
  zh: {
    metaTitle: '产品',
    metaDescription: '页面是容器，插件是软件：了解 BIU 如何以页面统一共享状态、应用切片、智能体协作、条件权限与本地优先架构。',
    label: '产品',
    heading: '页面是容器，插件是软件',
    lead: 'BIU 不靠往单一应用里堆砌功能实现 All in One，而是让一个页面承载多款共享实时数据的全栈软件与外部系统切片，供人与智能体共同操作。',
    blocks: [
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
    ],
    flowLabel: '页面即服务',
    flowHeadingLines: ['从数据到交付，四步闭环'],
    flowSteps: [
      { step: '01', title: '数据先行', body: '以真实业务记录与页面属性起一页' },
      { step: '02', title: '重组切片', body: '同页组合内置插件与外部系统切片' },
      { step: '03', title: '智能体共建', body: '精确读写状态，缺什么现场构建' },
      { step: '04', title: '一链交付', body: '打包分享运行，同类块自动跨页成表' },
    ],
    ecoLabel: '扩展架构',
    ecoHeading: '三层开放扩展：插件、技能与 MCP',
    ecosystem: [
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
    ],
    faqTitle: '关于产品',
    faq: [
      ['页面与文档的区别', '文档只承载静态文字；BIU 页面里的每一块都是共享数据的全栈软件，多个块同页联动，合起来构成可直接交付的完整服务。'],
      ['插件从哪里来？能否对接现有系统？', '既可使用工作区内置与社区插件，也可由智能体基于真实页面数据现场构建；同时支持作为外部 SaaS 或企业内网 API 的应用切片，重后端留在原地，前端只切出所需交互并落盘快照。'],
      ['分享出去的页面，接收方需要安装环境吗？', '不需要。分享时正文、附件与所用插件源码一并打包为一个链接，接收方在浏览器打开即可直接交互运行。'],
      ['支持哪些大模型？请求会经过 BIU 服务器吗？', '支持任意兼容接口的模型服务（DeepSeek、OpenAI、Anthropic 或本地部署模型），使用你自己的 API 密钥；在本机空间里，请求从你的电脑直连模型端点，不经第三方中转。'],
      ['本机空间与云端空间可以同时用吗？', '可以并存。敏感的个人与尽调资料保留在本机离线空间，需要多人协作与对外交付的内容放在云端空间。'],
    ],
    ctaTitle: '开始使用 BIU',
  },
}

export function MarketingProduct({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  const { locale } = useSiteLocale()
  const copy = COPY[locale]
  usePageMeta({
    title: copy.metaTitle,
    description: copy.metaDescription,
    path: '/product',
  })

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero" data-reveal>
          <p className="site-section-label">{copy.label}</p>
          <h1>{copy.heading}</h1>
          <p className="site-page-lead">{copy.lead}</p>
        </section>

        <section className="site-block-list">
          {copy.blocks.map((block) => (
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
            <p className="site-section-label">{copy.flowLabel}</p>
            <h2>
              {copy.flowHeadingLines.map((line, i) => (
                <span key={line}>
                  {i > 0 ? <br /> : null}
                  {line}
                </span>
              ))}
            </h2>
          </div>
          <div className="site-context-flow" data-reveal aria-label={copy.flowLabel}>
            {copy.flowSteps.map((item, index) => (
              <span key={item.step} className="site-context-item">
                <div>
                  <span>{item.step}</span>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                </div>
                {index < copy.flowSteps.length - 1 ? <i aria-hidden>→</i> : null}
              </span>
            ))}
          </div>
        </section>

        <section className="site-ecosystem" id="ecosystem">
          <div className="site-ecosystem-heading" data-reveal>
            <p className="site-section-label">{copy.ecoLabel}</p>
            <h2>{copy.ecoHeading}</h2>
          </div>
          <div className="site-ecosystem-grid">
            {copy.ecosystem.map((item) => (
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

        <SiteFaq title={copy.faqTitle} items={copy.faq} />

        <SiteFinalCta title={copy.ctaTitle} />
    </SiteChrome>
  )
}
