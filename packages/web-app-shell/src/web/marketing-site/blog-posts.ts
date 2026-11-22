/** 段落是字符串；代码块用 { code }，截图用 { image }，示意图用 { diagram }。 */
export type Paragraph =
  | string
  | { code: string }
  | { image: string; alt: string; caption: string }
  | { diagram: 'page-env' | 'atoms'; caption: string }

export type BlogSeries = 'paradigm' | 'verbs' | 'architecture'

export const BLOG_SERIES: ReadonlyArray<{ id: BlogSeries; title: string; lead: string }> = [
  {
    id: 'paradigm',
    title: 'Product Paradigm',
    lead: 'Why pages are the next medium for human–AI collaboration, and why software inside a page is naturally AI-native.',
  },
  {
    id: 'verbs',
    title: 'Transform how the world builds, stores, composes, distributes, and derives software',
    lead: 'From the overarching thesis to each of the five stages—examining agent context and trillion-dollar shifts across the software lifecycle.',
  },
  {
    id: 'architecture',
    title: 'Architecture & Principles',
    lead: 'Boundaries, primitives, durable accumulation, and open transparency behind the BIU workspace.',
  },
]

export type BlogPost = {
  slug: string
  series: BlogSeries
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
    slug: 'ai-native-software',
    series: 'paradigm',
    title: 'A software medium for humans and agents',
    summary: 'Graphical interfaces were designed strictly for human eyes, making screenshot-driven automation slow and brittle. What a medium built for both people and agents requires, and why BIU chose the page as its container.',
    date: '2026-11-22',
    sections: [
      {
        body: [
          'Watch almost any frontier computer-use demo closely and something quietly counterintuitive stands out.',
          'An application already holds clean structured data in memory—say, a quote with seats: 10, rush: false. To show it to a human, the system flattens that data into a 1920×1080 bitmap. We then screenshot that bitmap, spend thousands of vision tokens asking a frontier model to guess that the input box sits near pixel (842, 319), and simulate mouse clicks to type a new number.',
          'Flattening structured state into pixels only to ask an agent to guess the state back from pixels is not a model-intelligence limitation, and faster GPUs will not eliminate it. It is a structural consequence of a medium designed from day one solely for human eyes.',
          {
            code: 'Legacy GUI + Computer Use:\n  Structured State → Render Pixels → Screenshot → Vision Guess (x,y) → Click → Popup → Retry\n\nA Medium for Humans and Agents:\n  Human UI  ⇄  Shared Structured Page State  ⇄  Agent Read / Write & Backend Actions',
          },
        ],
      },
      {
        heading: 'From command lines to graphical interfaces: always built for one side',
        body: [
          'Across the history of software, interfaces have almost always been built for either machines or humans—never both at once.',
          '1970s Unix command lines were extraordinarily friendly to programs: tools spoke plain text over pipes and composed effortlessly, at the cost of shutting out non-engineers. In 1984, graphical interfaces won everyday users over with windows, icons, and direct manipulation—while sealing application state behind rendered pixels. For the next forty years, commercial software evolved almost exclusively for human eyes.',
          'As a result, most AI integration over the past two years has fallen into three patch-on patterns: bolting a chat sidebar onto an existing app, clicking legacy UIs through screenshots, or gluing five disconnected SaaS tools together with brittle webhooks. Even embedding web pages via iframes inside a document only places separate glass boxes side by side—we tried iframe embeds in our own early prototypes, and within a week it was obvious the agent was blind to everything inside the frame and edits outside never reached inside.',
        ],
      },
      {
        heading: 'What a medium for both humans and agents requires',
        body: [
          'If we stop patching legacy interfaces and design a software medium built simultaneously for people and agents, three hard requirements emerge:',
          'First, one shared state with two native surfaces: an intuitive interactive UI for humans, and structured records plus explicit actions for agents—without routing through screenshots.',
          'Second, real backend capabilities: real work is not a throwaway HTML card. It runs isolated code sandboxes, opens real PTY terminals, probes internal endpoints, scrapes competitor prices on a schedule, or indexes local PDFs without cloud upload.',
          'Third, a shared boundary across distinct categories of software: real jobs span three or four tools—a pricing engine, a contract, and a schedule, or a topology diagram, a probe, and a task board. They belong in one bounded container sharing live state so one edit converges everywhere.',
        ],
      },
      {
        heading: 'Why the container is the page',
        body: [
          'Follow those three requirements to their conclusion and they point to a unit everyone already understands, yet long treated merely as a document: the page.',
          'Take one concrete moment. A client raises onboarding seats from 10 to 18 and requests expedited delivery. Across legacy apps, computer use takes roughly a dozen screenshots, nine simulated clicks, and over forty seconds across spreadsheets, docs, and trackers—easily derailed by a session popup.',
          'On a BIU page, the pricing engine, Statement of Work, and delivery milestones are three full-stack plugins bound to the same page properties. The agent issues one structured write:',
          { code: 'db_update /pages/client-nova { seats: 18, rush: true }' },
          'Within milliseconds, the quote recalculates, contract payment clauses rewrite word-for-word, and milestones adjust. Sensitive actions like locking a contract or sending externally pause at an approval gate and write to an append-only event log. Because plugins themselves are structured records, agents can also author new plugins against live page data or derive from existing ones.',
        ],
      },
      {
        heading: 'Clear boundaries: what this medium is not for',
        body: [
          'No medium fits every kind of software. BIU is not built to replace Photoshop’s GPU pixel pipeline, AAA 3D game engines, or high-frequency banking ledgers—domains that demand raw low-level hardware control rather than collaborative expression. A unified data contract also enforces stricter plugin structure, and our ecosystem is still young compared with twenty-year-old SaaS suites.',
          'Yet across the vast majority of everyday work—engineering triage, coaching, media production, client delivery, merchandising, and diligence—the bottleneck was never frame rate. It was fragmentation across tools and the mismatch between human and machine interfaces.',
          'When software moves into pages with shared structured state, humans and agents finally share the same working medium.',
        ],
      },
    ],
  },
  {
    slug: 'all-in-one',
    series: 'paradigm',
    title: 'All in One Is Not About Packing Features into One App',
    summary: 'Most “all-in-one” products keep adding features to one app until they hit the ceiling of what one vendor can build. BIU lets pages host full-stack software and connect different tools through shared data.',
    date: '2026-10-14',
    sections: [
      {
        body: [
          'When people hear “All in One,” they usually picture a super-app: one vendor packing docs, tables, boards, calendars, whiteboards, and an AI assistant under one login.',
          'That works early on, until every product on that path hits the same structural ceiling: features are always pre-defined and hard-coded by the vendor. The vendor ships six generic modules, and your job happens to need the seventh—a sandboxed code judge with hidden tests, a timeline video editor with live runtime estimates, a SKU margin sandbox, or a pricing engine that rewrites contract clauses word for word.',
          'No single vendor can build and maintain backend runtimes for every niche industry. Generic suites grow bloated while real domain work forces you back into standalone apps, fragmenting data all over again.',
          'BIU’s version of All in One is not packing every feature into one vendor’s app; it is letting any software live as a plugin inside the same page.',
        ],
      },
      {
        heading: 'Blocks are full-stack software, not fixed formats',
        body: [
          'Every block on a BIU page is a live, plugin-powered piece of software—an Excalidraw canvas, a coding challenge backed by an isolated sandbox, a timeline video editor, or a scheduled price monitor.',
          'Block types are never hard-coded by the platform: install a plugin to add a new capability, or ask an agent to build one on demand. Declaring a block on a page takes only a declaration and structured data:',
          { code: ':::editorBlock {kind=algorithm plugin=page-algorithm}\n{ "title": "1. Two Sum", "lang": "python" }\n:::' },
          '`kind` and `plugin` specify who renders the interface and runs the backend, while the JSON holds its structured state—readable and editable by both people and agents.',
        ],
      },
      {
        heading: 'Shared state, not isolated iframe embeds',
        body: [
          'Many document tools let you embed external web pages via iframes, yet those embeds sit behind glass walls: raising seat count from 10 to 18 in a pricing sheet never rewrites the contract beside it, and passing a coding test inside an embedded page never updates the student’s mastery table below.',
          'In BIU, plugins on the same page read and write the same underlying data and page properties. One update immediately converges across the page—when a student passes every test case in the sandbox, mastery metrics and target-offer readiness update on the spot:',
          { image: '/site/demo-allinone.webp', alt: 'An algorithm interview coaching page with a header, Excalidraw canvas, coding challenge card, and code runner on one page', caption: 'One algorithm interview coaching page: the header, canvas, coding challenge, code runner, and offer comparison are each plugins sharing page state.' },
          'Because everything lives in one structured workspace, every tool on the page is also directly operable by agents—no screenshot guessing and no manual copy-pasting.',
        ],
      },
      {
        heading: 'Share a working page of software',
        body: [
          'Conventional all-in-one apps collaborate around workspaces and accounts—delivering a finished service to an external client or student means asking them to register, learn an admin UI, and configure permissions across tools.',
          'In BIU, sharing packages the page body, attachments, and referenced plugin source together. Recipients open one link and immediately draw on the canvas, run code, or adjust pricing:',
          { image: '/site/shot-share.webp', alt: 'The whiteboard and coding challenge remain usable on a shared page', caption: 'Recipients opening the shared link see more than a screenshot: the whiteboard and coding challenge still work.' },
          'That is the real goal of All in One: composing the exact software a job requires on one page, backed by shared data, and delivering it directly to clients, students, and teams.',
        ],
      },
    ],
  },
  {
    slug: 'saas-to-paas',
    series: 'paradigm',
    title: 'Software as a Service and Page as a Service: From SaaS to PaaS',
    summary: 'SaaS lets software vendors rent fixed apps to individuals, but fractures the services that professionals deliver to their own clients. Looking across build, store, compose, distribute, and derive shows why the unit of service should be the page.',
    date: '2026-10-14',
    sections: [
      {
        body: [
          'First, a naming clarification. In cloud computing, PaaS usually means Platform as a Service. This article uses a different PaaS: Page as a Service.',
          'SaaS solved the first layer of delivery: vendors stopped shipping installers, and users opened a browser to rent an app. Yet real work has a second layer of delivery—coaches, consultants, engineers, and operators all use software to serve their own clients, students, or teams. When the unit of service remains a vendor-defined app, that second layer gets fractured.',
          'Consider an algorithm interview coach who writes lessons in a doc app, draws diagrams in a whiteboard tool, assigns problems on a coding site, and compares offers in a spreadsheet. The coach is delivering one coherent service, yet students have to create four accounts, data sits with four vendors, and every review requires jumping across windows.',
          'In BIU, that entire service is one page: header, canvas, coding challenges, code execution, and offer comparison together, each as a plugin sharing page data. The five dimensions below explain why the unit of service should be a page rather than an app.',
          { image: '/site/demo-allinone.webp', alt: 'An algorithm interview coaching page with a header, Excalidraw canvas, coding challenge card, and code runner on one page', caption: 'One algorithm interview coaching page is the complete service delivered to a student.' },
        ],
      },
      {
        heading: 'Build: who defines the service',
        body: [
          'In SaaS, the vendor’s product managers define the service. Every customer uses the same interface, and variation is limited to configuration toggles. When a workflow step is missing, you either wait on a roadmap or buy another app.',
          'In Page as a Service, the person facing the client defines the service. Blocks come from plugins, and missing capabilities can be written or adapted by an agent on the spot. Building a page of service means writing a clear declaration rather than wiring a custom app from scratch:',
          { code: ':::editorBlock {kind=algorithm plugin=page-algorithm}\n{ "title": "1. Two Sum", "lang": "python" }\n:::' },
          'The block declares what capability and data it needs; the page declares how blocks are arranged and in what environment they run. Service creation returns from software vendors to the people delivering the service.',
        ],
      },
      {
        heading: 'Store: who owns the service data',
        body: [
          'In SaaS, one service’s data is split across N vendor databases, and vendors decide whether and how it can be exported. Analyzing lesson notes alongside practice submissions requires painful migration first.',
          'In Page as a Service, every block on a page stores its data in one workspace as structured tables. Page properties form the shared environment for every plugin on the page; on desktop, everything stays on your own machine, and people and agents read and write the exact same copy.',
        ],
      },
      {
        heading: 'Compose: how multiple programs work together',
        body: [
          'SaaS tools rely on webhooks, glue scripts, or isolated iframes. Composing N SaaS products means maintaining N brittle integrations where any vendor schema change breaks the chain.',
          'In Page as a Service, blocks on the same page natively read and write the same state. Pages, tasks, plugins, and sessions all share one set of operations, differing only by path:',
          { code: 'db_list   /tasks\ndb_read   /pages/<id>\ndb_update /editor-blocks/<pageId>::<blockId>' },
          'Composition stops being an integration project and becomes placing blocks on the same page.',
        ],
      },
      {
        heading: 'Distribute: how it reaches clients',
        body: [
          'SaaS distributes accounts. Every additional tool means another sign-up, another UI to learn, and another permission panel for the provider to audit.',
          'Page as a Service distributes one link. Sharing packages the body, attachments, and referenced plugin source together so recipients interact immediately. The page itself is the isolation unit—one page per student, client, or cohort:',
          { image: '/site/shot-share.webp', alt: 'The whiteboard and coding challenge remain usable on a shared page', caption: 'Opening the link gives the recipient a working page of software, not a static screenshot.' },
        ],
      },
      {
        heading: 'Derive: how one service grows into more',
        body: [
          'In SaaS, replicating a service for a new client means provisioning another tenant and repeating setup—you cannot fork the vendor’s product, and workflow refinements rarely compound.',
          'In Page as a Service, duplicating a page and changing a few properties spins up the next client’s service. One plugin codebase behaves differently per page according to page properties, and recipients can adapt shared pages into their own versions. Across pages, instances of the same plugin automatically aggregate into structured tables, and agents can derive new pages from proven ones.',
        ],
      },
      {
        heading: 'SaaS will not disappear; it will recede into the page',
        body: [
          'This does not mean SaaS vanishes. More realistically, specialized SaaS recedes inside the page as one block—a plugin can still connect to payments, storage, or specialized compute, while the page composes those capabilities into a complete service delivered directly to the end user.',
          'SaaS let everyone rent software; Page as a Service lets everyone use software to serve others.',
        ],
      },
    ],
  },
  {
    slug: 'page-is-the-boundary',
    series: 'architecture',
    title: 'The Page Is the Only Bounded Unit',
    summary: 'The same plugin behaves differently on two pages while sharing one codebase. How the page unifies logic, organization, delivery, and environment boundaries—and how data still aggregates across pages without breaking isolation.',
    date: '2026-10-14',
    sections: [
      {
        body: [
          'In most software systems, boundaries are drawn around entire apps or tenant workspaces. Delivering separate portals to twenty clients usually means maintaining twenty permission lists, twenty project silos, or even twenty deployments.',
          'In BIU, we deliberately collapse those boundaries into a single unit: the page. A plugin (Component) declares what it is, how it computes, and how it renders; the page decides where it sits, what data it shares, and what environment it runs in.',
        ],
      },
      {
        heading: 'Four layers of boundaries, unified',
        body: [
          'Logic: every block ID is scoped as “page ID::block ID,” giving each page a natural namespace so identically named quote calculators or code runners on different pages never collide.',
          'Organization: layout order, narrative prose, and shared state all belong to the page—making one page a complete business unit, whether a client portal, an incident runbook, or an interactive lesson.',
          'Delivery: sharing resolves dependencies per page, bundling prose, attachments, and referenced plugin source code so recipients get a working unit in one link.',
          'Environment: the page supplies variables to every plugin inside it, allowing one codebase to behave differently across pages.',
        ],
      },
      {
        heading: 'Page properties are the runtime environment',
        body: [
          'Rather than inventing a separate env panel that drifts away from business data, BIU treats a page’s own structured properties as the runtime environment read by every plugin:',
          {
            code: 'Page A properties: { client: "Nova Mfg",  currency: "CNY", slaDays: 14 }\nPage B properties: { client: "Northwind", currency: "USD", slaDays: 7 }\n\nSame pricing & contract plugin:\n  Reads page.currency and page.slaDays → switches currency, tax rules, and SLA clauses automatically',
          },
          { diagram: 'page-env', caption: 'The same plugin on two pages reads two sets of properties and exhibits two behaviors.' },
          'Because scope is governed by the page boundary rather than hardcoded inside `if (tenant === ...)` branches, a consultant maintains one plugin codebase: on Client A’s page it renders CNY terms, and duplicating it for Client B with three property edits switches it to USD and a shorter schedule—completely isolated.',
        ],
      },
      {
        heading: 'Isolation without silos: aggregating across pages',
        body: [
          'A natural question follows: if every client lives on an isolated page, how does the team view total pipeline across twenty clients or track weak topics across an entire class?',
          'In BIU, the page defines the runtime and delivery boundary, while the workspace automatically indexes page properties and matching plugin blocks into typed tables underneath. In your internal management view, you can filter and aggregate every quote or task across all pages; when you share one page with Client A, packaging and permissions stay strictly scoped to that single page.',
          'Agents benefit from the exact same boundary: modifying or duplicating a client page stays strictly contained to that page without risking side effects across the rest of the workspace.',
        ],
      },
    ],
  },
  {
    slug: 'fewer-atoms',
    series: 'architecture',
    title: 'Fewer Atoms, More Combinations',
    summary: 'Inventing a new data model and API for every module hurts human maintainers and overwhelms agents with dozens of bespoke tools. BIU uses six primitives and one set of operations so complexity stays constant.',
    date: '2026-10-14',
    sections: [
      {
        body: [
          'Conventional software almost always hits the same complexity wall: every new domain invents its own data model, permission rules, filter UI, and API surface. Ten features become ten subsystems.',
          'That bloat slows human maintainers, and it cripples agents even faster—every new subsystem adds dozens of bespoke tool schemas that crowd the context window and degrade tool-calling accuracy.',
        ],
      },
      {
        heading: 'Six primitives across every domain',
        body: [
          'Half a century ago, Unix unified diverse hardware behind “everything is a file” and a tiny set of system calls (open, read, write, ioctl). BIU applies the same discipline to workspace data, distilling the system down to six primitives:',
          { diagram: 'atoms', caption: 'Six atoms combine into tasks, pages, plugins, sessions, and more. Adding a domain is simply another composition.' },
          {
            code: '1. Path    Uniform address for any object, e.g. /tasks/t-102 or /pages/client-nova\n2. Table   Collection of objects of one kind, e.g. /tasks, /pages, /plugins\n3. Record  A single entry with typed fields and timestamps\n4. Schema  Field types and constraints driving forms and validation\n5. Action  Explicit state transitions or backend operations (run sandbox, lock contract)\n6. Blurb   Plain-language self-documentation explaining purpose and usage conventions',
          },
          'The sixth primitive—Blurb—is easy to overlook yet crucial for agents. Conventional databases expose bare column names that force models to guess; in BIU, every table carries plain-language guidance so an agent entering an unfamiliar workspace or inspecting a brand-new plugin table can immediately understand and operate it safely without hardcoded domain logic.',
        ],
      },
      {
        heading: 'One set of operations',
        body: [
          'Every domain—tasks, pages, blocks, plugins, or sessions—is queried, read, updated, created, and acted upon through the exact same operations; only the path changes:',
          { code: 'db_list   /tasks\ndb_read   /pages/<id>\ndb_update /editor-blocks/<pageId>::<blockId>\ndb_create /plugins\ndb_action /pages/<id> { action: "publish" }' },
          'This yields two immediate advantages: registering a new table automatically grants it filterable views, split panes, and rule-based permissions with zero API boilerplate; and agents only need a handful of universal verbs to operate any future software added to the workspace.',
        ],
      },
      {
        heading: 'Bounded complexity as capabilities grow',
        body: [
          'Fewer atoms does not mean a toy system—it means conceptual overhead stops scaling linearly with feature count. Because plugins themselves live as structured records in a table, both people and agents use the same operations to inspect, author, and derive new software.',
        ],
      },
    ],
  },
  {
    slug: 'accumulate',
    series: 'architecture',
    title: 'Make Every Round of Work Last',
    summary: 'Good results from conversational AI sink into chat history after one use, resetting every round to zero. BIU organizes durable outputs into three clear layers—data, plugins, and skills—so people and agents compound on the same baseline.',
    date: '2026-10-14',
    sections: [
      {
        body: [
          'Most conversational AI tools suffer from session amnesia: last week an agent produced a sharp comparison matrix or a handy pricing calculator; this week continuing from it means hunting through buried threads until you give up and ask it to regenerate everything from scratch.',
          'Chat is an ephemeral stream, not a durable workspace. When outputs remain trapped in message bubbles, every round resets to zero instead of compounding.',
        ],
      },
      {
        heading: 'Week 1 to Week 12: two very different curves',
        body: [
          'Consider an e-commerce merchandising lead over three months. In a conventional chat app, Week 1 calculates SKU margins, Week 4 analyzes competitor reviews, and Week 12 drafts creator campaign briefs—each round re-uploading spreadsheets, re-explaining pricing rules, and leaving behind hundreds of disconnected threads.',
          'In BIU, Week 1 creates a live SKU margin page, Week 4 turns review analysis into a reusable skill, and by Week 12 launching a seasonal campaign simply duplicates the proven page where price updates automatically sync into creator briefs.',
        ],
      },
      {
        heading: 'Three layers of accumulation: what belongs where',
        body: [
          'To keep accumulated work genuinely reusable rather than dumping everything into messy folders, BIU separates durable outputs into three layers:',
          'First, business facts settle into pages and structured tables—client assumptions, SKU pricing, interview problems, and review verdicts remain typed and queryable.',
          'Second, interactive and computational capabilities settle into reusable plugins—instead of asking an AI to regenerate hundreds of lines of throwaway HTML each time, a refined margin sandbox or pricing engine becomes a plugin reused across dozens of pages.',
          'Third, judgment standards and workflow rules settle into skills—compliance checklists, incident postmortem norms, or brand copy rules live as readable files that every future round follows automatically.',
        ],
      },
      {
        heading: 'Exact context instead of repeated recaps',
        body: [
          'In BIU, people and agents operate on the same live workspace. Updates you make to a page or table are immediately visible to the agent; tasks and memos produced by the agent appear live in your interface.',
          { image: '/site/shot-agent.webp', alt: 'Typing @ in the conversation box lists pages and tasks from the workspace', caption: 'Type @ to bring pages and tasks directly into the context for this round.' },
          'Mentioning specific pages, tables, or plugins with @ keeps context tight and verifiable—no missing background, and no stale chat history diluting model accuracy. Preserving great work requires no export-and-reimport ritual; it is simply an ordinary write.',
        ],
      },
    ],
  },
  {
    slug: 'open-and-transparent',
    series: 'architecture',
    title: 'Open Source, Free, and Transparent Data',
    summary: 'Once a page holds your business data, client portals, and custom software, ownership and auditability are non-negotiable. Inside BIU’s on-disk layout, append-only event log, model-call boundaries, and Apache 2.0 commitment.',
    date: '2026-10-14',
    sections: [
      {
        body: [
          'A closed app might be tolerable for disposable notes, but once a page holds your business data, client portals, custom plugins, and institutional knowledge, data ownership and auditability become non-negotiable.',
          'That is why BIU is open source under Apache 2.0 from day one: you can inspect every line of code, verify where data lives and where it goes, and take everything with you at any time.',
        ],
      },
      {
        heading: 'An inspectable directory, not a black-box database',
        body: [
          'Cloud-only tools often trap content behind proprietary APIs where exports strip away structure and interactivity. BIU builds directly on standard files—open your workspace folder and every piece is inspectable:',
          {
            code: '.biu/\n├── biu.sqlite       # Pages, structured tables, and component records (standard SQLite)\n├── assets/          # Original images, PDFs, audio, and video files\n├── skills/          # Human-readable Markdown skill definitions on disk\n└── events.log       # Append-only event log tracing every state transition',
          },
          'You get unified search, views, and agent collaboration while remaining free to back up, version-control, or query your files with standard tools. Even if you stop using BIU tomorrow, your data remains intact in open formats.',
          'Every key write is also recorded chronologically in the append-only event log so interface state can be traced back step by step whenever you need to debug or audit.',
        ],
      },
      {
        heading: 'Clear data boundaries: what stays local vs. what goes to models',
        body: [
          'In a local desktop space, all pages, tables, and attachments stay on your computer and remain usable offline.',
          'When you enable agents, you configure your own model provider and keys (DeepSeek, OpenAI, Anthropic, or a local model server). Requests go directly from your machine to your chosen endpoint with no middleman relay, carrying only the specific context you selected for that turn—unselected confidential files stay strictly on local disk.',
        ],
      },
      {
        heading: 'Why it is free and open',
        body: [
          'Composing software inside pages is a foundational medium that should not start behind a steep paywall. Under Apache 2.0, the desktop app and self-hosted version remain free for personal and commercial use; future revenue will come from managed cloud collaboration and enterprise support rather than locking in your data.',
          'Join us on GitHub to open issues, share plugins, and explore what becomes possible when pages become the medium for software.',
        ],
      },
    ],
  },
  {
    slug: 'five-stages-overview',
    series: 'verbs',
    title: 'Five breaks in the software lifecycle: build, store, compose, distribute, derive',
    summary: 'For forty years, building, storing, composing, distributing, and deriving software lived in five disconnected industries. This overview explains how they close into one loop inside the page.',
    date: '2026-10-14',
    sections: [
      {
        body: [
          'Most discussions of AI and software focus on one isolated slice: generating code faster, searching documents, or bolting a chat sidebar onto a legacy SaaS app. Step back across the full lifecycle of software, however, and a deeper pattern emerges: much of the friction in modern work exists because building, storing, composing, distributing, and deriving software have always been broken apart.',
          'Building belongs to 48.4 million developers and long release cycles. Storing scatters unstructured files across cloud silos. Composing relies on brittle API glue across an average of 897 enterprise apps. Distributing goes through installers, app store reviews, and 30% fees. Deriving stays locked inside code repositories and closed plugin ecosystems.',
          'Each stage grew into a trillion-dollar industry of its own, yet together they create the exact bottleneck holding agents back today: context drops at every break. Humans barely bridge these gaps through memory and constant window switching; agents hit a wall.',
        ],
      },
      {
        heading: 'How the five stages close into one loop',
        body: [
          'BIU’s thesis is that all five stages belong inside a single medium—the page—forming a continuous loop:',
          {
            code: 'Build (grow software against live data) → Store (prose + structured blocks on one page) → Compose (shared state)\n   ↑                                                                                                     ↓\nDerive (layer on existing plugins & open source) ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←← Distribute (one page = one release)',
          },
          '1. Build: software grows alongside real data from day one. When a new need appears mid-service, an agent builds a plugin directly against live page data—expanding software creation from developers to 1.14 billion knowledge workers.',
          '2. Store: freeform prose and structured plugin blocks coexist on one page. People read a cohesive document while the workspace indexes matching blocks into queryable tables so agents retrieve exact records instead of scanning walls of text.',
          '3. Compose: distinct full-stack tools—whiteboards, code sandboxes, terminals, pricing engines, and task boards—share live state on one page. One change converges across the page, and every tool is directly operable by agents.',
          '4. Distribute: sharing a page is a software release. Prose, files, and plugin source travel together in one link with condition-based permissions and full context intact.',
          '5. Derive: distribution is not the end—it is the next starting point. Agents reference existing plugins, adapt shared pages, or pull in open-source repositories to layer new capabilities incrementally.',
        ],
      },
      {
        heading: 'One thread: agent context and trillion-dollar leverage',
        body: [
          'Every essay in this series examines each stage through two lenses: what missing context it restores for agents, and the economic scale behind it—from $1.47T in global software spend and $1.49T in public cloud, to $2.6–4.4T in generative AI value, $1.3T in app distribution, and $8.8T in open-source reuse.',
        ],
      },
      {
        heading: 'Where to read next',
        body: [
          'Marshall McLuhan wrote that the medium is the message. Desktop files defined personal computing; browser apps defined cloud SaaS. As people and agents collaborate continuously, the page becomes the next medium for software.',
          'The five essays that follow examine Build, Store, Compose, Distribute, and Derive in sequence, complete with primary industry and academic references. Continue below to start with Build.',
        ],
      },
    ],
  },
  {
    slug: 'build-software',
    series: 'verbs',
    title: 'Build: Software and Data Grow Together',
    summary: 'Traditional software must be finished before service can begin. BIU starts service with the first line of data, letting software grow alongside it. With global software spending at $1.47 trillion, changing how we build changes the production function of the entire industry.',
    date: '2026-10-14',
    sections: [
      {
        body: [
          'This is the first article in our series on transforming how the world builds, stores, composes, distributes, and derives software. Each article answers three questions: what breaks in the legacy model, how BIU’s mechanism works, and what it means for agent context and economic scale.',
          'Software engineering follows a default timeline: requirements first, then development, testing, and launch; only afterward do users and real data arrive. Software is the container, and data is poured in later. Until the container is finished, service cannot begin.',
        ],
      },
      {
        heading: 'Software first, data later',
        body: [
          'The cost of this timeline has been measured for decades. After tracking software projects for thirty years, the Standish Group reported in 2020 that only 31% were delivered on time and on budget with satisfactory results; 50% were late, over budget, or reduced in scope, and 19% failed [3]. In its first 1994 report, troubled projects averaged 189% over their original budgets and 222% over their original schedules [4].',
          'The deeper problem is that real requirements emerge only during service. A consultant discovers in week two that a client needs a pricing calculator that rewrites contract payment clauses live as seats change. Under traditional custom development, that need waits until next quarter. Software is always chasing the service.',
        ],
      },
      {
        heading: 'Data first, software alongside it',
        body: [
          'BIU turns that serial pipeline into parallel growth. Take that same consultant across three steps:',
          'Day 1: create one page with diagnostic notes and a structured client requirements table, and share it with the client immediately—no custom code required to start serving.',
          'Week 2: as the client iterates on seat count and rush delivery, the consultant asks an agent to read the live fields already on the page and attach a pricing-and-contract plugin. Adding it to the page is a single block declaration:',
          { code: ':::editorBlock {kind=quote plugin=page-quote-engine}\n{ "client": "Nova Mfg", "seats": 10, "currency": "USD" }\n:::' },
          'Month 2: as similar engagements arrive, page properties and table fields expand on demand and existing records adopt the new structure automatically. A need discovered in week two runs on live data in week two.',
        ],
      },
      {
        heading: 'Agent context: build against real data',
        body: [
          'In traditional development, engineers work from abstract specs and mock data; when an agent writes code in an empty repo, it guesses field shapes and edge cases from a prose prompt alone.',
          'In BIU, real client records, typed fields, and live usage history already sit on the page when an agent builds a plugin. Its context is the service’s actual state, so the plugin runs against real data on its very first execution.',
          'Outputs stay smaller too: reusing an existing plugin requires only a concise structured declaration rather than regenerating hundreds of lines of UI code—fewer bugs, faster verification, and cleaner context for the next turn.',
        ],
      },
      {
        heading: 'Economic scale: a trillion-dollar production function',
        body: [
          'Gartner forecasts global software spending of $1.468 trillion in 2026, up 15.5% year over year [1]. That is what enterprises pay annually for “software already built,” excluding the labor cost of software built in-house.',
          'Supply is highly concentrated. SlashData estimates 48.4 million active software developers worldwide [2], while Gartner estimated 1.14 billion knowledge workers in 2023 [5]. There is roughly one person able to build software for every 24 knowledge workers—most domain needs never reach a roadmap.',
          'Agents are changing that ratio. Gartner predicts that 33% of enterprise software applications will include agentic capabilities by 2028, up from less than 1% in 2024 [6]. When building grows directly alongside live data, supply expands from 48.4 million developers to 1.14 billion knowledge workers.',
        ],
      },
      {
        heading: 'Building becomes part of the service',
        body: [
          'When data and software grow together, building changes from a high-risk upfront phase into a continuous part of service. Every adjustment is grounded in live data and real feedback.',
          'The next article examines storage: once software and data grow together, how should they be structured so both humans and agents can query them?',
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
    series: 'verbs',
    title: 'Store: Unite Structured and Unstructured Content on One Page',
    summary: 'About 90% of newly generated data worldwide is unstructured, and most AI tools still produce raw files and HTML. BIU pages hold freeform prose and structured blocks together—automatically indexing blocks into queryable tables.',
    date: '2026-10-14',
    sections: [
      {
        body: [
          'This is the second article in the series. The previous article examined building; this one asks how software and data should be stored so they remain readable to people and precisely queryable by systems and agents.',
        ],
      },
      {
        heading: 'A flood without structure',
        body: [
          'IDC estimates that the world generated about 201.7 ZB of data in 2025, including roughly 180.7 ZB of unstructured data—nearly 90% [1]. Within enterprises, structured data accounted for less than 12% of newly generated data in 2023 [1].',
          'Today’s AI tools amplify this flood. They excel at generating Markdown documents, throwaway HTML pages, and scripts. People can read them, yet systems see opaque walls of text. Finding “every diligence memo from the past quarter with gross margin below 30% that passed IC” means opening files one by one or hoping fuzzy search gets lucky.',
          'Finding information is itself enormously expensive. McKinsey found that knowledge workers spend about 19% of their time tracking down information needed to complete tasks [2]. As content accumulates, less of it remains usable.',
        ],
      },
      {
        heading: 'Two kinds of content on one page—automatically indexed',
        body: [
          'A BIU page carries two kinds of content: freely written paragraphs for narrative, judgment, and context; and structured plugin blocks with explicit types and fields for quotes, coding challenges, financial metrics, and records.',
          'Crucially, the workspace automatically indexes matching blocks across every page into typed component tables. Insert a valuation-card block across fifty diligence memos and both views stay in sync:',
          {
            code: 'Human reading one page:   Interview notes + Valuation block + Risk verdict (full narrative)\nAutomatic workspace index: /components/valuation-card → filter grossMargin < 0.30 across all 50 memos',
          },
          'Page properties are structured as well and serve as the runtime environment for every plugin on the page:',
          { diagram: 'page-env', caption: 'Page properties form a structured environment: the same plugin reads two sets of fields on two pages.' },
        ],
      },
      {
        heading: 'Define once, reuse everywhere',
        body: [
          'When structure and prose share the same underlying store, reuse becomes automatic: define a block schema once and use it on any page; write data once and drive live page plugins, cross-page tables, and exact agent queries simultaneously.',
          'Users choose where it lives: local spaces stay in standard SQLite and files on their own computers, while cloud spaces stay on servers they deploy. Wherever the data goes, its structure travels with it.',
        ],
      },
      {
        heading: 'Agent context: exact queries instead of rereading',
        body: [
          'With unstructured document stores, an agent has only two blunt options: stuff entire files into context or rely on vector similarity to fetch approximate snippets. The first hits context limits; the second misses critical fields.',
          'Research from Stanford and other institutions shows that even long-context models become significantly less accurate when key information sits in the middle of a long input; in retrieval-augmented settings, gains from adding more retrieved documents quickly plateau [3]. Giving a model more text is not the same as giving it better context.',
          'In BIU, agents query structurally: list components of a type, filter records by field, or read one exact block on one page. Context is shorter and far more reliable.',
        ],
      },
      {
        heading: 'Economic scale: hosting and retrieving data',
        body: [
          'Gartner forecasts roughly $850 billion in worldwide public-cloud end-user spending in 2026, rising to $1.49 trillion in 2029 [4][5]. This is what the world pays to host software and data; SaaS alone reached $299.1 billion in 2025 [4].',
          'Retrieval costs are likewise measured in trillions. With about 1.14 billion knowledge workers worldwide [6], spending roughly 19% of their time finding information [2] equals the full-time labor of more than 200 million people. Giving content structure at creation time reclaims that lost capacity.',
        ],
      },
      {
        heading: 'Make content understandable to both people and systems',
        body: [
          'Uniting structured and unstructured content preserves the freedom to write while making every record directly queryable. People read a complete working memo; the system sees exact tables.',
          'The next article examines composition: once content has structure inside one workspace, how do distinct categories of software and agents collaborate on it?',
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
    series: 'verbs',
    title: 'Compose: Give AI Precise Context',
    summary: 'Enterprises use 897 applications on average, yet only 29% are integrated. BIU places cross-category plugins, live data, and agents in one shared-state workspace—eliminating glue code and giving AI exact context.',
    date: '2026-10-14',
    sections: [
      {
        body: [
          'This is the third article in the series. The first two examined how software is built and stored; this one asks what placing distinct categories of software inside one shared-state page means for people and agents.',
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
        heading: 'Shared state instead of glue code',
        body: [
          'Conventional stacks try to bridge apps in two fragile ways: webhooks and sync scripts that silently break whenever a vendor alters a field or expires a token, or iframe embeds that sit side by side without sharing state.',
          'BIU unifies the data layer underneath. Pages, blocks, tasks, plugins, and sessions are all structured tables accessed through one set of operations:',
          { code: 'db_list   /tasks\ndb_read   /pages/<id>\ndb_update /editor-blocks/<pageId>::<blockId>' },
          'Blocks on the same page read and write the same live state and page properties. On an incident-response page, selecting a failing node on the topology board automatically targets the backend endpoint probe; once a human approves scaling up workers, latency drops and the task board creates a postmortem card automatically. No webhooks, no sync lag—placing plugins on one page connects them.',
          { diagram: 'atoms', caption: 'Six atoms combine into tasks, pages, plugins, sessions, and more. Adding a domain is simply another composition.' },
        ],
      },
      {
        heading: 'Agent context: reference instead of retell',
        body: [
          'In a world of separate applications, work context is scattered across documents, boards, spreadsheets, and chat histories. People bridge them from memory; an agent sees only what you paste. Give it too little and it guesses; dump everything in and key facts get buried in the middle [3].',
          'In BIU, every object lives as structured data in one workspace, so you can reference exact pages, tables, or tasks with `@`. The agent reads bounded, live, structured context:',
          { image: '/site/shot-agent.webp', alt: 'Typing @ in the conversation box lists pages and tasks from the workspace', caption: 'Type @ to bring pages and tasks directly into the context for this round.' },
          'Agent outputs write back into the exact same system—updating page properties, editing blocks, creating tasks, or saving a skill—so people see results immediately and the next turn continues from live truth.',
        ],
      },
      {
        heading: 'Economic scale: the layer that realizes AI’s value',
        body: [
          'McKinsey estimates that generative AI could create $2.6–4.4 trillion in annual economic value across 63 use cases; including its impact when embedded in existing software could roughly double that figure [4]. Realizing this value depends on giving AI accurate, complete, actionable business context.',
          'Fragmentation also costs trillions: 1.14 billion knowledge workers [5] spending 9% of their time toggling apps [2] equals over 100 million full-time workers. The composition layer eliminates that switching tax while supplying the exact context agents need.',
        ],
      },
      {
        heading: 'Composition is understanding',
        body: [
          'When software shares state inside a page, composition accomplishes two things at once: distinct tools work together seamlessly, and agents understand the full picture without guessing.',
          'The next article examines distribution: how a composed service reaches clients, students, or teammates with minimal friction.',
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
    series: 'verbs',
    title: 'Distribute: One Page Is One Release',
    summary: 'The App Store ecosystem alone facilitated nearly $1.3 trillion in commerce in 2024. BIU makes sharing a page equivalent to releasing live software, paired with condition-based permissions that precisely govern every record.',
    date: '2026-10-14',
    sections: [
      {
        body: [
          'This is the fourth article in the series. The first three examined how software is built, stored, and composed; this one asks how a composed service reaches the people who use it without losing permission boundaries.',
        ],
      },
      {
        heading: 'The long release pipeline',
        body: [
          'Traditional software travels a long road from completion to use: build an installer, register developer credentials, pass app-store review, and ask users to download, install, sign up, and configure permissions. Every step adds cost and drops users.',
          'Distribution channels also charge steep tolls. The App Store takes a 30% commission on digital goods and services, or 15% for small developers [1]. For independent consultants, educators, and small teams, this pipeline is prohibitive—forcing services that deserve interactive software to degrade into static PDFs, screenshots, or videos.',
        ],
      },
      {
        heading: 'Sharing a page is publishing',
        body: [
          'In BIU, the unit of distribution is the page. Sharing resolves dependencies per page and bundles the body, attachments, and referenced plugin source together. Recipients open one link and immediately draw on the canvas, run sandboxed code, or calculate quotes:',
          { image: '/site/shot-share.webp', alt: 'The whiteboard and coding challenge remain usable on a shared page', caption: 'Opening the link gives the recipient a working page of software.' },
          'No installer, no store review, and no multi-platform sign-up maze. Write a page, share the link, and the software is live.',
        ],
      },
      {
        heading: 'Permissions defined by conditions, not hand-maintained lists',
        body: [
          'The easier distribution becomes, the more critical permissions are. Hand-maintained ACL lists (“grant Alice and Bob access to file X”) inevitably drift into leaks or broken access as teams and cohorts change.',
          'BIU’s permission model dynamically matches a Data View against a Member View. For a 40-student interview cohort, an instructor configures one rule:',
          {
            code: 'Data View:   cohort == "Fall-2026" AND owner == current_user\nMember View: role == "student" AND cohort == "Fall-2026"\nGrant:       read lessons, run sandbox blocks, cannot edit template',
          },
          'Authorization targets conditions rather than static names. New students automatically inherit the right scope when they join, and permissions narrow automatically when they graduate. Visibility is evaluated at access time with full traceability—share one page with an entire class and every student sees only their own submissions.',
        ],
      },
      {
        heading: 'Agent context: arrives with the page',
        body: [
          'Conventional apps distribute a bare UI while leaving context behind with the provider. A recipient’s agent has to re-upload files and reconstruct structure from scratch.',
          'A BIU page delivers full context together: prose, structured blocks, page properties, and plugins. When the recipient’s agent opens the page, it reads the complete structured service—and condition-based permissions constrain the agent to the exact scope of the person it represents.',
        ],
      },
      {
        heading: 'Economic scale: a trillion-dollar distribution channel',
        body: [
          'Research commissioned by Apple found that the App Store ecosystem facilitated nearly $1.3 trillion in commerce in 2024—more than doubling in five years [2]. That is a single platform, illustrating the scale of software distribution channels.',
          'Lowering the publishing threshold from “become a developer and pass store review” to “share a page” lets every domain expert and small team deliver live software directly.',
        ],
      },
      {
        heading: 'Everyone can publish software',
        body: [
          'When publishing requires only a page and permissions are expressed by clean conditions, providers no longer need to become software companies before delivering software to clients.',
          'The final article examines derivation: once software is out in the world, how others layer their own capabilities on top of it.',
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
    series: 'verbs',
    title: 'Derive: Layer Your Capabilities on Other People’s Software',
    summary: 'Harvard Business School estimates the demand-side value of open-source software at $8.8 trillion, yet almost only developers can reuse it directly. In BIU, agents reference existing plugins and open-source repositories to layer new capabilities incrementally.',
    date: '2026-10-14',
    sections: [
      {
        body: [
          'This is the final article in the series. Building, storing, composing, and distributing trace software from creation into someone else’s hands; derivation asks how that software keeps growing once it gets there.',
        ],
      },
      {
        heading: 'The value of reuse—and why it stays locked in developer silos',
        body: [
          'The greatest economic value in software history comes from reuse. Harvard Business School research estimates that without open-source software, firms would spend about $8.8 trillion rewriting it themselves—3.5 times current corporate software spending [1].',
          'Reusable software continues to multiply: GitHub’s 2025 report counted over 180 million developers and 630 million repositories, with 121 million added in 2025 alone [2], while the VS Code Marketplace hosts over 100,000 extensions [3].',
          'Yet almost all of that capability remains locked inside developer ecosystems—VS Code extensions only run in VS Code, and GitHub projects require environments, builds, and databases before a non-engineer can touch them.',
        ],
      },
      {
        heading: 'Reference, then layer incrementally',
        body: [
          'In BIU, plugins are structured records in workspace tables that can be read, referenced, and forked. Deriving a new capability follows four clear incremental steps rather than starting from a blank file:',
          {
            code: '1. Inspect the source plugin’s code, schema, and the page’s live data\n2. Preserve the already-verified core computation and UI\n3. Author only the delta layer (e.g. scheduled competitor pricing or an approval gate)\n4. Save as a new version with provenance and license attribution intact, leaving upstream users unaffected',
          },
          'For example, once one merchandiser builds a SKU margin sandbox plugin, another can ask an agent to reference it and layer on scheduled competitor price tracking and automatic creator-brief sync—without waiting on the original author, while allowing the next person to derive from their version in turn.',
        ],
      },
      {
        heading: 'Cross ecosystem boundaries',
        body: [
          'Derivation is not limited to BIU’s own plugins. Agents can inspect a VS Code extension, an open-source tool, or a GitHub repository link, understand its core behavior, and—while honoring its open-source license—wrap it as a working block on a BIU page.',
          'Decades of mature open-source tools stop waiting for vendor ports and become direct building blocks for everyday work.',
        ],
      },
      {
        heading: 'Agent context: start from working software',
        body: [
          'Asking an agent to generate an app from scratch gives it only a prose prompt—high error rates and heavy rework. Asking it to derive gives it verified, running code plus the real data that code operates on.',
          'Because the agent writes only the incremental layer, diffs stay small, human review stays fast, and provenance stays traceable across the entire chain.',
        ],
      },
      {
        heading: 'Economic scale: turn an $8.8 trillion stock into growth',
        body: [
          '$8.8 trillion measures the rewriting cost avoided through open-source reuse [1], while also exposing a gap: 96% of that demand-side value is created by 5% of open-source developers and captured primarily by engineers [1].',
          'When agents can reference, adapt, and layer existing software on behalf of everyday users, the beneficiaries of reuse expand from 48.4 million developers to all knowledge workers—turning a static stock of code into continuous growth.',
        ],
      },
      {
        heading: 'Every piece of software is a starting point',
        body: [
          'Pages themselves are equally derivable: duplicate a page and edit a few properties for the next client, or adapt a shared page into your own version. Proven outputs settle into components, plugins, and skills—becoming the starting point for the next build.',
          'Build alongside live data, store with both structure and freedom, compose on shared state, distribute in one page, and derive from working software. Together, these five stages define what BIU is building: transforming how the world builds, stores, composes, distributes, and derives software, and defining the next medium for human–AI collaboration.',
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
