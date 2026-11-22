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
    lead: '不只是写字的地方，是装下各种小工具的工作台。',
    points: [
      '一页里可以写文字，也可以放任意多个工具块：表格、画板、代码练习、视频剪辑，各自负责一块。',
      '同一个工具模板放进不同页面，各自保存自己的数据和设置——比如十个客户的报价页，互不干扰。',
      '同一页里的多个工具共用一份数据，改一处，页面里所有工具同步更新。',
    ],
    image: '/site/shot-page.webp',
    alt: '一个页面里放着刊头、Excalidraw 画板和算法题卡片，各是一个插件',
  },
  {
    id: 'plugins',
    index: '02',
    title: '插件',
    lead: '页面中的每一种工具，均由可按需安装的插件提供。',
    points: [
      '模块类型并非由平台写死，安装一个插件即可新增一种工具能力。',
      '缺少特定业务模块时，无需等待官方迭代——清晰描述需求，交由智能体生成并在页面中试运行，确认后即可复用。',
      '分散在不同页面中的同类插件模块，可随时汇总为结构化表格，支持统一查询、复制与复用。',
    ],
    image: '/site/shot-plugins.webp',
    alt: '插件表：每个插件一行，安装、启用、停止都在这里',
  },
  {
    id: 'share',
    index: '03',
    title: '分享',
    lead: '发出去的是一页能直接用的软件。',
    points: [
      '分享页面时，正文、附件和用到的插件会一起打包。',
      '对方在浏览器点开链接就能直接操作，不用下载软件，也不用自己配环境。',
      '特别适合把做好的课程、面试陪跑或客户方案整页交付出去。',
    ],
    image: '/site/shot-share.webp',
    alt: '分享出去的页面：对方打开链接，画板和算法题卡片照样能用',
  },
  {
    id: 'agent',
    index: '04',
    title: '智能体协作',
    lead: '智能体与您在同一个工作区内协同工作。',
    points: [
      '在输入框中通过 @ 选中页面、表格或任务，智能体即可直接读取上下文，无需反复复制粘贴。',
      '智能体生成的方案可直接落盘为可编辑的页面、表格或任务卡，持续沉淀而非沉没在聊天记录中。',
      '缺少对应工具时，智能体可按需编写插件并挂载至当前页面。',
    ],
    image: '/site/shot-agent.webp',
    alt: '输入框里输入 @，页面和任务直接成为智能体的上下文',
  },
  {
    id: 'tasks',
    index: '05',
    title: '任务看板',
    lead: '多个智能体依托任务看板分工协作，而非依赖冗长群聊。',
    points: [
      '为每张任务卡明确负责人与先后依赖，执行顺序清晰可见。',
      '上游任务完成后自动流转至下游，执行过程与结果在任务卡旁并排查阅。',
      '您可随时介入修改、重新指派或完成验收。',
    ],
    image: '/site/shot-tasks.webp',
    alt: '任务表：每条任务有状态、优先级和难度，可以派给某个智能体',
  },
  {
    id: 'spaces',
    index: '06',
    title: '本机与云端',
    lead: '数据存放于本地还是云端，创建空间时由您自主决定。',
    points: [
      '本机空间：数据直接保存在本地电脑，支持离线使用；模型调用使用您自己的密钥。',
      '云端空间：面向多设备同步与团队协作，支持部署在自有服务器上，官方云端服务即将上线。',
      '数据保持开放透明：随时可在本地目录查阅或完整导出，不存在平台锁定。',
    ],
    image: '/site/shot-spaces.webp',
    alt: '空间切换菜单：在不同空间之间切换，或创建新空间',
  },
]

const PAGE_FLOW = [
  { step: '01', title: '撰写背景', body: '梳理说明与参考资料' },
  { step: '02', title: '组合插件', body: '画板、表格、代码、剪辑' },
  { step: '03', title: '按需定制', body: '由智能体补充专属模块' },
  { step: '04', title: '整页分享', body: '接收方打开即可直接使用' },
] as const

/** 三种补法：缺口是什么、怎么补，加一段真实写法当例子。 */
const ECOSYSTEM = [
  {
    name: '插件',
    title: '页面缺一种块',
    body: '写一个插件，就多一种块。之后每一页都能放，分享时跟着页面一起走。',
    file: '页面正文',
    code: ':::editorBlock {kind=checkin plugin=page-checkin}\n{ "title": "第 3 周签到" }\n:::',
  },
  {
    name: '技能',
    title: '智能体不懂你的做法',
    body: '把规范和流程写成技能，智能体做到这一步时会照着做。',
    file: 'SKILL.md',
    code: '---\nname: 批改作业\ndescription: 批改算法题时按这份标准打分\n---\n先看思路，再看代码，最后看边界。',
  },
  {
    name: 'MCP',
    title: '资料在别的系统里',
    body: '接上一台 MCP 服务器，智能体就能直接去查，不用你复制过来。',
    file: 'MCP 服务器',
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
            <p className="site-section-label">扩展</p>
            <h2>缺什么，自己补上</h2>
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

        <SiteFinalCta title="亲手试一页" />
    </SiteChrome>
  )
}
