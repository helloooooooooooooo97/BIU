import { apiFetch } from '@biu/biu-ui/api-client'

export type ImportableCollectionPath = '/workspace-members' | '/agents'

export type SavedCollectionViewOption = {
  id: string
  name: string
  locked?: boolean
}

const VIEW_SNAPSHOT_PAGE_SIZE = 200
const VIEW_SNAPSHOT_MAX_PAGES = 10

/** 拉取指定集合（/workspace-members 或 /agents）当前用户可见的已保存视图列表。 */
export async function fetchCollectionViews(path: ImportableCollectionPath): Promise<SavedCollectionViewOption[]> {
  try {
    const res = await apiFetch(`/api/db/saved-views?path=${encodeURIComponent(path)}`)
    if (!res.ok) return []
    const body = (await res.json()) as { views?: Array<Record<string, unknown>> }
    if (!Array.isArray(body?.views)) return []
    const out: SavedCollectionViewOption[] = []
    const seen = new Set<string>()
    for (const raw of body.views) {
      const id = String(raw?.id ?? '').trim()
      if (!id || seen.has(id)) continue
      seen.add(id)
      const name = String(raw?.name ?? id).trim() || id
      out.push({
        id,
        name,
        ...(raw?.locked === true ? { locked: true } : {}),
      })
    }
    return out
  } catch {
    return []
  }
}

/**
 * 静态展开指定集合视图当前命中的全部记录 ID（一次性快照，不与源视图建立动态绑定）。
 * 通过 /api/db/list?path=...&view_id=... 分页拉取，保证大视图也不会被单页截断。
 */
export async function resolveCollectionViewIds(
  path: ImportableCollectionPath,
  viewId: string,
): Promise<{ ids: string[]; total: number }> {
  const cleanViewId = viewId.trim()
  if (!cleanViewId) return { ids: [], total: 0 }

  const ids: string[] = []
  const seen = new Set<string>()
  let total = 0

  for (let page = 0; page < VIEW_SNAPSHOT_MAX_PAGES; page += 1) {
    const offset = page * VIEW_SNAPSHOT_PAGE_SIZE
    const params = new URLSearchParams({
      path,
      view_id: cleanViewId,
      limit: String(VIEW_SNAPSHOT_PAGE_SIZE),
      offset: String(offset),
      columns: 'id',
    })
    const res = await apiFetch(`/api/db/list?${params.toString()}`)
    const body = (await res.json().catch(() => ({}))) as {
      items?: Array<{ id?: unknown }>
      total?: number
      error?: string
    }
    if (!res.ok) {
      throw new Error(body?.error || '读取视图快照失败')
    }
    const items = Array.isArray(body?.items) ? body.items : []
    if (typeof body?.total === 'number' && Number.isFinite(body.total)) {
      total = body.total
    } else if (page === 0) {
      total = items.length
    }
    for (const item of items) {
      const id = String(item?.id ?? '').trim()
      if (!id || seen.has(id)) continue
      seen.add(id)
      ids.push(id)
    }
    if (items.length < VIEW_SNAPSHOT_PAGE_SIZE || ids.length >= total) break
  }

  return { ids, total: Math.max(total, ids.length) }
}
