import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  PAGE_BANNER_LIVE_SAMPLE,
  PAGE_BANNER_STATIC_SAMPLE,
  bannerSrcDoc,
  parsePageBanner,
  type PageBanner as BannerValue,
  type PageBannerKind,
} from '../page-banner.ts'

export function PageBanner({
  value,
  writable,
  onChange,
}: {
  value: unknown
  writable: boolean
  onChange: (next: BannerValue | null) => void
}) {
  const banner = parsePageBanner(value)
  const [open, setOpen] = useState(false)
  const [draftKind, setDraftKind] = useState<PageBannerKind>(banner?.kind ?? 'html')
  const [draftHtml, setDraftHtml] = useState(banner?.html ?? PAGE_BANNER_STATIC_SAMPLE)

  useEffect(() => {
    if (open) return
    setDraftKind(banner?.kind ?? 'html')
    setDraftHtml(banner?.html ?? PAGE_BANNER_STATIC_SAMPLE)
  }, [banner?.html, banner?.kind, open])

  const save = (next: BannerValue | null) => {
    onChange(next)
    setOpen(false)
  }

  const start = (kind: PageBannerKind) => {
    setDraftKind(kind)
    setDraftHtml(banner?.html || (kind === 'htmlframe' ? PAGE_BANNER_LIVE_SAMPLE : PAGE_BANNER_STATIC_SAMPLE))
    setOpen(true)
  }

  if (!banner && !writable) return null

  return (
    <>
      <div
        className={`fsdb-page-banner${banner ? '' : ' is-empty'}`}
        data-testid="fsdb-page-banner"
        data-kind={banner?.kind ?? ''}
      >
        {banner ? (
          <button
            type="button"
            className="fsdb-page-banner-hit"
            title={writable ? '编辑背景' : '页面背景'}
            aria-label={writable ? '编辑背景' : '页面背景'}
            onClick={() => {
              if (writable) start(banner.kind)
            }}
          >
            <iframe
              title="页面背景"
              srcDoc={bannerSrcDoc(banner.html)}
              sandbox={banner.kind === 'htmlframe' ? 'allow-scripts' : ''}
              tabIndex={-1}
            />
          </button>
        ) : (
          <div className="fsdb-page-banner-add">
            <span>添加背景</span>
            <button type="button" onClick={() => start('html')}>
              静态 HTML
            </button>
            <button type="button" onClick={() => start('htmlframe')}>
              动态 HTML
            </button>
          </div>
        )}
        {banner && writable ? (
          <div className="fsdb-page-banner-tools">
            <button type="button" onClick={() => start(banner.kind)}>
              编辑
            </button>
            <button type="button" onClick={() => save(null)}>
              移除
            </button>
          </div>
        ) : null}
      </div>
      {open
        ? createPortal(
            <BannerEditor
              kind={draftKind}
              html={draftHtml}
              onKind={setDraftKind}
              onHtml={setDraftHtml}
              onCancel={() => setOpen(false)}
              onRemove={() => save(null)}
              onSave={() => save(parsePageBanner({ kind: draftKind, html: draftHtml }))}
            />,
            document.body,
          )
        : null}
    </>
  )
}

function BannerEditor({
  kind,
  html,
  onKind,
  onHtml,
  onCancel,
  onRemove,
  onSave,
}: {
  kind: PageBannerKind
  html: string
  onKind: (next: PageBannerKind) => void
  onHtml: (next: string) => void
  onCancel: () => void
  onRemove: () => void
  onSave: () => void
}) {
  const srcDoc = useMemo(() => bannerSrcDoc(html), [html])
  return (
    <div className="fsdb-page-banner-modal" role="dialog" aria-label="编辑页面背景" data-testid="fsdb-page-banner-editor">
      <button type="button" className="fsdb-page-banner-modal-scrim" aria-label="关闭" onClick={onCancel} />
      <div className="fsdb-page-banner-modal-card">
        <div className="fsdb-page-banner-modal-bar">
          <div className="fsdb-page-banner-modal-kinds">
            <button type="button" aria-pressed={kind === 'html'} onClick={() => onKind('html')}>
              静态 HTML
            </button>
            <button type="button" aria-pressed={kind === 'htmlframe'} onClick={() => onKind('htmlframe')}>
              动态 HTML
            </button>
          </div>
          <div className="fsdb-page-banner-modal-actions">
            <button type="button" onClick={onRemove}>
              移除
            </button>
            <button type="button" onClick={onCancel}>
              取消
            </button>
            <button type="button" className="is-primary" onClick={onSave}>
              完成
            </button>
          </div>
        </div>
        <div className="fsdb-page-banner-modal-preview">
          <iframe
            title="背景预览"
            srcDoc={srcDoc}
            sandbox={kind === 'htmlframe' ? 'allow-scripts' : ''}
          />
        </div>
        <textarea
          className="fsdb-page-banner-source"
          spellCheck={false}
          value={html}
          onChange={(event) => onHtml(event.target.value)}
          placeholder={'<div style="...">…</div>'}
        />
      </div>
    </div>
  )
}
