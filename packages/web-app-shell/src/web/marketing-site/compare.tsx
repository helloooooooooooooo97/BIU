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
    category: '文档管理',
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
    category: '文档管理',
    opening: 'Notion 把块模型和空间协作做成了心智标准。BIU 在这一层上多了一步：字段不必长在表里，而是作为属性挂在记录外面 —— 要给数据加一项信息，不用改表；权限也不用长在页面树里，它可以把「一组筛选条件」当成授权对象 —— 谁符合这个视图，谁就拿到这个角色。',
    useWhen: '成熟的设计协作、海量模板、团队已经在用 Notion、权限只要「页面级 + 群组」就够',
    biuWhen: '要给已有数据加属性而不动原表、同一批数据要能同时从多个角度组织、授权要按条件圈人而不是按名单、智能体要能读写工作区',
    columns: ['Notion', 'BIU'],
    rows: [
      { dimension: '给数据加一项信息', them: '⚠️ 改数据库 schema，动的是表本身、影响该表所有行；系统表还改不了', biu: '✅ 挂一个 facet：属性存在记录之外，原表不动，只影响被挂上的那些记录 —— 任意记录都能挂' },
      { dimension: '一条记录的组织方式', them: '⚠️ 一个页面属于一个数据库，多视角靠关联、rollup 或复制', biu: '✅ 可同时挂多个 facet，一个 facet 还能横跨不同的表' },
      { dimension: '按属性筛选', them: '✅ 数据库视图可以按属性过滤', biu: '✅ 视图可以按 facet 的字段筛选' },
      { dimension: '块模型', them: '封闭集，类型由 Notion 定义', biu: '块类型来自可安装插件' },
      { dimension: '数据在哪', them: '只有云端，离线 ❌', biu: '✅ 建空间时选：本机 / 云端，本机空间离线可用' },
      { dimension: '授权给谁、授到哪', them: '⚠️ 人、群组（名单）；范围是页面 / 数据库这些实体', biu: '✅ 可以是具体账号，也可以是一个成员视图 —— 授权对象是 view_id，本身带筛选条件' },
      { dimension: '授权与数据的关系', them: '⚠️ 先建页面再往里加人，权限挂在实体上，新内容要逐条补授权', biu: '✅ 条件先写好，新记录只要符合条件就自动落进授权范围' },
      { dimension: '权限怎么算出来', them: '⚠️ 看 / 评 / 编 / 全权按页给；来源通常只告诉你「有权限」', biu: '✅ viewer / editor / manager / owner 多来源取最高，并逐级展开：直接授予 / 成员组 / 成员视图 / 继承自上一条 / 空间默认' },
      { dimension: '权限继承', them: '⚠️ 子页面继承父页面，父页在别人名下就没法重挂', biu: '✅ 记录可挂父级（inherit / private / members / restricted），父级不在你名下时也能继承' },
      { dimension: '边角控制', them: '⚠️ 邀请外部人粒度较粗；改权限要页面所有者及以上', biu: '✅ internal / external / guest 分类，有外部协作者自动升 shared；share 与 manage-permissions 拆成两个动作' },
      { dimension: '智能体的权限', them: '⚠️ 以「集成」身份接入，基本全量可见', biu: '✅ 智能体是独立 actor，同一套授权判定，按记录裁到你的可见范围' },
      { dimension: '智能体', them: '⚠️ AI 是附加功能，在侧栏，结果要手动搬进页面', biu: '✅ 一等公民，与人在同一份数据上操作，可被调度、可创建' },
      { dimension: '成熟度', them: '✅ 协同编辑与权限打磨多年，模板与生态海量', biu: '⚠️ 模型更细，但协同编辑、权限打磨与插件生态都还没到 Notion 同级' },
    ],
  },
  {
    slug: 'vs-airtable',
    title: 'BIU vs Airtable',
    category: '应用搭建',
    opening: 'Airtable 证明了填数据就能得到应用。BIU 走的是同一条路，但把界面那层也交给你了 —— 视图不是平台给你的几种选型，它本身就是一条可寻址的记录。',
    useWhen: '不写代码搭表格应用、需要成熟的视图选型与模板生态、团队协作',
    biuWhen: '工具和内容要放在同一种对象上、智能体要能读写界面本身、数据边界要自己掌控',
    columns: ['Airtable', 'BIU'],
    rows: [
      { dimension: '核心主张', them: '填数据就得到应用', biu: '数据和界面是同一种对象' },
      { dimension: '数据与界面', them: '两层：记录是内容，视图是平台给的', biu: '一层：页面与插件声明都走 /<table>/<id>' },
      { dimension: '视图能改到什么程度', them: '⚠️ 在它给的视图类型里选和配', biu: '✅ 界面本身是记录，可读写、可复制、可分享' },
      { dimension: '智能体能操作什么', them: '⚠️ 主要操作记录，界面层是平台私有', biu: '✅ 记录和界面用同一套 db_*' },
      { dimension: '新增一种能力', them: '⚠️ 用扩展或脚本，受平台能力边界限制', biu: '✅ 声明一个插件，写进页面即生效' },
      { dimension: '扩展者是谁', them: '知道怎么写脚本的人', biu: '✅ 人和智能体同一套接口' },
      { dimension: '数据在哪', them: '云端（厂商托管）', biu: '建空间时选：本机 / 云端' },
      { dimension: '数据可迁移', them: '⚠️ 靠导出，格式与视图关系受限', biu: '✅ 两栖：接口读写或直接读盘' },
      { dimension: '开箱即用', them: '✅ 强，视图与模板选型丰富', biu: '⚠️ 插件生态刚起步' },
      { dimension: '上手门槛', them: '✅ 拖拽即用，非技术同事也能操作', biu: '❌ 声明插件要写 JSON，门槛明显更高' },
      { dimension: '托管与运维', them: '✅ 厂商负责', biu: '❌ 自建，无托管 SLA' },
      { dimension: '形态', them: '成品平台', biu: '内核（应用在它之上长出）' },
    ],
  },
  {
    slug: 'vs-retool',
    title: 'BIU vs Retool',
    category: '应用搭建',
    opening: 'Retool 把内部工具从几周压到几小时，靠的是它的组件库。BIU 的差别在这一层：组件不是平台发的，你用的组件自己就是一条可寻址的记录，能改、能复制、能被智能体重写。',
    useWhen: '快速搭内部管理后台、连接已有数据库与 API、企业权限与审计',
    biuWhen: '界面本身要能被程序改写、工具要能长成对外的产品、数据边界要自己掌控',
    columns: ['Retool', 'BIU'],
    rows: [
      { dimension: '核心主张', them: '拖组件搭出内部工具', biu: '组件本身就是数据' },
      { dimension: '组件从哪来', them: '⚠️ 平台组件库预置，能力边界由它定', biu: '✅ 插件声明即组件，自己写一个就在' },
      { dimension: '界面能不能被程序改', them: '⚠️ 靠平台 API 与配置，界面不是可寻址对象', biu: '✅ 界面就是记录，可直接读写与替换' },
      { dimension: '搭出来的东西归谁', them: '⚠️ 脱离这个平台就不成立', biu: '✅ 以数据存在，接口读写或直接读盘' },
      { dimension: '智能体能操作什么', them: '⚠️ 接它的 API，界面层不在视野里', biu: '✅ 数据与界面同用一套 db_*' },
      { dimension: '工具用途', them: '⚠️ 定位内部工具，不面向外部产品', biu: '✅ 对内对外是同一套东西' },
      { dimension: '接已有数据源', them: '✅ 强，数据库与 API 连接器丰富', biu: '⚠️ 以工作区数据为主，外部接入要自己写' },
      { dimension: '权限与审计', them: '✅ 企业级，成熟', biu: '⚠️ 有权限模型，审计不如它完整' },
      { dimension: '生态与模板', them: '✅ 成熟', biu: '⚠️ 插件生态刚起步' },
      { dimension: '上手门槛', them: '✅ 拖拽即用', biu: '❌ 声明插件要写 JSON，门槛明显更高' },
      { dimension: '托管与运维', them: '✅ 厂商负责', biu: '❌ 自建，无托管 SLA' },
      { dimension: '形态', them: '成品平台', biu: '内核（应用在它之上长出）' },
    ],
  },
  {
    slug: 'vs-supabase',
    title: 'BIU vs Supabase',
    category: '应用搭建',
    opening: 'Supabase 把后端打包好了：Postgres、认证、存储、实时，你只需要写前端。BIU 不给后端也不给前端 —— 它给的是同一种对象，数据、界面、智能体都走 /<table>/<id>。',
    useWhen: '需要标准后端能力、前端由自己团队写、要 SQL 与成熟云托管',
    biuWhen: '数据与界面要在同一种对象上、智能体要能读写界面本身、不想维护两套边界',
    columns: ['Supabase', 'BIU'],
    rows: [
      { dimension: '核心主张', them: '后端即服务，前端自己写', biu: '数据、界面、智能体同一种对象' },
      { dimension: '它给你什么', them: 'Postgres + 认证 + 存储 + 实时', biu: '可寻址的数据 + 插件声明' },
      { dimension: '界面从哪来', them: '❌ 自己写（React / Vue…）', biu: '✅ 声明在页面里，写下去就长出来' },
      { dimension: '核心对象', them: '表 / 行（SQL 与 SDK）', biu: '✅ /<table>/<id>，所有东西同一种' },
      { dimension: '智能体能操作什么', them: '⚠️ 经 API 读写数据，界面层不在视野里', biu: '✅ 数据与界面同用一套 db_*' },
      { dimension: '前后端边界', them: '两层：它管后端，你管前端', biu: '✅ 一层：不需要在两侧各维护一套' },
      { dimension: '数据在哪', them: '✅ 云端托管，也可自部署', biu: '建空间时选：本机 / 云端' },
      { dimension: '数据可迁移', them: '✅ 就是 Postgres，随时导出', biu: '✅ 两栖：接口读写或直接读盘' },
      { dimension: '后端能力', them: '✅ 强（SQL、RLS、Edge Functions、向量）', biu: '⚠️ 非专精，复杂查询要自己写插件' },
      { dimension: '生态与文档', them: '✅ 成熟，社区活跃', biu: '⚠️ 插件生态刚起步' },
      { dimension: '上手门槛', them: '✅ 会写前端就能用', biu: '❌ 声明插件要写 JSON，门槛明显更高' },
      { dimension: '托管与运维', them: '✅ 厂商托管，或自部署托管', biu: '❌ 自建，无托管 SLA' },
      { dimension: '形态', them: '后端平台', biu: '内核' },
    ],
  },
  {
    slug: 'vs-cursor',
    title: 'BIU vs Cursor',
    category: 'IDE 助手',
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
    slug: 'vs-dsh',
    title: 'BIU vs DeepSeek Harness',
    category: '编码 Harness',
    opening: 'DSH 说得很准：模型负责思考，Harness 负责执行真实环境操作。BIU 认同这句话，只是把「环境」换了个地方 —— 不是本机文件系统，而是一份可寻址的数据。',
    useWhen: '在终端里跑编码 agent、要接 DeepSeek 模型、需要插件与多 agent 编排',
    biuWhen: '智能体和它的产出要落在同一份可寻址数据上、要能被界面化复用',
    columns: ['DeepSeek Harness', 'BIU'],
    rows: [
      { dimension: '核心主张', them: '模型思考，Harness 执行', biu: '模型思考，数据即环境' },
      { dimension: '环境是什么', them: '本机文件系统 + 终端', biu: '工作区：/<table>/<id>' },
      { dimension: '操作环境的方式', them: '工具调用（读写文件、跑命令）', biu: '✅ db_read / db_update / db_action' },
      { dimension: '智能体自己是什么', them: '⚠️ Harness 的配置与运行时对象', biu: '✅ 一条可寻址的记录' },
      { dimension: '插件化', them: '✅ 支持，开放式插件生态', biu: '✅ 声明即插件，写进页面就挂载' },
      { dimension: '扩展谁来做', them: '⚠️ 写插件的开发者', biu: '✅ 人和智能体同一套 db_*' },
      { dimension: '产出落在哪', them: '⚠️ 你在终端里那个项目目录', biu: '✅ 沉降为表 / 技能 / 页面，可寻址' },
      { dimension: '界面', them: '终端（TUI）', biu: '✅ 页面本身也是数据，可直接编辑与复用' },
      { dimension: '多 agent', them: '✅ 支持编排', biu: '✅ 任务看板当总线，依赖成图' },
      { dimension: '模型选择', them: '以 DeepSeek 为主，可接入其他', biu: '✅ 模型可配，不绑定厂商' },
      { dimension: '编码专精', them: '✅ 深，专注真实工程任务', biu: '⚠️ 非专精领域' },
      { dimension: '生态与成熟度', them: '✅ 开场即对标 Codex / Claude Code', biu: '⚠️ 插件生态刚起步' },
      { dimension: '形态', them: '终端 agent 运行时', biu: '内核' },
    ],
  },
  {
    slug: 'vs-pi',
    title: 'BIU vs Pi',
    category: '编码 Harness',
    opening: 'Pi 把 harness 拆成可组装的部件，核心只留四个工具 —— 极简、可嵌入，这点和 BIU 的取向很像。差别在落点：Pi 组装的是一个终端 agent，BIU 组装的是它自己的界面和数据。',
    useWhen: '自己组装编码 agent、要极简可嵌入的运行时、偏好 MIT 开源与可改',
    biuWhen: '组装结果要同时是界面和数据、智能体要能改自身所处的系统',
    columns: ['Pi', 'BIU'],
    rows: [
      { dimension: '核心主张', them: '极简核心，可组装', biu: '极简内核，数据即扩展点' },
      { dimension: '可扩展性', them: '✅ 分层架构：模型层 / 核心层 / 终端层', biu: '✅ 插件注册表（sandbox → pack → mount）' },
      { dimension: '扩展的载体', them: 'npm 包 / extensions / skills', biu: '页面里的一条插件声明，或一个插件包' },
      { dimension: '扩展谁来做', them: '⚠️ 写 TypeScript 的开发者', biu: '✅ 人和智能体同一套 db_*' },
      { dimension: '基础工具数', them: '刻意极简（4 个）', biu: '⚠️ db_* 一族，能力面更宽但不如它精简' },
      { dimension: '环境是什么', them: '本机文件系统 + 终端', biu: '/<table>/<id>，文件只是其中一类' },
      { dimension: '产出落在哪', them: '⚠️ 项目目录与会话', biu: '✅ 沉降为表 / 技能 / 页面，可寻址' },
      { dimension: '界面', them: '终端（TUI），可复用组件', biu: '✅ 界面是数据，可被读写、复制、分享' },
      { dimension: '多 agent', them: '⚠️ 单 agent loop，编排层较弱', biu: '✅ 任务看板当总线，依赖成图' },
      { dimension: '嵌入到别处', them: '✅ 强，设计目标就是可嵌入', biu: '⚠️ 以内核为中心，嵌入要适配' },
      { dimension: '成熟度', them: '✅ 有清晰架构与文档', biu: '⚠️ 插件生态刚起步' },
      { dimension: '形态', them: 'agent 框架', biu: '内核' },
    ],
  },
  {
    slug: 'vs-chatgpt',
    title: 'BIU vs ChatGPT',
    category: '通用助手',
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
    category: '通用助手',
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
    category: '文档管理',
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
  { name: '文档管理', slugs: ['vs-office', 'vs-obsidian', 'vs-notion'] },
  { name: '应用搭建', slugs: ['vs-airtable', 'vs-retool', 'vs-supabase'] },
  { name: 'IDE 助手', slugs: ['vs-cursor'] },
  { name: '编码 Harness', slugs: ['vs-dsh', 'vs-pi'] },
  { name: '通用助手', slugs: ['vs-chatgpt', 'vs-claude'] },
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
    description: '和每个领域最好的产品比：Linux、Kubernetes、Office、Notion、Airtable、Retool、Supabase、Cursor、DeepSeek Harness、Pi、ChatGPT、Claude、Obsidian。',
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
