import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DownloadIcon, GitHubButton, SiteChrome, SiteFaq, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'
import { asset } from './site-base.ts'
import { USE_CASES, ZH_USE_CASES } from './use-cases.tsx'
import { COMPARE_PAGES, ZH_COMPARE_PAGES } from './compare.tsx'
import { BLOG_POSTS, readingMinutes, type BlogPost } from './blog-posts.ts'
import { ZH_BLOG_POSTS } from './zh/blog-posts.ts'
import { BrandMark, useBrandConfig } from './brand-mark.tsx'
import { useSiteLocale, type SiteLocale } from './locale.tsx'

type ProductSurface = {
  id: string
  label: string
  video?: { webm: string; mp4: string }
  image: string
  size: readonly [number, number]
  lead: string
  alt: string
}

type HomeCopy = {
  metaTitle: string
  metaDescription: string
  heroAriaLabel: string
  heroPrefix: string
  heroSuffix: string
  heroSub: string
  heroVerbs: ReadonlyArray<{ word: string; slug: string; plain: string }>
  eyebrow: string
  bandHeading: string
  downloadLabel: string
  demoLabel: string
  demoHeading: string
  demoTabsAria: string
  surfaces: readonly ProductSurface[]
  roleSectionAria: string
  roleLabel: string
  roleHeading: string
  roleLead: string
  chooseIndustryAria: string
  commonBuiltInLabel: string
  builtInAria: string
  exploreRoleDemos: string
  exampleRolesLabel: string
  customPluginsPrefix: string
  pluginWallNote: string
  pluginWallLink: string
  pillarsLabel: string
  pillarsHeadingLines: readonly [string, string]
  pillars: ReadonlyArray<{ title: string; body: string; to: string }>
  learnMore: string
  pillarsNote: string
  compareNotionLink: string
  agentAria: string
  agentLabel: string
  agentHeadingLines: readonly [string, string]
  agentPoints: ReadonlyArray<{ title: string; body: string }>
  spaceLabel: string
  spaceHeadingLines: readonly [string, string]
  localSpaceTitle: string
  localSpaceBody: string
  localSpaceMeta: string
  cloudSpaceTitle: string
  cloudSpaceBody: string
  cloudSpaceMeta: string
  useCasesAria: string
  useCasesLabel: string
  useCasesHeading: string
  useCasesLead: string
  allUseCasesLink: string
  comparesAria: string
  comparesLabel: string
  comparesHeading: string
  comparesLead: string
  compareSpecs: ReadonlyArray<{ verb: string; slug: string; line: string }>
  seeDifferences: string
  allComparisonsLink: string
  ideasAria: string
  ideasLabel: string
  ideasHeading: string
  ideasLead: string
  readMinutes: (mins: number) => string
  readLink: string
  brandTitle: string
  brandBody: string
  exploreBrandLink: string
  allEssaysLink: string
  faqTitle: string
  faq: ReadonlyArray<readonly [string, string]>
  ctaTitle: string
}

