import type { CollectionSchema, CollectionSchemaPack, DbRecord } from '@biu/type-file-system'
import {
  builtinAllView,
  builtinMemberViews,
  isBuiltinAllViewId,
} from './catalog-views.ts'
import { WORKSPACE_MEMBERS_COLLECTION_PATH } from './paths.ts'
import { recordMatchesSharedView, resolveSharedView, type SharedViewDef } from './share-view-match.ts'
import { grantAudienceKind, recordMatchesGrantedView, type DataScopeName, type ViewGrantRole } from './view-access.ts'

export type AccessExplanation = {
  builtin?: boolean
  localOnly: boolean
  visibility: {
    scope: DataScopeName
    summary: string
  }
  inheritance: {
    mode: 'inherit' | 'custom'
    ancestors: Array<{
      collection: string
      recordId: string
      title: string
    }>
  }
  audience: {
    inherited: Array<{
      id: string
      sourceRecordId: string
      sourceTitle: string
      subjectType: 'account' | 'group' | 'member_view' | 'workspace_members'
      subjectName: string
      audienceKind: 'internal' | 'external'
      role: ViewGrantRole
    }>
    direct: Array<{
      id: string
      subjectType: 'account' | 'group' | 'member_view' | 'workspace_members'
      subjectId: string
      subjectName: string
      audienceKind: 'internal' | 'external'
      role: ViewGrantRole
    }>
    fromViews: Array<{
      id: string
      viewId: string
      viewName: string
      subjectType: 'account' | 'member_view'
      subjectName: string
      audienceKind: 'internal' | 'external'
      role: ViewGrantRole
    }>
    publicLinks: Array<{
      id: string
      kind: 'record' | 'view'
      targetName: string
      lanOnly: boolean
    }>
  }
  myAccess: {
    effectiveRole: ViewGrantRole
    primarySummary: string
    paths: Array<{
      id: string
      kind: 'ownership' | 'direct' | 'inherited' | 'data_view' | 'public_link'
      isPrimary: boolean
      role: ViewGrantRole
      title: string
      reason: string
      chain?: Array<{
        recordId: string
        title: string
        note: string
      }>
    }>
  }
}

export type RoleChainInput = {
  id: string
  collection?: string
  recordId?: string
  title: string
  detail: string
  role: string
  source?: 'ownership' | 'direct-grant' | 'group-grant' | 'view-grant' | 'workspace-default' | 'inherited' | 'legacy'
}

export type AncestorAccessInput = {
  collection: string
  recordId: string
  title?: string
  scope: DataScopeName
  ownerId: string
  people: Array<{ id: string; name: string; role: string; memberKind: 'member' | 'external' | 'guest' }>
  groups: Array<{ id: string; name: string; role: string }>
  memberViews: Array<{ id: string; role: string }>
}

export type ViewGrantInput = {
  viewId: string
  subjectType: 'account' | 'member_view'
  subjectId: string
  role: string
  name: string
  memberKind?: 'member' | 'external' | 'guest' | string
  grantedBy?: string
  matchesActor?: boolean
}

export type PublicShareInput = {
  kind: 'record' | 'view'
  collection: string
  recordId?: string
  viewId?: string
  title?: string
}

export type BuildAccessExplanationInput = {
  collection: string
  recordId: string
  recordTitle?: string
  tableLabel?: string
  builtin?: boolean
  localOnly: boolean
  fallbackRole?: ViewGrantRole
  record?: DbRecord | null
  schema?: CollectionSchema
  packs?: CollectionSchemaPack[]
  dataViews?: SharedViewDef[]
  memberViews?: Array<{ id: string; name: string; filters?: Record<string, unknown> }>
  publicShares?: PublicShareInput[]
  recordTitles?: Record<string, string>
  access?: {
    scope: DataScopeName
    ownerId: string
    people: Array<{ id: string; name: string; role: string; memberKind: 'member' | 'external' | 'guest' }>
    groups: Array<{ id: string; name: string; role: string }>
    memberViews: Array<{ id: string; role: string }>
    viewGrants: ViewGrantInput[]
    roleChain: RoleChainInput[]
    inheritance?: {
      mode: 'inherit' | 'custom'
      ancestors: AncestorAccessInput[]
    }
  }
}

