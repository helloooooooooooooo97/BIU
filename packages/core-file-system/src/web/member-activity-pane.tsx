import { useEffect, useMemo, useState } from 'react'
import type { DbRecord } from '@biu/type-file-system'
import { readJson } from './db-client.ts'

type ActivityCategory = 'data' | 'access' | 'member' | 'session' | 'automation'

type MemberActivityPayload = {
  member: {
    id: string
    name: string
    displayName: string
    email: string
    role: string
    memberKind: 'member' | 'external' | 'guest'
    status: 'online' | 'active' | 'expired'
    joinedAt: number
    lastActiveAt: number
  }
  stats: {
    totalEvents: number
    activeDays: number
    currentStreak: number
    last30Days: number
    byCategory: Record<ActivityCategory, number>
    byVia: { user: number; agent: number; mcp: number }
  }
  heatmap: Array<{ date: string; count: number; level: 0 | 1 | 2 | 3 | 4 }>
  recent: Array<{
    id: number
    via: 'user' | 'agent' | 'mcp'
    category: ActivityCategory
    action: string
    collection: string
    recordId: string
    recordTitle: string
    detail: string
    count: number
    createdAt: number
    updatedAt: number
  }>
  grants: {
    records: Array<{ collection: string; recordId: string; role: string }>
    views: Array<{ collection: string; viewId: string; role: string }>
  }
}

const CATEGORY_TABS: Array<{ key: 'all' | ActivityCategory; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'data', label: '内容变更' },
  { key: 'access', label: '协作权限' },
  { key: 'automation', label: 'AI 与工具' },
  { key: 'member', label: '成员管理' },
]

