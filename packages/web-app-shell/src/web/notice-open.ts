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
    sessionHref: href.startsWith('/agents/') || href.startsWith('/channels/') ? href : '',
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

/** 主界面跳到能看见的详情页；任务等可进检查器，通知本身不进右侧选项。 */
export function applyNoticeClick(row: NoticeClickRow) {
  const plan = noticeClickPlan(row)
  if (plan.record) revealInspectorRecord(plan.record.collection, plan.record.recordId)
  return noticeOpenHref(row)
}

/** 全部标为已读：优先调用批量端点，若旧版后端尚未提供该路由（如 404），自动降级逐条 `/api/db/update`。 */
export async function markAllNoticesRead(
  unreadIds: string[],
  fetcher: (input: string, init?: RequestInit) => Promise<{ ok: boolean; status?: number }>,
): Promise<boolean> {
  try {
    const res = await fetcher('/api/db/notices/read-all', { method: 'POST' })
    if (res.ok) return true
  } catch {
    /* 降级到逐条更新 */
  }
  const ids = [...new Set(unreadIds.map((id) => id.trim()).filter(Boolean))]
  if (!ids.length) return false
  const results = await Promise.allSettled(
    ids.map((id) =>
      fetcher('/api/db/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: `/notices/${id}`, content: { read: true } }),
      }),
    ),
  )
  return results.some((item) => item.status === 'fulfilled' && item.value.ok)
}
