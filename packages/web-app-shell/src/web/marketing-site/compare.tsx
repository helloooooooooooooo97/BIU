import { Link, useParams } from 'react-router-dom'
import { GITHUB_URL, SiteChrome, SiteFaq, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
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
    category: 'Infrastructure',
    opening: 'Linux unified diverse hardware through “everything is a file” and a common set of system calls. BIU applies the same idea to data: everything is a path, and everything is /<table>/<id>.',
    useWhen: 'You need a general-purpose operating system, process isolation, a network stack, or native applications',
    biuWhen: 'You need to read, write, and extend pages, data, conversations, and agents as one kind of addressable object',
    columns: ['Linux', 'BIU'],
    rows: [
      { dimension: 'Core idea', them: 'Everything is a file', biu: 'Everything is /<table>/<id>' },
      { dimension: 'System calls', them: 'read / write / open', biu: 'db_read / db_update / db_create' },
      { dimension: 'Device-specific operations', them: 'ioctl', biu: 'db_action' },
      { dimension: 'Self-reported state', them: '/proc', biu: 'db_list / + each table’s blurb' },
      { dimension: 'Driver / capability registration', them: 'Kernel modules', biu: 'Plugin registry (sandbox → pack → mount)' },
      { dimension: 'Unifying heterogeneous systems', them: 'VFS', biu: 'File System' },
      { dimension: 'Restart required to extend', them: '⚠️ Modules support hot loading; the kernel itself requires a restart', biu: '✅ Plugins install and unload live without touching the kernel' },
      { dimension: 'Who extends it', them: 'Driver developers', biu: '✅ People and agents use the same db_* interface' },
      { dimension: 'Permission model', them: '✅ Users / groups / capabilities (mature)', biu: '✅ Data views × member views' },
      { dimension: 'Underlying system visibility', them: '✅ Direct access through /dev and /procfs', biu: '✅ Dual access: db_* or direct file access' },
      { dimension: 'Process and resource isolation', them: '✅ Strong (namespaces / cgroups)', biu: '⚠️ Lightweight plugin sandbox with no hard resource limits' },
      { dimension: 'Run arbitrary native programs', them: '✅ That is its purpose', biu: '❌ Not a general-purpose OS' },
      { dimension: 'Form', them: 'Kernel + distribution', biu: 'Kernel (applications grow on top of it)' },
    ],
  },
  {
    slug: 'vs-k8s',
    title: 'BIU vs Kubernetes',
    category: 'Infrastructure',
    opening: 'k8s abstracts machines through “everything is a declarative object”: write YAML, and the control plane converges it into running resources. BIU brings that idea into a document—declare one plugin to add a capability, or several to compose a service.',
    useWhen: 'You need container orchestration, replica scheduling, self-healing, or machines managed as a resource pool',
    biuWhen: 'You need to declare capabilities directly on a page and combine several plugins into a working service',
    columns: ['k8s', 'BIU'],
    rows: [
      { dimension: 'Core idea', them: 'Everything is a declarative object', biu: 'Everything is /<table>/<id>; declarations take effect immediately' },
      { dimension: 'Where declarations live', them: 'YAML files applied with kubectl', biu: 'Directly in page content or inserted as a page block' },
      { dimension: 'Declaration unit', them: 'A resource object (Pod / Service / CRD)', biu: 'A block: :::pageBlock {kind=… plugin=…}, followed by JSON' },
      { dimension: 'What happens after declaration', them: 'The control plane reconciles actual state toward desired state', biu: '✅ Mounts and runs immediately—no apply step or scheduling wait' },
      { dimension: 'Objects per page / file', them: '⚠️ Typically one resource type per YAML; multiple resources require files or a List', biu: '✅ A page can declare any number of plugins, each owning a block' },
      { dimension: 'Composing a service', them: 'Service / Ingress connects multiple Pods', biu: '✅ Multiple plugins occupy blocks on one page; the page itself is the composition' },
      { dimension: 'Who writes declarations', them: '⚠️ Platform teams write YAML and Operators', biu: '✅ People and agents write directly in the page body' },
      { dimension: 'Extension granularity', them: 'CRD + controller (heavyweight)', biu: 'One plugin provides one interface or capability (lightweight)' },
      { dimension: 'Entry point', them: 'kubectl / API Server', biu: 'db_read / db_update / db_create' },
      { dimension: 'Self-reported state', them: 'status field + events', biu: 'db_list / + each table’s blurb' },
      { dimension: 'Permission model', them: '✅ RBAC + ServiceAccount', biu: '✅ Data views × member views' },
      { dimension: 'Traceability', them: '✅ Declarations and events are readable', biu: '✅ Append-only event stream; the interface is its projection' },
      { dimension: 'Resource isolation', them: '✅ Strong (Pod / quota / limit / namespace)', biu: '⚠️ Lightweight plugin sandbox with no hard resource limits' },
      { dimension: 'Replicas and high availability', them: '✅ Replicas, probes, and self-healing', biu: '❌ No multi-replica scheduling' },
      { dimension: 'Run arbitrary containers', them: '✅ That is its purpose', biu: '❌ Not an orchestration system' },
      { dimension: 'Form', them: 'Control plane + nodes', biu: 'Kernel (applications grow on top of it)' },
    ],
  },
  {
    slug: 'vs-office',
    title: 'BIU vs Office',
    category: 'Document Management',
    opening: 'Office defined structured productivity: documents, spreadsheets, and presentations each have their own application and file type. BIU puts them on one page, where every content type is a block sharing the same data and directly accessible to agents.',
    useWhen: 'You need precisely formatted long documents, complex formulas, or standard file formats for external delivery',
    biuWhen: 'You need structured data, agent access across the workspace, and reusable output',
    columns: ['Office', 'BIU'],
    rows: [
      { dimension: 'Core unit', them: 'Files (.docx / .xlsx / .pptx)', biu: 'Addressable path /<table>/<id>' },
      { dimension: 'Documents', them: '✅ Word (best-in-class formatting)', biu: '✅ Pages' },
      { dimension: 'Spreadsheets', them: '✅ Excel (the benchmark)', biu: '✅ Tables are first-class kernel objects' },
      { dimension: 'Presentations', them: '✅ PowerPoint', biu: '⚠️ Blocks are components, with more basic capabilities' },
      { dimension: 'Combining content types', them: '⚠️ Word / Excel / PPT are separate apps connected through embedded objects and links', biu: '✅ Documents, tables, and plugin blocks share one page and the same data' },
      { dimension: 'Data location', them: 'Local files (SharePoint for collaboration)', biu: 'Choose local or cloud when creating a space' },
      { dimension: 'Offline', them: '✅', biu: '✅ Local spaces' },
      { dimension: 'Agent access', them: '⚠️ Copilot works separately inside each application', biu: '✅ First-class access across the entire workspace' },
      { dimension: 'Who can extend it', them: 'Microsoft developers', biu: 'People and agents can both create plugins' },
      { dimension: 'Form', them: 'Application suite', biu: 'Kernel' },
    ],
  },
  {
    slug: 'vs-notion',
    title: 'BIU vs Notion',
    category: 'Document Management',
    opening: 'Notion made blocks and workspace collaboration the standard mental model, but its block types are fixed and cannot add new software to a page. BIU blocks come from plugins, letting one page combine tables, canvases, coding exercises, and video editing over the same data. BIU also goes further with data and permissions: properties can attach outside a record without changing its table, and access can target filtered conditions instead of a fixed list.',
    useWhen: 'You need mature design collaboration, a vast template library, an existing Notion workflow, or only page-level and group permissions',
    biuWhen: 'You need to combine software on one page for clients or teams, add properties without changing the source table, organize the same data from multiple angles, grant access by conditions instead of lists, or let agents read and write the workspace',
    columns: ['Notion', 'BIU'],
    rows: [
      { dimension: 'Adding information to data', them: '⚠️ Changes the database schema and affects every row; system tables cannot be changed', biu: '✅ Attach a facet: the property lives outside the record, leaves the source table unchanged, and affects only attached records—any record can use one' },
      { dimension: 'Organizing one record', them: '⚠️ A page belongs to one database; multiple perspectives require relations, rollups, or copies', biu: '✅ A record can carry multiple facets, and one facet can span different tables' },
      { dimension: 'Filtering by property', them: '✅ Database views can filter by properties', biu: '✅ Views can filter by facet fields' },
      { dimension: 'What a page can contain', them: '⚠️ Notion defines the block types; embedded sites are iframes with no workspace data access', biu: '✅ Installable plugins provide blocks that people and agents can build; plugins on one page share data, making the page a complete service' },
      { dimension: 'What gets shared', them: 'Page content and links', biu: '✅ Content, attachments, and plugin source are packaged together and work when opened' },
      { dimension: 'Data location', them: '⚠️ Primarily cloud-based; offline access is limited to previously downloaded pages', biu: '✅ Choose local or cloud when creating a space; local spaces work offline' },
      { dimension: 'Who and what receives access', them: '⚠️ People and groups (lists), scoped to entities such as pages and databases', biu: '✅ A specific account or member view; the authorized view_id carries its own filter conditions' },
      { dimension: 'Relationship between access and data', them: '⚠️ Add people after creating a page; permissions attach to entities, so new content needs separate grants', biu: '✅ Define conditions first, and every matching new record enters the authorized scope automatically' },
      { dimension: 'How permissions are resolved', them: '⚠️ View / comment / edit / full access is assigned per page; provenance usually only says access exists', biu: '✅ The highest viewer / editor / manager / owner grant wins, with provenance expanded by direct grant / member group / member view / inherited parent / space default' },
      { dimension: 'Permission inheritance', them: '⚠️ Subpages inherit from parents, but a parent owned by someone else cannot be reattached', biu: '✅ Records can attach to a parent with inherit / private / members / restricted, even when you do not own that parent' },
      { dimension: 'Edge-case controls', them: '⚠️ External invitations are coarse-grained; changing permissions requires page ownership or higher', biu: '✅ internal / external / guest categories, automatic shared status with external collaborators, and separate share and manage-permissions actions' },
      { dimension: 'Agent permissions', them: '⚠️ Agents connect as integrations and must receive pages individually', biu: '✅ An agent is an independent actor under the same authorization rules, with record-level access limited to your visible scope' },
      { dimension: 'Agents', them: '⚠️ Notion AI can read and write pages and databases but cannot add a new block type to the workspace', biu: '✅ Works on the same data as people, can be scheduled, and can build its own plugins' },
      { dimension: 'Template and integration marketplace', them: '✅ Vast library of templates and third-party integrations', biu: '❌ No template marketplace yet; external services require a custom plugin or MCP' },
      { dimension: 'Maturity', them: '✅ Years of refinement in collaborative editing and permissions, with a vast template ecosystem', biu: '⚠️ A more granular model, but collaborative editing, permission polish, and plugin ecosystem are not yet at Notion’s level' },
    ],
  },
  {
    slug: 'vs-airtable',
    title: 'BIU vs Airtable',
    category: 'App Building',
    opening: 'Airtable proved that entering data can create an application. BIU follows the same path but gives you the interface layer too: a view is not one of a few platform presets, but an addressable record in its own right.',
    useWhen: 'You need no-code table apps, mature view options, a rich template ecosystem, or team collaboration',
    biuWhen: 'You need tools and content represented by the same kind of object, agents that can edit the interface itself, or control over your data boundaries',
    columns: ['Airtable', 'BIU'],
    rows: [
      { dimension: 'Core idea', them: 'Enter data and get an application', biu: 'Data and interfaces are the same kind of object' },
      { dimension: 'Data and interface', them: 'Two layers: records hold content and the platform provides views', biu: 'One layer: pages and plugin declarations both use /<table>/<id>' },
      { dimension: 'View customization', them: '⚠️ Choose and configure the available view types', biu: '✅ The interface is a record that can be read, written, copied, and shared' },
      { dimension: 'What agents can operate', them: '⚠️ Primarily records; the interface layer is platform-private', biu: '✅ Records and interfaces use the same db_* interface' },
      { dimension: 'Adding a capability', them: '⚠️ Extensions or scripts, within platform limits', biu: '✅ Declare a plugin on a page and it takes effect' },
      { dimension: 'Who can extend it', them: 'People who can write scripts', biu: '✅ People and agents use the same interface' },
      { dimension: 'Data location', them: 'Vendor-hosted cloud', biu: 'Choose local or cloud when creating a space' },
      { dimension: 'Data portability', them: '⚠️ Export-based, with limited preservation of formats and views', biu: '✅ Dual access: API or direct file access' },
      { dimension: 'Ready out of the box', them: '✅ Strong, with many views and templates', biu: '⚠️ Plugin ecosystem is still emerging' },
      { dimension: 'Learning curve', them: '✅ Drag and drop, accessible to nontechnical teams', biu: '❌ Plugin declarations require JSON, creating a noticeably higher barrier' },
      { dimension: 'Hosting and operations', them: '✅ Managed by the vendor', biu: '❌ Self-hosted, with no managed SLA' },
      { dimension: 'Form', them: 'Complete platform', biu: 'Kernel (applications grow on top of it)' },
    ],
  },
  {
    slug: 'vs-retool',
    title: 'BIU vs Retool',
    category: 'App Building',
    opening: 'Retool cuts internal-tool development from weeks to hours with its component library. BIU differs at that layer: components are not issued by the platform; each one is an addressable record you can edit, copy, or have an agent rewrite.',
    useWhen: 'You need to build internal admin tools quickly, connect existing databases and APIs, or use enterprise permissions and auditing',
    biuWhen: 'You need programmatic control of the interface, tools that can grow into external products, or ownership of your data boundaries',
    columns: ['Retool', 'BIU'],
    rows: [
      { dimension: 'Core idea', them: 'Build internal tools by dragging components', biu: 'Components themselves are data' },
      { dimension: 'Component source', them: '⚠️ A preset platform library defines the capability boundary', biu: '✅ A plugin declaration is a component; write one and it exists' },
      { dimension: 'Programmatic interface changes', them: '⚠️ Uses platform APIs and configuration; the interface is not addressable', biu: '✅ The interface is a record that can be read, written, and replaced directly' },
      { dimension: 'Ownership of what you build', them: '⚠️ It does not function outside the platform', biu: '✅ Exists as data, accessible through the API or directly on disk' },
      { dimension: 'What agents can operate', them: '⚠️ Access through its API, without visibility into the interface layer', biu: '✅ Data and interfaces use the same db_* interface' },
      { dimension: 'Tool audience', them: '⚠️ Designed for internal tools, not external products', biu: '✅ The same system serves internal and external use' },
      { dimension: 'Existing data sources', them: '✅ Strong database and API connector library', biu: '⚠️ Workspace data comes first; external access requires custom work' },
      { dimension: 'Permissions and auditing', them: '✅ Mature and enterprise-grade', biu: '⚠️ Has a permission model, but less complete auditing' },
      { dimension: 'Ecosystem and templates', them: '✅ Mature', biu: '⚠️ Plugin ecosystem is still emerging' },
      { dimension: 'Learning curve', them: '✅ Drag and drop', biu: '❌ Plugin declarations require JSON, creating a noticeably higher barrier' },
      { dimension: 'Hosting and operations', them: '✅ Managed by the vendor', biu: '❌ Self-hosted, with no managed SLA' },
      { dimension: 'Form', them: 'Complete platform', biu: 'Kernel (applications grow on top of it)' },
    ],
  },
  {
    slug: 'vs-supabase',
    title: 'BIU vs Supabase',
    category: 'App Building',
    opening: 'Supabase packages the backend—Postgres, authentication, storage, and realtime—so you only build the frontend. BIU provides neither backend nor frontend; it provides one kind of object, with data, interfaces, and agents all using /<table>/<id>.',
    useWhen: 'You need standard backend capabilities, a team-built frontend, SQL, and mature cloud hosting',
    biuWhen: 'You need data and interfaces represented by the same object, agents that can edit the interface itself, or a single boundary to maintain',
    columns: ['Supabase', 'BIU'],
    rows: [
      { dimension: 'Core idea', them: 'Backend as a service; build your own frontend', biu: 'Data, interfaces, and agents are the same kind of object' },
      { dimension: 'What it provides', them: 'Postgres + authentication + storage + realtime', biu: 'Addressable data + plugin declarations' },
      { dimension: 'Interface source', them: '❌ Build it yourself (React / Vue…)', biu: '✅ Declare it on a page and it appears' },
      { dimension: 'Core object', them: 'Tables / rows (SQL and SDK)', biu: '✅ /<table>/<id>; everything uses the same form' },
      { dimension: 'What agents can operate', them: '⚠️ Read and write data through APIs, without visibility into the interface layer', biu: '✅ Data and interfaces use the same db_* interface' },
      { dimension: 'Frontend / backend boundary', them: 'Two layers: it manages the backend; you manage the frontend', biu: '✅ One layer, with no duplicate boundary to maintain' },
      { dimension: 'Data location', them: '✅ Cloud-hosted or self-hosted', biu: 'Choose local or cloud when creating a space' },
      { dimension: 'Data portability', them: '✅ Standard Postgres, exportable at any time', biu: '✅ Dual access: API or direct file access' },
      { dimension: 'Backend capabilities', them: '✅ Strong (SQL, RLS, Edge Functions, vectors)', biu: '⚠️ Not specialized; complex queries require custom plugins' },
      { dimension: 'Ecosystem and documentation', them: '✅ Mature, with an active community', biu: '⚠️ Plugin ecosystem is still emerging' },
      { dimension: 'Learning curve', them: '✅ Ready for frontend developers', biu: '❌ Plugin declarations require JSON, creating a noticeably higher barrier' },
      { dimension: 'Hosting and operations', them: '✅ Vendor-hosted or self-hosted', biu: '❌ Self-hosted, with no managed SLA' },
      { dimension: 'Form', them: 'Backend platform', biu: 'Kernel' },
    ],
  },
  {
    slug: 'vs-cursor',
    title: 'BIU vs Cursor',
    category: 'Coding Harness',
    opening: 'Cursor puts agents in the editor and focuses on code. BIU goes beyond code: agents and their output are workspace data that can be read, written, copied, and shared. BIU’s design also draws on Cursor’s agent-native approach.',
    useWhen: 'You write code in an editor and need deep code understanding and completion',
    biuWhen: 'You need multiple agents to collaborate, reusable output, or a workspace that extends beyond code',
    columns: ['Cursor', 'BIU'],
    rows: [
      { dimension: 'Agent role', them: 'A tool inside the editor', biu: 'Agents are data' },
      { dimension: 'Core object', them: 'Predefined by the editor application', biu: 'Data itself is the core object' },
      { dimension: 'Work domain', them: 'Code repositories', biu: 'Pages, tables, tasks, and plugins; code is one type among many' },
      { dimension: 'Multiple agents', them: '✅ Parallel and cloud agents', biu: '✅ Work is divided on task boards, with dependencies mapped as a graph' },
      { dimension: 'Context', them: '✅ @ references + code indexing (strong)', biu: 'Reads workspace pages, data, and operation history' },
      { dimension: 'Persistent output', them: '⚠️ Saved in your project', biu: '✅ Saved as tables / skills / pages' },
      { dimension: 'Code completion', them: '✅ Strong (not BIU’s specialty)', biu: '⚠️ Not a specialty' },
      { dimension: 'Form', them: 'Application', biu: 'Kernel' },
    ],
  },
  {
    slug: 'vs-dsh',
    title: 'BIU vs DeepSeek Harness',
    category: 'Coding Harness',
    opening: 'DSH gets the division right: the model thinks, while the harness acts in the real environment. BIU agrees, but relocates the “environment” from a local file system to addressable data.',
    useWhen: 'You need a terminal coding agent, DeepSeek models, plugins, or multi-agent orchestration',
    biuWhen: 'You need agents and their output stored in the same addressable data and reusable through interfaces',
    columns: ['DeepSeek Harness', 'BIU'],
    rows: [
      { dimension: 'Core idea', them: 'The model thinks; the harness executes', biu: 'The model thinks; data is the environment' },
      { dimension: 'Environment', them: 'Local file system + terminal', biu: 'Workspace: /<table>/<id>' },
      { dimension: 'Operating on the environment', them: 'Tool calls (file I/O and commands)', biu: '✅ db_read / db_update / db_action' },
      { dimension: 'What the agent is', them: '⚠️ Harness configuration and runtime object', biu: '✅ An addressable record' },
      { dimension: 'Plugin support', them: '✅ Open plugin ecosystem', biu: '✅ A declaration becomes a plugin and mounts when added to a page' },
      { dimension: 'Who extends it', them: '⚠️ Plugin developers', biu: '✅ People and agents use the same db_* interface' },
      { dimension: 'Output location', them: '⚠️ The project directory in your terminal', biu: '✅ Stored as addressable tables / skills / pages' },
      { dimension: 'Interface', them: 'Terminal (TUI)', biu: '✅ Pages are data that can be edited and reused directly' },
      { dimension: 'Multiple agents', them: '✅ Supports orchestration', biu: '✅ Task boards act as the bus, with dependencies mapped as a graph' },
      { dimension: 'Model choice', them: 'Primarily DeepSeek, with support for others', biu: '✅ Configurable and vendor-neutral' },
      { dimension: 'Coding specialization', them: '✅ Deep focus on real engineering tasks', biu: '⚠️ Not a specialty' },
      { dimension: 'Ecosystem and maturity', them: '✅ Coding-focused, comparable to Codex / Claude Code', biu: '⚠️ Plugin ecosystem is still emerging' },
      { dimension: 'Form', them: 'Terminal agent runtime', biu: 'Kernel' },
    ],
  },
  {
    slug: 'vs-pi',
    title: 'BIU vs Pi',
    category: 'Coding Harness',
    opening: 'Pi breaks the harness into composable parts and keeps only four core tools. Its minimal, embeddable approach is close to BIU’s. The difference is the destination: Pi assembles a terminal agent, while BIU assembles its own interface and data.',
    useWhen: 'You want to assemble your own coding agent, need a minimal embeddable runtime, or prefer MIT-licensed software you can modify',
    biuWhen: 'You need the result to be both interface and data, with agents able to modify the system they inhabit',
    columns: ['Pi', 'BIU'],
    rows: [
      { dimension: 'Core idea', them: 'Minimal, composable core', biu: 'Minimal kernel, with data as the extension point' },
      { dimension: 'Extensibility', them: '✅ Layered architecture: model / core / terminal', biu: '✅ Plugin registry (sandbox → pack → mount)' },
      { dimension: 'Extension format', them: 'npm packages / extensions / skills', biu: 'A plugin declaration on a page or a plugin package' },
      { dimension: 'Who extends it', them: '⚠️ TypeScript developers', biu: '✅ People and agents use the same db_* interface' },
      { dimension: 'Number of basic tools', them: 'Deliberately minimal (4)', biu: '⚠️ A broader db_* family, but less minimal' },
      { dimension: 'Environment', them: 'Local file system + terminal', biu: '/<table>/<id>, with files as just one type' },
      { dimension: 'Output location', them: '⚠️ Project directories and sessions', biu: '✅ Stored as addressable tables / skills / pages' },
      { dimension: 'Interface', them: 'Terminal (TUI) with reusable components', biu: '✅ The interface is data that can be read, written, copied, and shared' },
      { dimension: 'Multiple agents', them: '⚠️ Single-agent loop with a lighter orchestration layer', biu: '✅ Task boards act as the bus, with dependencies mapped as a graph' },
      { dimension: 'Embedding elsewhere', them: '✅ Strong; embeddability is a design goal', biu: '⚠️ Kernel-centered and requires adaptation for embedding' },
      { dimension: 'Maturity', them: '✅ Clear architecture and documentation', biu: '⚠️ Plugin ecosystem is still emerging' },
      { dimension: 'Form', them: 'Agent framework', biu: 'Kernel' },
    ],
  },
  {
    slug: 'vs-chatgpt',
    title: 'BIU vs ChatGPT',
    category: 'General Assistants',
    opening: 'ChatGPT defined conversational AI. BIU focuses on what happens after the conversation: where the output goes.',
    useWhen: 'You need quick answers, brainstorming, learning, or general conversation',
    biuWhen: 'You need output preserved as addressable records and agents that can read and write your workspace',
    columns: ['ChatGPT', 'BIU'],
    rows: [
      { dimension: 'Basic unit', them: 'Conversation (message)', biu: 'Addressable path /<table>/<id>' },
      { dimension: 'Output location', them: '⚠️ Primarily remains in conversations, with Canvas and Projects for organization', biu: '✅ Stored as pages / tables / skills' },
      { dimension: 'Cost of creating an interface', them: '⚠️ Generate new HTML / code each time', biu: '✅ Write three fields (kind + plugin + JSON) and reuse one plugin anywhere' },
      { dimension: 'Can agents extend the system?', them: '⚠️ GPTs and connectors add capabilities but cannot modify the workspace itself', biu: '✅ Agents can create plugins and mount them on pages' },
      { dimension: 'Context', them: 'Conversations, memory, and uploaded files', biu: 'The same workspace pages and data you see' },
      { dimension: 'General knowledge Q&A', them: '✅ Strong (not BIU’s specialty)', biu: '⚠️ Depends on the configured model' },
      { dimension: 'Data location', them: 'Cloud', biu: 'Choose local or cloud when creating a space' },
    ],
  },
  {
    slug: 'vs-claude',
    title: 'BIU vs Claude',
    category: 'General Assistants',
    opening: 'Claude is strong at long-document understanding and code, while MCP standardizes tool connections. BIU differs in one key way: an agent does not just call tools—it is addressable data itself.',
    useWhen: 'You need long-document analysis, code collaboration, or external tools connected through MCP',
    biuWhen: 'You need agents to build tools, multiple agents to collaborate, or control over your data boundaries',
    columns: ['Claude', 'BIU'],
    rows: [
      { dimension: 'Agent role', them: 'An assistant in a conversation', biu: 'A workspace record that can be scheduled and copied' },
      { dimension: 'Self-extension', them: '⚠️ Connects externally through MCP', biu: '✅ Agents build their own plugins' },
      { dimension: 'Persistent output', them: '⚠️ Artifacts and Projects retain output, but not as workspace data', biu: '✅ Stored as addressable objects' },
      { dimension: 'Multi-agent collaboration', them: '⚠️ Primarily centered on individual conversations', biu: '✅ Work is divided on task boards, with dependencies mapped as a graph' },
      { dimension: 'Long-document understanding', them: '✅ Strong (not BIU’s specialty)', biu: '⚠️ Depends on the configured model' },
      { dimension: 'Data location', them: 'Cloud', biu: 'Choose local or cloud when creating a space' },
      { dimension: 'Form', them: 'Application', biu: 'Kernel' },
    ],
  },
  {
    slug: 'vs-obsidian',
    title: 'BIU vs Obsidian',
    category: 'Document Management',
    opening: 'Obsidian proved that local-first can win, and its community plugins render canvases and queries inside notes. It is the closest comparison to BIU, but BIU plugin blocks read and write structured data, with agents in the same workspace.',
    useWhen: 'You need fully local notes, Markdown files, or a mature community plugin ecosystem',
    biuWhen: 'You need local storage together with collaboration, structured data, and agent access',
    columns: ['Obsidian', 'BIU'],
    rows: [
      { dimension: 'Data location', them: 'Local folder', biu: 'Choose local or cloud when creating a space' },
      { dimension: 'Offline', them: '✅', biu: '✅ Local spaces' },
      { dimension: 'Collaboration', them: '⚠️ Official Sync works across devices, without real-time multiplayer editing', biu: '⚠️ Cloud spaces support members and permissions; the official cloud service is coming soon' },
      { dimension: 'Structured data', them: '⚠️ Properties + Bases views, with Markdown files underneath', biu: '✅ Tables are first-class kernel objects' },
      { dimension: 'Plugins on pages', them: '✅ Community plugins render inside notes, such as Excalidraw and Dataview', biu: '✅ Plugin blocks share the same data and are packaged with the page when shared' },
      { dimension: 'Data visibility', them: '✅ Plain files (maximum transparency)', biu: '✅ Dual access: API or direct file access' },
      { dimension: 'Agents', them: '⚠️ Models connect through community plugins', biu: '✅ First-class objects in the same address space' },
      { dimension: 'Plugin ecosystem', them: '✅ Mature community ecosystem', biu: '⚠️ Still in its early stages' },
      { dimension: 'Traceability', them: '⚠️ Relies on Git or sync-service version history', biu: '✅ Append-only event stream' },
    ],
  },
]

