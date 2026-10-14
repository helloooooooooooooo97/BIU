import { SiteChrome, SiteFaq, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'

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
    lead: '页面是容器，用来把软件组合起来。',
    points: [
      '一页里可以写正文，也可以插入任意多个插件块：一张表、一块画板、一个代码练习、一段视频剪辑，各管一块。',
      '页面上的属性就是这些插件共同的运行环境 —— 同一个插件放进不同页面，读到的是各自的配置和数据。',
      '多个块读写同一份数据，所以它们是一套服务，而不是几个互不相干的嵌入。',
    ],
    image: '/site/shot-page.webp',
    alt: '一个页面里放着刊头、Excalidraw 画板和算法题卡片，各是一个插件',
  },
  {
    id: 'plugins',
    index: '02',
    title: '插件',
    lead: '页面里的每一块，都是一个插件提供的软件。',
    points: [
      '块的类型不是平台写死的，装一个插件就多一种块。',
      '插件先在沙箱里写、在页面里试，满意了再打包，人和智能体都能做。',
      '每个块本身也是一条数据，可以被查询、复制、复用到别的页面。',
    ],
    image: '/site/shot-plugins.webp',
    alt: '插件表：每个插件一行，安装、启用、停止都在这里',
  },
  {
    id: 'share',
    index: '03',
    title: '分享',
    lead: '交出去的是一页能用的软件。',
    points: [
      '分享页面时，正文、附件和它用到的插件源码一起打包。',
      '对方打开就能用，不需要再装一遍工具、再搭一遍环境。',
      '适合把一套做好的服务交给客户、学生或同事。',
    ],
    image: '/site/shot-share.webp',
    alt: '分享出去的页面：对方打开链接，画板和算法题卡片照样能用',
  },
  {
    id: 'agent',
    index: '04',
    title: '智能体',
    lead: '和你在同一个工作区里干活。',
    points: [
      '智能体读的就是你的页面和表格，不用复制粘贴资料给它。',
      '它的产出直接写成页面、表格、任务，下一轮接着用。',
      '缺工具时，它可以自己写一个插件挂进页面。',
    ],
    image: '/site/shot-agent.webp',
    alt: '会话输入框里输入 @，页面和任务直接成为智能体的上下文',
  },
  {
    id: 'tasks',
    index: '05',
    title: '任务看板',
    lead: '多个智能体靠看板分工，不靠群聊。',
    points: [
      '每张任务卡写清楚负责人和依赖，依赖关系就是一张图。',
      '上游完成后自动交给下游，执行轨迹和任务卡并排查看。',
      '人也可以随时接手、改派或验收。',
    ],
    image: '/site/shot-tasks.webp',
    alt: '任务表：每条任务有状态、优先级和难度，可以派给某个智能体',
  },
  {
    id: 'spaces',
    index: '06',
    title: '本机与云端',
    lead: '两种空间，创建时由你决定。',
    points: [
      '本机空间：数据存在你自己的电脑上，离线可用；模型用你自己的密钥。',
      '云端空间：多设备访问、成员权限、在线协作；可以自部署，官方云端服务即将上线。',
      '数据是透明的：既能通过接口读写，也能直接在磁盘上找到。',
    ],
    image: '/site/shot-spaces.webp',
    alt: '空间切换菜单：在不同空间之间切换，或创建新空间',
  },
]

const PAGE_FLOW = [
  { step: '01', title: '写正文', body: '背景、说明与资料' },
  { step: '02', title: '放插件块', body: '表格、画板、练习、剪辑' },
  { step: '03', title: '设页面属性', body: '插件共同的运行环境' },
  { step: '04', title: '分享', body: '对方拿到能用的一页' },
] as const

/** 三种补法：缺口是什么、怎么补，加一段真实写法当例子。 */
const ECOSYSTEM = [
  {
    name: '插件',
    title: '页面缺一种块',
    body: '写一个插件，就多一种块。之后每一页都能放，分享时跟着页面一起走。',
    file: '页面正文',
    code: ':::pageBlock {kind=checkin plugin=page-checkin}\n{ "title": "第 3 周签到" }\n:::',
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
  ['页面和普通文档有什么区别？', '文档只装文字；页面里每一块都是一个插件提供的软件，多个块读写同一份数据，合起来是一套服务。'],
  ['插件从哪来？', '内置一批常用的，比如表格、画板、代码运行；也可以自己写，或者让智能体写。先在沙箱里试，满意了再打包。'],
  ['对方打开分享的页面，要先装插件吗？', '不用。分享时正文、附件和页面用到的插件源码一起打包，对方打开就能用。'],
  ['智能体能用哪些模型？', 'DeepSeek、OpenAI、Anthropic 等，用的是你自己的密钥。'],
  ['本机空间和云端空间能同时用吗？', '可以。两种空间各自成立：私人资料放本机，协作内容放云端。'],
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
                <img src={block.image} alt={block.alt} loading="lazy" decoding="async" />
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

        <SiteFinalCta title="先做一页" />
    </SiteChrome>
  )
}
