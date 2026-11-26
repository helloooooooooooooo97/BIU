import type { CollectionSchema, CollectionSchemaPack, DbRecord } from '@biu/type-file-system'
import { isBuiltinAllViewId } from './catalog-views.ts'
import { matchListFilterRecord, type FilterGroup } from './query-logic.ts'
import { viewShareListFilter } from './share-view-match.ts'

export type DataScopeName = 'personal' | 'workspace' | 'shared'
export type ViewGrantRole = 'viewer' | 'commenter' | 'editor' | 'manager' | 'owner'
export type ViewGrantTarget = {
  id: string
  filters?: Record<string, unknown>
  filterTree?: FilterGroup | null
  builtin?: boolean
}

const ROLE_RANK: Record<ViewGrantRole, number> = { viewer: 1, commenter: 2, editor: 3, manager: 4, owner: 5 }

export function highestViewRole(roles: ViewGrantRole[]) {
  return roles.sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a])[0] ?? null
}

export function viewFiltersForGrant(
  viewId: string,
  saved: ViewGrantTarget[],
) {
  if (isBuiltinAllViewId(viewId)) {
    const view = saved.find((item) => item.id === viewId)
    return { scope: '', filters: view ? viewShareListFilter(view) : undefined }
  }
  const view = saved.find((item) => item.id === viewId)
  if (!view) return null
  const declared = view.filters?.$scope
  const scope = declared === 'personal' || declared === 'workspace' || declared === 'shared' ? declared : ''
  return { scope, filters: viewShareListFilter(view) }
}

export function recordMatchesAccessRule(
  record: DbRecord,
  filterTree: FilterGroup | Record<string, unknown> | null | undefined,
  schema?: CollectionSchema,
  packs: CollectionSchemaPack[] = [],
) {
  const filters = filterTree && typeof filterTree === 'object'
    ? viewShareListFilter({ filterTree: filterTree as FilterGroup })
    : undefined
  return matchListFilterRecord(record, filters, schema, packs)
}

export function recordMatchesGrantedView(
  record: DbRecord,
  viewId: string,
  saved: ViewGrantTarget[],
  scope: DataScopeName | null,
  owner?: { grantedBy?: string; recordOwnerId?: string },
  schema?: CollectionSchema,
  packs: CollectionSchemaPack[] = [],
) {
  const resolved = viewFiltersForGrant(viewId, saved)
  if (!resolved) return false
  if (isBuiltinAllViewId(viewId) && (!owner?.grantedBy || owner.recordOwnerId !== owner.grantedBy)) return false
  if (resolved.scope && scope !== resolved.scope) return false
  return matchListFilterRecord(record, resolved.filters, schema, packs)
}

export function grantAudienceKind(
  grant: { subjectType: 'account' | 'member_view'; subjectId: string; memberKind?: string },
  memberViews: Array<{ id: string; filters?: Record<string, unknown> }>,
): 'internal' | 'external' {
  if (grant.subjectType === 'account') {
    return grant.memberKind === 'external' || grant.memberKind === 'guest' ? 'external' : 'internal'
  }
  const kind = memberViews.find((view) => view.id === grant.subjectId)?.filters?.membershipKind
  return kind === 'external' || kind === 'guest' ? 'external' : 'internal'
}

/** 内置视图归类仍看条目自己的协作者。这里把已经落在视图上的继承授权算进实际可见范围。 */
export function effectiveDataScope(
  stored: DataScopeName,
  record: DbRecord,
  grants: Array<{ viewId: string; subjectType: 'account' | 'member_view'; subjectId: string; memberKind?: string; grantedBy?: string }>,
  dataViews: ViewGrantTarget[],
  memberViews: Array<{ id: string; filters?: Record<string, unknown> }> = [],
  recordOwnerId = '',
): DataScopeName {
  let internal = false
  let external = false
  for (const grant of grants) {
    if (!recordMatchesGrantedView(record, grant.viewId, dataViews, stored, { grantedBy: grant.grantedBy, recordOwnerId })) continue
    if (grantAudienceKind(grant, memberViews) === 'external') external = true
    else internal = true
  }
  if (external || stored === 'shared') return 'shared'
  if (stored === 'workspace' || internal) return 'workspace'
  return 'personal'
}
