import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { useFloatingPosition } from './floating-position.ts'
import { HeadlessDismiss } from './headless-dismiss.tsx'
import { OVERLAY_Z, overlayPortalRoot, overlayZ } from './overlay-portal.ts'

const RECORD_EMOJI_PRESETS = [
  '📄', '📝', '📚', '🗂️', '📁', '📦', '🔖', '🧩',
  '⭐', '🔥', '✅', '📌', '💡', '🎯', '⚡', '🚀',
  '💻', '🛠️', '🧪', '📊', '📈', '🧠', '🔍', '💬',
  '🏠', '🌍', '🎨', '🎵', '🎬', '📷', '🎮', '🧱',
  '❤️', '😊', '🎉', '🌈', '☕', '🌙', '☀️', '🍀',
  '🐛', '🔒', '⚠️', '✨', '🏆', '🧬', '🪄', '🌱',
]

const PICKER_WIDTH = 272

function RestoreIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden fill="currentColor">
      <path d="M8 1.5a6.5 6.5 0 1 0 6.32 8.12.75.75 0 0 0-1.46-.32A5 5 0 1 1 8 3a4.9 4.9 0 0 1 3.45 1.4H9.75a.75.75 0 0 0 0 1.5h3.5A.75.75 0 0 0 14 5.15V1.75a.75.75 0 0 0-1.5 0v1.36A6.47 6.47 0 0 0 8 1.5Z" />
    </svg>
  )
}

export function RecordEmojiBoard({
  anchor,
  onPick,
  onClear,
  onClose,
}: {
  anchor: HTMLElement
  onPick: (emoji: string) => void
  onClear: () => void
  onClose: () => void
}) {
  const boardRef = useRef<HTMLDivElement>(null)
  const pos = useFloatingPosition(anchor, boardRef, {
    placement: 'bottom-start',
    offset: 6,
    padding: 8,
    fallbackWidth: PICKER_WIDTH,
    fallbackHeight: 268,
  })
  if (typeof document === 'undefined') return null
  return createPortal(
    <HeadlessDismiss onDismiss={onClose} inside={(node) => anchor.contains(node)}>
      <div
        ref={boardRef}
        className="fsdb-emoji-picker is-fixed"
        data-biu-ignore
        role="dialog"
        aria-label="选择图标"
        style={{
          left: pos.left,
          top: pos.top,
          maxHeight: pos.maxHeight,
          zIndex: overlayZ(OVERLAY_Z.menu, anchor),
        }}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="fsdb-emoji-picker-presets">
          {RECORD_EMOJI_PRESETS.map((item) => (
            <button key={item} type="button" className="fsdb-emoji-picker-item" onClick={() => onPick(item)}>
              {item}
            </button>
          ))}
        </div>
        <div className="fsdb-emoji-picker-foot">
          <button type="button" className="fsdb-emoji-picker-clear" title="恢复默认" aria-label="恢复默认" onClick={onClear}>
            <RestoreIcon />
          </button>
        </div>
      </div>
    </HeadlessDismiss>,
    overlayPortalRoot(anchor) ?? document.body,
  )
}
