import { readStorageString, removeStorageKey, writeStorageString } from '@biu/biu-ui/client-storage'
import { useEffect, useRef, useState } from 'react'
import { ArrowPathIcon, CheckIcon, LinkIcon, ShareIcon } from '@heroicons/react/16/solid'
import { HeadlessDismiss } from '@biu/biu-ui/headless-dismiss'
import { VIEWS_COLLECTION_PATH } from './database-path.ts'
import {
  fetchRecordAccess,
  fetchRecordShare,
  patchRecordAccess,
  saveRecordShare,
} from './authz-api.ts'
import { FSDB_OPEN_VIEW_SHARE_EVENT, FSDB_SHARES_CHANGE_EVENT, emitFsdbEvent } from './fsdb-events.ts'
import { mintSharePin, shareClipboardText } from '../share-resources.ts'
import { ShareToggle, notifyViewShareChanged } from './share-controls.tsx'
import { WorkspaceAccess } from './share-workspace-access.tsx'

export { FSDB_OPEN_VIEW_SHARE_EVENT }
export { ShareScopeLabel, ShareRoleLabel } from './share-scope-label.tsx'
export { ShareScopeDetail, ShareRoleDetail } from './share-chain-detail.tsx'

export type ShareKind = 'record'

export type ShareTarget = {
  kind: ShareKind
  collection: string
  recordId: string
  title: string
}

type ShareInfo = {
  token: string
  url: string
  hasPassword: boolean
  sharePlugins: boolean
  allowCopy: boolean
}

type InheritedShareInfo = ShareInfo & {
  rootUrl?: string
  sourceCollection: string
  sourceRecordId: string
  sourceTitle: string
}

type ShareInheritanceMeta = {
  mode: 'inherit' | 'custom'
  hasParent: boolean
  parentTitle?: string
}

type SharePayload = {
  share: ShareInfo | null
  inheritedShare?: InheritedShareInfo | null
  inheritance?: ShareInheritanceMeta
  viewPublicStats?: { matchedCount: number; publicCount: number }
}

function pinStorageKey(token: string) {
  return `fsdb.share.pin:${token}`
}

function rememberedPin(token: string) {
  if (!token) return ''
  try {
    return readStorageString(pinStorageKey(token)) ?? ''
  } catch {
    return ''
  }
}

function rememberPin(token: string, pin: string) {
  try {
    if (pin) writeStorageString(pinStorageKey(token), pin)
    else removeStorageKey(pinStorageKey(token))
  } catch {
    /* ignore */
  }
}

export function ShareButton({
  target,
  buttonClassName = 'chat-view-header-expand',
  localOnly = false,
}: {
  target: ShareTarget | null
  buttonClassName?: string
  localOnly?: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [hasActiveShare, setHasActiveShare] = useState(false)

  useEffect(() => {
    if (!target) {
      setHasActiveShare(false)
      return
    }
    let gone = false
    const check = async () => {
      try {
        const shareData = await fetchRecordShare<SharePayload>(target.collection, target.recordId).catch(() => ({
          share: null,
          inheritedShare: null,
        }))
        if (gone) return
        if (shareData.share || shareData.inheritedShare) {
          setHasActiveShare(true)
          return
        }
        if (!localOnly && target.recordId) {
          const accessData = await fetchRecordAccess<{
            scope?: string
            ownerId?: string
            people?: Array<{ id?: string; role?: string }>
            memberViews?: unknown[]
          }>(target.collection, target.recordId).catch(() => null)
          if (gone) return
          const nonOwnerPeople = (accessData?.people ?? []).filter(
            (p) => p.role !== 'owner' && (!accessData?.ownerId || p.id !== accessData.ownerId),
          )
          if (
            nonOwnerPeople.length > 0 ||
            (accessData?.memberViews?.length ?? 0) > 0 ||
            (accessData?.scope && accessData.scope !== 'personal')
          ) {
            setHasActiveShare(true)
            return
          }
        }
        if (!gone) setHasActiveShare(false)
      } catch {
        if (!gone) setHasActiveShare(false)
      }
    }
    void check()
    const onChange = () => void check()
    window.addEventListener(FSDB_SHARES_CHANGE_EVENT, onChange)
    return () => {
      gone = true
      window.removeEventListener(FSDB_SHARES_CHANGE_EVENT, onChange)
    }
  }, [target?.collection, target?.recordId, localOnly])

  useEffect(() => {
    if (!target || target.collection !== VIEWS_COLLECTION_PATH) return
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ recordId?: string }>).detail
      if (!detail?.recordId || detail.recordId === target.recordId) {
        setOpen(true)
      }
    }
    window.addEventListener(FSDB_OPEN_VIEW_SHARE_EVENT, onOpen)
    return () => window.removeEventListener(FSDB_OPEN_VIEW_SHARE_EVENT, onOpen)
  }, [target?.collection, target?.recordId])

  if (!target) return null
  return (
    <div className="fsdb-share-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`${buttonClassName}${open || hasActiveShare ? ' is-active' : ''}`}
        style={hasActiveShare ? { color: 'var(--biu-color-emphasis)' } : undefined}
        title={hasActiveShare ? '已开启分享' : '分享'}
        aria-label="分享"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="fsdb-share-toggle"
        onClick={() => setOpen((prev) => !prev)}
      >
        <ShareIcon aria-hidden className="size-4" />
      </button>
      {open ? (
        <HeadlessDismiss onDismiss={() => setOpen(false)} insideRef={wrapRef}>
          <SharePanel target={target} localOnly={localOnly} />
        </HeadlessDismiss>
      ) : null}
    </div>
  )
}

