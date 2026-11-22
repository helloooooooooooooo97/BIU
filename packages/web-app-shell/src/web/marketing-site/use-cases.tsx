import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SiteChrome, SiteFaq, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'
import { IndustryInteractiveDemo } from './industry-demos.tsx'
import type { DemoPageSpec } from './scene-page-demo.tsx'

export type CustomPlugin = {
  name: string
  body: string
}

export type RoleWorkflow = {
  id: string
  role: string
  pageTitle: string
  summary: string
  deliverTo: string
  blocks: string[]
  customPlugins: CustomPlugin[]
  demo: DemoPageSpec
}

export type UseCase = {
  slug: string
  index: string
  title: string
  summary: string
  roleLabels: string[]
  output: string
  roles: RoleWorkflow[]
  pain: string[]
  how: { title: string; body: string }[]
  faq: [string, string][]
  blocks: string[]
}

const DEMO_LABELS_EN: SceneDemoLabels = {
  demoBadge: 'Interactive BIU Page Preview',
  shareLabel: 'Shareable page link',
  customBadge: 'AI custom plugin',
  builtInBadge: 'Built-in plugin',
  totalLabel: 'Live total',
  aiLabel: 'AI Collaborator',
}

export const USE_CASES: UseCase[] = [
  {
    slug: 'tech',
    index: '01',
    title: 'Tech & Software',
    summary: 'Unify specifications, clickable prototypes, diagnostic terminals, and multi-agent task boards inside role-specific pages—eliminating constant context switching.',
    roleLabels: ['Product Manager', 'Software Engineer', 'Product Designer', 'Indie Developer'],
    output: 'Live PRD & prototype · Executable runbook · Multi-agent board',
    blocks: ['HTML', 'Excalidraw whiteboard', 'Page terminal', 'Code runner', 'Tasks'],
    roles: [
      {
        id: 'pm',
        role: 'Product Manager',
        pageTitle: 'v2.4 Checkout Redesign · PRD & Prototype Review',
        summary: 'Keep requirements, flowcharts, clickable HTML prototypes, and stakeholder sign-off on one page—present full-screen and break down tasks in place.',
        deliverTo: 'Share with engineering and stakeholders: review the clickable prototype in the meeting, then turn decisions directly into tasks.',
        blocks: ['HTML', 'Excalidraw whiteboard', 'Table', 'Tasks'],
        customPlugins: [
          { name: 'Option Voting & Review Card', body: 'Compare two UX directions side by side and record stakeholder votes directly on the spec.' },
          { name: 'Launch & Telemetry Checklist', body: 'Generate a verifiable QA and analytics checklist tied directly to the page requirements.' },
        ],
        demo: {
          title: 'v2.4 Checkout Redesign · PRD & Prototype Review',
          badge: 'Tech & Software / Product Manager',
          props: [
            ['Owner', 'Lin Lan (PM)'],
            ['Review Status', 'Ready for Eng Sign-off'],
            ['Target KPI', 'Conversion +4.5%'],
          ],
          intro: 'Consolidate the two-step checkout into a single-page express flow. Review the target metrics and launch checklist below before breaking out engineering tasks.',
          blocks: [
            {
              kind: 'metrics',
              plugin: 'Goal Metrics Card',
              custom: true,
              title: 'Before vs. Target Metrics',
              items: [
                { label: 'Checkout Drop-off', value: '38% → 24%', hint: '-14pp target' },
                { label: 'Median Completion', value: '62s → 19s', hint: '2 fewer page loads' },
                { label: 'Order Value Lift', value: '+3.2%', hint: 'Express add-on slot' },
              ],
            },
            {
              kind: 'checklist',
              plugin: 'Launch Checklist',
              custom: true,
              title: 'Review Decisions & Pre-flight Checks (interactive)',
              items: [
                { label: 'Pre-select last payment method to remove extra modal', meta: 'Option A · 5 votes', done: true },
                { label: 'Auto-apply highest eligible coupon with manual override', meta: 'Web + API', done: true },
                { label: 'Preserve form state on payment failure for one-click retry', meta: 'Telemetry pending', done: false },
                { label: 'Roll out to 10% traffic for 24h before full release', meta: 'Owner: Zhou', done: false },
              ],
            },
          ],
          aiPrompt: 'Reviewed @CheckoutDropoffFeedback: moving invoice details to post-purchase removes two required fields. Would you like me to create the corresponding tasks on the board?',
        },
      },
      {
        id: 'engineer',
        role: 'Software Engineer',
        pageTitle: 'Order Timeout Triage · Executable Runbook',
        summary: 'Combine architecture diagrams, diagnostic scripts, a live terminal, and rollback checklists so on-call engineers run checks straight from the doc.',
        deliverTo: 'Built for on-call rotations and teammates: replace stale static wikis with a runbook that executes directly.',
        blocks: ['Page terminal', 'Code runner', 'Browser', 'Tasks'],
        customPlugins: [
          { name: 'API Health & Probe Card', body: 'Keep key diagnostic endpoints and live responses inside the runbook for one-click checks.' },
          { name: 'Release & Rollback Checklist', body: 'Group migrations, feature flags, and rollback commands into one executable list.' },
        ],
        demo: {
          title: 'Order Timeout Triage · Executable Runbook',
          badge: 'Tech & Software / Software Engineer',
          props: [
            ['Service', 'order-gateway'],
            ['Last Drill', '2026-11-18'],
            ['Channel', '#oncall-core'],
          ],
          intro: 'When P99 latency exceeds 800ms or payment callbacks back up, run the diagnostic command below and verify each mitigation step.',
          blocks: [
            {
              kind: 'code',
              plugin: 'Code Runner',
              title: 'Step 1: Inspect queue lag and P99 latency',
              lang: 'bash · runs directly on page',
              code: 'curl -s https://api.internal/health/queue | jq "{lag: .pending, p99_ms: .latency_p99}"',
              output: '{ "lag": 142, "p99_ms": 918 }  # ⚠ lag > 100 — proceed to Step 2 worker scale-up',
            },
            {
              kind: 'checklist',
              plugin: 'Mitigation Checklist',
              custom: true,
              title: 'Incident Mitigation Steps (interactive)',
              items: [
                { label: 'Scale payment-worker concurrency from 8 to 16', meta: 'Verified safe on DB locks', done: true },
                { label: 'Pause non-critical loyalty sync to prioritize primary orders', meta: 'Flag: sync_points=off', done: false },
                { label: 'Send last 10m slow SQL logs to @DBA-Agent for index review', meta: 'Dispatched', done: false },
              ],
            },
          ],
          aiPrompt: 'Cross-checked recent commits: slow query #3 stems from an unindexed column added in commit 8f21a. Migration SQL is drafted and awaiting your confirmation.',
        },
      },
    ],
    pain: [
      'Specs, mockups, issue trackers, and diagnostic scripts live in separate tools, fragmenting context across every release.',
      'Conventional docs only hold static text and links—prototypes cannot run, commands cannot execute, and wikis quickly go stale.',
      'Individual AI chats keep solutions trapped in private threads instead of building shared engineering assets.',
    ],
    how: [
      { title: 'Docs, prototypes, and terminals in one page', body: 'Embed clickable HTML prototypes, runnable code blocks, and live terminals directly beside documentation.' },
      { title: 'Coordinate people and agents on one board', body: 'Break work into task cards with owners and dependencies so agents work directly from the page context.' },
      { title: 'Generate custom internal tools on demand', body: 'Have an agent build voting cards, QA checklists, or API testers directly into the page without maintaining separate apps.' },
    ],
    faq: [
      ['Can BIU work alongside GitHub and Jira?', 'Yes. Connect external repositories and trackers via MCP so agents can read and synchronize context across systems.'],
      ['Can engineering runbooks stay strictly local?', 'Yes. Local spaces store all pages and scripts on your own computer and remain available offline.'],
    ],
  },
  {
    slug: 'education',
    index: '02',
    title: 'Education & Coaching',
    summary: 'Whether running technical interview coaching, interactive courses, or corporate training, combine notes, whiteboards, live code, and quizzes in one shareable page.',
    roleLabels: ['Tech & Career Mentor', 'University & K12 Teacher', 'Course Creator', 'Corporate Trainer'],
    output: 'Coaching workspace · Interactive lesson · Practice & review',
    blocks: ['Excalidraw whiteboard', 'Coding challenge', 'Code runner', 'HTML', 'Table'],
    roles: [
      {
        id: 'mentor',
        role: 'Tech & Career Mentor',
        pageTitle: 'Week 4 · Trees & Dynamic Programming Coaching',
        summary: 'Combine whiteboard explanations, coding challenges, a live code runner, and an offer comparison matrix in one page delivered to students.',
        deliverTo: 'Send one link to your student: sketch ideas, write code, and run test cases directly in the browser with zero setup.',
        blocks: ['Excalidraw whiteboard', 'Coding challenge', 'Code runner', 'Table'],
        customPlugins: [
          { name: 'Topic Mastery Tracker', body: 'Summarizes pass rates by algorithm category so weak areas stand out immediately.' },
          { name: 'Mock Interview Scorecard', body: '45-minute timer with rubric scoring saved right alongside the code written in session.' },
        ],
        demo: {
          title: 'Week 4 · Trees & Dynamic Programming Coaching',
          badge: 'Education & Coaching / Tech Mentor',
          props: [
            ['Student', 'Alex Chen (Backend)'],
            ['Target Role', 'Infrastructure Engineer'],
            ['Next Onsite', '12 days'],
          ],
          intro: 'This week focuses on tree path recursion and knapsack state compression. Review the state diagram above, then complete and verify the exercise below.',
          blocks: [
            {
              kind: 'code',
              plugin: 'Coding Challenge + Code Runner',
              title: 'Exercise: Binary Tree Maximum Path Sum',
              lang: 'Python 3 · 3/3 test cases passed (42ms)',
              code: 'def max_path_sum(root):\n    best = -10**9\n    def dfs(node):\n        nonlocal best\n        if not node: return 0\n        l, r = max(0, dfs(node.left)), max(0, dfs(node.right))\n        best = max(best, node.val + l + r)\n        return node.val + max(l, r)\n    dfs(root)\n    return best',
              output: 'PASS [1,2,3] => 6  |  PASS [-10,9,20,null,null,15,7] => 42  |  PASS [-3] => -3',
            },
            {
              kind: 'table',
              plugin: 'Offer Comparison Table',
              title: 'Interview Pipeline & Offer Matrix',
              columns: ['Company & Team', 'Stage', 'Est. Comp', 'Key Focus Areas'],
              rows: [
                ['Company A · Cloud Native', 'Offer Received', '$185k', 'Concurrency & Graphs'],
                ['Company B · Storage Engine', 'Round 2', '$195k', 'Tree DP & Systems'],
                ['Company C · AI Infra', 'Round 1 Passed', '$210k', 'Scheduling & Coding'],
              ],
            },
          ],
          aiPrompt: 'Graded against your rubric: O(N) time complexity is optimal. Remind the student to call out empty-tree and all-negative edge cases upfront during interviews.',
        },
      },
      {
        id: 'teacher',
        role: 'Teacher & Instructor',
        pageTitle: 'Lecture 3 · Compounding & Discounted Cash Flow',
        summary: 'Embed interactive visualizations and self-check quizzes directly inside lesson notes so students grasp abstract principles hands-on.',
        deliverTo: 'Share one link per lecture: students explore interactive models and review checkpoints without an expensive LMS.',
        blocks: ['HTML', 'Excalidraw whiteboard', 'Table of contents'],
        customPlugins: [
          { name: 'Self-Grading Quiz Card', body: 'Provides instant scores and explanations while flagging missed concepts for review.' },
          { name: 'Concept Flashcards', body: 'Turns core definitions and formulas into flip cards for quick pre-exam study.' },
        ],
        demo: {
          title: 'Lecture 3 · Compounding & Discounted Cash Flow',
          badge: 'Education & Coaching / Instructor',
          props: [
            ['Course', 'Intro to Financial Engineering'],
            ['Session', 'Lecture 3 of 12'],
            ['Due Date', 'Friday 22:00'],
          ],
          intro: 'Compare 10-year outcomes across annual return rates below to build intuition for compounding, then complete the core checkpoints.',
          blocks: [
            {
              kind: 'metrics',
              plugin: 'Interactive Concept Block',
              custom: true,
              title: '10-Year Value of $10,000 by Annual Return Rate',
              items: [
                { label: '3% Annual (CD)', value: '$13,439', hint: '+34.4% total gain' },
                { label: '7% Annual (Index)', value: '$19,672', hint: '+96.7% total gain' },
                { label: '12% Annual (Growth)', value: '$31,058', hint: '+210.6% total gain' },
              ],
            },
            {
              kind: 'checklist',
              plugin: 'Mastery Checkpoints',
              custom: true,
              title: 'Key Learning Objectives (interactive)',
              items: [
                { label: 'Distinguish nominal interest rate from effective annual yield', meta: 'Concept', done: true },
                { label: 'Apply the Rule of 72 to estimate doubling time', meta: 'Mental math', done: true },
                { label: 'Complete the two discount-rate sensitivity exercises below', meta: 'Homework', done: false },
              ],
            },
          ],
          aiPrompt: 'Need a fresh problem set for next semester? I can generate five new exercises with worked solutions while preserving the same learning objectives.',
        },
      },
    ],
    pain: [
      'Static PDFs and handouts keep learning passive—coding, diagramming, and quizzes all force students onto separate platforms.',
      'Dedicated LMS platforms are costly and rigid, making custom teaching tools out of reach for independent instructors.',
      'Notes, whiteboard sketches, assignments, and feedback scatter across chat groups and shared folders.',
    ],
    how: [
      { title: 'Lessons and interactive practice live together', body: 'Whiteboards, code runners, visual demos, and quizzes sit right inside the reading flow.' },
      { title: 'One link delivers the entire session', body: 'Students open your shared link and start practicing immediately with no account friction.' },
      { title: 'Custom teaching blocks without coding', body: 'Describe the visualization or quiz format you need and let an agent generate the plugin for your lesson.' },
    ],
    faq: [
      ['Do students need to install a desktop app?', 'No. Shared pages bundle content, attachments, and plugins so everything runs directly in the browser.'],
      ['Who owns my course materials?', 'You do. Local spaces store everything on your own computer, and BIU is open source with no platform lock-in.'],
    ],
  },
  {
    slug: 'media',
    index: '03',
    title: 'Media & Marketing',
    summary: 'From video production rooms to launch campaign hubs, keep scripts, timeline previews, thumbnail tests, and budget calculators synchronized on one page.',
    roleLabels: ['Video Creator & Producer', 'Content Ops', 'Brand Marketing', 'Growth Team'],
    output: 'Video production room · Campaign hub · Channel budget sheet',
    blocks: ['Video editor', 'Excalidraw whiteboard', 'HTML', 'Table'],
    roles: [
      {
        id: 'creator',
        role: 'Video Creator & Producer',
        pageTitle: 'EP.18 Deep Review · Script to Rough Cut Room',
        summary: 'Keep ideas, storyboards, voiceover scripts, timeline rough cuts, and multi-platform title comparisons aligned on one page.',
        deliverTo: 'Share with editors or sponsors: review script, storyboard, and timeline rough cut in one link.',
        blocks: ['Video editor', 'Excalidraw whiteboard', 'HTML', 'Table'],
        customPlugins: [
          { name: 'Voiceover Pacing Estimator', body: 'Estimates segment runtime from speaking speed and highlights sections that run over budget.' },
          { name: 'Thumbnail & Title Preview Card', body: 'Previews candidate titles and thumbnails inside realistic YouTube and social feed layouts.' },
        ],
        demo: {
          title: 'EP.18 Deep Review · Script to Rough Cut Room',
          badge: 'Media & Marketing / Video Producer',
          props: [
            ['Target Length', '8m 30s'],
            ['Channels', 'YouTube · Bilibili · Social'],
            ['Stage', 'Rough Cut Review'],
          ],
          intro: 'Open with the side-by-side result in the first 30 seconds to hold retention, then walk through three real workflows. Timeline tracks are synced below.',
          blocks: [
            {
              kind: 'timeline',
              plugin: 'Video Editor Block',
              title: 'Live Timeline Script Preview (08:24 total)',
              tracks: [
                {
                  name: 'Visuals',
                  segments: [
                    { label: '00:00 Hook', span: 2 },
                    { label: '00:45 Problem', span: 3 },
                    { label: '02:30 Live Demo', span: 5 },
                    { label: '06:50 Wrap-up', span: 2 },
                  ],
                },
                {
                  name: 'Voiceover',
                  segments: [
                    { label: 'Thesis (120w)', span: 2 },
                    { label: '3 Case Studies (480w)', span: 4 },
                    { label: 'Screen Walkthrough (620w)', span: 4 },
                    { label: 'Closing CTA', span: 2 },
                  ],
                },
              ],
            },
            {
              kind: 'table',
              plugin: 'Multi-Platform Title Matrix',
              custom: true,
              title: 'Candidate Titles & Visual Direction',
              columns: ['Platform', 'Proposed Title', 'Thumbnail Focus', 'Status'],
              rows: [
                ['YouTube', 'One Page Replaced 5 Apps in My Daily Workflow', 'Dark UI + split comparison', 'Approved'],
                ['Bilibili', '告别多工具切换：用一个页面组合整套工作流', 'High-contrast headline + UI', 'Final'],
                ['Social', 'How I consolidated my entire creative stack into one page', 'Clean card preview', 'Drafting'],
              ],
            },
          ],
          aiPrompt: 'At your 150 wpm pace, Section 2 runs ~22 seconds long. I trimmed two transitional sentences—apply directly to the script?',
        },
      },
      {
        id: 'marketing',
        role: 'Brand & Campaign Manager',
        pageTitle: 'Spring Launch · Campaign Hub & Budget Planner',
        summary: 'Combine launch timelines, live channel budget calculators, asset checklists, and landing previews on one page.',
        deliverTo: 'Share with leadership and agency partners: inspect budget allocation and asset milestones without hunting through spreadsheets.',
        blocks: ['Table', 'HTML', 'Excalidraw whiteboard'],
        customPlugins: [
          { name: 'Channel Budget Calculator', body: 'Toggle campaigns and sponsorships to see live total spend and projected acquisition cost.' },
          { name: 'Asset Delivery Tracker', body: 'Assigns owners and due dates for visuals, videos, and press releases with automatic delay flags.' },
        ],
        demo: {
          title: 'Spring Launch · Campaign Hub & Budget Planner',
          badge: 'Media & Marketing / Campaign Manager',
          props: [
            ['Launch Date', '2026-12-10'],
            ['Budget Cap', '$40,000'],
            ['Target Leads', '3,000+ signups'],
          ],
          intro: 'Toggle channel options below to verify total campaign spend stays within the $40k ceiling.',
          blocks: [
            {
              kind: 'calculator',
              plugin: 'Channel Budget Calculator',
              custom: true,
              title: 'Channel Mix Planner (interactive)',
              currency: '$',
              unit: '',
              items: [
                { id: 'kol', label: 'Creator Deep-Dive Reviews (6 partners)', price: 15000, note: 'Est. 450k views', defaultOn: true },
                { id: 'live', label: 'Launch Livestream Production', price: 8500, note: 'Multi-platform broadcast', defaultOn: true },
                { id: 'ads', label: 'Retargeting Paid Social Campaign', price: 11000, note: 'Recent site visitors', defaultOn: true },
                { id: 'event', label: 'Pop-up Community Showcase', price: 12000, note: 'Optional add-on', defaultOn: false },
              ],
            },
          ],
          aiPrompt: 'Current selection totals $34,500, leaving $5,500 in contingency. Shall I sync the six creator deadlines to the schedule table below?',
        },
      },
    ],
    pain: [
      'Ideas, storyboards, drafts, raw assets, and feedback live in separate apps, making version tracking error-prone.',
      'Standard docs cannot preview video timelines, simulate campaign budgets, or compare social cards.',
      'Collaborating with external editors and agencies requires repeatedly zipping and resending files.',
    ],
    how: [
      { title: 'Creative, preview, and schedule stay united', body: 'Storyboards, timeline previews, and publishing tables sit on the same page so edits reflect immediately.' },
      { title: 'Manage every episode in one Component table', body: 'All video editor blocks across pages automatically roll up into a single filterable table.' },
      { title: 'One-link review for clients and editors', body: 'External collaborators open one link to review scripts, timelines, and checklists with zero file wrangling.' },
    ],
    faq: [
      ['Does the video editor preview changes in real time?', 'Yes. Timeline scripts compose clips, captions, and pacing with live preview right inside the page.'],
      ['How are large media files handled?', 'Media files are stored as space attachments—on your local disk in local spaces—keeping editing responsive.'],
    ],
  },
  {
    slug: 'consulting',
    index: '04',
    title: 'Consulting & Professional Services',
    summary: 'For consultants, agencies, and legal teams—upgrade static PDF proposals into interactive client portals with live pricing calculators and sign-off checklists.',
    roleLabels: ['Management Consultant', 'Design & Dev Agency', 'Legal Counsel', 'Independent Advisor'],
    output: 'Client delivery portal · Interactive quote · Contract review sheet',
    blocks: ['Table', 'HTML', 'Table of contents', 'Browser'],
    roles: [
      {
        id: 'consultant',
        role: 'Consultant & Agency Lead',
        pageTitle: 'Digital Transformation · Client Proposal & Quote Portal',
        summary: 'Combine proposal scope, an interactive pricing calculator, milestones, and onboarding checklists on one page—delivering like custom software.',
        deliverTo: 'Send one link to your client: explore scope options with live pricing and track onboarding items in one place.',
        blocks: ['Table', 'HTML', 'Table of contents'],
        customPlugins: [
          { name: 'Interactive Quote & ROI Calculator', body: 'Clients toggle deliverables and timelines to see live totals and payback estimates.' },
          { name: 'Milestone & Asset Checklist', body: 'Lists deliverables, owners, and pending client inputs in one transparent view.' },
        ],
        demo: {
          title: 'Digital Transformation · Client Proposal & Quote Portal',
          badge: 'Professional Services / Consultant',
          props: [
            ['Client', 'Nova Manufacturing'],
            ['Lead Advisor', 'Ming Gu'],
            ['Valid Through', '2026-12-31'],
          ],
          intro: 'Following last week’s discovery sessions, we structured the engagement into four modules below. Toggle items to explore budget options and review kick-off prerequisites.',
          blocks: [
            {
              kind: 'calculator',
              plugin: 'Interactive Quote Calculator',
              custom: true,
              title: 'Select Engagement Modules (interactive)',
              currency: '$',
              unit: 'USD',
              items: [
                { id: 'audit', label: 'Workflow Audit & Bottleneck Report', price: 8500, note: '2 weeks · stakeholder interviews', defaultOn: true },
                { id: 'proto', label: 'Core Operations Workspace Build', price: 18000, note: '4 weeks · 5 custom plugins', defaultOn: true },
                { id: 'train', label: 'Team Onboarding & Playbook', price: 4000, note: '2 live workshops', defaultOn: true },
                { id: 'retainer', label: 'Quarterly Advisory Retainer', price: 6500, note: 'Optional ongoing support', defaultOn: false },
              ],
            },
            {
              kind: 'checklist',
              plugin: 'Onboarding Checklist',
              custom: true,
              title: 'Kick-off Prerequisites (interactive)',
              items: [
                { label: 'Share 90-day anonymized order and return sample table', meta: 'Client Ops', done: true },
                { label: 'Confirm interview schedule with 3 department leads', meta: 'Scheduled Thu PM', done: true },
                { label: 'Approve final module selection and sign statement of work', meta: 'Pending client', done: false },
              ],
            },
          ],
          aiPrompt: 'Drafted a matching 6-week milestone schedule and SOW summary for the 3 selected modules—insert at the bottom of the page?',
        },
      },
      {
        id: 'legal',
        role: 'Legal Counsel',
        pageTitle: 'Series A SPA · Clause Risk Review & Redline Log',
        summary: 'Turn dense legal redlines into structured risk tiers and negotiation summaries on one secure page.',
        deliverTo: 'Share with founders or executives: highlight high-risk clauses and recommended counter-language clearly.',
        blocks: ['Table', 'Table of contents', 'HTML'],
        customPlugins: [
          { name: 'Clause Risk Matrix', body: 'Categorizes redlines by risk level with side-by-side counterparty asks and recommended language.' },
          { name: 'Closing Conditions Tracker', body: 'Tracks board consents, filings, and signature pages through closing.' },
        ],
        demo: {
          title: 'Series A SPA · Clause Risk Review & Redline Log',
          badge: 'Professional Services / Legal Counsel',
          props: [
            ['Client', 'Apex AI Inc.'],
            ['Draft Version', 'SPA v3 (Investor Redline)'],
            ['High-Risk Items', '2 clauses to negotiate'],
          ],
          intro: 'Completed clause-by-clause review of investor v3 markup. Key issues center on redemption liability and anti-dilution mechanics.',
          blocks: [
            {
              kind: 'table',
              plugin: 'Clause Risk Matrix',
              custom: true,
              title: 'Summary of Material Redlines',
              columns: ['Section', 'Risk', 'Counterparty Revision', 'Recommended Response'],
              rows: [
                ['§8.2 Redemption', 'High', 'Adds personal founder liability', 'Cap liability strictly to founder equity'],
                ['§6.1 Anti-Dilution', 'Medium', 'Switches to full ratchet', 'Maintain broad-based weighted average'],
                ['§11.4 Info Rights', 'Low', 'Adds monthly cash summary', 'Accept with 15-day quarterly window'],
              ],
            },
          ],
          aiPrompt: 'Comparison completed strictly inside your local space (no cloud upload). Draft redline wording for sections §8.2 and §6.1?',
        },
      },
    ],
    pain: [
      'Static PDFs and slide decks cannot calculate options—every scope tweak forces manual spreadsheet edits and re-emailing.',
      'Off-the-shelf client portals are rigid, while commissioning custom portals is prohibitively expensive.',
      'Confidential client agreements and advisory work cannot be casually uploaded to third-party cloud AI tools.',
    ],
    how: [
      { title: 'Upgrade static proposals into live tools', body: 'Embed interactive pricing calculators, risk matrices, and sign-off checklists right inside the narrative.' },
      { title: 'One isolated page per client', body: 'Reuse the same plugin template across every engagement while keeping each client’s data completely separate.' },
      { title: 'Keep confidential drafts local', body: 'Store sensitive source documents in a local space and share only the polished client-facing page.' },
    ],
    faq: [
      ['Can a client see other clients’ pages?', 'No. Sharing packages only that single page and its plugins; everything else in your workspace remains private.'],
      ['Can non-technical advisors build quote calculators?', 'Yes. Specify the line items and calculation rules, and let an agent build and verify the plugin on the page.'],
    ],
  },
  {
    slug: 'ecommerce',
    index: '05',
    title: 'E-Commerce & Retail',
    summary: 'Bring SKU margin calculators, competitor price tracking, and creator campaign briefs onto one page—replacing tangled spreadsheets during peak seasons.',
    roleLabels: ['Merchandising Lead', 'Influencer Manager', 'Campaign PM', 'Brand Founder'],
    output: 'SKU margin planner · Creator brief portal · Peak-season hub',
    blocks: ['Table', 'HTML', 'Excalidraw whiteboard', 'Browser'],
    roles: [
      {
        id: 'merchandising',
        role: 'Merchandising & Product Ops',
        pageTitle: 'Winter Launch · SKU Scoring & Margin Planner',
        summary: 'Place unit economics, break-even ROAS, and competitor review analysis on one page to finalize pricing during product reviews.',
        deliverTo: 'Share with founders and sourcing: inspect net margin sensitivity live without fragile spreadsheet formulas.',
        blocks: ['Table', 'HTML', 'Browser'],
        customPlugins: [
          { name: 'Unit Economics & Break-Even ROAS Block', body: 'Calculates gross margin, break-even ROAS, and net profit per order from COGS, fees, and return rate.' },
          { name: 'Competitor Review Miner', body: 'Surfaces recurring negative reviews so teams position new SKUs around real customer pain.' },
        ],
        demo: {
          title: 'Winter Launch · SKU Scoring & Margin Planner',
          badge: 'E-Commerce & Retail / Merchandising',
          props: [
            ['Category', 'Compact Home Appliances'],
            ['Target MSRP', '$69'],
            ['Target Net Margin', '≥ 22%'],
          ],
          intro: 'Evaluated three factory prototypes with full landed cost and 8% return allowance to verify profitability above 2.5x paid ROAS.',
          blocks: [
            {
              kind: 'metrics',
              plugin: 'SKU Margin Calculator',
              custom: true,
              title: 'Hero SKU A ($69 MSRP) Unit Economics',
              items: [
                { label: 'Landed COGS', value: '$19.50', hint: '28.3% of MSRP' },
                { label: 'Fees & Returns', value: '$8.40', hint: 'Includes 8% return buffer' },
                { label: 'Gross Margin / BE ROAS', value: '59.6% / 1.68x', hint: '$13.50 net profit at 2.5x ROAS' },
              ],
            },
            {
              kind: 'table',
              plugin: 'Competitor Benchmark',
              title: 'Top 3 Category Competitors',
              columns: ['Competitor', 'Retail Price', 'Est. Monthly Units', 'Top Customer Complaints'],
              rows: [
                ['Brand X', '$59', '18,000', 'Loud fan noise, plastic odor'],
                ['Brand Y', '$79', '9,200', 'Bulky desktop footprint'],
                ['Our Hero SKU A', '$69', 'Launch test', '32dB quiet + auto tip-over shutoff'],
              ],
            },
          ],
          aiPrompt: 'Analyzed 200 competitor reviews: 41% cite initial odor on first use. Recommend highlighting material safety certification above the fold.',
        },
      },
      {
        id: 'influencer',
        role: 'Influencer & Partnerships',
        pageTitle: 'Holiday Campaign · One-Page Creator Brief',
        summary: 'Package key selling points, required shots, compliance rules, and shipping confirmation into one clean link for creators.',
        deliverTo: 'Send one link to creators or agencies: eliminate long chat threads and missed talking points.',
        blocks: ['HTML', 'Excalidraw whiteboard', 'Table'],
        customPlugins: [
          { name: 'Shot List & Compliance Checklist', body: 'Highlights mandatory claims and restricted phrases to prevent costly reshoots.' },
          { name: 'Sample & Schedule Sign-off', body: 'Confirms sample specs and publish window right on the brief.' },
        ],
        demo: {
          title: 'Holiday Campaign · One-Page Creator Brief',
          badge: 'E-Commerce & Retail / Partnerships',
          props: [
            ['Creator', '@HomeWithMia'],
            ['Publish Date', 'Dec 6 · 19:00'],
            ['Featured SKU', 'Hero SKU A Gift Edition'],
          ],
          intro: 'Everything needed for filming and compliance is consolidated below. Leave any script questions directly on this page.',
          blocks: [
            {
              kind: 'checklist',
              plugin: 'Filming & Compliance Checklist',
              custom: true,
              title: 'Pre-Submission Checks (interactive)',
              items: [
                { label: 'Show decibel meter reading (32dB quiet test) within first 5 seconds', meta: 'Hero claim', done: true },
                { label: 'Mention holiday bundle offer ($15 off + spare filter)', meta: 'Promo code', done: true },
                { label: 'Avoid restricted absolute claims ("100% silent / zero energy")', meta: 'Compliance', done: false },
              ],
            },
          ],
          aiPrompt: 'Generated three opening hook variations matched to the creator’s recent top-performing videos—ready to append below.',
        },
      },
    ],
    pain: [
      'SKU sheets, margin formulas, competitor screenshots, and creator schedules scatter across dozens of files during peak sales.',
      'Sending campaign briefs via bulky documents or fragmented chat messages leads to missed claims and reshoots.',
      'Unit-economics spreadsheets break easily when copied and edited across teams.',
    ],
    how: [
      { title: 'Run unit economics beside market research', body: 'Combine margin calculators, competitor tables, and positioning notes on one page for faster pricing calls.' },
      { title: 'Standardize creator briefs in one link', body: 'Duplicate a proven template to deliver crisp, interactive briefs to every partner.' },
      { title: 'Turn customer reviews into positioning', body: 'Reference competitor review tables so agents extract pain points and draft PDP copy directly.' },
    ],
    faq: [
      ['Do creators need an account to view a brief?', 'No. Shared pages open directly in the browser with all checklists and assets intact.'],
      ['Can I roll up all SKU pages into one overview?', 'Yes. Workspace tables connect seamlessly with pages so you can filter every SKU by margin or launch status.'],
    ],
  },
  {
    slug: 'finance',
    index: '06',
    title: 'Finance & Investment Research',
    summary: 'Keep research filings, valuation sensitivity matrices, diligence checklists, and committee trails in one local-first workspace where findings compound over time.',
    roleLabels: ['Equity & Industry Analyst', 'Investment Manager', 'FP&A Lead'],
    output: 'Diligence workspace · Valuation matrix · Quarterly review',
    blocks: ['Browser', 'Table', 'Excalidraw whiteboard', 'HTML'],
    roles: [
      {
        id: 'investor',
        role: 'Investment Manager & Analyst',
        pageTitle: 'AI Infrastructure · Deal Diligence & Valuation Memo',
        summary: 'Combine financial metrics, exit sensitivity scenarios, competitive benchmarks, and source citations on one auditable page.',
        deliverTo: 'Share with investment committee partners: inspect assumptions, scenarios, and source transcripts in one place.',
        blocks: ['Table', 'Browser', 'HTML', 'Excalidraw whiteboard'],
        customPlugins: [
          { name: 'Valuation Sensitivity Matrix', body: 'Compare exit multiples and ARR growth scenarios with live MOIC estimates.' },
          { name: 'Diligence Evidence Tracker', body: 'Links customer calls, financial audits, and legal checks to primary source files.' },
        ],
        demo: {
          title: 'AI Infrastructure · Deal Diligence & Valuation Memo',
          badge: 'Finance & Research / Investment Manager',
          props: [
            ['Target', 'Project Nova (Series B)'],
            ['Deal Lead', 'Yue Shen'],
            ['IC Status', 'Deep Diligence'],
          ],
          intro: 'ARR grew 3.1x YoY with 128% NDR. Core metrics and 2028 exit scenarios are summarized below, with primary call transcripts linked in this space.',
          blocks: [
            {
              kind: 'metrics',
              plugin: 'Financial Metrics Card',
              custom: true,
              title: 'Key Operating & Retention Metrics',
              items: [
                { label: 'Current ARR', value: '$14.2M', hint: '+210% YoY' },
                { label: 'Net Dollar Retention', value: '128%', hint: 'Strong enterprise expansion' },
                { label: 'Gross Margin / Payback', value: '79% / 11 mo', hint: 'Top-quartile efficiency' },
              ],
            },
            {
              kind: 'table',
              plugin: 'Valuation Scenario Matrix',
              custom: true,
              title: '2028 Exit Valuation Sensitivity (ARR × Multiple)',
              columns: ['Case', '2028E ARR', 'Exit Multiple', 'Implied Value', 'Est. MOIC'],
              rows: [
                ['Bear Case', '$45M', '10x', '$450M', '2.5x'],
                ['Base Case', '$68M', '12x', '$816M', '4.5x'],
                ['Bull Case', '$95M', '15x', '$1.42B', '7.9x'],
              ],
            },
          ],
          aiPrompt: 'Cross-referenced 4 customer call transcripts in this space: 3 enterprise accounts cited deployment dropping from 3 weeks to 2 days as the primary expansion driver.',
        },
      },
      {
        id: 'fpna',
        role: 'FP&A & Finance Lead',
        pageTitle: 'Q4 Operating Review & Next-Quarter Budget Simulator',
        summary: 'Combine revenue breakdowns, variance notes, and an interactive hiring and spend simulator for executive reviews.',
        deliverTo: 'Share with executives and department heads: evaluate budget trade-offs live instead of flipping through static decks.',
        blocks: ['Table', 'HTML', 'Table of contents'],
        customPlugins: [
          { name: 'Hiring & Runway Simulator', body: 'Toggle headcount and infrastructure plans to see live quarterly burn and runway impact.' },
          { name: 'Variance Attribution Table', body: 'Flags line items over 10% variance alongside department commentary.' },
        ],
        demo: {
          title: 'Q4 Operating Review & Next-Quarter Budget Simulator',
          badge: 'Finance & Research / FP&A Lead',
          props: [
            ['Period', '2026 Q4'],
            ['Current Runway', '26 months'],
            ['Audience', 'Executive Review'],
          ],
          intro: 'Toggle proposed next-quarter investments below to evaluate incremental burn and runway impact.',
          blocks: [
            {
              kind: 'calculator',
              plugin: 'Quarterly Budget Simulator',
              custom: true,
              title: 'Proposed Incremental Spend (interactive)',
              currency: '$',
              unit: '/ quarter',
              items: [
                { id: 'rd', label: '3 Senior Systems Engineers', price: 115000, note: 'Accelerate Cloud GA', defaultOn: true },
                { id: 'gpu', label: 'Inference & QA Compute Expansion', price: 38000, note: 'Support 5x DAU', defaultOn: true },
                { id: 'mkt', label: 'Developer Conference Sponsorships', price: 45000, note: 'Optional growth spend', defaultOn: false },
              ],
            },
          ],
          aiPrompt: 'Selected investments total $153,000/quarter, adjusting runway from 26.0 to 23.8 months—well within target guardrails.',
        },
      },
    ],
    pain: [
      'Filings, interview notes, models, and comparison tables scatter across dozens of browser tabs and local folders.',
      'Confidential diligence and financial data cannot be uploaded freely to third-party cloud AI platforms.',
      'Research conducted in standalone chat apps vanishes into threads instead of compounding into a reusable memo.',
    ],
    how: [
      { title: 'Sources, models, and memos stay connected', body: 'Keep primary filings, call notes, and matrices in one workspace so every AI synthesis cites exact sources.' },
      { title: 'Local-first privacy by design', body: 'Store sensitive diligence data on your own computer with offline access; only selected snippets go to your model provider.' },
      { title: 'Evolve assumptions without rebuilding', body: 'Add comparison dimensions or custom sensitivity blocks directly on live tables.' },
    ],
    faq: [
      ['Can diligence files stay strictly on my machine?', 'Yes. Local spaces store pages, tables, and PDF attachments directly on your computer without cloud upload.'],
      ['How do I keep AI grounded in primary sources?', 'Mention specific transcripts and tables with @ so the agent draws only from the documents you selected.'],
    ],
  },
]

