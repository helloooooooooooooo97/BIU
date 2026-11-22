import { useState } from 'react'

type Locale = 'zh' | 'en'

function DemoShell({
  path,
  replaces,
  backendTag,
  sharedState,
  title,
  subtitle,
  whyNotEmbed,
  children,
}: {
  path: string
  replaces: string
  backendTag: string
  sharedState: Array<[string, string]>
  title: string
  subtitle: string
  whyNotEmbed: string
  children: React.ReactNode
}) {
  return (
    <div className="site-demo-page site-fs-demo">
      <div className="site-dp-chrome">
        <div className="site-dp-dots" aria-hidden><span /><span /><span /></div>
        <span className="site-dp-path">{path}</span>
        <span className="site-dp-backend">{backendTag}</span>
      </div>
      <div className="site-dp-body">
        <div className="site-dp-head">
          <p className="site-fs-replaces">{replaces}</p>
          <h3>{title}</h3>
          <p className="site-dp-intro">{subtitle}</p>
          <dl className="site-fs-shared" aria-label="Shared page state">
            {sharedState.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        {children}
        <p className="site-fs-why">{whyNotEmbed}</p>
      </div>
    </div>
  )
}

/** 01 科技与互联网：架构拓扑画板 → 后端接口探针 → 审批扩容 → 任务看板自动建单 */
function TechOpsDemo({ locale }: { locale: Locale }) {
  const zh = locale === 'zh'
  const [activeNode, setActiveNode] = useState<'gateway' | 'worker' | 'db'>('worker')
  const [workers, setWorkers] = useState(8)
  const [pendingApproval, setPendingApproval] = useState(false)
  const [samples, setSamples] = useState([210, 290, 440, 710, 918])
  const [tasks, setTasks] = useState<Array<{ title: string; owner: string; status: string }>>(() => [
    {
      title: zh ? '排查订单回调积压原因' : 'Investigate payment callback lag',
      owner: '@SRE-Agent',
      status: zh ? '进行中' : 'In Progress',
    },
  ])

  const workerHealthy = workers >= 16
  const nodeLatency = activeNode === 'worker' ? (workerHealthy ? 168 : samples[samples.length - 1] ?? 918) : activeNode === 'gateway' ? 42 : 28

  const runProbe = () => {
    const next = activeNode !== 'worker' || workerHealthy
      ? 140 + Math.floor(Math.random() * 45)
      : 820 + Math.floor(Math.random() * 140)
    setSamples((prev) => [...prev.slice(-5), next])
  }

  const confirmScale = () => {
    setWorkers(16)
    setPendingApproval(false)
    setSamples((prev) => [...prev.slice(-5), 168])
    setTasks((prev) => [
      {
        title: zh ? '根因复盘：为 commit 8f21a 新增查询字段补充索引' : 'Postmortem: add index for commit 8f21a slow query',
        owner: '@DBA-Agent',
        status: zh ? '自动创建' : 'Auto-created',
      },
      ...prev,
    ])
  }

  const NODES = [
    { id: 'gateway' as const, label: 'api-gateway', ok: true, note: '42ms' },
    { id: 'worker' as const, label: 'payment-worker', ok: workerHealthy, note: workerHealthy ? `168ms · x${workers}` : `918ms · x${workers}` },
    { id: 'db' as const, label: 'order-db', ok: true, note: '28ms' },
  ]

  return (
    <DemoShell
      path="BIU / order-gateway-incident"
      replaces={zh ? '原本需要：Miro 白板 + Postman 监控 + iTerm2 终端 + Jira 看板 → 现在：BIU 同一页' : 'Replaces: Miro + Postman + Terminal + Jira → One BIU Page'}
      backendTag={zh ? '后端能力：内网探针 · 审批流 · 自动建单' : 'Backend: Internal Probe · Approval Gate · Auto-Task'}
      sharedState={[
        [zh ? '选中节点' : 'Node', NODES.find((n) => n.id === activeNode)!.label],
        [zh ? 'Worker 并发' : 'Workers', `x${workers}`],
        [zh ? '实时 P99' : 'Live P99', `${nodeLatency}ms`],
        [zh ? '看板任务数' : 'Tasks', `${tasks.length}`],
      ]}
      title={zh ? '线上故障应急与复盘页' : 'Incident Triage & Postmortem Page'}
      subtitle={zh
        ? '在上方架构画板点击节点，下方接口探针自动切换目标；批准扩容后，画板节点由红转绿、延迟曲线回落，底部任务看板同步自动新增复盘任务。'
        : 'Click a node on the topology board to target the backend probe; approving scale-up turns the node green, drops latency, and creates a postmortem task automatically.'}
      whyNotEmbed={zh
        ? '为什么不是 iframe 嵌入：四个插件读写同一份页面共享状态——点击架构图会切换探针目标，审批扩容会同时更新拓扑状态、延迟图与任务看板。'
        : 'Why this beats iframe embeds: all four plugins share live page state—clicking the diagram targets the probe, and approving scale-up updates topology, latency, and tasks together.'}
    >
      <section className="site-dp-block">
        <header className="site-dp-block-head">
          <strong>{zh ? '① 架构拓扑画板（点击节点切换监控目标）' : '1. Topology Board (click a node to inspect)'}</strong>
          <span className="site-dp-plugin-tag">Excalidraw / Topology</span>
        </header>
        <div className="site-fs-topo">
          {NODES.map((n, idx) => (
            <div key={n.id} className="site-fs-topo-step">
              <button
                type="button"
                className={`site-fs-node ${activeNode === n.id ? 'is-selected' : ''} ${n.ok ? 'is-ok' : 'is-warn'}`}
                onClick={() => setActiveNode(n.id)}
              >
                <strong>{n.label}</strong>
                <small>{n.ok ? (zh ? '健康' : 'Healthy') : (zh ? '告警' : 'Alert')} · {n.note}</small>
              </button>
              {idx < NODES.length - 1 ? <span className="site-fs-arrow" aria-hidden>→</span> : null}
            </div>
          ))}
        </div>
      </section>

      <div className="site-fs-grid-2">
        <section className="site-dp-block">
          <header className="site-dp-block-head">
            <strong>{zh ? `② 后端接口探针：${NODES.find((n) => n.id === activeNode)!.label}` : `2. Backend Probe: ${NODES.find((n) => n.id === activeNode)!.label}`}</strong>
            <span className={nodeLatency > 500 ? 'site-fs-pill is-warn' : 'site-fs-pill is-ok'}>{nodeLatency}ms</span>
          </header>
          <div className="site-fs-toolbar">
            <button type="button" className="site-fs-btn" onClick={runProbe}>{zh ? '发起探测采样' : 'Run Probe'}</button>
            {!workerHealthy ? (
              <button type="button" className="site-fs-btn is-primary" onClick={() => setPendingApproval(true)}>
                {zh ? '终端扩容 (8 → 16)' : 'Scale Workers (8 → 16)'}
              </button>
            ) : (
              <button type="button" className="site-fs-btn" onClick={() => { setWorkers(8); setSamples([210, 290, 440, 710, 918]) }}>
                {zh ? '重置演练' : 'Reset'}
              </button>
            )}
          </div>
          {pendingApproval ? (
            <div className="site-fs-approval" role="alert">
              <span>{zh ? '敏感操作审批：确认将生产环境 payment-worker 扩容至 16？' : 'Approval required: scale production payment-worker to 16?'}</span>
              <div>
                <button type="button" className="site-fs-btn is-primary" onClick={confirmScale}>{zh ? '批准执行' : 'Approve'}</button>
                <button type="button" className="site-fs-btn" onClick={() => setPendingApproval(false)}>{zh ? '取消' : 'Cancel'}</button>
              </div>
            </div>
          ) : null}
          <div className="site-fs-bars" aria-label="P99 latency chart">
            {samples.map((ms, i) => (
              <div key={i} className="site-fs-bar-col">
                <span className={ms > 500 ? 'site-fs-bar is-warn' : 'site-fs-bar is-ok'} style={{ height: `${Math.min(100, Math.round(ms / 10))}%` }} />
                <small>{ms}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="site-dp-block">
          <header className="site-dp-block-head">
            <strong>{zh ? '③ 任务看板（扩容审批后自动建单）' : '3. Task Board (auto-updated on approval)'}</strong>
            <span className="site-dp-plugin-tag">{zh ? '共享数据联动' : 'Live Synced'}</span>
          </header>
          <table className="site-dp-table">
            <thead>
              <tr>
                <th>{zh ? '任务' : 'Task'}</th>
                <th>{zh ? '负责人' : 'Owner'}</th>
                <th>{zh ? '状态' : 'Status'}</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t, i) => (
                <tr key={i}>
                  <td>{t.title}</td>
                  <td>{t.owner}</td>
                  <td>{t.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </DemoShell>
  )
}

/** 02 教育与培训：代码判题沙箱 → 学员掌握度进度 → Offer 达标评估表联动 */
function EducationJudgeDemo({ locale }: { locale: Locale }) {
  const zh = locale === 'zh'
  const [solution, setSolution] = useState<'edgebug' | 'optimal' | 'tle'>('edgebug')
  const [mastery, setMastery] = useState(72)
  const [submissions, setSubmissions] = useState<Array<{ label: string; pass: string; time: string; score: number }>>([
    { label: zh ? '初始提交（暴力枚举）' : 'Initial (Brute Force)', pass: '2 / 4', time: 'TLE', score: 50 },
  ])

  const SOLUTIONS = {
    edgebug: {
      label: zh ? '漏全负数边界' : 'Missing Negative Edge',
      code: 'def max_path_sum(root):\n    best = 0  # ⚠ 全负数树会误返回 0\n    def dfs(u):\n        nonlocal best\n        if not u: return 0\n        l, r = max(0, dfs(u.left)), max(0, dfs(u.right))\n        best = max(best, u.val + l + r)\n        return u.val + max(l, r)\n    dfs(root)\n    return best',
      cases: [
        { name: '[1, 2, 3]', ok: true, detail: '6 · 12ms' },
        { name: '[-3] (全负数边界)', ok: false, detail: zh ? '期望 -3，实际 0' : 'Expected -3, got 0' },
        { name: '10⁵ 节点压力测试', ok: true, detail: 'PASS · 43ms' },
      ],
      pass: '3 / 4',
      time: '43ms',
      score: 75,
      nextMastery: 74,
    },
    optimal: {
      label: zh ? '最优解 O(N)' : 'Optimal O(N)',
      code: 'def max_path_sum(root):\n    best = -10**9\n    def dfs(u):\n        nonlocal best\n        if not u: return 0\n        l, r = max(0, dfs(u.left)), max(0, dfs(u.right))\n        best = max(best, u.val + l + r)\n        return u.val + max(l, r)\n    dfs(root)\n    return best',
      cases: [
        { name: '[1, 2, 3]', ok: true, detail: '6 · 12ms' },
        { name: '[-3] (全负数边界)', ok: true, detail: '-3 · 11ms' },
        { name: '10⁵ 节点压力测试', ok: true, detail: 'PASS · 41ms' },
      ],
      pass: '4 / 4',
      time: '41ms',
      score: 98,
      nextMastery: 94,
    },
    tle: {
      label: zh ? '暴力解 O(N²)' : 'Brute Force O(N²)',
      code: 'def max_path_sum(root):\n    return max(path_through(u) for u in all_nodes(root))',
      cases: [
        { name: '[1, 2, 3]', ok: true, detail: '6 · 14ms' },
        { name: '[-3] (全负数边界)', ok: true, detail: '-3 · 13ms' },
        { name: '10⁵ 节点压力测试', ok: false, detail: 'TLE > 2000ms' },
      ],
      pass: '3 / 4',
      time: 'TLE',
      score: 65,
      nextMastery: 66,
    },
  } as const

  const cur = SOLUTIONS[solution]

  const runSandbox = () => {
    setMastery(cur.nextMastery)
    setSubmissions((prev) => [{ label: cur.label, pass: cur.pass, time: cur.time, score: cur.score }, ...prev.slice(0, 3)])
  }

  return (
    <DemoShell
      path="BIU / coaching-week4-tree-dp"
      replaces={zh ? '原本需要：Excalidraw 白板 + LeetCode + 本地 IDE + Excel Offer 表 → 现在：BIU 同一页' : 'Replaces: Excalidraw + LeetCode + Local IDE + Excel → One BIU Page'}
      backendTag={zh ? '后端能力：Python 判题沙箱 · 隐藏用例 · 档案入库' : 'Backend: Python Sandbox · Hidden Cases · Mastery Sync'}
      sharedState={[
        [zh ? '当前解法' : 'Solution', cur.label],
        [zh ? '树形 DP 掌握度' : 'Tree DP Mastery', `${mastery}%`],
        [zh ? '历史提交' : 'Submissions', `${submissions.length}`],
        [zh ? '目标岗位就绪度' : 'Interview Readiness', mastery >= 90 ? (zh ? '已达标' : 'Ready') : (zh ? '需加强边界' : 'Needs Review')],
      ]}
      title={zh ? '算法面试辅导与在线判题页' : 'Technical Interview Coaching & Live Judge'}
      subtitle={zh
        ? '在上方代码沙箱切换「最优解 O(N)」并点击运行，后端校验隐藏用例后，下方学员掌握度进度与目标公司 Offer 达标评估表将同步实时刷新。'
        : 'Switch to Optimal O(N) and run in the backend sandbox—watch mastery scores, submission history, and target company readiness update together.'}
      whyNotEmbed={zh
        ? '为什么不是 iframe 嵌入：代码沙箱的判题结果会直接写入页面共享数据，自动驱动下方的掌握度档案与目标公司面试评估表。'
        : 'Why this beats iframe embeds: sandbox verdicts write directly to shared page data, automatically updating student mastery and offer readiness tables.'}
    >
      <div className="site-fs-toolbar">
        <div className="site-fs-seg">
          {(['edgebug', 'optimal', 'tle'] as const).map((key) => (
            <button key={key} type="button" className={solution === key ? 'is-active' : ''} onClick={() => setSolution(key)}>
              {SOLUTIONS[key].label}
            </button>
          ))}
        </div>
        <button type="button" className="site-fs-btn is-primary" onClick={runSandbox}>
          {zh ? '后端沙箱运行并同步档案' : 'Run Sandbox & Sync Record'}
        </button>
      </div>

      <div className="site-fs-grid-2">
        <section className="site-dp-block">
          <header className="site-dp-block-head">
            <strong>{zh ? '① 算法题与后端代码沙箱' : '1. Coding Challenge & Sandbox'}</strong>
            <span className="site-dp-plugin-tag">Python 3.12</span>
          </header>
          <div className="site-dp-code"><pre><code>{cur.code}</code></pre></div>
          <ul className="site-fs-case-list">
            {cur.cases.map((c) => (
              <li key={c.name} className={c.ok ? 'is-ok' : 'is-warn'}>
                <span>{c.ok ? '✓' : '✕'} {c.name}</span>
                <small>{c.detail}</small>
              </li>
            ))}
          </ul>
        </section>

        <section className="site-dp-block">
          <header className="site-dp-block-head">
            <strong>{zh ? '② 联动刷新：掌握度与目标 Offer 评估' : '2. Synced Mastery & Offer Readiness'}</strong>
            <span className={mastery >= 90 ? 'site-fs-pill is-ok' : 'site-fs-pill is-warn'}>{mastery}%</span>
          </header>
          <div className="site-fs-progress"><div style={{ width: `${mastery}%` }} /></div>
          <table className="site-dp-table">
            <thead>
              <tr>
                <th>{zh ? '目标公司' : 'Target Company'}</th>
                <th>{zh ? '考察重点' : 'Focus'}</th>
                <th>{zh ? '当前达标评估' : 'Readiness'}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{zh ? 'A 厂 · 云原生' : 'Company A · Cloud'}</td>
                <td>{zh ? '高并发与图论' : 'Concurrency'}</td>
                <td><span className="site-fs-pill is-ok">{zh ? '已拿 Offer · 42w' : 'Offer · $185k'}</span></td>
              </tr>
              <tr>
                <td>{zh ? 'B 厂 · 存储引擎' : 'Company B · Storage'}</td>
                <td>{zh ? '树形 DP（本页题型）' : 'Tree DP (this page)'}</td>
                <td>
                  <span className={mastery >= 90 ? 'site-fs-pill is-ok' : 'site-fs-pill is-warn'}>
                    {mastery >= 90 ? (zh ? '已达二面标准 ✓' : 'Ready for R2 ✓') : (zh ? '边界处理待补齐' : 'Edge cases weak')}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </DemoShell>
  )
}

/** 03 媒体与营销：口播脚本编辑 → 时长估算 → 时间线字幕同步 → 后端导出自动更新发布排期表 */
function MediaStudioDemo({ locale }: { locale: Locale }) {
  const zh = locale === 'zh'
  const [script, setScript] = useState(
    zh
      ? '为什么普通文档只能贴截图，而这一页里的画板、代码沙箱和表格能互相联动？今天我们用三个真实场景拆解。'
      : 'Why do conventional docs only hold screenshots while whiteboards, sandboxes, and tables stay live together on one BIU page?',
  )
  const [rendered, setRendered] = useState(false)

  const charCount = script.trim().length
  const estSeconds = Math.max(8, Math.round(charCount / (zh ? 3.5 : 14)))
  const overBudget = estSeconds > 20

  return (
    <DemoShell
      path="BIU / ep18-video-production"
      replaces={zh ? '原本需要：飞书文档 + Figma 封面 + 剪映剪辑 + Airtable 排期 → 现在：BIU 同一页' : 'Replaces: Docs + Figma + Video Editor + Airtable → One BIU Page'}
      backendTag={zh ? '后端能力：音视频合成队列 · 附件入库 · 排期联动' : 'Backend: Media Render Pipeline · Asset Store · Schedule Sync'}
      sharedState={[
        [zh ? '开场口播字数' : 'Hook Length', `${charCount}`],
        [zh ? '估算时长' : 'Est. Runtime', `${estSeconds}s`],
        [zh ? '成片状态' : 'Render Status', rendered ? (zh ? '已导出 MP4 ✓' : 'Exported MP4 ✓') : (zh ? '粗剪中' : 'Editing')],
      ]}
      title={zh ? '一期视频全流程制作页' : 'End-to-End Video Production Page'}
      subtitle={zh
        ? '直接修改下方开场口播稿，估算时长与时间线字幕预览会实时同步变化；点击后端合成导出后，底部多平台发布排期表将自动翻转为“已就绪”。'
        : 'Edit the opening script below—runtime estimates and timeline captions update live. Exporting via the backend automatically flips the publishing schedule to Ready.'}
      whyNotEmbed={zh
        ? '为什么不是 iframe 嵌入：编辑正文脚本会实时同步时间线字幕轨，后端完成视频合成后自动回写发布排期表的成片附件状态。'
        : 'Why this beats iframe embeds: script edits sync directly into timeline captions, and backend rendering automatically updates the publishing table.'}
    >
      <div className="site-fs-grid-2">
        <section className="site-dp-block">
          <header className="site-dp-block-head">
            <strong>{zh ? '① 口播脚本（可直接编辑体验联动）' : '1. Voiceover Script (edit to test live sync)'}</strong>
            <span className={overBudget ? 'site-fs-pill is-warn' : 'site-fs-pill is-ok'}>
              {estSeconds}s {overBudget ? (zh ? '· 略超时' : '· Over 20s') : (zh ? '· 节奏合适' : '· On pace')}
            </span>
          </header>
          <textarea
            className="site-fs-textarea"
            rows={3}
            value={script}
            onChange={(e) => { setScript(e.target.value); setRendered(false) }}
            aria-label={zh ? '口播脚本' : 'Voiceover script'}
          />
          <div className="site-fs-toolbar">
            <button
              type="button"
              className="site-fs-btn"
              onClick={() => {
                setScript(zh ? '普通文档只能贴截图；这一页里的画板、代码和表格能直接联动运行。' : 'Static docs only hold screenshots; whiteboards, code, and tables run live on one BIU page.')
                setRendered(false)
              }}
            >
              {zh ? 'AI 一键精简至 15 秒内' : 'Shorten with AI (<15s)'}
            </button>
          </div>
        </section>

        <section className="site-dp-block">
          <header className="site-dp-block-head">
            <strong>{zh ? '② 时间线字幕预览与后端合成' : '2. Timeline Preview & Backend Render'}</strong>
            <button type="button" className="site-fs-btn is-primary" onClick={() => setRendered(true)}>
              {rendered ? (zh ? '已写入 /assets/ep18.mp4 ✓' : 'Saved /assets/ep18.mp4 ✓') : (zh ? '后端合成导出 MP4' : 'Render MP4 via Backend')}
            </button>
          </header>
          <div className="site-fs-preview-stage">
            <small>{zh ? `00:00 – 00:${String(estSeconds).padStart(2, '0')} · 实时字幕轨同步` : `00:00 – 00:${String(estSeconds).padStart(2, '0')} · Live Caption Sync`}</small>
            <p className="site-fs-subtitle">{script || (zh ? '（请输入口播文案）' : '(Enter script text)')}</p>
          </div>
        </section>
      </div>

      <section className="site-dp-block">
        <header className="site-dp-block-head">
          <strong>{zh ? '③ 联动刷新：多平台发布排期表' : '3. Synced Multi-Platform Schedule'}</strong>
          <span className="site-dp-plugin-tag">{zh ? '随合成状态自动更新' : 'Auto-updated on render'}</span>
        </header>
        <table className="site-dp-table">
          <thead>
            <tr>
              <th>{zh ? '平台' : 'Platform'}</th>
              <th>{zh ? '开场时长' : 'Hook Length'}</th>
              <th>{zh ? '成片状态' : 'Asset Status'}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{zh ? 'B 站 · 主站' : 'YouTube'}</td>
              <td>{estSeconds}s</td>
              <td><span className={rendered ? 'site-fs-pill is-ok' : 'site-dp-plugin-tag'}>{rendered ? (zh ? '已就绪 · ep18.mp4' : 'Ready · ep18.mp4') : (zh ? '剪辑中' : 'Editing')}</span></td>
            </tr>
            <tr>
              <td>{zh ? '小红书 · 竖屏切片' : 'Social Short'}</td>
              <td>{estSeconds}s</td>
              <td><span className={rendered ? 'site-fs-pill is-ok' : 'site-dp-plugin-tag'}>{rendered ? (zh ? '已就绪 · 可排期' : 'Ready to schedule') : (zh ? '等待主片合成' : 'Waiting on render')}</span></td>
            </tr>
          </tbody>
        </table>
      </section>
    </DemoShell>
  )
}

/** 04 专业服务与交付：计价引擎 → 合同条款实时重写 → 客户签核存证 → 交付里程碑解锁 */
function ConsultingPortalDemo({ locale }: { locale: Locale }) {
  const zh = locale === 'zh'
  const [seats, setSeats] = useState(10)
  const [rush, setRush] = useState(false)
  const [modules, setModules] = useState<string[]>(['audit', 'workspace'])
  const [signedAt, setSignedAt] = useState<string | null>(null)

  const ITEMS = zh
    ? [
        { id: 'audit', name: '流程诊断与架构报告', base: 35000, weeks: 2, deliverable: '第 1 阶段：业务瓶颈诊断书与架构蓝图' },
        { id: 'workspace', name: '专属工作台与 5 套定制插件', base: 68000, weeks: 4, deliverable: '第 2 阶段：5 套定制插件交付与验收' },
        { id: 'train', name: '全员实操培训与手册', base: 18000, weeks: 1, deliverable: '第 3 阶段：团队工作坊与源码移交' },
      ]
    : [
        { id: 'audit', name: 'Workflow Audit & Architecture', base: 8500, weeks: 2, deliverable: 'Phase 1: Audit Report & Architecture Blueprint' },
        { id: 'workspace', name: 'Custom Workspace & 5 Plugins', base: 18000, weeks: 4, deliverable: 'Phase 2: 5 Tailored Plugins Deployed & Verified' },
        { id: 'train', name: 'Team Onboarding & Playbook', base: 4500, weeks: 1, deliverable: 'Phase 3: Team Workshops & Source Handoff' },
      ]

  const toggle = (id: string) => {
    if (signedAt) return
    setModules((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const chosen = ITEMS.filter((i) => modules.includes(i.id))
  const subtotal = chosen.reduce((s, i) => s + i.base, 0) + seats * (zh ? 800 : 200)
  const total = Math.round(subtotal * (rush ? 1.2 : 1))
  const weeks = Math.max(1, Math.round(chosen.reduce((s, i) => s + i.weeks, 0) * (rush ? 0.65 : 1)))
  const currency = zh ? '¥' : '$'

  return (
    <DemoShell
      path="BIU / client-portal-nova"
      replaces={zh ? '原本需要：Keynote 方案 + Excel 报价 + DocuSign 合同 + Asana 看板 → 现在：BIU 同一页' : 'Replaces: Deck + Excel Quote + DocuSign + Asana → One BIU Page'}
      backendTag={zh ? '后端能力：计价引擎 · 合同联动 · 签核存证锁定' : 'Backend: Pricing Engine · Live SOW · Signed Hash Lock'}
      sharedState={[
        [zh ? '已选模块' : 'Modules', `${chosen.length}`],
        [zh ? '导入人数' : 'Seats', `${seats}`],
        [zh ? '含税总价' : 'Total Fee', `${currency}${total.toLocaleString('en-US')}`],
        [zh ? '合同状态' : 'Contract', signedAt ? (zh ? '已签核锁定' : 'Signed & Locked') : (zh ? '草案联动中' : 'Live Draft')],
      ]}
      title={zh ? '大客户方案、报价与签约交付门户' : 'Client Proposal, Quote & Sign-Off Portal'}
      subtitle={zh
        ? '在左侧调整模块、席位或加急周期，右侧正式合同的金额与分期条款逐字实时重写；点击客户签核后，报价锁定留痕并自动激活底部交付里程碑。'
        : 'Adjust modules, seats, or rush delivery on the left—contract clauses rewrite live on the right; signing locks the quote and activates delivery milestones below.'}
      whyNotEmbed={zh
        ? '为什么不是 iframe 嵌入：报价引擎、正式合同正文与交付里程碑共用同一份页面数据，签核状态机由后端持久化锁定，不可篡改。'
        : 'Why this beats iframe embeds: pricing rules, SOW text, and delivery milestones bind to the same shared state with backend-locked sign-off.'}
    >
      <div className="site-fs-grid-2">
        <section className="site-dp-block">
          <header className="site-dp-block-head">
            <strong>{zh ? '① 动态计价引擎' : '1. Pricing Configurator'}</strong>
            <span className="site-dp-plugin-tag is-custom">{signedAt ? (zh ? '已锁定' : 'Locked') : (zh ? '可实时调整' : 'Interactive')}</span>
          </header>
          <div className="site-dp-calc-list">
            {ITEMS.map((item) => {
              const on = modules.includes(item.id)
              return (
                <button type="button" key={item.id} className={on ? 'site-dp-calc-item is-on' : 'site-dp-calc-item'} disabled={Boolean(signedAt)} onClick={() => toggle(item.id)}>
                  <span><strong>{item.name}</strong><small>{zh ? `${item.weeks} 周` : `${item.weeks}w`}</small></span>
                  <em>{currency}{item.base.toLocaleString('en-US')}</em>
                </button>
              )
            })}
          </div>
          <label className="site-fs-slider">
            <span>{zh ? `团队导入席位：${seats} 人` : `Seats: ${seats}`}</span>
            <input type="range" min={2} max={30} value={seats} disabled={Boolean(signedAt)} onChange={(e) => setSeats(Number(e.target.value))} />
          </label>
          <div className="site-fs-toolbar">
            <button type="button" className={rush ? 'site-fs-btn is-primary' : 'site-fs-btn'} disabled={Boolean(signedAt)} onClick={() => setRush((v) => !v)}>
              {rush ? (zh ? '加急交付：开 (+20%)' : 'Rush: ON (+20%)') : (zh ? '开启加急交付' : 'Enable Rush')}
            </button>
          </div>
        </section>

        <section className="site-dp-block">
          <header className="site-dp-block-head">
            <strong>{zh ? '② 联动重写：正式合同条款与签核' : '2. Live SOW Clauses & Sign-Off'}</strong>
            <span className={signedAt ? 'site-fs-pill is-ok' : 'site-dp-plugin-tag'}>{signedAt ? (zh ? '存证锁定 ✓' : 'Locked ✓') : (zh ? '实时同步' : 'Synced')}</span>
          </header>
          <div className="site-fs-contract">
            <p>
              {zh
                ? `双方确认合作涵盖 ${chosen.length} 项模块（${seats} 位成员），总周期 ${weeks} 周，总费用 ${currency}${total.toLocaleString('en-US')}。`
                : `Scope covers ${chosen.length} modules (${seats} seats), ${weeks} weeks total, fee ${currency}${total.toLocaleString('en-US')}.`}
            </p>
            <ul>
              <li>{zh ? `启动首款（40%）：${currency}${Math.round(total * 0.4).toLocaleString('en-US')}` : `Kick-off (40%): ${currency}${Math.round(total * 0.4).toLocaleString('en-US')}`}</li>
              <li>{zh ? `验收节点（40%）：${currency}${Math.round(total * 0.4).toLocaleString('en-US')}` : `Milestone (40%): ${currency}${Math.round(total * 0.4).toLocaleString('en-US')}`}</li>
              <li>{zh ? `尾款结算（20%）：${currency}${Math.round(total * 0.2).toLocaleString('en-US')}` : `Final (20%): ${currency}${Math.round(total * 0.2).toLocaleString('en-US')}`}</li>
            </ul>
          </div>
          <div className="site-fs-toolbar">
            {signedAt ? (
              <>
                <span className="site-fs-sign-note">{zh ? `存证哈希 sha256:9f4a…c2` : `Hash sha256:9f4a…c2`}</span>
                <button type="button" className="site-fs-btn" onClick={() => setSignedAt(null)}>{zh ? '解锁重演' : 'Reset'}</button>
              </>
            ) : (
              <button type="button" className="site-fs-btn is-primary" onClick={() => setSignedAt('2026-11-22 14:40')}>
                {zh ? '客户确认签核并激活交付里程碑' : 'Sign & Activate Milestones'}
              </button>
            )}
          </div>
        </section>
      </div>

      <section className="site-dp-block">
        <header className="site-dp-block-head">
          <strong>{zh ? '③ 联动激活：项目交付里程碑（随所选模块与签核状态同步）' : '3. Synced Delivery Milestones'}</strong>
          <span className={signedAt ? 'site-fs-pill is-ok' : 'site-dp-plugin-tag'}>{signedAt ? (zh ? '已激活执行' : 'Active') : (zh ? '等待签核激活' : 'Pending Sign-off')}</span>
        </header>
        <ul className="site-fs-case-list">
          {chosen.map((item) => (
            <li key={item.id} className={signedAt ? 'is-ok' : ''}>
              <span>{signedAt ? '●' : '○'} {item.deliverable}</span>
              <small>{signedAt ? (zh ? '已立项排期' : 'Scheduled') : (zh ? '待签核' : 'Draft')}</small>
            </li>
          ))}
        </ul>
      </section>
    </DemoShell>
  )
}

/** 05 电商与消费：后端抓价预警 → SKU 利润沙盘调价 → 达人 Brief 机制自动同步 */
function EcommerceMarginDemo({ locale }: { locale: Locale }) {
  const zh = locale === 'zh'
  const [price, setPrice] = useState(zh ? 299 : 69)
  const [roas, setRoas] = useState(2.6)
  const [compDropped, setCompDropped] = useState(false)

  const cogs = zh ? 88 : 19.5
  const compPrice = compDropped ? (zh ? 259 : 58) : (zh ? 289 : 66)
  const net = price - cogs - price * 0.16 - price / roas
  const spreadAlert = price - compPrice > (zh ? 25 : 7)
  const currency = zh ? '¥' : '$'

  return (
    <DemoShell
      path="BIU / winter-sku-war-room"
      replaces={zh ? '原本需要：爬虫监控 + Excel 利润表 + 达人 Brief 文档 → 现在：BIU 同一页' : 'Replaces: Price Scraper + Excel Model + Creator Briefs → One BIU Page'}
      backendTag={zh ? '后端能力：定时竞品抓价 · 价差预警 · 全页调价联动' : 'Backend: Scheduled Price Sync · Alerts · Live Brief Sync'}
      sharedState={[
        [zh ? '我方零售价' : 'Our MSRP', `${currency}${price}`],
        [zh ? '竞品最新价' : 'Competitor', `${currency}${compPrice}`],
        [zh ? '单件净利' : 'Unit Net', `${currency}${net.toFixed(1)}`],
        [zh ? '预警状态' : 'Alert', spreadAlert ? (zh ? '价差过大 ⚠' : 'Undercut ⚠') : (zh ? '健康' : 'Healthy')],
      ]}
      title={zh ? '新品孵化与大促作战页' : 'Product Launch & Campaign War Room'}
      subtitle={zh
        ? '点击抓取竞品最新价触发降价预警；拖动我方零售价滑块重算单件净利时，底部发给达人的合作 Brief 中的到手价机制会同步自动更新。'
        : 'Fetch competitor prices to trigger an undercut alert; adjusting our MSRP recalculates unit profit and updates the creator brief pricing below in real time.'}
      whyNotEmbed={zh
        ? '为什么不是 iframe 嵌入：外部爬虫采集、内部利润沙盘与对外达人 Brief 共用同一份零售价数据，调一次价格全链路同步。'
        : 'Why this beats iframe embeds: backend price scraping, unit-economics modeling, and external creator briefs bind to the same live MSRP.'}
    >
      <div className="site-fs-grid-2">
        <section className="site-dp-block">
          <header className="site-dp-block-head">
            <strong>{zh ? '① 后端定时抓价与预警' : '1. Backend Competitor Monitor'}</strong>
            <button type="button" className="site-fs-btn is-primary" onClick={() => setCompDropped((v) => !v)}>
              {compDropped ? (zh ? '还原竞品原价' : 'Reset Price') : (zh ? '抓取最新价（模拟竞品降价）' : 'Fetch Latest (Simulate Drop)')}
            </button>
          </header>
          <table className="site-dp-table">
            <tbody>
              <tr>
                <td>{zh ? '天猫 Top 1 竞品甲' : 'Category Leader X'}</td>
                <td>{currency}{compPrice}</td>
                <td>
                  <span className={spreadAlert ? 'site-fs-pill is-warn' : 'site-fs-pill is-ok'}>
                    {spreadAlert ? (zh ? '⚠ 竞品突降，建议跟进调价' : '⚠ Undercut alert') : (zh ? '价差健康' : 'Healthy')}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="site-dp-block">
          <header className="site-dp-block-head">
            <strong>{zh ? '② SKU 利润沙盘（拖动调价）' : '2. SKU Margin Sandbox'}</strong>
            <span className={net > 0 ? 'site-fs-pill is-ok' : 'site-fs-pill is-warn'}>
              {zh ? `单件净利 ${currency}${net.toFixed(1)}` : `Net ${currency}${net.toFixed(2)}/unit`}
            </span>
          </header>
          <label className="site-fs-slider">
            <span>{zh ? `我方零售价：${currency}${price}` : `Our MSRP: ${currency}${price}`}</span>
            <input type="range" min={zh ? 229 : 50} max={zh ? 359 : 85} value={price} onChange={(e) => setPrice(Number(e.target.value))} />
          </label>
          <label className="site-fs-slider">
            <span>{zh ? `投放 ROI：${roas.toFixed(1)}` : `Paid ROAS: ${roas.toFixed(1)}x`}</span>
            <input type="range" min={16} max={42} value={Math.round(roas * 10)} onChange={(e) => setRoas(Number(e.target.value) / 10)} />
          </label>
        </section>
      </div>

      <section className="site-dp-block">
        <header className="site-dp-block-head">
          <strong>{zh ? '③ 联动刷新：对外达人合作 Brief（随零售价自动同步）' : '3. Synced Creator Brief (auto-updated with MSRP)'}</strong>
          <span className="site-dp-plugin-tag">{zh ? '共享价格字段' : 'Bound to MSRP'}</span>
        </header>
        <div className="site-fs-contract">
          <p>
            {zh
              ? `【口播核心权益】日常价 ${currency}${price + 50}，双十二直播间立减 ¥50，到手仅 ${currency}${price}（另赠替换滤网）。`
              : `[Live Talking Point] Regular ${currency}${price + 15}, holiday deal ${currency}${price} with complimentary spare filter.`}
          </p>
        </div>
      </section>
    </DemoShell>
  )
}

/** 06 金融与投研：估值假设滑块 → 投委评级自动切换 → 本机原文证据溯源 */
function FinanceDiligenceDemo({ locale }: { locale: Locale }) {
  const zh = locale === 'zh'
  const [growth, setGrowth] = useState(80)
  const [multiple, setMultiple] = useState(12)
  const [selectedEv, setSelectedEv] = useState(0)

  const arr2028 = +(14.2 * Math.pow(1 + growth / 100, 2)).toFixed(1)
  const valuation = Math.round(arr2028 * multiple)
  const moic = +(valuation / 180).toFixed(1)
  const rating = moic >= 4 ? (zh ? '建议推进投资' : 'Recommend Invest') : moic >= 2.8 ? (zh ? '进一步核查增速' : 'Further Diligence') : (zh ? '回报不足 · 观望' : 'Pass / Hold')

  const EVIDENCES = zh
    ? [
        { claim: '假设支撑 1：大客户部署周期从 3 周降至 2 天，驱动 128% NDR', source: '本机 / 访谈纪要_华东制造CTO.md · 第 14 段', quote: '“用插件式工作台两天就跑通了核心流程，今年我们把三个事业部全部迁了过来。”' },
        { claim: '假设支撑 2：头部 20 家客户过去四个季度零流失，席位增长 34%', source: '本机 / 财务尽调底稿_Q3.xlsx · Sheet2!D18', quote: '“老客户自然扩购贡献了 62% 的新增 ARR，销售回收期维持在 11 个月。”' },
      ]
    : [
        { claim: 'Driver 1: Onboarding dropped from 3 weeks to 2 days, fueling 128% NDR', source: 'Local / call-notes-cto.md · ¶14', quote: '"We went live in two days with plugin pages and expanded across three divisions this year."' },
        { claim: 'Driver 2: Zero churn across top 20 enterprise accounts; +34% seat growth', source: 'Local / financial-dd-q3.xlsx · Sheet2!D18', quote: '"Organic seat expansion drove 62% of net new ARR with an 11-month payback period."' },
      ]

  const ev = EVIDENCES[selectedEv]!

  return (
    <DemoShell
      path="BIU / local-space / deal-nova-ic"
      replaces={zh ? '原本需要：Chrome 研报 + Excel 估值 + 本地 PDF 检索 + 投委文档 → 现在：BIU 本机同一页' : 'Replaces: Browser + Excel Model + Local PDF Search + IC Memo → One Local BIU Page'}
      backendTag={zh ? '后端能力：本机全文索引 · 原文锚点 · 数据不出本地' : 'Backend: Local Index · Source Anchors · Local-Only'}
      sharedState={[
        [zh ? '2028E ARR' : '2028E ARR', `$${arr2028}M`],
        [zh ? '隐含估值' : 'Implied Value', `$${valuation}M`],
        [zh ? '预期 MOIC' : 'Est. MOIC', `${moic}x`],
        [zh ? '投委联动评级' : 'IC Rating', rating],
      ]}
      title={zh ? '一级市场尽调与投委决策页' : 'Diligence & Investment Committee Page'}
      subtitle={zh
        ? '拖动增速与退出倍数滑块，隐含估值与投委综合评级同步刷新；点击下方尽调假设，直接由本机索引定位原始访谈出处，敏感资料全程留存本地。'
        : 'Adjust growth and exit multiple to update implied value and IC rating live; click any thesis driver to inspect exact locally indexed source quotes.'}
      whyNotEmbed={zh
        ? '为什么不是 iframe 嵌入：估值模型输出实时驱动投委评级，同时本机后端索引在不上传云端的前提下完成原文级证据溯源。'
        : 'Why this beats iframe embeds: model outputs drive live IC ratings while the local backend indexes and cites confidential files without cloud upload.'}
    >
      <div className="site-fs-grid-2">
        <section className="site-dp-block">
          <header className="site-dp-block-head">
            <strong>{zh ? '① 动态估值假设模型' : '1. Valuation Assumptions'}</strong>
            <span className={moic >= 4 ? 'site-fs-pill is-ok' : 'site-fs-pill is-warn'}>{rating}</span>
          </header>
          <label className="site-fs-slider">
            <span>{zh ? `未来两年 ARR 复合增速：${growth}%` : `2-Year ARR CAGR: ${growth}%`}</span>
            <input type="range" min={40} max={120} step={5} value={growth} onChange={(e) => setGrowth(Number(e.target.value))} />
          </label>
          <label className="site-fs-slider">
            <span>{zh ? `退出估值倍数：${multiple}x ARR` : `Exit Multiple: ${multiple}x ARR`}</span>
            <input type="range" min={8} max={18} value={multiple} onChange={(e) => setMultiple(Number(e.target.value))} />
          </label>
        </section>

        <section className="site-dp-block">
          <header className="site-dp-block-head">
            <strong>{zh ? '② 联动输出：本机原文证据溯源' : '2. Local Source Citation Drawer'}</strong>
            <span className="site-dp-plugin-tag">{zh ? '数据不出本机' : 'Local-Only'}</span>
          </header>
          <div className="site-dp-calc-list">
            {EVIDENCES.map((item, idx) => (
              <button type="button" key={item.source} className={selectedEv === idx ? 'site-dp-calc-item is-on' : 'site-dp-calc-item'} onClick={() => setSelectedEv(idx)}>
                <span><strong>{item.claim}</strong><small>{item.source}</small></span>
              </button>
            ))}
          </div>
          <blockquote className="site-fs-quote">
            <small>{ev.source}</small>
            <p>{ev.quote}</p>
          </blockquote>
        </section>
      </div>
    </DemoShell>
  )
}

export function IndustryInteractiveDemo({ slug, locale }: { slug: string; locale: Locale }) {
  switch (slug) {
    case 'tech':
      return <TechOpsDemo locale={locale} />
    case 'education':
      return <EducationJudgeDemo locale={locale} />
    case 'media':
      return <MediaStudioDemo locale={locale} />
    case 'consulting':
      return <ConsultingPortalDemo locale={locale} />
    case 'ecommerce':
      return <EcommerceMarginDemo locale={locale} />
    case 'finance':
      return <FinanceDiligenceDemo locale={locale} />
    default:
      return null
  }
}
