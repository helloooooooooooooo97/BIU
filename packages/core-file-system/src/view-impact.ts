import type { DbRecord } from '@biu/type-file-system'
import type { FilterGroup } from './query-logic.ts'
import { recordMatchesGrantedView, type DataScopeName } from './view-access.ts'

export type ViewFilterDef = {
  id: string
  filters?: Record<string, unknown>
  filterTree?: FilterGroup | null
  builtin?: boolean
}

export type ViewImpactPreview = {
  addedRecordIds: string[]
  removedRecordIds: string[]
  unchangedCount: number
}

/**
 * 干跑预览（Dry-run）：计算修改一个已绑定授权的数据视图筛选条件前后的命中记录差集，
 * 供管理员在保存前确认新增暴露与收回的范围。
 */
export function previewViewFilterImpact(input: {
  records: DbRecord[]
  viewId: string
  beforeView: ViewFilterDef
  afterView: ViewFilterDef
  scopeOf?: (record: DbRecord) => DataScopeName | null
  ownerOf?: (record: DbRecord) => string
  grantedBy?: string
}): ViewImpactPreview {
  const beforeSaved = [{ ...input.beforeView, id: input.viewId }]
  const afterSaved = [{ ...input.afterView, id: input.viewId }]
  const addedRecordIds: string[] = []
  const removedRecordIds: string[] = []
  let unchangedCount = 0

  for (const record of input.records) {
    const id = String(record.id ?? '')
    if (!id) continue
    const scope = input.scopeOf?.(record) ?? null
    const owner = input.grantedBy
      ? { grantedBy: input.grantedBy, recordOwnerId: input.ownerOf?.(record) ?? '' }
      : undefined
    const matchedBefore = recordMatchesGrantedView(record, input.viewId, beforeSaved, scope, owner)
    const matchedAfter = recordMatchesGrantedView(record, input.viewId, afterSaved, scope, owner)
    if (!matchedBefore && matchedAfter) addedRecordIds.push(id)
    else if (matchedBefore && !matchedAfter) removedRecordIds.push(id)
    else if (matchedBefore && matchedAfter) unchangedCount += 1
  }

  return { addedRecordIds, removedRecordIds, unchangedCount }
}