/** 被问得最多的三组，放在总览最上面。 */
export const COMPARE_FEATURED = ['vs-notion', 'vs-obsidian', 'vs-chatgpt'] as const

export const COMPARE_CATEGORIES = [
  { name: 'Infrastructure', slugs: ['vs-linux', 'vs-k8s'] },
  { name: 'Document Management', slugs: ['vs-office', 'vs-obsidian', 'vs-notion'] },
  { name: 'App Building', slugs: ['vs-airtable', 'vs-retool', 'vs-supabase'] },
  { name: 'Coding Harness', slugs: ['vs-cursor', 'vs-dsh', 'vs-pi'] },
  { name: 'General Assistants', slugs: ['vs-chatgpt', 'vs-claude'] },
] as const

const MARKS = [
  { emoji: '✅', kind: 'yes', label: 'Supported' },
  { emoji: '⚠️', kind: 'partial', label: 'Partially supported' },
  { emoji: '❌', kind: 'no', label: 'Not supported' },
] as const

/** 表格里的 ✅ / ⚠️ / ❌ 换成同色系的圆形标记；原字符留在 DOM 里，读屏和复制都还在。 */
function CompareCell({ text }: { text: string }) {
  const mark = MARKS.find((item) => text.startsWith(item.emoji))
  if (!mark) return <>{text}</>
  const rest = text.slice(mark.emoji.length).trim()
  return (
    <span className="site-compare-cell">
      <span className="site-mark" data-mark={mark.kind} title={mark.label}>{mark.emoji}</span>
      <span>{rest || mark.label}</span>
    </span>
  )
}

