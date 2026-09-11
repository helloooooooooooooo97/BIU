export type NoticeClickRow = {
  id: string
  href?: string
}

export type NoticeClickPlan = {
  noticeId: string
  sessionHref: string
  record: { collection: string; recordId: string } | null
}

export function noticeClickPlan(row: NoticeClickRow): NoticeClickPlan {
  const href = String(row.href ?? '').trim()
  const record = href.match(/^\/database(\/[^/]+)\/record\/([^/?#]+)/)
  return {
    noticeId: row.id,
    sessionHref: href.startsWith('/s/') ? href : '',
    record: record
      ? { collection: record[1]!, recordId: decodeURIComponent(record[2]!) }
      : null,
  }
}

export function revealInspectorRecord(collection: string, recordId: string) {
  window.dispatchEvent(
    new CustomEvent('biu:inspector-reveal', {
      detail: { collection, recordId, unique: true },
    }),
  )
}

/** 右侧打开这条通知；有任务则再打开任务；有会话则返回要跳的路由。 */
export function applyNoticeClick(row: NoticeClickRow) {
  const plan = noticeClickPlan(row)
  revealInspectorRecord('/notices', plan.noticeId)
  if (plan.record) revealInspectorRecord(plan.record.collection, plan.record.recordId)
  return plan.sessionHref
}
