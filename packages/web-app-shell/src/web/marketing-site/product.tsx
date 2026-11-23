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
    title: 'Pages',
    lead: 'One bounded unit unifying logic, state, environment, and delivery.',
    points: [
      'Freeform prose and structured plugin blocks coexist on one page—combining built-in software, external application slices, and agent-authored tools without isolated iframes.',
      'Page properties form the shared runtime environment: one plugin codebase placed on different client pages isolates its state and adapts automatically to each page’s currency, SLA, and rules.',
      'Every block subscribes to a reactive property bus over the same underlying data so a single write converges across the page in milliseconds.',
    ],
    image: '/site/shot-page.webp',
    alt: 'A page with a masthead, an Excalidraw whiteboard, and an algorithm exercise card, each powered by a plugin',
  },
  {
    id: 'plugins',
    index: '02',
    title: 'Plugins & Application Slices',
    lead: 'Dual-mode backends: run in a local controlled sandbox, or slice external services.',
    points: [
      'Block types are never hardcoded. Controlled host runtimes power isolated code sandboxes, real PTY terminals, and local file indexing—working fully offline on desktop.',
      'A plugin’s backend never has to migrate into BIU: slice the 5% you need from Apifox, GitHub, internal APIs, or standalone microservices, and persist each run as a structured snapshot right inside the page.',
      'Matching blocks across dozens of pages automatically aggregate into queryable cross-page tables with zero manual schema wiring.',
    ],
    image: '/site/shot-plugins.webp',
    alt: 'Plugin table with one plugin per row and controls to install, enable, or stop each one',
  },
  {
    id: 'share',
    index: '03',
    title: 'Distribution & Condition Permissions',
    lead: 'Sharing one link is a complete software release.',
    points: [
      'Dependency closure resolves per page—bundling prose, attachments, and referenced plugin source into a self-contained link recipients run immediately in the browser.',
      'Replace brittle static ACL lists with dynamic Data View × Member View evaluation that stays accurate as teams, cohorts, and records evolve.',
      'The exact same permission engine constrains both humans and any agent acting on their behalf, with full traceability.',
    ],
    image: '/site/shot-share.webp',
    alt: 'A shared page where the whiteboard and algorithm exercise card work directly from the link',
  },
  {
    id: 'agent',
    index: '04',
    title: 'Agents & Context Engineering',
    lead: 'Fewer tools, harder structure: humans and agents share the exact same truth.',
    points: [
      'Five universal primitives (db_list, db_read, db_update, db_create, db_action) paired with self-describing table Blurbs keep the agent’s tool surface constant at O(1) as plugins grow.',
      'Attach exact pages, tables, and skills with @ so agents act directly on structured records and persisted snapshots—never guessing coordinates from screenshots.',
      'When a capability is missing, agents author new plugins against live page data or derive incremental layers from existing plugins and open-source repos.',
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
      'Every task card declares its owner, dependencies, and live context—handing work downstream automatically with execution traces beside each card.',
      'Sensitive backend actions such as locking contracts, sending externally, or mutating production pause at an explicit approval gate.',
      'Every key state transition appends chronologically to events.log for deterministic replay and audit.',
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
      'Local spaces persist pages, structured tables, and attachments in standard SQLite (.biu/biu.sqlite) and plain files on disk—offline-ready with direct calls to your own model provider.',
      'Cloud spaces bring multi-device sync, team collaboration, and condition-based permissions—self-hostable today, with BIU Cloud coming soon.',
      'Open source under Apache 2.0: inspect every line of code and export everything in open formats with zero lock-in.',
    ],
    image: '/site/shot-spaces.webp',
    alt: 'Space switcher for moving between spaces or creating a new one',
  },
]

const PAGE_FLOW = [
  { step: '01', title: 'Start with live data', body: 'Records and page properties from day one' },
  { step: '02', title: 'Compose slices', body: 'Built-in plugins and external service slices' },
  { step: '03', title: 'Build with agents', body: 'Read state directly and grow missing blocks' },
  { step: '04', title: 'Ship one link', body: 'Bundled runtime with cross-page aggregation' },
] as const

/** Three extension layers: capability blocks, workflow skills, external context. */
const ECOSYSTEM = [
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
] as const

const PRODUCT_FAQ = [
  ['How are pages different from documents?', 'Documents hold text. Every block on a BIU page is software provided by a plugin. Multiple blocks read and write the same data, combining into a complete service.'],
  ['Where do plugins come from?', 'The workspace includes common plugins for tables, whiteboards, code execution, and more. You or an agent can also build new ones. Test a new plugin in the sandbox before packaging it.'],
  ['What happens to plugins on shared pages?', 'The page content, attachments, and plugin source code are packaged together. Recipients can open and use the page without installing anything else.'],
  ['Which models are supported?', 'Any model works. BIU uses the API keys you provide.'],
  ['Can local and cloud spaces coexist?', 'Yes. Keep private information in local spaces and collaborative work in cloud spaces.'],
] as const

export function MarketingProduct({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: 'Product',
    description: 'See how BIU turns pages and plugins into complete services, with sharing, agents, task boards, and local or cloud spaces.',
    path: '/product',
  })

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero" data-reveal>
          <p className="site-section-label">Product</p>
          <h1>Pages are containers. Plugins are software.</h1>
          <p className="site-page-lead">
            BIU does not achieve All in One by packing features into a single app. It lets one page contain multiple
            pieces of software that share the same data. Here is how it works.
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
            <p className="site-section-label">Pages as services</p>
            <h2>Combine multiple apps<br />in four steps</h2>
          </div>
          <div className="site-context-flow" data-reveal aria-label="Pages as services">
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
            <p className="site-section-label">Extension Architecture</p>
            <h2>Three open layers: Plugins, Skills, and MCP</h2>
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

        <SiteFaq title="About the product" items={PRODUCT_FAQ} />

        <SiteFinalCta title="Build your first page" />
    </SiteChrome>
  )
}
