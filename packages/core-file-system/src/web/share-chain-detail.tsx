import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFloatingPosition } from '@biu/biu-ui/floating-position'
import { HeadlessDismiss } from '@biu/biu-ui/headless-dismiss'
import { OVERLAY_Z, overlayPortalRoot, overlayZ } from '@biu/biu-ui/overlay-portal'
import { buildAccessExplanation, type AccessExplanation } from '../access-explanation.ts'
import { readJson } from './db-client.ts'
import { AccessMark, accessText, accessTone, ScopeMark, scopeText, scopeTone } from './share-scope-label.tsx'

export function roleLabel(role: string) {
  if (role === 'owner') return '创建者'
  if (role === 'manager' || role === '管理') return '可管理'
  if (role === 'viewer' || role === '查看' || role === '阅读') return '可查看'
  return '可编辑'
}

function subjectNote(subjectType: 'account' | 'group' | 'workspace_members', audienceKind: 'internal' | 'external') {
  if (subjectType === 'workspace_members') return '空间全员'
  if (subjectType === 'group') return '成员组'
  return audienceKind === 'external' ? '外部协作者' : '空间成员'
}

function useAccessExplanation(
  open: boolean,
  params: {
    collection: string
    recordId: string
    tableLabel: string
    builtin: boolean
    localOnly: boolean | null
    roleHint?: string
  },
) {
  const [data, setData] = useState<AccessExplanation | null>(null)
  const [error, setError] = useState('')
  const { collection, recordId, tableLabel, builtin, localOnly, roleHint = '' } = params

  useEffect(() => {
    if (localOnly == null) return
    if (!open) {
      setError('')
      return
    }
    if (builtin) {
      setData(buildAccessExplanation({ collection, recordId, tableLabel, builtin: true, localOnly }))
      setError('')
      return
    }
    let cancelled = false
    const search = new URLSearchParams({
      collection,
      recordId,
      ...(tableLabel ? { tableLabel } : {}),
      ...(roleHint ? { role: roleHint } : {}),
    })
    void readJson<AccessExplanation>(`/api/db/access-explain?${search.toString()}`, undefined, { fresh: true })
      .then((res) => {
        if (cancelled) return
        setData(res)
        setError('')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '无法读取权限说明')
      })
    return () => {
      cancelled = true
    }
  }, [open, collection, recordId, tableLabel, builtin, localOnly, roleHint])

  return { data, error }
}

