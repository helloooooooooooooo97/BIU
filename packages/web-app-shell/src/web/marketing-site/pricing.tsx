import { useMemo, useState } from 'react'
import { SiteChrome, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'

/** 常见工具单价（每用户每月，美元）——源自 Notion 定价页的思路：让用户自己算。 */
const TOOL_COSTS = [
  { id: 'knowledge', label: '知识库', price: 10 },
  { id: 'project', label: '项目管理', price: 24 },
  { id: 'ai', label: 'AI 助手', price: 20 },
  { id: 'meeting', label: '会议记录', price: 18 },
  { id: 'search', label: '搜索', price: 35 },
  { id: 'calendar', label: '日程', price: 15 },
] as const

type Plan = {
  name: string
  price: string
  cadence: string
  features: readonly string[]
  cta: string
  featured: boolean
}

const PLANS: readonly Plan[] = [
  {
    name: '免费',
    price: '$0',
    cadence: '个人起步',
    featured: false,
    features: ['本机空间', '页面与数据库', '基础智能体会话'],
    cta: '立即使用',
  },
  {
    name: '个人',
    price: '按需',
    cadence: '每用户每月',
    features: ['本机 + 云端空间', '自定义模型', '插件与技能', '更多智能体额度'],
    cta: '立即使用',
    featured: true,
  },
  {
    name: '团队',
    price: '按需',
    cadence: '每用户每月',
    featured: false,
    features: ['云端协作空间', '成员权限', '任务看板与多智能体', '共享上下文'],
    cta: '联系我们',
  },
  {
    name: '企业',
    price: '定制',
    cadence: '按规模',
    featured: false,
    features: ['私有部署', 'SSO 与审计', '专属支持', '合规协助'],
    cta: '联系销售',
  },
] as const

const PRICING_FAQ = [
  ['本机空间要付费吗？', '本机空间的数据保存在当前设备。免费档即可使用基础能力，超出额度部分再按需升级。'],
  ['本机和云端可以同时用吗？', '可以。两种空间各自成立，按工作内容选择：敏感资料留本机，协作内容放云端。'],
  ['怎么升级或降级？', '在空间设置里随时调整，变更立即生效，按实际使用周期折算。'],
  ['支持退款吗？', '支持。未使用完的周期可申请退回，具体见服务条款。'],
] as const

export function MarketingPricing({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: '定价',
    description: '把知识库、项目管理、AI 助手、会议记录、搜索和日程收进一个空间。用 ROI 计算器算算现在花了多少。',
    path: '/pricing',
  })
  const [selected, setSelected] = useState<string[]>(['knowledge', 'project', 'ai'])
  const [seats, setSeats] = useState(10)

  const toggleTool = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  const monthly = useMemo(
    () => TOOL_COSTS.filter((tool) => selected.includes(tool.id)).reduce((sum, tool) => sum + tool.price, 0),
    [selected],
  )
  const yearly = monthly * 12 * Math.max(1, seats)

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero" data-reveal>
          <p className="site-section-label">定价</p>
          <h1>更少工具，更多产出。</h1>
          <p className="site-page-lead">
            把知识库、项目管理、AI 助手、会议记录、搜索和日程收进一个空间。
            先算算现在花了多少。
          </p>
        </section>

        <section className="site-roi" data-reveal aria-label="成本对比">
          <h2>你现在的工具成本</h2>
          <div className="site-roi-body">
            <fieldset className="site-roi-tools">
              <legend className="sr-only">正在使用的工具</legend>
              {TOOL_COSTS.map((tool) => (
                <label key={tool.id} className={selected.includes(tool.id) ? 'is-on' : ''}>
                  <input
                    type="checkbox"
                    checked={selected.includes(tool.id)}
                    onChange={() => toggleTool(tool.id)}
                  />
                  <span>{tool.label}</span>
                  <em>${tool.price}/人</em>
                </label>
              ))}
            </fieldset>
            <div className="site-roi-result">
              <label className="site-roi-seats">
                团队人数
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={seats}
                  onChange={(event) => setSeats(Math.max(1, Math.min(5000, Number(event.target.value) || 1)))}
                />
              </label>
              <p className="site-roi-number">
                <strong>${monthly}</strong><span>/人/月</span>
              </p>
              <p className="site-roi-total">合计约 <strong>${yearly.toLocaleString('en-US')}</strong> / 年</p>
              <p className="site-roi-note">
                这些能力在 BIU 里由同一个空间承担 —— 结果是按你选的工具算出来的。
              </p>
            </div>
          </div>
        </section>

        <section className="site-plans" aria-label="套餐">
          <div className="site-plans-grid">
            {PLANS.map((plan) => (
              <article key={plan.name} className={plan.featured ? 'is-featured' : ''} data-reveal>
                <h3>{plan.name}</h3>
                <p className="site-plan-price">{plan.price}<span>{plan.cadence}</span></p>
                <ul>
                  {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
                </ul>
                <button type="button" onClick={plan.cta === '立即使用' ? onStart : onLogin}>{plan.cta}</button>
              </article>
            ))}
          </div>
        </section>

        <section className="site-space-compare" data-reveal>
          <h2>本机空间 vs 云端空间</h2>
          <table>
            <thead>
              <tr><th>维度</th><th>本机空间</th><th>云端空间</th></tr>
            </thead>
            <tbody>
              <tr><td>数据位置</td><td>留在当前设备</td><td>云端托管</td></tr>
              <tr><td>离线</td><td>可用</td><td>需要网络</td></tr>
              <tr><td>多设备</td><td>—</td><td>支持</td></tr>
              <tr><td>成员协作</td><td>—</td><td>支持权限管理</td></tr>
              <tr><td>适合</td><td>私人资料、敏感内容</td><td>团队共享、在线协作</td></tr>
            </tbody>
          </table>
        </section>

        <section className="site-faq">
          <div className="site-faq-heading" data-reveal>
            <p className="site-section-label">常见问题</p>
            <h2>关于计费。</h2>
          </div>
          <div className="site-faq-list" data-reveal>
            {PRICING_FAQ.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="site-final-cta" data-reveal>
          <p className="site-section-label">开始使用 BIU</p>
          <h2>先免费用起来。</h2>
          <button type="button" onClick={onStart}>创建你的空间 <span>↗</span></button>
        </section>
    </SiteChrome>
  )
}
