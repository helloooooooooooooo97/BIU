import {
  ROLE_RANK,
  normalizeAuthzRole,
  type AuthzRole,
  type AuthzShareScope,
} from './shared/authz-labels.ts'

export type DataScopeName = AuthzShareScope
export type ViewGrantRole = AuthzRole

export type AccessExplanation = {
  builtin?: boolean
  localOnly: boolean
  visibility: {
    scope: DataScopeName
    hasExternal?: boolean
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
      subjectType: 'account' | 'member_view' | 'workspace_members'
      subjectName: string
      audienceKind: 'internal' | 'external'
      role: ViewGrantRole
    }>
    direct: Array<{
      id: string
      subjectType: 'account' | 'member_view' | 'workspace_members'
      subjectId: string
      subjectName: string
      audienceKind: 'internal' | 'external'
      role: ViewGrantRole
    }>
    publicLinks: Array<{
      id: string
      kind: 'record'
      targetName: string
      lanOnly: boolean
      inheritedFrom?: {
        collection: string
        recordId: string
        title: string
      }
    }>
  }
  myAccess: {
    effectiveRole: ViewGrantRole
    primarySummary: string
    paths: Array<{
      id: string
      kind: 'ownership' | 'direct' | 'inherited' | 'public_link'
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
  source?: 'ownership' | 'direct-grant' | 'member-view-grant' | 'workspace-default' | 'inherited'
}

export type AncestorAccessInput = {
  collection: string
  recordId: string
  title?: string
  scope: DataScopeName
  memberDefaultRole?: 'viewer' | 'editor'
  ownerId: string
  people: Array<{ id: string; name: string; role: string; memberKind: 'member' | 'external' | 'guest' }>
  memberViews?: Array<{ id: string; name: string; role: string }>
}

export type PublicShareInput = {
  kind: 'record'
  collection: string
  recordId: string
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
  publicShares?: PublicShareInput[]
  recordTitles?: Record<string, string>
  access?: {
    scope: DataScopeName
    memberDefaultRole?: 'viewer' | 'editor'
    ownerId: string
    people: Array<{ id: string; name: string; role: string; memberKind: 'member' | 'external' | 'guest' }>
    memberViews?: Array<{ id: string; name: string; role: string }>
    roleChain: RoleChainInput[]
    inheritance?: {
      mode: 'inherit' | 'custom'
      ancestors: AncestorAccessInput[]
    }
  }
}

const KIND_PRIORITY: Record<AccessExplanation['myAccess']['paths'][number]['kind'], number> = {
  ownership: 4,
  direct: 3,
  inherited: 2,
  public_link: 1,
}

function normalizeRole(role: string | undefined, fallback: ViewGrantRole = 'viewer'): ViewGrantRole {
  return normalizeAuthzRole(role) ?? fallback
}

function titleOf(recordTitles: Record<string, string> | undefined, collection: string, recordId: string, fallback: string) {
  return (
    recordTitles?.[`${collection}\t${recordId}`]?.trim()
    || recordTitles?.[recordId]?.trim()
    || fallback
  )
}

export function buildAccessExplanation(input: BuildAccessExplanationInput): AccessExplanation {
  const recordTitle = input.recordTitle?.trim() || '本条'

  if (input.builtin) {
    return {
      builtin: true,
      localOnly: input.localOnly,
      visibility: {
        scope: 'shared',
        summary: '内置插件，所有成员可见',
      },
      inheritance: { mode: 'custom', ancestors: [] },
      audience: { inherited: [], direct: [], publicLinks: [] },
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

  const storedScope: DataScopeName = input.localOnly ? 'personal' : (input.access?.scope ?? 'personal')

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
    }
  }

  if (input.localOnly) {
    const shared = publicLinks.length > 0
    const role = input.fallbackRole ?? 'owner'
    const isViewer = role === 'viewer'
    return {
      localOnly: true,
      visibility: {
        scope: shared ? 'shared' : 'personal',
        hasExternal: shared,
        summary: shared ? '已开启局域网分享' : '仅本机可见',
      },
      inheritance: { mode: 'custom', ancestors: [] },
      audience: {
        inherited: [],
        direct: [],
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
    const publicShareSet = new Set(
      (input.publicShares ?? [])
        .filter((share) => share.kind === 'record' && share.recordId)
        .map((share) => `${share.collection}\t${share.recordId}`),
    )
    for (const ancestor of rawAncestors) {
      const sourceTitle = ancestor.title?.trim() || titleOf(input.recordTitles, ancestor.collection, ancestor.recordId, ancestor.recordId)
      if (publicShareSet.has(`${ancestor.collection}\t${ancestor.recordId}`)) {
        const linkKey = `inherited:${ancestor.collection}\t${ancestor.recordId}`
        if (!seenLinks.has(linkKey)) {
          seenLinks.add(linkKey)
          publicLinks.push({
            id: `public:inherited:${ancestor.collection}:${ancestor.recordId}`,
            kind: 'record',
            targetName: sourceTitle,
            lanOnly: false,
            inheritedFrom: {
              collection: ancestor.collection,
              recordId: ancestor.recordId,
              title: sourceTitle,
            },
          })
        }
      }
      for (const person of ancestor.people) {
        if (person.id === ancestor.ownerId) continue
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
      for (const mv of ancestor.memberViews ?? []) {
        inheritedAudience.push({
          id: `inh:${ancestor.recordId}:member_view:${mv.id}`,
          sourceRecordId: ancestor.recordId,
          sourceTitle,
          subjectType: 'member_view',
          subjectName: mv.name,
          audienceKind: 'internal',
          role: normalizeRole(mv.role),
        })
      }
      if (ancestor.scope === 'workspace') {
        inheritedAudience.push({
          id: `inh:${ancestor.recordId}:workspace_members`,
          sourceRecordId: ancestor.recordId,
          sourceTitle,
          subjectType: 'workspace_members',
          subjectName: '全部空间成员',
          audienceKind: 'internal',
          role: ancestor.memberDefaultRole === 'viewer' ? 'viewer' : 'editor',
        })
      }
    }
  }

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
  for (const mv of access?.memberViews ?? []) {
    directAudience.push({
      id: `direct:member_view:${mv.id}`,
      subjectType: 'member_view',
      subjectId: mv.id,
      subjectName: mv.name,
      audienceKind: 'internal',
      role: normalizeRole(mv.role),
    })
  }
  if (inheritanceMode !== 'inherit' && storedScope === 'workspace') {
    directAudience.push({
      id: 'direct:workspace_members',
      subjectType: 'workspace_members',
      subjectId: 'workspace_members',
      subjectName: '全部空间成员',
      audienceKind: 'internal',
      role: access?.memberDefaultRole === 'viewer' ? 'viewer' : 'editor',
    })
  }

  // Notion 对齐三态内部范围（空间 / 共享 / 私人）+ 正交外部标记（外链 / 外部协作者）
  const hasExternalCollaborator =
    inheritedAudience.some((item) => item.audienceKind === 'external')
    || directAudience.some((item) => item.audienceKind === 'external')
  const hasPublicLink = publicLinks.length > 0
  const hasExternal = hasPublicLink || hasExternalCollaborator
  const hasAnyCollaborator =
    inheritedAudience.some((item) => item.subjectType !== 'workspace_members')
    || directAudience.some((item) => item.subjectType !== 'workspace_members')
  const visibilityScope: DataScopeName = storedScope === 'workspace'
    ? 'workspace'
    : (storedScope === 'shared' || hasAnyCollaborator)
      ? 'shared'
      : 'personal'

  const baseSummary = visibilityScope === 'workspace'
    ? '全部空间成员可见'
    : visibilityScope === 'shared'
      ? '已共享给指定协作者'
      : '仅创建者自己可见'
  const externalSuffix = hasPublicLink && hasExternalCollaborator
    ? '（含公开链接与外部协作者）'
    : hasPublicLink
      ? '（已开启公开链接）'
      : hasExternalCollaborator
        ? '（含外部协作者）'
        : ''
  const visibilitySummary = `${baseSummary}${externalSuffix}`

  const myPaths: AccessExplanation['myAccess']['paths'] = []
  const roleChain = access?.roleChain ?? []
  if (roleChain.length > 1) {
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
      : primary.reason

  return {
    localOnly: false,
    visibility: {
      scope: visibilityScope,
      hasExternal,
      summary: visibilitySummary,
    },
    inheritance: {
      mode: inheritanceMode,
      ancestors,
    },
    audience: {
      inherited: inheritedAudience,
      direct: directAudience,
      publicLinks,
    },
    myAccess: {
      effectiveRole: primary.role,
      primarySummary,
      paths: myPaths,
    },
  }
}