function CompareLegend() {
  return (
    <p className="site-compare-legend" aria-label="Legend">
      {MARKS.map((item) => (
        <span key={item.kind}>
          <span className="site-mark" data-mark={item.kind} aria-hidden />
          {item.label}
        </span>
      ))}
    </p>
  )
}

function CompareTable({ page }: { page: ComparePage }) {
  return (
    <table className="site-compare-table">
      <thead>
        <tr>
          <th>Dimension</th>
          <th>{page.columns[0]}</th>
          <th className="is-biu">{page.columns[1]}</th>
        </tr>
      </thead>
      <tbody>
        {page.rows.map((row) => (
          <tr key={row.dimension}>
            <th scope="row">{row.dimension}</th>
            <td><CompareCell text={row.them} /></td>
            <td className="is-biu"><CompareCell text={row.biu} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const COMPARE_FAQ = [
  ['Who wrote these comparisons?', 'BIU wrote these comparisons using verifiable facts and explicitly noting what it cannot yet do. If anything is inaccurate, please report it on GitHub.'],
  ['Can BIU replace existing tools?', 'Not in every case. Each comparison explains when the other product remains the better choice and when BIU is a better fit.'],
  ['Can BIU work alongside existing tools?', 'Yes. BIU brings documents, tables, applications, and agents onto one page without requiring you to abandon your current tools.'],
] as const

export function MarketingCompareIndex({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: 'Compare',
    description: 'Compare BIU with leading products across each category: Linux, Kubernetes, Office, Notion, Airtable, Retool, Supabase, Cursor, DeepSeek Harness, Pi, ChatGPT, Claude, and Obsidian.',
    path: '/compare',
  })
  const bySlug = new Map(COMPARE_PAGES.map((page) => [page.slug, page]))

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero" data-reveal>
          <p className="site-section-label">Compare</p>
          <h1>Compare BIU with the best in every category</h1>
          <p className="site-page-lead">
            Each of these products excels in one area—structure, collaboration, conversation, local-first work, or coding.
            BIU brings those strengths onto one page, where documents, tables, applications, and agents share the same data.
            Every table is candid about what BIU cannot yet do.
          </p>
        </section>

        <section className="site-compare-index">
          <div className="site-compare-group site-compare-featured" data-reveal>
            <h2>Most requested</h2>
            <div className="site-compare-cards">
              {COMPARE_FEATURED.map((slug) => {
                const page = bySlug.get(slug)
                if (!page) return null
                return (
                  <Link key={slug} to={`/compare/${slug}`} className="site-compare-card">
                    <small>{page.category}</small>
                    <h3>{page.title}</h3>
                    <p>{page.opening}</p>
                  </Link>
                )
              })}
            </div>
          </div>
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
          <p className="site-compare-note">
            Information current as of October 2026. Products change quickly; if anything is inaccurate, please <a href={`${GITHUB_URL}/issues`} target="_blank" rel="noreferrer">report it on GitHub</a>.
          </p>
        </section>

        <SiteFaq title="About these comparisons" items={COMPARE_FAQ} />

        <SiteFinalCta title="See the difference for yourself" />
    </SiteChrome>
  )
}

export function MarketingCompareDetail({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  const { slug } = useParams<{ slug: string }>()
  const page = COMPARE_PAGES.find((item) => item.slug === slug)
  usePageMeta({
    title: page?.title ?? 'Compare',
    description: page?.opening ?? 'A dimension-by-dimension comparison of BIU and other products.',
    path: `/compare/${slug ?? ''}`,
  })

  if (!page) {
    return (
      <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero">
          <p className="site-section-label">Compare</p>
          <h1>Comparison not found</h1>
          <p className="site-page-lead"><Link to="/compare">Back to all comparisons</Link></p>
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
          <CompareLegend />
          <CompareTable page={page} />
          <p className="site-compare-note">
            Information current as of October 2026. If anything is inaccurate, please <a href={`${GITHUB_URL}/issues`} target="_blank" rel="noreferrer">report it on GitHub</a>.
          </p>
        </section>

        <section className="site-compare-when" data-reveal>
          <article>
            <h2>Choose {page.columns[0]} when you need</h2>
            <p>{page.useWhen}</p>
          </article>
          <article>
            <h2>Choose BIU when you need</h2>
            <p>{page.biuWhen}</p>
          </article>
        </section>

        {others.length ? (
          <section className="site-compare-more" data-reveal>
            <h2>Similar comparisons</h2>
            <div className="site-compare-cards">
              {others.map((item) => (
                <Link key={item.slug} to={`/compare/${item.slug}`} className="site-compare-card">
                  <h3>{item.title}</h3>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <SiteFinalCta title="See the difference for yourself" />
    </SiteChrome>
  )
}
