import { Link, useParams } from 'react-router-dom'
import { SiteChrome, SiteFaq, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'

export type UseCase = {
  slug: string
  index: string
  title: string
  /** 首页卡片上的一句话 */
  summary: string
  /** 交付物（首页卡片显示，也是子页的产出清单） */
  output: string
  /** 子页：真实痛点 */
  pain: string[]
  /** 子页：BIU 怎么做 */
  how: { title: string; body: string }[]
  /** 子页：常见问题 */
  faq: [string, string][]
  /** 这一页里组合了哪些块（插件或内置的表格、任务） */
  blocks: string[]
  /** 如实说明的限制，例如官方云端还没上线 */
  note?: string
}

export const USE_CASES: UseCase[] = [
  {
    slug: 'research',
    index: '01',
    title: 'Research & Analysis',
    summary: 'Gather sources, connect the dots, build comparison tables, and keep findings in a research space you can continue exploring.',
    output: 'Research report · Database · Comparison matrix',
    pain: [
      'Sources are scattered across dozens of tabs and documents, so every new question means searching all over again.',
      'AI research ends up buried in chat history, forcing you to ask again when you need it later.',
      'Comparison tables live in temporary documents and fall apart as soon as the data changes.',
    ],
    how: [
      { title: 'Bring every source in', body: 'Collect web pages, documents, and notes in one space, where pages and tables share the same addressing system.' },
      { title: 'Keep the findings', body: 'Agent output becomes pages, databases, and comparison matrices—not answers that disappear in a chat.' },
      { title: 'Keep comparisons current', body: 'A comparison table is a real table. Add a dimension without changing code or rebuilding it.' },
    ],
    blocks: ['Browser', 'Table', 'Option comparison block', 'Excalidraw canvas'],
    faq: [
      ['Source capacity', 'Sources are stored in the selected space, local or cloud. Capacity depends on that space’s storage configuration.'],
      ['How agents access sources', 'Agents can read pages and data in the space and call external services through MCP.'],
    ],
  },
  {
    slug: 'product',
    index: '02',
    title: 'Product & Projects',
    summary: 'Turn user feedback and project materials into requirements, tasks, decisions, and release plans.',
    output: 'PRD · Project plan · Task database',
    pain: [
      'Feedback, requirements, and tasks live in three different tools—and never quite stay in sync.',
      'Decisions get discussed, but a month later no one remembers why they were made.',
      'Release plans rely on manual updates, and every change means notifying everyone.',
    ],
    how: [
      { title: 'Requirements are records, not document fragments', body: 'Every piece of feedback, requirement, and task is an addressable record that can reference the others.' },
      { title: 'Preserve the decision trail', body: 'Actions are written to an append-only event stream, so both the current state and how it got there remain visible.' },
      { title: 'Agents are collaborators', body: 'Task cards include assignee and dependsOn fields, so multiple agents coordinate through the board instead of group chat.' },
    ],
    blocks: ['Table', 'Tasks', 'Option comparison block', 'API debugger block'],
    faq: [
      ['Team collaboration', 'Cloud spaces provide membership and permissions with viewer, editor, manager, and owner roles.'],
      ['How it works with existing project tools', 'Use them side by side. BIU keeps requirements, tasks, decisions, and context together, eliminating synchronization across multiple systems.'],
    ],
  },
  {
    slug: 'content',
    index: '03',
    title: 'Content & Creation',
    summary: 'Keep source material, drafts, feedback, and published versions in one shared creative context.',
    output: 'Articles · Scripts · Publishing plan',
    pain: [
      'Source material is on one drive, drafts in another tool, and feedback in chat history.',
      'Versions of the same piece are scattered everywhere, making it unclear which one is current.',
      'The publishing schedule lives in your head.',
    ],
    how: [
      { title: 'Source material and drafts stay together', body: 'Source material enters the space as attachments, while drafts are pages. Both use the same addressing system.' },
      { title: 'A complete toolkit on one page', body: 'Copy, mood boards, editing tools, and schedules are plugin blocks on the same page—no switching between apps.' },
      { title: 'Share a working unit', body: 'When you share a page, its content, attachments, and referenced plugin source travel together. The recipient gets something that runs.' },
    ],
    blocks: ['Video editor', 'HTML', 'Excalidraw canvas', 'Page directory'],
    faq: [
      ['Supported content formats', 'Pages use Markdown. Images, audio, video, and files are attachments. Plugin blocks render complex content.'],
      ['Publishing to external platforms', 'Connect external services through MCP to push content to your target platforms.'],
    ],
  },
  {
    slug: 'team-knowledge',
    index: '04',
    title: 'Team Knowledge',
    summary: 'Turn documents, processes, and discussions into knowledge your team can search, maintain, and use.',
    output: 'Team Wiki · Process library · Decision log',
    pain: [
      'The Wiki gets created but not maintained, and is outdated six months later.',
      'Answers to new hires’ questions are buried in someone else’s chat history.',
      'Documented processes no longer match how work actually gets done.',
    ],
    how: [
      { title: 'Knowledge and execution in one place', body: 'Documents, tasks, and conversations share one space context instead of evolving in separate systems.' },
      { title: 'Accessible to agents', body: 'Agents and people share the same address space and knowledge, so every answer can be traced to its source.' },
      { title: 'Low maintenance overhead', body: 'Adding a dimension or record is simply writing data—no code changes or migrations required.' },
    ],
    blocks: ['Page directory', 'Code runner block', 'Page terminal', 'Table'],
    faq: [
      ['How it differs from an existing Wiki', 'Knowledge in BIU is not static text: agents can read it, tasks can reference it, and it can evolve across dimensions.'],
      ['How permissions work', 'Cloud spaces grant access by member role and view. Data in local spaces remains on the user’s computer.'],
    ],
  },
  {
    slug: 'personal',
    index: '05',
    title: 'Personal Work',
    summary: 'Keep personal information and workflows on your own computer, available offline with clear data boundaries.',
    output: 'Local pages · Private data · Offline space',
    pain: [
      'Personal notes and work files are mixed in one cloud account with unclear boundaries.',
      'Nothing works without an internet connection.',
      'You do not want to entrust private information to a third-party host.',
    ],
    how: [
      { title: 'Local spaces', body: 'Data stays on your computer and works offline—it is not uploaded first and then synced back down.' },
      { title: 'Transparent by design', body: 'Read and write through the API or access files directly. Abstraction is a convenience, not a cage.' },
      { title: 'Use your own model', body: 'Agents use the model credentials you configure. Only the content needed for the current turn is sent to the model service; everything else in the space stays put.' },
    ],
    blocks: ['Table', 'Excalidraw canvas', 'Code runner block', 'Coding exercise card'],
    faq: [
      ['Network requirements for local spaces', 'Everyday use works offline. Model calls require a connection, and only content relevant to the current turn is sent to the configured model service. All other data remains local.'],
      ['Using local and cloud spaces together', 'Both can coexist. Keep private information local and collaborative content in the cloud.'],
    ],
  },
  {
    slug: 'collaboration',
    index: '06',
    title: 'Team Collaboration',
    summary: 'Give every member shared access to pages, data, conversations, and agents in one cloud space.',
    output: 'Member permissions · Collaborative space · Shared context',
    pain: [
      'Everyone uses a separate AI assistant, and the output never reaches the team knowledge base.',
      'Discussion happens in one tool and output in another, forcing context to move back and forth.',
      'New team members spend too long reconstructing the full story.',
    ],
    how: [
      { title: 'Shared context', body: 'Pages, data, conversations, and agents all live in one cloud space, so members work from the same data.' },
      { title: 'Members and permissions', body: 'Viewer, editor, manager, and owner roles combine with view-based authorization. Sensitive actions enter a pending-confirmation state.' },
      { title: 'Fully traceable', body: 'An append-only event stream records every action, and the interface is its projection—making both state and provenance clear.' },
    ],
    blocks: ['Tasks', 'Table', 'Option comparison block', 'Page directory'],
    note: 'Cloud spaces can currently be deployed on your own server; the official cloud service is coming soon.',
    faq: [
      ['How it differs from standard collaborative documents', 'Members share more than text: they share the complete context of pages, data, conversations, and agents.'],
      ['Auditing', 'Every action is written to an append-only event log and can be traced individually afterward.'],
    ],
  },
]

export const USE_CASE_CATEGORIES = USE_CASES

function BlockChips({ blocks }: { blocks: string[] }) {
  return (
    <ul className="site-block-chips" aria-label="Combined blocks">
      {blocks.map((name) => <li key={name}>{name}</li>)}
    </ul>
  )
}

/** 用例总览页 */
export function MarketingUseCases({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: 'Use Cases',
    description: 'See how BIU works across six real-world use cases: research, product and projects, content creation, team knowledge, personal work, and collaboration.',
    path: '/use-cases',
  })

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
      <section className="site-page-hero" data-reveal>
        <p className="site-section-label">Use Cases</p>
        <h1>Built for real work</h1>
        <p className="site-page-lead">
          Every deliverable is a page that combines the software the job requires, ready for you, your team, or your clients to use. Choose a use case to see how it works.
        </p>
      </section>

      <section className="site-usecase-grid" aria-label="Use cases">
        {USE_CASES.map((useCase) => (
          <Link key={useCase.slug} to={`/use-cases/${useCase.slug}`} className="site-usecase-card">
            <span className="site-solution-index">{useCase.index}</span>
            <h2>{useCase.title}</h2>
            <p>{useCase.summary}</p>
            <div className="site-usecase-card-blocks">
              <BlockChips blocks={useCase.blocks} />
            </div>
          </Link>
        ))}
      </section>

      <SiteFinalCta title="Start with your use case" />
    </SiteChrome>
  )
}

