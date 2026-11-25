/** 段落是字符串；代码块用 { code }，截图用 { image }，示意图用 { diagram }。 */
export type Paragraph =
  | string
  | { code: string }
  | { image: string; alt: string; caption: string }
  | { diagram: 'page-env' | 'atoms' | 'vision-table'; caption: string }

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

/** 英文按每分钟 220 词、中文按每分钟 400 字估算，代码块和图不计。 */
export function readingMinutes(post: BlogPost, locale: 'en' | 'zh' = 'en') {
  const texts = post.sections.flatMap((section) => [
    section.heading ?? '',
    ...section.body.filter((p): p is string => typeof p === 'string'),
  ])
  if (locale === 'zh') {
    return Math.max(1, Math.round(texts.join('').length / 400))
  }
  const words = texts
    .join(' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
  return Math.max(1, Math.round(words / 220))
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
    slug: 'application-slicing',
    series: 'paradigm',
    title: 'Application Slicing: Unbundling Bloated SaaS into Composable, Snapshotable Blocks',
    summary: 'A plugin’s backend does not need to run inside BIU. By projecting bloated SaaS tools into lightweight frontend slices on a page, you recompose only the 5% of each tool you actually need—and persist every run as a structured snapshot that creates new data.',
    date: '2026-11-20',
    sections: [
      {
        body: [
          'Why do you have to open an entire aircraft carrier just to test one API endpoint?',
          'Open almost any mature enterprise SaaS product today—Apifox, Jira, Salesforce, a cloud console, or an internal ERP—and you will witness the same law of software entropy. To defend renewal rates, expand seat pricing, and claim “end-to-end coverage,” every product inevitably bloats into a monolith packed with a hundred menus, environment trees, mock rules, approval workflows, and admin panels.',
          'Yet during any single piece of real work, you typically need 5% of that monolith. Suppose you are writing a v2.4 checkout release checklist and simply need to verify three core endpoints. In the legacy world, you switch into the full Apifox workspace, absorb the cognitive overhead of its entire project hierarchy and global variables, run the requests, and then paste screenshots or raw JSON back into your release doc. A week later, staging changes or tokens expire—your external links are dead and your screenshots are unsearchable.',
          'When engineers first hear BIU lets pages host full-stack software, they often assume we expect them to rewrite the backend of every tool on earth inside BIU. Quite the opposite: backends stay right where they are. What BIU introduces is a sharper, far more practical architectural primitive—**Application Slicing**.',
        ],
      },
      {
        heading: 'Keep the backend where it lives; slice the frontend to fit the task',
        body: [
          'In BIU’s plugin architecture, a plugin’s backend service does not need to run inside BIU at all. It can be an existing internal microservice, a standalone Python or Go engine, or the public/private API of Apifox, GitHub, Stripe, Sentry, Snowflake, or an enterprise ERP.',
          'What a BIU plugin constructs is a razor-thin frontend projection—a Slice—that samples only the exact 5% of capability and UI required by the current page and embeds it as a native block:',
          {
            code: 'Legacy Monolith Workflow (forced to absorb 95% irrelevant UI every time):\n  Release Doc ──switch──▶ Full Apifox (100 menus)   ──screenshot──▶ Back to Doc (dead text)\n              ──switch──▶ Full Sentry (50 panels)   ──paste URL───▶ Back to Doc (rots fast)\n              ──switch──▶ Full Jira (heavy forms)\n\nApplication Slicing (Backends stay put; frontend slices recompose on one page):\n  [Apifox / Internal API]  ◀── Slice block: 3 core endpoints + one-click assertions\n  [Sentry Backend]         ◀── Slice block: 10-minute error-rate sparkline           ──▶ One BIU Page\n  [BIU Task Table]         ◀── Built-in block: auto-create regression tickets on fail',
          },
          'The cognitive tax disappears. Inside that release page, you never navigate Apifox’s folder tree or dig through unrelated mock rules; you see only the three endpoints that matter here, their payloads, a Run button, and live assertions. Software stops arriving as a vendor-packaged monolith and starts arriving as a slice shaped around the task.',
        ],
      },
      {
        heading: 'Why slicing is neither an iframe nor iPaaS glue',
        body: [
          'Engineers immediately compare this to two familiar patterns—iframe embeds and iPaaS automation (Zapier, n8n, webhooks). Both stop halfway:',
          '**Iframes cram the whole monolith into a glass box.** You still load a heavy external web app with brittle auth sessions and full UI clutter—and worse, the box is sealed off from the page. Flipping `env = prod-canary` in your document never updates the embedded API runner or error monitor, and agents are completely blind to what happens inside the frame.',
          '**iPaaS and webhooks are invisible background plumbing.** They excel at “when A fires, copy field B,” yet they cannot give a human a unified workspace to inspect live systems side-by-side, tweak parameters interactively, verify results, and record judgment—and any upstream schema change silently breaks the pipeline.',
          'BIU’s application slices take a third path: **every slice speaks one structured data contract and subscribes to shared page properties**. Switch `env` from `staging` to `prod-canary` at the top of the release page, and slices backed by Apifox, Sentry, and an internal log cluster retarget together—connecting not three bloated apps, but the sharpest 5% of each.',
        ],
      },
      {
        heading: 'Snapshot persistence: creating new data in the act of connecting',
        body: [
          'The most quietly transformative property of an application slice is that **it is not a transient remote viewport—every execution writes a structured snapshot directly into the page**.',
          'Return to that Apifox testing slice. Click Run inside your v2.4 release page, and once the external backend responds, the plugin persists the timestamp, request payload, HTTP status, latency, and assertion verdict right inside the page’s block record:',
          {
            code: ':::editorBlock {kind=api-slice plugin=apifox-runner}\n{\n  "endpoint": "POST /v2/orders/checkout",\n  "env": "prod-canary",\n  "payload": { "sku": "pro-annual", "seats": 18 },\n  "lastSnapshot": {\n    "at": "2026-11-20T14:12:08Z",\n    "status": 200,\n    "latencyMs": 142,\n    "assertion": "pass",\n    "traceId": "tr_98a2f1"\n  }\n}\n:::',
          },
          'That single structured write achieves two things legacy tools never could:',
          'First, **documents gain auditable, queryable point-in-time snapshots**. Reopening the v2.4 release page three months later during a postmortem shows neither a 404 external link nor an unsearchable PNG—it shows the exact structured response verified at release time, while staying one click away from re-running for a fresh snapshot (with prior snapshots preserved in the append-only event log).',
          'Second, **connecting legacy systems generates brand-new structured data that you own**. The Apifox latency snapshot, the Sentry error rate, and your human sign-off settle together in local SQLite. After thirty releases, all thirty `api-slice` blocks automatically aggregate into a cross-page table—giving you a 90-day checkout latency and reliability ledger without ever standing up a data warehouse.',
        ],
      },
      {
        heading: 'Why slicing is a force multiplier for agents',
        body: [
          'Point an AI agent at the full UI of Apifox, Jira, and a cloud console, and it either burns vision tokens guessing pixel coordinates or drowns in eighty overlapping MCP tool schemas.',
          'Point an agent at a page of recomposed application slices, and it sees a minimal, task-scoped action surface alongside persisted structured snapshots. It reads `status` and `latencyMs` directly from `lastSnapshot`, correlates them with the Sentry slice on the same page, and decides within milliseconds whether to approve rollout or open a rollback task—without ever touching the irrelevant 95% of the underlying monoliths.',
          'Bloated SaaS will not vanish overnight; it will recede into the backend as specialized service engines while lightweight, snapshotable slices recompose on the page.',
        ],
      },
    ],
  },
  {
    slug: 'malleable-software',
    series: 'paradigm',
    title: 'Fifty Years of Malleable Software: From Smalltalk and HyperCard to Agents in the Page',
    summary: 'For half a century, computing pioneers tried to let everyday users shape and recombine their own software—from Smalltalk and HyperCard to Excel, Notion, and low-code—only to hit structural walls. A deep look at each landmark attempt, and why pages, full-stack plugins, and agents finally close the loop.',
    date: '2026-11-18',
    sections: [
      {
        body: [
          'Commercial software rests on an assumption so ubiquitous we barely notice it: software is manufactured in a factory and consumed like a toaster. Vendors weld the casing shut; users press the pre-labeled buttons and never rewire the machine or combine two appliances into one.',
          'Anyone working across a dozen SaaS tools knows the quiet helplessness this creates: your doc app is missing a live pricing calculator, so you jump to Excel and paste numbers back; your tracker lacks a custom validation checklist, so you file a feature request that sits on a vendor roadmap for years.',
          'The pioneers of personal computing imagined the exact opposite. When Alan Kay wrote *A Personal Computer for Children of All Ages* at Xerox PARC in 1972—introducing the Dynabook and Smalltalk—he did not envision a television for pre-packaged apps. He envisioned a “dynamic medium” as moldable as paper, ink, and clay, where readers are simultaneously authors [1].',
          'Over the past fifty years, researchers came to call this ideal **Malleable Software** [2]. Tracing the four landmark attempts to build it reveals exactly why each one changed the world—and why each one stalled at the final mile.',
        ],
      },
      {
        heading: 'Stop 1 · Smalltalk (1972): when users held the exact same tools as OS authors',
        body: [
          'Most engineers remember Smalltalk merely as the ancestor of object-oriented programming, overlooking its most radical premise: **there was no hard boundary between using software and modifying it**.',
          'On the Xerox Alto, the window manager, text editor, and user applications all lived inside one live object image. At any moment, you could open an Inspector on any button on screen, read its live state and source code, edit two lines, and hit save—the running system immediately adopted the new behavior with no separate build pipeline and no vendor-locked binary.',
          'Alan Kay and Dan Ingalls watched schoolchildren build paint programs and physics simulations in Smalltalk. Yet commercially, Smalltalk’s monolithic image struggled to interoperate with external files, networks, and other languages—and after the 1984 Macintosh popularized shrink-wrapped software, vendors discovered that sealed, unmodifiable binaries were far more profitable to sell and support.',
        ],
      },
      {
        heading: 'Stop 2 · HyperCard (1987): the closest computing ever came to software for everyone',
        body: [
          'If Smalltalk was a research utopia, Bill Atkinson’s **HyperCard** at Apple in 1987 was the first time malleable software reached millions of non-programmers.',
          'Atkinson famously insisted that Apple bundle HyperCard free with every Macintosh. Its mental model was disarmingly simple: everything was a “card,” cards formed a “stack,” and buttons ran HyperTalk—a scripting language that read almost like plain English:',
          {
            code: '-- HyperTalk (1987): software logic an everyday teacher could read and modify\non mouseUp\n  put field "score" into s\n  if s >= 90 then\n    go to card "Honor Roll"\n  else\n    answer "Review the examples in Section 3 before retrying"\n  end if\nend mouseUp',
          },
          'The result was an explosion of grassroots software: biology teachers built interactive textbooks, journalists built searchable investigative archives, small businesses built invoicing tools, and even the bestselling 1993 game *Myst* began life entirely inside HyperCard [3].',
          'Yet HyperCard faded—not merely due to Apple’s internal neglect, but because of two structural gaps of its era. First, it predated the open web: stacks lived as local files on floppy disks with **no URLs and no network distribution**. When Tim Berners-Lee introduced the Web—initially read-only, yet natively networked via HTTP—hyperlinks swept aside local stacks. Second, HyperCard’s data sat trapped inside freeform card fields with **no modern relational tables or cross-card indexing**.',
        ],
      },
      {
        heading: 'Stop 3 · Spreadsheets (1979–present): the most successful half-malleable medium',
        body: [
          'In 1979, Harvard Business School student Dan Bricklin watched a professor erase one number on a blackboard and laboriously recalculate an entire financial table—and invented VisiCalc. Lotus 1-2-3 and Excel followed, creating the most commercially durable malleable software in history.',
          'Excel survived forty-five years because it invented a reactive dataflow programming model normal people grasp intuitively: every cell displays its live value while hiding an editable formula, and changing one input recalculates the dependency graph in milliseconds.',
          'Yet every heavy Excel user knows its painful ceiling: **the tyranny of the 2D grid** (narrative, contracts, and diagrams get crushed into cell comments), **no real software runtime** (you cannot run an isolated Python sandbox, attach a live terminal, or slice an external API inside a cell), and **loss of control on delivery** (emailing `model_v3_final_2.xlsx` immediately forks truth and breaks formulas).',
        ],
      },
      {
        heading: 'Stop 4 · Block editors and low-code: trapped between fixed blocks and engineering walls',
        body: [
          'Over the past decade, two waves tried again—and landed on opposite sides of the same coin:',
          '**Block editors (Notion, Coda)** brilliantly united freeform prose and relational tables on one page. Yet block types remain hardcoded by the vendor: you can arrange headings and filter views, but a block cannot become a real algorithm sandbox, an Apifox API-testing slice, or a live contract-rewriting quote engine. Stepping outside presets forces you back into isolated `<iframe>` boxes.',
          '**Low-code builders (Retool, Airtable)** broke through the capability ceiling, allowing real database connections and custom internal apps—but rebuilt the engineering wall of schemas, auth tokens, state bindings, and glue scripts, keeping everyday consultants, teachers, and operators locked out.',
          {
            code: 'Fifty Years of Malleable Software:\n\n  Era / Medium         Prose     Structured Data   Full-Stack   Zero-Friction Share   End-User Molding\n  ────────────────────────────────────────────────────────────────────────────────────────────────────\n  Smalltalk (1972)     Weak      Object image      Strong       None                  Learn Smalltalk\n  HyperCard (1987)     Medium    Card fields       Medium       Floppy / local file   HyperTalk\n  Excel (1979–)        Minimal   2D grid           Weak         File copy             Formulas (strong)\n  Notion (2016–)       Strong    Relational DB     Fixed blocks Link share            Preset blocks only\n  Retool / Low-code    Weak      External DB       Strong       Internal auth         High eng barrier\n  BIU Page (2026)      Strong    Auto-indexed DB   Full plugins One-link release      Plain language + Agent',
          },
        ],
      },
      {
        heading: 'Why the final two missing pieces arrived together today',
        body: [
          'Across fifty years, malleable software was caught in an impossible triangle: **low authoring friction, genuine full-stack power, and effortless distribution**. No medium delivered all three at once—until two pieces clicked into place simultaneously:',
          'First, **architectural convergence onto the page**. A BIU page unites freeform prose, structured page properties, and full-stack plugins—whether backed by local sandboxes or external SaaS slices—while automatically indexing matching blocks into cross-page SQLite tables and bundling prose, assets, and plugin source into a single shareable link with condition-based permissions.',
          'Second, **agents collapsing authoring cost**. Even with Smalltalk’s elegance, a consultant or merchandiser rarely writes React components and backend validators by hand. Now, because real structured records already sit on the page, asking an agent in plain language to “build a margin slider with return-rate sensitivity linked to the brief below” produces a working, persistent, reusable plugin against live fields in seconds.',
        ],
      },
      {
        heading: 'From consuming appliances back to shaping a medium',
        body: [
          'Ink & Switch captured the problem vividly: modern apps lock users inside staged model homes with welded walls—if you want another window, you wait and hope the developer ships it next year [2].',
          'BIU turns those welded walls back into composable blocks, restoring the page as the dynamic medium Alan Kay envisioned in 1972: start from real data, mold software around your actual work without becoming a full-time engineer, and hand that live page straight to the people you serve.',
          'Fifty years on, malleable software finally has both its container and its collaborator.',
        ],
      },
    ],
    references: [
      { title: 'A Personal Computer for Children of All Ages', publisher: 'Alan Kay / Xerox PARC', year: '1972', url: 'https://www.mprove.de/visionreality/media/kay72.html' },
      { title: 'Malleable Software: Restoring User Agency in a World of Locked-Down Apps', publisher: 'Ink & Switch', year: '2025', url: 'https://www.inkandswitch.com/essay/malleable-software/' },
      { title: 'HyperCard: What Could Have Been', publisher: 'Ars Technica', year: '2012', url: 'https://arstechnica.com/gadgets/2012/05/25-years-of-hypercard-the-missing-link-to-the-web/' },
    ],
  },
  {
    slug: 'after-code-goes-to-zero',
    series: 'paradigm',
    title: 'After Code Goes to Zero: Why “Everyone Can Build Software” Is a Collaboration Illusion',
    summary: 'When the marginal cost of generating code approaches zero, the bottleneck shifts from writing software to collaborating across it. Drawing on Conway’s Law, the shipping container standard, and Elon Musk’s five-step algorithm, this essay explains why personal AI apps without shared contracts create an O(N²) Tower of Babel, why structure is a social contract, and why automation is always the last step.',
    date: '2026-11-24',
    sections: [
      {
        body: [
          'The most seductive slogan of the AI era is simple: “Everyone is a programmer now. Describe what you want in plain English, and build your own software in three minutes.”',
          'In a solo demo, the promise looks intoxicating. A product manager spins up a custom roadmap tracker, a sales lead generates a tailored deal board, and a finance analyst prompts a reimbursement dashboard—work that used to require two sprints and a cross-functional ticket queue now runs before coffee cools.',
          'Then Monday morning arrives, and fifty people inside the same company actually try to work together. The illusion breaks on contact.',
          'The industry has mistaken **the cost of writing code** for **the cost of operating software**. Organizations never spent hundreds of billions a year on SaaS merely to rent lines of React and SQL; they paid for a **shared collaboration protocol** that every team agreed to follow. When code generation drops to zero without a shared contract underneath, you do not get empowerment—you get fifty incompatible micro-kingdoms.',
        ],
      },
      {
        heading: 'The Tower of Babel: When 50 People Run 50 Incompatible Systems',
        body: [
          'Picture a 50-person B2B company that wholeheartedly embraces “everyone builds their own software.”',
          'Sales prompts a personal CRM where deal stages are `negotiating / won / lost` and deal size is stored as a formatted string `"$120k"`. Delivery builds a project tracker keyed by informal client nicknames (`"Nova"` instead of a canonical ID) with milestone statuses `green / yellow / red`. Finance generates an invoicing app with three custom tables and its own login list.',
          'Now ask one ordinary cross-functional question at the Monday review: **“Which signed accounts above $50k are currently blocked in delivery and overdue on milestone two?”**',
          'Every one of those apps was generated in ten minutes, looks crisp, and responds smoothly—yet none of them share a `client_id`, a status taxonomy, or a permission boundary. Answering one simple question forces three departments to export CSVs, drop them into chat, and reconcile rows by hand—**worse than the legacy SaaS era they tried to escape**.',
          'In 1986, Turing Award laureate Fred Brooks drew a timeless line between **accidental complexity** (syntax, boilerplate, deployment plumbing) and **essential complexity** (defining conceptual models, state invariants, and boundaries between people) [1]. Melvin Conway had already observed decades earlier that software architecture inevitably mirrors the communication structure of the organization that builds it [2].',
          'AI has largely collapsed accidental complexity—and in doing so laid essential complexity bare: **when generating code is no longer scarce, alignment becomes the real scarcity**.',
          {
            code: 'Collaboration friction across three software topologies:\n\n  1. Legacy multi-SaaS stack\n     [Sales CRM] ──CSV / brittle webhook──▶ [Delivery Board] ──manual sync──▶ [Finance ERP]\n     Profile: Consistent inside each department, fragmented across departments; slow to change.\n\n  2. Unconstrained “Everyone Vibe-Codes”\n     [Personal App 1] ◀─╳─▶ [Personal App 2] ◀─╳─▶ ... ◀─╳─▶ [Personal App N]\n     Profile: 3 minutes to generate, O(N²) translation cost across people; unmaintainable on handoff.\n\n  3. Shared Contract + Malleable Surface (BIU)\n     [Sales Quote Plugin]   [Delivery Slice Plugin]   [Finance Rollup Table]\n             └─────────────────────────┼─────────────────────────┘\n                                       ▼\n            One Shared Page Contract (/pages/<id> + Schema + Permissions)\n     Profile: Surfaces adapt per role; one canonical source underneath; friction stays O(N).',
          },
          'Personal utilities can be idiosyncratic. **Operational software cannot**: it is a medium for coordination. Without a shared substrate, every additional person who generates a bespoke app adds another dialect to the Tower of Babel.',
        ],
      },
      {
        heading: 'Structure Is Not Bureaucracy—It Is a Contract Agreed Upon in Collaboration',
        body: [
          'If unconstrained personal software produces a Tower of Babel, what keeps collaboration coherent at scale? One understated concept: **structure**.',
          'People instinctively resist structure because they equate it with rigid forms and tedious data entry. When you work strictly alone, that instinct is right—a personal note can live as freeform prose or voice memo because all implicit context resides inside one human head.',
          'The moment work crosses any of three boundaries, unstructured ambiguity breaks down:',
          'First, **across people**: “rush client, usual 10% discount” means tax-inclusive to sales, pre-tax to finance, and half the delivery timeline to operations. Second, **across time**: three months later, trying to calculate the gross margin of every client with an SLA under seven days across forty freeform docs means reading every document by hand. Third, **across agents**: handing an AI agent ten inconsistently formatted Word files and chat screenshots and asking it to reconcile invoices only amplifies hallucination and silent errors.',
          '**Structure is not putting prose in boxes to please a database—it is the contract collaborators agree to honor.** When a team agrees that every client record carries a canonical `client_id`, a typed `stage`, a numeric `amount`, and an `owner`, they are establishing a shared vocabulary so humans and agents can hand off work without re-negotiating reality every time.',
          'Look across industrial and computing history: every leap in large-scale coordination came not from smarter individuals, but from **a thin, uncompromising standard at the boundary**.',
          'Before 1956, every port relied on bespoke wooden crates, cranes, and railcars; unloading a single freighter took weeks. Malcolm McLean and the **ISO 668 shipping container standard** transformed global trade [3]. The standard never dictated what went *inside* the box—bananas, semiconductors, furniture, or machinery all rode side by side. It froze only the **outer contract**: dimensions, corner twist-locks, and load ratings. Because that thin boundary was rock-solid, ships, cranes, trucks, and trains across the planet composed without custom adapters.',
          '**TCP/IP and HTTP** followed the same principle: standardize packets and verbs, never the business logic inside. **Unix pipes** standardized byte streams so tiny single-purpose programs could compose into unforeseen workflows.',
          'That yields the golden rule of standards: **hard enough at the boundary to guarantee lossless interoperability; thin enough inside to preserve local freedom.** Traditional ERPs fail because their standards are too thick—dictating every screen and approval step until employees flee back to Excel. Pure vibe-coding and loose Office files fail because they have no standard at all—infinite freedom, zero composability.',
        ],
      },
      {
        heading: 'Elon Musk’s Five-Step Algorithm: Why Automation Is Always the Last Step',
        body: [
          'Once you see that a shared contract must precede freeform generation, a deeper inversion in today’s AI wave comes into focus.',
          'Forged on the Tesla Model 3 and SpaceX production lines and documented in Walter Isaacson’s biography, Elon Musk’s **five-step engineering algorithm** insists on a strict, non-negotiable sequence [4]:',
          {
            code: 'Elon Musk’s Five-Step Algorithm (strict order matters):\n\n  Step 1. Make your requirements less dumb\n  Step 2. Try very hard to delete the part or process\n  Step 3. Simplify and optimize\n  Step 4. Accelerate cycle time\n  Step 5. Automate — always, strictly last',
          },
          'Musk has repeatedly admitted that his costliest mistake at Tesla’s Fremont factory was running the algorithm in reverse: automating a fiberglass mat installation on the battery pack with expensive robots first (Step 5), stalling the entire line for months—only to discover later that the mat served neither fireproofing nor acoustic purposes and should have been deleted at Step 2 [4].',
          'Apply that exact diagnostic to enterprise AI today: **most AI workflow tools and vibe-coding pitches skip Steps 1 through 4 and sprint straight to Step 5 (Automate)—producing not leverage, but “efficiency inversion” from premature automation.**',
          'Why does premature automation invert efficiency? When you bolt autonomous agents or brittle glue onto a fractured, unstandardized stack (seven disconnected SaaS tools, twelve emailed spreadsheets, fifty bespoke personal apps), three things happen at once:',
          'First, **babysitting cost overtakes doing the work**: one renamed column or status string upstream triggers silent cascading failures downstream, and humans spend more time auditing and unwinding bot mistakes than the task ever took. Second, **bad processes get poured in concrete**: a redundant handoff that should have been deleted at Step 2 becomes untouchable the moment three automations depend on it. Third, **chaos scales at machine speed**: automating without a shared schema multiplies un-auditable drift and maintenance debt tenfold.',
          'Rebuilding AI-era software in the right order looks completely different:',
          'First, **question (Step 1)**: does serving one client or shipping one release genuinely require splitting notes, pricing, contracts, milestones, and reviews across six separate apps? Second, **delete (Step 2)**: eliminate the translation layers—manual CSV exports, duplicated status copies, standalone mini-backends, and redundant auth tables. Third, **simplify and standardize (Step 3)**: converge collaboration onto one minimal contract where narrative, structured data, interactive views, and permissions share a single page and schema. Fourth, **accelerate (Step 4)**: once every person and plugin speaks one contract, reshaping a view or slicing an external API takes minutes instead of sprints. Fifth, **automate (Step 5)**: *now* bring in AI agents. With clean schemas, one source of truth, and an auditable log, automation compounds into real leverage instead of multiplying silos.',
        ],
      },
      {
        heading: 'Hard Contract, Soft Surface: BIU’s Architectural Answer',
        body: [
          'This returns us to the core design tension: **how do you let everyday operators shape software around their exact workflow with AI, without destroying team-wide collaboration?**',
          'The shipping container gives the answer: **lock down a thin, hard collaboration contract underneath, and keep the surface completely malleable.**',
          {
            code: 'BIU’s two-layer split: Hard Contract underneath × Soft Surface on top\n\n  ┌──────────────────────────────────────────────────────────────────────┐\n  │  Soft Surface (molded per role & workflow, evolved live with AI)     │\n  │  · Sales dynamic quote slider  · Delivery milestone slice  · Rollups │\n  └──────────────────────────────────┬───────────────────────────────────┘\n                                     │  Unified read/write + reactive page bus\n  ┌──────────────────────────────────▼───────────────────────────────────┐\n  │  Hard Contract (minimal standard shared by humans, plugins & agents) │\n  │  1. Canonical addressing: /<table>/<id> & pageId::blockId            │\n  │  2. Typed contract: Schema + Blurb invariants checked on every write │\n  │  3. Permission contract: Data View × Member View evaluated live      │\n  │  4. Audit contract: append-only events.log for every mutation        │\n  └──────────────────────────────────────────────────────────────────────┘',
          },
          'Return to that 50-person B2B team. Under a hard-contract, soft-surface architecture, Sales, Delivery, and Finance no longer prompt three isolated apps that cannot talk to each other. They operate on **one shared client page contract**.',
          'Canonical properties (`client_id`, `stage`, `amount`, `sla_days`, `payment_milestones`) live once at the page layer. Sales asks an agent to add a live pricing slider tailored to negotiation; Delivery attaches its milestone slice; Finance automatically aggregates matching billing blocks across all fifty client pages into a real-time receivable view.',
          'Every role gets bespoke software tailored to how they actually think—without ever stepping outside the shared data and permission standard. And when Step 5 arrives—an agent scanning every morning for blocked deliveries with upcoming milestone invoices—it needs zero fragile scrapers or glue code; it simply queries the same contract.',
        ],
      },
      {
        heading: 'Conclusion: Not One Island per Person, but Infinite Forms on One Contract',
        body: [
          'Code going to zero is a historic shift in the supply curve of software—but it does not repeal the physics of human coordination.',
          'Strip away the hype, and three grounded principles remain:',
          'First, **generating software is not collaborating**. “Everyone builds their own app” without a shared substrate merely turns departmental silos into an even more fragmented personal Tower of Babel. Second, **structure is the contract collaboration agrees on**—thin enough to preserve local creativity, hard enough at the boundary to make composition effortless. Third, **automation is always the last step**: delete the translation layers and standardize the medium first, so that AI compounds clarity rather than accelerating chaos.',
          'The endgame of AI-era software is not everyone retreating onto a private island. It is infinite bespoke forms growing safely on top of one clear, shared contract.',
        ],
      },
    ],
    references: [
      { title: 'No Silver Bullet — Essence and Accidents of Software Engineering', publisher: 'Frederick P. Brooks Jr. / IEEE Computer', year: '1987', url: 'https://ieeexplore.ieee.org/document/1663532' },
      { title: 'How Do Committees Invent? (Conway’s Law)', publisher: 'Melvin E. Conway / Datamation', year: '1968', url: 'https://www.melconway.com/Home/Committees_Paper.html' },
      { title: 'The Box: How the Shipping Container Made the World Smaller and the World Economy Bigger', publisher: 'Marc Levinson / Princeton University Press', year: '2006', url: 'https://press.princeton.edu/books/paperback/9780691170817/the-box' },
      { title: 'Elon Musk (The Five-Step Engineering Algorithm)', publisher: 'Walter Isaacson / Simon & Schuster', year: '2023', url: 'https://www.simonandschuster.com/books/Elon-Musk/Walter-Isaacson/9781982181284' },
    ],
  },
  {
    slug: 'inside-biu-architecture',
    series: 'architecture',
    title: 'Inside BIU: Data Model, Plugin Sandboxes, and Shared Page State',
    summary: 'Stripping away the philosophy to look under the hood: BIU’s dual storage layout (SQLite + append-only event log), pageId::blockId scoping, tracing a single reactive write without iframes, dual-mode plugin backends, condition-based permissions, and single-page dependency bundling.',
    date: '2026-11-16',
    sections: [
      {
        body: [
          'When a senior engineer hears “one page hosts whiteboards, code sandboxes, pricing engines, and API-testing slices—sharing live state, shipping via one link, and safely operable by agents,” four concrete questions surface immediately:',
          'First, without `<iframe>`, how do third-party or AI-authored plugins share state on one page without crashing or corrupting each other? Second, where does a plugin’s backend run? Third, how does one share link stay both interactive and strictly permissioned? Fourth, what does the on-disk data model actually look like?',
          'This post skips the high-level vision and walks through BIU’s core data model, the step-by-step trace of a single write, and the deliberate engineering trade-offs we made.',
        ],
      },
      {
        heading: 'Data model: everything is a table, scoped by `pageId::blockId`',
        body: [
          'Underneath the editor, a BIU page is not an opaque Markdown string overwritten wholesale on every edit. It is a triad—**document AST, structured block records, and page properties**—persisted in standard SQLite (`.biu/biu.sqlite`), with every state transition appended chronologically to `.biu/events.log`.',
          'In the document body, a block holds only a lightweight reference; its structured state lives in `editor_blocks` keyed globally by `pageId::blockId` and is automatically indexed across pages by plugin type:',
          {
            code: 'Local workspace directory (.biu/)\n  ├── biu.sqlite\n  │     ├── pages          { id, title, props: JSON, bodyAst, updatedAt }\n  │     ├── editor_blocks  { key: "<pageId>::<blockId>", kind, plugin, data: JSON }\n  │     ├── plugins        { id, manifest, webEntry, hostEntry, schema, blurb }\n  │     └── tasks / ...    Other domain tables (sharing the exact same read/write primitives)\n  ├── assets/              Original images, PDFs, audio, and video (content-addressed)\n  ├── skills/              Human-readable Markdown skill specs on disk\n  └── events.log           Append-only state transition stream (replay, debugging, audit)',
          },
          'Three strong engineering properties fall directly out of this layout. First, **natural namespace isolation**: two pages can both contain a `quote-1` block (`page-nova::quote-1` and `page-northwind::quote-1`) with zero state collision. Second, **zero-setup cross-page aggregation**: inserting a `valuation-card` block across fifty diligence memos automatically yields a queryable table filtered by `kind = "valuation-card"`. Third, **single source of truth for humans and agents**: React plugins and agent tool calls read and write the exact same rows and paths.',
        ],
      },
      {
        heading: 'Tracing a single write: reactive state sharing without iframes',
        body: [
          'How do two independent plugins—say, a pricing calculator and a Statement of Work—stay in sync without importing each other or sitting inside iframes? Trace one write from start to finish.',
          'Suppose a consultant adjusts seats from 10 to 18 in the quote block, or an agent issues `db_update /pages/client-nova { seats: 18, rush: true }`:',
          {
            code: '1. Schema validation   Host validates field types against page and plugin schemas, rejecting malformed writes\n2. Atomic commit       SQLite transaction updates pages.props and appends a stamped event to events.log\n3. Scoped fan-out      Reactive bus notifies only mounted plugins subscribed to pageId="client-nova"\n4. Decoupled converge  Quote recalculates → Contract rewrites payment clauses → Milestones shift dates',
          },
          'The whole round-trip finishes in tens of milliseconds. Notice the decoupling: **the quote plugin never imports the contract plugin, and the contract plugin knows nothing about the schedule plugin**. Drop a fourth AI-built “Finance Approval Card” onto the page tomorrow—as soon as it subscribes to `page.props.seats`, it joins the reactive loop with zero glue code.',
          { diagram: 'page-env', caption: 'The same plugin attached to two pages reads two sets of page properties and exhibits two isolated behaviors.' },
          'Meanwhile, every plugin frontend mounts inside a dedicated React Render Boundary and restricted host bridge: if an experimental AI-written plugin throws at runtime, only that card degrades—never crashing the host page or sibling blocks.',
        ],
      },
      {
        heading: 'Dual-mode plugin backends: host runtime and external service slices',
        body: [
          'If plugins were limited to browser-only HTML/JS, they would quickly degenerate into toy widgets. Real workflows need sandboxes, terminals, local indexing, and external APIs—so BIU supports two native backend modes:',
          '**Mode 1: Controlled Host Runtime.** Used for isolated code sandboxes, real PTY terminals, local PDF indexing, and scheduled collectors. Frontend blocks cannot touch the host filesystem arbitrarily; they invoke declared `db_action` handlers registered in `hostEntry`, bounded by workspace sandboxing and human approval gates, and working offline on desktop.',
          '**Mode 2: External Backend Services (Application Slices).** A plugin’s backend does not need to run on BIU at all—it can talk directly to Apifox, GitHub, Stripe, or an internal enterprise microservice. The plugin projects only the needed frontend slice onto the page and persists execution snapshots back into `editor_blocks`.',
        ],
      },
      {
        heading: 'Single-page dependency bundling and `Data View × Member View` permissions',
        body: [
          'Sharing a page triggers a static dependency closure rooted at `pageId`: traverse the body AST, collect referenced local assets and plugin source bundles, and emit a self-contained delivery package. Recipients open one link in the browser and interact immediately—drawing, running code, or recalculating quotes without installing the desktop app.',
          'For teams and external cohorts, BIU replaces brittle static ACL lists with dynamic intersection evaluation on every access:',
          {
            code: 'Evaluation formula: Visible = DataView(page, block, field) ∩ MemberView(user, role, cohort)\n\nExample: 40-student algorithm cohort sharing one lesson page\n  DataView:   cohort == "2026-Fall" AND (block.kind != "submission" OR block.owner == current_user)\n  MemberView: role == "student" AND cohort == "2026-Fall"\n  Result:     Everyone shares the same notes & canvas, while each student sees only their own submissions',
          },
          'Crucially, **the exact same permission evaluator constrains both humans and any agent acting on their behalf**, preventing AI from ever leaking data across tenant boundaries.',
        ],
      },
      {
        heading: 'Deliberate trade-offs: what we chose not to optimize for',
        body: [
          'Every honest architecture post should state its limits. To win unified page boundaries, non-iframe shared state, and agent-native operability, BIU explicitly gives up three things:',
          'First, **not a GPU hardware-exclusive tool** (Photoshop pixel pipelines, AAA 3D engines, or low-latency DAWs). Second, **no unconstrained ad-hoc blobs**—plugins follow explicit data contracts, schemas, and blurbs so cross-page indexing and zero-hardcoding agent access remain reliable. Third, **not a 100,000-TPS matching engine**—SQLite plus append-only event logging is tuned for personal, team, and enterprise knowledge work and client delivery.',
          'Clear boundaries keep the core small, auditable, and rock-solid.',
        ],
      },
    ],
  },
  {
    slug: 'context-engineering',
    series: 'architecture',
    title: 'Context Engineering for Agents: Why Fewer Tools and Harder Structure Win',
    summary: 'Frontier models are already capable, yet most agents still fail in real workflows. Using concrete token math, O(1) vs O(N) tool complexity, and a traced multi-step turn, this post explains why screenshot loops, RAG stuffing, and tool bloat hit a wall—and how BIU’s minimal primitives fix it.',
    date: '2026-11-14',
    sections: [
      {
        body: [
          'Over the past two years, AI discourse has fixated on model leaderboards and clever prompt wording. Yet almost every engineering team that runs agents inside real multi-step business workflows for two weeks reaches the same conclusion: reliability is governed less by raw parameter count than by **Context Engineering**—what state, in what structure, alongside which exact actions the system hands the model before each turn [1].',
          'A language model is an extraordinarily sensitive state machine. Hand it noisy prose, ambiguous fields, and eighty overlapping tools, and it spends 90% of its intelligence guessing; hand it crisp boundaries, hard structure, and five universal verbs, and even mid-sized models execute with remarkable reliability.',
        ],
      },
      {
        heading: 'Three mainstream patterns hitting a wall (and their hidden costs)',
        body: [
          'Look closely at the three dominant ways teams wire agents into legacy software today:',
          '**Dead end 1: Screenshot-driven Computer Use.** Clean in-memory state (`{ seats: 10, rush: false }`) is rendered into a 1920×1080 bitmap, screenshotted a dozen times (thousands of vision tokens per turn), and fed to a vision model to guess pixel `(842, 319)` across forty seconds and nine clicks. One unexpected modal or expired session breaks the run and leaves no field-level audit trail.',
          '**Dead end 2: Unstructured document RAG stuffing.** Dumping dozens of Markdown files, PDFs, and chat logs into a 128K window fails predictably. Research on *Lost in the Middle* demonstrates sharp accuracy drops whenever key facts sit mid-context, while adding more retrieved chunks quickly hits diminishing returns [2].',
          '**Dead end 3: Tool-schema bloat.** Every external SaaS connected via bespoke functions or MCP adds 15–25 tool definitions. Connect five systems and 80 overlapping, deeply nested schemas sit in the prompt—burning 10,000+ tokens before the user types a word and causing constant tool-selection errors between `update_issue`, `patch_ticket`, and `edit_task_fields`.',
          {
            code: 'Tool-surface scaling:\n  Legacy SaaS + bespoke MCP tools: +15–25 schemas per app   → O(N) context bloat\n  BIU Six Atoms + Blurb protocol:  +0 new schemas per plugin → O(1) constant tool surface',
          },
        ],
      },
      {
        heading: 'BIU’s five-layer context engineering stack',
        body: [
          'BIU deliberately flips the design: **fewer tools, harder data structure, self-describing semantics, and explicit boundaries**:',
          {
            code: '1. Constant Action Surface   Five universal verbs: db_list / db_read / db_update / db_create / db_action\n2. Self-Describing Blurbs    Every table & plugin ships Schema + plain-language Blurb—zero hardcoded prompts\n3. Page-Scoped Boundary      Writes stay contained to one pageId, capping blast radius by construction\n4. Explicit @ Referencing    Users attach exact pages, tables, and skills per turn—no stale chat dumps\n5. Approval & Audit Gates    Sensitive backend actions pause for sign-off and log to append-only events.log',
          },
          'The quiet hero is layer 2—**Blurb**. Conventional databases expose cryptic column names that force models to guess; in BIU, every table and plugin carries plain-language guidance explaining what it stores, how fields relate, and which actions require approval. Whether a workspace holds five plugins or fifty specialized industry plugins, the agent’s tool surface remains O(1).',
          { diagram: 'atoms', caption: 'Six primitives combine into tasks, pages, plugins, sessions, and skills—keeping the agent’s action surface constant at O(1).' },
        ],
      },
      {
        heading: 'Tracing one real agent turn: where determinism comes from',
        body: [
          'Take a concrete production moment: `order-gateway` triggers a P99 latency alert. The on-call engineer opens the incident page, attaches the page and the *Slow-Query Triage* skill with `@`, and asks: “Find the cause of the latency spike and draft a mitigation.”',
          {
            code: 'Turn 1  db_read   /pages/inc-20261114           → Reads page props, Apifox probe snapshot & Sentry error slice\nTurn 2  db_action /editor-blocks/inc::sql-run   → Runs read-only slow-SQL diagnostic in sandbox (finds 918ms scan)\nTurn 3  db_update /editor-blocks/inc::checklist → Writes root cause & migration SQL draft directly into the page\nTurn 4  [Approval Gate]                         → Pauses before production index migration / worker scale-up',
          },
          'Zero screenshots, zero stale chat dumps, zero guessing across eighty tools. Every read and write lands on shared structured truth, visible live to the engineer and recorded permanently in `events.log`.',
        ],
      },
      {
        heading: 'Putting probabilistic models inside deterministic containers',
        body: [
          'In *Building Effective Agents*, Anthropic emphasized that the highest-leverage investment is rarely elaborate multi-agent orchestration—it is designing clean, error-resistant, verifiable Agent-Computer Interfaces (ACI) [3].',
          'Language models are inherently probabilistic; you cannot wish away every error. What you can do is engineer a deterministic container around them—hard structure to minimize guessing, constant primitives to eliminate tool bloat, page boundaries to cap blast radius, and approval gates plus append-only logs to enforce accountability.',
          'When context engineering is built into the software medium itself rather than patched on with glue scripts, agents graduate from fragile demos into dependable daily collaborators.',
        ],
      },
    ],
    references: [
      { title: 'Effective Context Engineering for AI Agents', publisher: 'Anthropic Engineering', year: '2025', url: 'https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents' },
      { title: 'Lost in the Middle: How Language Models Use Long Contexts', publisher: 'Transactions of the ACL, 12:157–173', year: '2024', url: 'https://aclanthology.org/2024.tacl-1.9/' },
      { title: 'Building Effective Agents', publisher: 'Anthropic Research', year: '2024', url: 'https://www.anthropic.com/research/building-effective-agents' },
    ],
  },
  {
    slug: 'five-trillion-dollar-markets',
    series: 'verbs',
    title: 'Five Verbs, Five Trillion-Dollar Markets',
    summary: 'Build ($1.47T), Store ($1.49T), Compose ($2.6–4.4T), Distribute ($1.3T), and Derive ($8.8T): why each verb in BIU’s mission names a separate trillion-dollar industry—and why agents force all five to converge inside the page.',
    date: '2026-11-23',
    sections: [
      {
        body: [
          'In 2011, Marc Andreessen famously wrote that software is eating the world. Fifteen years later, software did eat the world—but along the way, it split itself into five separate empires.',
          'When people read BIU’s mission—“transform how the world builds, stores, composes, distributes, and derives software”—it is easy to hear a list of product features. It is not a feature list. Each of those five verbs names an independent, trillion-dollar industry that grew up around the physical and economic constraints of the pre-AI era.',
          'Every time a new computing medium arrives, it does not merely optimize one layer of the stack; it collapses seams that previous incumbents treated as laws of nature. The personal computer collapsed typesetting and calculation onto one desk. The web browser collapsed client installation and server hosting into a URL. Today, AI agents are forcing a far larger collapse: all five trillion-dollar stages of the software lifecycle are converging into a single medium—the page.',
        ],
      },
      {
        heading: 'Two tectonic shifts colliding at once',
        body: [
          'To see why these five markets are being rewritten simultaneously rather than one by one, look at two structural curves crossing in the same decade.',
          'First, the production function of software is breaking open. Gartner forecasts global software spending of $1.468 trillion in 2026 [1], and predicts that 33% of enterprise software applications will embed agentic capabilities by 2028—up from less than 1% in 2024 [2]. For forty years, software supply was gated by a scarce priesthood: SlashData counts 48.4 million active developers worldwide [3], serving roughly 1.14 billion knowledge workers [4]. That 1:24 ratio dictated everything about how software was priced, packaged, and rationed. Agents collapse that ratio.',
          'Second, agents are running headfirst into a medium built strictly for human eyes. MuleSoft’s 2025 benchmark shows that the average enterprise runs 897 applications, only 29% of which are integrated—and 95% of IT leaders say integration is blocking effective AI adoption [5]. McKinsey estimates generative AI can unlock $2.6–4.4 trillion in annual economic value [6], yet almost none of that value materializes if an agent cannot see the live state of work across tools.',
          'Bolting a chat sidebar onto one of those 897 apps does not solve the seam. Agents do not need a smarter copilot inside legacy silos; they need a medium where software, structured data, and human judgment share one bounded container.',
          { diagram: 'vision-table', caption: 'Each of the five verbs maps to a distinct trillion-dollar market and a specific missing layer of agent context.' },
        ],
      },
      {
        heading: '01 · Build ($1.468T): breaking the 1:24 supply bottleneck',
        body: [
          'The $1.468 trillion global software market [1] prices in a brutal assumption: you must finish building software before you can start serving anyone. Requirements, architecture, sprints, QA, deployment—only after months of upfront capital does the first real user arrive.',
          'That waterfall exists only because human engineering hours are scarce. When 48.4 million developers [3] must serve 1.14 billion knowledge workers [4], long-tail domain workflows—a boutique consultant’s live contract-and-pricing engine, an algorithm coach’s interactive rubric, a merchandiser’s SKU margin sandbox—never make it onto a SaaS vendor’s roadmap.',
          'Inside a BIU page, the timeline inverts. Service starts on day one with real records; when a workflow gap appears in week two, an agent builds a full-stack plugin directly against live page data. The market does not merely get cheaper software—it expands the pool of builders from 48 million engineers to a billion domain practitioners.',
        ],
      },
      {
        heading: '02 · Store ($1.49T): ending the 200-million-person retrieval tax',
        body: [
          'Gartner projects worldwide public-cloud end-user spending to reach $1.49 trillion by 2029 [7]. We spend over a trillion dollars a year hosting data, yet IDC estimates that nearly 90% of newly generated data is unstructured [8]—opaque prose, slides, PDFs, and throwaway HTML that humans can skim but machines can only guess at.',
          'The hidden bill is even larger than the cloud invoice. McKinsey found that knowledge workers spend roughly 19% of their working week hunting for information [9]. Across 1.14 billion knowledge workers [4], that retrieval tax equals the full-time output of more than 200 million people. Most AI tools today make this worse, flooding disks with even more unstructured Markdown and chat transcripts.',
          'BIU unites both halves on one page: freeform prose for human reasoning, and typed plugin blocks that the workspace automatically indexes into queryable tables. Write once—humans read a coherent memo while agents run exact field queries instead of stuffing megabytes of text into a context window.',
        ],
      },
      {
        heading: '03 · Compose ($2.6–4.4T): the layer that unlocks AI’s real value',
        body: [
          'If Build is about supply and Store is about memory, Compose is where economic value actually clears. McKinsey’s $2.6–4.4 trillion annual generative AI estimate [6] depends on AI executing multi-step work across real business context—not answering isolated trivia.',
          'Yet today’s software stack is an integration tax machine. With 897 apps per enterprise and only 29% connected [5], Harvard Business Review found employees toggle between applications roughly 1,200 times a day, burning 9% of their annual working time just regaining focus [10]—another 100-million-worker drag. Glue scripts and webhooks break silently; iframe embeds trap tools behind glass walls.',
          'When distinct categories of software—whiteboards, code sandboxes, pricing engines, task boards—live as plugins sharing one page state, composition stops being an IT integration project. A single structured update converges across every tool on the page, and referencing a page with `@` hands an agent the complete, live truth in one shot.',
        ],
      },
      {
        heading: '04 · Distribute ($1.3T): removing the tollbooth on software delivery',
        body: [
          'Software distribution is a trillion-dollar tollbooth in its own right. Research commissioned by Apple shows the App Store ecosystem alone facilitated nearly $1.3 trillion in commerce in 2024 [11], flanked by review queues, developer certificates, and a 30% commission on digital goods.',
          'That friction creates a quiet tragedy across professional services: coaches, analysts, agencies, and internal ops teams know their clients need interactive software, yet the cost of packaging, hosting, and onboarding forces them to downgrade their work into static PDFs and screenshots.',
          'In BIU, sharing a page is a software release. One link bundles prose, attachments, and referenced plugin code so recipients interact immediately—no installer, no store review, no multi-app sign-up. Just as crucially, condition-based permissions travel with the page: both data views and member views are evaluated dynamically, clearly bounding what a recipient—and the recipient’s agent—can see and execute.',
        ],
      },
      {
        heading: '05 · Derive ($8.8T): unlocking open source from behind `git clone`',
        body: [
          'The largest number of the five is also the least appreciated. A Harvard Business School study estimates the demand-side value of open-source software at $8.8 trillion—3.5 times what firms spend on software each year [12]. GitHub now hosts over 180 million developers and 630 million repositories [13].',
          'Yet HBS also uncovered a striking asymmetry: 96% of that $8.8 trillion value is created by just 5% of open-source developers [12], and almost all of it can only be reused directly by engineers who know how to clone a repo, resolve dependencies, and deploy a runtime. For everyone else, 630 million repositories might as well be locked in a vault.',
          'Because BIU plugins are structured workspace records, derivation becomes incremental rather than all-or-nothing. An agent inspects an existing plugin, a shared page, or an open-source repository, preserves the verified core, and authors only the delta layer for your workflow. For the first time, the compounding leverage of open-source reuse extends from 48 million engineers to every knowledge worker.',
        ],
      },
      {
        heading: 'Why five markets converge—and how value compounds',
        body: [
          'A skeptical reader should ask a fair question: incumbents already dominate each of these five verticals—IDEs for building, cloud databases for storing, iPaaS for composing, app stores for distributing, GitHub for deriving. Why wouldn’t each incumbent simply add AI to its own slice?',
          'Because the bottleneck is not inside any single slice; it is on the seams between them. An IDE cannot share runtime state with a client’s contract; a cloud drive cannot execute a sandboxed plugin; an app store cannot compute row-level page permissions for an agent. Optimizing one verb in isolation still drops context the moment work crosses into the next verb.',
          'When all five converge inside the page, they close into a single compounding flywheel:',
          {
            code: 'Open Source & Local Free (Adoption) → Pages & Plugins Built on Live Data (Build + Store + Compose)\n   ↑                                                                                       ↓\nPlugin Ecosystem & Revenue Share (Derive) ←←←←←←←←←←←←← BIU Cloud & Team Permissions (Distribute)',
          },
          'This is also why BIU’s business model mirrors the architecture rather than fighting it. The desktop app and self-hosted runtime remain open source under Apache 2.0 and free—removing every barrier to building and storing on your own machine. Revenue scales naturally with collaboration and distribution: BIU Cloud subscriptions for multi-device sync, teams, and traceable permissions; enterprise private deployments; and a plugin ecosystem with developer revenue sharing as derived software compounds.',
          'Software ate the world as five disconnected industries. In the age of agents, the platform that unifies all five inside one medium does not compete for one vertical—it defines the substrate where the next decade of software is built, stored, composed, distributed, and derived.',
        ],
      },
    ],
    references: [
      { title: 'Gartner Forecasts Worldwide IT Spending to Grow 14.2% in 2026, Totaling $6.37 Trillion', publisher: 'Gartner', year: '2026', url: 'https://www.gartner.com/en/newsroom/press-releases/2026-07-27-gartner-forecasts-worldwide-it-spending-to-grow-14-point-2-percent-in-2026-totaling-6-point-37-trillion' },
      { title: 'Gartner Predicts Over 40% of Agentic AI Projects Will Be Canceled by End of 2027', publisher: 'Gartner', year: '2025', url: 'https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027' },
      { title: 'Developer Population Sizing: 48.4 million developers worldwide', publisher: 'SlashData', year: '2025', url: 'https://www.slashdata.co/research/developer-population' },
      { title: 'Gartner Says Worldwide Social Software and Collaboration Revenue to Nearly Double by 2023', publisher: 'Gartner', year: '2019', url: 'https://www.gartner.com/en/newsroom/press-releases/09-24-2019-gartner-says-worldwide-social-software-and-collaboration-revenue-to-nearly-double-by-2023' },
      { title: '2025 Connectivity Benchmark Report', publisher: 'MuleSoft / Salesforce', year: '2025', url: 'https://www.salesforce.com/blog/mulesoft-connectivity-benchmark-2025/' },
      { title: 'The economic potential of generative AI: The next productivity frontier', publisher: 'McKinsey & Company', year: '2023', url: 'https://www.mckinsey.com/capabilities/tech-and-ai/our-insights/the-economic-potential-of-generative-ai-the-next-productivity-frontier' },
      { title: 'Forecast: Public Cloud Services, Worldwide, 2023-2029, 4Q25', publisher: 'Gartner', year: '2025', url: 'https://www.gartner.com/en/documents/7281230' },
      { title: 'Worldwide Global DataSphere Structured and Unstructured Data Forecast, 2024–2028', publisher: 'IDC', year: '2024', url: 'https://techcontentwave.com/files/1763389937_64b594fd4f7f5607256a.pdf' },
      { title: 'The social economy: Unlocking value and productivity through social technologies', publisher: 'McKinsey Global Institute', year: '2012', url: 'https://www.mckinsey.com/mgi/media-center/social-media-productivity-payoff' },
      { title: 'How Much Time and Energy Do We Waste Toggling Between Applications?', publisher: 'Harvard Business Review', year: '2022', url: 'https://hbr.org/2022/08/how-much-time-and-energy-do-we-waste-toggling-between-applications' },
      { title: 'The Global App Store and Its Growth', publisher: 'Analysis Group, commissioned by Apple', year: '2025', url: 'https://www.apple.com/newsroom/pdfs/2024-Apple-Global-Ecosystem-Report-June2025.pdf' },
      { title: 'The Value of Open Source Software (Working Paper 24-038)', publisher: 'Harvard Business School', year: '2024', url: 'https://www.hbs.edu/faculty/Pages/item.aspx?num=65230' },
      { title: 'Octoverse 2025: A new developer joins GitHub every second', publisher: 'GitHub', year: '2025', url: 'https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/' },
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
