import { SiteChrome, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'

const SECTIONS = [
  {
    index: '01',
    title: '本机空间',
    body: '数据保存在当前设备。页面正文在本地数据库，附件在同设备的资源目录 —— 不会因为使用产品而上传到我们的服务器。',
  },
  {
    index: '02',
    title: '云端空间',
    body: '需要多设备访问和成员协作时使用。空间内的操作受账号鉴权保护，成员权限按角色划分。',
  },
  {
    index: '03',
    title: '权限模型',
    body: '空间按所有者、管理者、编辑者、查看者划分权限；敏感操作进入待确认状态，不会静默执行。',
  },
  {
    index: '04',
    title: '可追溯',
    body: '动作写入只追加的事件流，界面是它的投影。状态和「它是怎么变成这样的」都能查到。',
  },
] as const

const ROLES = [
  ['所有者', '全部权限，含删除空间'],
  ['管理者', '成员与权限管理'],
  ['编辑者', '读写内容与数据'],
  ['查看者', '只读访问'],
] as const

export function MarketingSecurity({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: '安全',
    description: '本机空间数据不出设备，云端空间支持成员权限。数据边界由产品结构决定，不是设置项。',
    path: '/security',
  })

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero" data-reveal>
          <p className="site-section-label">安全</p>
          <h1>你的数据在哪里，由你决定。</h1>
          <p className="site-page-lead">
            多数协作产品只有云端一种形态。BIU 提供本机空间，数据边界是产品结构决定的，不是设置项。
          </p>
        </section>

        <section className="site-security-blocks">
          {SECTIONS.map((section) => (
            <article key={section.index} data-reveal>
              <span className="site-solution-index">{section.index}</span>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </section>

        <section className="site-role-table" data-reveal>
          <h2>权限角色</h2>
          <table>
            <tbody>
              {ROLES.map(([role, detail]) => (
                <tr key={role}><th>{role}</th><td>{detail}</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="site-compliance" data-reveal>
          <h2>合规状态</h2>
          <p>
            我们只列出已经完成的认证。当前尚未取得第三方安全认证 ——
            与其贴一个还没拿到的标志，不如如实说明进度。
          </p>
        </section>

        <section className="site-final-cta" data-reveal>
          <p className="site-section-label">开始使用 BIU</p>
          <h2>把边界握在自己手里。</h2>
          <button type="button" onClick={onStart}>创建你的空间 <span>↗</span></button>
        </section>
    </SiteChrome>
  )
}