const ROLE_RANK: Record<ViewGrantRole, number> = { viewer: 1, editor: 2, manager: 3, owner: 4 }
const KIND_PRIORITY: Record<AccessExplanation['myAccess']['paths'][number]['kind'], number> = {
  ownership: 5,
  direct: 4,
  inherited: 3,
  data_view: 2,
  public_link: 1,
}

function normalizeRole(role: string | undefined, fallback: ViewGrantRole = 'viewer'): ViewGrantRole {
  if (role === 'owner' || role === 'manager' || role === 'editor' || role === 'viewer') return role
  if (role === '管理') return 'manager'
  if (role === '编辑') return 'editor'
  if (role === '查看' || role === '阅读') return 'viewer'
  return fallback
}

function titleOf(recordTitles: Record<string, string> | undefined, collection: string, recordId: string, fallback: string) {
  return (
    recordTitles?.[`${collection}\t${recordId}`]?.trim()
    || recordTitles?.[recordId]?.trim()
    || fallback
  )
}

function resolveViewName(
  viewId: string,
  _collection: string,
  tableLabel: string,
  dataViews: SharedViewDef[],
) {
  const found = dataViews.find((view) => view.id === viewId)?.name?.trim()
  if (found) return found
  if (isBuiltinAllViewId(viewId)) return `全部${tableLabel || ''}`
  return viewId
}

