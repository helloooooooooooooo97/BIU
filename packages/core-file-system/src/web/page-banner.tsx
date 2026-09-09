import { useEffect, useMemo, useState } from 'react'
import { PhotoIcon, XMarkIcon } from '@heroicons/react/16/solid'
import { HeadlessPopover } from '@biu/public-ui'
import { getPick } from '@biu/core-pick/web'
import {
  BANNER_STYLE_IDS,
  BANNER_STYLE_LABEL,
  presetsOf,
  type BannerStyleId,
} from '../banner-presets.ts'
import {
  bannerSrcDoc,
  parsePageBanner,
  type PageBanner as BannerValue,
  type PageBannerKind,
} from '../page-banner.ts'
import { readJson } from './db-client.ts'

type GalleryItem = {
  id: string
  kind: PageBannerKind
  style: string
  title: string
  html: string
}

function askNewBanner(opts: {
  path?: string
  title?: string
  kind: PageBannerKind
  style?: BannerStyleId
}) {
  const styleName = opts.style ? BANNER_STYLE_LABEL[opts.style] : ''
  const kindName = opts.kind === 'htmlframe' ? '动态' : '静态'
  const path = opts.path?.trim()
  const draft = path
    ? `请为「${opts.title || path}」创建一个新的${styleName}${kindName}顶部背景。用 db_update path=${path}，content 只含 banner:{kind:"${opts.kind}",html}。html 用纯 CSS${opts.kind === 'htmlframe' ? '和脚本' : ''}，不要图片，不要改 content 正文。`
    : `请创建一个新的${styleName}${kindName}顶部 HTML 背景，不要图片。`
  getPick()?.attach(
    path
      ? [
          {
            kind: 'html',
            id: `banner:${path}`,
            action: 'banner',
            path,
            label: `${styleName}${kindName}背景`.trim() || '背景',
            title: opts.title,
            route: typeof window === 'undefined' ? '' : window.location.pathname,
          },
        ]
      : [],
    { text: draft },
  )
}

export function PageBanner({
  value,
  writable,
  path,
  title,
  onChange,
}: {
  value: unknown
  writable?: boolean
  path?: string
  title?: string
  onChange?: (next: BannerValue | null) => void
}) {
  const banner = parsePageBanner(value)
  if (!banner && !writable) return null
  return (
    <div
      className={`fsdb-page-banner${banner ? '' : ' is-empty'}`}
      data-testid="fsdb-page-banner"
      data-kind={banner?.kind ?? 'empty'}
    >
      {banner ? (
        <iframe
          title="页面背景"
          srcDoc={bannerSrcDoc(banner.html)}
          sandbox={banner.kind === 'htmlframe' ? 'allow-scripts' : ''}
          tabIndex={-1}
        />
      ) : null}
      {writable && onChange ? (
        <BannerTitleActions
          value={value}
          writable
          path={path}
          title={title}
          onChange={onChange}
        />
      ) : null}
    </div>
  )
}

export function BannerTitleActions({
  value,
  writable,
  path,
  title,
  onChange,
}: {
  value: unknown
  writable?: boolean
  path?: string
  title?: string
  onChange: (next: BannerValue | null) => void
}) {
  const banner = parsePageBanner(value)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<PageBannerKind>(banner?.kind ?? 'html')
  if (!writable) return null
  return (
    <div className="fsdb-banner-title-actions" data-testid="fsdb-banner-title-actions">
      <HeadlessPopover
        open={open}
        onOpenChange={setOpen}
        side="bottom"
        align="start"
        sideOffset={6}
        trigger={
          <button
            type="button"
            className="fsdb-banner-ico"
            data-testid="fsdb-banner-open"
            aria-label="添加背景"
            title="添加背景"
          >
            <PhotoIcon aria-hidden className="size-[14px]" />
            添加背景
          </button>
        }
      >
        <div className="fsdb-banner-pop" role="dialog" aria-label="选择背景" data-testid="fsdb-banner-gallery">
          <BannerGallery
            tab={tab}
            onTab={setTab}
            hasBanner={Boolean(banner)}
            path={path}
            title={title}
            onPick={(next) => {
              onChange(next)
              setOpen(false)
            }}
            onRemove={() => {
              onChange(null)
              setOpen(false)
            }}
          />
        </div>
      </HeadlessPopover>
    </div>
  )
}

