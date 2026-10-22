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
    lead: 'Pages are containers for composing software.',
    points: [
      'Write content and add as many plugin blocks as you need—a table, whiteboard, coding exercise, or video clip, each handling its own part.',
      'Page properties provide a shared runtime environment for these plugins. The same plugin on different pages reads each page’s own configuration and data.',
      'Multiple blocks read and write the same data, forming one integrated service rather than a collection of unrelated embeds.',
    ],
    image: '/site/shot-page.webp',
    alt: 'A page with a masthead, an Excalidraw whiteboard, and an algorithm exercise card, each powered by a plugin',
  },
  {
    id: 'plugins',
    index: '02',
    title: 'Plugins',
    lead: 'Every block on a page is software provided by a plugin.',
    points: [
      'Block types are not hard-coded into the platform. Install a plugin to add a new type.',
      'Build plugins in a sandbox, test them on a page, and package them when they are ready. Both people and agents can create them.',
      'Every block is also a data record that you can query, copy, and reuse on other pages.',
    ],
    image: '/site/shot-plugins.webp',
    alt: 'Plugin table with one plugin per row and controls to install, enable, or stop each one',
  },
  {
    id: 'share',
    index: '03',
    title: 'Sharing',
    lead: 'Share a working piece of software in a single page.',
    points: [
      'When you share a page, its content, attachments, and plugin source code are packaged together.',
      'Recipients can use it as soon as they open it, with no tools to install or environment to rebuild.',
      'It is an easy way to deliver a complete service to clients, students, or colleagues.',
    ],
    image: '/site/shot-share.webp',
    alt: 'A shared page where the whiteboard and algorithm exercise card work directly from the link',
  },
  {
    id: 'agent',
    index: '04',
    title: 'Agents',
    lead: 'Agents and people work in the same workspace.',
    points: [
      'Agents read your pages and tables directly, so you do not need to copy and paste context.',
      'Their output becomes pages, tables, and tasks that remain available for the next run.',
      'When a tool is missing, an agent can build a plugin and add it to the page.',
    ],
    image: '/site/shot-agent.webp',
    alt: 'Typing @ in the chat input adds pages and tasks directly to the agent context',
  },
  {
    id: 'tasks',
    index: '05',
    title: 'Task Board',
    lead: 'Multiple agents coordinate through a board, not a group chat.',
    points: [
      'Every task card identifies its owner and dependencies, turning the workflow into a clear graph.',
      'When an upstream task finishes, work passes downstream automatically, with execution traces shown beside each task.',
      'People can take over, reassign, or review work at any time.',
    ],
    image: '/site/shot-tasks.webp',
    alt: 'Task table with status, priority, difficulty, and agent assignment for each task',
  },
  {
    id: 'spaces',
    index: '06',
    title: 'Local and Cloud',
    lead: 'Choose the type of space when you create it.',
    points: [
      'Local spaces keep data on your computer, work offline, and use your own model API keys.',
      'Cloud spaces support multi-device access, member permissions, and online collaboration. Self-hosting is available, with BIU Cloud coming soon.',
      'Your data stays transparent: access it through APIs or find it directly on disk.',
    ],
    image: '/site/shot-spaces.webp',
    alt: 'Space switcher for moving between spaces or creating a new one',
  },
]

const PAGE_FLOW = [
  { step: '01', title: 'Write content', body: 'Context, instructions, and resources' },
  { step: '02', title: 'Add plugin blocks', body: 'Tables, whiteboards, exercises, and clips' },
  { step: '03', title: 'Set page properties', body: 'A shared runtime for plugins' },
  { step: '04', title: 'Share', body: 'Deliver a ready-to-use page' },
] as const

/** 三种补法：缺口是什么、怎么补，加一段真实写法当例子。 */
const ECOSYSTEM = [
  {
    name: 'Plugins',
    title: 'Your page needs a new block',
    body: 'Build a plugin to add a new block type. Use it on any page and package it automatically when you share.',
    file: 'Page content',
    code: ':::pageBlock {kind=checkin plugin=page-checkin}\n{ "title": "Week 3 check-in" }\n:::',
  },
  {
    name: 'Skills',
    title: 'Your agent needs your process',
    body: 'Turn your standards and workflows into a skill, and the agent will follow them whenever it reaches that step.',
    file: 'SKILL.md',
    code: '---\nname: grade-assignment\ndescription: Grade algorithm exercises using this rubric\n---\nReview the approach, then the code, and finally the edge cases.',
  },
  {
    name: 'MCP',
    title: 'Your data lives elsewhere',
    body: 'Connect an MCP server so agents can look up information directly, without you copying it over.',
    file: 'MCP server',
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
            <p className="site-section-label">Extend</p>
            <h2>Build whatever is missing</h2>
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
