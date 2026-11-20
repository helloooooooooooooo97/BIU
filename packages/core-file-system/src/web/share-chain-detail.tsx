import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFloatingPosition } from '@biu/biu-ui/floating-position'
import { HeadlessDismiss } from '@biu/biu-ui/headless-dismiss'
import { OVERLAY_Z, overlayPortalRoot, overlayZ } from '@biu/biu-ui/overlay-portal'
import type { DbRecord } from '@biu/type-file-system'
import {
  builtinAllView,
  builtinMemberViews,
  isBuiltinAllViewId,
  parseBuiltinScopeViewId,
  scopedCollectionName,
} from '../catalog-views.ts'
import type { FilterGroup } from '../query-logic.ts'
import { recordMatchesSharedView, resolveSharedView } from '../share-view-match.ts'
import { effectiveDataScope, recordMatchesGrantedView } from '../view-access.ts'
import { VIEWS_COLLECTION_PATH, WORKSPACE_MEMBERS_COLLECTION_PATH } from './database-path.ts'
import { listCollection, readJson } from './db-client.ts'
import { AccessMark, accessText, accessTone, ScopeMark, scopeText, scopeTone } from './share-scope-label.tsx'

export function roleLabel(role: string) {
  if (role === 'owner') return '创建者'
  if (role === 'manager') return '可管理'
  if (role === 'viewer') return '可查看'
  return '可编辑'
}

export function collectionDataViews(collection: string, items: DbRecord[]) {
  const all = builtinAllView({ path: collection })
  return [{ id: all.id, name: all.name, filters: all.filters, filterTree: all.filterTree }, ...viewRows(items)]
}

export function parseJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

export function viewRows(items: DbRecord[]) {
  return items.flatMap((row) => {
    const id = String(row.viewId ?? '').trim()
    if (!id) return []
    const filters = parseJsonObject(row.filters)
    const tree = parseJsonObject(row.filterTree)
    return [{
      id,
      name: String(row.title ?? id),
      filters,
      filterTree: tree?.kind === 'group' ? tree as unknown as FilterGroup : undefined,
    }]
  })
}