export const USE_CASE_CATEGORIES = USE_CASES

function BlockChips({ blocks }: { blocks: string[] }) {
  return (
    <ul className="site-block-chips" aria-label="Common plugins">
      {blocks.map((name) => <li key={name}>{name}</li>)}
    </ul>
  )
}

/** Industry & Use Case Overview */
export function MarketingUseCases({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: 'Use Cases',
    description: 'Tech, education, media, consulting, e-commerce, and finance—explore how roles across industries combine built-in and AI-built plugins in BIU.',
    path: '/use-cases',
  })

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
      <section className="site-page-hero" data-reveal>
        <p className="site-section-label">Industries & Use Cases</p>
        <h1>Tailored working pages for every industry and role</h1>
        <p className="site-page-lead">
          BIU is not limited to a handful of fixed templates. Explore any industry to see how different roles combine built-in and AI-customized plugins—and try an interactive page preview for each role.
        </p>
      </section>

      <section className="site-usecase-grid" aria-label="Use cases">
        {USE_CASES.map((useCase) => (
          <Link key={useCase.slug} to={`/use-cases/${useCase.slug}`} className="site-usecase-card">
            <span className="site-solution-index">{useCase.index} · {useCase.roleLabels.join(' · ')}</span>
            <h2>{useCase.title}</h2>
            <p>{useCase.summary}</p>
            <div className="site-usecase-card-blocks">
              <BlockChips blocks={useCase.blocks} />
            </div>
          </Link>
        ))}
      </section>

      <section className="site-usecase-open" data-reveal>
        <div>
          <p className="site-section-label">Beyond six industries</p>
          <h2>Don’t see your industry or role?</h2>
          <p>
            Plugins in BIU are not limited to what ships out of the box. Healthcare, manufacturing, HR, or personal research—describe your workflow and let an agent craft the exact blocks your team needs.
          </p>
        </div>
        <Link className="site-cta-secondary" to="/product#plugins">See how plugin customization works →</Link>
      </section>

      <SiteFinalCta title="Start with your industry and role" />
    </SiteChrome>
  )
}

