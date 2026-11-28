import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon, ChevronDownIcon } from '@heroicons/react/16/solid'
import { AiAvatar } from '@biu/biu-ui/ai-avatar'
import { useFloatingPosition } from '@biu/biu-ui/floating-position'
import { HeadlessDismiss } from '@biu/biu-ui/headless-dismiss'
import { OVERLAY_Z, overlayPortalRoot, overlayZ } from '@biu/biu-ui/overlay-portal'
import { emitFsdbChange } from '@biu/type-file-system'
import { roleActionLabel as roleLabel } from '../shared/authz-labels.ts'
import { VIEWS_COLLECTION_PATH } from './database-path.ts'

export type ShareRole = 'viewer' | 'commenter' | 'editor' | 'manager'

export type ShareSelectOption<T extends string = string> = {
  value: T
  label: string
  hint?: string
}

export const ROLE_OPTIONS: ReadonlyArray<ShareSelectOption<ShareRole>> = [
  { value: 'viewer', label: '可查看', hint: '仅查看内容' },
  { value: 'commenter', label: '可评论', hint: '查看与添加批注' },
  { value: 'editor', label: '可编辑', hint: '修改属性与正文' },
  { value: 'manager', label: '可管理', hint: '分享与权限管理' },
]

export const MEMBER_DEFAULT_ROLE_OPTIONS: ReadonlyArray<ShareSelectOption<'viewer' | 'editor'>> = [
  { value: 'viewer', label: '可查看', hint: '空间成员默认可查看' },
  { value: 'editor', label: '可编辑', hint: '空间成员默认可编辑' },
]

export function notifyViewShareChanged(collection: string, recordId: string) {
  if (collection !== VIEWS_COLLECTION_PATH) return
  const cut = recordId.indexOf('::')
  const targetPath = cut > 0 ? `/${recordId.slice(0, cut).replace(/^\/+/, '')}` : VIEWS_COLLECTION_PATH
  emitFsdbChange({ scope: 'views', path: targetPath })
}

export function isImageAvatar(value?: string) {
  return Boolean(value && /^(https?:\/\/|\/|data:image\/)/i.test(value.trim()))
}

export function renderShareAvatar(
  seed: string,
  avatar?: string,
  opts: { extraClass?: string; size?: number; mini?: boolean } = {},
) {
  const { extraClass = '', size = opts.mini ? 20 : 28, mini = false } = opts
  const trimmed = avatar?.trim() ?? ''
  return (
    <span
      className={`fsdb-share-avatar${extraClass ? ` ${extraClass}` : ''}`}
      aria-hidden
      style={mini ? { width: size, height: size, fontSize: 10 } : undefined}
    >
      {isImageAvatar(trimmed) ? <img src={trimmed} alt="" /> : trimmed || <AiAvatar seed={seed || 'biu-ai'} size={size} />}
    </span>
  )
}

export function ShareToggle({
  on,
  disabled,
  label,
  testId,
  onChange,
}: {
  on: boolean
  disabled?: boolean
  label: string
  testId: string
  onChange: (on: boolean) => void
}) {
  return (
    <button
      type="button"
      className={`fsdb-share-toggle${on ? ' is-on' : ''}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      data-testid={testId}
      onClick={() => onChange(!on)}
    >
      <span />
    </button>
  )
}

export function ShareSelect<T extends string = string>({
  value,
  options,
  ariaLabel,
  placement = 'bottom-end',
  minMenuWidth = 156,
  inline = false,
  className,
  onChange,
}: {
  value: T
  options: ReadonlyArray<ShareSelectOption<T>>
  ariaLabel: string
  placement?: 'bottom-start' | 'bottom-end'
  minMenuWidth?: number
  inline?: boolean
  className?: string
  onChange: (value: T) => void
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const current = options.find((opt) => opt.value === value)
  const pos = useFloatingPosition(open ? triggerRef.current : null, menuRef, {
    enabled: open,
    placement,
    offset: 4,
    fallbackWidth: minMenuWidth,
    fallbackHeight: options.length * 40 + 12,
  })

  const portalRoot = typeof document !== 'undefined' ? overlayPortalRoot() : null

  const content = (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`fsdb-share-select-trigger${inline ? ' is-inline' : ''}${open ? ' is-open' : ''}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{current?.label ?? roleLabel(value)}</span>
        <ChevronDownIcon aria-hidden className={`fsdb-share-select-chevron ${inline ? 'size-3' : 'size-3.5'}`} />
      </button>
      {open && portalRoot
        ? createPortal(
            <HeadlessDismiss onDismiss={() => setOpen(false)} insideRef={triggerRef}>
              <div
                ref={menuRef}
                className="fsdb-share-select-menu"
                role="listbox"
                aria-label={ariaLabel}
                style={{
                  position: 'fixed',
                  top: pos.top,
                  left: pos.left,
                  minWidth: Math.max(minMenuWidth, pos.anchorWidth),
                  maxHeight: pos.maxHeight,
                  zIndex: overlayZ(OVERLAY_Z.menu),
                }}
              >
                {options.map((opt) => {
                  const selected = opt.value === value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`fsdb-share-select-option${selected ? ' is-selected' : ''}`}
                      onClick={() => {
                        onChange(opt.value)
                        setOpen(false)
                      }}
                    >
                      <span className="fsdb-share-select-option-copy">
                        <strong>{opt.label}</strong>
                        {opt.hint ? <em>{opt.hint}</em> : null}
                      </span>
                      {selected ? <CheckIcon aria-hidden className="fsdb-share-select-check size-3.5" /> : null}
                    </button>
                  )
                })}
              </div>
            </HeadlessDismiss>,
            portalRoot,
          )
        : null}
    </>
  )

  return className ? <div className={className}>{content}</div> : content
}