/** 分享属性标签。归属看条目自己的协作者；点开后看直接授权和从视图继承来的权限。 */
export function ShareScopeDetail({
  collection,
  recordId,
  label,
  tableLabel = '',
  builtin = false,
  localOnly = false,
}: {
  collection: string
  recordId: string
  label: string
  tableLabel?: string
  builtin?: boolean
  /** null：还不知道是不是本机空间，先不要打协作接口。 */
  localOnly?: boolean | null
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const panelPos = useFloatingPosition(anchorEl, panelRef, {
    placement: 'bottom-start',
    offset: 6,
    padding: 8,
    fallbackWidth: 300,
    fallbackHeight: 220,
    enabled: open,
  })
  const shown = scopeTone(label)
  const [scope, setScope] = useState(shown)
  const chip = scope === 'shared' || shown === 'shared' ? 'shared' : scope === 'workspace' || shown === 'workspace' ? 'workspace' : shown
  const [direct, setDirect] = useState<Array<{ id: string; name: string; role: string; note: string }>>([])
  const [chain, setChain] = useState<Array<{ id: string; title: string; detail: string; result: string }>>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (localOnly == null) return
    if (!open) {
      setScope(shown)
      setError('')
      return
    }
    if (builtin) {
      setScope('shared')
      setDirect([])
      setChain([{
        id: 'builtin',
        title: '内置插件',
        detail: '随产品提供，全员可见',
        result: '共享',
      }])
      setError('')
      return
    }
    if (localOnly) {
      setDirect([])
      let cancelled = false
      void (async () => {
        const [sharesPage, recordPage, viewPage] = await Promise.all([
          readJson<{ shares?: Array<{ kind?: string; collection?: string; viewId?: string; recordId?: string; title?: string }> }>('/api/db/shares'),
          listCollection({ path: collection, limit: 1, filters: { id: recordId } }),
          listCollection({
            path: VIEWS_COLLECTION_PATH,
            limit: 200,
            filters: { tablePath: collection },
            columns: ['title', 'tablePath', 'viewId', 'filters', 'filterTree'],
          }),
        ])
        if (cancelled) return
        const record = recordPage.items[0] ?? { id: recordId }
        const saved = collectionDataViews(collection, viewPage.items)
        const stored = 'personal' as const
        const listed = sharesPage.shares ?? []
        const recordShare = listed.some((share) => (
          share.kind === 'record' && share.collection === collection && share.recordId === recordId
        ))
        const viewHits = listed.flatMap((share) => {
          if (share.kind !== 'view' || share.collection !== collection) return []
          const view = resolveSharedView(String(share.viewId ?? ''), saved)
          if (!view || !recordMatchesSharedView(record, view, stored)) return []
          return [{
            id: String(share.viewId ?? view.id),
            title: String(share.title || view.name || share.viewId || '').trim() || view.id,
          }]
        })
        const shared = recordShare || viewHits.length > 0 || shown === 'shared'
        setScope(shared ? 'shared' : stored)
        setChain([
          {
            id: 'stored',
            title: '本条',
            detail: '未单独开链接',
            result: '私人',
          },
          ...(recordShare ? [{
            id: 'record-link',
            title: '本条链接',
            detail: '局域网',
            result: '共享',
          }] : []),
          ...viewHits.map((view) => ({
            id: `view:${view.id}`,
            title: `视图「${view.title}」`,
            detail: '局域网',
            result: '共享',
          })),
        ])
        setError('')
      })().catch((err) => {
        if (cancelled) return
        const shared = shown === 'shared'
        setScope(shared ? 'shared' : 'personal')
        setChain([{
          id: 'stored',
          title: '本条',
          detail: shared ? '局域网' : '未单独开链接',
          result: shared ? '共享' : '私人',
        }])
        setError(err instanceof Error ? err.message : '无法读取分享')
      })
      return () => {
        cancelled = true
      }
    }
    let cancelled = false
    void (async () => {
      const [access, recordPage, viewPage, memberViewPage] = await Promise.all([
        readJson<{
          scope?: 'personal' | 'workspace' | 'shared'
          ownerId?: string
          people?: Array<{ id: string; name: string; role: string; memberKind: string }>
          groups?: Array<{ id: string; name: string; role: string }>
          memberViews?: Array<{ id: string; role: string }>
          viewGrants?: Array<{
            viewId: string
            subjectType: 'account' | 'member_view'
            subjectId: string
            role: string
            name: string
            memberKind: string
            grantedBy?: string
          }>
        }>(`/api/account/access?collection=${encodeURIComponent(collection)}&recordId=${encodeURIComponent(recordId)}`),
        listCollection({ path: collection, limit: 1, filters: { id: recordId } }),
        listCollection({ path: VIEWS_COLLECTION_PATH, limit: 200, filters: { tablePath: collection }, columns: ['title', 'tablePath', 'viewId', 'filters'] }),
        listCollection({ path: VIEWS_COLLECTION_PATH, limit: 200, filters: { tablePath: WORKSPACE_MEMBERS_COLLECTION_PATH }, columns: ['title', 'tablePath', 'viewId', 'filters'] }),
      ])
      if (cancelled) return
      const record = recordPage.items[0] ?? null
      const dataViews = collectionDataViews(collection, viewPage.items)
      const memberViews = [
        { ...builtinAllView({ path: WORKSPACE_MEMBERS_COLLECTION_PATH }), name: builtinAllView({ path: WORKSPACE_MEMBERS_COLLECTION_PATH }).name },
        ...builtinMemberViews().map((view) => ({ id: view.id, name: view.name, filters: view.filters })),
        ...viewRows(memberViewPage.items),
      ]
      const stored = access.scope ?? 'personal'
      const ownerId = access.ownerId ?? ''
      setScope(effectiveDataScope(
        stored,
        record ?? { id: recordId },
        (access.viewGrants ?? []).map((grant) => ({
          viewId: grant.viewId,
          subjectType: grant.subjectType,
          subjectId: grant.subjectId,
          memberKind: grant.memberKind,
          grantedBy: grant.grantedBy,
        })),
        dataViews,
        memberViews,
        ownerId,
      ))
      setDirect([
        ...(access.people ?? []).map((row) => ({ id: `account:${row.id}`, name: row.name, role: row.role, note: row.memberKind === 'member' ? '空间成员' : '外部' })),
        ...(access.groups ?? []).map((row) => ({ id: `group:${row.id}`, name: row.name, role: row.role, note: '成员组' })),
        ...(access.memberViews ?? []).map((row) => ({
          id: `view:${row.id}`,
          name: memberViews.find((view) => view.id === row.id)?.name ?? row.id,
          role: row.role,
          note: '成员视图',
        })),
      ])
      const matched = record ? (access.viewGrants ?? []).flatMap((grant) => {
        if (!recordMatchesGrantedView(record, grant.viewId, dataViews, stored, { grantedBy: grant.grantedBy, recordOwnerId: ownerId })) return []
        const parsed = parseBuiltinScopeViewId(grant.viewId)
        const source = dataViews.find((view) => view.id === grant.viewId)?.name
          || (parsed ? scopedCollectionName({ path: collection, label: tableLabel || collection.replace(/^\//, '') }, parsed.scope) : '')
          || (isBuiltinAllViewId(grant.viewId) ? `全部${tableLabel}` : grant.viewId)
        const name = grant.subjectType === 'member_view'
          ? memberViews.find((view) => view.id === grant.subjectId)?.name ?? grant.name
          : grant.name
        const external = grant.subjectType === 'account'
          ? grant.memberKind === 'external' || grant.memberKind === 'guest'
          : memberViews.find((view) => view.id === grant.subjectId)?.filters?.membershipKind === 'external'
            || memberViews.find((view) => view.id === grant.subjectId)?.filters?.membershipKind === 'guest'
        return [{ id: `${grant.viewId}:${grant.subjectType}:${grant.subjectId}`, name, role: grant.role, source, external }]
      }) : []
      setChain([
        {
          id: 'stored',
          title: '这条内容自己的协作者',
          detail: stored === 'shared' ? '已经邀请了外部协作者' : stored === 'workspace' ? '已经有空间成员' : '只有创建者',
          result: scopeText(stored),
        },
        ...matched.map((row) => ({
          id: row.id,
          title: `视图「${row.source}」`,
          detail: `${row.name} ${roleLabel(row.role)}`,
          result: row.external ? '共享' : '空间',
        })),
      ])
      setError('')
    })().catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : '无法读取权限')
    })
    return () => {
      cancelled = true
    }
  }, [open, collection, recordId, tableLabel, localOnly, label, builtin, shown])

  return (
    <div className="fsdb-scope-detail" ref={wrapRef}>
      <button
        type="button"
        className={`fsdb-scope-tag is-${chip}`}
        data-testid="fsdb-scope-tag"
        aria-label={`${label || scopeText(chip)}的权限详情`}
        aria-expanded={open}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          setAnchorEl(event.currentTarget)
          setOpen((prev) => !prev)
        }}
      >
        <ScopeMark scope={chip} />
      </button>
      {open ? createPortal(
        <HeadlessDismiss
          onDismiss={() => setOpen(false)}
          inside={(node) => Boolean(wrapRef.current?.contains(node) || panelRef.current?.contains(node))}
        >
          <div
            ref={panelRef}
            className="fsdb-scope-panel"
            role="dialog"
            aria-label={localOnly ? '分享' : '数据归属'}
            style={{
              top: panelPos.top,
              left: panelPos.left,
              maxHeight: panelPos.maxHeight,
              overflowY: 'auto',
              zIndex: overlayZ(OVERLAY_Z.menu, anchorEl),
            }}
          >
            <header className="fsdb-scope-head">
              <div>
                <strong>{localOnly ? '分享' : '数据归属'}</strong>
                <em>{localOnly ? '本条、链接、视图，取最宽一档' : '直接协作者和匹配到的视图，取最宽的一档'}</em>
              </div>
              <b className={`fsdb-scope-pill is-${chip}`}><ScopeMark scope={chip} /></b>
            </header>
            <ol className="fsdb-scope-chain">
              {chain.length ? chain.map((step) => (
                <li key={step.id}>
                  <div>
                    <strong>{step.title}</strong>
                    {step.detail ? <em>{step.detail}</em> : null}
                  </div>
                  <b className={`fsdb-scope-pill is-${step.result === '共享' ? 'shared' : step.result === '空间' ? 'workspace' : 'personal'}`}><ScopeMark scope={step.result} /></b>
                </li>
              )) : <li className="is-empty">{error ? error : '正在读取'}</li>}
            </ol>
            {direct.length ? (
              <section className="fsdb-scope-people">
                <h3>直接协作者</h3>
                <ul>
                  {direct.map((row) => (
                    <li key={row.id}><strong>{row.name}</strong><em>{row.note}</em><span>{roleLabel(row.role)}</span></li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </HeadlessDismiss>,
        overlayPortalRoot(anchorEl) ?? document.body,
      ) : null}
    </div>
  )
}

/** 权限属性标签。点开后看记录自己的权限、往上继承的层级，以及匹配到的视图授权。 */
export function ShareRoleDetail({
  collection,
  recordId,
  label,
  tableLabel = '',
  builtin = false,
  localOnly = false,
}: {
  collection: string
  recordId: string
  label: string
  tableLabel?: string
  builtin?: boolean
  /** null：还不知道是不是本机空间，先不要打协作接口。 */
  localOnly?: boolean | null
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const panelPos = useFloatingPosition(anchorEl, panelRef, {
    placement: 'bottom-start',
    offset: 6,
    padding: 8,
    fallbackWidth: 300,
    fallbackHeight: 220,
    enabled: open,
  })
  const [chain, setChain] = useState<Array<{ id: string; title: string; detail: string; result: string }>>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (localOnly == null) return
    if (!open) {
      setError('')
      return
    }
    if (builtin) {
      setChain([{ id: 'builtin', title: '内置插件', detail: '所有成员只能查看', result: '阅读' }])
      setError('')
      return
    }
    if (localOnly) {
      let cancelled = false
      void (async () => {
        const recordPage = await listCollection({
          path: collection,
          limit: 1,
          filters: { id: recordId },
          columns: ['parentId', 'title'],
        })
        if (cancelled) return
        const role = accessText(label)
        const parentId = String(recordPage.items[0]?.parentId ?? '')
        setChain([
          role === '阅读'
            ? { id: 'lan', title: '局域网链接', detail: '已开启局域网链接，同一局域网可查看', result: '阅读' }
            : { id: 'local', title: '这条内容', detail: '你是创建者', result: role || '管理' },
          ...(parentId ? [{
            id: `parent:${parentId}`,
            title: '上一级内容',
            detail: '权限继承自上一级',
            result: role || '管理',
          }] : []),
        ])
        setError('')
      })().catch((err) => {
        if (cancelled) return
        const role = accessText(label)
        setChain([{
          id: 'local',
          title: role === '阅读' ? '局域网链接' : '这条内容',
          detail: role === '阅读' ? '已开启局域网链接，同一局域网可查看' : '你是创建者',
          result: role || '管理',
        }])
        setError(err instanceof Error ? err.message : '无法读取权限')
      })
      return () => {
        cancelled = true
      }
    }
    let cancelled = false
    void (async () => {
      const [access, recordPage, viewPage, memberViewPage] = await Promise.all([
        readJson<{
          scope?: 'personal' | 'workspace' | 'shared'
          ownerId?: string
          roleChain?: Array<{ id: string; title: string; detail: string; role: string }>
          viewGrants?: Array<{
            viewId: string
            subjectType: 'account' | 'member_view'
            subjectId: string
            role: string
            name: string
            memberKind: string
            grantedBy?: string
          }>
        }>(`/api/account/access?collection=${encodeURIComponent(collection)}&recordId=${encodeURIComponent(recordId)}`),
        listCollection({ path: collection, limit: 1, filters: { id: recordId } }),
        listCollection({ path: VIEWS_COLLECTION_PATH, limit: 200, filters: { tablePath: collection }, columns: ['title', 'tablePath', 'viewId', 'filters'] }),
        listCollection({ path: VIEWS_COLLECTION_PATH, limit: 200, filters: { tablePath: WORKSPACE_MEMBERS_COLLECTION_PATH }, columns: ['title', 'tablePath', 'viewId', 'filters'] }),
      ])
      if (cancelled) return
      const record = recordPage.items[0] ?? null
      const dataViews = collectionDataViews(collection, viewPage.items)
      const memberViews = [
        { ...builtinAllView({ path: WORKSPACE_MEMBERS_COLLECTION_PATH }), name: builtinAllView({ path: WORKSPACE_MEMBERS_COLLECTION_PATH }).name },
        ...builtinMemberViews().map((view) => ({ id: view.id, name: view.name, filters: view.filters })),
        ...viewRows(memberViewPage.items),
      ]
      const stored = access.scope ?? 'personal'
      const ownerId = access.ownerId ?? ''
      const matched = record ? (access.viewGrants ?? []).flatMap((grant) => {
        if (!recordMatchesGrantedView(record, grant.viewId, dataViews, stored, { grantedBy: grant.grantedBy, recordOwnerId: ownerId })) return []
        const parsed = parseBuiltinScopeViewId(grant.viewId)
        const source = dataViews.find((view) => view.id === grant.viewId)?.name
          || (parsed ? scopedCollectionName({ path: collection, label: tableLabel || collection.replace(/^\//, '') }, parsed.scope) : '')
          || (isBuiltinAllViewId(grant.viewId) ? `全部${tableLabel}` : grant.viewId)
        const name = grant.subjectType === 'member_view'
          ? memberViews.find((view) => view.id === grant.subjectId)?.name ?? grant.name
          : grant.name
        return [{ id: `${grant.viewId}:${grant.subjectType}:${grant.subjectId}`, name, role: grant.role, source }]
      }) : []
      setChain([
        ...(access.roleChain ?? []).map((step) => ({
          id: step.id,
          title: step.title,
          detail: step.detail,
          result: accessText(step.role),
        })),
        ...matched.map((row) => ({
          id: row.id,
          title: `视图「${row.source}」`,
          detail: `${row.name} ${roleLabel(row.role)}`,
          result: accessText(row.role),
        })),
      ])
      setError('')
    })().catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : '无法读取权限')
    })
    return () => {
      cancelled = true
    }
  }, [open, builtin, collection, recordId, tableLabel, localOnly, label])

  const shown = chain.reduce((best, step) => {
    const rank = { 阅读: 1, 编辑: 2, 管理: 3 } as Record<string, number>
    return (rank[step.result] ?? 0) >= (rank[best] ?? 0) ? step.result : best
  }, accessText(label))

  return (
    <div className="fsdb-scope-detail" ref={wrapRef}>
      <button
        type="button"
        className={`fsdb-scope-tag is-${accessTone(label)}`}
        data-testid="fsdb-role-tag"
        aria-label={`${accessText(label)}的权限链路`}
        aria-expanded={open}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          setAnchorEl(event.currentTarget)
          setOpen((prev) => !prev)
        }}
      >
        <AccessMark role={label} />
      </button>
      {open ? createPortal(
        <HeadlessDismiss
          onDismiss={() => setOpen(false)}
          inside={(node) => Boolean(wrapRef.current?.contains(node) || panelRef.current?.contains(node))}
        >
          <div
            ref={panelRef}
            className="fsdb-scope-panel"
            role="dialog"
            aria-label="权限链路"
            style={{
              top: panelPos.top,
              left: panelPos.left,
              maxHeight: panelPos.maxHeight,
              overflowY: 'auto',
              zIndex: overlayZ(OVERLAY_Z.menu, anchorEl),
            }}
          >
            <header className="fsdb-scope-head">
              <div>
                <strong>权限</strong>
                <em>记录上的权限、继承层级和匹配到的视图，取较高的一级</em>
              </div>
              <b className={`fsdb-scope-pill is-${accessTone(shown)}`}><AccessMark role={shown} /></b>
            </header>
            <ol className="fsdb-scope-chain">
              {chain.length ? chain.map((step) => (
                <li key={step.id}>
                  <div>
                    <strong>{step.title}</strong>
                    <em>{step.detail}</em>
                  </div>
                  <b className={`fsdb-scope-pill is-${accessTone(step.result)}`}><AccessMark role={step.result} /></b>
                </li>
              )) : <li className="is-empty">{error ? error : '正在读取'}</li>}
            </ol>
          </div>
        </HeadlessDismiss>,
        overlayPortalRoot(anchorEl) ?? document.body,
      ) : null}
    </div>
  )
}
