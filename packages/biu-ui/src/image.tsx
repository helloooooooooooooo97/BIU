/** ReUI 图库预览模式：缩略图 + Dialog 放大（reui.io file-upload gallery / dialog zoom）。 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ImgHTMLAttributes,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Button } from './button.tsx'
import { cn } from './cn.ts'
import { overlayPortalRoot, overlayZ } from './overlay-portal.ts'

type PreviewCtx = {
  items: string[]
  register: (src: string) => () => void
  open: (src: string) => void
}

const PreviewGroupContext = createContext<PreviewCtx | null>(null)

export function ImagePreviewGroup({ children }: { children?: ReactNode }) {
  const [items, setItems] = useState<string[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [zoomed, setZoomed] = useState(false)

  const ctx = useMemo<PreviewCtx>(
    () => ({
      items,
      register(src) {
        setItems((prev) => (prev.includes(src) ? prev : [...prev, src]))
        return () => setItems((prev) => prev.filter((item) => item !== src))
      },
      open(src) {
        setZoomed(false)
        setActive(src)
      },
    }),
    [items],
  )

  return (
    <PreviewGroupContext.Provider value={ctx}>
      {children}
      {active ? (
        <ImageLightbox
          src={active}
          items={items}
          zoomed={zoomed}
          onZoom={() => setZoomed((on) => !on)}
          onClose={() => {
            setActive(null)
            setZoomed(false)
          }}
          onActive={setActive}
        />
      ) : null}
    </PreviewGroupContext.Provider>
  )
}

function ImageLightbox({
  src,
  items,
  zoomed,
  onZoom,
  onClose,
  onActive,
}: {
  src: string
  items: string[]
  zoomed: boolean
  onZoom: () => void
  onClose: () => void
  onActive: (src: string) => void
}) {
  const index = Math.max(0, items.indexOf(src))
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
      if (event.key === 'ArrowLeft' && items.length) onActive(items[(index - 1 + items.length) % items.length]!)
      if (event.key === 'ArrowRight' && items.length) onActive(items[(index + 1) % items.length]!)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, items, onActive, onClose])

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      className="biu-image-preview fixed inset-0 flex items-center justify-center bg-biu-overlay"
      style={{ zIndex: overlayZ(280) }}
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {items.length > 1 ? (
        <Button
          variant="secondary"
          className="absolute left-3 top-1/2 -translate-y-1/2"
          aria-label="上一张"
          onClick={() => onActive(items[(index - 1 + items.length) % items.length]!)}
        >
          ‹
        </Button>
      ) : null}
      <img
        src={src}
        alt=""
        className={cn(
          'biu-image-preview-shot max-h-[86vh] max-w-[86vw] rounded-[var(--biu-radius-md)] border border-biu-border object-contain transition-transform',
          zoomed ? 'scale-150 cursor-zoom-out' : 'cursor-zoom-in',
        )}
        onClick={onZoom}
      />
      {items.length > 1 ? (
        <Button
          variant="secondary"
          className="absolute right-3 top-1/2 -translate-y-1/2"
          aria-label="下一张"
          onClick={() => onActive(items[(index + 1) % items.length]!)}
        >
          ›
        </Button>
      ) : null}
    </div>,
    overlayPortalRoot() ?? document.body,
  )
}

function ImageRoot({
  src,
  alt = '',
  className,
  width,
  height,
  preview = true,
  fallback,
  onClick,
  ...rest
}: ImgHTMLAttributes<HTMLImageElement> & {
  preview?: boolean | { mask?: boolean }
  fallback?: ReactNode
}) {
  const group = useContext(PreviewGroupContext)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(src ? 'loading' : 'error')
  const [soloOpen, setSoloOpen] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const canPreview = preview !== false

  useEffect(() => {
    setStatus(src ? 'loading' : 'error')
  }, [src])

  useEffect(() => {
    if (!src || !group) return
    return group.register(src)
  }, [group, src])

  function openPreview() {
    if (!src || !canPreview) return
    if (group) group.open(src)
    else {
      setZoomed(false)
      setSoloOpen(true)
    }
  }

  return (
    <span
      className={cn('biu-image relative inline-flex overflow-hidden rounded-[var(--biu-radius-md)] border border-biu-border bg-biu-muted-fill', className)}
      style={{ width, height }}
    >
      {status === 'loading' ? (
        <span className="biu-image-skeleton absolute inset-0 animate-pulse bg-biu-hover" aria-hidden />
      ) : null}
      {status === 'error' ? (
        <span className="biu-image-fallback flex h-full w-full items-center justify-center text-[length:var(--biu-font-size-1)] text-biu-text-subtle">
          {fallback ?? '无法加载'}
        </span>
      ) : null}
      {src ? (
        <img
          {...rest}
          src={src}
          alt={alt}
          width={width}
          height={height}
          className={cn('relative h-full w-full object-cover', status === 'ready' ? 'opacity-100' : 'opacity-0')}
          onLoad={() => setStatus('ready')}
          onError={() => setStatus('error')}
          onClick={(event) => {
            onClick?.(event)
            if (!event.defaultPrevented) openPreview()
          }}
        />
      ) : null}
      {soloOpen && src ? (
        <ImageLightbox
          src={src}
          items={[src]}
          zoomed={zoomed}
          onZoom={() => setZoomed((on) => !on)}
          onClose={() => setSoloOpen(false)}
          onActive={() => undefined}
        />
      ) : null}
    </span>
  )
}

export const Image = Object.assign(ImageRoot, { PreviewGroup: ImagePreviewGroup })