function BannerGallery({
  tab,
  onTab,
  hasBanner,
  path,
  title,
  onPick,
  onRemove,
}: {
  tab: PageBannerKind
  onTab: (next: PageBannerKind) => void
  hasBanner: boolean
  path?: string
  title?: string
  onPick: (next: BannerValue) => void
  onRemove: () => void
}) {
  const [mine, setMine] = useState<GalleryItem[]>([])
  const [mineTick, setMineTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    void readJson<{ items?: GalleryItem[] }>('/api/db/banner-gallery')
      .then((data) => {
        if (!cancelled) setMine(Array.isArray(data.items) ? data.items : [])
      })
      .catch(() => {
        if (!cancelled) setMine([])
      })
    return () => {
      cancelled = true
    }
  }, [tab, mineTick])
  const mineOfTab = mine.filter((item) => item.kind === tab)
  return (
    <>
      <div className="fsdb-banner-pop-bar">
        <div className="fsdb-banner-pop-tabs">
          <button type="button" aria-pressed={tab === 'html'} onClick={() => onTab('html')}>
            静态
          </button>
          <button type="button" aria-pressed={tab === 'htmlframe'} onClick={() => onTab('htmlframe')}>
            动态
          </button>
        </div>
        {hasBanner ? (
          <button type="button" className="fsdb-banner-pop-remove" onClick={onRemove}>
            移除
          </button>
        ) : null}
      </div>
      <div className="fsdb-banner-pop-body">
        {BANNER_STYLE_IDS.map((style) => {
          const items = presetsOf(tab).filter((item) => item.style === style)
          return (
            <section key={style} className="fsdb-banner-pop-sec">
              <h3>{BANNER_STYLE_LABEL[style]}</h3>
              <div className="fsdb-banner-pop-grid">
                {items.map((item) => (
                  <BannerThumb
                    key={item.id}
                    kind={item.kind}
                    html={item.html}
                    label={item.title}
                    onClick={() => onPick({ kind: item.kind, html: item.html })}
                  />
                ))}
                <button
                  type="button"
                  className="fsdb-banner-create"
                  onClick={() => askNewBanner({ path, title, kind: tab, style })}
                >
                  创建新背景
                </button>
              </div>
            </section>
          )
        })}
        <section className="fsdb-banner-pop-sec">
          <h3>我的</h3>
          <div className="fsdb-banner-pop-grid">
            {mineOfTab.map((item) => (
              <div key={item.id} className="fsdb-banner-mine">
                <BannerThumb
                  kind={item.kind}
                  html={item.html}
                  label={item.title}
                  onClick={() => onPick({ kind: item.kind, html: item.html })}
                />
                <button
                  type="button"
                  className="fsdb-banner-mine-del"
                  data-testid="fsdb-banner-mine-del"
                  aria-label="删除背景"
                  title="删除"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    void readJson<{ ok?: boolean }>('/api/db/banner-gallery', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ id: item.id }),
                    }).then(() => {
                      setMine((prev) => prev.filter((entry) => entry.id !== item.id))
                      setMineTick((n) => n + 1)
                    })
                  }}
                >
                  <XMarkIcon aria-hidden className="size-[12px]" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="fsdb-banner-create"
              onClick={() => askNewBanner({ path, title, kind: tab })}
            >
              创建新背景
            </button>
          </div>
        </section>
      </div>
    </>
  )
}

function BannerThumb({
  kind,
  html,
  label,
  onClick,
}: {
  kind: PageBannerKind
  html: string
  label: string
  onClick: () => void
}) {
  const src = useMemo(() => bannerSrcDoc(html), [html])
  return (
    <button type="button" className="fsdb-banner-thumb" title={label} onClick={onClick}>
      <iframe title={label} srcDoc={src} sandbox={kind === 'htmlframe' ? 'allow-scripts' : ''} tabIndex={-1} />
    </button>
  )
}