/** 用例子页 */
export function MarketingUseCaseDetail({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  const { slug } = useParams<{ slug: string }>()
  const useCase = USE_CASES.find((item) => item.slug === slug)

  usePageMeta({
    title: useCase ? useCase.title : 'Use Cases',
    description: useCase ? useCase.summary : 'Real-world ways to work with BIU.',
    path: `/use-cases/${slug ?? ''}`,
  })

  if (!useCase) {
    return (
      <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero">
          <p className="site-section-label">Use Cases</p>
          <h1>Use case not found</h1>
          <p className="site-page-lead"><Link to="/use-cases">Back to all use cases</Link></p>
        </section>
      </SiteChrome>
    )
  }

  const others = USE_CASES.filter((item) => item.slug !== useCase.slug)

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
      <section className="site-page-hero" data-reveal>
        <p className="site-section-label">Use Case · {useCase.index}</p>
        <h1>{useCase.title}</h1>
        <p className="site-page-lead">{useCase.summary}</p>
        <p className="site-usecase-output">Deliverables: {useCase.output}</p>
        {useCase.note ? <p className="site-usecase-note">{useCase.note}</p> : null}
      </section>

      <section className="site-usecase-blocks" data-reveal>
        <h2>Blocks combined on this page</h2>
        <BlockChips blocks={useCase.blocks} />
      </section>

      <section className="site-usecase-pain" data-reveal>
        <h2>What gets in the way today</h2>
        <ul>
          {useCase.pain.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>

      <section className="site-usecase-how">
        <h2 data-reveal>How BIU helps</h2>
        <div className="site-usecase-how-grid">
          {useCase.how.map((item) => (
            <article key={item.title} data-reveal>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <SiteFaq title="About this use case" items={useCase.faq} />

      <section className="site-usecase-more" data-reveal>
        <h2>More use cases</h2>
        <div className="site-usecase-more-links">
          {others.map((item) => (
            <Link key={item.slug} to={`/use-cases/${item.slug}`}>{item.title} →</Link>
          ))}
        </div>
      </section>

      <SiteFinalCta title="Try it with your own workflow" />
    </SiteChrome>
  )
}
