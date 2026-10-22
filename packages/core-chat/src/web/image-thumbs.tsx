import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export type ChatImage = {
  name: string
  mime: string
  url: string
}

export function ImageLightbox({
  images,
  index,
  onClose,
  onIndex,
}: {
  images: Array<{ url: string; name: string }>
  index: number
  onClose: () => void
  onIndex: (index: number) => void
}) {
  const image = images[index]
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (!images.length) return
      if (event.key === 'ArrowLeft') onIndex((index - 1 + images.length) % images.length)
      if (event.key === 'ArrowRight') onIndex((index + 1) % images.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [images.length, index, onClose, onIndex])
  if (typeof document === 'undefined' || !image) return null
  return createPortal(
    <div
      className="biu-float-overlay chat-image-preview"
      role="dialog"
      aria-modal="true"
      aria-label={image.name}
      data-testid="chat-image-preview"
      onClick={onClose}
    >
      <img src={image.url} alt={image.name} onClick={(event) => event.stopPropagation()} />
    </div>,
    document.body,
  )
}

export function ImageThumbs({
  images,
  onRemove,
}: {
  images: ChatImage[]
  onRemove?: (index: number) => void
}) {
  const [preview, setPreview] = useState<number | null>(null)
  if (!images.length) return null
  return (
    <>
      <div className="composer-image-row" data-testid="composer-image-thumbs">
        {images.map((image, index) => (
          <div key={`${image.name}-${index}`} className="composer-image-thumb-wrap">
            <button
              type="button"
              className="composer-image-thumb"
              aria-label={image.name}
              onClick={() => setPreview(index)}
            >
              <img src={image.url} alt="" />
            </button>
            {onRemove ? (
              <button
                type="button"
                className="composer-image-remove"
                title="移除图片"
                aria-label={`移除 ${image.name}`}
                onClick={() => onRemove(index)}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {preview != null ? (
        <ImageLightbox images={images} index={preview} onClose={() => setPreview(null)} onIndex={setPreview} />
      ) : null}
    </>
  )
}
