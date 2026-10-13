import { Link, useParams } from 'react-router-dom'
import { SiteChrome, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'

/**
 * 对比页数据。
 * 纪律：BIU 那列必须如实写 ❌ —— 全是 ✅ 的表没人信。
 * 写法：一句话定调 → 硬对照表 → 承认对方适用场景。
 */

export type CompareRow = { dimension: string; them: string; biu: string }

export type ComparePage = {
  slug: string
  title: string
  category: string
  /** 一句话定调：先承认对方强项，再重新定义战场 */
  opening: string
  /** 对手适用场景 */
  useWhen: string
  /** BIU 适用场景 */
  biuWhen: string
  columns: [string, string]
  rows: CompareRow[]
}

export const COMPARE_PAGES: ComparePage[] = [
  {
    slug: 'vs-linux',
    title: 'BIU vs Linux',
    category: '基础设施',
    opening: 'Linux 用「一切皆文件」抹平了异构硬件，用一组系统调用统一了所有设备的读写。BIU 做的是同一件事，只是把坐标换成了数据：一切皆路径，一切皆 /<table>/<id>。',
    useWhen: '需要通用操作系统、进程隔离、网络栈、跑原生程序',
    biuWhen: '需要把工作区里的页面、数据、会话、智能体当成同一种可寻址对象来读写和扩展',
    columns: ['Linux', 'BIU'],
    rows: [
      { dimension: '核心主张', them: '一切皆文件', biu: '一切皆 /<table>/<id>' },
      { dimension: '系统调用', them: 'read / write / open', biu: 'db_read / db_update / db_create' },
      { dimension: '设备专有操作', them: 'ioctl', biu: 'db_action' },
      { dimension: '自报状态', them: '/proc', biu: 'db_list / + 每个表的 blurb' },
      { dimension: '驱动 / 能力注册', them: '内核模块 modules', biu: '插件注册表（sandbox → pack → mount）' },
      { dimension: '抹平异构', them: 'VFS', biu: 'File System' },
      { dimension: '扩展是否需要重启', them: '⚠️ 模块可热加载，内核本身要重启', biu: '✅ 插件热装卸，内核不动' },
      { dimension: '扩展者是谁', them: '驱动开发者', biu: '✅ 人和智能体用同一套 db_*' },
      { dimension: '权限模型', them: '✅ 用户 / 组 / 能力位（成熟）', biu: '✅ 数据视图 × 成员视图匹配' },
      { dimension: '底层可见', them: '✅ /dev /procfs，直接读', biu: '✅ 两栖：db_* 或直接读盘' },
      { dimension: '进程与资源隔离', them: '✅ 强（namespaces / cgroups）', biu: '⚠️ 插件沙箱较薄，未做资源硬限' },
      { dimension: '跑任意原生程序', them: '✅ 这就是它的工作', biu: '❌ 不是通用 OS' },
      { dimension: '形态', them: '内核 + 发行版', biu: '内核（应用在它之上长出）' },
    ],
  },
  {
    slug: 'vs-k8s',
    title: 'BIU vs Kubernetes',
    category: '基础设施',
    opening: 'k8s 用「一切皆声明式对象」抹平了机器：写一份 YAML，控制面把它收敛成实际运行的资源。BIU 把同一套思路放回一页文档里 —— 在页面里声明一个插件就得到一个能力，声明多个就组合出一套服务。',
    useWhen: '需要容器编排、多副本调度、自愈、把机器当资源池',
    biuWhen: '需要在页面里直接声明能力：一个页面上声明几个插件，就得到一套可用的服务',
    columns: ['k8s', 'BIU'],
    rows: [
      { dimension: '核心主张', them: '一切皆声明式对象', biu: '一切皆 /<table>/<id>，声明即生效' },
      { dimension: '声明在哪写', them: 'YAML 文件，交给 kubectl apply', biu: '直接写在页面正文里（或以页面块形式插入）' },
      { dimension: '声明的单位', them: '一个资源对象（Pod / Service / CRD）', biu: '一个插件：<plugin kind="…" />' },
      { dimension: '声明之后发生什么', them: '控制面调谐，把实际状态拉向期望', biu: '✅ 立刻挂载运行，无需 apply / 等待调度' },
      { dimension: '一个页面/文件能放几个', them: '⚠️ 通常一份 YAML 一类资源，多个靠多文件或 List', biu: '✅ 一页里可以声明任意多个插件，各管一块' },
      { dimension: '多个如何组合成服务', them: 'Service / Ingress 把多个 Pod 串起来', biu: '✅ 同页多个插件各占一块，页面本身就是组合结果' },
      { dimension: '谁写声明', them: '⚠️ 平台团队写 YAML 和 Operator', biu: '✅ 人和智能体都在正文里直接写' },
      { dimension: '扩展的粒度', them: 'CRD + controller（重）', biu: '一个插件一块界面/能力（轻）' },
      { dimension: '入口', them: 'kubectl / API Server', biu: 'db_read / db_update / db_create' },
      { dimension: '自报状态', them: 'status 字段 + events', biu: 'db_list / + 每个表的 blurb' },
      { dimension: '权限模型', them: '✅ RBAC + ServiceAccount', biu: '✅ 数据视图 × 成员视图匹配' },
      { dimension: '可追溯', them: '✅ 声明与事件都可读', biu: '✅ 只追加事件流，界面是它的投影' },
      { dimension: '资源隔离', them: '✅ 强（Pod / quota / limit / namespace）', biu: '⚠️ 插件沙箱较薄，未做资源硬限' },
      { dimension: '多副本与高可用', them: '✅ 副本、探针、自愈', biu: '❌ 未做多副本调度' },
      { dimension: '跑任意容器', them: '✅ 这就是它的工作', biu: '❌ 不是编排系统' },
      { dimension: '形态', them: '控制面 + 节点', biu: '内核（应用在它之上长出）' },
    ],
  },
  {
    slug: 'vs-office',
    title: 'BIU vs Office',
    category: '办公协作',
    opening: 'Office 定义了结构化办公。BIU 把这套结构放回一份可被智能体读写的数据里。',
    useWhen: '需要精确排版的长文档、复杂公式、给外部交付的标准格式文件',
    biuWhen: '需要结构化数据、智能体能读写工作区、产出能沉淀复用',
    columns: ['Office', 'BIU'],
    rows: [
      { dimension: '核心单位', them: '文件（.docx / .xlsx / .pptx）', biu: '可寻址路径 /<table>/<id>' },
      { dimension: '文档', them: '✅ Word（排版最强）', biu: '✅ 页面' },
      { dimension: '表格', them: '✅ Excel（标杆）', biu: '✅ 表是内核一等公民' },
      { dimension: '幻灯片', them: '✅ PowerPoint', biu: '⚠️ 块即组件，能力较基础' },
      { dimension: '数据在哪', them: '本机文件（协作靠 SharePoint）', biu: '建空间时选：本机 / 云端' },
      { dimension: '离线', them: '✅', biu: '✅ 本机空间' },
      { dimension: '智能体操作面', them: '⚠️ Copilot 附加', biu: '✅ 一等公民，可读写工作区' },
      { dimension: '扩展归属', them: '微软开发者', biu: '人和智能体都能建插件' },
      { dimension: '形态', them: '应用套件', biu: '内核' },
    ],
  },
  {
    slug: 'vs-notion',
    title: 'BIU vs Notion',
    category: '办公协作',
    opening: 'Notion 把块模型和空间协作做成了心智标准。BIU 换了块模型的来源 —— 从封闭集变成可安装的插件，并且让智能体成为一等公民。',
    useWhen: '成熟的设计协作、海量模板、团队已经在用 Notion',
    biuWhen: '块类型要能自己扩展、智能体要能读写工作区、数据边界要能自己掌控',
    columns: ['Notion', 'BIU'],
    rows: [
      { dimension: '块模型', them: '封闭集，类型由 Notion 定义', biu: '块类型来自可安装插件' },
      { dimension: '核心对象', them: '由应用预定义', biu: '核心对象本身就是数据' },
      { dimension: '数据在哪', them: '只有云端', biu: '建空间时选：本机 / 云端' },
      { dimension: '离线', them: '❌', biu: '✅ 本机空间' },
      { dimension: '协作', them: '✅ 最强（成员权限 / 模板生态）', biu: '✅ 云端空间' },
      { dimension: '智能体', them: '⚠️ AI 是附加功能', biu: '✅ 一等公民，可被调度、可创建' },
      { dimension: '人机数据', them: 'AI 在侧栏，结果需手动搬进页面', biu: '人和智能体操作同一份数据' },
      { dimension: '扩展归属', them: '平台开发者写集成', biu: '人和智能体都能建' },
    ],
  },
  {
    slug: 'vs-cursor',
    title: 'BIU vs Cursor',
    category: 'AI 应用',
    opening: 'Cursor 把智能体放进了编辑器。BIU 走得更远一步 —— 智能体本身就是数据，可以被读写、复制和分享。',
    useWhen: '在编辑器里写代码、需要深度代码理解与补全',
    biuWhen: '需要多个智能体协作、产出要沉淀成可复用对象、工作区不限于代码',
    columns: ['Cursor', 'BIU'],
    rows: [
      { dimension: '智能体地位', them: '编辑器里的工具', biu: '智能体就是数据' },
      { dimension: '核心对象', them: '由编辑器应用预定义', biu: '核心对象是数据本身' },
      { dimension: '代码放哪', them: '你的 IDE / 项目', biu: '工作区记录 /<table>/<id>' },
      { dimension: '多智能体', them: '⚠️ 靠人在编辑器里切换', biu: '✅ 任务看板当总线' },
      { dimension: '上下文', them: '✅ @ 引用 + 代码索引（很强）', biu: '同一地址空间，读动作痕迹' },
      { dimension: '产出沉淀', them: '⚠️ 落在你项目里', biu: '✅ 沉降为表 / 技能 / 页面' },
      { dimension: '代码补全体验', them: '✅ 强（BIU 不专精）', biu: '⚠️ 非专精领域' },
      { dimension: '形态', them: '应用', biu: '内核' },
    ],
  },
  {
    slug: 'vs-chatgpt',
    title: 'BIU vs ChatGPT',
    category: 'AI 应用',
    opening: 'ChatGPT 定义了对话式 AI。BIU 关心的是对话结束之后 —— 产出去了哪里。',
    useWhen: '快速问答、头脑风暴、学习与通用对话',
    biuWhen: '产出要留成可寻址的记录、智能体要能读写你的工作区',
    columns: ['ChatGPT', 'BIU'],
    rows: [
      { dimension: '基本单位', them: '对话（message）', biu: '可寻址路径 /<table>/<id>' },
      { dimension: '产出物去哪', them: '沉进聊天历史，复用要重新找', biu: '沉降成页面 / 表 / 技能' },
      { dimension: '产出 UI 的成本', them: '智能体写上百行 HTML/CSS/JS，下次重写', biu: '写三个字段（kind + plugin + JSON），一个插件复用' },
      { dimension: '智能体能否扩展系统', them: '❌ 能力由平台预置', biu: '✅ 可创建插件' },
      { dimension: '上下文', them: '靠平台检索拼装', biu: '与环境同一地址空间' },
      { dimension: '通用知识问答', them: '✅ 强（BIU 不专精）', biu: '⚠️ 取决于所配模型' },
      { dimension: '数据在哪', them: '云端', biu: '建空间时选：本机 / 云端' },
    ],
  },
  {
    slug: 'vs-claude',
    title: 'BIU vs Claude',
    category: 'AI 应用',
    opening: 'Claude 在长文理解和代码上很强，MCP 让工具连接标准化。BIU 的差别在于：智能体不只能调用工具，它本身就是可寻址的数据。',
    useWhen: '长文档分析、代码协作、通过 MCP 连接外部工具',
    biuWhen: '工具要能自己造、多个智能体要能协作、数据边界要自己掌控',
    columns: ['Claude', 'BIU'],
    rows: [
      { dimension: '智能体地位', them: '工具', biu: '智能体就是数据' },
      { dimension: '能否扩展自身', them: '⚠️ 靠 MCP 连接外部', biu: '✅ 智能体自己造插件' },
      { dimension: '产出沉淀', them: '❌ 沉进对话', biu: '✅ 沉降为可寻址对象' },
      { dimension: '多智能体协作', them: '⚠️ 有限', biu: '✅ 看板总线，依赖成图' },
      { dimension: '长文理解', them: '✅ 强（BIU 不专精）', biu: '⚠️ 取决于所配模型' },
      { dimension: '数据在哪', them: '云端', biu: '建空间时选：本机 / 云端' },
      { dimension: '形态', them: '应用', biu: '内核' },
    ],
  },
  {
    slug: 'vs-obsidian',
    title: 'BIU vs Obsidian',
    category: '文件管理',
    opening: 'Obsidian 证明了本地优先能赢。BIU 走得更远 —— 既有本地的透明，又有空间的结构。',
    useWhen: '纯本地笔记、Markdown 文件、社区插件生态',
    biuWhen: '既要本地，也要协作与结构化数据，还要智能体能读写',
    columns: ['Obsidian', 'BIU'],
    rows: [
      { dimension: '数据在哪', them: '本机文件夹', biu: '建空间时选：本机 / 云端' },
      { dimension: '离线', them: '✅', biu: '✅ 本机空间' },
      { dimension: '协作', them: '❌ 靠第三方同步 / Git', biu: '✅ 云端空间（成员 / 权限）' },
      { dimension: '结构化数据', them: '⚠️ 靠插件在文件上「算」', biu: '✅ 表是内核一等公民' },
      { dimension: '数据可见性', them: '✅ 纯文件（最透明）', biu: '✅ 两栖：接口或直接读盘' },
      { dimension: '智能体', them: '❌ 靠第三方接模型', biu: '✅ 一等公民，同一地址空间' },
      { dimension: '插件生态', them: '✅ 社区生态成熟', biu: '⚠️ 生态起步阶段' },
      { dimension: '可追溯', them: '❌', biu: '✅ 只追加事件流' },
    ],
  },
]

export const COMPARE_CATEGORIES = [
  { name: '基础设施', slugs: ['vs-linux', 'vs-k8s'] },
  { name: '办公协作', slugs: ['vs-office', 'vs-notion'] },
  { name: 'AI 应用', slugs: ['vs-cursor', 'vs-chatgpt', 'vs-claude'] },
  { name: '文件管理', slugs: ['vs-obsidian'] },
] as const

function CompareTable({ page }: { page: ComparePage }) {
  return (
    <table className="site-compare-table">
      <thead>
        <tr>
          <th>维度</th>
          <th>{page.columns[0]}</th>
          <th className="is-biu">{page.columns[1]}</th>
        </tr>
      </thead>
      <tbody>
        {page.rows.map((row) => (
          <tr key={row.dimension}>
            <th scope="row">{row.dimension}</th>
            <td>{row.them}</td>
            <td className="is-biu">{row.biu}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function MarketingCompareIndex({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: '对比',
    description: '和每个领域最好的产品比：Linux、Kubernetes、Office、Notion、Cursor、ChatGPT、Claude、Obsidian。',
    path: '/compare',
  })
  const bySlug = new Map(COMPARE_PAGES.map((page) => [page.slug, page]))

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero" data-reveal>
          <p className="site-section-label">对比</p>
          <h1>和每个领域最好的产品比。</h1>
          <p className="site-page-lead">
            不要问 BIU 能做什么，问问 BIU 不能做什么。
            它们各自只解决一个面 —— 结构、协作、对话、本地、自主。
            BIU 不是在这些面上做得更好，是把这些面合成一个内核。
          </p>
        </section>

        <section className="site-compare-index">
          {COMPARE_CATEGORIES.map((category) => (
            <div key={category.name} className="site-compare-group" data-reveal>
              <h2>{category.name}</h2>
              <div className="site-compare-cards">
                {category.slugs.map((slug) => {
                  const page = bySlug.get(slug)
                  if (!page) return null
                  return (
                    <Link key={slug} to={`/compare/${slug}`} className="site-compare-card">
                      <h3>{page.title}</h3>
                      <p>{page.opening}</p>
                      <span>查看对比 →</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </section>

        <section className="site-final-cta" data-reveal>
          <div className="site-container">
            <p className="site-section-label">开始使用 BIU</p>
            <h2>看完对比，自己试一次。</h2>
            <button type="button" onClick={onStart}>创建你的空间 <span>↗</span></button>
          </div>
        </section>
    </SiteChrome>
  )
}

export function MarketingCompareDetail({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  const { slug } = useParams<{ slug: string }>()
  const page = COMPARE_PAGES.find((item) => item.slug === slug)
  usePageMeta({
    title: page?.title ?? '对比',
    description: page?.opening ?? 'BIU 与其他产品的逐维度对比。',
    path: `/compare/${slug ?? ''}`,
  })

  if (!page) {
    return (
      <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero">
          <p className="site-section-label">对比</p>
          <h1>没有这个对比页。</h1>
          <p className="site-page-lead"><Link to="/compare">返回对比总览</Link></p>
        </section>
      </SiteChrome>
    )
  }

  const others = COMPARE_PAGES.filter((item) => item.category === page.category && item.slug !== page.slug)

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero" data-reveal>
          <p className="site-section-label">{page.category}</p>
          <h1>{page.title}</h1>
          <p className="site-page-lead">{page.opening}</p>
        </section>

        <section className="site-compare-body" data-reveal>
          <CompareTable page={page} />
        </section>

        <section className="site-compare-when" data-reveal>
          <article>
            <h2>用 {page.columns[0]} 当你需要</h2>
            <p>{page.useWhen}</p>
          </article>
          <article>
            <h2>用 BIU 当你需要</h2>
            <p>{page.biuWhen}</p>
          </article>
        </section>

        {others.length ? (
          <section className="site-compare-more" data-reveal>
            <h2>同类对比</h2>
            <div className="site-compare-cards">
              {others.map((item) => (
                <Link key={item.slug} to={`/compare/${item.slug}`} className="site-compare-card">
                  <h3>{item.title}</h3>
                  <span>查看对比 →</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="site-final-cta" data-reveal>
          <div className="site-container">
            <p className="site-section-label">开始使用 BIU</p>
            <h2>看完对比，自己试一次。</h2>
            <button type="button" onClick={onStart}>创建你的空间 <span>↗</span></button>
          </div>
        </section>
    </SiteChrome>
  )
}