/** 可见范围胶囊。点开后按真实生效来源展示谁能访问以及继承链。 */
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
  /** null：还不知道是不是本机空间，先不要发请求。 */
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
    fallbackWidth: 320,
    fallbackHeight: 240,
    enabled: open,
  })
  const { data, error } = useAccessExplanation(open, {
    collection,
    recordId,
    tableLabel,
    builtin,
    localOnly,
  })
  const shown = scopeTone(label)
  const chip = open && data ? data.visibility.scope : shown
  const hasInheritance = Boolean(
    data && data.inheritance.mode === 'inherit' && data.inheritance.ancestors.length > 0,
  )
  const hasAnySource = Boolean(
    data && (
      hasInheritance
      || data.audience.inherited.length > 0
      || data.audience.direct.length > 0
      || data.audience.publicLinks.length > 0
    ),
  )

  return (
    <div className="fsdb-scope-detail" ref={wrapRef}>
      <button
        type="button"
        className={`fsdb-scope-tag is-${chip}`}
        data-testid="fsdb-scope-tag"
        aria-label={`${label || scopeText(chip)}的可见范围详情`}
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
            aria-label="可见范围"
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
                <strong>可见范围</strong>
                <em>{data?.visibility.summary ?? (error || '正在读取…')}</em>
              </div>
              <b className={`fsdb-scope-pill is-${chip}`}><ScopeMark scope={chip} /></b>
            </header>

            {error && !data ? (
              <p className="fsdb-scope-empty">{error}</p>
            ) : !data ? (
              <p className="fsdb-scope-empty">正在读取…</p>
            ) : data.builtin ? (
              <p className="fsdb-scope-empty">内置插件随产品提供，所有成员均可查看。</p>
            ) : !hasAnySource ? (
              <p className="fsdb-scope-empty">
                {data.localOnly
                  ? '仅本机可见，未开启局域网分享链接。'
                  : '仅创建者自己可见，未继承上级权限，也未通过视图或链接对外开放。'}
              </p>
            ) : (
              <div className="fsdb-scope-sections">
                {hasInheritance || data.audience.inherited.length > 0 ? (
                  <section className="fsdb-scope-section">
                    <h3>继承链</h3>
                    {hasInheritance ? (
                      <div className="fsdb-scope-crumb" aria-label="继承路径">
                        {data.inheritance.ancestors.map((anc) => (
                          <span key={`${anc.collection}:${anc.recordId}`}>
                            <strong>{anc.title}</strong>
                            <i aria-hidden>›</i>
                          </span>
                        ))}
                        <span className="is-current">
                          <strong>本条</strong>
                          <em>继承上级</em>
                        </span>
                      </div>
                    ) : null}
                    {data.audience.inherited.length > 0 ? (
                      <ul className="fsdb-scope-list">
                        {data.audience.inherited.map((item) => (
                          <li key={item.id}>
                            <div>
                              <strong>{item.subjectName}</strong>
                              <em>{subjectNote(item.subjectType, item.audienceKind)} · 来自「{item.sourceTitle}」</em>
                            </div>
                            <span>{roleLabel(item.role)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                ) : null}

                {data.audience.direct.length > 0 ? (
                  <section className="fsdb-scope-section">
                    <h3>本条直接授权</h3>
                    <ul className="fsdb-scope-list">
                      {data.audience.direct.map((item) => (
                        <li key={item.id}>
                          <div>
                            <strong>{item.subjectName}</strong>
                            <em>{subjectNote(item.subjectType, item.audienceKind)}</em>
                          </div>
                          <span>{roleLabel(item.role)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {data.audience.publicLinks.length > 0 ? (
                  <section className="fsdb-scope-section">
                    <h3>{data.localOnly ? '局域网链接' : '公开链接'}</h3>
                    <ul className="fsdb-scope-list">
                      {data.audience.publicLinks.map((link) => (
                        <li key={link.id}>
                          <div>
                            <strong>{link.lanOnly ? '本条局域网链接' : '本条公开链接'}</strong>
                            <em>{link.lanOnly ? '同一局域网内打开链接可查看' : '获得链接的人可查看'}</em>
                          </div>
                          <span>可查看</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
            )}
          </div>
        </HeadlessDismiss>,
        overlayPortalRoot(anchorEl) ?? document.body,
      ) : null}
    </div>
  )
}

/** 我的权限胶囊。点开后展示当前登录用户的生效权限路径与继承链。 */
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
  /** null：还不知道是不是本机空间，先不要发请求。 */
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
    fallbackWidth: 320,
    fallbackHeight: 240,
    enabled: open,
  })
  const { data, error } = useAccessExplanation(open, {
    collection,
    recordId,
    tableLabel,
    builtin,
    localOnly,
    roleHint: label,
  })
  const shown = open && data ? accessText(data.myAccess.effectiveRole) : accessText(label)
  const primaryPath = data?.myAccess.paths.find((path) => path.isPrimary) ?? data?.myAccess.paths[0] ?? null
  const otherPaths = (data?.myAccess.paths ?? []).filter((path) => path !== primaryPath)

  return (
    <div className="fsdb-scope-detail" ref={wrapRef}>
      <button
        type="button"
        className={`fsdb-scope-tag is-${accessTone(shown)}`}
        data-testid="fsdb-role-tag"
        aria-label={`${shown}的我的权限详情`}
        aria-expanded={open}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          setAnchorEl(event.currentTarget)
          setOpen((prev) => !prev)
        }}
      >
        <AccessMark role={shown} />
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
            aria-label="我的权限"
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
                <strong>我的权限</strong>
                <em>{data?.myAccess.primarySummary ?? (error || '正在读取…')}</em>
              </div>
              <b className={`fsdb-scope-pill is-${accessTone(shown)}`}><AccessMark role={shown} /></b>
            </header>

            {error && !data ? (
              <p className="fsdb-scope-empty">{error}</p>
            ) : !primaryPath ? (
              <p className="fsdb-scope-empty">正在读取…</p>
            ) : (
              <div className="fsdb-scope-sections">
                <section className="fsdb-scope-section">
                  <h3>生效路径</h3>
                  {primaryPath.kind === 'inherited' && primaryPath.chain && primaryPath.chain.length > 0 ? (
                    <ol className="fsdb-scope-tree">
                      {primaryPath.chain.map((node, index) => {
                        const isLast = index === primaryPath.chain!.length - 1
                        return (
                          <li key={`${node.recordId}:${index}`} className={isLast ? 'is-current' : ''}>
                            <span className="fsdb-scope-tree-dot" aria-hidden />
                            <div className="fsdb-scope-tree-body">
                              <strong>
                                {node.title}
                                {isLast ? <span className="fsdb-scope-badge">当前生效</span> : null}
                              </strong>
                              <em>{node.note}</em>
                            </div>
                            <span className="fsdb-scope-tree-role">{roleLabel(primaryPath.role)}</span>
                          </li>
                        )
                      })}
                    </ol>
                  ) : (
                    <ul className="fsdb-scope-list">
                      <li>
                        <div>
                          <strong>
                            {primaryPath.title}
                            <span className="fsdb-scope-badge">当前生效</span>
                          </strong>
                          <em>{primaryPath.reason}</em>
                        </div>
                        <span>{roleLabel(primaryPath.role)}</span>
                      </li>
                    </ul>
                  )}
                </section>

                {otherPaths.length > 0 ? (
                  <section className="fsdb-scope-section is-secondary">
                    <h3>其他同时命中的途径</h3>
                    <ul className="fsdb-scope-list">
                      {otherPaths.map((path) => (
                        <li key={path.id}>
                          <div>
                            <strong>{path.title}</strong>
                            <em>{path.reason}</em>
                          </div>
                          <span>{roleLabel(path.role)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
            )}
          </div>
        </HeadlessDismiss>,
        overlayPortalRoot(anchorEl) ?? document.body,
      ) : null}
    </div>
  )
}
