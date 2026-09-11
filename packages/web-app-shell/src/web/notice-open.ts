export type NoticeClickRow = {
  id: string
  href?: string
  path?: string
}

export type NoticeClickPlan = {
  noticeId: string
  sessionHref: string
  record: { collection: string; recordId: string } | null
}

export function noticeIdOf(row: { id?: string; path?: string }) {
  const id = String(row.id ?? '').trim()
  if (id) return id
  const path = String(row.path ?? '').trim()
  return path.split('/').filter(Boolean).pop() || ''
}

export function noticeClickPlan(row: NoticeClickRow): NoticeClickPlan {
  const href = String(row.href ?? '').trim()
  const record = href.match(/^\/database(\/[^/]+)\/record\/([^/?#]+)/)
  return {
    noticeId: noticeIdOf(row),
    sessionHref: href.startsWith('/s/') ? href : '',
    record: record
      ? { collection: record[1]!, recordId: decodeURIComponent(record[2]!) }
      : null,
  }
}

export function noticeOpenHref(row: NoticeClickRow) {
  const plan = noticeClickPlan(row)
  if (plan.sessionHref) return plan.sessionHref
  if (plan.record) {
    return `/database${plan.record.collection}/record/${encodeURIComponent(plan.record.recordId)}`
  }
  if (plan.noticeId) return `/database/notices/record/${encodeURIComponent(plan.noticeId)}`
  return ''
}

export function revealInspectorRecord(collection: string, recordId: string) {
  window.dispatchEvent(
    new CustomEvent('biu:inspector-reveal', {
      detail: { collection, recordId, unique: true },
    }),
  )
}

/** 检查器打开通知（及任务）；主界面跳到能看见的详情页。 */
export function applyNoticeClick(row: NoticeClickRow) {
  const plan = noticeClickPlan(row)
  if (plan.noticeId) revealInspectorRecord('/notices', plan.noticeId)
  if (plan.record) revealInspectorRecord(plan.record.collection, plan.record.recordId)
  return noticeOpenHref(row)
}