const HOME_COPY: Record<SiteLocale, HomeCopy> = {
  en: {
    metaTitle: 'BIU · Compose All Your Software on One Page',
    metaDescription: 'The next software medium for humans and agents: compose full-stack plugins, structured data, and external application slices on one page, then ship with a single link.',
    heroAriaLabel: 'Transform how the world builds, stores, composes, distributes, and derives software',
    heroPrefix: 'Transform how the world',
    heroSuffix: 'software',
    heroSub: 'The next medium for human–AI collaboration',
    heroVerbs: [
      { word: 'build', slug: 'build-software', plain: 'Missing a tool? Ask an agent to write a plugin right inside your page.' },
      { word: 'store', slug: 'store-software', plain: 'Docs, tables, and tool data live together so agents read them directly.' },
      { word: 'compose', slug: 'compose-software', plain: 'Combine whiteboards, code, and video tools on one page tailored to your role.' },
      { word: 'distribute', slug: 'distribute-software', plain: 'Share one link and anyone can use the page immediately—no installs or setup.' },
      { word: 'derive', slug: 'derive-software', plain: 'Fork an existing page or plugin and adapt it into your own tool.' },
    ],
    eyebrow: 'Open Source · Free · All in One',
    bandHeading: 'Compose all your software on one page',
    downloadLabel: 'Download',
    demoLabel: 'Real Interface',
    demoHeading: 'One page, one working toolkit',
    demoTabsAria: 'Product demo',
    surfaces: [
      {
        id: 'page',
        label: 'Pages',
        video: { webm: '/site/demo-allinone.webm', mp4: '/site/demo-allinone.mp4' },
        image: '/site/demo-allinone.webp',
        size: [3840, 2400],
        lead: 'Every block on a BIU page is live, full-stack software—from built-in plugins and agent-authored tools to slices of external systems. All blocks share one underlying state, and sharing one link delivers the complete experience.',
        alt: 'A BIU page for technical interview coaching, with a header, Excalidraw whiteboard, coding challenge cards, a code runner, and an offer comparison matrix',
      },
      {
        id: 'plugins',
        label: 'Plugins',
        image: '/site/shot-plugins.webp',
        size: [3840, 2400],
        lead: 'Plugin backends can run inside a controlled local sandbox or stay in external services and existing SaaS—slicing only the task-specific frontend onto your page and persisting run snapshots. Missing capabilities can be built by an agent directly against live data.',
        alt: 'BIU plugin table with one-click installation and activation for Excalidraw whiteboards, coding challenge cards, code runners, and more',
      },
      {
        id: 'share',
        label: 'Share',
        image: '/site/shot-share.webp',
        size: [3840, 2400],
        lead: 'Plugins travel with the page. When you share a link, the text, attachments, and plugins are bundled together—so whiteboards and coding challenges work right away with zero setup.',
        alt: 'A shared BIU page where whiteboards and coding challenge cards remain fully interactive',
      },
      {
        id: 'component',
        label: 'Components',
        image: '/site/demo-component.webp',
        size: [3840, 2160],
        lead: 'As pages grow, instances of the same tool spread across your workspace. Components bring them back together in structured tables where each one can be filtered and edited on its own.',
        alt: 'BIU components collecting video editing blocks from multiple pages into a table, with one component open in its dedicated editor',
      },
      {
        id: 'data',
        label: 'Data',
        image: '/site/demo-file-system.webp',
        size: [3840, 2160],
        lead: 'Pages, conversations, tasks, and plugins all live in the same workspace with shared filters and views—and you can open them side by side.',
        alt: 'BIU data with conversation and page tables open side by side in the same workspace',
      },
      {
        id: 'reference',
        label: 'References',
        image: '/site/demo-context.webp',
        size: [3840, 2160],
        lead: 'Stop copying and pasting context into chat. Drop pages, conversations, or plugins straight into the prompt as tags, and the agent reads exactly what you picked.',
        alt: 'BIU references with pages, conversations, and plugins added to a prompt as removable tags for an agent',
      },
    ],
    roleSectionAria: 'Role-based plugins',
    roleLabel: 'Industries, Roles & Custom Plugins',
    roleHeading: 'Different industries and roles, tailored plugins on one page',
    roleLead: 'Start with built-in plugins like Excalidraw, code runners, video editing, terminals, and HTML—then let an agent craft the specialized blocks each role needs. Choose an industry to explore its role pages:',
    chooseIndustryAria: 'Choose an industry',
    commonBuiltInLabel: 'Common built-in plugins',
    builtInAria: 'Built-in plugins',
    exploreRoleDemos: 'Explore interactive role page previews →',
    exampleRolesLabel: 'Example roles and custom pages in this industry',
    customPluginsPrefix: 'Custom plugins: ',
    pluginWallNote: 'Even a 2D mini-game can live on a page as a plugin.',
    pluginWallLink: 'See how plugins work →',
    pillarsLabel: 'Why One Page',
    pillarsHeadingLines: ['Not features piled into an app—', 'software composed on a page'],
    pillars: [
      {
        title: 'Shared state and external application slices',
        body: 'Built-in plugins and slices of external SaaS read and write the same page properties—one change converges across the page, and external call results persist directly as structured snapshots.',
        to: '/blog/application-slicing',
      },
      {
        title: 'Freeform prose meets structured tables',
        body: 'Write freely in prose while plugin blocks and page properties stay strictly typed. People read a cohesive page; the workspace automatically indexes matching blocks across pages.',
        to: '/blog/store-software',
      },
      {
        title: 'One page is an isolated boundary and release',
        body: 'The same plugin placed on different pages automatically isolates each page’s data and runtime environment. Share one link to bundle prose, files, and plugin source with dynamic condition permissions.',
        to: '/product#share',
      },
    ],
    learnMore: 'Learn more →',
    pillarsNote: 'Most document tools lock you into fixed block types, and embedded web pages cannot read your data. In BIU, blocks come from plugins anyone can write and compose together.',
    compareNotionLink: 'Compare with Notion →',
    agentAria: 'Agents',
    agentLabel: 'AI-Native by Design',
    agentHeadingLines: ['When software lives on one page,', 'it is AI-native from the start'],
    agentPoints: [
      {
        title: 'Agents operate every tool on the page directly',
        body: 'Conventional apps are black boxes to AI. In BIU, pages, tables, and plugins share one structured layer—reference items with @ so agents read and act on every tool without screenshots or copy-pasting.',
      },
      {
        title: 'Software grows alongside real data',
        body: 'Start delivering from the first line of data instead of waiting months to ship. When new needs emerge mid-workflow, agents build new plugins directly against live page data.',
      },
      {
        title: 'Derive from existing software and compound work',
        body: 'Agents do not rewrite from scratch each time: they extend existing plugins, adapt pages, or pull in open-source repositories, persisting every result as durable pages, tables, and skills.',
      },
    ],
    spaceLabel: 'Data Ownership',
    spaceHeadingLines: ['Local or cloud,', 'you decide'],
    localSpaceTitle: 'Local Space',
    localSpaceBody: 'Pages, tables, and attachments stay directly on your computer and work offline. Only the content you pick for a prompt is sent to your configured model provider.',
    localSpaceMeta: 'Saved locally · Works offline · Bring your own API key',
    cloudSpaceTitle: 'Cloud Space',
    cloudSpaceBody: 'Built for multi-device sync and team collaboration with member permissions. Official cloud hosting is coming soon—you can self-host today.',
    cloudSpaceMeta: 'Multi-device · Permissions · Online collaboration · Coming soon',
    useCasesAria: 'Use cases',
    useCasesLabel: 'Industries & Workflows',
    useCasesHeading: 'Real workflows across industries',
    useCasesLead: 'Each industry includes interactive page previews for multiple roles along with custom plugin setups.',
    allUseCasesLink: 'All industries & use cases →',
    comparesAria: 'Comparisons',
    comparesLabel: 'Why BIU',
    comparesHeading: 'Five stages, five category-defining benchmarks',
    comparesLead: 'Across building, storing, composing, distributing, and deriving software, see how BIU compares with the iconic tools at every layer—including where BIU falls short.',
    compareSpecs: [
      {
        verb: '01 Build',
        slug: 'vs-cursor',
        line: 'Cursor accelerates engineers inside code repos; BIU grows software alongside live business data—expanding builders from developers to a billion knowledge workers.',
      },
      {
        verb: '02 Store',
        slug: 'vs-supabase',
        line: 'Supabase isolates data in a cloud database while Office scatters unstructured files; BIU unites prose, structured blocks, and run snapshots on one auto-indexed page.',
      },
      {
        verb: '03 Compose',
        slug: 'vs-k8s',
        line: 'Kubernetes orchestrates containers with YAML; BIU declaratively composes full-stack plugins and external SaaS slices on one page sharing live state—zero glue code.',
      },
      {
        verb: '04 Distribute',
        slug: 'vs-app-stores',
        line: 'App Store and Google Play require packaging, review queues, and up to a 30% toll; BIU ships runnable software in a single link governed by dynamic condition permissions.',
      },
      {
        verb: '05 Derive',
        slug: 'vs-github',
        line: 'GitHub’s 630M repos sit behind git clone and deployment barriers; BIU lets agents layer incremental capabilities onto working plugins and open source for everyone.',
      },
    ],
    seeDifferences: 'See differences →',
    allComparisonsLink: 'All 16 comparisons →',
    ideasAria: 'Ideas',
    ideasLabel: 'Philosophy',
    ideasHeading: 'Ideas & long-form writing',
    ideasLead: 'Read the complete essays on how software is built, stored, composed, distributed, and derived—and the architecture behind BIU.',
    readMinutes: (mins) => `${mins} min read`,
    readLink: 'Read →',
    brandTitle: 'One circle, two lines, three blocks',
    brandBody: 'The mark spells the name: two small blocks on the upper right form B, the diagonal line is I, and the lower-left semicircle is U.',
    exploreBrandLink: 'Explore brand →',
    allEssaysLink: 'All essays →',
    faqTitle: 'About BIU',
    faq: [
      ['What is BIU?', 'BIU is an open-source, free software medium for human–agent collaboration. Every block on a page is a full-stack plugin sharing live state—running locally in sandboxes or slicing external services—delivered via a single link.'],
      ['How much does it cost?', 'BIU is open source and free for desktop and self-hosting. Agents use your own model API key, billed directly by your chosen provider.'],
      ['Where is my data stored?', 'You choose per workspace: Local Spaces keep everything on your own computer in standard SQLite and files offline; Cloud Spaces support multi-device sync and team permissions (self-host today, official cloud coming soon).'],
      ['Do I need to know how to code?', 'No. Use built-in pages, tables, and ready-made plugins every day. When you need a custom capability or an external API slice, describe the workflow to an agent on the page.'],
    ],
    ctaTitle: 'Start building with BIU',
  },
  zh: {
    metaTitle: 'BIU · 用一个页面，组合所有软件',
    metaDescription: '定义下一代人与 AI 协作的软件媒介：在同一页面组合全栈插件、结构化数据与外部应用切片，人与智能体共享状态，一链完成交付。开源、免费。',
    heroAriaLabel: '改变世界构建、存储、组合、分发、衍生软件的方式',
    heroPrefix: '改变世界',
    heroSuffix: '软件的方式',
    heroSub: '定义下一代人与 AI 协作的媒介',
    heroVerbs: [
      { word: '构建', slug: 'build-software', plain: '缺少特定工具时，由智能体按需编写插件并嵌入页面' },
      { word: '存储', slug: 'store-software', plain: '文档、表格与工具数据统一存储，智能体可直接引用' },
      { word: '组合', slug: 'compose-software', plain: '将画板、代码、剪辑等模块组合于同一页面，适配不同行业与角色' },
      { word: '分发', slug: 'distribute-software', plain: '通过单个链接交付完整页面，接收方打开即可使用，无需配置环境' },
      { word: '衍生', slug: 'derive-software', plain: '基于已有页面与插件持续扩展，沉淀属于自己的软件能力' },
    ],
    eyebrow: '开源 · 免费 · All in One',
    bandHeading: '一个页面，组合所有软件',
    downloadLabel: '下载',
    demoLabel: '真实界面',
    demoHeading: '一页，就是一套能用的工具',
    demoTabsAria: '产品演示',
    surfaces: [
      {
        id: 'page',
        label: '页面',
        video: { webm: '/site/demo-allinone.webm', mp4: '/site/demo-allinone.mp4' },
        image: '/site/demo-allinone.webp',
        size: [3840, 2400],
        lead: '页面中的每一个块都是可运行的全栈软件——既可以是内置插件与智能体现场构建的模块，也可以是对接外部系统的应用切片。同一页内的所有块共享底层数据，一链分享即可完整交付。',
        alt: 'BIU 页面：一份算法面试辅导，刊头、Excalidraw 画板、算法题卡片、代码运行块和 offer 对比矩阵放在同一页',
      },
      {
        id: 'plugins',
        label: '插件',
        image: '/site/shot-plugins.webp',
        size: [3840, 2400],
        lead: '插件的后端既可以运行在本地受控沙箱，也可以留在外部独立服务与既有 SaaS 中，由前端切出当前任务所需的交互层并持久化调用快照；缺的能力还可由智能体基于真实数据现场构建。',
        alt: 'BIU 插件表：Excalidraw 画板、算法题卡片、代码运行块等插件，一键安装、启用',
      },
      {
        id: 'share',
        label: '分享',
        image: '/site/shot-share.webp',
        size: [3840, 2400],
        lead: '分享页面时，正文、附件与所用插件将一并打包。接收方在浏览器中打开链接即可直接操作画板与代码练习，无需额外安装。',
        alt: 'BIU 分享页：对方打开链接，页面里的画板和算法题卡片照样能用',
      },
      {
        id: 'component',
        label: '组件',
        image: '/site/demo-component.webp',
        size: [3840, 2160],
        lead: '当页面数量增加，分散在不同页面中的同类模块（例如多期视频编排块）会自动汇总为结构化表格，支持统一筛选与独立编辑。',
        alt: 'BIU 组件：散落在各个页面里的视频编排块被收集成一张表，同一个组件在专属编辑器里打开',
      },
      {
        id: 'data',
        label: '数据',
        image: '/site/demo-file-system.webp',
        size: [3840, 2160],
        lead: '页面、对话、任务与插件均在同一工作区内统一管理，共用一致的筛选与视图体系，并支持分栏并排查阅。',
        alt: 'BIU 数据：对话表和页面表在同一个工作区里分栏并排打开',
      },
      {
        id: 'reference',
        label: '引用',
        image: '/site/demo-context.webp',
        size: [3840, 2160],
        lead: '需要智能体协助时，无需反复复制粘贴资料。将页面、对话或插件直接添加至输入框，智能体即精准读取所选范围。',
        alt: 'BIU 引用：页面、对话、插件作为可移除的标签放进输入框，交给智能体',
      },
    ],
    roleSectionAria: '按行业与角色定制插件',
    roleLabel: '行业、角色与定制插件',
    roleHeading: '不同行业与角色，组合各自的专属插件',
    roleLead: '工作区内置画板、算法题、代码运行、视频编排、终端与 HTML 等插件；不同行业下的各个角色，均可按需由智能体补充专属插件。选择行业查看内部各角色的页面方案：',
    chooseIndustryAria: '选择行业',
    commonBuiltInLabel: '行业常用内置插件',
    builtInAria: '内置插件',
    exploreRoleDemos: '进入该行业查看各角色仿真页面 Demo →',
    exampleRolesLabel: '该行业下的典型角色与定制页面',
    customPluginsPrefix: '定制插件：',
    pluginWallNote: '甚至连 2D 小游戏亦可作为插件嵌入页面。',
    pluginWallLink: '了解插件机制与定制方式 →',
    pillarsLabel: '为什么是一页',
    pillarsHeadingLines: ['不是把功能堆在一起，', '是让页面装下软件'],
    pillars: [
      {
        title: '跨软件同源联动，支持外部应用切片',
        body: '同一页面内的内置插件与外部系统切片读写同一份页面属性，一处变动全页收敛；外部服务调用结果直接写回页面块作为快照持久化，告别多应用切换与胶水集成。',
        to: '/blog/application-slicing',
      },
      {
        title: '自由正文与结构化数据合一',
        body: '正文保留自由书写的表达力，插件块与页面属性保持严格结构化。人阅读的是完整页面，系统自动把同类块汇聚成可按字段查询的跨页数据表。',
        to: '/blog/store-software',
      },
      {
        title: '一页即独立边界，单链即完成发布',
        body: '同一份插件置于不同页面自动隔离各自的数据与运行环境；分享一个链接即打包正文、附件与插件源码，配合条件权限精确控制可见范围。',
        to: '/product#share',
      },
    ],
    learnMore: '了解更多 →',
    pillarsNote: '普通文档工具能放什么块是平台定死的，嵌进来的网页也读不到你的数据。BIU 的块由插件提供，谁都能写，写好就能和页面里的其他块一起用。',
    compareNotionLink: '看和 Notion 的对比 →',
    agentAria: '智能体',
    agentLabel: '天然 AI 原生',
    agentHeadingLines: ['当软件都在同一页里，', '它们天然就是 AI 原生的'],
    agentPoints: [
      {
        title: '直接读取与操作页面内的每一款软件',
        body: '传统软件对 AI 而言是孤立黑盒。在 BIU 中，页面、表格与插件共享统一结构，智能体通过 @ 精确引用即可直接读写并操作每款软件，无需截图猜测或人工转述。',
      },
      {
        title: '面向真实数据，边服务边生长',
        body: '无需先耗时开发再投入使用。从第一行数据即可开始交付服务；业务推进中出现新需求，智能体可直接基于页面里的真实数据构建新插件并即时生效。',
      },
      {
        title: '基于已有软件持续衍生与沉淀',
        body: '智能体不必每次从零重写代码，可引用已有插件、复用页面乃至引入开源项目做增量叠加；每一轮产出都直接沉淀为页面、表格与技能。',
      },
    ],
    spaceLabel: '数据归你',
    spaceHeadingLines: ['数据放本机还是云端，', '由你决定'],
    localSpaceTitle: '本机空间',
    localSpaceBody: '页面、表格和附件直接存在你自己的电脑上，断网也能用。只有调用 AI 时，当前选中的内容才会发给你配置的模型服务。',
    localSpaceMeta: '本地保存 · 离线可用 · 自带模型密钥',
    cloudSpaceTitle: '云端空间',
    cloudSpaceBody: '需要多设备同步、和团队一起协作时使用。成员、权限和在线协作都在空间里管理。官方云端即将上线，现在可以先部署在自己的服务器上。',
    cloudSpaceMeta: '多设备 · 成员权限 · 在线协作 · 即将上线',
    useCasesAria: '用例',
    useCasesLabel: '行业与用例',
    useCasesHeading: '覆盖不同行业的真实工作流',
    useCasesLead: '每个行业均包含细分角色的仿真页面示例与定制插件方案，点击查看详情。',
    allUseCasesLink: '全部行业与用例 →',
    comparesAria: '差异',
    comparesLabel: '差异',
    comparesHeading: '五个环节，五个坐标级的参照对象',
    comparesLead: '围绕软件的构建、存储、组合、分发与衍生，直面每一层最具代表性的工具与基础设施。完整对照（包括我们尚未做到的部分）均列于对比页。',
    compareSpecs: [
      {
        verb: '01 构建',
        slug: 'vs-cursor',
        line: 'Cursor 加速开发者在代码库里写软件；BIU 让软件面向真实业务数据边服务边生长，把构建者扩展到十亿知识工作者。',
      },
      {
        verb: '02 存储',
        slug: 'vs-supabase',
        line: 'Supabase 把数据留在独立后端数据库，Office 则把内容拆成无结构离散文件；BIU 让正文、结构化插件块与调用快照同存一页，自动跨页成表。',
      },
      {
        verb: '03 组合',
        slug: 'vs-k8s',
        line: 'k8s 用 YAML 编排机器与容器；BIU 在一页里声明式组合全栈插件与外部 SaaS 切片，共享实时状态，无需胶水代码。',
      },
      {
        verb: '04 分发',
        slug: 'vs-app-stores',
        line: 'App Store 与 Google Play 需要打包、审核与最高 30% 抽成；BIU 分享一个链接即发布可运行软件，权限按条件动态计算。',
      },
      {
        verb: '05 衍生',
        slug: 'vs-github',
        line: 'GitHub 的 6.3 亿仓库锁在 git clone 与部署门槛后；BIU 让智能体直接在已有插件与开源项目上做增量叠加，让所有人都能衍生软件。',
      },
    ],
    seeDifferences: '查看差异 →',
    allComparisonsLink: '查看全部 16 项对比 →',
    ideasAria: '想法',
    ideasLabel: '理念',
    ideasHeading: '理念与深度写作',
    ideasLead: '关于软件的构建、存储、组合、分发与衍生，以及从 SaaS 到 PaaS 的完整架构思考，均收录于「理念」专栏。',
    readMinutes: (mins) => `约 ${mins} 分钟读完`,
    readLink: '阅读 →',
    brandTitle: '一个圆、两条线、三个块',
    brandBody: '标记本身就是名字：右上的两个小块是 B，贯穿的斜线是 I，左下的半圆是 U，三个字母刚好拼成这个圆。',
    exploreBrandLink: '看品牌 →',
    allEssaysLink: '全部文章 →',
    faqTitle: '常见问题',
    faq: [
      ['BIU 是什么？', 'BIU 是一款开源、免费的下一代人机协作软件媒介。页面中的每一块都是共享数据的全栈插件——既可运行本地沙箱，也可作为外部系统的应用切片，人与智能体同页协作，一链交付使用。'],
      ['如何收费？', 'BIU 开源且免费，桌面端与自部署版本均不收费。智能体功能使用您自行配置的模型密钥，费用由所选模型服务商收取。'],
      ['数据存放在哪里？', '创建空间时由您自主选择：本机空间将数据保存于个人电脑（标准 SQLite 与原始文件）并支持离线使用；云端空间面向多设备同步与团队协作（支持自部署，官方云端即将上线）。'],
      ['需要具备编程基础吗？', '日常使用内置页面、表格与现成插件无需编程。若需要特定业务能力或外部接口切片，直接描述流程即可由智能体基于当前页面真实数据现场构建。'],
    ],
    ctaTitle: '开始使用 BIU',
  },
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined
    if (!query) return
    setReduced(query.matches)
    const onChange = () => setReduced(query.matches)
    query.addEventListener?.('change', onChange)
    return () => query.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}

