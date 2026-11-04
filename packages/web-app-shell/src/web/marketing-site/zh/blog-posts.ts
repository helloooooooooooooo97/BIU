/** 段落是字符串；代码块用 { code }，截图用 { image }，示意图用 { diagram }。 */
export type Paragraph =
  | string
  | { code: string }
  | { image: string; alt: string; caption: string }
  | { diagram: 'page-env' | 'atoms'; caption: string }

export type BlogPost = {
  slug: string
  title: string
  summary: string
  date: string
  sections: { heading?: string; body: Paragraph[] }[]
  /** 正文中的 [n] 对应第 n 条。 */
  references?: { title: string; publisher: string; year: string; url: string }[]
}

export const BLOG_AUTHOR = { name: 'BIU 团队', email: '348876414@qq.com' }

/** 中文按每分钟 400 字估算，代码块和图不计。 */
export function readingMinutes(post: BlogPost) {
  const chars = post.sections
    .flatMap((section) => [section.heading ?? '', ...section.body.filter((p): p is string => typeof p === 'string')])
    .join('').length
  return Math.max(1, Math.round(chars / 400))
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'all-in-one',
    title: 'All in One，不是把功能堆进一个应用',
    summary: '多数「一体化」产品是在一个应用里不断加功能。BIU 走的是另一条路：让页面装下软件，用页面去组合软件。',
    date: '2026-10-14',
    sections: [
      {
        body: [
          '说到 All in One，大家通常想到的是一个什么都有的应用：文档、表格、看板、日历、AI 助手，一个账号全包。问题是，这些功能都是厂商预先做好的。你需要的第七种工具它没有，就只能再开一个软件，把数据搬来搬去。',
          'BIU 理解的 All in One 不是「功能都在一个应用里」，而是「任何软件都能放进同一个页面」。',
        ],
      },
      {
        heading: '块就是软件',
        body: [
          '在 BIU 里，页面上的每一块都是一个插件渲染出来的活组件：一张表、一块 Excalidraw 画板、一道能运行的算法题、一个视频剪辑器。块的类型不是平台写死的，装一个插件就多一种块。',
          '写法很简单，一段声明加一段数据：',
          { code: ':::pageBlock {kind=algorithm plugin=page-algorithm}\n{ "title": "1. Two Sum", "lang": "python" }\n:::' },
          'kind 和 plugin 说明谁来渲染，后面的 JSON 是它要的数据。人可以写，智能体也可以写。',
        ],
      },
      {
        heading: '页面把软件组合起来',
        body: [
          '一页里可以放任意多个块，它们读写同一份数据。页面上的属性（标题、标签，以及你需要的任何字段）就是这些插件共同的运行环境。于是一页不再是一份文档，而是一套服务：一节课、一个项目、一次实验、一份交给客户的方案。',
          { image: '/site/demo-allinone.webp', alt: '一份算法面试陪跑页面：刊头、Excalidraw 画板、算法题卡片和代码运行块在同一页', caption: '一页算法面试陪跑：刊头、画板、算法题、代码运行、offer 对比，各是一个插件。' },
          '这也是我们和 Notion 最大的不同。Notion 把块模型做成了标准，但它的块类型是固定的，嵌进来的网页只是一个读不到工作区数据的 iframe。BIU 借了它的块模型，只是把块类型交给了插件。',
        ],
      },
      {
        heading: '分享的是一页能用的软件',
        body: [
          '因为块来自插件，插件是代码，分享页面时 BIU 会把正文、附件和用到的插件源码一起打包。对方打开就能用，不用再装一遍工具、再搭一遍环境。',
          { image: '/site/shot-share.webp', alt: '分享出去的页面里，画板和算法题卡片照样能用', caption: '对方打开分享链接，看到的不是截图，画板和算法题都还能用。' },
          '这就是我们说的「用页面组合软件去服务客户」：你做好的不是一份说明，而是一页能直接交付的软件。',
        ],
      },
    ],
  },
  {
    slug: 'saas-to-paas',
    title: '软件即服务与页面即服务：从 SaaS 到 PaaS',
    summary: 'SaaS 把软件做成了服务，但服务的单位是厂商定义的应用。从创建、存储、分发、组合、衍生五个角度，讲为什么服务的单位应该是页面。',
    date: '2026-10-14',
    sections: [
      {
        body: [
          '先说清楚一个撞名。行业里的 PaaS 通常指 Platform as a Service，平台即服务。这篇说的是另一个 PaaS：Page as a Service，页面即服务。',
          'SaaS 让软件不用再装，打开浏览器就能用。它解决了软件怎么交到用户手里的问题，却留下了另一个问题：用户拿这些软件去服务自己的客户时，服务被拆碎了。',
          '举个例子。一位算法面试陪跑老师，用在线文档写讲义，用 Excalidraw 画思路，用 LeetCode 布置题目，用表格做 offer 对比。他交给学员的是一套服务，可这套服务分散在四个软件里，学员要注册四个账号，数据在四家厂商手里。',
          '同一件事在 BIU 里是一页：刊头、画板、算法题、代码运行、offer 对比放在一起，每一块都是一个插件。下面从五个角度说，为什么服务的单位应该是页面，而不是应用。',
          { image: '/site/demo-allinone.webp', alt: '一份算法面试陪跑页面：刊头、Excalidraw 画板、算法题卡片和代码运行块在同一页', caption: '一页算法面试陪跑，就是交给学员的整套服务。' },
        ],
      },
      {
        heading: '创建：谁来造服务',
        body: [
          'SaaS 里，服务由厂商来造。功能边界由产品经理决定，所有客户用同一套界面，差异只能靠配置项。缺一个功能，要么提需求等排期，要么再买一个软件。',
          'PaaS 里，服务由直接面对客户的人来造。页面上的块来自插件，缺哪一种，就让智能体写一个。做一页服务，是写一份声明，而不是搭一个界面：',
          { code: ':::pageBlock {kind=algorithm plugin=page-algorithm}\n{ "title": "1. Two Sum", "lang": "python" }\n:::' },
          '块声明「要什么」，页面声明「怎么排」和「在什么环境下」。造服务的人，从软件厂商变成了服务者自己。',
        ],
      },
      {
        heading: '存储：数据在哪',
        body: [
          'SaaS 里，数据锁在各家厂商的数据库里。一份服务的数据被拆进 N 个软件，能不能导出、怎么导出，由厂商决定。想把讲义里的题目和练习记录放在一起看，先得把数据搬到同一个地方。',
          'PaaS 里，一页里所有块的数据都在同一个工作区，而且都是结构化的表。页面属性就是这些插件共同的环境，画板、算法题和对比表读的是同一份数据。桌面版把它存在你自己的电脑上，人和智能体读写的也是同一份。',
          '数据从分散在各家厂商，变成以页面为单位、由你自己掌握。',
        ],
      },
      {
        heading: '分发：怎么交到客户手里',
        body: [
          'SaaS 分发的是账号。客户要注册、开权限、学一遍界面，用到几个软件就重复几遍。服务者还得逐个确认：学员能不能看到这份文档，有没有这张表的编辑权限。',
          'PaaS 分发的是链接。分享页面时，正文、附件和用到的插件源码一起打包，对方打开就能用，画板和算法题照样能交互。页面本身就是隔离的单位，一页对应一个学员，或者一个班。',
          { image: '/site/shot-share.webp', alt: '分享出去的页面里，画板和算法题卡片照样能用', caption: '对方打开链接，拿到的是一页能用的软件，不是截图。' },
          '交付物从一堆账号，变成一个链接。',
        ],
      },
      {
        heading: '组合：多个软件怎么一起工作',
        body: [
          'SaaS 之间靠 API、自动化工具这类胶水连起来，或者用 iframe 嵌进来。嵌进来的东西读不到彼此的数据，组合 N 个 SaaS 就是 N 次集成，任何一家改了接口，链路就断。',
          'PaaS 里，同一页的块天然读写同一份数据和环境。无论是页面、任务、插件还是代理，都用同一套操作，只有路径不同：',
          { code: 'db_list   /tasks\ndb_read   /pages/<id>\ndb_update /page-blocks/<pageId>::<blockId>' },
          '组合不再是一个集成项目，而是把块放进同一页。',
        ],
      },
      {
        heading: '衍生：一份服务怎么长出更多服务',
        body: [
          'SaaS 里，给新客户复制一套服务，意味着新开一个租户、重新配置一遍。厂商的产品你没法分叉，你做的改进也留不下来。',
          'PaaS 里，复制一页，改几个页面属性，就是给下一位学员的服务。插件只有一份代码，放进不同页面，读到不同的属性，表现出不同的行为。拿到分享页的人，也可以在它的基础上改出自己的版本。',
          '页面多了，散落在各页的同一种插件会被收集成组件，按类型结构化成表；好的结果会落成新的页面和技能，变成下一次的起点。智能体也能读着旧页面，衍生出新页面。服务从一次性交付，变成可以不断繁殖的配方。',
        ],
      },
      {
        heading: 'SaaS 不会消失，它会退到页面里',
        body: [
          '这不是说 SaaS 会被取代。更可能的是，SaaS 退到页面里，成为其中的一块：一个插件背后可以是任何服务，页面负责把它们组合起来，交到客户手里。',
          'SaaS 让每个人都能用上软件；PaaS 想让每个人都能用软件去服务别人。创建归服务者，存储归用户，分发是一个链接，组合是原生的，衍生没有上限。这就是我们说的从 SaaS 到 PaaS。',
        ],
      },
    ],
  },
  {
    slug: 'page-is-the-boundary',
    title: '页面，是唯一有边界的单位',
    summary: '同一个插件放进两个页面，会表现出两种行为，却只有一份代码。页面属性就是插件的环境，这让 BIU 天然支持页面级的多租户。',
    date: '2026-10-14',
    sections: [
      {
        body: [
          '在 BIU 里，块（Component）声明自己「是什么」，但「放在哪、按什么顺序、和谁一起」由页面决定。页面是整个体系里唯一带边界的单位，它有四层边界。',
        ],
      },
      {
        heading: '四层边界',
        body: [
          '逻辑：块的 id 是「页面 id::块 id」，天然带命名空间，不同页面的同名块不会相撞。',
          '组织：顺序、布局和上下文都属于页面 —— 一页就是一次实验、一节课、一个项目。',
          '交付：分享时以页为单位解析依赖，把插件源码一起带走。',
          '环境：页面为里面的插件提供一组变量，同一份插件在不同页面里表现不同。',
        ],
      },
      {
        heading: '页面属性就是环境',
        body: [
          '我们没有另开一个 env 字段。页面已有的属性，本身就是插件读到的环境：',
          { diagram: 'page-env', caption: '同一个插件挂在两个页面上，读到两组属性，表现出两种行为。' },
          '作用域由页面边界决定，而不是插件自己的配置。所以同一个插件可以同时服务很多个客户、很多个班级，彼此隔离。',
        ],
      },
      {
        heading: '组件是有限的原子，页面是无限的配方',
        body: [
          '块声明「要什么」，页面声明「怎么排」和「什么环境」。系统把这两层声明收敛成真实界面。于是做一页服务，就是写一份声明，而不是搭一个界面 —— 智能体做起来也一样轻松。',
        ],
      },
    ],
  },
  {
    slug: 'fewer-atoms',
    title: '更少的原子，更多的组合',
    summary: '要任务就造「任务」、要文档就造「文档」，功能越多概念越多。BIU 只用六种原子和一套操作，加一个领域只是再组合一次。',
    date: '2026-10-14',
    sections: [
      {
        body: [
          '很多系统的概念和功能是一一对应的：要任务就造一套任务机制，要文档就造一套文档机制。N 个功能，N 套接口，调用方（界面、智能体、脚本）也要适配 N 遍。',
        ],
      },
      {
        heading: '六种原子',
        body: [
          'BIU 的原子集很小：',
          { diagram: 'atoms', caption: '六种原子组合出任务、页面、插件、代理……新增一个领域只是再组合一次。' },
          '任务、页面、技能、插件、标签、组件、代理、事件……都由这六种原子组合而成。每张表还会用 blurb 介绍自己是什么、能做什么，智能体不需要预先知道它长什么样。',
        ],
      },
      {
        heading: '一套操作',
        body: [
          '无论哪个领域，读写方式都一样，只有路径不同：',
          { code: 'db_list   /tasks\ndb_read   /pages/<id>\ndb_update /page-blocks/<pageId>::<blockId>\ndb_create /plugins' },
          '所以新增一个领域不需要再设计一套 API，登记一张表，它就和已有的表一样可读、可写、可查。',
        ],
      },
      {
        heading: '这不是「系统很简单」',
        body: [
          '该学的概念仍然要学。它说的是另一件事：概念和用法的个数，不随功能增长。也正因为如此，插件本身也能是一张表里的数据 —— 人和智能体都能用同一套操作造出新能力。',
        ],
      },
    ],
  },
  {
    slug: 'accumulate',
    title: '让每一轮工作都留下来',
    summary: '普通智能体的好结果用完就沉进聊天记录。在 BIU 里，结果会落成页面、块、技能和表 —— 人和智能体共享同一份积累。',
    date: '2026-10-14',
    sections: [
      {
        body: [
          '用过 AI 助手的人都有这种体验：上周它帮你做了一张很好的对比表，这周想接着用，却要在聊天记录里翻半天，最后干脆让它重新生成一遍。',
        ],
      },
      {
        heading: '上下文不靠猜',
        body: [
          '在 BIU 里，人和智能体读写的是同一个工作区。你在页面上改了什么，智能体用同一套操作就能读到；它改了什么，界面上你立刻就能看到。不用每次重新交代背景 —— 你写到哪，它读到哪。',
          { image: '/site/shot-agent.webp', alt: '代理输入框里输入 @，列出工作区里的页面和任务', caption: '输入 @，页面和任务直接成为这一轮的上下文。' },
        ],
      },
      {
        heading: '复用，而不是重新生成',
        body: [
          '让多数智能体做一个界面，意味着让它写上百行 HTML 和 JS，下次再写一遍。在 BIU 里，它只要写一个块声明，指向已经存在的插件，剩下的只是数据。一份插件可以被很多个页面复用，迭代页面约等于改一段 JSON。',
        ],
      },
      {
        heading: '沉淀是一次普通的写入',
        body: [
          '因为一切都是数据，好的结果可以直接落成一页、一个块、一个技能或一张表，不需要额外的机制。系统因此能一轮轮长起来，而不是每轮归零。',
          '这对人同样成立：今天交给智能体的知识，明天依然可用，而且你能清楚看到它存在哪里。',
        ],
      },
    ],
  },
  {
    slug: 'open-and-transparent',
    title: '开源、免费，数据看得见',
    summary: '为什么 BIU 选择以 Apache 2.0 开源？因为一个装着你全部软件和数据的页面，应该是你能检查、能带走的。',
    date: '2026-10-14',
    sections: [
      {
        heading: '文件是底座，不是牢笼',
        body: [
          'BIU 的底层是 SQLite、目录和日志，但这层抽象没有把数据锁在接口后面。页面正文在 .biu/biu.sqlite，附件在 .biu/assets，技能文件真的能在磁盘上打开。你可以只用 BIU 的接口，也可以直接读盘。',
          '所有动作都写进一条只追加的事件记录，界面只是它的投影。出了问题，可以沿着记录追溯「状态是怎么变成这样的」。',
        ],
      },
      {
        heading: '本机优先',
        body: [
          '桌面版把数据存在你自己的电脑上，离线也能用。智能体用你自己配置的模型密钥（DeepSeek、OpenAI、Anthropic 等），只有这一轮需要的内容会发给模型服务。',
        ],
      },
      {
        heading: '为什么免费',
        body: [
          '我们希望更多人用页面去组合软件，而不是先被价格挡在门外。代码以 Apache 2.0 发布，可以商用、修改和再分发；桌面版和自部署都不收费。官方云端服务还在准备中，上线时会公布价格。',
          '欢迎在 GitHub 上提 issue、提交插件，或者发邮件到 348876414@qq.com 告诉我们你用页面组合出了什么。',
        ],
      },
    ],
  },
  {
    slug: 'build-software',
    title: '构建：软件与数据同时生长',
    summary: '传统软件要先开发完成，才能开始服务。BIU 让服务从第一行数据开始，软件随数据一起长出来。全球软件支出已达 1.47 万亿美元，构建方式的改变，触及的是整个软件产业的生产函数。',
    date: '2026-10-14',
    sections: [
      {
        body: [
          '这是「改变世界构建、存储、组合、分发、衍生软件的方式」系列的第一篇。每篇讨论一个动词，从两个角度展开：它对智能体的上下文意味着什么，以及它背后的经济规模。',
          '软件工程有一条默认的时间线：先有需求，再开发、测试、上线，最后才有人使用、才有数据。软件是容器，数据是后来装进去的东西。容器没有做完，服务就无法开始。',
        ],
      },
      {
        heading: '先有软件，后有数据',
        body: [
          '这条时间线的代价有长期的统计。Standish Group 跟踪软件项目三十年，2020 年的报告显示，只有 31% 的项目按时、按预算交付并取得满意结果，50% 延期、超支或缩减范围，19% 失败 [3]。1994 年的首份报告中，问题项目平均超出原定预算 189%、原定工期 222% [4]。',
          '更深的问题在于，需求只有在服务过程中才会真正浮现。一位老师开设算法陪跑课，到第三周才发现需要一张按难度统计错题的表。此时软件已经定型，新的需求只能排进下一个版本。软件总是在追赶服务。',
        ],
      },
      {
        heading: '数据先行，软件随行',
        body: [
          'BIU 把这条时间线并行了。服务从写下第一行数据开始：一页讲义、一道题目、一份学员名单，当天就可以交给学员使用。页面本身既是数据，也是软件运行的地方。',
          '需要新的能力时，软件在服务进行中加入。页面上的每一块都是一段声明加一段数据：',
          { code: ':::pageBlock {kind=algorithm plugin=page-algorithm}\n{ "title": "1. Two Sum", "lang": "python" }\n:::' },
          '缺少的那种块，由智能体当场编写成插件，挂进页面，直接读取已经存在的数据。表的字段可以随时增加，已有记录随即获得新的结构。第三周出现的需求，第三周就能满足。',
        ],
      },
      {
        heading: 'Agent 的上下文：面向真实数据构建',
        body: [
          '传统开发里，工程师面对的是需求文档和测试数据；智能体写代码时，面对的往往是一段描述和一个空白的项目。它只能猜测数据长什么样，写出来的界面要等真实数据进来才知道是否可用。',
          '在 BIU 里，智能体构建插件时，页面上已经有真实的数据、真实的字段和真实的使用记录。它读到的上下文就是这份服务当下的状态，写出的插件第一次运行就作用在真实数据上。',
          '构建的产出也更小。智能体不必每次生成上百行界面代码，只需写一段声明，指向已有的插件，剩下的是数据。产出越小，出错越少，验证越快，下一轮迭代的上下文也越干净。',
        ],
      },
      {
        heading: '经济规模：一个万亿美元的生产函数',
        body: [
          'Gartner 预测，2026 年全球软件支出达到 1.468 万亿美元，同比增长 15.5% [1]。这是企业每年为「构建好的软件」支付的费用，尚未计入自建软件的人力成本。',
          '供给端却极为集中。SlashData 估算，全球活跃软件开发者约 4840 万人 [2]；Gartner 估算，全球知识工作者在 2023 年达到 11.4 亿人 [5]。平均约 24 位知识工作者，才对应一位能构建软件的人。绝大多数需求，从未进入构建流程。',
          '智能体正在改变这一比例。Gartner 预测，到 2028 年 33% 的企业软件应用将内置智能体能力，2024 年这一比例不到 1% [6]。当构建只需要说清需求，供给端从 4840 万人扩展到 11.4 亿人，构建软件的方式就决定了这一万亿美元市场的下一种分配方式。',
        ],
      },
      {
        heading: '构建成为服务的一部分',
        body: [
          '当数据与软件同步生长，构建就从一个独立的前置阶段，变成服务过程中的持续动作。服务者边服务边构建，每一次调整都基于真实的数据和真实的反馈。',
          '下一篇讨论存储：当软件与数据一起生长，它们应该以什么样的结构留存下来。',
        ],
      },
    ],
    references: [
      { title: 'Gartner Forecasts Worldwide IT Spending to Grow 14.2% in 2026, Totaling $6.37 Trillion', publisher: 'Gartner', year: '2026', url: 'https://www.gartner.com/en/newsroom/press-releases/2026-07-27-gartner-forecasts-worldwide-it-spending-to-grow-14-point-2-percent-in-2026-totaling-6-point-37-trillion' },
      { title: 'Developer Population Sizing: 48.4 million developers worldwide', publisher: 'SlashData', year: '2025', url: 'https://www.slashdata.co/research/developer-population' },
      { title: 'CHAOS 2020: Beyond Infinity', publisher: 'Standish Group', year: '2020', url: 'https://opencommons.org/images/8/8d/Project-success-qrc-standish-group-chaos-report-2020.pdf' },
      { title: 'The CHAOS Report', publisher: 'Standish Group', year: '1994', url: 'https://opencommons.org/images/6/6a/Chaos_report_1994.pdf' },
      { title: 'Gartner Says Worldwide Social Software and Collaboration Revenue to Nearly Double by 2023', publisher: 'Gartner', year: '2019', url: 'https://www.gartner.com/en/newsroom/press-releases/09-24-2019-gartner-says-worldwide-social-software-and-collaboration-revenue-to-nearly-double-by-2023' },
      { title: 'Gartner Predicts Over 40% of Agentic AI Projects Will Be Canceled by End of 2027', publisher: 'Gartner', year: '2025', url: 'https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027' },
    ],
  },
  {
    slug: 'store-software',
    title: '存储：在一页里融合结构化与非结构化',
    summary: '全球每年新生成的数据中约九成是非结构化的，多数 AI 工具产出的仍是文件和 HTML。BIU 的页面同时容纳正文与结构化的块，让每一份内容都能被索引、查询和复用。',
    date: '2026-10-14',
    sections: [
      {
        body: [
          '这是系列的第二篇。上一篇讨论构建，这一篇讨论存储：软件和数据生长出来之后，应该以什么样的结构留存下来。',
        ],
      },
      {
        heading: '无结构的洪流',
        body: [
          'IDC 估算，2025 年全球生成的数据约为 201.7 ZB，其中非结构化数据约 180.7 ZB，占比接近九成 [1]。在企业内部，2023 年结构化数据仅占新生成数据的不到 12% [1]。',
          '今天的 AI 工具进一步放大了这股洪流。它们擅长生成一份 Markdown 文档、一个 HTML 页面、一段可以运行的脚本。这些产出对人可读，对系统却是一整块文本。想找出「过去一个月所有标记为困难的算法题」，只能重新阅读每一份文件。',
          '找信息本身就是一项巨大的成本。麦肯锡的研究显示，知识型员工约 19% 的工作时间用于追踪完成任务所需的信息 [2]。内容越积越多，可用的却越来越少。',
        ],
      },
      {
        heading: '同一页里的两种内容',
        body: [
          'BIU 的页面同时承载两种内容。正文是自由书写的段落，适合叙述、解释和思考；块是结构化的数据，每一块都有明确的类型和字段，适合题目、表格、对比和记录。',
          '两者在同一页里自然交织：讲义的段落之间嵌着算法题块，题块里是结构化的题面、语言和提交记录。页面属性同样是结构化的，并作为环境提供给页面里的所有插件。',
          { diagram: 'page-env', caption: '页面属性是结构化的环境：同一个插件在两页里读到两组字段。' },
        ],
      },
      {
        heading: '可复用的结构',
        body: [
          '结构化的价值首先体现在索引上。工作区里的一切都是表：页面、块、任务、插件、代理。散落在各页的同一种块会被收集成组件，按类型结构化成表，可以按任意字段筛选、排序和建立视图。',
          '其次体现在复用上。一种块的结构定义一次，就能在任意页面里反复使用；一份数据写入一次，就能被多个视图、多个插件和智能体同时读取。结构本身成为可以积累的资产。',
          '存放位置由使用者决定：本机空间存放在自己的电脑上，云端空间存放在自己部署的服务器上。无论放在哪里，结构都随数据一起留存。',
        ],
      },
      {
        heading: 'Agent 的上下文：检索代替通读',
        body: [
          '面对非结构化内容，智能体只有两种办法：把整份文件塞进上下文，或者用向量检索取回几段相似的文本。前者受限于上下文长度，后者可能取回无关的片段。',
          '斯坦福大学等机构的研究表明，即使是长上下文模型，当关键信息位于长输入的中间位置时，回答准确率也会显著下降；在检索增强场景中，增加检索文档带来的提升很快饱和 [3]。把更多文本交给模型，并不等于给了它更好的上下文。',
          '在 BIU 里，智能体可以用结构化的方式取数：列出某一类组件，按字段筛选记录，读取某一页的某一块。它拿到的是精确的记录，而不是一段需要再理解一遍的文本。上下文更短，信息更准。',
        ],
      },
      {
        heading: '经济规模：数据的托管与检索',
        body: [
          'Gartner 预测，2026 年全球公有云终端用户支出约 8500 亿美元，2029 年将达到 1.49 万亿美元 [4][5]。这是全球为托管软件与数据支付的费用，其中 SaaS 一项在 2025 年即达 2991 亿美元 [4]。',
          '检索成本同样以万亿计。全球约 11.4 亿知识工作者 [6]，若约 19% 的工作时间用于寻找信息 [2]，相当于两亿余人的全职工作量。让内容自带结构、可被精确检索，释放的是这部分时间。',
          '存储的方式决定了数据能否被理解。谁定义了人与 AI 共同使用的数据结构，谁就站在这一万亿美元市场的入口。',
        ],
      },
      {
        heading: '让内容可以被理解',
        body: [
          '融合结构化与非结构化，意味着内容既保留了书写的自由，又具备了被系统理解的能力。人读的是一页完整的讲义，系统看到的是一组可以查询的记录。',
          '下一篇讨论组合：当内容有了结构，并存放在同一个地方，多个软件和智能体如何在其上协作。',
        ],
      },
    ],
    references: [
      { title: 'Worldwide Global DataSphere Structured and Unstructured Data Forecast, 2024–2028', publisher: 'IDC', year: '2024', url: 'https://techcontentwave.com/files/1763389937_64b594fd4f7f5607256a.pdf' },
      { title: 'The social economy: Unlocking value and productivity through social technologies', publisher: 'McKinsey Global Institute', year: '2012', url: 'https://www.mckinsey.com/mgi/media-center/social-media-productivity-payoff' },
      { title: 'Lost in the Middle: How Language Models Use Long Contexts', publisher: 'Transactions of the ACL, 12:157–173', year: '2024', url: 'https://aclanthology.org/2024.tacl-1.9/' },
      { title: 'Gartner Forecasts Worldwide Public Cloud End-User Spending to Total $723 Billion in 2025', publisher: 'Gartner', year: '2024', url: 'https://www.gartner.com/en/newsroom/press-releases/2024-11-19-gartner-forecasts-worldwide-public-cloud-end-user-spending-to-total-723-billion-dollars-in-2025' },
      { title: 'Forecast: Public Cloud Services, Worldwide, 2023-2029, 4Q25', publisher: 'Gartner', year: '2025', url: 'https://www.gartner.com/en/documents/7281230' },
      { title: 'Gartner Says Worldwide Social Software and Collaboration Revenue to Nearly Double by 2023', publisher: 'Gartner', year: '2019', url: 'https://www.gartner.com/en/newsroom/press-releases/09-24-2019-gartner-says-worldwide-social-software-and-collaboration-revenue-to-nearly-double-by-2023' },
    ],
  },
  {
    slug: 'compose-software',
    title: '组合：为 AI 提供精准的上下文',
    summary: '企业平均使用 897 款应用，只有 29% 彼此打通。BIU 把页面、数据、插件和代理集成在同一个系统里，智能体读到的正是这一轮需要的内容。生成式 AI 每年 2.6 至 4.4 万亿美元的潜在价值，取决于这一层。',
    date: '2026-10-14',
    sections: [
      {
        body: [
          '这是系列的第三篇。前两篇讨论软件如何构建、数据如何存储，这一篇讨论组合：多个软件集成为一个系统，对人和 AI 意味着什么。',
        ],
      },
      {
        heading: '碎片化的软件栈',
        body: [
          'MuleSoft 2025 年的调查覆盖 1050 位企业 IT 负责人：企业平均使用 897 款应用，其中只有 29% 彼此集成；95% 的受访者认为，集成是有效落地 AI 的障碍 [1]。',
          '碎片化的代价落在每个人身上。《哈佛商业评论》发表的一项研究跟踪了三家财富 500 强企业的 137 名员工：他们平均每天在应用和网站之间切换约 1200 次，每周因此花费近 4 小时重新进入状态，约占全年工作时间的 9% [2]。',
        ],
      },
      {
        heading: '集成在同一个系统里',
        body: [
          'BIU 把这些内容集成在同一个工作区里。页面、块、任务、插件和代理都是表，使用同一套操作，只有路径不同：',
          { code: 'db_list   /tasks\ndb_read   /pages/<id>\ndb_update /page-blocks/<pageId>::<blockId>' },
          '同一页里的块读写同一份数据，共享同一组页面属性。算法题块写入的提交记录，对比表块可以直接读取。组合不需要额外的接口，把块放进同一页，它们就开始协作。',
          { diagram: 'atoms', caption: '六种原子组合出任务、页面、插件、代理……新增一个领域只是再组合一次。' },
        ],
      },
      {
        heading: 'Agent 的上下文：引用代替转述',
        body: [
          '在应用分立的世界里，一份工作的上下文分散在文档、看板、表格和聊天记录里。人可以凭记忆把它们串起来，智能体只能看到你粘贴给它的那一部分。给得太少，它会猜；给得太多，关键信息被淹没在长文本的中间 [3]。',
          '在 BIU 里，因为一切都是结构化的数据，并且位于同一个系统里，你可以把页面、组件或代理直接引用进输入框。智能体读到的就是你选中的这些内容，范围清晰，数量恰当。',
          { image: '/site/shot-agent.webp', alt: '代理输入框里输入 @，列出工作区里的页面和任务', caption: '输入 @，页面和任务直接成为这一轮的上下文。' },
          '智能体写回的结果同样落在这个系统里：一页、一个块、一张表或一个技能。人在界面上立即看到，下一轮协作直接基于它继续。上下文从需要反复转述的背景，变成随时可以精确引用的数据。',
        ],
      },
      {
        heading: '经济规模：AI 价值的兑现层',
        body: [
          '麦肯锡估算，生成式 AI 在 63 个应用场景中每年可创造 2.6 万亿至 4.4 万亿美元的经济价值；若计入嵌入现有软件带来的影响，这一数字约再翻一倍 [4]。这些价值能否兑现，取决于 AI 能否拿到准确、完整的业务上下文。',
          '碎片化的成本同样以万亿计。若全球约 11.4 亿知识工作者 [5] 都有约 9% 的工作时间消耗在应用切换上 [2]，相当于一亿余人的全职工作量。',
          '组合层连接了这两端：它消除切换带来的损耗，也为 AI 提供可以直接使用的上下文。哪一层成为人与 AI 共同的工作台，哪一层就承接生成式 AI 的主要价值。',
        ],
      },
      {
        heading: '组合即理解',
        body: [
          '当软件集成为一个系统，组合同时完成了两件事：让软件彼此协作，也让 AI 理解这份工作的全貌。这正是我们说的「定义下一代人与 AI 协作的媒介」。',
          '下一篇讨论分发：组合好的服务，如何以最简单的方式交到别人手里。',
        ],
      },
    ],
    references: [
      { title: '2025 Connectivity Benchmark Report', publisher: 'MuleSoft / Salesforce', year: '2025', url: 'https://www.salesforce.com/blog/mulesoft-connectivity-benchmark-2025/' },
      { title: 'How Much Time and Energy Do We Waste Toggling Between Applications?', publisher: 'Harvard Business Review', year: '2022', url: 'https://hbr.org/2022/08/how-much-time-and-energy-do-we-waste-toggling-between-applications' },
      { title: 'Lost in the Middle: How Language Models Use Long Contexts', publisher: 'Transactions of the ACL, 12:157–173', year: '2024', url: 'https://aclanthology.org/2024.tacl-1.9/' },
      { title: 'The economic potential of generative AI: The next productivity frontier', publisher: 'McKinsey & Company', year: '2023', url: 'https://www.mckinsey.com/capabilities/tech-and-ai/our-insights/the-economic-potential-of-generative-ai-the-next-productivity-frontier' },
      { title: 'Gartner Says Worldwide Social Software and Collaboration Revenue to Nearly Double by 2023', publisher: 'Gartner', year: '2019', url: 'https://www.gartner.com/en/newsroom/press-releases/09-24-2019-gartner-says-worldwide-social-software-and-collaboration-revenue-to-nearly-double-by-2023' },
    ],
  },
  {
    slug: 'distribute-software',
    title: '分发：一个页面，就是一次发布',
    summary: '仅 App Store 一个生态，2024 年就促成了近 1.3 万亿美元的交易。BIU 让分享一页即是发布一款软件，免去打包、下载、安装与上架，并以条件匹配的权限模型精确控制谁能看到什么。',
    date: '2026-10-14',
    sections: [
      {
        body: [
          '这是系列的第四篇。前三篇讨论软件如何构建、存储与组合，这一篇讨论分发：组合好的服务，如何抵达使用它的人。',
        ],
      },
      {
        heading: '漫长的发布链路',
        body: [
          '一款软件从写完到被人用上，要经过一条漫长的链路：打包成安装包，上传到分发渠道，提交应用商店审核，用户下载、安装、注册、登录。每一个环节都有成本，每一个环节都会流失用户。',
          '渠道本身也在收费。App Store 对数字商品和服务收取 30% 的佣金，年收入不超过 100 万美元的小型开发者为 15% [1]。对个人和小团队来说，这条链路几乎无法负担，大量本可以成为软件的服务，最终只能以文档、截图或视频的形式交付。',
        ],
      },
      {
        heading: '分享一页，即是发布',
        body: [
          '在 BIU 里，分发的单位是页面。分享一页时，系统以页为单位解析依赖，把正文、附件和用到的插件源码一起打包。对方打开链接，画板可以继续画，算法题可以继续运行。',
          { image: '/site/shot-share.webp', alt: '分享出去的页面里，画板和算法题卡片照样能用', caption: '对方打开链接，拿到的是一页能用的软件。' },
          '这一过程不需要打包工具，不需要分发渠道，也不需要审核。写好一页，分享出去，对方即可使用。',
        ],
      },
      {
        heading: '以条件为单位的权限',
        body: [
          '分发得越容易，权限就越重要。BIU 的权限模型由两个视图匹配而成：数据视图描述「哪些内容」，成员视图描述「哪些人」，两者匹配，就得到这个人对这些内容的角色和可见范围。',
          '授权对象是条件，而非名单。新成员加入空间，就自动落入「空间成员」视图，获得挂在该视图上的全部授权；成员转为外部，权限随之收缩。可见性在访问时当场计算，内容之间可以继承权限，并能逐级展开权限的来路。',
          '一页分享给一个班级，每位学员只看到属于自己的那部分记录，这只需要一次授权。',
        ],
      },
      {
        heading: 'Agent 的上下文：随页面一起抵达',
        body: [
          '应用分发出去的是界面，上下文留在了服务者那一端。接收方的智能体若要协助，需要重新获取背景、重新理解结构。',
          'BIU 分发的页面自带上下文：正文、结构化的块、页面属性和插件一起抵达。接收方的智能体打开这一页，读到的就是完整、有结构的服务本身。权限模型同样约束智能体，它能读写的范围，与它所代表的人完全一致。',
        ],
      },
      {
        heading: '经济规模：万亿美元的分发通道',
        body: [
          'Apple 委托的研究显示，2024 年 App Store 生态促成了近 1.3 万亿美元的交易与销售，其中数字商品与服务 1310 亿美元，实体商品与服务 1.014 万亿美元，应用内广告 1500 亿美元；规模在五年内翻了一倍以上 [2]。',
          '这仅仅是一个平台的数据。它说明，控制软件分发通道的平台，承接的是万亿美元量级的经济活动。',
          '页面是一种新的分发通道：发布门槛从「成为开发者并通过审核」降到「写好一页」。当每一位服务者都能直接把软件交到客户手里，分发的版图将被重新划分。',
        ],
      },
      {
        heading: '人人都能发布软件',
        body: [
          '当发布只需要一个页面，并且权限可以精确表达，服务者就无需先成为软件公司，才能把软件交到客户手里。',
          '最后一篇讨论衍生：一款软件被分发出去之后，别人如何在它的基础上，继续构建自己需要的能力。',
        ],
      },
    ],
    references: [
      { title: "Apple's App Store generated nearly $1.3 trillion in sales in 2024", publisher: 'Yahoo Finance', year: '2025', url: 'https://uk.finance.yahoo.com/news/apples-app-store-generated-nearly-13-trillion-in-sales-in-2024-130002805.html' },
      { title: 'The Global App Store and Its Growth', publisher: 'Analysis Group, commissioned by Apple', year: '2025', url: 'https://www.apple.com/newsroom/pdfs/2024-Apple-Global-Ecosystem-Report-June2025.pdf' },
    ],
  },
  {
    slug: 'derive-software',
    title: '衍生：在别人的软件之上，叠加你的能力',
    summary: '哈佛商学院估算，开源软件的需求侧价值高达 8.8 万亿美元。在 BIU 里，智能体可以引用已有的插件，对其功能做扩展与叠加；VS Code 插件、DeepSeek harness 插件，甚至一个 GitHub 链接，都能被引入进来。',
    date: '2026-10-14',
    sections: [
      {
        body: [
          '这是系列的最后一篇。构建、存储、组合、分发描述的是一款软件从无到有、再到他人手中的过程；衍生讨论的是之后发生的事：软件如何在他人手中继续生长。',
        ],
      },
      {
        heading: '复用创造的价值',
        body: [
          '软件史上最大的价值，来自复用。哈佛商学院的研究估算，若开源软件不存在，使用它的企业要自行重写，所需成本约 8.8 万亿美元；企业的软件支出将是现在的 3.5 倍 [1]。',
          '可供衍生的素材也在快速增长。GitHub 2025 年的报告显示，平台上已有超过 1.8 亿名开发者、6.3 亿个仓库，仅 2025 年就新增 1.21 亿个 [2]。VS Code 插件市场的扩展数量超过 10 万个 [3]。',
          '然而，这些能力大多被锁在各自的生态里。VS Code 的插件只能在 VS Code 里运行；一个 GitHub 上的项目，要变成工作流里可用的一部分，中间隔着大量集成工作。',
        ],
      },
      {
        heading: '引用，然后扩展',
        body: [
          '在 BIU 里，插件本身也是工作区表里的数据，可以被读取、引用和复制。智能体可以引用一个已有的插件，在它的基础上扩展功能，或者把几个插件的能力叠加在一起，形成一个新的插件。',
          '一位老师写好了算法题插件，另一位老师可以让智能体引用它，叠加一个按知识点统计错题的视图，变成自己需要的版本。原作者无需参与，衍生出的插件同样可以继续被别人引用。',
        ],
      },
      {
        heading: '跨越生态的边界',
        body: [
          '引用的对象并不局限于 BIU 里的插件。智能体可以读取 VS Code 的插件、DeepSeek harness 的插件，甚至一个 GitHub 仓库的链接，理解其中的功能，再把它引入为页面里可以使用的一块。',
          '这意味着整个开源世界已有的能力，都可以成为构建服务的素材。不需要等待某个功能被移植过来，只需要指给智能体看。',
        ],
      },
      {
        heading: 'Agent 的上下文：以已有的软件为起点',
        body: [
          '让智能体从零生成一款软件，它的上下文只有一段描述。让它衍生一款软件，它的上下文是一份经过验证、正在运行的代码，以及这份代码在页面里读写的真实数据。',
          '起点越扎实，结果越可靠。智能体做的是增量：保留原插件已经正确的部分，只写新增的那一层。改动更小，审查更容易，衍生链条上的每一环都可以追溯来源。',
        ],
      },
      {
        heading: '经济规模：把 8.8 万亿美元的存量变成增量',
        body: [
          '8.8 万亿美元衡量的是开源软件被复用所避免的重写成本 [1]。它证明了复用的经济规模，也揭示了缺口：这些价值几乎只被开发者获取。研究同时发现，96% 的需求侧价值由 5% 的开源开发者创造 [1]。',
          '当智能体可以替使用者引用、改写和叠加这些软件，复用的受益者就从 4840 万名开发者扩展到所有知识工作者。衍生把一笔沉淀的存量，变成可以持续产生新软件的增量。',
        ],
      },
      {
        heading: '每一款软件，都是起点',
        body: [
          '页面同样可以衍生。复制一页，改几个属性，就是给下一位客户的服务；拿到分享页的人，可以在它的基础上改写出自己的版本。好的结果沉淀为组件、技能和新的页面，成为下一次构建的起点。',
          '构建与数据同步，存储兼具结构与自由，组合为 AI 提供精准的上下文，分发只需一个页面，衍生让每一款软件都能长出下一款。',
          '这五个动词合在一起，就是我们想做的事：改变世界构建、存储、组合、分发、衍生软件的方式，定义下一代人与 AI 协作的媒介。麦克卢汉说，媒介即讯息。我们相信，页面会成为这样的媒介。',
        ],
      },
    ],
    references: [
      { title: 'The Value of Open Source Software (Working Paper 24-038)', publisher: 'Harvard Business School', year: '2024', url: 'https://www.hbs.edu/faculty/Pages/item.aspx?num=65230' },
      { title: 'Octoverse 2025: A new developer joins GitHub every second', publisher: 'GitHub', year: '2025', url: 'https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/' },
      { title: 'Celebrating 50 Million Developers: The Journey of Visual Studio and Visual Studio Code', publisher: 'Microsoft', year: '2025', url: 'https://developer.microsoft.com/blog/celebrating-50-million-developers-the-journey-of-visual-studio-and-visual-studio-code/' },
    ],
  },
]