export function buildAccessExplanation(input: BuildAccessExplanationInput): AccessExplanation {
  const recordTitle = input.recordTitle?.trim() || '本条'
  const tableLabel = input.tableLabel?.trim() || ''

  if (input.builtin) {
    return {
      builtin: true,
      localOnly: input.localOnly,
      visibility: {
        scope: 'shared',
        summary: '内置插件，所有成员可见',
      },
      inheritance: { mode: 'custom', ancestors: [] },
      audience: { inherited: [], direct: [], fromViews: [], publicLinks: [] },
      myAccess: {
        effectiveRole: 'viewer',
        primarySummary: '内置插件仅支持查看',
        paths: [{
          id: 'builtin',
          kind: 'direct',
          isPrimary: true,
          role: 'viewer',
          title: '内置插件',
          reason: '随产品提供，所有成员可查看',
        }],
      },
    }
  }

  const allDataViews: SharedViewDef[] = [
    builtinAllView({ path: input.collection }),
    ...(input.dataViews ?? []).filter((view) => !isBuiltinAllViewId(view.id)),
  ]
  const allMemberViews = [
    { ...builtinAllView({ path: WORKSPACE_MEMBERS_COLLECTION_PATH }) },
    ...builtinMemberViews().map((view) => ({ id: view.id, name: view.name, filters: view.filters })),
    ...(input.memberViews ?? []),
  ]

  const storedScope: DataScopeName = input.localOnly ? 'personal' : (input.access?.scope ?? 'personal')
  const record = input.record ?? { id: input.recordId }

  // 1. 公开/局域网链接命中
  const publicLinks: AccessExplanation['audience']['publicLinks'] = []
  const seenLinks = new Set<string>()
  for (const share of input.publicShares ?? []) {
    if (share.collection !== input.collection) continue
    if (share.kind === 'record' && share.recordId === input.recordId) {
      const key = 'record'
      if (!seenLinks.has(key)) {
        seenLinks.add(key)
        publicLinks.push({
          id: 'public:record',
          kind: 'record',
          targetName: '本条',
          lanOnly: input.localOnly,
        })
      }
      continue
    }
    if (share.kind === 'view' && share.viewId) {
      const view = resolveSharedView(share.viewId, allDataViews)
      if (!view || !recordMatchesSharedView(record, view, storedScope, input.schema, input.packs ?? [])) continue
      const key = `view:${share.viewId}`
      if (!seenLinks.has(key)) {
        seenLinks.add(key)
        const targetName = String(share.title || view.name || share.viewId).trim() || view.id
        publicLinks.push({
          id: `public:view:${share.viewId}`,
          kind: 'view',
          targetName,
          lanOnly: input.localOnly,
        })
      }
    }
  }

  // 2. 本机空间直接返回简洁结果
  if (input.localOnly) {
    const shared = publicLinks.length > 0
    const role = input.fallbackRole ?? 'owner'
    const isViewer = role === 'viewer'
    return {
      localOnly: true,
      visibility: {
        scope: shared ? 'shared' : 'personal',
        summary: shared ? '已开启局域网分享' : '仅本机可见',
      },
      inheritance: { mode: 'custom', ancestors: [] },
      audience: {
        inherited: [],
        direct: [],
        fromViews: [],
        publicLinks,
      },
      myAccess: {
        effectiveRole: role,
        primarySummary: isViewer ? '通过局域网链接可查看' : '你是这条内容的创建者',
        paths: [{
          id: isViewer ? 'local:lan' : 'local:owner',
          kind: isViewer ? 'public_link' : 'ownership',
          isPrimary: true,
          role,
          title: isViewer ? '局域网链接' : recordTitle,
          reason: isViewer ? '已开启局域网链接，同一局域网可查看' : '你是这条内容的创建者',
        }],
      },
    }
  }

  // 3. 云端空间：父子继承链
  const access = input.access
  const rawAncestors = access?.inheritance?.ancestors ?? []
  const inheritanceMode = access?.inheritance?.mode ?? 'custom'
  const ancestors = rawAncestors.map((ancestor) => ({
    collection: ancestor.collection,
    recordId: ancestor.recordId,
    title: ancestor.title?.trim() || titleOf(input.recordTitles, ancestor.collection, ancestor.recordId, ancestor.recordId),
  }))

  const inheritedAudience: AccessExplanation['audience']['inherited'] = []
  if (inheritanceMode === 'inherit') {
    for (const ancestor of rawAncestors) {
      const sourceTitle = ancestor.title?.trim() || titleOf(input.recordTitles, ancestor.collection, ancestor.recordId, ancestor.recordId)
      let addedFromAncestor = false
      for (const person of ancestor.people) {
        if (person.id === ancestor.ownerId) continue
        addedFromAncestor = true
        inheritedAudience.push({
          id: `inh:${ancestor.recordId}:account:${person.id}`,
          sourceRecordId: ancestor.recordId,
          sourceTitle,
          subjectType: 'account',
          subjectName: person.name,
          audienceKind: person.memberKind === 'external' || person.memberKind === 'guest' ? 'external' : 'internal',
          role: normalizeRole(person.role),
        })
      }
      for (const group of ancestor.groups) {
        addedFromAncestor = true
        inheritedAudience.push({
          id: `inh:${ancestor.recordId}:group:${group.id}`,
          sourceRecordId: ancestor.recordId,
          sourceTitle,
          subjectType: 'group',
          subjectName: group.name,
          audienceKind: 'internal',
          role: normalizeRole(group.role),
        })
      }
      for (const mv of ancestor.memberViews) {
        addedFromAncestor = true
        const mvName = allMemberViews.find((view) => view.id === mv.id)?.name ?? mv.id
        inheritedAudience.push({
          id: `inh:${ancestor.recordId}:mv:${mv.id}`,
          sourceRecordId: ancestor.recordId,
          sourceTitle,
          subjectType: 'member_view',
          subjectName: mvName,
          audienceKind: grantAudienceKind({ subjectType: 'member_view', subjectId: mv.id }, allMemberViews),
          role: normalizeRole(mv.role),
        })
      }
      if (!addedFromAncestor && ancestor.scope === 'workspace') {
        inheritedAudience.push({
          id: `inh:${ancestor.recordId}:workspace_members`,
          sourceRecordId: ancestor.recordId,
          sourceTitle,
          subjectType: 'workspace_members',
          subjectName: '全部空间成员',
          audienceKind: 'internal',
          role: 'editor',
        })
      }
    }
  }

  // 4. 本条直接授权（排除创建者本人）
  const ownerId = access?.ownerId ?? ''
  const directAudience: AccessExplanation['audience']['direct'] = []
  for (const person of access?.people ?? []) {
    if (person.id === ownerId) continue
    directAudience.push({
      id: `direct:account:${person.id}`,
      subjectType: 'account',
      subjectId: person.id,
      subjectName: person.name,
      audienceKind: person.memberKind === 'external' || person.memberKind === 'guest' ? 'external' : 'internal',
      role: normalizeRole(person.role),
    })
  }
  for (const group of access?.groups ?? []) {
    directAudience.push({
      id: `direct:group:${group.id}`,
      subjectType: 'group',
      subjectId: group.id,
      subjectName: group.name,
      audienceKind: 'internal',
      role: normalizeRole(group.role),
    })
  }
  for (const mv of access?.memberViews ?? []) {
    const mvName = allMemberViews.find((view) => view.id === mv.id)?.name ?? mv.id
    directAudience.push({
      id: `direct:mv:${mv.id}`,
      subjectType: 'member_view',
      subjectId: mv.id,
      subjectName: mvName,
      audienceKind: grantAudienceKind({ subjectType: 'member_view', subjectId: mv.id }, allMemberViews),
      role: normalizeRole(mv.role),
    })
  }
  if (!directAudience.length && inheritanceMode !== 'inherit' && storedScope === 'workspace') {
    directAudience.push({
      id: 'direct:workspace_members',
      subjectType: 'workspace_members',
      subjectId: 'workspace_members',
      subjectName: '全部空间成员',
      audienceKind: 'internal',
      role: 'editor',
    })
  }

  // 5. 数据视图开放
  const fromViews: AccessExplanation['audience']['fromViews'] = []
  const matchedActorViewPaths: AccessExplanation['myAccess']['paths'] = []
  for (const grant of access?.viewGrants ?? []) {
    if (!recordMatchesGrantedView(record, grant.viewId, allDataViews, storedScope, {
      grantedBy: grant.grantedBy,
      recordOwnerId: ownerId,
    })) {
      continue
    }
    const viewName = resolveViewName(grant.viewId, input.collection, tableLabel, allDataViews)
    const subjectName = grant.subjectType === 'member_view'
      ? (allMemberViews.find((view) => view.id === grant.subjectId)?.name ?? grant.name)
      : grant.name
    const audienceKind = grantAudienceKind(
      { subjectType: grant.subjectType, subjectId: grant.subjectId, memberKind: grant.memberKind },
      allMemberViews,
    )
    const role = normalizeRole(grant.role)
    const id = `view:${grant.viewId}:${grant.subjectType}:${grant.subjectId}`
    fromViews.push({
      id,
      viewId: grant.viewId,
      viewName,
      subjectType: grant.subjectType,
      subjectName,
      audienceKind,
      role,
    })
    if (grant.matchesActor) {
      matchedActorViewPaths.push({
        id,
        kind: 'data_view',
        isPrimary: false,
        role,
        title: `视图「${viewName}」`,
        reason: grant.subjectType === 'member_view'
          ? `你属于成员视图「${subjectName}」`
          : '通过该视图直接授权给你',
      })
    }
  }

  // 6. 可见范围结论
  const hasExternal =
    storedScope === 'shared'
    || inheritedAudience.some((item) => item.audienceKind === 'external')
    || directAudience.some((item) => item.audienceKind === 'external')
    || fromViews.some((item) => item.audienceKind === 'external')
  const hasPublicLink = publicLinks.length > 0
  const hasInternal =
    storedScope === 'workspace'
    || inheritedAudience.some((item) => item.audienceKind === 'internal')
    || directAudience.some((item) => item.audienceKind === 'internal')
    || fromViews.some((item) => item.audienceKind === 'internal')

  const visibilityScope: DataScopeName = hasPublicLink || hasExternal
    ? 'shared'
    : hasInternal
      ? 'workspace'
      : 'personal'

  const hasAllMembers = [...inheritedAudience, ...directAudience].some(
    (item) => item.subjectType === 'workspace_members'
      || (item.subjectType === 'member_view' && item.subjectName.includes('全部')),
  )
  const visibilitySummary = visibilityScope === 'shared'
    ? (hasPublicLink && hasExternal
      ? '已对外开放（公开链接与外部协作者）'
      : hasPublicLink
        ? '已开启公开链接'
        : '已对外部协作者开放')
    : visibilityScope === 'workspace'
      ? (hasAllMembers ? '全部空间成员可见' : '空间内指定成员可见')
      : '仅创建者自己可见'

  // 7. 我的权限路径（严格只含命中当前用户的路径）
  const myPaths: AccessExplanation['myAccess']['paths'] = []
  const roleChain = access?.roleChain ?? []
  if (roleChain.length > 1) {
    // roleChain[0] 是本条，最后一个是产生权限的源祖先 -> 反转为「源祖先 -> ... -> 本条」
    const ordered = [...roleChain].reverse()
    const origin = ordered[0]!
    const originTitle = titleOf(
      input.recordTitles,
      origin.collection ?? input.collection,
      origin.recordId ?? '',
      origin.title === '上一级内容' ? '上级内容' : origin.title,
    )
    myPaths.push({
      id: `inherited:${origin.id}`,
      kind: 'inherited',
      isPrimary: false,
      role: normalizeRole(origin.role),
      title: originTitle,
      reason: origin.detail,
      chain: ordered.map((step, index) => {
        const isCurrent = index === ordered.length - 1
        const stepTitle = isCurrent
          ? recordTitle
          : titleOf(
              input.recordTitles,
              step.collection ?? input.collection,
              step.recordId ?? '',
              step.title === '上一级内容' ? '上级内容' : step.title,
            )
        return {
          recordId: step.recordId ?? step.id,
          title: stepTitle,
          note: index === 0 ? step.detail : '继承上级权限',
        }
      }),
    })
  } else if (roleChain.length === 1) {
    const step = roleChain[0]!
    const isOwner = step.source === 'ownership' || step.role === 'owner'
    myPaths.push({
      id: step.id,
      kind: isOwner ? 'ownership' : 'direct',
      isPrimary: false,
      role: normalizeRole(step.role),
      title: recordTitle,
      reason: isOwner ? '你是这条内容的创建者' : step.detail,
    })
  }

  myPaths.push(...matchedActorViewPaths)

  if (!myPaths.length) {
    const fallback = input.fallbackRole ?? 'viewer'
    myPaths.push({
      id: 'fallback',
      kind: fallback === 'owner' ? 'ownership' : 'direct',
      isPrimary: true,
      role: fallback,
      title: recordTitle,
      reason: fallback === 'owner' ? '你是这条内容的创建者' : '已获得访问权限',
    })
  } else {
    myPaths.sort((left, right) => {
      const rankDiff = ROLE_RANK[right.role] - ROLE_RANK[left.role]
      if (rankDiff !== 0) return rankDiff
      return KIND_PRIORITY[right.kind] - KIND_PRIORITY[left.kind]
    })
    myPaths[0]!.isPrimary = true
  }

  const primary = myPaths[0]!
  const primarySummary = primary.kind === 'ownership'
    ? '你是这条内容的创建者'
    : primary.kind === 'inherited'
      ? `继承自上级「${primary.title}」`
      : primary.kind === 'data_view'
        ? `通过${primary.title}获得`
        : primary.reason

  return {
    localOnly: false,
    visibility: {
      scope: visibilityScope,
      summary: visibilitySummary,
    },
    inheritance: {
      mode: inheritanceMode,
      ancestors,
    },
    audience: {
      inherited: inheritedAudience,
      direct: directAudience,
      fromViews,
      publicLinks,
    },
    myAccess: {
      effectiveRole: primary.role,
      primarySummary,
      paths: myPaths,
    },
  }
}
