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

export const BLOG_AUTHOR = { name: 'The BIU Team', email: '348876414@qq.com' }

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
    title: 'All in One Is Not About Packing Features into One App',
    summary: 'Most “all-in-one” products keep adding features to a single app. BIU takes another path: putting software inside pages and using pages to compose software.',
    date: '2026-10-14',
    sections: [
      {
        body: [
          'When people hear All in One, they usually imagine an app with everything: documents, spreadsheets, boards, calendars, and an AI assistant, all under one account. The problem is that every feature was chosen and built in advance by the vendor. If the seventh tool you need is missing, you must open yet another app and move data back and forth.',
          'For BIU, All in One does not mean “every feature in one app.” It means “any software can live on the same page.”',
        ],
      },
      {
        heading: 'Blocks are software',
        body: [
          'In BIU, every block on a page is a live component rendered by a plugin: a table, an Excalidraw canvas, an executable coding challenge, or a video editor. Block types are not hard-coded by the platform; installing a plugin adds a new type.',
          'The format is simple: one declaration and one piece of data:',
          { code: ':::pageBlock {kind=algorithm plugin=page-algorithm}\n{ "title": "1. Two Sum", "lang": "python" }\n:::' },
          'kind and plugin identify what renders the block; the JSON that follows is its data. A person can write it, and so can an agent.',
        ],
      },
      {
        heading: 'Pages compose software',
        body: [
          'A page can contain any number of blocks, all reading and writing the same data. Page properties—title, tags, and any fields you need—form the shared runtime environment for those plugins. A page is no longer merely a document, but an entire service: a lesson, a project, an experiment, or a client deliverable.',
          { image: '/site/demo-allinone.webp', alt: 'An algorithm interview coaching page with a header, Excalidraw canvas, coding challenge card, and code runner on one page', caption: 'One algorithm interview coaching page: the header, canvas, coding challenge, code runner, and offer comparison are each plugins.' },
          'This is also our biggest difference from Notion. Notion established the block model as a standard, but its block types are fixed, and an embedded webpage is only an iframe that cannot read workspace data. BIU borrows the block model while handing block types over to plugins.',
        ],
      },
      {
        heading: 'Share a working page of software',
        body: [
          'Because blocks come from plugins and plugins are code, BIU packages the page body, attachments, and plugin source together when a page is shared. Recipients can use it immediately, without reinstalling tools or rebuilding the environment.',
          { image: '/site/shot-share.webp', alt: 'The whiteboard and coding challenge remain usable on a shared page', caption: 'Recipients opening the shared link see more than a screenshot: the whiteboard and coding challenge still work.' },
          'This is what we mean by “compose software with pages to serve clients”: what you create is not an instruction sheet, but a page of software ready to deliver.',
        ],
      },
    ],
  },
  {
    slug: 'saas-to-paas',
    title: 'Software as a Service and Page as a Service: From SaaS to PaaS',
    summary: 'SaaS turned software into a service, but the unit of service remains an app defined by its vendor. Looking at creation, storage, distribution, composition, and derivation shows why the page should be that unit.',
    date: '2026-10-14',
    sections: [
      {
        body: [
          'First, a naming clarification. In the industry, PaaS usually means Platform as a Service. This article uses a different PaaS: Page as a Service.',
          'SaaS made software usable without installation: open a browser and begin. It solved how software reaches users, but left another problem behind. When users employ those products to serve their own clients, the service is fragmented.',
          'Consider an algorithm interview coach who writes lessons in an online document, draws ideas in Excalidraw, assigns problems in LeetCode, and compares offers in a spreadsheet. The coach delivers one service, but it is scattered across four products. Students need four accounts, and their data sits with four vendors.',
          'In BIU, the same service is one page: header, canvas, coding challenges, code execution, and offer comparison together, each as a plugin. The five perspectives below explain why the unit of service should be a page rather than an app.',
          { image: '/site/demo-allinone.webp', alt: 'An algorithm interview coaching page with a header, Excalidraw canvas, coding challenge card, and code runner on one page', caption: 'One algorithm interview coaching page is the complete service delivered to a student.' },
        ],
      },
      {
        heading: 'Create: who builds the service',
        body: [
          'In SaaS, the vendor builds the service. Product managers define its boundaries, every customer uses the same interface, and configuration is the only source of variation. If a feature is missing, you either request it and wait or buy another product.',
          'In PaaS, the person serving the client builds the service. Page blocks come from plugins; when a type is missing, an agent can write it. Creating a page of service means writing a declaration, not assembling an interface:',
          { code: ':::pageBlock {kind=algorithm plugin=page-algorithm}\n{ "title": "1. Two Sum", "lang": "python" }\n:::' },
          'The block declares “what,” while the page declares “how it is arranged” and “in what environment.” The builder shifts from the software vendor to the service provider.',
        ],
      },
      {
        heading: 'Store: where the data lives',
        body: [
          'In SaaS, data is locked in each vendor’s database. One service is split across N products, and vendors decide whether and how it can be exported. To view lesson problems alongside practice records, you must first move them into one place.',
          'In PaaS, every block on a page stores its data in the same workspace as structured tables. Page properties are the plugins’ shared environment; the canvas, coding challenges, and comparison table read the same data. The desktop app stores it on your own computer, and people and agents read and write the same copy.',
          'Data moves from many vendors into pages under your own control.',
        ],
      },
      {
        heading: 'Distribute: how it reaches clients',
        body: [
          'SaaS distributes accounts. Clients register, receive permissions, and learn an interface, repeating the process for every product. Providers must verify each permission: can this student see the document, and can they edit the table?',
          'PaaS distributes links. When a page is shared, its body, attachments, and plugin source are packaged together. Recipients open it and can immediately interact with the canvas and coding challenges. The page itself is the isolation boundary: one page per student or per class.',
          { image: '/site/shot-share.webp', alt: 'The whiteboard and coding challenge remain usable on a shared page', caption: 'Opening the link gives the recipient a working page of software, not a screenshot.' },
          'The deliverable changes from a bundle of accounts to one link.',
        ],
      },
      {
        heading: 'Compose: how multiple programs work together',
        body: [
          'SaaS products connect through glue such as APIs and automation tools, or are embedded in iframes. Embedded products cannot read one another’s data; composing N SaaS products means N integrations, and any vendor interface change can break the chain.',
          'In PaaS, blocks on the same page naturally read and write the same data and environment. Pages, tasks, plugins, and sessions all use the same operations, differing only by path:',
          { code: 'db_list   /tasks\ndb_read   /pages/<id>\ndb_update /page-blocks/<pageId>::<blockId>' },
          'Composition stops being an integration project and becomes placing blocks on the same page.',
        ],
      },
      {
        heading: 'Derive: how one service grows into more',
        body: [
          'In SaaS, copying a service for a new client means opening a new tenant and configuring it again. You cannot fork the vendor’s product, and your improvements do not accumulate.',
          'In PaaS, copying a page and changing a few properties creates the next student’s service. A plugin has one codebase, but reads different properties on different pages and behaves accordingly. Recipients of shared pages can also adapt them into their own versions.',
          'As pages multiply, instances of the same plugin across them are collected as components and structured into tables by type. Good results become new pages and skills—the starting point for the next round. Agents can read old pages and derive new ones. A service changes from a one-off deliverable into a recipe that continually reproduces.',
        ],
      },
      {
        heading: 'SaaS will not disappear; it will recede into the page',
        body: [
          'This does not mean SaaS will be replaced. More likely, it will recede into the page as one of its blocks: any service can sit behind a plugin, while the page composes those services and delivers them to the client.',
          'SaaS made software available to everyone; PaaS aims to let everyone use software to serve others. Creation belongs to the provider, storage to the user, distribution is one link, composition is native, and derivation has no ceiling. That is what we mean by moving from SaaS to PaaS.',
        ],
      },
    ],
  },
  {
    slug: 'page-is-the-boundary',
    title: 'The Page Is the Only Bounded Unit',
    summary: 'The same plugin behaves differently on two pages while sharing one codebase. Page properties form the plugin environment, giving BIU native page-level multitenancy.',
    date: '2026-10-14',
    sections: [
      {
        body: [
          'In BIU, a block (Component) declares “what it is,” but the page decides where it goes, in what order, and alongside what. The page is the only bounded unit in the system, with four layers of boundaries.',
        ],
      },
      {
        heading: 'Four layers of boundaries',
        body: [
          'Logic: a block ID is “page ID::block ID,” providing a natural namespace so identically named blocks on different pages never collide.',
          'Organization: order, layout, and context all belong to the page—a page is an experiment, a lesson, or a project.',
          'Delivery: dependencies are resolved per page when sharing, and plugin source travels with it.',
          'Environment: the page provides variables to its plugins, so the same plugin behaves differently on different pages.',
        ],
      },
      {
        heading: 'Page properties are the environment',
        body: [
          'We did not add a separate env field. The page’s existing properties are themselves the environment read by plugins:',
          { diagram: 'page-env', caption: 'The same plugin on two pages reads two sets of properties and exhibits two behaviors.' },
          'Scope is determined by the page boundary, not by a plugin’s own configuration. One plugin can therefore serve many clients and classes at once while keeping them isolated.',
        ],
      },
      {
        heading: 'Components are finite atoms; pages are infinite recipes',
        body: [
          'Blocks declare “what,” while pages declare “how to arrange it” and “in what environment.” The system resolves both layers into a real interface. Building a page of service therefore means writing a declaration rather than assembling a UI—and it is just as easy for an agent.',
        ],
      },
    ],
  },
  {
    slug: 'fewer-atoms',
    title: 'Fewer Atoms, More Combinations',
    summary: 'Systems often create a “task” mechanism for tasks and a “document” mechanism for documents, adding concepts with every feature. BIU uses only six atoms and one set of operations; adding a domain is another composition.',
    date: '2026-10-14',
    sections: [
      {
        body: [
          'Many systems map concepts one-to-one with features: tasks get a task mechanism, documents get a document mechanism. N features create N interfaces, and every caller—the UI, agents, and scripts—must adapt N times.',
        ],
      },
      {
        heading: 'Six atoms',
        body: [
          'BIU has a very small set of atoms:',
          { diagram: 'atoms', caption: 'Six atoms combine into tasks, pages, plugins, sessions, and more. Adding a domain is simply another composition.' },
          'Tasks, pages, skills, plugins, collections, components, sessions, and events are all composed from these six atoms. Each table also uses a blurb to explain what it is and what it can do, so an agent does not need to know its shape in advance.',
        ],
      },
      {
        heading: 'One set of operations',
        body: [
          'Every domain is read and written in the same way; only the path changes:',
          { code: 'db_list   /tasks\ndb_read   /pages/<id>\ndb_update /page-blocks/<pageId>::<blockId>\ndb_create /plugins' },
          'Adding a domain therefore requires no new API. Register a table, and it becomes readable, writable, and queryable like every existing table.',
        ],
      },
      {
        heading: 'This does not mean “the system is simple”',
        body: [
          'The concepts that matter still have to be learned. The point is different: the number of concepts and usage patterns does not grow with the number of features. That is also why plugins can themselves be data in a table—people and agents can create new capabilities through the same operations.',
        ],
      },
    ],
  },
  {
    slug: 'accumulate',
    title: 'Make Every Round of Work Last',
    summary: 'Good results from ordinary agents sink into chat history after use. In BIU, results become pages, blocks, skills, and tables—a shared body of work for people and agents.',
    date: '2026-10-14',
    sections: [
      {
        body: [
          'Anyone who has used an AI assistant knows the experience: last week it made an excellent comparison table; this week, continuing from it means digging through chat history until you finally ask it to generate the table again.',
        ],
      },
      {
        heading: 'Context without guesswork',
        body: [
          'In BIU, people and agents read and write the same workspace. Whatever you change on a page is available to the agent through the same operations; whatever it changes appears immediately in the interface. You do not have to restate the background every time—it reads where you left off.',
          { image: '/site/shot-agent.webp', alt: 'Typing @ in the conversation box lists pages and tasks from the workspace', caption: 'Type @ to bring pages and tasks directly into the context for this round.' },
        ],
      },
      {
        heading: 'Reuse instead of regeneration',
        body: [
          'Asking most agents to build an interface means generating hundreds of lines of HTML and JS, then doing it again next time. In BIU, an agent writes one block declaration pointing to an existing plugin; everything else is data. One plugin can be reused across many pages, and iterating on a page is roughly equivalent to editing a piece of JSON.',
        ],
      },
      {
        heading: 'Accumulation is an ordinary write',
        body: [
          'Because everything is data, a good result can directly become a page, block, skill, or table without any extra mechanism. The system grows round by round instead of resetting to zero.',
          'The same applies to people: knowledge you give an agent today remains available tomorrow, and you can see exactly where it is stored.',
        ],
      },
    ],
  },
  {
    slug: 'open-and-transparent',
    title: 'Open Source, Free, and Transparent Data',
    summary: 'Why is BIU open source under Apache 2.0? Because a page containing all your software and data should be inspectable and portable.',
    date: '2026-10-14',
    sections: [
      {
        heading: 'Files are a foundation, not a cage',
        body: [
          'BIU is built on SQLite, directories, and logs, but this abstraction does not lock data behind an interface. Page content lives in .biu/biu.sqlite, attachments in .biu/assets, and skill files can genuinely be opened from disk. You can use only BIU’s interfaces or read the disk directly.',
          'Every action is written to an append-only event log, and the interface is merely its projection. When something goes wrong, you can follow the record to understand how the state came to be.',
        ],
      },
      {
        heading: 'Local-first',
        body: [
          'The desktop app stores data on your own computer and works offline. Agents use model keys you configure yourself—DeepSeek, OpenAI, Anthropic, and others—and only the content needed for the current round is sent to the model provider.',
        ],
      },
      {
        heading: 'Why it is free',
        body: [
          'We want more people to compose software with pages rather than encounter a price barrier first. The code is released under Apache 2.0 and may be used commercially, modified, and redistributed; both the desktop app and self-hosting are free. Our official cloud service is still in development, and pricing will be announced when it launches.',
          'Open an issue on GitHub, submit a plugin, or email 348876414@qq.com to tell us what you have composed with pages.',
        ],
      },
    ],
  },
  {
    slug: 'build-software',
    title: 'Build: Software and Data Grow Together',
    summary: 'Traditional software must be finished before service can begin. BIU starts service with the first line of data, letting software grow alongside it. With global software spending at $1.47 trillion, changing how we build changes the production function of the entire industry.',
    date: '2026-10-14',
    sections: [
      {
        body: [
          'This is the first article in our series on changing how the world builds, stores, composes, distributes, and derives software. Each article examines one verb from two perspectives: what it means for agent context, and the economic scale behind it.',
          'Software engineering follows a default timeline: requirements first, then development, testing, and launch; only afterward do users and data arrive. Software is the container, and data is something added later. Until the container is finished, service cannot begin.',
        ],
      },
      {
        heading: 'Software first, data later',
        body: [
          'The cost of this timeline has been measured for decades. After tracking software projects for thirty years, the Standish Group reported in 2020 that only 31% were delivered on time and on budget with satisfactory results; 50% were late, over budget, or reduced in scope, and 19% failed [3]. In its first 1994 report, troubled projects averaged 189% over their original budgets and 222% over their original schedules [4].',
          'The deeper problem is that requirements truly emerge only during service. An algorithm coach may discover in week three that students need a table summarizing mistakes by difficulty. By then the software is fixed, and the new requirement must wait for another release. Software is always chasing the service.',
        ],
      },
      {
        heading: 'Data first, software alongside it',
        body: [
          'BIU makes this timeline parallel. Service begins with the first line of data: a lesson page, a problem, or a student list can be used by students that same day. The page is both data and the place where software runs.',
          'When a new capability is needed, software joins while the service is underway. Every block is a declaration plus data:',
          { code: ':::pageBlock {kind=algorithm plugin=page-algorithm}\n{ "title": "1. Two Sum", "lang": "python" }\n:::' },
          'An agent writes a missing block type as a plugin on the spot, attaches it to the page, and reads the existing data directly. Table fields can be added at any time, immediately giving existing records new structure. A need discovered in week three can be met in week three.',
        ],
      },
      {
        heading: 'Agent context: build against real data',
        body: [
          'In traditional development, engineers work from requirements and test data; when an agent writes code, it often sees only a description and an empty project. It must guess the shape of the data, and nobody knows whether its interface works until real data arrives.',
          'In BIU, real data, fields, and usage records already exist on the page when an agent builds a plugin. Its context is the service’s current state, and the plugin operates on real data the first time it runs.',
          'The output is smaller too. Instead of generating hundreds of lines of UI code each time, the agent writes a declaration pointing to an existing plugin; the rest is data. Smaller output means fewer errors, faster validation, and cleaner context for the next iteration.',
        ],
      },
      {
        heading: 'Economic scale: a trillion-dollar production function',
        body: [
          'Gartner forecasts global software spending of $1.468 trillion in 2026, up 15.5% year over year [1]. That is what enterprises pay annually for “software already built,” excluding the labor cost of software built in-house.',
          'Supply is highly concentrated. SlashData estimates 48.4 million active software developers worldwide [2], while Gartner estimated 1.14 billion knowledge workers in 2023 [5]. There is roughly one person able to build software for every 24 knowledge workers. Most needs never enter the development pipeline.',
          'Agents are changing that ratio. Gartner predicts that 33% of enterprise software applications will include agentic capabilities by 2028, up from less than 1% in 2024 [6]. When building requires only articulating a need, supply expands from 48.4 million people to 1.14 billion, and the method of building software determines how this trillion-dollar market is redistributed.',
        ],
      },
      {
        heading: 'Building becomes part of the service',
        body: [
          'When data and software grow together, building changes from an independent preliminary phase into a continuous part of service. Providers build while serving, and every adjustment is grounded in real data and feedback.',
          'The next article examines storage: when software and data grow together, what structure should preserve them?',
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
    title: 'Store: Unite Structured and Unstructured Content on One Page',
    summary: 'About 90% of newly generated data worldwide is unstructured, and most AI tools still produce files and HTML. BIU pages hold prose and structured blocks together, making every piece of content indexable, queryable, and reusable.',
    date: '2026-10-14',
    sections: [
      {
        body: [
          'This is the second article in the series. The previous article examined building; this one asks how software and data should be structured once they have grown.',
        ],
      },
      {
        heading: 'A flood without structure',
        body: [
          'IDC estimates that the world generated about 201.7 ZB of data in 2025, including roughly 180.7 ZB of unstructured data—nearly 90% [1]. Within enterprises, structured data accounted for less than 12% of newly generated data in 2023 [1].',
          'Today’s AI tools amplify this flood. They excel at generating Markdown documents, HTML pages, and runnable scripts. People can read these outputs, but systems see each as one undifferentiated block of text. Finding “every coding challenge marked hard in the past month” requires rereading every file.',
          'Finding information is itself enormously expensive. McKinsey found that knowledge workers spend about 19% of their time tracking down information needed to complete tasks [2]. As content accumulates, less of it remains usable.',
        ],
      },
      {
        heading: 'Two kinds of content on one page',
        body: [
          'A BIU page carries two kinds of content. Its body contains freely written paragraphs for narrative, explanation, and thought; its blocks are structured data, each with an explicit type and fields suited to problems, tables, comparisons, and records.',
          'The two interweave naturally on one page: coding challenge blocks appear between lesson paragraphs, with structured prompts, languages, and submission records inside. Page properties are structured as well and serve as the environment for every plugin on the page.',
          { diagram: 'page-env', caption: 'Page properties form a structured environment: the same plugin reads two sets of fields on two pages.' },
        ],
      },
      {
        heading: 'Reusable structure',
        body: [
          'The first value of structure is indexing. Everything in a workspace is a table: pages, blocks, tasks, plugins, and sessions. Blocks of the same kind scattered across pages are collected as components and structured into tables by type, ready to filter, sort, and view by any field.',
          'The second is reuse. Define a block structure once and use it repeatedly on any page; write data once and let multiple views, plugins, and agents read it simultaneously. Structure itself becomes a durable asset.',
          'Users choose where it lives: local spaces stay on their computers, while cloud spaces stay on servers they deploy. Wherever the data goes, its structure remains with it.',
        ],
      },
      {
        heading: 'Agent context: retrieve instead of reread',
        body: [
          'With unstructured content, an agent has only two options: place the entire file in context or use vector retrieval to recover similar passages. The first is limited by context length; the second may return irrelevant fragments.',
          'Research from Stanford and other institutions shows that even long-context models become significantly less accurate when key information sits in the middle of a long input; in retrieval-augmented settings, gains from adding more retrieved documents quickly plateau [3]. Giving a model more text is not the same as giving it better context.',
          'In BIU, agents retrieve data structurally: list components of a type, filter records by field, or read one block on one page. They receive exact records, not passages that must be interpreted again. Context is shorter and information more precise.',
        ],
      },
      {
        heading: 'Economic scale: hosting and retrieving data',
        body: [
          'Gartner forecasts roughly $850 billion in worldwide public-cloud end-user spending in 2026, rising to $1.49 trillion in 2029 [4][5]. This is what the world pays to host software and data; SaaS alone reached $299.1 billion in 2025 [4].',
          'Retrieval costs are likewise measured in trillions. With about 1.14 billion knowledge workers worldwide [6], spending roughly 19% of their time finding information [2] equals the full-time labor of more than 200 million people. Giving content inherent structure and precise retrieval frees that time.',
          'How data is stored determines whether it can be understood. Whoever defines the data structure shared by people and AI stands at the gateway to this trillion-dollar market.',
        ],
      },
      {
        heading: 'Make content understandable',
        body: [
          'Uniting structured and unstructured content preserves the freedom to write while making content understandable to systems. People read a complete lesson page; the system sees queryable records.',
          'The next article examines composition: once content has structure and lives in one place, how can multiple programs and agents collaborate on it?',
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
    title: 'Compose: Give AI Precise Context',
    summary: 'Enterprises use 897 applications on average, but only 29% are integrated. BIU brings pages, data, plugins, and conversations into one system, so agents read exactly what the current round needs. Generative AI’s potential annual value of $2.6–4.4 trillion depends on this layer.',
    date: '2026-10-14',
    sections: [
      {
        body: [
          'This is the third article in the series. The first two examined how software is built and data is stored; this one asks what integrating multiple programs into one system means for people and AI.',
        ],
      },
      {
        heading: 'The fragmented software stack',
        body: [
          'MuleSoft’s 2025 survey covered 1,050 enterprise IT leaders: organizations used 897 applications on average, only 29% of which were integrated; 95% of respondents said integration obstructed effective AI adoption [1].',
          'Everyone bears the cost of fragmentation. A Harvard Business Review study tracked 137 employees at three Fortune 500 companies: they switched between applications and websites about 1,200 times per day on average and spent nearly 4 hours each week regaining focus—about 9% of their annual working time [2].',
        ],
      },
      {
        heading: 'Integrated in one system',
        body: [
          'BIU integrates this content in one workspace. Pages, blocks, tasks, plugins, and conversations are all tables using the same operations, with only their paths differing:',
          { code: 'db_list   /tasks\ndb_read   /pages/<id>\ndb_update /page-blocks/<pageId>::<blockId>' },
          'Blocks on the same page read and write the same data and share the same page properties. A comparison-table block can directly read submission records written by a coding-challenge block. Composition needs no additional interface: place blocks on the same page and they begin collaborating.',
          { diagram: 'atoms', caption: 'Six atoms combine into tasks, pages, plugins, sessions, and more. Adding a domain is simply another composition.' },
        ],
      },
      {
        heading: 'Agent context: reference instead of retell',
        body: [
          'In a world of separate applications, work context is scattered across documents, boards, spreadsheets, and chat histories. People connect them from memory; an agent sees only what you paste. Give it too little and it guesses; give it too much and key information is buried in the middle of long text [3].',
          'In BIU, everything is structured data in the same system, so pages, components, and conversations can be referenced directly in the input. The agent reads precisely what you selected, with clear scope and an appropriate amount.',
          { image: '/site/shot-agent.webp', alt: 'Typing @ in the conversation box lists pages and tasks from the workspace', caption: 'Type @ to bring pages and tasks directly into the context for this round.' },
          'The agent’s output lands in the same system as a page, block, table, or skill. People see it immediately in the interface, and the next collaboration continues from it. Context changes from background that must be repeatedly retold into data that can be referenced precisely at any time.',
        ],
      },
      {
        heading: 'Economic scale: the layer that realizes AI’s value',
        body: [
          'McKinsey estimates that generative AI could create $2.6–4.4 trillion in annual economic value across 63 use cases; including its impact when embedded in existing software could roughly double that figure [4]. Realizing this value depends on whether AI receives accurate, complete business context.',
          'Fragmentation also costs trillions. If the world’s roughly 1.14 billion knowledge workers [5] spend about 9% of their time switching applications [2], that equals the full-time labor of more than 100 million people.',
          'The composition layer connects both ends: it removes switching losses and gives AI directly usable context. Whichever layer becomes the shared workspace for people and AI will capture the main value of generative AI.',
        ],
      },
      {
        heading: 'Composition is understanding',
        body: [
          'When software is integrated into one system, composition does two things at once: it lets programs collaborate and lets AI understand the whole of the work. This is what we mean by “defining the medium for the next generation of human–AI collaboration.”',
          'The next article examines distribution: how can a composed service reach others in the simplest possible way?',
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
    title: 'Distribute: One Page Is One Release',
    summary: 'The App Store ecosystem alone facilitated nearly $1.3 trillion in commerce in 2024. BIU makes sharing a page equivalent to releasing software, eliminating packaging, downloading, installation, and store review while precisely controlling visibility through condition-matched permissions.',
    date: '2026-10-14',
    sections: [
      {
        body: [
          'This is the fourth article in the series. The first three examined how software is built, stored, and composed; this one asks how a composed service reaches the people who use it.',
        ],
      },
      {
        heading: 'The long release pipeline',
        body: [
          'Software travels a long road from completion to use: package an installer, upload it to a distribution channel, submit it for app-store review, then ask users to download, install, register, and sign in. Every step has a cost and loses users.',
          'The channels charge as well. The App Store takes a 30% commission on digital goods and services, or 15% from small developers earning no more than $1 million annually [1]. For individuals and small teams, this pipeline is nearly unaffordable, so many services that could be software are ultimately delivered as documents, screenshots, or videos.',
        ],
      },
      {
        heading: 'Sharing a page is publishing',
        body: [
          'In BIU, the page is the unit of distribution. When a page is shared, the system resolves dependencies per page and packages its body, attachments, and plugin source together. Recipients open the link and can keep drawing on the canvas and running coding challenges.',
          { image: '/site/shot-share.webp', alt: 'The whiteboard and coding challenge remain usable on a shared page', caption: 'Opening the link gives the recipient a working page of software.' },
          'The process needs no packaging tool, distribution channel, or review. Write a page, share it, and the recipient can use it.',
        ],
      },
      {
        heading: 'Permissions defined by conditions',
        body: [
          'The easier distribution becomes, the more important permissions are. BIU’s permission model matches two views: a data view describes “which content,” and a member view describes “which people.” Their match determines a person’s role and visibility over that content.',
          'Authorization targets conditions, not lists. A new member automatically enters the “space members” view and receives every permission attached to it; if the member becomes external, those permissions narrow accordingly. Visibility is computed at access time, content can inherit permissions, and each source of authority can be traced step by step.',
          'Share one page with a class and let each student see only their own records—all with one authorization.',
        ],
      },
      {
        heading: 'Agent context: arrives with the page',
        body: [
          'An application distributes an interface while leaving context with the provider. To help, the recipient’s agent must reacquire the background and understand the structure again.',
          'A BIU page carries its context: body, structured blocks, page properties, and plugins arrive together. When the recipient’s agent opens it, it reads the complete, structured service itself. The permission model constrains agents too; their read and write scope exactly matches that of the people they represent.',
        ],
      },
      {
        heading: 'Economic scale: a trillion-dollar distribution channel',
        body: [
          'Research commissioned by Apple found that the App Store ecosystem facilitated nearly $1.3 trillion in transactions and sales in 2024: $131 billion in digital goods and services, $1.014 trillion in physical goods and services, and $150 billion in in-app advertising. Its scale more than doubled in five years [2].',
          'That is only one platform. It shows that platforms controlling software distribution carry trillions of dollars in economic activity.',
          'The page is a new distribution channel: the threshold falls from “become a developer and pass review” to “write a page.” When every service provider can deliver software directly to clients, the distribution landscape will be redrawn.',
        ],
      },
      {
        heading: 'Everyone can publish software',
        body: [
          'When publishing requires only a page and permissions can be expressed precisely, providers no longer need to become software companies before delivering software to clients.',
          'The final article examines derivation: once software has been distributed, how can others continue building the capabilities they need on top of it?',
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
    title: 'Derive: Layer Your Capabilities on Other People’s Software',
    summary: 'Harvard Business School estimates the demand-side value of open-source software at $8.8 trillion. In BIU, agents can reference existing plugins and extend or layer their capabilities; VS Code extensions, DeepSeek harness plugins, and even a GitHub link can be brought in.',
    date: '2026-10-14',
    sections: [
      {
        body: [
          'This is the final article in the series. Building, storing, composing, and distributing describe software’s journey from nothing into other people’s hands. Derivation asks what happens next: how software continues to grow in those hands.',
        ],
      },
      {
        heading: 'The value created by reuse',
        body: [
          'The greatest value in software history comes from reuse. Harvard Business School research estimates that without open-source software, firms using it would spend about $8.8 trillion rewriting it themselves; corporate software spending would be 3.5 times its current level [1].',
          'The material available for derivation is growing rapidly. GitHub’s 2025 report counted more than 180 million developers and 630 million repositories on the platform, including 121 million added in 2025 alone [2]. The VS Code Marketplace has more than 100,000 extensions [3].',
          'Yet most of these capabilities remain locked in their respective ecosystems. VS Code extensions run only in VS Code; turning a GitHub project into a usable part of a workflow requires substantial integration work.',
        ],
      },
      {
        heading: 'Reference, then extend',
        body: [
          'In BIU, plugins are themselves data in workspace tables: they can be read, referenced, and copied. An agent can reference an existing plugin, extend its functionality, or layer several plugins’ capabilities into a new one.',
          'If one teacher has written a coding-challenge plugin, another can ask an agent to reference it and add a view that groups mistakes by concept, producing the version they need. The original author need not participate, and the derived plugin can itself be referenced by others.',
        ],
      },
      {
        heading: 'Cross ecosystem boundaries',
        body: [
          'References are not limited to BIU plugins. An agent can read a VS Code extension, a DeepSeek harness plugin, or even a GitHub repository link, understand its functionality, and bring it into a page as a usable block.',
          'This means the capabilities of the entire open-source world can become material for building services. There is no need to wait for a feature to be ported; simply point the agent to it.',
        ],
      },
      {
        heading: 'Agent context: start from existing software',
        body: [
          'Ask an agent to generate software from scratch and its context is only a description. Ask it to derive software and its context is validated, running code plus the real data that code reads and writes on the page.',
          'A stronger starting point produces a more reliable result. The agent works incrementally: it preserves what the original plugin already gets right and writes only the added layer. Changes are smaller, review is easier, and every link in the derivation chain remains traceable.',
        ],
      },
      {
        heading: 'Economic scale: turn an $8.8 trillion stock into growth',
        body: [
          '$8.8 trillion measures the rewriting cost avoided through open-source reuse [1]. It proves the economic scale of reuse while exposing a gap: almost only developers can capture this value. The research also found that 96% of demand-side value is created by 5% of open-source developers [1].',
          'When agents can reference, modify, and layer this software for users, the beneficiaries of reuse expand from 48.4 million developers to all knowledge workers. Derivation turns a stock of accumulated value into a continuing source of new software.',
        ],
      },
      {
        heading: 'Every piece of software is a starting point',
        body: [
          'Pages can be derived too. Copy a page and change a few properties to create a service for the next client; recipients of shared pages can adapt them into their own versions. Good results settle into components, skills, and new pages—the starting point for the next build.',
          'Building stays synchronized with data; storage combines structure with freedom; composition gives AI precise context; distribution requires only a page; and derivation lets every piece of software grow into the next.',
          'Together, these five verbs describe what we want to do: change how the world builds, stores, composes, distributes, and derives software, defining the medium for the next generation of human–AI collaboration. Marshall McLuhan said, “The medium is the message.” We believe the page will become that medium.',
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
