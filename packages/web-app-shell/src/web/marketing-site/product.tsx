import { SiteChrome, SiteFaq, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'
import { asset } from './site-base.ts'
import { HighlightedCode } from './blog-format.tsx'

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
    lead: 'One boundary holding docs, structured data, and live software.',
    points: [
      'Freeform prose and interactive plugin blocks coexist on one page—no isolated iframes.',
      'The same plugin placed on different client pages isolates its state and adapts to each page’s currency, SLA, and rules.',
      'Every tool on the page shares one live data layer—edit once and the whole page updates together.',
    ],
    image: '/site/shot-page.webp',
    alt: 'A page with a masthead, an Excalidraw whiteboard, and an algorithm exercise card, each powered by a plugin',
  },
  {
    id: 'plugins',
    index: '02',
    title: 'Plugins & Application Slices',
    lead: 'Run in a local sandbox, or slice external systems onto the page.',
    points: [
      'Block types are never hardcoded: install plugins or ask an agent to build one directly against live page data.',
      'External SaaS and enterprise backends stay where they live—slice only the task-specific UI onto your page and persist each run as a snapshot.',
      'Matching blocks across dozens of pages automatically aggregate into queryable cross-page tables.',
    ],
    image: '/site/shot-plugins.webp',
    alt: 'Plugin table with one plugin per row and controls to install, enable, or stop each one',
  },
  {
    id: 'share',
    index: '03',
    title: 'Distribution & Condition Permissions',
    lead: 'Sharing one link is shipping live software.',
    points: [
      'Prose, attachments, and referenced plugin source travel together—recipients open the link in any browser and run it immediately.',
      'Replace static ACL lists with dynamic Data View × Member View permissions that stay accurate as teams and records change.',
      'The exact same permission boundary governs both humans and agents, with full audit traceability.',
    ],
    image: '/site/shot-share.webp',
    alt: 'A shared page where the whiteboard and algorithm exercise card work directly from the link',
  },
  {
    id: 'agent',
    index: '04',
    title: 'Agents',
    lead: 'Humans and agents share the exact same structured records—no screenshots or copy-pasting.',
    points: [
      'Attach exact pages, tables, or skills with @ so agents read only the context you selected.',
      'Agents read and write records directly and trigger plugin actions—settling outputs into durable pages, tables, and skills.',
      'When a capability is missing, agents build it against live fields or derive incremental layers from existing plugins and open source.',
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
      'Each task card declares its owner and dependencies, passing work downstream automatically with execution traces beside the card.',
      'Sensitive actions—sending externally, locking contracts, or mutating production—pause for explicit human approval.',
      'Key state changes append chronologically to events.log for deterministic replay and review.',
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
      'Local spaces store standard SQLite and plain files on disk—offline-ready with direct calls to your own model provider.',
      'Cloud spaces bring multi-device sync, team collaboration, and condition permissions—self-hostable today, with BIU Cloud coming soon.',
      'Open source under Apache 2.0: inspect the code and export everything in open formats with zero lock-in.',
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
  ['How are pages different from documents?', 'Documents hold static text. Every block on a BIU page is full-stack software sharing live state—composing into a complete service delivered in one link.'],
  ['Where do plugins come from? Can they connect to existing systems?', 'Use built-in or community plugins, or ask an agent to build one against live page data. Plugins can also slice external SaaS or internal APIs—keeping heavy backends where they live while persisting run snapshots right in the page.'],
  ['Do recipients need to install anything to use a shared page?', 'No. Sharing bundles prose, attachments, and referenced plugin source into one link that runs directly in the browser.'],
  ['Which models are supported? Do calls relay through BIU?', 'Any compatible provider works (DeepSeek, OpenAI, Anthropic, or local models) with your own API key. In local spaces, requests go directly from your machine to your chosen endpoint with no middleman relay.'],
  ['Can local and cloud spaces coexist?', 'Yes. Keep sensitive personal or diligence records offline in local spaces while running team collaboration and client delivery in cloud spaces.'],
] as const

export function MarketingProduct({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: 'Product',
    description: 'Pages are containers, plugins are software: see how BIU unifies shared state, application slicing, agents, condition permissions, and local-first storage.',
    path: '/product',
  })

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero" data-reveal>
          <p className="site-section-label">Product</p>
          <h1>Pages are containers. Plugins are software.</h1>
          <p className="site-page-lead">
            BIU does not achieve All in One by packing features into one vendor app—it lets a single page host full-stack software and external system slices sharing live state for both humans and agents.
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
            <h2>From live data to delivery<br />in four steps</h2>
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
                  <HighlightedCode code={item.code} />
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