function formatDayKey(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDayHeading(dayKey: string) {
  const today = formatDayKey(Date.now())
  const yesterday = formatDayKey(Date.now() - 24 * 60 * 60 * 1000)
  if (dayKey === today) return '今天'
  if (dayKey === yesterday) return '昨天'
  return dayKey
}

function formatTime(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function actionVerb(action: string, detail: string) {
  switch (action) {
    case 'record.create': return '创建了'
    case 'record.update': return '编辑了'
    case 'record.delete': return detail || '删除了'
    case 'record.restore': return '恢复了'
    case 'access.grant': return '更新了协作权限'
    case 'access.revoke': return '移除了协作权限'
    case 'access.inherit': return detail || '调整了继承设置'
    case 'access.view_grant': return '配置了视图授权'
    case 'access.view_revoke': return '移除了视图授权'
    case 'mcp.call': return detail || '调用了 MCP 工具'
    default: return detail || action
  }
}

function roleText(role: string) {
  if (role === 'owner') return '创建者'
  if (role === 'manager') return '可管理'
  if (role === 'viewer') return '可查看'
  return '可编辑'
}

export function MemberActivityPane({
  record,
  openRecord,
}: {
  record: DbRecord
  openRecord?: (collection: string, recordId: string) => void
}) {
  const [data, setData] = useState<MemberActivityPayload | null>(null)
  const [error, setError] = useState('')
  const [category, setCategory] = useState<'all' | ActivityCategory>('all')
  const [selectedDay, setSelectedDay] = useState('')

  useEffect(() => {
    let cancelled = false
    setError('')
    setSelectedDay('')
    void readJson<MemberActivityPayload>(
      `/api/account/member-activity?memberId=${encodeURIComponent(record.id)}&days=182`,
      undefined,
      { fresh: true },
    )
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '无法加载成员活动')
      })
    return () => {
      cancelled = true
    }
  }, [record.id])

  // 将 182 天按周列分组，模拟 GitHub 贡献热力图网格（每列 7 天，周日到周六）
  const weeks = useMemo(() => {
    const cells = data?.heatmap ?? []
    if (!cells.length) return [] as Array<{ monthLabel: string; days: Array<MemberActivityPayload['heatmap'][number] | null> }>
    const firstDate = new Date(`${cells[0]!.date}T00:00:00`)
    const leadingEmpty = firstDate.getDay()
    const padded: Array<MemberActivityPayload['heatmap'][number] | null> = [
      ...Array.from({ length: leadingEmpty }, () => null),
      ...cells,
    ]
    const cols: Array<{ monthLabel: string; days: Array<MemberActivityPayload['heatmap'][number] | null> }> = []
    let lastMonth = -1
    for (let i = 0; i < padded.length; i += 7) {
      const slice = padded.slice(i, i + 7)
      while (slice.length < 7) slice.push(null)
      const firstReal = slice.find(Boolean)
      let monthLabel = ''
      if (firstReal) {
        const m = Number(firstReal.date.slice(5, 7))
        if (m !== lastMonth) {
          monthLabel = `${m}月`
          lastMonth = m
        }
      }
      cols.push({ monthLabel, days: slice })
    }
    return cols
  }, [data?.heatmap])

  const filteredRecent = useMemo(() => {
    const list = data?.recent ?? []
    return list.filter((item) => {
      if (category !== 'all' && item.category !== category) return false
      if (selectedDay && formatDayKey(item.updatedAt) !== selectedDay) return false
      return true
    })
  }, [data?.recent, category, selectedDay])

  const groupedRecent = useMemo(() => {
    const groups = new Map<string, typeof filteredRecent>()
    for (const item of filteredRecent) {
      const key = formatDayKey(item.updatedAt)
      const bucket = groups.get(key) ?? []
      bucket.push(item)
      groups.set(key, bucket)
    }
    return [...groups.entries()]
  }, [filteredRecent])

  if (error) {
    return (
      <section className="fsdb-member-panel" data-testid="fsdb-member-activity">
        <p className="fsdb-member-empty">{error}</p>
      </section>
    )
  }

  if (!data) {
    return (
      <section className="fsdb-member-panel" data-testid="fsdb-member-activity">
        <p className="fsdb-member-empty">正在加载活动统计…</p>
      </section>
    )
  }

  const statusText = data.member.status === 'online' ? '在线' : data.member.status === 'expired' ? '已过期' : '正常'

  return (
    <div className="fsdb-member-panel" data-testid="fsdb-member-activity">
      <section className="fsdb-member-kpis" aria-label="成员活动统计">
        <div className="fsdb-member-kpi">
          <span>状态</span>
          <strong className={`fsdb-member-status is-${data.member.status}`}>
            <i aria-hidden />
            {statusText}
          </strong>
        </div>
        <div className="fsdb-member-kpi">
          <span>近半年活动</span>
          <strong>{data.stats.totalEvents}</strong>
        </div>
        <div className="fsdb-member-kpi">
          <span>近 30 天</span>
          <strong>{data.stats.last30Days}</strong>
        </div>
        <div className="fsdb-member-kpi">
          <span>活跃天数 / 连续</span>
          <strong>
            {data.stats.activeDays} 天
            {data.stats.currentStreak > 0 ? <em> · 连 {data.stats.currentStreak} 天</em> : null}
          </strong>
        </div>
      </section>

      <section className="fsdb-member-card" aria-label="活动热力图">
        <header className="fsdb-member-card-head">
          <div>
            <h3>活动热力图</h3>
            <em>最近 26 周共 {data.stats.totalEvents} 次行为记录 · 点击任意日期可筛选下方时间线</em>
          </div>
          <div className="fsdb-member-legend" aria-hidden>
            <span>少</span>
            <i className="is-l0" />
            <i className="is-l1" />
            <i className="is-l2" />
            <i className="is-l3" />
            <i className="is-l4" />
            <span>多</span>
          </div>
        </header>
        <div className="fsdb-member-heatmap-wrap">
          <div className="fsdb-member-heatmap-weekdays" aria-hidden>
            <span />
            <span>一</span>
            <span />
            <span>三</span>
            <span />
            <span>五</span>
            <span />
          </div>
          <div className="fsdb-member-heatmap-scroll">
            <div className="fsdb-member-heatmap-months" aria-hidden>
              {weeks.map((week, idx) => (
                <span key={idx}>{week.monthLabel}</span>
              ))}
            </div>
            <div className="fsdb-member-heatmap-grid" role="grid" aria-label="每日活动热力图">
              {weeks.map((week, wIdx) => (
                <div className="fsdb-member-heatmap-col" key={wIdx}>
                  {week.days.map((cell, dIdx) =>
                    cell ? (
                      <button
                        key={cell.date}
                        type="button"
                        className={`fsdb-member-heatmap-cell is-l${cell.level}${selectedDay === cell.date ? ' is-selected' : ''}`}
                        title={`${cell.date}：${cell.count} 次活动`}
                        aria-label={`${cell.date}：${cell.count} 次活动`}
                        onClick={() => setSelectedDay((prev) => (prev === cell.date ? '' : cell.date))}
                      />
                    ) : (
                      <span key={`pad-${wIdx}-${dIdx}`} className="fsdb-member-heatmap-pad" aria-hidden />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="fsdb-member-card" aria-label="行为时间线">
        <header className="fsdb-member-card-head">
          <h3>行为记录</h3>
          <div className="fsdb-member-tabs" role="tablist" aria-label="按行为类型筛选">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={category === tab.key}
                className={category === tab.key ? 'is-on' : ''}
                onClick={() => setCategory(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        {selectedDay ? (
          <div className="fsdb-member-day-filter">
            <span>已筛选日期：{selectedDay}</span>
            <button type="button" onClick={() => setSelectedDay('')}>清除筛选</button>
          </div>
        ) : null}

        {!groupedRecent.length ? (
          <p className="fsdb-member-empty">
            {selectedDay ? `${selectedDay} 暂无行为记录` : '暂无行为记录，创建、编辑、协作授权或调用工具后会自动记录在这里。'}
          </p>
        ) : (
          <div className="fsdb-member-feed">
            {groupedRecent.map(([dayKey, items]) => (
              <div className="fsdb-member-day" key={dayKey}>
                <h4>{formatDayHeading(dayKey)}</h4>
                <ul>
                  {items.map((item) => {
                    const targetLabel = item.recordTitle || item.recordId
                    const clickable = Boolean(openRecord && item.collection && item.recordId)
                    return (
                      <li key={item.id}>
                        <span className={`fsdb-member-dot is-${item.category}`} aria-hidden />
                        <div className="fsdb-member-event-copy">
                          <span className="fsdb-member-event-main">
                            <span>{actionVerb(item.action, item.detail)}</span>
                            {targetLabel ? (
                              clickable ? (
                                <button
                                  type="button"
                                  className="fsdb-member-record-link"
                                  onClick={() => openRecord?.(item.collection, item.recordId)}
                                >
                                  「{targetLabel}」
                                </button>
                              ) : (
                                <strong>「{targetLabel}」</strong>
                              )
                            ) : null}
                            {item.count > 1 ? <em className="fsdb-member-count">· {item.count} 次</em> : null}
                            {item.via !== 'user' ? (
                              <span className="fsdb-member-via">{item.via === 'mcp' ? 'MCP' : 'Agent'}</span>
                            ) : null}
                          </span>
                          {item.detail && item.action !== 'mcp.call' && item.action !== 'access.inherit' && item.action !== 'record.delete' ? (
                            <em className="fsdb-member-event-detail">{item.detail}</em>
                          ) : null}
                        </div>
                        <time>{formatTime(item.updatedAt)}</time>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {data.grants.records.length > 0 || data.grants.views.length > 0 ? (
        <section className="fsdb-member-card" aria-label="直接授权范围">
          <header className="fsdb-member-card-head">
            <div>
              <h3>直接授权</h3>
              <em>{data.grants.records.length} 条记录 · {data.grants.views.length} 个视图</em>
            </div>
          </header>
          <ul className="fsdb-member-grants">
            {data.grants.records.slice(0, 12).map((grant) => (
              <li key={`rec:${grant.collection}:${grant.recordId}`}>
                {openRecord ? (
                  <button
                    type="button"
                    className="fsdb-member-record-link"
                    onClick={() => openRecord(grant.collection, grant.recordId)}
                  >
                    {grant.collection}/{grant.recordId}
                  </button>
                ) : (
                  <span>{grant.collection}/{grant.recordId}</span>
                )}
                <em>{roleText(grant.role)}</em>
              </li>
            ))}
            {data.grants.views.slice(0, 12).map((grant) => (
              <li key={`view:${grant.collection}:${grant.viewId}`}>
                <span>视图 {grant.collection} · {grant.viewId}</span>
                <em>{roleText(grant.role)}</em>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