/** Industry Detail Page with Role Switcher + Interactive BIU Demo Page */
export function MarketingUseCaseDetail({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  const { slug } = useParams<{ slug: string }>()
  const useCase = USE_CASES.find((item) => item.slug === slug)
  const [activeRoleIdx, setActiveRoleIdx] = useState(0)

  useEffect(() => {
    setActiveRoleIdx(0)
  }, [slug])

  usePageMeta({
    title: useCase ? `${useCase.title} · Use Cases` : 'Use Cases',
    description: useCase ? useCase.summary : 'Industry and role workflows built on BIU.',
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

  const activeRole = useCase.roles[activeRoleIdx] ?? useCase.roles[0]!
  const others = USE_CASES.filter((item) => item.slug !== useCase.slug)

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
      <section className="site-page-hero" data-reveal>
        <p className="site-section-label">Industry · {useCase.index}</p>
        <h1>{useCase.title}</h1>
        <p className="site-page-lead">{useCase.summary}</p>
        <p className="site-usecase-output">Key deliverables: {useCase.output}</p>
        <p className="site-usecase-note">Roles: {useCase.roleLabels.join(' · ')}</p>
      </section>

      <section className="site-usecase-demo-section" aria-label="Interactive page preview" data-reveal>
        <div className="site-usecase-demo-head">
          <p className="site-section-label">Cross-Plugin Reactive Demo</p>
          <h2>Distinct tools sharing live state on one page</h2>
        </div>

        <IndustryInteractiveDemo key={useCase.slug} slug={useCase.slug} locale="en" />
      </section>

      <section className="site-usecase-blocks" data-reveal>
        <h2>Plugin setups by role in this industry</h2>
        <div className="site-demo-tabs" role="tablist" aria-label="Choose a role">
          {useCase.roles.map((role, index) => (
            <button
              type="button"
              role="tab"
              aria-selected={activeRoleIdx === index}
              className={activeRoleIdx === index ? 'is-active' : ''}
              key={role.id}
              onClick={() => setActiveRoleIdx(index)}
            >
              {role.role}
            </button>
          ))}
        </div>
        <p className="site-usecase-role-lead">{activeRole.summary}</p>
        <p className="site-usecase-note">Delivery: {activeRole.deliverTo}</p>
        <BlockChips blocks={activeRole.blocks} />
        <h3 className="site-usecase-custom-heading">Custom plugins an agent can build for {activeRole.role}</h3>
        <div className="site-usecase-custom-grid">
          {activeRole.customPlugins.map((plugin) => (
            <article key={plugin.name}>
              <strong>{plugin.name}</strong>
              <p>{plugin.body}</p>
            </article>
          ))}
        </div>
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

      <SiteFinalCta title="Build a working page for your industry" />
    </SiteChrome>
  )
}