export function SharePanel({
  target,
  embedded = false,
  localOnly = false,
}: {
  target: ShareTarget
  embedded?: boolean
  localOnly?: boolean
}) {
  const [tab, setTab] = useState<'public' | 'collaboration'>(
    !localOnly && target.collection === VIEWS_COLLECTION_PATH ? 'collaboration' : 'public',
  )
  const [share, setShare] = useState<ShareInfo | null>(null)
  const [inheritedShare, setInheritedShare] = useState<InheritedShareInfo | null>(null)
  const [publicInheritance, setPublicInheritance] = useState<ShareInheritanceMeta | null>(null)
  const [publicInheritBusy, setPublicInheritBusy] = useState(false)
  const [inheritedCopied, setInheritedCopied] = useState(false)
  const [viewPublicStats, setViewPublicStats] = useState<{ matchedCount: number; publicCount: number } | null>(null)
  const [pin, setPin] = useState('')
  const [usePassword, setUsePassword] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (localOnly && tab !== 'public') setTab('public')
  }, [localOnly, tab])

  async function refreshPublicShare() {
    const data = await fetchRecordShare<SharePayload>(target.collection, target.recordId, { fresh: true })
    applyPayload(data)
    setInheritedShare(data.inheritedShare ?? null)
    setPublicInheritance(data.inheritance ?? null)
    setViewPublicStats(data.viewPublicStats ?? null)
  }

  useEffect(() => {
    if (tab !== 'public') return
    let gone = false
    void fetchRecordShare<SharePayload>(target.collection, target.recordId, { fresh: true }).then((data) => {
      if (gone) return
      applyPayload(data)
      setInheritedShare(data.inheritedShare ?? null)
      setPublicInheritance(data.inheritance ?? null)
      setViewPublicStats(data.viewPublicStats ?? null)
    }).catch(() => {
      if (!gone) {
        setShare(null)
        setInheritedShare(null)
        setPublicInheritance(null)
        setViewPublicStats(null)
      }
    })
    return () => {
      gone = true
    }
  }, [target.collection, target.recordId, tab])

  async function togglePublicInheritance(on: boolean) {
    if (!target.recordId || localOnly) return
    setError('')
    setPublicInheritBusy(true)
    try {
      await patchRecordAccess({
        collection: target.collection,
        recordId: target.recordId,
        inheritanceMode: on ? 'inherit' : 'custom',
      })
      emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
      notifyViewShareChanged(target.collection, target.recordId)
      await refreshPublicShare()
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法切换继承模式')
    } finally {
      setPublicInheritBusy(false)
    }
  }

  async function copyInheritedShare() {
    if (!inheritedShare?.url) return
    setError('')
    try {
      await navigator.clipboard.writeText(inheritedShare.url)
      setInheritedCopied(true)
      window.setTimeout(() => setInheritedCopied(false), 1600)
    } catch {
      setError('无法复制，请重试')
    }
  }

  function applyPayload(data: SharePayload, nextPin?: string, flagsOnly = false) {
    if (data.share === undefined) return
    if (!data.share) {
      setShare(null)
      setUsePassword(false)
      setPin('')
      return
    }
    setShare(data.share)
    if (flagsOnly) return
    const locked = Boolean(data.share.hasPassword)
    setUsePassword(locked)
    if (locked) {
      const remembered = nextPin ?? rememberedPin(data.share.token)
      setPin(remembered)
      if (nextPin) rememberPin(data.share.token, nextPin)
    } else {
      setPin('')
      rememberPin(data.share.token, '')
    }
  }

  async function publish(
    patch: {
      password?: string | null
      enabled?: boolean
      sharePlugins?: boolean
      allowCopy?: boolean
    },
    opts: { quiet?: boolean; pin?: string; flagsOnly?: boolean } = {},
  ) {
    if (!opts.quiet) {
      setBusy(true)
      setError('')
    }
    try {
      const data = await saveRecordShare<SharePayload>({
        collection: target.collection,
        recordId: target.recordId,
        ...patch,
      })
      applyPayload(data, opts.pin, opts.flagsOnly)
      if (patch.enabled === false && data.share == null && share) rememberPin(share.token, '')
      emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
      notifyViewShareChanged(target.collection, target.recordId)
      return data.share
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err))
      return null
    } finally {
      if (!opts.quiet) setBusy(false)
    }
  }

  async function copyShare() {
    setError('')
    let live = share
    let livePin = pin
    if (!live) {
      live = await publish({})
    } else if ((usePassword || live.hasPassword) && pin.length === 6 && pin !== rememberedPin(live.token)) {
      live = (await publish({ password: pin }, { quiet: true, pin })) ?? live
      livePin = pin
    }
    if (!live) return
    const locked = usePassword || live.hasPassword
    if (locked && !livePin) {
      setError('密码已设置。换一组后即可连同链接一起复制。')
      return
    }
    try {
      await navigator.clipboard.writeText(shareClipboardText(live.url, locked ? livePin : ''))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setError('无法复制，请重试')
    }
  }

  function togglePassword(on: boolean) {
    setUsePassword(on)
    if (!on) {
      setPin('')
      if (share) {
        rememberPin(share.token, '')
        void publish({ password: '' }, { quiet: true })
      }
      return
    }
    const next = mintSharePin()
    setPin(next)
    void publish({ password: next }, { quiet: true, pin: next }).then((live) => {
      if (live) rememberPin(live.token, next)
    })
  }

  const copyReady = !usePassword || Boolean(pin)

  return (
    <div className={`fsdb-share-panel${embedded ? ' is-embedded' : ''}`} role="dialog" aria-label="分享" data-testid="fsdb-share-panel">
      <div className="fsdb-share-tabs" role="tablist" aria-label="分享方式">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'public'}
          className={tab === 'public' ? 'is-on' : ''}
          data-testid="fsdb-share-public-tab"
          onClick={() => setTab('public')}
        >
          {localOnly ? '局域网分享' : '公开分享'}
        </button>
        {!localOnly && target.recordId ? (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'collaboration'}
            className={tab === 'collaboration' ? 'is-on' : ''}
            data-testid="fsdb-share-collaboration-tab"
            onClick={() => setTab('collaboration')}
          >
            邀请协作
          </button>
        ) : null}
      </div>
      {tab === 'collaboration' && target.recordId ? (
        <WorkspaceAccess collection={target.collection} recordId={target.recordId} />
      ) : null}
      {tab === 'public' ? (
        <>
          <section className="fsdb-share-link-section">
            {!localOnly && publicInheritance?.hasParent ? (
              <div className="fsdb-share-inherit-row" data-testid="fsdb-share-public-inherit">
                <span>
                  <strong>继承上级权限</strong>
                  <em>
                    {publicInheritance.mode === 'inherit'
                      ? `自动沿用${publicInheritance.parentTitle ? `「${publicInheritance.parentTitle}」` : '上级内容'}的通用访问、协作者与公开分享`
                      : '已断开继承，不会随上级公开链接对外展示'}
                  </em>
                </span>
                <ShareToggle
                  on={publicInheritance.mode === 'inherit'}
                  disabled={publicInheritBusy}
                  label="继承上级权限"
                  testId="fsdb-share-public-inherit-toggle"
                  onChange={(on) => void togglePublicInheritance(on)}
                />
              </div>
            ) : null}
            {!localOnly && inheritedShare && publicInheritance?.mode === 'inherit' ? (
              <div className="fsdb-share-inherited-public" data-testid="fsdb-share-inherited-public">
                <div className="fsdb-share-public-state">
                  <span><i aria-hidden />已继承自「{inheritedShare.sourceTitle}」的公开分享</span>
                </div>
                <div className="fsdb-share-link-row">
                  <div className="fsdb-share-link-field">
                    <LinkIcon aria-hidden className="size-4" />
                    <input
                      readOnly
                      value={inheritedShare.url}
                      aria-label="继承的公开链接"
                      data-testid="fsdb-share-inherited-url"
                      onFocus={(event) => event.currentTarget.select()}
                    />
                  </div>
                  <button
                    type="button"
                    className="fsdb-share-copy"
                    data-testid="fsdb-share-inherited-copy"
                    onClick={() => void copyInheritedShare()}
                  >
                    {inheritedCopied ? <CheckIcon aria-hidden className="size-4" /> : null}
                    {inheritedCopied ? '已复制' : '复制链接'}
                  </button>
                </div>
                <p className="fsdb-share-copy-note">
                  关闭上方「继承上级权限」即可单独隐藏本条；下方可额外为本条开启独立公开链接。
                </p>
              </div>
            ) : null}
            {target.collection === VIEWS_COLLECTION_PATH ? (
              <p
                className="fsdb-share-copy-note"
                data-testid="fsdb-view-public-stats"
                style={{ marginBottom: 8 }}
              >
                {viewPublicStats
                  ? `公开视图仅展示其中已公开的记录 · 当前命中 ${viewPublicStats.matchedCount} 条，其中 ${viewPublicStats.publicCount} 条已公开`
                  : '公开视图仅展示其中已单独开启公开链接的记录，未公开记录绝不泄露。'}
              </p>
            ) : null}
            {!share ? (
              <div className="fsdb-share-empty">
                <span>
                  <p className="fsdb-share-empty-title">
                    {localOnly ? '局域网链接' : inheritedShare ? '本条独立公开链接' : '公开链接'}
                  </p>
                  <p className="fsdb-share-empty-copy">
                    {localOnly
                      ? '仅在本机服务运行且处于同一局域网时可访问'
                      : inheritedShare
                        ? '可单独为本条生成独立链接与密码（不影响上级继承）'
                        : '获得链接的人可以查看'}
                  </p>
                </span>
                <button
                  type="button"
                  className="fsdb-share-publish"
                  disabled={busy}
                  data-testid="fsdb-share-enable"
                  onClick={() => void copyShare()}
                >
                  {busy ? '正在开启…' : copied ? '已复制' : '开启并复制'}
                </button>
              </div>
            ) : (
              <>
                <div className="fsdb-share-public-state">
                  <span><i aria-hidden />{localOnly ? '局域网链接已开启' : '公开链接已开启'}</span>
                  <button
                    type="button"
                    disabled={busy}
                    data-testid="fsdb-share-stop"
                    onClick={() => void publish({ enabled: false })}
                  >
                    关闭
                  </button>
                </div>
                <div className="fsdb-share-link-row">
                  <div className="fsdb-share-link-field">
                    <LinkIcon aria-hidden className="size-4" />
                    <input
                      readOnly
                      value={share.url}
                      aria-label="分享链接"
                      data-testid="fsdb-share-url"
                      onFocus={(event) => event.currentTarget.select()}
                    />
                  </div>
                  <button
                    type="button"
                    className="fsdb-share-copy"
                    disabled={busy || !copyReady}
                    title={copyReady ? '复制链接' : '换一组密码后即可复制'}
                    data-testid="fsdb-share-copy"
                    onClick={() => void copyShare()}
                  >
                    {copied ? <CheckIcon aria-hidden className="size-4" /> : null}
                    {copied ? '已复制' : '复制链接'}
                  </button>
                </div>
                {usePassword ? <p className="fsdb-share-copy-note">复制时会同时包含链接和密码。</p> : null}
              </>
            )}
          </section>
          {share ? (
            <section className="fsdb-share-settings" aria-label={localOnly ? '局域网链接设置' : '公开链接设置'}>
              <div className="fsdb-share-setting">
                <span className="fsdb-share-setting-copy">
                  <strong>密码保护</strong>
                </span>
                <ShareToggle
                  on={usePassword}
                  label="密码保护"
                  testId="fsdb-share-password-toggle"
                  onChange={togglePassword}
                />
              </div>
              {usePassword ? (
                <div className="fsdb-share-pin">
                  <span>
                    密码
                    <strong data-testid="fsdb-share-password">{pin || '······'}</strong>
                  </span>
                  <button type="button" data-testid="fsdb-share-rotate-pin" onClick={() => togglePassword(true)}>
                    <ArrowPathIcon aria-hidden className="size-4" />
                    换一组
                  </button>
                </div>
              ) : (
                <div className="fsdb-share-pin is-collapsed" hidden />
              )}
              <div className="fsdb-share-setting">
                <span className="fsdb-share-setting-copy">
                  <strong>分享插件</strong>
                </span>
                <ShareToggle
                  on={share.sharePlugins}
                  label="分享插件"
                  testId="fsdb-share-plugins"
                  onChange={(on) => {
                    setShare({ ...share, sharePlugins: on })
                    void publish({ sharePlugins: on }, { quiet: true, flagsOnly: true })
                  }}
                />
              </div>
              <div className="fsdb-share-setting">
                <span className="fsdb-share-setting-copy">
                  <strong>允许复制</strong>
                </span>
                <ShareToggle
                  on={share.allowCopy !== false}
                  label="允许复制"
                  testId="fsdb-share-allow-copy"
                  onChange={(on) => {
                    setShare({ ...share, allowCopy: on })
                    void publish({ allowCopy: on }, { quiet: true, flagsOnly: true })
                  }}
                />
              </div>
            </section>
          ) : null}
        </>
      ) : null}
      {error ? <p className="fsdb-share-error">{error}</p> : null}
    </div>
  )
}