function topHomePosts(posts: BlogPost[]) {
  return posts
    .map((post, index) => ({ post, index }))
    .sort((a, b) => (a.post.date < b.post.date ? 1 : a.post.date > b.post.date ? -1 : a.index - b.index))
    .slice(0, 2)
    .map(({ post }) => post)
}

export function MarketingHome({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  const { locale } = useSiteLocale()
  const copy = HOME_COPY[locale]
  const useCases = locale === 'zh' ? ZH_USE_CASES : USE_CASES
  const comparePages = locale === 'zh' ? ZH_COMPARE_PAGES : COMPARE_PAGES
  const homePosts = topHomePosts(locale === 'zh' ? ZH_BLOG_POSTS : BLOG_POSTS)
  const homeCompares = copy.compareSpecs.flatMap((spec) => {
    const page = comparePages.find((item) => item.slug === spec.slug)
    return page ? [{ page, verb: spec.verb, line: spec.line }] : []
  })

  usePageMeta({
    title: copy.metaTitle,
    description: copy.metaDescription,
    path: '/',
  })
  const [activeSurface, setActiveSurface] = useState(0)
  const [activeVerb, setActiveVerb] = useState(0)
  const [activeRole, setActiveRole] = useState(0)
  const surface = copy.surfaces[activeSurface]!
  const roleScene = useCases[activeRole]!
  const reducedMotion = usePrefersReducedMotion()
  const brand = useBrandConfig()

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-hero">
          <div className="site-hero-copy site-container" data-reveal>
            <h1 aria-label={copy.heroAriaLabel}>
              <span>{copy.heroPrefix}</span>
              <span className="site-hero-verbs">
                {copy.heroVerbs.map((item, index) => (
                  <Link
                    key={item.slug}
                    to={`/blog/${item.slug}`}
                    className={activeVerb === index ? 'is-current' : ''}
                    onMouseEnter={() => setActiveVerb(index)}
                    onFocus={() => setActiveVerb(index)}
                  >
                    {item.word}
                    <sup aria-hidden>{String(index + 1).padStart(2, '0')}</sup>
                  </Link>
                ))}
              </span>
              <span>{copy.heroSuffix}</span>
            </h1>
            <p className="site-hero-sub">{copy.heroSub}</p>
          </div>
          <div className="site-hero-band site-container" data-reveal>
            <div className="site-hero-band-inner">
              <div>
                <p className="site-eyebrow">{copy.eyebrow}</p>
                <h2>{copy.bandHeading}</h2>
              </div>
              <div className="site-cta-actions">
                <Link className="site-cta-primary" to="/download"><DownloadIcon />{copy.downloadLabel}</Link>
                <GitHubButton label="GitHub" />
              </div>
              <img
                className="site-hero-shot"
                src={asset('/site/shot-page.webp')}
                alt=""
                width={1600}
                height={1000}
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </section>

        <section className="site-product-demo" data-reveal>
          <div className="site-demo-heading">
            <p className="site-section-label">{copy.demoLabel}</p>
            <h2>{copy.demoHeading}</h2>
            <div className="site-demo-tabs" role="tablist" aria-label={copy.demoTabsAria}>
              {copy.surfaces.map((item, index) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeSurface === index}
                  className={activeSurface === index ? 'is-active' : ''}
                  key={item.id}
                  onClick={() => setActiveSurface(index)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="site-demo-caption" role="tabpanel" aria-live="polite">
            <p className="site-demo-lead">{surface.lead}</p>
          </div>
          <div className="site-demo-real-frame">
            {surface.video ? (
              <video
                key={surface.id}
                className="site-demo-shot"
                poster={asset(surface.image)}
                aria-label={surface.alt}
                width={surface.size[0]}
                height={surface.size[1]}
                autoPlay={!reducedMotion}
                controls={reducedMotion}
                muted
                loop
                playsInline
                preload="metadata"
              >
                <source src={asset(surface.video.webm)} type="video/webm" />
                <source src={asset(surface.video.mp4)} type="video/mp4" />
              </video>
            ) : (
              <img
                key={surface.id}
                className="site-demo-shot"
                src={asset(surface.image)}
                alt={surface.alt}
                width={surface.size[0]}
                height={surface.size[1]}
                loading="lazy"
                decoding="async"
              />
            )}
          </div>
        </section>

        <section className="site-role-showcase" aria-label={copy.roleSectionAria}>
          <div className="site-role-showcase-heading" data-reveal>
            <p className="site-section-label">{copy.roleLabel}</p>
            <h2>{copy.roleHeading}</h2>
            <p>{copy.roleLead}</p>
            <div className="site-demo-tabs" role="tablist" aria-label={copy.chooseIndustryAria}>
              {useCases.map((item, index) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeRole === index}
                  className={activeRole === index ? 'is-active' : ''}
                  key={item.slug}
                  onClick={() => setActiveRole(index)}
                >
                  {item.title}
                </button>
              ))}
            </div>
          </div>

          <div className="site-role-panel" role="tabpanel" aria-live="polite" data-reveal>
            <div className="site-role-panel-main">
              <span className="site-solution-index">{roleScene.index} · {roleScene.roleLabels.join(' · ')}</span>
              <h3>{roleScene.title}</h3>
              <p className="site-role-panel-summary">{roleScene.summary}</p>
              <div className="site-role-plugin-group">
                <small>{copy.commonBuiltInLabel}</small>
                <ul className="site-block-chips" aria-label={copy.builtInAria}>
                  {roleScene.blocks.map((block) => <li key={block}>{block}</li>)}
                </ul>
              </div>
              <Link className="site-role-panel-link" to={`/use-cases/${roleScene.slug}`}>
                {copy.exploreRoleDemos}
              </Link>
            </div>
            <div className="site-role-panel-plugins">
              <div className="site-role-plugin-group">
                <small>{copy.exampleRolesLabel}</small>
                <div className="site-role-custom-list">
                  {roleScene.roles.map((role) => (
                    <article key={role.id}>
                      <strong>{role.role} · {role.pageTitle}</strong>
                      <p>{role.summary}</p>
                      <small className="site-role-custom-tags">
                        {copy.customPluginsPrefix}{role.customPlugins.map((p) => p.name).join(' · ')}
                      </small>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <p className="site-plugin-wall-note" data-reveal>
            {copy.pluginWallNote}
            <Link to="/product#plugins">{copy.pluginWallLink}</Link>
          </p>
        </section>

        <section className="site-capabilities" aria-label="All in One">
          <div className="site-capabilities-heading" data-reveal>
            <p className="site-section-label">{copy.pillarsLabel}</p>
            <h2>{copy.pillarsHeadingLines[0]}<br />{copy.pillarsHeadingLines[1]}</h2>
          </div>
          <div className="site-capability-grid">
            {copy.pillars.map((item) => (
              <article key={item.title} data-reveal>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <Link to={item.to}>{copy.learnMore}</Link>
              </article>
            ))}
          </div>
          <p className="site-capabilities-note" data-reveal>
            {copy.pillarsNote}
            <Link to="/compare/vs-notion">{copy.compareNotionLink}</Link>
          </p>
        </section>

        <section className="site-agent" aria-label={copy.agentAria}>
          <div className="site-agent-heading" data-reveal>
            <p className="site-section-label">{copy.agentLabel}</p>
            <h2>{copy.agentHeadingLines[0]}<br />{copy.agentHeadingLines[1]}</h2>
          </div>
          <div className="site-agent-grid">
            {copy.agentPoints.map((item) => (
              <article key={item.title} data-reveal>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="site-space-section" id="spaces">
          <div className="site-space-inner site-container">
            <div className="site-space-heading" data-reveal>
              <p className="site-section-label">{copy.spaceLabel}</p>
              <h2>{copy.spaceHeadingLines[0]}<br />{copy.spaceHeadingLines[1]}</h2>
            </div>
            <div className="site-space-options">
              <article data-reveal>
                <span className="site-space-index">01</span>
                <h3>{copy.localSpaceTitle}</h3>
                <p>{copy.localSpaceBody}</p>
                <small>{copy.localSpaceMeta}</small>
              </article>
              <article data-reveal>
                <span className="site-space-index">02</span>
                <h3>{copy.cloudSpaceTitle}</h3>
                <p>{copy.cloudSpaceBody}</p>
                <small>{copy.cloudSpaceMeta}</small>
              </article>
            </div>
          </div>
        </section>

        <section className="site-home-entry" aria-label={copy.useCasesAria}>
          <div className="site-home-entry-heading" data-reveal>
            <p className="site-section-label">{copy.useCasesLabel}</p>
            <h2>{copy.useCasesHeading}</h2>
            <p>{copy.useCasesLead}</p>
          </div>
          <div className="site-scene-grid">
            {useCases.map((useCase) => (
              <Link key={useCase.slug} className="site-scene-row" to={`/use-cases/${useCase.slug}`} data-reveal>
                <span className="site-scene-index">{useCase.index}</span>
                <span className="site-scene-copy">
                  <span className="site-scene-title">
                    <h3>{useCase.title}</h3>
                    <span aria-hidden>→</span>
                  </span>
                  <p>{useCase.summary}</p>
                  <small>{useCase.roleLabels.join(' · ')}</small>
                </span>
              </Link>
            ))}
          </div>
          <p className="site-home-entry-more" data-reveal>
            <Link to="/use-cases">{copy.allUseCasesLink}</Link>
          </p>
        </section>

        <section className="site-home-entry" aria-label={copy.comparesAria}>
          <div className="site-home-entry-heading" data-reveal>
            <p className="site-section-label">{copy.comparesLabel}</p>
            <h2>{copy.comparesHeading}</h2>
            <p>{copy.comparesLead}</p>
          </div>
          <div className="site-home-compare-grid">
            {homeCompares.map(({ page, verb, line }) => (
              <Link key={page.slug} className="site-home-compare-card" to={`/compare/${page.slug}`} data-reveal>
                <small>{verb} · {page.category}</small>
                <h3>{page.title}</h3>
                <p>{line}</p>
                <span>{copy.seeDifferences}</span>
              </Link>
            ))}
          </div>
          <p className="site-home-entry-more" data-reveal>
            <Link to="/compare">{copy.allComparisonsLink}</Link>
          </p>
        </section>

        <section className="site-home-entry" aria-label={copy.ideasAria}>
          <div className="site-home-entry-heading" data-reveal>
            <p className="site-section-label">{copy.ideasLabel}</p>
            <h2>{copy.ideasHeading}</h2>
            <p>{copy.ideasLead}</p>
          </div>
          <div className="site-idea-posts">
            {homePosts.map((post) => (
              <Link key={post.slug} className="site-idea-post" to={`/blog/${post.slug}`} data-reveal>
                <span className="site-idea-meta">
                  <time dateTime={post.date}>{post.date.replace(/-/g, '.')}</time>
                  <span>{copy.readMinutes(readingMinutes(post, locale))}</span>
                </span>
                <h3>{post.title}</h3>
                <p>{post.summary}</p>
                <span className="site-idea-go">{copy.readLink}</span>
              </Link>
            ))}
          </div>
          <div className="site-idea-brand-wrap" data-reveal>
            <Link className="site-idea-brand" to="/brand">
              <BrandMark
                className="site-idea-mark"
                colors={[brand.c0, brand.c1, brand.c2]}
                stroke={brand.stroke}
                strokeWidth={brand.strokeWidth}
                lineWidth={brand.lineWidth}
                background={brand.background}
                showBackground={false}
                circleRatio={brand.circleRatio}
                displayWidth={96}
                title="BIU"
              />
              <span className="site-idea-brand-copy">
                <h3>{copy.brandTitle}</h3>
                <p>{copy.brandBody}</p>
                <span className="site-idea-go">{copy.exploreBrandLink}</span>
              </span>
            </Link>
          </div>
          <p className="site-home-entry-more" data-reveal>
            <Link to="/blog">{copy.allEssaysLink}</Link>
          </p>
        </section>

        <SiteFaq title={copy.faqTitle} items={copy.faq} />

        <SiteFinalCta title={copy.ctaTitle} />
    </SiteChrome>
  )
}
